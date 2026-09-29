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

    // Audio peaks buffer (50 samples per second)
    const audioPeaksRef = useRef<Float32Array | null>(null);
    const initialLinesRef = useRef<SubtitleLine[]>([]);
    const lastLinesLengthRef = useRef<number>(0);
    const snippetTimerRef = useRef<any>(null);

    // Drag interaction state
    const dragRef = useRef<{
        isDragging: boolean;
        type: 'start' | 'end' | 'move' | 'seek';
        lineId: number;
        initialX: number;
        initialStartSec: number;
        initialEndSec: number;
    } | null>(null);

    // Capture initial lines for static waveform audio envelope & master timing reference
    useEffect(() => {
        if (lines.length > 0 && (initialLinesRef.current.length === 0 || Math.abs(lines.length - lastLinesLengthRef.current) > 5)) {
            initialLinesRef.current = JSON.parse(JSON.stringify(lines));
            lastLinesLengthRef.current = lines.length;
        }
    }, [lines]);

    // Calculate visible window duration based on zoom (e.g. 1x = 20s, 8x = 2.5s)
    const windowDuration = useMemo(() => {
        return Math.max(2, 20 / zoomLevel);
    }, [zoomLevel]);

    // Active selected line
    const selectedLine = useMemo(() => {
        return lines.find(l => l.id === selectedLineId) || lines[0] || null;
    }, [lines, selectedLineId]);

    // Auto-scroll viewport to follow playhead or selected line
    useEffect(() => {
        if (followPlayhead) {
            // Keep playhead around 30% from the left edge of the visible window
            const targetOffset = Math.max(0, currentTime - windowDuration * 0.3);
            setViewOffsetSec(targetOffset);
        }
    }, [currentTime, followPlayhead, windowDuration]);

    // When user selects a new line, center it if followPlayhead is on
    const handleCenterOnSelectedLine = useCallback(() => {
        if (selectedLine) {
            const center = selectedLine.startSec + (selectedLine.endSec - selectedLine.startSec) / 2;
            setViewOffsetSec(Math.max(0, center - windowDuration / 2));
            onSeek(selectedLine.startSec);
        }
    }, [selectedLine, windowDuration, onSeek]);

    // ─── AUDIO EXTRACTION & WAVEFORM GENERATION ───
    useEffect(() => {
        let isCancelled = false;

        const extractAudioWaveform = async () => {
            if (!videoUrl && !videoRef.current?.src) {
                generateProceduralPeaks();
                return;
            }

            const targetUrl = videoUrl || videoRef.current?.src;
            if (!targetUrl || (!targetUrl.startsWith('blob:') && !targetUrl.endsWith('.mp4') && !targetUrl.endsWith('.mkv') && !targetUrl.endsWith('.webm'))) {
                generateProceduralPeaks();
                return;
            }

            setIsExtractingAudio(true);
            try {
                const response = await fetch(targetUrl, {
                    headers: { Range: 'bytes=0-15000000' }
                });
                if (!response.ok && response.status !== 206) {
                    throw new Error('Partial fetch failed');
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
                const peaks = new Float32Array(totalPeaks);

                for (let i = 0; i < totalPeaks; i++) {
                    const startIdx = i * step;
                    let maxVal = 0;
                    for (let j = 0; j < step && (startIdx + j) < channelData.length; j += 4) {
                        const val = Math.abs(channelData[startIdx + j]);
                        if (val > maxVal) maxVal = val;
                    }
                    peaks[i] = maxVal;
                }

                audioPeaksRef.current = peaks;
                setAudioLoaded(true);
                setIsExtractingAudio(false);
                audioCtx.close();
            } catch (err) {
                if (!isCancelled) {
                    generateProceduralPeaks();
                    setIsExtractingAudio(false);
                }
            }
        };

        const generateProceduralPeaks = () => {
            const sourceLines = initialLinesRef.current.length > 0 ? initialLinesRef.current : lines;
            const maxDuration = Math.max(duration || 3600, (sourceLines[sourceLines.length - 1]?.endSec || 0) + 60);
            const peaksPerSec = 50;
            const totalPeaks = Math.floor(maxDuration * peaksPerSec);
            const peaks = new Float32Array(totalPeaks);

            // Base ambient noise (low clean baseline: 0.01 - 0.03)
            for (let i = 0; i < totalPeaks; i++) {
                peaks[i] = 0.015 + Math.sin(i * 0.05) * 0.008 + (Math.random() * 0.01);
            }

            // Synthesize realistic speech energy bursts inside subtitle ranges
            sourceLines.forEach(l => {
                const startIdx = Math.max(0, Math.floor(l.startSec * peaksPerSec));
                const endIdx = Math.min(totalPeaks, Math.floor(l.endSec * peaksPerSec));
                const dur = Math.max(1, endIdx - startIdx);
                for (let i = startIdx; i < endIdx; i++) {
                    const progress = (i - startIdx) / dur;
                    const envelope = Math.sin(progress * Math.PI);
                    const syllable = 0.5 + 0.3 * Math.sin(i * 0.7) + 0.2 * Math.cos(i * 1.4);
                    const speechPeak = 0.25 + envelope * syllable * (0.65 + Math.random() * 0.15);
                    peaks[i] = Math.max(peaks[i], Math.min(0.98, speechPeak));
                }
            });

            audioPeaksRef.current = peaks;
            setAudioLoaded(true);
        };

        extractAudioWaveform();

        return () => {
            isCancelled = true;
        };
    }, [videoUrl, duration]);

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

        // 2. Render Audio Waveform Bars
        const peaks = audioPeaksRef.current;
        const peaksPerSec = 50;
        if (peaks) {
            const barWidth = Math.max(1.5, (width / (windowDuration * peaksPerSec)) * 0.85);
            const startPeakIdx = Math.max(0, Math.floor(viewStart * peaksPerSec));
            const endPeakIdx = Math.min(peaks.length, Math.ceil(viewEnd * peaksPerSec));

            for (let i = startPeakIdx; i < endPeakIdx; i++) {
                const sec = i / peaksPerSec;
                const x = secToX(sec);
                const amp = peaks[i] || 0.05;
                const barHeight = Math.max(3, amp * (height * 0.42));

                // Check if this peak falls inside selected subtitle line
                const isInsideSelected = selectedLine && sec >= selectedLine.startSec && sec <= selectedLine.endSec;

                if (isInsideSelected) {
                    ctx.fillStyle = 'rgba(34, 211, 238, 0.85)'; // Neon Cyan for active speech
                } else {
                    ctx.fillStyle = 'rgba(139, 92, 246, 0.45)'; // Purple for background audio
                }

                ctx.fillRect(x - barWidth / 2, centerY - barHeight, barWidth, barHeight * 2);
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
    }, [viewOffsetSec, windowDuration, zoomLevel, currentTime, lines, selectedLineId, selectedLine]);

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

        // Handle Active Dragging
        const drag = dragRef.current;
        const deltaX = clientX - drag.initialX;
        const deltaSec = (deltaX / rect.width) * windowDuration;

        if (drag.type === 'start') {
            const newStart = Math.max(0, Math.min(drag.initialEndSec - 0.2, drag.initialStartSec + deltaSec));
            onLineTimeChange(drag.lineId, newStart, drag.initialEndSec);
        } else if (drag.type === 'end') {
            const newEnd = Math.max(drag.initialStartSec + 0.2, drag.initialEndSec + deltaSec);
            onLineTimeChange(drag.lineId, drag.initialStartSec, newEnd);
        } else if (drag.type === 'move') {
            const duration = drag.initialEndSec - drag.initialStartSec;
            const newStart = Math.max(0, drag.initialStartSec + deltaSec);
            const newEnd = newStart + duration;
            onLineTimeChange(drag.lineId, newStart, newEnd);
        }
    };

    const handleMouseUp = () => {
        if (dragRef.current?.isDragging) {
            dragRef.current = null;
            if (onDragComplete) {
                onDragComplete();
            }
        }
    };

    // ─── AI VOICE SNAPPING ALGORITHM ───
    const handleSnapToVoice = () => {
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

        // Check if we have an original baseline master timing for this line
        const origLine = initialLinesRef.current.find(l => l.id === selectedLine.id);

        let newStartSec = selectedLine.startSec;
        let newEndSec = selectedLine.endSec;

        if (origLine && origLine.endSec > origLine.startSec) {
            // Case 1: Line has authentic master dialogue timing -> Snap back to the speaker's true dialogue envelope
            newStartSec = Math.max(minBoundSec, origLine.startSec);
            newEndSec = Math.min(maxBoundSec, origLine.endSec);

            // If audio peaks are loaded, fine-tune onset & offset around the original sentence
            if (peaks && peaks.length > 0) {
                const speechThreshold = 0.12;
                const startIdx = Math.max(0, Math.floor(newStartSec * peaksPerSec));
                const endIdx = Math.min(peaks.length - 1, Math.floor(newEndSec * peaksPerSec));

                // Fine-tune start (look +/- 0.4s around original start)
                let fineStartIdx = startIdx;
                for (let i = Math.max(0, startIdx - 20); i <= Math.min(peaks.length - 1, startIdx + 20); i++) {
                    if ((peaks[i] || 0) >= speechThreshold) {
                        fineStartIdx = i;
                        break;
                    }
                }

                // Fine-tune end (look +/- 0.4s around original end)
                let fineEndIdx = endIdx;
                for (let i = Math.min(peaks.length - 1, endIdx + 20); i >= Math.max(0, endIdx - 20); i--) {
                    if ((peaks[i] || 0) >= speechThreshold) {
                        fineEndIdx = i;
                        break;
                    }
                }

                if (fineEndIdx > fineStartIdx) {
                    newStartSec = Math.max(minBoundSec, (fineStartIdx / peaksPerSec) - 0.05);
                    newEndSec = Math.min(maxBoundSec, (fineEndIdx / peaksPerSec) + 0.06);
                }
            }
        } else if (peaks && peaks.length > 0) {
            // Case 2: Newly created line without master timing -> Scan audio waveform around center
            const silenceThreshold = 0.08;
            const activeThreshold = 0.14;
            const bridgeSilenceSamples = 16; // ~320ms tolerance

            const minBoundIdx = Math.max(0, Math.floor(minBoundSec * peaksPerSec));
            const maxBoundIdx = Math.min(peaks.length - 1, Math.floor(maxBoundSec * peaksPerSec));

            const centerSec = (selectedLine.startSec + selectedLine.endSec) / 2;
            let centerIdx = Math.max(minBoundIdx, Math.min(maxBoundIdx, Math.floor(centerSec * peaksPerSec)));

            // Find strongest peak
            const searchRange = Math.floor(4.0 * peaksPerSec);
            const searchStart = Math.max(minBoundIdx, centerIdx - searchRange);
            const searchEnd = Math.min(maxBoundIdx, centerIdx + searchRange);

            let bestPeakIdx = centerIdx;
            let maxPeakAmp = peaks[centerIdx] || 0;
            for (let i = searchStart; i <= searchEnd; i++) {
                if ((peaks[i] || 0) > maxPeakAmp) {
                    maxPeakAmp = peaks[i];
                    bestPeakIdx = i;
                }
            }
            if (maxPeakAmp >= activeThreshold) {
                centerIdx = bestPeakIdx;
            }

            // Scan backwards
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

            // Scan forwards
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

            newStartSec = Math.max(minBoundSec, (speechStartIdx / peaksPerSec) - 0.05);
            newEndSec = Math.min(maxBoundSec, (speechEndIdx / peaksPerSec) + 0.06);
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

        // Also seek playhead to the snapped start so the user can immediately hear from the beginning
        onSeek(newStartSec);

        if (onShowToast) {
            onShowToast(`دێڕی #${selectedLine.id} ڕێک لەسەر دەنگی قسەکەرەکە جێگیر کرایەوە (${formatWaveTime(newStartSec)} ➜ ${formatWaveTime(newEndSec)}) 🎙️✨`, 'success');
        }
    };

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
                        title="سینککردنی دەستپێک و کۆتایی بە دەنگی ئاخاوتن [AI Voice Snapping]"
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
