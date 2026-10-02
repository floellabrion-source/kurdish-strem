import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    ZoomIn, ZoomOut, Maximize2, Play, Pause, Volume2, Sparkles,
    Mic, Eye, MoveHorizontal, RefreshCw, Lock, Unlock, AlertCircle
} from 'lucide-react';
import './SubtitleAudioWaveform.css';

export interface SubtitleLine {
    id: number;
    startTime: string;
    endTime: string;
    startSec: number;
    endSec: number;
    english: string;
    kurdish: string;
}

export interface SpeechSegment {
    startSec: number;
    endSec: number;
    peakAmp: number;
}

// Function to extract speech segments from 50Hz audio peaks buffer (VAD Engine)
export const extractVoiceSegments = (
    peaks: Float32Array | null,
    speechThreshold = 0.07,
    silenceThreshold = 0.035,
    minDurationSec = 0.12,
    hangoverSec = 0.28
): SpeechSegment[] => {
    if (!peaks || peaks.length === 0) return [];

    const peaksPerSec = 50;
    const hangoverSamples = Math.floor(hangoverSec * peaksPerSec);
    const minSamples = Math.floor(minDurationSec * peaksPerSec);
    const segments: SpeechSegment[] = [];

    let inSpeech = false;
    let segStartIdx = 0;
    let silenceCount = 0;
    let maxAmp = 0;

    for (let i = 0; i < peaks.length; i++) {
        const amp = peaks[i] || 0;

        if (!inSpeech) {
            if (amp >= speechThreshold) {
                inSpeech = true;
                segStartIdx = i;
                silenceCount = 0;
                maxAmp = amp;
            }
        } else {
            if (amp > maxAmp) maxAmp = amp;

            if (amp < silenceThreshold) {
                silenceCount++;
                if (silenceCount >= hangoverSamples || i === peaks.length - 1) {
                    const segEndIdx = Math.max(segStartIdx, i - silenceCount);
                    if (segEndIdx - segStartIdx >= minSamples) {
                        segments.push({
                            startSec: segStartIdx / peaksPerSec,
                            endSec: segEndIdx / peaksPerSec,
                            peakAmp: maxAmp
                        });
                    }
                    inSpeech = false;
                    silenceCount = 0;
                    maxAmp = 0;
                }
            } else {
                silenceCount = 0;
            }
        }
    }

    if (inSpeech && (peaks.length - 1 - segStartIdx) >= minSamples) {
        segments.push({
            startSec: segStartIdx / peaksPerSec,
            endSec: (peaks.length - 1) / peaksPerSec,
            peakAmp: maxAmp
        });
    }

    return segments;
};

interface SubtitleAudioWaveformProps {
    videoRef: React.RefObject<HTMLVideoElement>;
    videoUrl?: string;
    currentTime: number;
    duration?: number;
    lines: SubtitleLine[];
    selectedLineId: number;
    onSelectLine?: (id: number) => void;
    onSeek: (sec: number) => void;
    onLineTimeChange: (id: number, startSec: number, endSec: number) => void;
    onDragComplete?: () => void;
    onShowToast?: (msg: string, type?: 'success' | 'error') => void;
}

// Format seconds into MM:SS.mmm for waveform ticks
const formatWaveTime = (sec: number): string => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0').slice(0, 2)}`;
};

export default function SubtitleAudioWaveform({
    videoRef,
    videoUrl,
    currentTime,
    duration = 0,
    lines,
    selectedLineId,
    onSelectLine,
    onSeek,
    onLineTimeChange,
    onDragComplete,
    onShowToast
}: SubtitleAudioWaveformProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Zoom and Navigation State
    const [zoomLevel, setZoomLevel] = useState<number>(1); // 1x = 20s, 2x = 10s, 4x = 5s, 8x = 2.5s
    const [followPlayhead, setFollowPlayhead] = useState<boolean>(true);
    const [viewOffsetSec, setViewOffsetSec] = useState<number>(0); // Left edge of the viewport in seconds
    const [isPlayingSnippet, setIsPlayingSnippet] = useState<boolean>(false);
    const [audioLoaded, setAudioLoaded] = useState<boolean>(false);
    const [isExtractingAudio, setIsExtractingAudio] = useState<boolean>(false);
    const [showVad, setShowVad] = useState<boolean>(true);
    const [vadThreshold, setVadThreshold] = useState<number>(0.07);
    const [magneticSnap, setMagneticSnap] = useState<boolean>(true);
    const activeSnapSecRef = useRef<number | null>(null);

    // Audio peaks buffer (50 samples per second)
    const audioPeaksRef = useRef<Float32Array | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const initialLinesRef = useRef<SubtitleLine[]>([]);
    const lastLinesLengthRef = useRef<number>(0);
    const snippetTimerRef = useRef<any>(null);

    interface DragState {
        isDragging: boolean;
        type: 'start' | 'end' | 'move';
        lineId: number;
        initialX: number;
        initialStartSec: number;
        initialEndSec: number;
    }
    const dragRef = useRef<DragState | null>(null);

    const windowDuration = useMemo(() => 20 / zoomLevel, [zoomLevel]);
    const selectedLine = useMemo(() => lines.find(l => l.id === selectedLineId), [lines, selectedLineId]);

    const handleCenterOnSelectedLine = useCallback(() => {
        if (!selectedLine) return;
        const center = (selectedLine.startSec + selectedLine.endSec) / 2;
        setViewOffsetSec(Math.max(0, center - windowDuration / 2));
    }, [selectedLine, windowDuration]);

    // Track playhead when followPlayhead is enabled
    useEffect(() => {
        if (!followPlayhead) return;
        if (currentTime < viewOffsetSec || currentTime > viewOffsetSec + windowDuration) {
            setViewOffsetSec(Math.max(0, currentTime - windowDuration * 0.3));
        }
    }, [currentTime, followPlayhead, windowDuration, viewOffsetSec]);

    // Cache initial subtitle lines as dialogue anchor reference
    useEffect(() => {
        if (lines.length > 0 && initialLinesRef.current.length === 0) {
            initialLinesRef.current = lines.map(l => ({ ...l }));
        }
    }, [lines]);

    // Initialize audio peaks array for full duration (50 samples/sec)
    useEffect(() => {
        const maxSec = Math.max(duration || 3600, (lines[lines.length - 1]?.endSec || 0) + 120);
        const totalPeaks = Math.floor(maxSec * 50);
        if (!audioPeaksRef.current || audioPeaksRef.current.length < totalPeaks) {
            const peaks = new Float32Array(totalPeaks);
            // Ambient real baseline (clean flat baseline: 0.015)
            for (let i = 0; i < totalPeaks; i++) {
                peaks[i] = 0.015 + (Math.sin(i * 0.05) * 0.005);
            }
            audioPeaksRef.current = peaks;
            setAudioLoaded(true);
        }
    }, [duration, lines]);

    // ─── REAL-TIME WEBAUDIO ANALYSER HOOK (CAPTURES TRUE AUDIO LIVE FROM VIDEO) ───
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let isCleanedUp = false;

        const setupWebAudio = () => {
            try {
                if (!audioContextRef.current) {
                    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                    audioContextRef.current = new AudioCtx();
                }

                const ctx = audioContextRef.current;
                if (!ctx) return;

                if (ctx.state === 'suspended') {
                    const resumeCtx = () => {
                        ctx.resume().catch(() => {});
                        window.removeEventListener('click', resumeCtx);
                        window.removeEventListener('keydown', resumeCtx);
                    };
                    window.addEventListener('click', resumeCtx);
                    window.addEventListener('keydown', resumeCtx);
                }

                if (!analyserRef.current) {
                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 512;
                    analyser.smoothingTimeConstant = 0.3;
                    analyserRef.current = analyser;

                    // Note: createMediaElementSource can only be called once per video element
                    if (!sourceNodeRef.current && video) {
                        try {
                            const source = ctx.createMediaElementSource(video);
                            source.connect(analyser);
                            analyser.connect(ctx.destination);
                            sourceNodeRef.current = source;
                        } catch (e) {
                            // Already connected or cross-origin restricted
                        }
                    }
                }
            } catch (err) {
                // Ignore WebAudio initialization issues on restricted browsers
            }
        };

        setupWebAudio();

        // Real-time animation loop to capture audio energy directly from live playback
        const dataArray = new Uint8Array(256);
        const captureAudioEnergy = () => {
            if (isCleanedUp) return;

            const analyser = analyserRef.current;
            const currentV = videoRef.current;

            if (analyser && currentV && !currentV.paused && !currentV.ended) {
                analyser.getByteTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sum += normalized * normalized;
                }
                const rms = Math.sqrt(sum / dataArray.length);
                const truePeak = Math.min(0.98, Math.max(0.02, rms * 3.2));

                const curT = currentV.currentTime;
                const peakIdx = Math.floor(curT * 50);
                if (audioPeaksRef.current && peakIdx >= 0 && peakIdx < audioPeaksRef.current.length) {
                    // Smoothly blend real audio peak into the timeline buffer
                    const existing = audioPeaksRef.current[peakIdx] || 0.015;
                    audioPeaksRef.current[peakIdx] = Math.max(existing, truePeak);
                    // Also spread slightly to neighbors for smooth waveform rendering
                    if (peakIdx > 0) audioPeaksRef.current[peakIdx - 1] = Math.max(audioPeaksRef.current[peakIdx - 1], truePeak * 0.75);
                    if (peakIdx < audioPeaksRef.current.length - 1) audioPeaksRef.current[peakIdx + 1] = Math.max(audioPeaksRef.current[peakIdx + 1], truePeak * 0.75);
                }
            }

            animFrameRef.current = requestAnimationFrame(captureAudioEnergy);
        };

        animFrameRef.current = requestAnimationFrame(captureAudioEnergy);

        return () => {
            isCleanedUp = true;
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [videoRef]);

    // ─── CHUNK BUFFER DECODER FOR DIRECT URLS / BLOBS ───
    useEffect(() => {
        let isCancelled = false;

        const extractDirectAudioBuffer = async () => {
            const targetUrl = videoUrl || videoRef.current?.src;
            if (!targetUrl || targetUrl.includes('.m3u8')) return; // HLS uses live analyser

            setIsExtractingAudio(true);
            try {
                const response = await fetch(targetUrl, {
                    headers: { Range: 'bytes=0-12000000' }
                });
                if (!response.ok && response.status !== 206) {
                    throw new Error('Partial range not supported');
                }
                const arrayBuffer = await response.arrayBuffer();
                if (isCancelled) return;

                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                const audioCtx = new AudioCtx();
                const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                if (isCancelled) {
                    audioCtx.close();
                    return;
                }

                // Sample down to 50 peaks per second
                const sampleRate = decodedBuffer.sampleRate;
                const channelData = decodedBuffer.getChannelData(0);
                const totalSec = decodedBuffer.duration;
                const peaksPerSec = 50;
                const totalPeaks = Math.floor(totalSec * peaksPerSec);
                const step = Math.floor(sampleRate / peaksPerSec);

                if (audioPeaksRef.current) {
                    for (let i = 0; i < totalPeaks && i < audioPeaksRef.current.length; i++) {
                        const startIdx = i * step;
                        let maxVal = 0;
                        for (let j = 0; j < step && (startIdx + j) < channelData.length; j += 4) {
                            const val = Math.abs(channelData[startIdx + j]);
                            if (val > maxVal) maxVal = val;
                        }
                        if (maxVal > 0.02) {
                            audioPeaksRef.current[i] = Math.min(0.98, maxVal * 1.6);
                        }
                    }
                }
                setAudioLoaded(true);
                setIsExtractingAudio(false);
                audioCtx.close();
            } catch (err) {
                if (!isCancelled) {
                    setIsExtractingAudio(false);
                }
            }
        };

        extractDirectAudioBuffer();

        return () => {
            isCancelled = true;
        };
    }, [videoUrl, videoRef]);

    // ─── HIGH-DPI CANVAS RENDERING LOOP ───
    const renderWaveform = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const viewStart = viewOffsetSec;
        const viewEnd = viewOffsetSec + windowDuration;
        const secToX = (sec: number) => ((sec - viewStart) / windowDuration) * width;
        const xToSec = (x: number) => viewStart + (x / width) * windowDuration;

        // 1. Background Grid & Time Ruler Ticks
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Grid lines (every 1 second or 0.5s when zoomed in)
        const tickInterval = zoomLevel >= 4 ? 0.5 : zoomLevel >= 2 ? 1.0 : 2.0;
        const firstTick = Math.floor(viewStart / tickInterval) * tickInterval;

        ctx.lineWidth = 1;
        for (let t = firstTick; t <= viewEnd; t += tickInterval) {
            const x = secToX(t);
            if (x < 0 || x > width) continue;

            const isMajor = Math.round(t) === t && Math.round(t) % (tickInterval * 2) === 0;
            ctx.strokeStyle = isMajor ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.1)';
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Time text labels
            if (isMajor || zoomLevel >= 4) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '10px monospace';
                ctx.fillText(formatWaveTime(t), x + 4, 13);
            }
        }

        // Center line
        const centerY = height / 2;
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.7)';
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        // 2. Render Audio Waveform Bars with Voice Activity Highlighting
        const peaks = audioPeaksRef.current;
        const peaksPerSec = 50;
        if (peaks) {
            const barWidth = Math.max(1.5, (width / (windowDuration * peaksPerSec)) * 0.85);
            const startPeakIdx = Math.max(0, Math.floor(viewStart * peaksPerSec));
            const endPeakIdx = Math.min(peaks.length, Math.ceil(viewEnd * peaksPerSec));

            for (let i = startPeakIdx; i < endPeakIdx; i++) {
                const sec = i / peaksPerSec;
                const x = secToX(sec);
                const amp = peaks[i] || 0.015;
                const barHeight = Math.max(2.5, amp * (height * 0.42));

                // Check if this peak falls inside selected subtitle line
                const isInsideSelected = selectedLine && sec >= selectedLine.startSec && sec <= selectedLine.endSec;
                const isVoiceActive = amp >= vadThreshold;

                if (isInsideSelected) {
                    ctx.fillStyle = 'rgba(34, 211, 238, 0.95)'; // Neon Cyan for active selected subtitle
                } else if (showVad && isVoiceActive) {
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.85)'; // Emerald Green for detected human voice
                } else {
                    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)'; // Soft Slate for background silence/noise
                }

                ctx.fillRect(x - barWidth / 2, centerY - barHeight, barWidth, barHeight * 2);
            }

            // Render VAD Speech Region Ribbons & Boundary Markers at the bottom
            if (showVad) {
                const visibleSpeech = extractVoiceSegments(peaks, vadThreshold, 0.035, 0.12, 0.28)
                    .filter(s => s.endSec >= viewStart && s.startSec <= viewEnd);

                visibleSpeech.forEach(seg => {
                    const startX = Math.max(0, secToX(seg.startSec));
                    const endX = Math.min(width, secToX(seg.endSec));
                    const segW = Math.max(2, endX - startX);

                    // Glowing bottom speech ribbon
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.45)';
                    ctx.fillRect(startX, height - 4, segW, 4);

                    // Boundary onset and offset ticks
                    ctx.fillStyle = '#10b981';
                    ctx.fillRect(startX, height - 8, 2, 8);
                    ctx.fillRect(endX - 2, height - 8, 2, 8);
                });
            }
        }

        // 3. Render Subtitle Blocks Overlay
        lines.forEach(line => {
            if (line.endSec < viewStart || line.startSec > viewEnd) return;

            const startX = secToX(line.startSec);
            const endX = secToX(line.endSec);
            const blockWidth = Math.max(4, endX - startX);
            const isSelected = line.id === selectedLineId;

            if (isSelected) {
                // Highlighted Selected Subtitle Box
                ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
                ctx.fillRect(startX, 18, blockWidth, height - 24);

                ctx.strokeStyle = '#06b6d4';
                ctx.lineWidth = 2;
                ctx.strokeRect(startX, 18, blockWidth, height - 24);

                // Left & Right Drag Handles
                ctx.fillStyle = '#22d3ee';
                // Left handle [◄]
                ctx.fillRect(startX, 18, 7, height - 24);
                // Right handle [►]
                ctx.fillRect(endX - 7, 18, 7, height - 24);

                // Subtitle ID & Kurdish preview badge
                ctx.fillStyle = '#06b6d4';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(`[ #${line.id} ] ${line.kurdish ? line.kurdish.slice(0, 30) : (line.english ? line.english.slice(0, 30) : '')}`, startX + 10, 32);
            } else {
                // Inactive Subtitle Box
                ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
                ctx.fillRect(startX, 24, blockWidth, height - 32);

                ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
                ctx.lineWidth = 1;
                ctx.strokeRect(startX, 24, blockWidth, height - 32);

                // ID label
                ctx.fillStyle = 'rgba(203, 213, 225, 0.7)';
                ctx.font = '10px sans-serif';
                ctx.fillText(`#${line.id}`, startX + 4, 37);
            }
        });

        // 4. Live Playhead (Red / White vertical cursor)
        if (currentTime >= viewStart && currentTime <= viewEnd) {
            const playheadX = secToX(currentTime);

            // Glow line
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, height);
            ctx.stroke();

            // Playhead pointer head
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.moveTo(playheadX - 6, 0);
            ctx.lineTo(playheadX + 6, 0);
            ctx.lineTo(playheadX, 10);
            ctx.closePath();
            ctx.fill();
        }

        // 5. Magnetic Snap Indicator Line
        if (activeSnapSecRef.current !== null && activeSnapSecRef.current >= viewStart && activeSnapSecRef.current <= viewEnd) {
            const snapX = secToX(activeSnapSecRef.current);
            ctx.save();
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(snapX, 0);
            ctx.lineTo(snapX, height);
            ctx.stroke();

            // Snap badge
            ctx.setLineDash([]);
            ctx.fillStyle = '#06b6d4';
            ctx.fillRect(snapX - 22, 2, 44, 15);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText('🧲 SNAP', snapX - 18, 13);
            ctx.restore();
        }
    }, [viewOffsetSec, windowDuration, zoomLevel, currentTime, lines, selectedLineId, selectedLine, showVad, vadThreshold, magneticSnap]);

    // Redraw whenever state or dimensions change
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const updateCanvasSize = () => {
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = rect.height * (window.devicePixelRatio || 1);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
            }
            renderWaveform();
        };

        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
        return () => window.removeEventListener('resize', updateCanvasSize);
    }, [renderWaveform]);

    // ─── MOUSE & DRAG EVENT HANDLERS ───
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clickSec = viewOffsetSec + (clientX / rect.width) * windowDuration;

        // Check if clicked near selectedLine drag handles or block
        if (selectedLine) {
            const secToX = (sec: number) => ((sec - viewOffsetSec) / windowDuration) * rect.width;
            const startX = secToX(selectedLine.startSec);
            const endX = secToX(selectedLine.endSec);

            // Left handle click (within 10px)
            if (Math.abs(clientX - startX) <= 10) {
                dragRef.current = {
                    isDragging: true,
                    type: 'start',
                    lineId: selectedLine.id,
                    initialX: clientX,
                    initialStartSec: selectedLine.startSec,
                    initialEndSec: selectedLine.endSec
                };
                return;
            }

            // Right handle click (within 10px)
            if (Math.abs(clientX - endX) <= 10) {
                dragRef.current = {
                    isDragging: true,
                    type: 'end',
                    lineId: selectedLine.id,
                    initialX: clientX,
                    initialStartSec: selectedLine.startSec,
                    initialEndSec: selectedLine.endSec
                };
                return;
            }

            // Middle block click to move entire subtitle
            if (clientX > startX && clientX < endX) {
                dragRef.current = {
                    isDragging: true,
                    type: 'move',
                    lineId: selectedLine.id,
                    initialX: clientX,
                    initialStartSec: selectedLine.startSec,
                    initialEndSec: selectedLine.endSec
                };
                return;
            }
        }

        // Check if user clicked another subtitle block on timeline
        const clickedLine = lines.find(l => clickSec >= l.startSec && clickSec <= l.endSec);
        if (clickedLine) {
            if (onSelectLine) onSelectLine(clickedLine.id);
            onSeek(clickedLine.startSec);
            return;
        }

        // Otherwise, seek playhead to clicked position
        onSeek(Math.max(0, clickSec));
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;

        // If not dragging, update cursor style based on hover position
        if (!dragRef.current?.isDragging) {
            if (selectedLine) {
                const secToX = (sec: number) => ((sec - viewOffsetSec) / windowDuration) * rect.width;
                const startX = secToX(selectedLine.startSec);
                const endX = secToX(selectedLine.endSec);

                if (Math.abs(clientX - startX) <= 10 || Math.abs(clientX - endX) <= 10) {
                    canvas.style.cursor = 'ew-resize';
                } else if (clientX > startX && clientX < endX) {
                    canvas.style.cursor = 'grab';
                } else {
                    canvas.style.cursor = 'crosshair';
                }
            } else {
                canvas.style.cursor = 'crosshair';
            }
            return;
        }

        // Handle Active Dragging with Magnetic Snapping
        const drag = dragRef.current;
        const deltaX = clientX - drag.initialX;
        const deltaSec = (deltaX / rect.width) * windowDuration;

        const snapThresholdSec = 0.22;
        let snapLineSec: number | null = null;

        // Collect snap targets: VAD speech onsets/offsets & adjacent subtitle boundaries
        const snapTargets: number[] = [];
        if (magneticSnap && !e.altKey) {
            // 1. Voice activity boundaries
            const speechSegs = extractVoiceSegments(audioPeaksRef.current, vadThreshold, 0.035, 0.12, 0.28);
            speechSegs.forEach(seg => {
                snapTargets.push(seg.startSec);
                snapTargets.push(seg.endSec);
            });

            // 2. Neighboring subtitle boundaries
            lines.forEach(l => {
                if (l.id !== drag.lineId) {
                    snapTargets.push(l.startSec);
                    snapTargets.push(l.endSec);
                }
            });
        }

        const findNearestSnap = (val: number): number => {
            if (snapTargets.length === 0) return val;
            let closest = val;
            let minDiff = snapThresholdSec;
            for (let i = 0; i < snapTargets.length; i++) {
                const diff = Math.abs(val - snapTargets[i]);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = snapTargets[i];
                }
            }
            if (minDiff < snapThresholdSec) {
                snapLineSec = closest;
                return closest;
            }
            return val;
        };

        if (drag.type === 'start') {
            let rawStart = drag.initialStartSec + deltaSec;
            let newStart = findNearestSnap(rawStart);
            newStart = Math.max(0, Math.min(drag.initialEndSec - 0.2, newStart));
            onLineTimeChange(drag.lineId, Math.round(newStart * 100) / 100, drag.initialEndSec);
        } else if (drag.type === 'end') {
            let rawEnd = drag.initialEndSec + deltaSec;
            let newEnd = findNearestSnap(rawEnd);
            newEnd = Math.max(drag.initialStartSec + 0.2, newEnd);
            onLineTimeChange(drag.lineId, drag.initialStartSec, Math.round(newEnd * 100) / 100);
        } else if (drag.type === 'move') {
            const dur = drag.initialEndSec - drag.initialStartSec;
            let rawStart = drag.initialStartSec + deltaSec;
            let newStart = findNearestSnap(rawStart);
            newStart = Math.max(0, newStart);
            const newEnd = newStart + dur;
            onLineTimeChange(drag.lineId, Math.round(newStart * 100) / 100, Math.round(newEnd * 100) / 100);
        }

        activeSnapSecRef.current = snapLineSec;
        renderWaveform();
    };

    const handleMouseUp = () => {
        if (dragRef.current?.isDragging) {
            dragRef.current = null;
            activeSnapSecRef.current = null;
            renderWaveform();
            if (onDragComplete) {
                onDragComplete();
            }
        }
    };

    // ─── AI VOICE SNAPPING ALGORITHM ───
    const handleSnapToVoice = useCallback(() => {
        if (!selectedLine) return;
        const peaks = audioPeaksRef.current;
        const peaksPerSec = 50;

        // Find adjacent subtitle boundaries to prevent collisions / overlaps
        const sortedLines = [...lines].sort((a, b) => a.startSec - b.startSec);
        const currentIndex = sortedLines.findIndex(l => l.id === selectedLine.id);
        const prevLine = currentIndex > 0 ? sortedLines[currentIndex - 1] : null;
        const nextLine = currentIndex >= 0 && currentIndex < sortedLines.length - 1 ? sortedLines[currentIndex + 1] : null;

        const minBoundSec = prevLine ? Math.max(0, prevLine.endSec + 0.04) : 0;
        const maxBoundSec = nextLine ? Math.max(minBoundSec + 0.3, nextLine.startSec - 0.04) : (peaks ? peaks.length / peaksPerSec : 999999);

        // 1. Try matching with detected VAD speech segments first
        const speechSegments = extractVoiceSegments(peaks, vadThreshold, 0.035, 0.12, 0.28);
        const overlappingSegs = speechSegments.filter(s =>
            (s.startSec >= selectedLine.startSec - 0.5 && s.startSec <= selectedLine.endSec + 0.5) ||
            (s.endSec >= selectedLine.startSec - 0.5 && s.endSec <= selectedLine.endSec + 0.5) ||
            (s.startSec <= selectedLine.startSec && s.endSec >= selectedLine.endSec)
        );

        let newStartSec = selectedLine.startSec;
        let newEndSec = selectedLine.endSec;

        if (overlappingSegs.length > 0) {
            // Direct VAD Speech Match
            const firstSeg = overlappingSegs[0];
            const lastSeg = overlappingSegs[overlappingSegs.length - 1];
            newStartSec = Math.max(minBoundSec, firstSeg.startSec - 0.04);
            newEndSec = Math.min(maxBoundSec, lastSeg.endSec + 0.05);
        } else {
            // Check if we have an original baseline master timing for this line
            const origLine = initialLinesRef.current.find(l => l.id === selectedLine.id);

            if (origLine && origLine.endSec > origLine.startSec) {
                // Snap back to original dialogue timing envelope
                newStartSec = Math.max(minBoundSec, origLine.startSec);
                newEndSec = Math.min(maxBoundSec, origLine.endSec);

                if (peaks && peaks.length > 0) {
                    const speechThreshold = 0.10;
                    const startIdx = Math.max(0, Math.floor(newStartSec * peaksPerSec));
                    const endIdx = Math.min(peaks.length - 1, Math.floor(newEndSec * peaksPerSec));

                    let fineStartIdx = startIdx;
                    for (let i = Math.max(0, startIdx - 20); i <= Math.min(peaks.length - 1, startIdx + 20); i++) {
                        if ((peaks[i] || 0) >= speechThreshold) {
                            fineStartIdx = i;
                            break;
                        }
                    }

                    let fineEndIdx = endIdx;
                    for (let i = Math.min(peaks.length - 1, endIdx + 20); i >= Math.max(0, endIdx - 20); i--) {
                        if ((peaks[i] || 0) >= speechThreshold) {
                            fineEndIdx = i;
                            break;
                        }
                    }

                    if (fineEndIdx > fineStartIdx) {
                        newStartSec = Math.max(minBoundSec, (fineStartIdx / peaksPerSec) - 0.04);
                        newEndSec = Math.min(maxBoundSec, (fineEndIdx / peaksPerSec) + 0.05);
                    }
                }
            } else if (peaks && peaks.length > 0) {
                // Scan audio waveform around center
                const silenceThreshold = 0.06;
                const activeThreshold = 0.12;
                const bridgeSilenceSamples = 14;

                const minBoundIdx = Math.max(0, Math.floor(minBoundSec * peaksPerSec));
                const maxBoundIdx = Math.min(peaks.length - 1, Math.floor(maxBoundSec * peaksPerSec));

                const centerSec = (selectedLine.startSec + selectedLine.endSec) / 2;
                let centerIdx = Math.max(minBoundIdx, Math.min(maxBoundIdx, Math.floor(centerSec * peaksPerSec)));

                let bestPeakIdx = centerIdx;
                let maxPeakAmp = peaks[centerIdx] || 0;
                for (let i = Math.max(minBoundIdx, centerIdx - 150); i <= Math.min(maxBoundIdx, centerIdx + 150); i++) {
                    if ((peaks[i] || 0) > maxPeakAmp) {
                        maxPeakAmp = peaks[i];
                        bestPeakIdx = i;
                    }
                }
                if (maxPeakAmp >= activeThreshold) {
                    centerIdx = bestPeakIdx;
                }

                let speechStartIdx = centerIdx;
                let silenceCountBack = 0;
                for (let i = centerIdx; i >= minBoundIdx; i--) {
                    if ((peaks[i] || 0) < silenceThreshold) {
                        silenceCountBack++;
                        if (silenceCountBack >= bridgeSilenceSamples) {
                            speechStartIdx = Math.min(centerIdx, i + bridgeSilenceSamples);
                            break;
                        }
                    } else {
                        silenceCountBack = 0;
                        speechStartIdx = i;
                    }
                }

                let speechEndIdx = centerIdx;
                let silenceCountForward = 0;
                for (let i = centerIdx; i <= maxBoundIdx; i++) {
                    if ((peaks[i] || 0) < silenceThreshold) {
                        silenceCountForward++;
                        if (silenceCountForward >= bridgeSilenceSamples) {
                            speechEndIdx = Math.max(centerIdx, i - bridgeSilenceSamples);
                            break;
                        }
                    } else {
                        silenceCountForward = 0;
                        speechEndIdx = i;
                    }
                }

                newStartSec = Math.max(minBoundSec, (speechStartIdx / peaksPerSec) - 0.04);
                newEndSec = Math.min(maxBoundSec, (speechEndIdx / peaksPerSec) + 0.05);
            }
        }

        // Guarantee minimum duration of 0.4s
        if (newEndSec - newStartSec < 0.4) {
            newEndSec = Math.min(maxBoundSec, newStartSec + 0.4);
        }

        // Round to centiseconds
        newStartSec = Math.round(newStartSec * 100) / 100;
        newEndSec = Math.round(newEndSec * 100) / 100;

        onLineTimeChange(selectedLine.id, newStartSec, newEndSec);
        if (onDragComplete) onDragComplete();

        // Seek playhead to the snapped start so the user can immediately verify
        onSeek(newStartSec);

        if (onShowToast) {
            onShowToast(`دێڕی #${selectedLine.id} ڕێک لەسەر دەنگی قسەکەرەکە جێگیر کرایەوە (${formatWaveTime(newStartSec)} ➜ ${formatWaveTime(newEndSec)}) 🎙️✨`, 'success');
        }
    }, [selectedLine, lines, vadThreshold, onLineTimeChange, onDragComplete, onSeek, onShowToast]);

    // Keyboard shortcut for instant voice snap (Alt + S or Ctrl + Shift + S)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);
            if (isTyping) return;

            if ((e.altKey && (e.key === 's' || e.key === 'S')) || (e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S'))) {
                e.preventDefault();
                handleSnapToVoice();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSnapToVoice]);

    // ─── PLAY LINE AUDIO SNIPPET ───
    const handlePlayLineSnippet = () => {
        if (!selectedLine || !videoRef.current) return;

        if (isPlayingSnippet) {
            videoRef.current.pause();
            setIsPlayingSnippet(false);
            if (snippetTimerRef.current) clearTimeout(snippetTimerRef.current);
            return;
        }

        const playDurationMs = Math.max(200, (selectedLine.endSec - selectedLine.startSec) * 1000);
        videoRef.current.currentTime = selectedLine.startSec;
        videoRef.current.play().catch(() => {});
        setIsPlayingSnippet(true);

        if (snippetTimerRef.current) clearTimeout(snippetTimerRef.current);
        snippetTimerRef.current = setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.pause();
            }
            setIsPlayingSnippet(false);
        }, playDurationMs + 100);
    };

    return (
        <div className="subtitle-waveform-container" ref={containerRef}>
            {/* Waveform Controls Header */}
            <div className="waveform-header-toolbar">
                <div className="wf-tool-group">
                    <button
                        type="button"
                        className={`btn-wf-action ${isPlayingSnippet ? 'playing-active' : ''}`}
                        onClick={handlePlayLineSnippet}
                        title="گوێگرتن لە دەنگی تەنها ئەم دێڕە [Play Line Snippet]"
                    >
                        {isPlayingSnippet ? <Pause size={13} /> : <Volume2 size={13} />}
                        <span>{isPlayingSnippet ? 'وەستاندن' : 'گوێگرتن لە دێڕ'}</span>
                    </button>

                    <button
                        type="button"
                        className="btn-wf-action btn-snap-voice"
                        onClick={handleSnapToVoice}
                        title="سینککردنی دەستپێک و کۆتایی بە دەنگی ئاخاوتن [AI Voice Snapping] (Alt+S)"
                    >
                        <Mic size={13} color="#22d3ee" />
                        <span>نوسان بە دەنگ 🎙️</span>
                    </button>

                    <button
                        type="button"
                        className="btn-wf-action"
                        onClick={handleCenterOnSelectedLine}
                        title="ئاراستەکردنی شەپۆل بۆ دێڕی هەڵبژێردراو"
                    >
                        <Eye size={13} />
                        <span>دێڕی #{selectedLine?.id || 1}</span>
                    </button>
                </div>

                <div className="wf-tool-group">
                    <button
                        type="button"
                        className={`btn-wf-icon ${showVad ? 'active-vad' : ''}`}
                        onClick={() => setShowVad(!showVad)}
                        title="پیشاندانی دەنگی قسەکەر [Voice Activity Detection - VAD]"
                    >
                        <Mic size={12} color={showVad ? '#10b981' : '#94a3b8'} />
                        <span>VAD {showVad ? 'چالاکە' : 'ناچالاکە'}</span>
                    </button>

                    <button
                        type="button"
                        className={`btn-wf-icon ${magneticSnap ? 'active-snap' : ''}`}
                        onClick={() => setMagneticSnap(!magneticSnap)}
                        title="نوسانی موگناتیسی بۆ سنووری دەنگ و دێڕەکان [Magnetic Voice Snapping] (دەتوانیت Alt دابگریت بۆ ناچالاککردنی کاتی)"
                    >
                        <Sparkles size={12} color={magneticSnap ? '#22d3ee' : '#94a3b8'} />
                        <span>موگناتیس {magneticSnap ? '🧲' : 'ناچالاک'}</span>
                    </button>

                    <button
                        type="button"
                        className={`btn-wf-icon ${followPlayhead ? 'active' : ''}`}
                        onClick={() => setFollowPlayhead(!followPlayhead)}
                        title={followPlayhead ? 'شوێنکەوتنی ڤیدیۆ چالاکە' : 'شوێنکەوتنی ڤیدیۆ ناچالاکە'}
                    >
                        {followPlayhead ? <Lock size={12} /> : <Unlock size={12} />}
                        <span>شوێنکەوتن</span>
                    </button>

                    <div className="wf-zoom-controls">
                        <button
                            type="button"
                            className="btn-wf-icon"
                            onClick={() => setZoomLevel(prev => Math.max(0.5, prev / 1.5))}
                            title="بچووککردنەوە [Zoom Out]"
                        >
                            <ZoomOut size={12} />
                        </button>
                        <span className="wf-zoom-badge">{zoomLevel.toFixed(1)}x</span>
                        <button
                            type="button"
                            className="btn-wf-icon"
                            onClick={() => setZoomLevel(prev => Math.min(8, prev * 1.5))}
                            title="گەورەکردنەوە [Zoom In]"
                        >
                            <ZoomIn size={12} />
                        </button>
                        <button
                            type="button"
                            className="btn-wf-icon"
                            onClick={() => setZoomLevel(1)}
                            title="ڕێکخستنەوەی زووم [1x]"
                        >
                            <Maximize2 size={12} />
                        </button>
                    </div>

                    {isExtractingAudio && (
                        <span className="wf-loading-badge" title="دەرهێنانی داتای دەنگ لە ڤیدیۆکە...">
                            <RefreshCw size={11} className="spinning" /> شی کردنەوەی دەنگ
                        </span>
                    )}
                </div>
            </div>

            {/* Interactive Canvas Canvas */}
            <div className="waveform-canvas-wrap">
                <canvas
                    ref={canvasRef}
                    className="subtitle-waveform-canvas"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                />
            </div>

            {/* Quick Helper Subtitle Info Footer */}
            {selectedLine && (
                <div className="waveform-footer-info">
                    <div className="wf-info-left">
                        <span className="wf-badge-id">#{selectedLine.id}</span>
                        <span className="wf-time-range">{formatWaveTime(selectedLine.startSec)} ➜ {formatWaveTime(selectedLine.endSec)}</span>
                        <span className="wf-duration">({(selectedLine.endSec - selectedLine.startSec).toFixed(2)}s)</span>
                    </div>
                    <div className="wf-info-right">
                        <span className="wf-instructions-hint">💡 بۆ درێژکردنەوە یان کورتکردنەوە سەرە و قەراغەکانی دێڕەکە بە ماوس ڕابکێشە</span>
                    </div>
                </div>
            )}
        </div>
    );
}
