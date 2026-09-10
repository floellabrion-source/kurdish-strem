// HMR trigger
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../api/client';
import {
    ArrowRight, Play, Pause, Volume2, VolumeX,
    Maximize, Minimize, RotateCcw, RotateCw, Settings,
    SkipForward, SkipBack, Mic, MicOff, Volume1, X, Check, CheckCircle, BookmarkPlus, Brain, Loader2, Shield, EyeOff, Languages, Star, AlertCircle, Sparkles, UserPlus, ExternalLink, Trophy, Award, Home,
    ChevronLeft, ChevronRight, Gauge, Sliders, Clock, PictureInPicture2, FlipHorizontal, Maximize2
} from 'lucide-react';
import type { Movie, Episode, RepeatedWord, DifficultWord } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { wordCache } from '../utils/wordCache';
import { DualSubTrialModal } from '../components/DualSubTrialModal';
import Hls from 'hls.js';
import './Watch.css';

const parseSRT = (data: string) => {
    if (!data || typeof data !== 'string') return [];
    const clean = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = clean.split(/\n\s*\n/);
    const subs: { id: number; start: number; end: number; text: string }[] = [];
    
    let autoId = 1;
    blocks.forEach(b => {
        const lines = b.trim().split('\n');
        if (lines.length < 2) return;

        const timeLineIndex = lines.findIndex(l => l.includes('-->'));
        if (timeLineIndex === -1) return;

        const tm = lines[timeLineIndex].match(/(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})/);
        if (!tm) return;

        const parsedId = timeLineIndex > 0 ? parseInt(lines[0].trim(), 10) : NaN;
        const id = !isNaN(parsedId) ? parsedId : autoId++;

        const toSeconds = (tStr: string) => {
            const normalized = tStr.replace('.', ',');
            const parts = normalized.split(':');
            const h = parts.length === 3 ? parseFloat(parts[0]) : 0;
            const m = parts.length === 3 ? parseFloat(parts[1]) : parseFloat(parts[0]);
            const sParts = (parts.length === 3 ? parts[2] : parts[1]).split(',');
            const s = parseFloat(sParts[0]);
            const ms = sParts[1] ? parseFloat(sParts[1].padEnd(3, '0').slice(0, 3)) : 0;
            return h * 3600 + m * 60 + s + ms / 1000;
        };

        const start = toSeconds(tm[1]);
        const end = toSeconds(tm[2]);
        const text = lines.slice(timeLineIndex + 1).join('\n').replace(/<[^>]*>/g, '').trim();

        if (text && isFinite(start) && isFinite(end) && end >= start) {
            subs.push({ id, start, end, text });
        }
    });
    return subs.sort((a, b) => a.start - b.start);
};

const fmt = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
};

const AI_MIN_INTERVAL_MS = 1500;
const AI_MAX_RETRIES = 2;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function Watch() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const seasonNum = parseInt(searchParams.get('s') || '1');
    const episodeNum = parseInt(searchParams.get('e') || '0');
    const navigate = useNavigate();

    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLInputElement>(null);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recognitionRef = useRef<any>(null);
    const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSeekRef = useRef<number | null>(null);
    const isScrubbingRef = useRef(false);
    const ignoreVideoErrorUntilRef = useRef(0);

    const [movie, setMovie] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);
    const [videoLoadError, setVideoLoadError] = useState('');
    const [originalSubs, setOriginalSubs] = useState<ReturnType<typeof parseSRT>>([]);
    const [translatedSubs, setTranslatedSubs] = useState<ReturnType<typeof parseSRT>>([]);
    const { user, syncProgress, updateCredits } = useAuth();
    const { lang, t } = useLanguage();
    const [globalToasts, setGlobalToasts] = useState<{ id: number, msg: string, type: 'error' | 'success' }[]>([]);

    const showGlobalToast = (msg: string, type: 'error' | 'success' = 'error') => {
        const id = Date.now();
        setGlobalToasts(t => [...t, { id, msg, type }]);
        setTimeout(() => setGlobalToasts(t => t.filter(x => x.id !== id)), 4000);
    };
    
    // Family Mode / Blur
    const [sensitiveScenes, setSensitiveScenes] = useState<{start: number, end: number}[]>([]);
    const [familyMode, setFamilyMode] = useState(() => {
        const saved = localStorage.getItem('familyMode');
        return saved ? saved === 'true' : true; // Default ON
    });

    useEffect(() => {
        localStorage.setItem('familyMode', familyMode.toString());
    }, [familyMode]);

    const [streamStartTime, setStreamStartTime] = useState(0);

    const [showOriginal, setShowOriginal] = useState(false);
    const [showTranslated, setShowTranslated] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'main' | 'speed' | 'subtitles' | 'delay' | 'quality' | 'aspect'>('main');
    const [aspectRatio, setAspectRatio] = useState<'default' | 'fill' | 'stretch' | '4:3'>('default');
    const [isFlipped, setIsFlipped] = useState(false);
    const [showVolumePopup, setShowVolumePopup] = useState(false);

    // Dual Subtitle Free Trial Quota State
    const [dualSubTrialMinutes, setDualSubTrialMinutes] = useState(30);
    const [dualSubResetHours, setDualSubResetHours] = useState(24);
    const [dualSubTrialActive, setDualSubTrialActive] = useState(true);
    const [dualSubExpiredAction, setDualSubExpiredAction] = useState<'block_all' | 'kurdish_only' | 'english_only'>('block_all');
    const [showDualTrialModal, setShowDualTrialModal] = useState(false);
    const [dualSubCycleStartTime, setDualSubCycleStartTime] = useState<number | null>(() => {
        if (user?.dualSubCycleStartTime) return user.dualSubCycleStartTime;
        const local = localStorage.getItem('ks_dual_sub_cycle_start');
        return local ? parseInt(local, 10) : null;
    });
    const [dualSubSecondsUsed, setDualSubSecondsUsed] = useState<number>(() => {
        if (user?.dualSubWatchSeconds) return user.dualSubWatchSeconds;
        const local = localStorage.getItem('ks_dual_sub_seconds');
        return local ? parseInt(local, 10) : 0;
    });

    useEffect(() => {
        axios.get('/api/settings/dual-sub-quota')
            .then(res => {
                if (res.data) {
                    const tMinutes = res.data.trialMinutes ?? 30;
                    const rHours = res.data.resetHours ?? 24;
                    setDualSubTrialMinutes(tMinutes);
                    setDualSubResetHours(rHours);
                    setDualSubTrialActive(res.data.active ?? true);
                    setDualSubExpiredAction(res.data.expiredAction || 'block_all');

                    // Check if 24-hour cycle has expired and resets quota
                    if (rHours > 0) {
                        const cycleStart = user?.dualSubCycleStartTime || (localStorage.getItem('ks_dual_sub_cycle_start') ? parseInt(localStorage.getItem('ks_dual_sub_cycle_start')!, 10) : null);
                        if (cycleStart) {
                            const now = Date.now();
                            const cycleMs = rHours * 3600 * 1000;
                            if (now - cycleStart >= cycleMs) {
                                setDualSubSecondsUsed(0);
                                setDualSubCycleStartTime(null);
                                localStorage.setItem('ks_dual_sub_seconds', '0');
                                localStorage.removeItem('ks_dual_sub_cycle_start');
                                if (user) {
                                    syncProgress({ dualSubWatchSeconds: 0, dualSubCycleStartTime: null });
                                }
                            }
                        }
                    }
                }
            })
            .catch(() => {});
    }, []);

    const isExemptFromTrial = useMemo(() => {
        if (!dualSubTrialActive || dualSubTrialMinutes <= 0) return true;
        if (user?.role === 'super_admin' || user?.role === 'admin' || user?.isVip) return true;
        if (user?.plan && user?.plan !== 'Starter') return true;
        return false;
    }, [user, dualSubTrialActive, dualSubTrialMinutes]);

    const trialLimitSeconds = dualSubTrialMinutes * 60;
    const isTrialLimitReached = !isExemptFromTrial && dualSubSecondsUsed >= trialLimitSeconds;

    // Subtitle Quota Tracker (Active when playing AND subtitles are enabled for non-VIP users and guests)
    useEffect(() => {
        if (!isPlaying || (!showOriginal && !showTranslated) || isExemptFromTrial) return;

        const interval = setInterval(() => {
            setDualSubSecondsUsed(prev => {
                let currentCycleStart = dualSubCycleStartTime;
                if (!currentCycleStart) {
                    currentCycleStart = Date.now();
                    setDualSubCycleStartTime(currentCycleStart);
                    localStorage.setItem('ks_dual_sub_cycle_start', currentCycleStart.toString());
                }

                const next = prev + 1;
                localStorage.setItem('ks_dual_sub_seconds', next.toString());

                // Sync with server every 15 seconds for logged-in users
                if (next % 15 === 0 && user) {
                    syncProgress({ dualSubWatchSeconds: next, dualSubCycleStartTime: currentCycleStart });
                }

                // Check if reached limit
                if (next >= trialLimitSeconds) {
                    if (dualSubExpiredAction === 'block_all') {
                        setShowOriginal(false);
                        setShowTranslated(false); // Hide both subtitles
                    } else if (dualSubExpiredAction === 'kurdish_only') {
                        setShowOriginal(false);
                        setShowTranslated(true); // Keep Kurdish only
                    } else if (dualSubExpiredAction === 'english_only') {
                        setShowOriginal(true); // Keep English only
                        setShowTranslated(false);
                    } else {
                        setShowOriginal(false);
                        setShowTranslated(false);
                    }

                    setShowDualTrialModal(true);
                }

                return next;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isPlaying, showOriginal, showTranslated, isExemptFromTrial, trialLimitSeconds, user, syncProgress, dualSubExpiredAction, dualSubCycleStartTime]);

    const handleToggleOriginal = () => {
        if (isTrialLimitReached) {
            setShowDualTrialModal(true);
            return;
        }
        setShowOriginal(prev => !prev);
    };

    const handleToggleTranslated = () => {
        if (isTrialLimitReached) {
            setShowDualTrialModal(true);
            return;
        }
        setShowTranslated(prev => !prev);
    };

    const togglePictureInPicture = async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (videoRef.current && document.pictureInPictureEnabled) {
                await videoRef.current.requestPictureInPicture();
            }
        } catch (err) {
            console.error('Picture-in-Picture error:', err);
        }
    };

    const [origFontSize, setOrigFontSize] = useState(20);
    const [transFontSize, setTransFontSize] = useState(26);
    const [subtitlePos, setSubtitlePos] = useState(10);
    const [subDelay, setSubDelay] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);

    // Subtitle Background Opacity & Theme
    const [subBgOpacity, setSubBgOpacity] = useState<number>(() => {
        const saved = localStorage.getItem('ks_sub_bg_opacity');
        return saved !== null ? parseInt(saved, 10) : 75;
    });
    const [subBgTheme, setSubBgTheme] = useState<'black' | 'transparent' | 'purple' | 'blue'>(() => {
        const saved = localStorage.getItem('ks_sub_bg_theme') as any;
        return (saved === 'black' || saved === 'transparent' || saved === 'purple' || saved === 'blue') ? saved : 'black';
    });

    useEffect(() => {
        localStorage.setItem('ks_sub_bg_opacity', subBgOpacity.toString());
    }, [subBgOpacity]);

    useEffect(() => {
        localStorage.setItem('ks_sub_bg_theme', subBgTheme);
    }, [subBgTheme]);

    const computedSubBg = useMemo(() => {
        if (subBgTheme === 'transparent' || subBgOpacity === 0) {
            return 'transparent';
        }
        const alpha = (subBgOpacity / 100).toFixed(2);
        if (subBgTheme === 'purple') {
            return `rgba(32, 16, 56, ${alpha})`;
        }
        if (subBgTheme === 'blue') {
            return `rgba(15, 25, 48, ${alpha})`;
        }
        return `rgba(0, 0, 0, ${alpha})`;
    }, [subBgOpacity, subBgTheme]);

    const computedSubBorder = useMemo(() => {
        if (subBgTheme === 'transparent' || subBgOpacity === 0) {
            return 'transparent';
        }
        const alpha = (subBgOpacity / 100 * 0.4).toFixed(2);
        if (subBgTheme === 'purple') {
            return `rgba(168, 85, 247, ${alpha})`;
        }
        if (subBgTheme === 'blue') {
            return `rgba(59, 130, 246, ${alpha})`;
        }
        return `rgba(255, 255, 255, ${alpha})`;
    }, [subBgOpacity, subBgTheme]);

    const computedSubBackdrop = useMemo(() => {
        return (subBgTheme === 'transparent' || subBgOpacity === 0) ? 'none' : 'blur(8px)';
    }, [subBgOpacity, subBgTheme]);

    const syncBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [syncBadgeVisible, setSyncBadgeVisible] = useState(false);
    const [skipIndicator, setSkipIndicator] = useState<'forward' | 'backward' | null>(null);
    const [playPauseIndicator, setPlayPauseIndicator] = useState<'play' | 'pause' | null>(null);
    const [episodeTitle, setEpisodeTitle] = useState('');
    const [activeEpisode, setActiveEpisode] = useState<Episode | null>(null);
    const [resumePrompt, setResumePrompt] = useState<number | null>(null); // saved time to resume from

    // Watch stats tracking
    const accumulatedSecondsRef = useRef(0);
    const lastVideoTimeRef = useRef<number>(0);
    const lastSeenSubIdRef = useRef<number | null>(null);
    const [sessionSentences, setSessionSentences] = useState(0);

    // HLS & Video Quality State
    const hlsRef = useRef<Hls | null>(null);
    const [autoDetectedHeight, setAutoDetectedHeight] = useState<number | null>(null);
    const [qualityLevels, setQualityLevels] = useState<{ id: number; label: string }[]>([
        { id: -1, label: 'خۆکار (Auto)' },
        { id: 1080, label: '1080p (Full HD)' },
        { id: 720, label: '720p (HD)' },
        { id: 480, label: '480p (SD)' },
        { id: 360, label: '360p (Data Saver)' }
    ]);
    const [currentQuality, setCurrentQuality] = useState<number>(-1);

    const handleQualityChange = (levelId: number) => {
        setCurrentQuality(levelId);
        if (hlsRef.current) {
            hlsRef.current.currentLevel = levelId;
            return;
        }

        const v = videoRef.current;
        const currentTimeSnapshot = v ? v.currentTime : 0;
        
        // Save seek position for seamless transition
        setStreamStartTime(currentTimeSnapshot);
        pendingSeekRef.current = currentTimeSnapshot;

        showGlobalToast(
            levelId === -1 
                ? (lang === 'en' ? 'Quality set to Auto' : 'کواڵێتی گۆڕدرا بۆ خۆکار (Auto)') 
                : (lang === 'en' ? `Quality set to ${levelId}p` : `کواڵێتی گۆڕدرا بۆ ${levelId}p`),
            'success'
        );
    };

    // --- Video Logic & Transcoding ---
    const mkvUnsupported = useMemo(() => {
        let videoFileName = movie?.videoFile || null;
        if (episodeNum > 0 && movie?.seasons) {
            const season = movie.seasons.find(s => s.number === seasonNum);
            const episode = season?.episodes.find(e => e.number === episodeNum);
            videoFileName = episode?.videoFile || null;
        }
        const browserSupportsMkv = typeof document !== 'undefined'
            ? !!document.createElement('video').canPlayType('video/x-matroska')
            : true;
        return !!videoFileName?.toLowerCase().endsWith('.mkv') && !browserSupportsMkv;
    }, [movie, episodeNum, seasonNum]);

    const isTranscodedStream = mkvUnsupported;

    const subtitleDuration = useMemo(() => {
        return Math.max(
            0,
            ...originalSubs.map((sub) => sub.end || 0),
            ...translatedSubs.map((sub) => sub.end || 0)
        );
    }, [originalSubs, translatedSubs]);

    const parseDurationToSeconds = (d: string | number | undefined) => {
        if (!d) return 0;
        if (typeof d === 'number') return d;
        
        // Handle "136 min"
        const minMatch = d.match(/(\d+)\s*min/i);
        if (minMatch) return parseInt(minMatch[1], 10) * 60;
        
        // Handle "02:16:00"
        const parts = d.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        
        const num = Number(d);
        return isFinite(num) ? num : 0;
    };

    const effectiveDuration = useMemo(() => {
        // 1. If the video element has loaded the REAL duration from the actual video file, use it!
        if (isFinite(duration) && duration > 0) return duration;

        // 2. Fallback to database duration if video metadata is still loading
        const episodeDur = activeEpisode ? parseDurationToSeconds(activeEpisode.duration) : 0;
        const movieDur = parseDurationToSeconds(movie?.duration);
        const finalDur = episodeDur || movieDur || 0;
        if (finalDur > 0) return finalDur;

        // 3. Fallback to subtitle duration
        if (subtitleDuration > 0 && isFinite(subtitleDuration)) return subtitleDuration;
        return 0;
    }, [duration, subtitleDuration, movie, activeEpisode]);

    const scheduleTranscodedSeek = useCallback((nextTime: number, delayMs: number) => {
        ignoreVideoErrorUntilRef.current = Date.now() + 4000;
        pendingSeekRef.current = nextTime;
        setCurrentTime(nextTime);

        if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);

        seekTimeoutRef.current = setTimeout(() => {
            // تەنها ئەگەر بەکارهێنەر بەردەوام seek دەکات، نوێترین کات بەکاردبێت
            if (pendingSeekRef.current === nextTime) {
                setStreamStartTime(nextTime);
                pendingSeekRef.current = null;
            }
        }, delayMs);
    }, []);

    const commitSeek = useCallback((rawTime: number, options?: { delayMs?: number }) => {
        const v = videoRef.current;
        const nextTime = Math.max(0, Math.min(rawTime, effectiveDuration || 0));
        
        if (!v || !isFinite(nextTime)) return;
        ignoreVideoErrorUntilRef.current = Date.now() + 3000;
        lastVideoTimeRef.current = nextTime;
        
        if (isTranscodedStream) {
            scheduleTranscodedSeek(nextTime, options?.delayMs ?? 500);
        } else {
            // Add a small debounce even for native MP4 to prevent net::ERR_ABORTED flood
            setCurrentTime(nextTime);
            pendingSeekRef.current = nextTime;
            
            if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
            seekTimeoutRef.current = setTimeout(() => {
                if (videoRef.current && pendingSeekRef.current !== null) {
                    videoRef.current.currentTime = pendingSeekRef.current;
                }
                pendingSeekRef.current = null;
            }, options?.delayMs ?? 300);
        }
    }, [effectiveDuration, isTranscodedStream, scheduleTranscodedSeek]);
    // --- End Video Logic ---

    // localStorage key for this content
    const progressKey = `progress_${user?.id || 'guest'}_${id}_s${seasonNum}_e${episodeNum}`;

    // Flashcard interaction
    const [flashcardToast, setFlashcardToast] = useState(false);
    const flashcardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [authPrompt, setAuthPrompt] = useState<{ open: boolean; title: string; message: string } | null>(null);

    const checkAuthForFeature = (featureType: 'translation' | 'pronunciation' | 'quiz' | 'flashcards'): boolean => {
        if (user) return true;
        if (videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
        }
        const messages = {
            translation: 'بۆ بەکارهێنانی وەرگێڕانی زیرەک و مانا، تکایە خۆت تۆمار بکە یان بچۆ ژوورەوە.',
            pronunciation: 'بۆ تاقیکردنەوەی گۆکردن و ڕاهێنانی دەنگی، تکایە خۆت تۆمار بکە یان بچۆ ژوورەوە.',
            quiz: 'بۆ ئەنجامدانی تاقیکردنەوەی زیرەک لەسەر فیلمەکە، تکایە خۆت تۆمار بکە یان بچۆ ژوورەوە.',
            flashcards: 'بۆ پاشەکەوتکردنی وشەکان لە فلاش کارت، تکایە خۆت تۆمار بکە یان بچۆ ژوورەوە.'
        };
        setAuthPrompt({
            open: true,
            title: 'پێویستە هەژمار دروست بکەیت',
            message: messages[featureType]
        });
        return false;
    };

    const buildFlashcardSourceLabel = () => {
        if (!movie) return '';
        if (episodeNum > 0) return `${movie.title} S${seasonNum}E${episodeNum}`;
        return movie.title;
    };

    const addToFlashcards = (
        e: React.MouseEvent,
        front: string,
        back: string,
        options?: {
            cardType?: 'word' | 'subtitle';
            quote?: string;
            translatedQuote?: string;
            timestamp?: number;
            subtitleId?: number;
        }
    ) => {
        e.stopPropagation();
        if (!checkAuthForFeature('flashcards')) return;
        try {
            const saved = localStorage.getItem('kurdish_stream_flashcards');
            const cards = saved ? JSON.parse(saved) : [];
            const timestamp = options?.timestamp ?? currentOrigSub?.start ?? currentTime;
            const context = {
                quote: options?.quote || currentOrigSub?.text || front,
                translatedQuote: options?.translatedQuote || currentTransSub?.text || back,
                sourceLabel: buildFlashcardSourceLabel(),
                movieId: id,
                seasonNumber: episodeNum > 0 ? seasonNum : undefined,
                episodeNumber: episodeNum > 0 ? episodeNum : undefined,
                episodeTitle: activeEpisode?.title || '',
                timestamp,
                subtitleId: options?.subtitleId ?? currentOrigSub?.id
            };
            const mediaRef = id ? {
                mode: 'local_extract',
                localRef: {
                    movieId: id,
                    seasonNumber: episodeNum > 0 ? seasonNum : undefined,
                    episodeNumber: episodeNum > 0 ? episodeNum : undefined,
                    timestamp
                },
                remote: {
                    screenshotUrl: null,
                    audioUrl: null
                }
            } : undefined;

            const existingIdx = cards.findIndex((c: any) =>
                c.front?.trim()?.toLowerCase() === front.trim().toLowerCase() &&
                c.back?.trim() === back.trim()
            );

            if (existingIdx === -1) {
                const now = Date.now();
                cards.unshift({
                    id: now.toString(),
                    front,
                    back,
                    ease: 2.5,
                    interval: 0,
                    nextReview: now,
                    createdAt: now,
                    cardType: options?.cardType || 'word',
                    context,
                    mediaRef
                });
            } else {
                cards[existingIdx] = {
                    ...cards[existingIdx],
                    cardType: cards[existingIdx].cardType || options?.cardType || 'word',
                    context: cards[existingIdx].context || context,
                    mediaRef: cards[existingIdx].mediaRef || mediaRef
                };
            }

            localStorage.setItem('kurdish_stream_flashcards', JSON.stringify(cards));
            if (user?.id) localStorage.setItem(`kurdish_stream_flashcards_${user.id}`, JSON.stringify(cards));
            if (user) syncProgress({ flashcards: cards });
            
            // Reload SRS map in memory
            reloadSavedFlashcards();

            // Show toast
            setFlashcardToast(true);
            if (flashcardTimerRef.current) clearTimeout(flashcardTimerRef.current);
            flashcardTimerRef.current = setTimeout(() => setFlashcardToast(false), 2000);
        } catch (err) { }
    };

    // In-Player SRS Flashcards Memory & Full Card Metadata
    interface SavedCardMeta {
        id: string;
        front: string;
        back: string;
        quote?: string;
        sourceLabel?: string;
        box: number;
        isDue: boolean;
        ease?: number;
        interval?: number;
    }

    const [savedFlashcardsMap, setSavedFlashcardsMap] = useState<Map<string, SavedCardMeta>>(new Map());

    const computeCardBox = (card: any): number => {
        if (card.box && card.box >= 1 && card.box <= 5) return card.box;
        const interval = card.interval || 0;
        if (interval <= 1) return 1;
        if (interval <= 3) return 2;
        if (interval <= 7) return 3;
        if (interval <= 16) return 4;
        return 5;
    };

    const reloadSavedFlashcards = useCallback(() => {
        try {
            const keys = [
                user?.id ? `kurdish_stream_flashcards_${user.id}` : null,
                'kurdish_stream_flashcards_guest',
                'kurdish_stream_flashcards'
            ].filter(Boolean) as string[];

            let rawCards: any[] = [];
            for (const k of keys) {
                const item = localStorage.getItem(k);
                if (item) {
                    try {
                        const parsed = JSON.parse(item);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            rawCards = parsed;
                            break;
                        }
                    } catch (e) {}
                }
            }

            if (rawCards.length === 0 && user?.flashcards && Array.isArray(user.flashcards)) {
                rawCards = user.flashcards;
            }

            if (rawCards.length > 0) {
                const map = new Map<string, SavedCardMeta>();
                rawCards.forEach((c: any) => {
                    const frontText = (c.front || c.word || '').trim();
                    const backText = (c.back || c.meaning || c.translation || '').trim();
                    const clean = frontText.toLowerCase().replace(/[^\w]/g, '');
                    const box = computeCardBox(c);
                    const isDue = !c.nextReview || c.nextReview <= Date.now();
                    const meta: SavedCardMeta = {
                        id: c.id || '',
                        front: frontText,
                        back: backText,
                        quote: c.context?.quote || '',
                        sourceLabel: c.context?.sourceLabel || '',
                        box,
                        isDue,
                        ease: c.ease || 2.5,
                        interval: c.interval || 0
                    };

                    if (clean) {
                        map.set(clean, meta);
                    }
                    // If phrase, also index individual distinct words
                    const words = frontText.toLowerCase().split(/\s+/).map((w: string) => w.replace(/[^\w]/g, '')).filter((w: string) => w.length >= 3);
                    if (words.length > 1) {
                        words.forEach((w: string) => {
                            if (!map.has(w)) {
                                map.set(w, meta);
                            }
                        });
                    }
                });
                setSavedFlashcardsMap(map);
            } else {
                setSavedFlashcardsMap(new Map());
            }
        } catch (e) { }
    }, [user]);

    useEffect(() => {
        reloadSavedFlashcards();
    }, [reloadSavedFlashcards]);

    // AI Explanation Feature
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiExplanation, setAiExplanation] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    
    // Word Lookup
    const [wordLookupModalOpen, setWordLookupModalOpen] = useState(false);
    const [wordLookupData, setWordLookupData] = useState<{word: string, translation: string, isFlashcard?: boolean, cardMeta?: SavedCardMeta, clickedWord?: string}>({word: '', translation: ''});
    const [isWordLookupLoading, setIsWordLookupLoading] = useState(false);

    // Post-Movie Completion & Quiz Flow
    const [completionModalOpen, setCompletionModalOpen] = useState(false);
    const [completionXpAwarded, setCompletionXpAwarded] = useState(false);
    const [quizModalOpen, setQuizModalOpen] = useState(false);
    const [quizData, setQuizData] = useState<{question: string, options: string[], answerIndex: number}[]>([]);
    const [quizLoading, setQuizLoading] = useState(false);
    const [quizScore, setQuizScore] = useState(0);
    const [quizCurrentQ, setQuizCurrentQ] = useState(0);
    const [quizXpWon, setQuizXpWon] = useState(0);
    const [quizAnsweredIndex, setQuizAnsweredIndex] = useState<number | null>(null);
    const totalAccumulatedSecondsRef = useRef(0);
    const lastReportedPercentRef = useRef<number>(0);
    
    const aiLastRequestAtRef = useRef(0);
    const aiInFlightRef = useRef(false);

    const extractApiError = (err: any, fallback: string) => {
        return err?.response?.data?.error?.message || err?.response?.data?.error || fallback;
    };

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const getRetryDelayMs = (err: any, fallbackMs: number) => {
        const retryAfterHeader = err?.response?.headers?.['retry-after'];
        if (retryAfterHeader) {
            const sec = Number(retryAfterHeader);
            if (!isNaN(sec) && sec > 0) return sec * 1000;
        }
        const msg = extractApiError(err, '');
        const sMatch = String(msg).match(/retry in\s*([0-9.]+)s/i);
        if (sMatch?.[1]) return Math.ceil(Number(sMatch[1]) * 1000);
        const genericNum = String(msg).match(/([0-9.]+)\s*(چرکە|second|sec)/i);
        if (genericNum?.[1]) return Math.ceil(Number(genericNum[1]) * 1000);
        return fallbackMs;
    };

    const postAiWithRetry = async (payload: any) => {
        if (aiInFlightRef.current) {
            throw new Error('AI request already in progress');
        }
        aiInFlightRef.current = true;
        try {
            const elapsed = Date.now() - aiLastRequestAtRef.current;
            if (elapsed < AI_MIN_INTERVAL_MS) {
                await sleep(AI_MIN_INTERVAL_MS - elapsed);
            }

            let attempt = 0;
            let backoffMs = 1500;

            while (true) {
                aiLastRequestAtRef.current = Date.now();
                try {
                    return await axios.post('/api/ai/generate', payload);
                } catch (err: any) {
                    const status = err?.response?.status;
                    if (status === 402) {
                        const msg = extractApiError(err, 'کرێدیتی پێویستت نییە بۆ ئەم کارە.');
                        showGlobalToast(msg, 'error');
                        throw err;
                    }
                    if (status !== 429 || attempt >= AI_MAX_RETRIES) {
                        throw err;
                    }
                    const waitMs = getRetryDelayMs(err, backoffMs);
                    await sleep(waitMs);
                    attempt += 1;
                    backoffMs = Math.min(backoffMs * 2, 10000);
                }
            }
        } finally {
            aiInFlightRef.current = false;
        }
    };

    const lookupWordWithAi = async (word: string) => {
        if (!checkAuthForFeature('translation')) return;
        if (videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
        setWordLookupModalOpen(true);
        
        // Clean word for AI and UI (remove punctuation like dots, commas)
        const cleanWord = word.replace(/[^a-zA-Z']/g, '').trim();

        // 🟢 Phase 4 Cache Check: If word translation exists in local cache, show instantly with 0ms latency & 0 credits!
        const cachedTranslation = wordCache.get(cleanWord);
        if (cachedTranslation) {
            setWordLookupData({ word: cleanWord || word, translation: cachedTranslation });
            setIsWordLookupLoading(false);
            return;
        }

        setIsWordLookupLoading(true);
        setWordLookupData({ word: cleanWord || word, translation: '' });

        try {
            const res = await postAiWithRetry({
                contents: [{ parts: [{ text: `Translate the English word "${cleanWord}" to Kurdish (Sorani). Give ONLY the direct meaning in 1-3 words, no explanation, no extra text.` }] }],
                aiTask: 'word_translation'
            });
            const answer = (res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'هەڵە ڕوویدا').trim();
            setWordLookupData({ word: cleanWord || word, translation: answer });
            
            // Save to Phase 4 client-side word cache
            if (cleanWord && answer && answer !== 'هەڵە ڕوویدا') {
                wordCache.set(cleanWord, answer);
            }

            if (res.data.remainingCredits !== undefined) {
                updateCredits(res.data.remainingCredits);
            }
        } catch (err: any) {
            if (err?.message === 'AI request already in progress') {
                setWordLookupData({ word: cleanWord || word, translation: 'تکایە کەمێک چاوەڕێ بکە، داواکارییەکی تر بەڕێوەیە.' });
            } else {
                const errorMsg = extractApiError(err, 'کێشە لە پەیوەندی هەیە');
                setWordLookupData({ word: cleanWord || word, translation: errorMsg });
            }
        } finally {
            setIsWordLookupLoading(false);
        }
    };

    const triggerCompletionFlow = useCallback(() => {
        if (videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
        setCompletionModalOpen(true);
        if (!completionXpAwarded && user) {
            setCompletionXpAwarded(true);
            syncProgress({ points: 50 }).catch(() => {});
        }
    }, [completionXpAwarded, user, syncProgress]);

    const generateAndShowQuiz = async () => {
        if (!checkAuthForFeature('quiz')) return;
        if (videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
        setCompletionModalOpen(false); // Close completion modal when starting quiz
        setQuizModalOpen(true);
        setQuizLoading(true);
        setQuizData([]);
        setQuizScore(0);
        setQuizCurrentQ(0);
        setQuizXpWon(0);
        setQuizAnsweredIndex(null);
        
        try {
            // Get rich subtitle sample from across the movie for comprehensive quiz
            const sampleSubs = originalSubs.length > 15 ? originalSubs.slice(-25) : originalSubs;
            const recentSubs = sampleSubs.map(s => s.text).join(' ').slice(0, 1000) || "movie dialogues and English vocabulary";
            const prompt = `Generate a 3-question multiple-choice comprehension quiz in Kurdish (Sorani) testing understanding of important English words from this movie content: "${recentSubs}". 
            Format the response ONLY as a valid JSON array like this: [{"question": "مانای 'word' چییە لەم دیمەنەدا؟", "options": ["مانای ١", "مانای ٢", "مانای ٣", "مانای ٤"], "answerIndex": 0}]`;
            
            const res = await postAiWithRetry({
                contents: [{ parts: [{ text: prompt }] }],
                aiTask: 'quiz_generation'
            });
            
            let text = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed) && parsed.length > 0) {
                setQuizData(parsed);
                if (res.data.remainingCredits !== undefined) {
                    updateCredits(res.data.remainingCredits);
                }
            } else {
                throw new Error("Invalid quiz data");
            }
        } catch (err: any) {
            console.error("Quiz error", err);
            setQuizModalOpen(false);
        } finally {
            setQuizLoading(false);
        }
    };

    const explainWithAi = async (text: string) => {
        if (!checkAuthForFeature('translation')) return;
        if (videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
        setAiModalOpen(true);
        setIsAiLoading(true);
        setAiExplanation('');

        try {
            const res = await postAiWithRetry({
                contents: [{ parts: [{ text: `You are an expert English-to-Kurdish translator and grammar teacher. Analyze this sentence for a Kurdish student.
Task:
1. Exact Meaning (مانای ڕستەکە بە کوردی).
2. Word-by-Word Translation (شیکردنەوەی وشە بە وشە).
3. Grammar/Context (ڕێزمان و مەبەست).

Format exactly like this using emojis:
📌 مانای ڕستەکە: (Translation here)
📝 وشە بە وشە: (Word1: Meaning1, Word2: Meaning2, ...)
💡 ڕێزمان و مەبەست: (Detailed grammar explanation here)

CRITICAL RULE: The entire explanation MUST be in Kurdish Sorani using the Arabic alphabet. Do not use Markdown formatting symbols like # or **.

Sentence: "${text}"` }] }],
                aiTask: 'sentence_translation'
            });
            const expl = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'وەڵامێک نەهات.';
            setAiExplanation(expl);
            if (res.data.remainingCredits !== undefined) {
                updateCredits(res.data.remainingCredits);
            }
        } catch (err: any) {
            if (err?.message === 'AI request already in progress') {
                setAiExplanation('تکایە چاوەڕێ بکە، داواکارییەکی AI هەنووکە بەڕێوەدەچێت.');
            } else {
                setAiExplanation(extractApiError(err, 'هەڵەیەک ڕوویدا لە پەیوەندیکردن بە AI.'));
            }
        } finally {
            setIsAiLoading(false);
        }
    };

    // Language Practice
    type PracticePhase = 'reading' | 'listening' | 'recording' | 'scoring';
    const [practiceActive, setPracticeActive] = useState(false);
    const [practiceText, setPracticeText] = useState('');
    const [practicePhase, setPracticePhase] = useState<PracticePhase>('reading');
    const [practiceScore, setPracticeScore] = useState(0);
    const [spokenText, setSpokenText] = useState('');
    const [strictMode, setStrictMode] = useState(false);
    const [speechConfidence, setSpeechConfidence] = useState(1);
    
    // AI Pronunciation Feedback & Interactive Sentence Diff
    interface SentenceWordDiff {
        word: string;
        clean: string;
        status: 'correct' | 'mistake';
        spokenMatch?: string;
    }

    const [aiPronunciationFeedback, setAiPronunciationFeedback] = useState('');
    const [isAiFeedbackLoading, setIsAiFeedbackLoading] = useState(false);
    const [sentenceDiff, setSentenceDiff] = useState<SentenceWordDiff[]>([]);
    const [selectedMistakeWord, setSelectedMistakeWord] = useState<SentenceWordDiff | null>(null);

    const computeSentenceDiff = (spoken: string, target: string): SentenceWordDiff[] => {
        const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const spW = norm(spoken).split(/\s+/).filter(Boolean);
        const tgRawWords = target.split(/\s+/).filter(Boolean);
        
        const spUsed = new Set<number>();
        const diff: SentenceWordDiff[] = [];

        tgRawWords.forEach((rawWord, idx) => {
            const clean = norm(rawWord);
            const matchIdx = spW.findIndex((sw, i) => !spUsed.has(i) && sw === clean);
            if (matchIdx !== -1) {
                spUsed.add(matchIdx);
                diff.push({ word: rawWord, clean, status: 'correct' });
            } else {
                const spokenCandidate = spW[idx] || (spW.find((_, i) => !spUsed.has(i)) || '');
                diff.push({ word: rawWord, clean, status: 'mistake', spokenMatch: spokenCandidate });
            }
        });

        return diff;
    };

    const getAiPronunciationFeedback = async (targetWord?: string, spokenWord?: string) => {
        setIsAiFeedbackLoading(true);
        setAiPronunciationFeedback('');

        const allMistakes = sentenceDiff.filter(d => d.status === 'mistake');
        const isMultiWord = !targetWord && allMistakes.length > 1;

        let promptText = '';
        if (isMultiWord) {
            const mistakeList = allMistakes.map(m => `"${m.word}" (student said: "${m.spokenMatch || 'unclear'}")`).join(', ');
            promptText = `You are an expert, very concise English pronunciation coach for Kurdish students.
The student tried to say the sentence: "${practiceText}".
They mispronounced these ${allMistakes.length} words: ${mistakeList}.

For EACH of these ${allMistakes.length} words, provide a very concise, easy 1-line Kurdish pronunciation tip in Sorani Kurdish (Arabic alphabet only):
Format for each word:
📌 [Word in English] ([Kurdish phonetic reading]): [Direct 1-sentence tip on mouth/tongue/stress]

Example format:
📌 Found (فاوند): دەنگی "او" لە ناوەڕاستدا ڕوون بکەرەوە و دەنگی "د"ی کۆتایی تەواو بدە.
📌 hiding (هایدینگ): لە "های" دەست پێبکە، دەنگی "دینگ" بە نەرمی دەرببڕە.

CRITICAL RULES:
- Do NOT translate the meanings.
- Write ONLY in Sorani Kurdish using Arabic alphabet. No Latin characters.
- Keep each line super short and crystal clear.`;
        } else {
            const targetPhrase = targetWord || (selectedMistakeWord ? selectedMistakeWord.word : practiceText);
            const heardPhrase = spokenWord || (selectedMistakeWord ? (selectedMistakeWord.spokenMatch || spokenText) : spokenText);

            promptText = `You are an expert English pronunciation coach for Kurdish students.
The student tried to say the sentence: "${practiceText}".
Specifically for the word: "${targetPhrase}" (heard as: "${heardPhrase}").

Explain in Sorani Kurdish (Arabic alphabet only) in 2 simple and clear lines:
1. 🗣️ شێوازی خوێندنەوە: (e.g. فاوند / FAW-ND)
2. 💡 تێبینی دەم و زمان: (Very short and easy tip on mouth/tongue position).

CRITICAL RULES:
- Do NOT translate the meaning.
- Write ONLY in Sorani Kurdish using Arabic alphabet.
- Keep it concise, friendly, and easy to understand for beginners.`;
        }

        try {
            const res = await postAiWithRetry({
                contents: [{ parts: [{ text: promptText }] }],
                aiTask: 'voice_correction'
            });
            const expl = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'وەڵامێک نەهات.';
            const cleanedExpl = expl.replace(/[\#\*]/g, '').trim();
            setAiPronunciationFeedback(cleanedExpl);
            if (res.data.remainingCredits !== undefined) {
                updateCredits(res.data.remainingCredits);
            }
        } catch (err: any) {
            if (err?.message === 'AI request already in progress') {
                setAiPronunciationFeedback('تکایە چاوەڕێ بکە، داواکارییەکی AI هەنووکە بەڕێوەدەچێت.');
            } else {
                setAiPronunciationFeedback(extractApiError(err, 'هەڵەیەک ڕوویدا لە کاتی شیکارکردندا.'));
            }
        } finally {
            setIsAiFeedbackLoading(false);
        }
    };

    const calcScore = (spoken: string, target: string, confidence: number, isStrict: boolean): number => {
        const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const spW = norm(spoken).split(/\s+/).filter(Boolean);
        const tgW = norm(target).split(/\s+/).filter(Boolean);
        if (!tgW.length) return 0;
        if (!spW.length) return 0;

        let hits = 0;
        const spUsed = new Set();

        for (const tw of tgW) {
            const idx = spW.findIndex((sw, i) => !spUsed.has(i) && sw === tw);
            if (idx !== -1) {
                hits++;
                spUsed.add(idx);
            }
        }

        const targetMatch = hits / tgW.length;
        const extraPenalty = Math.max(0, spW.length - hits) * 0.05; // 5% penalty per extra wrong word
        let score = (targetMatch - extraPenalty) * 100;

        if (isStrict) {
            score = score * confidence;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    };

    const doListen = (target: string) => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            alert('برۆزەرەکەت speech recognition پشتگیری ناکات. تکایە Chrome یان Edge بەکاربهێنە. تێبینی: ئەم تایبەتمەندییە پێویستی بە HTTPS هەیە ئەگەر لەسەر سێرڤەر بێت.');
            setPracticePhase('scoring');
            setPracticeScore(0);
            return;
        }

        try {
            setPracticePhase('recording');
            const r = new SR();
            r.lang = movie?.language?.includes('English') ? 'en-US' : (movie?.language?.includes('Arabic') ? 'ar-SA' : 'en-US');
            r.continuous = false;
            r.interimResults = false;
            r.maxAlternatives = 1;

            r.onresult = (e: any) => {
                const spoken = e.results[0][0].transcript || '';
                const conf = e.results[0][0].confidence || 1;
                setSpokenText(spoken);
                setSpeechConfidence(conf);
                const score = calcScore(spoken, target, conf, strictMode);
                setPracticeScore(score);

                const diff = computeSentenceDiff(spoken, target);
                setSentenceDiff(diff);
                const firstMistake = diff.find(d => d.status === 'mistake') || null;
                setSelectedMistakeWord(firstMistake);
                setAiPronunciationFeedback('');

                setPracticePhase('scoring');
                
                if (score >= 80) syncProgress({ points: 10 });
            };

            r.onerror = (e: any) => {
                console.warn('SR error', e.error);
                let msg = 'هەڵەیەک ڕوویدا لە کاتی ناسینەوەی دەنگدا.';
                if (e.error === 'not-allowed') {
                    msg = 'مایکرۆفۆنەکەت دەستەگیرێنراو نییە (Blocked). تکایە لە سێتینگسی برۆزەرەکەت ڕێگەی پێ بدە.';
                } else if (e.error === 'network') {
                    msg = 'کێشەی پەیوەندی بە سێرڤەری دەنگی Google هەیە. دڵنیابەرەوە ئینتەرنێتەکەت کار دەکات یان برۆزەری Microsoft Edge تاقی بکەرەوە.';
                } else if (e.error === 'no-speech') {
                    msg = 'هیچ دەنگێک نەبیسترا. تکایە کەمێک بەرزتر قسە بکە.';
                }
                alert(msg);
                setPracticePhase('listening');
            };

            r.onnomatch = () => { 
                setPracticePhase('listening'); 
            };

            r.start();
            recognitionRef.current = r;
        } catch (err) {
            console.error('Speech recognition failed to start:', err);
            alert('نەتوانرا مایکرۆفۆنەکە چالاک بکرێت.');
            setPracticePhase('listening');
        }
    };

    const doTTS = (text: string, onDone: () => void) => {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 0.85;
        utt.pitch = 1;
        utt.onend = onDone;
        utt.onerror = onDone;
        window.speechSynthesis.speak(utt);
    };

    const startPractice = (text: string) => {
        if (!text) return;
        if (!checkAuthForFeature('pronunciation')) return;
        videoRef.current?.pause();
        setPracticeText(text);
        setPracticeActive(true);
        setPracticePhase('reading');
        setSpokenText('');
        setPracticeScore(0);
        setAiPronunciationFeedback('');
        // Read aloud, then show "ready to record" button
        doTTS(text, () => setPracticePhase('listening'));
    };

    const closePractice = () => {
        window.speechSynthesis.cancel();
        recognitionRef.current?.abort?.();
        recognitionRef.current?.stop?.();
        setPracticeActive(false);
        setPracticePhase('reading');
        setAiPronunciationFeedback('');
        videoRef.current?.play();
    };

    const retryPractice = () => {
        window.speechSynthesis.cancel();
        recognitionRef.current?.abort?.();
        recognitionRef.current?.stop?.();
        // Reset without the practiceActive guard
        setPracticePhase('reading');
        setSpokenText('');
        setAiPronunciationFeedback('');
        setPracticeScore(0);
        doTTS(practiceText, () => setPracticePhase('listening'));
    };

    const getCurrentVideoFileName = () => {
        if (!movie) return null;
        if (episodeNum > 0) {
            const season = movie.seasons?.find(s => s.number === seasonNum);
            const episode = season?.episodes.find(e => e.number === episodeNum);
            return episode?.videoFile || null;
        }
        return movie.videoFile || null;
    };

    const getStreamUrl = (startTime = 0) => {
        if (!movie) return null;
        let url = '';
        let version = 0;

        // If user explicitly chose a specific quality (1080, 720, 480, 360) and not Auto (-1)
        if (currentQuality > 0) {
            url = `/api/stream/${id}?quality=${currentQuality}`;
            if (seasonNum > 0 && episodeNum > 0) {
                url += `&s=${seasonNum}&e=${episodeNum}`;
            }
            if (startTime > 0) {
                url += `&start=${startTime}`;
            }
            return url;
        }

        if (episodeNum > 0) {
            const season = movie.seasons?.find(s => s.number === seasonNum);
            const episode = season?.episodes.find(e => e.number === episodeNum);
            if (!episode) return null;
            if (episode.videoUrl) {
                url = episode.videoUrl;
                version = episode.videoUpdatedAt || 0;
            } else if (episode.videoFile) {
                url = `/api/stream/${id}?s=${seasonNum}&e=${episodeNum}`;
                version = episode.videoUpdatedAt || 0;
            }
        } else {
            if (movie.videoUrl) {
                url = movie.videoUrl;
                version = movie.videoUpdatedAt || 0;
            } else if (movie.videoFile) {
                url = `/api/stream/${id}`;
                version = movie.videoUpdatedAt || 0;
            }
        }

        if (!url) return null;

        if (version > 0) {
            url += `${url.includes('?') ? '&' : '?'}v=${version}`;
        }

        if (isTranscodedStream) {
            url += `${url.includes('?') ? '&' : '?'}transcode=mp4`;
            if (startTime > 0) {
                url += `&start=${startTime}`;
            }
        }
        return url;
    };

    useEffect(() => {
    }, [streamStartTime, isTranscodedStream, id, seasonNum, episodeNum]);

    const loadSubtitles = async (origUrl: string | null, transUrl: string | null) => {
        if (origUrl) {
            try { const r = await axios.get(origUrl); setOriginalSubs(parseSRT(r.data)); }
            catch { setOriginalSubs([]); }
        }
        if (transUrl) {
            try { const r = await axios.get(transUrl); setTranslatedSubs(parseSRT(r.data)); }
            catch { setTranslatedSubs([]); }
        }
    };

    useEffect(() => {
        if (!id) return;
        const clientId = sessionStorage.getItem('stream_client_id') || ('client_' + Math.random().toString(36).slice(2));
        sessionStorage.setItem('stream_client_id', clientId);

        // Initial heartbeat ping
        axios.post(`/api/movies/${id}/heartbeat`, { clientId }).catch(() => {});

        // Ping every 15s while active
        const heartbeatTimer = setInterval(() => {
            axios.post(`/api/movies/${id}/heartbeat`, { clientId }).catch(() => {});
        }, 15000);

        const handleLeave = () => {
            axios.post(`/api/movies/${id}/leave`, { clientId }).catch(() => {});
        };

        window.addEventListener('beforeunload', handleLeave);

        return () => {
            clearInterval(heartbeatTimer);
            window.removeEventListener('beforeunload', handleLeave);
            handleLeave();
        };
    }, [id]);

    useEffect(() => {
        axios.get(`/api/movies/${id}`).then(async res => {
            const m: Movie = res.data;
            setMovie(m);
            if (episodeNum > 0 && m.seasons) {
                const season = m.seasons.find(s => s.number === seasonNum);
                const episode = season?.episodes.find(e => e.number === episodeNum);
                if (episode) {
                    setActiveEpisode(episode);
                    setEpisodeTitle(`${season?.title || `سیزنی ${seasonNum}`} - ئالقەی ${episodeNum}: ${episode.title}`);
                    setSensitiveScenes(episode.sensitiveScenes || []);
                    await loadSubtitles(
                        episode.originalSrt ? `/api/subtitle/${id}?s=${seasonNum}&e=${episodeNum}&type=original` : null,
                        episode.translatedSrt ? `/api/subtitle/${id}?s=${seasonNum}&e=${episodeNum}&type=translated` : null
                    );
                }
            } else {
                setSensitiveScenes(m.sensitiveScenes || []);
                await loadSubtitles(
                    m.originalSrt ? `/api/subtitle/${id}/original` : null,
                    m.translatedSrt ? `/api/subtitle/${id}/translated` : null
                );
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [id, seasonNum, episodeNum]);

    useEffect(() => {
        const adjustDelay = (delta: number) => {
            setSubDelay(prev => {
                const next = Math.round((prev + delta) * 10) / 10;
                setSyncBadgeVisible(true);
                if (syncBadgeTimerRef.current) clearTimeout(syncBadgeTimerRef.current);
                syncBadgeTimerRef.current = setTimeout(() => setSyncBadgeVisible(false), 1800);
                return next;
            });
        };

        const adjustVolume = (delta: number) => {
            const v = videoRef.current;
            if (!v) return;
            const next = Math.min(1, Math.max(0, Math.round((v.volume + delta) * 10) / 10));
            v.volume = next;
            setVolume(next);
            if (next > 0) { v.muted = false; setIsMuted(false); }
        };

        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;
            switch (e.key) {
                case ' ': case 'k': e.preventDefault(); togglePlay(); break;
                case '>': case '.': case 'ArrowRight': e.preventDefault(); skip(10); break;
                case '<': case ',': case 'ArrowLeft': e.preventDefault(); skip(-10); break;
                case 'ArrowUp': e.preventDefault(); adjustVolume(+0.1); break;
                case 'ArrowDown': e.preventDefault(); adjustVolume(-0.1); break;
                case 'm': toggleMute(); break;
                case 'f': toggleFullscreen(); break;
                case 'Escape': if (showSettings) { setShowSettings(false); } break;
                case '[': adjustDelay(-0.5); break;
                case ']': adjustDelay(+0.5); break;
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isPlaying, isMuted, subDelay, volume]);

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const resetControlsTimer = useCallback(() => {
        setShowControls(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
    const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTouchEventTimeRef = useRef(0);

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) { 
            v.play().catch(() => {}); 
            setIsPlaying(true); 
            setPlayPauseIndicator('play');
            setTimeout(() => setPlayPauseIndicator(null), 550);
        } else { 
            v.pause(); 
            setIsPlaying(false); 
            setPlayPauseIndicator('pause');
            setTimeout(() => setPlayPauseIndicator(null), 550);
        }
    };

    const skip = (s: number) => {
        const baseTime = isTranscodedStream ? (pendingSeekRef.current ?? currentTime) : currentTime;
        commitSeek(baseTime + s, { delayMs: isTranscodedStream ? 400 : 0 });
        setSkipIndicator(s > 0 ? 'forward' : 'backward');
        setTimeout(() => setSkipIndicator(null), 600);
    };

    // Close settings menu when clicking outside
    useEffect(() => {
        if (!showSettings) return;
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.modern-settings-menu') || target.closest('.ctrl-btn') || target.closest('.quick-pill-badge')) {
                return;
            }
            setShowSettings(false);
        };
        window.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('touchstart', handleClickOutside);
        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showSettings]);

    const handlePlayerClick = (e: React.MouseEvent) => {
        // Ignore synthetic mouse click fired right after a touch event
        if (Date.now() - lastTouchEventTimeRef.current < 450) {
            return;
        }
        if (showSettings) {
            setShowSettings(false);
            return;
        }
        togglePlay();
        setShowControls(true);
        resetControlsTimer();
    };

    const handlePlayerTouchEnd = (e: React.TouchEvent) => {
        lastTouchEventTimeRef.current = Date.now();
        if (showSettings) {
            setShowSettings(false);
            return;
        }

        const touch = e.changedTouches?.[0] || e.touches?.[0];
        if (!touch) return;

        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || window.innerWidth;
        const xOffset = touch.clientX - (rect?.left || 0);
        const xRatio = width > 0 ? xOffset / width : 0.5;
        const now = Date.now();

        // 1. Double tap check on side zones
        const timeDiff = now - lastTapRef.current.time;
        const distDiff = Math.abs(touch.clientX - lastTapRef.current.x);

        if (timeDiff < 320 && distDiff < 100) {
            if (singleTapTimerRef.current) {
                clearTimeout(singleTapTimerRef.current);
                singleTapTimerRef.current = null;
            }
            if (xRatio < 0.28) {
                skip(-10);
            } else if (xRatio > 0.72) {
                skip(10);
            } else {
                togglePlay();
            }
            lastTapRef.current = { time: 0, x: 0 };
            setShowControls(true);
            resetControlsTimer();
            return;
        }

        lastTapRef.current = { time: now, x: touch.clientX };

        // 2. Middle zone (28% to 72%): Instant 1-tap play/pause without any delay!
        if (xRatio >= 0.28 && xRatio <= 0.72) {
            if (singleTapTimerRef.current) {
                clearTimeout(singleTapTimerRef.current);
                singleTapTimerRef.current = null;
            }
            togglePlay();
            setShowControls(true);
            resetControlsTimer();
        } else {
            // 3. Side zones: single tap toggles controls visibility
            if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = setTimeout(() => {
                setShowControls(prev => !prev);
                resetControlsTimer();
                singleTapTimerRef.current = null;
            }, 250);
        }
    };

    const toggleMute = () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = +e.target.value;
        setVolume(val);
        if (videoRef.current) videoRef.current.volume = val;
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) containerRef.current.requestFullscreen();
        else document.exitFullscreen();
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const t = +e.target.value;
        if (!isFinite(t)) return;
        pendingSeekRef.current = t;
        isScrubbingRef.current = true;
        setCurrentTime(t);
    };

    const finishSeek = () => {
        if (pendingSeekRef.current === null) return;
        isScrubbingRef.current = false;
        commitSeek(pendingSeekRef.current);
    };

    const handleTimeUpdate = () => {
        const v = videoRef.current;
        if (!v || !isFinite(v.currentTime) || isScrubbingRef.current || pendingSeekRef.current !== null) return;
        
        // If we are using a stream offset, the actual movie time is offset + video time
        const currentT = streamStartTime + v.currentTime;
        if (!isFinite(currentT)) return;
        
        const diff = currentT - lastVideoTimeRef.current;
        
        // Track watch time based on normal playback (not seeking)
        if (diff > 0 && diff < 1.5) { // 1.5 allows for normal fast playback
            accumulatedSecondsRef.current += diff;
            totalAccumulatedSecondsRef.current += diff;
            
            if (accumulatedSecondsRef.current >= 60) {
                accumulatedSecondsRef.current -= 60; // Keep the remainder
                if (user) {
                    syncProgress({ watchMinutes: 1 }).catch(() => {});
                }
            }
            
            // NOTE: Quiz is now seamlessly presented at the end of the movie/episode!

            // Report retention stats every 5 minutes (300 seconds)
            // or when hitting major milestones (25%, 50%, 75%, 100%)
            const currentPercent = effectiveDuration > 0 ? Math.floor((currentT / effectiveDuration) * 100) : 0;
            const brackets = [15, 50, 75, 100];
            const currentBracket = brackets.reverse().find(b => currentPercent >= b) || 0;
            
            if (currentBracket > lastReportedPercentRef.current) {
                lastReportedPercentRef.current = currentBracket;
                axios.post(`/api/movies/${id}/retention`, { percent: currentBracket }).catch(() => {});
            }
        }
        lastVideoTimeRef.current = currentT;

        setCurrentTime(currentT);
        if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
        
        // Save progress locally every 5 seconds
        if (currentT > 10) {
            const rounded = Math.floor(currentT);
            // Only write to localStorage and sync if it actually changed to a new 5/15 second mark
            if (rounded % 5 === 0 && localStorage.getItem(progressKey) !== String(rounded)) {
                localStorage.setItem(progressKey, String(rounded));
            }
            
            // Sync with backend every 15 seconds
            // To prevent spamming, we check if it exactly hit the multiple and we haven't synced this second yet
            // The frontend sends history.
            if (rounded % 15 === 0 && localStorage.getItem(progressKey + '_synced') !== String(rounded) && user) {
                localStorage.setItem(progressKey + '_synced', String(rounded));
                const hKey = `${id}_s${seasonNum}_e${episodeNum}`;
                const title = episodeNum > 0 ? episodeTitle : movie?.title || 'Unknown';
                syncProgress({ history: { [hKey]: { time: rounded, title, date: new Date().toISOString() } } });
            }
        }
    };

    // Removed moved logic from here
    const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;
    const bufferedPercent = effectiveDuration > 0 ? (buffered / effectiveDuration) * 100 : 0;
    const adjTime = currentTime - subDelay;

    const currentOrigIndex = useMemo(
        () => originalSubs.findIndex(s => adjTime >= s.start && adjTime <= s.end),
        [originalSubs, adjTime]
    );

    const currentOrigSub = currentOrigIndex !== -1 ? originalSubs[currentOrigIndex] : undefined;

    const currentTransSub = useMemo(() => {
        const byTime = translatedSubs.find(s => adjTime >= s.start && adjTime <= s.end);
        if (byTime) return byTime;
        if (currentOrigSub) {
            return translatedSubs.find(s => s.id === currentOrigSub.id);
        }
        return undefined;
    }, [translatedSubs, adjTime, currentOrigSub]);

    // Track sentences seen
    useEffect(() => {
        if (currentOrigSub && currentOrigSub.id !== lastSeenSubIdRef.current) {
            lastSeenSubIdRef.current = currentOrigSub.id;
            setSessionSentences(prev => {
                const newCount = prev + 1;
                // Sync every 5 sentences to avoid spamming the backend
                if (newCount % 5 === 0 && user) {
                    syncProgress({ sentencesSeen: 5 }).catch(err => console.error('Error syncing sentences:', err));
                }
                return newCount;
            });
        }
    }, [currentOrigSub, user]);

    const backTo = () => {
        if (episodeNum > 0) navigate(`/series/${id}`);
        else navigate('/');
    };

    // Next episode logic
    const nextEpisode = (() => {
        if (!movie || episodeNum <= 0 || !movie.seasons) return null;
        const season = movie.seasons.find(s => s.number === seasonNum);
        if (!season) return null;
        const nextInSeason = season.episodes.find(e => e.number === episodeNum + 1);
        if (nextInSeason) return { s: seasonNum, e: nextInSeason.number, newSeason: false };
        const nextSeason = movie.seasons.find(s => s.number === seasonNum + 1);
        if (nextSeason && nextSeason.episodes.length > 0) {
            return { s: nextSeason.number, e: nextSeason.episodes[0].number, newSeason: true };
        }
        return null;
    })();

    const goToNext = () => {
        if (!nextEpisode) return;
        navigate(`/watch/${id}?s=${nextEpisode.s}&e=${nextEpisode.e}`);
    };

    const getHighlightedWordData = (word: string) => {
        const clean = word.toLowerCase().replace(/[^\w]/g, '');
        if (!clean) return null;

        // 1. Check User's Saved Flashcards (Highest SRS Priority)
        if (savedFlashcardsMap.has(clean)) {
            const card = savedFlashcardsMap.get(clean)!;
            return {
                type: 'flashcard' as const,
                meaning: card.back,
                word: card.front,
                cardMeta: card
            };
        }

        const metrics = activeEpisode?.languageMetrics || movie?.languageMetrics;
        if (!metrics) return null;

        // 2. Check repeated words for meaning
        const repeated = metrics.repeatedWords?.find((rw: RepeatedWord) => {
            const variants = rw.word.toLowerCase().split('/').map((v: string) => v.trim().replace(/[^\w]/g, ''));
            return variants.includes(clean);
        });
        if (repeated) return { type: 'repeated' as const, meaning: repeated.meaning, word: repeated.word };

        // 3. Check difficult words
        const difficult = metrics.difficultWords?.find((dw: DifficultWord) => {
            return dw.word.toLowerCase().replace(/[^\w]/g, '') === clean;
        });
        if (difficult) return { type: 'difficult' as const, meaning: difficult.definition, word: difficult.word };

        return null;
    };

    const handleWordClick = (e: React.MouseEvent, word: string) => {
        e.stopPropagation();
        if (!checkAuthForFeature('translation')) return;
        const highlight = getHighlightedWordData(word);
        
        if (highlight && highlight.meaning) {
            // If we have a saved meaning, show it directly in the lookup modal
            if (videoRef.current) videoRef.current.pause();
            setIsPlaying(false);
            setWordLookupModalOpen(true);
            setIsWordLookupLoading(false);
            setWordLookupData({ 
                word: highlight.word, 
                translation: highlight.meaning,
                isFlashcard: highlight.type === 'flashcard',
                cardMeta: (highlight as any).cardMeta,
                clickedWord: word
            });
        } else {
            // Otherwise use AI lookup
            lookupWordWithAi(word);
        }
    };

    const isSensitiveNow = familyMode && sensitiveScenes.some(s => currentTime >= s.start && currentTime <= s.end);
    const effectiveStreamUrl = getStreamUrl(streamStartTime);

    useEffect(() => {
        ignoreVideoErrorUntilRef.current = Date.now() + 2000;
        setDuration(0);
        setCurrentTime(0);
        setBuffered(0);
        setResumePrompt(null);
        setVideoLoadError('');
    }, [effectiveStreamUrl]);

    // HLS.js Player Integration
    useEffect(() => {
        const video = videoRef.current;
        if (!effectiveStreamUrl || !video) return;

        const isHls = effectiveStreamUrl.includes('.m3u8') || effectiveStreamUrl.includes('/hls/');
        let hlsInstance: Hls | null = null;

        if (isHls) {
            if (Hls.isSupported()) {
                hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true
                });
                hlsRef.current = hlsInstance;
                hlsInstance.loadSource(effectiveStreamUrl);
                hlsInstance.attachMedia(video);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                    if (Array.isArray(data.levels) && data.levels.length > 0) {
                        const parsedLevels = data.levels.map((lvl, index) => ({
                            id: index,
                            label: lvl.height ? `${lvl.height}p` : `کواڵێتی ${index + 1}`
                        }));
                        setQualityLevels([{ id: -1, label: 'خۆکار (Auto)' }, ...parsedLevels]);
                    }
                    video.play().catch(() => {});
                });
                hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
                    if (hlsInstance && hlsInstance.levels && hlsInstance.levels[data.level]) {
                        const lvl = hlsInstance.levels[data.level];
                        if (lvl.height) {
                            setAutoDetectedHeight(lvl.height);
                        }
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = effectiveStreamUrl;
            }
        } else {
            hlsRef.current = null;
            setAutoDetectedHeight(null);
        }

        return () => {
            if (hlsInstance) {
                hlsInstance.destroy();
                hlsRef.current = null;
            }
        };
    }, [effectiveStreamUrl]);

    if (loading) return (<div className="watch-loading"><div className="loading-spinner" /></div>);
    if (!movie) return (
        <div className="watch-error">
            <p>{t('movie_not_found')}</p>
            <button onClick={() => navigate('/')} className="back-btn-err">
                <ArrowRight size={16} /> {t('back')}
            </button>
        </div>
    );

    return (
        <div
            className="watch-container"
            ref={containerRef}
            onMouseMove={resetControlsTimer}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            onTouchStart={resetControlsTimer}
            onTouchMove={resetControlsTimer}
        >
            {/* GLOBAL TOASTS */}
            <div className="global-toast-container">
                {globalToasts.map(t => (
                    <div key={t.id} className={`global-toast global-toast-${t.type}`}>
                        {t.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                        {t.msg}
                    </div>
                ))}
            </div>

            {/* VIDEO */}
            <video
                key={effectiveStreamUrl || 'no-stream'}
                ref={videoRef}
                src={effectiveStreamUrl || undefined}
                className={`watch-video ${isSensitiveNow ? 'blur-video' : ''} aspect-${aspectRatio} ${isFlipped ? 'video-flipped' : ''}`}
                autoPlay
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={e => {
                    setVideoLoadError('');
                    ignoreVideoErrorUntilRef.current = 0;
                    const v = e.currentTarget;
                    setDuration(v.duration);
                    
                    // Detect true video resolution
                    const realHeight = v.videoHeight || 720;
                    setAutoDetectedHeight(realHeight);
                    
                    const dynamicLevels = [
                        { id: -1, label: lang === 'en' ? `Auto (${realHeight}p)` : `خۆکار (Auto - ${realHeight}p)` },
                        ...(realHeight >= 1000 ? [{ id: 1080, label: '1080p (Full HD)' }] : []),
                        ...(realHeight >= 650 ? [{ id: 720, label: '720p (HD)' }] : []),
                        { id: 480, label: '480p (SD)' },
                        { id: 360, label: lang === 'en' ? '360p (Data Saver)' : '360p (کەم بەکارهێنانی ئینتەرنێت)' }
                    ];
                    setQualityLevels(dynamicLevels);

                    // If quality was switched or stream sought, resume smoothly at exact position
                    if (pendingSeekRef.current !== null && pendingSeekRef.current > 0) {
                        const targetTime = pendingSeekRef.current;
                        pendingSeekRef.current = null;
                        v.currentTime = targetTime;
                        setCurrentTime(targetTime);
                        v.play().then(() => setIsPlaying(true)).catch(() => { });
                        return;
                    }

                    // If we just sought in a transcoded stream, don't reset currentTime to 0
                    if (streamStartTime > 0) {
                        setCurrentTime(streamStartTime);
                        v.play().then(() => setIsPlaying(true)).catch(() => { });
                        return;
                    }

                    setCurrentTime(0);
                    // Check for saved resume position (local or backend)
                    const hKey = `${id}_s${seasonNum}_e${episodeNum}`;
                    const localSaved = localStorage.getItem(progressKey);
                    const backendSaved = user?.history?.[hKey]?.time;
                    const t = parseInt(localSaved || '0') || backendSaved || 0;
                    
                    if (t > 30 && t < (effectiveDuration || v.duration) - 30) {
                        setResumePrompt(t);
                        v.pause();
                        return;
                    }
                    v.play().then(() => setIsPlaying(true)).catch(() => { });
                }}
                onPlay={() => { setIsPlaying(true); resetControlsTimer(); }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                    localStorage.removeItem(progressKey); // clear progress when done
                    triggerCompletionFlow();
                }}
                onError={() => {
                    if (Date.now() < ignoreVideoErrorUntilRef.current) return;
                    setVideoLoadError(lang === 'en' ? 'Video stream not found or file error.' : 'ڤیدیۆکە لەسەر سێرڤەر نەدۆزرایەوە یان فایلەکە کێشەی هەیە.');
                }}
            />

            {/* FULLSCREEN TOUCH / CLICK CATCHER OVERLAY */}
            <div 
                className="video-click-overlay" 
                onClick={handlePlayerClick} 
                onTouchEnd={handlePlayerTouchEnd} 
            />

            {(!effectiveStreamUrl || videoLoadError) && (
                <div className="sensitive-overlay">
                    <Shield size={64} className="sensitive-icon" />
                    <h2>{lang === 'en' ? 'Video Not Available' : 'ڤیدیۆ بەردەست نییە'}</h2>
                    <p>
                        {mkvUnsupported
                            ? (lang === 'en' ? 'This video is in .mkv format and is being converted to .mp4 for browser support.' : 'ئەم ڤیدیۆیە .mkv ـە. ئێستا بە شێوەی خۆکار بۆ mp4 دەگۆڕدرێت بۆ پشتیوانی بروەزەر.')
                            : (videoLoadError || (lang === 'en' ? 'No video stream uploaded yet for this episode/movie.' : 'بۆ ئەم ئالقە/فیلمە هێشتا ڤیدیۆ دانەنراوە.'))}
                    </p>
                </div>
            )}

            {isSensitiveNow && (
                <div className="sensitive-overlay">
                    <Shield size={64} className="sensitive-icon" />
                    <h2>{lang === 'en' ? 'Sensitive Scene Blurred' : 'دیمەنی نەشیاو شاردراوەتەوە'}</h2>
                </div>
            )}
            {/* CENTER PLAY/PAUSE FLASH RIPPLE ANIMATION */}
            {playPauseIndicator && (
                <div key={Date.now()} className="center-play-pause-ripple">
                    <div className="ripple-icon-circle">
                        {playPauseIndicator === 'play' ? (
                            <Play size={44} fill="#ffffff" color="#ffffff" style={{ marginLeft: '4px' }} />
                        ) : (
                            <Pause size={44} fill="#ffffff" color="#ffffff" />
                        )}
                    </div>
                </div>
            )}

            {/* CENTER FLOATING PLAY BUTTON WHEN PAUSED */}
            {!isPlaying && !videoLoadError && effectiveStreamUrl && resumePrompt === null && (
                <div 
                    className="player-center-play-wrapper" 
                    onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                        setShowControls(true);
                        resetControlsTimer();
                    }}
                    onTouchEnd={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        lastTouchEventTimeRef.current = Date.now();
                        togglePlay();
                        setShowControls(true);
                        resetControlsTimer();
                    }}
                >
                    <div className="player-center-play-btn">
                        <Play size={40} fill="#ffffff" color="#ffffff" />
                    </div>
                </div>
            )}

            {/* RESUME PROMPT */}
            {resumePrompt !== null && (
                <div className="resume-prompt">
                    <div className="resume-card">
                        <p className="resume-label">{lang === 'en' ? 'Paused at ' : 'لە '}<strong>{Math.floor(resumePrompt / 60)}:{String(Math.floor(resumePrompt % 60)).padStart(2, '0')}</strong>{lang === 'en' ? '' : ' وەستاندبوویت'}</p>
                        <div className="resume-btns">
                            <button className="resume-btn-yes" onClick={() => {
                                if (videoRef.current) {
                                    const t = resumePrompt || 0;
                                    setCurrentTime(t);
                                    
                                    if (mkvUnsupported) {
                                        setStreamStartTime(t);
                                    } else {
                                        if (videoRef.current) videoRef.current.currentTime = t;
                                    }
                                    videoRef.current.play().then(() => setIsPlaying(true));
                                }
                                setResumePrompt(null);
                            }}>{lang === 'en' ? 'Resume ▶' : 'بەردەوام بە ▶'}</button>
                            <button className="resume-btn-no" onClick={() => {
                                localStorage.removeItem(progressKey);
                                if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                                setResumePrompt(null);
                            }}>{lang === 'en' ? 'Start Over' : 'سەرەتاوە دەستپێبکە'}</button>
                        </div>
                    </div>
                </div>
            )}


            {/* SKIP INDICATOR */}
            {skipIndicator && (
                <div className={`skip-indicator skip-${skipIndicator}`}>
                    {skipIndicator === 'forward' ? <><SkipForward size={28} /> +10</> : <><SkipBack size={28} /> -10</>}
                </div>
            )}

            {/* SUBTITLES */}
            <div 
                className={`subtitle-area ${showControls ? 'with-controls' : ''}`} 
                style={{ 
                    '--sub-pos': `${subtitlePos}px`, 
                    '--trans-fs': `${transFontSize}px`, 
                    '--orig-fs': `${origFontSize}px`,
                    '--sub-bg': computedSubBg,
                    '--sub-border': computedSubBorder,
                    '--sub-backdrop': computedSubBackdrop
                } as React.CSSProperties}
            >
                {showTranslated && currentTransSub && (
                    <div className="subtitle-text subtitle-translated">
                        {currentTransSub.text}
                    </div>
                )}
                {showOriginal && currentOrigSub && (
                    <div
                        className="subtitle-text subtitle-original subtitle-clickable"
                        title={lang === 'en' ? 'Click words to translate or save flashcard' : 'کلیک بکە بۆ فێربونی زمان 🎤 یان سەیڤی فلاشکارتی بکە'}
                    >
                        <div className="sub-actions-row">
                            <span className="sub-practice-btn sub-replay-btn" onClick={(e) => {
                                e.stopPropagation();
                                if (videoRef.current && currentOrigSub) {
                                    const t = currentOrigSub.start;
                                    setCurrentTime(t);

                                    if (mkvUnsupported) {
                                        setStreamStartTime(t);
                                    } else {
                                        if (videoRef.current) videoRef.current.currentTime = t;
                                    }
                                    videoRef.current.play().then(() => setIsPlaying(true));
                                }
                            }} title={lang === 'en' ? 'Replay sentence' : 'دووبارەکردنەوەی ڕستە 🔄'}>
                                <RotateCcw size={14} /> {lang === 'en' ? 'Replay' : 'دووبارە'}
                            </span>
                            <span className="sub-ai-btn" onClick={(e) => { e.stopPropagation(); explainWithAi(currentOrigSub.text); }} title={lang === 'en' ? 'Grammar & Context with AI (3 Credits)' : 'شیکاری ڕێزمان بە AI (٣ کرێدیت) 🤖'}>
                                <Brain size={14} /> {lang === 'en' ? 'AI Explain (3 Credits)' : 'AI شیکاری (٣ کرێدیت)'}
                            </span>
                            <span
                                className="sub-save-btn"
                                onClick={(e) => addToFlashcards(e, currentOrigSub.text, currentTransSub?.text || '', {
                                    cardType: 'subtitle',
                                    quote: currentOrigSub.text,
                                    translatedQuote: currentTransSub?.text || '',
                                    timestamp: currentOrigSub.start,
                                    subtitleId: currentOrigSub.id
                                })}
                                title={lang === 'en' ? 'Add to flashcards' : 'زیادی بکە بۆ فلاش کارتەکان 🃏'}
                            >
                                <BookmarkPlus size={14} /> {lang === 'en' ? 'Card' : 'فلاش کارت'}
                            </span>
                            <span className="sub-practice-btn sub-voice-btn" onClick={() => startPractice(currentOrigSub.text)} title={lang === 'en' ? 'Pronunciation Practice' : 'ڕاهێنانی بێژەکردن 🎤'}>
                                <Mic size={14} /> {lang === 'en' ? 'Practice' : 'فێربوون'}
                            </span>
                        </div>
                        <div className="orig-words-wrap" dir="ltr">
                            {currentOrigSub.text.split(/\s+/).map((word, i, arr) => {
                                const highlightData = getHighlightedWordData(word);
                                const isFlashcard = highlightData?.type === 'flashcard';
                                return (
                                    <React.Fragment key={i}>
                                        <span 
                                            className={`clickable-word ${isFlashcard ? 'flashcard-saved' : highlightData ? 'highlighted' : ''}`}
                                            onClick={(e) => handleWordClick(e, word)}
                                            title={isFlashcard ? (lang === 'en' ? `Saved in Flashcards (Box ${highlightData?.cardMeta?.box || 1}) 🃏` : `لە فلاشکارتەکانتدا پارێزراوە (سندوقی ${highlightData?.cardMeta?.box || 1}) 🃏`) : undefined}
                                        >
                                            {word}
                                            {isFlashcard && <span className="flashcard-dot-indicator">★</span>}
                                        </span>
                                        {i < arr.length - 1 && ' '}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* FLASHCARD TOAST */}
            {flashcardToast && (
                <div className="flashcard-save-toast">
                    <CheckCircle size={16} /> {lang === 'en' ? 'Saved to Flashcards! 🃏' : 'لە فلاش کارت پارێزرا! 🃏'}
                </div>
            )}

            {/* SYNC BADGE - shows on [ ] key press */}
            {syncBadgeVisible && (
                <div className="sync-badge">
                    {lang === 'en' ? 'Subtitle: ' : 'سەبتایتڵ: '}{subDelay > 0 ? '+' : ''}{subDelay.toFixed(1)}s
                    <span className="sync-badge-hint">{lang === 'en' ? 'Use [ ]' : '[ ] بەکاربهێنە'}</span>
                </div>
            )}

            {/* AI EXPLANATION MODAL */}
            {aiModalOpen && (
                <div className="practice-overlay" onClick={() => {
                    setAiModalOpen(false);
                    if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                }}>
                    <div className="practice-card ai-explanation-card" onClick={e => e.stopPropagation()}>
                        <div className="ai-modal-header">
                            <div className="ai-header-left">
                                <span className="ai-tutor-icon-wrap">
                                    <Brain size={20} />
                                </span>
                                <div className="ai-header-titles">
                                    <h3 className="ai-tutor-title">{lang === 'en' ? 'AI Language Tutor' : 'مامۆستای ژیری دەستکرد'}</h3>
                                    <span className="ai-tutor-badge">⚡ ٣ کرێدیت</span>
                                </div>
                            </div>
                            <button className="ai-modal-close-btn" onClick={() => {
                                setAiModalOpen(false);
                                if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                            }} title="Close">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="ai-target-sentence-card" dir="ltr">
                            <p className="target-quote-text">"{currentOrigSub?.text}"</p>
                            <button 
                                className="target-tts-btn" 
                                onClick={(e) => { e.stopPropagation(); doTTS(currentOrigSub?.text || '', () => {}); }}
                                title={lang === 'en' ? 'Listen' : 'گوێگرتن لە ڕستەکە'}
                            >
                                <Volume2 size={16} />
                            </button>
                        </div>

                        {isAiLoading ? (
                            <div className="ai-tutor-loading">
                                <Loader2 size={32} className="spinning" />
                                <p>{lang === 'en' ? 'AI is analyzing grammar & linguistic context...' : 'ژیری دەستکرد سەرقاڵی شیکارکردنی ڕستەکەیە...'}</p>
                            </div>
                        ) : (
                            <div className="ai-unified-box" dir={lang === 'en' ? 'ltr' : 'rtl'}>
                                {aiExplanation.replace(/[\#\*]/g, '').split('\n').filter(l => l.trim()).map((line, i) => {
                                    const match = line.match(/^([📌📝💡🔍🗣️\-\*]\s*[^:：]+[:：])\s*(.*)$/);
                                    if (match) {
                                        return (
                                            <div key={i} className="ai-unified-section">
                                                <div className="ai-tag-badge">{match[1]}</div>
                                                {match[2] && <p className="ai-body-text">{match[2]}</p>}
                                            </div>
                                        );
                                    }
                                    return (
                                        <p key={i} className="ai-unified-p">
                                            {line}
                                        </p>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* WORD LOOKUP MODAL */}
            {wordLookupModalOpen && (
                <div className="practice-overlay" onClick={() => {
                    setWordLookupModalOpen(false);
                    if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                }}>
                    <div className="practice-card word-lookup-card" onClick={e => e.stopPropagation()}>
                        <button className="practice-close" onClick={() => {
                            setWordLookupModalOpen(false);
                            if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                        }}>
                            <X size={18} />
                        </button>
                        
                        {!wordLookupData.isFlashcard && (
                            <div className="word-lookup-header-row">
                                <h3 className="ai-modal-title" style={{ margin: 0, padding: 0, border: 'none' }}><Languages size={22} className="ai-brain-icon" /> {wordLookupData.word}</h3>
                                <span className="word-lookup-credit-badge">
                                    {user?.role === 'super_admin' ? '👑 بێبەرامبەر' : user?.role === 'admin' ? '⚡ ١ کرێدیت' : '⚡ ١ کرێدیت'}
                                </span>
                            </div>
                        )}
                        
                        {isWordLookupLoading ? (
                            <div className="ai-loader">
                                <Loader2 size={32} className="spinning" />
                                <p>{lang === 'en' ? 'Translating...' : 'وەرگێڕان...'}</p>
                            </div>
                        ) : wordLookupData.isFlashcard && wordLookupData.cardMeta ? (
                            <div className={`fc-wb-card ${wordLookupData.cardMeta.isDue ? 'wb-card-due' : ''}`} style={{ width: '100%', marginTop: '5px', textAlign: 'initial' }}>
                                {/* Card Top: Tags & Actions */}
                                <div className="fc-wb-card-header">
                                    <div className="fc-wb-card-tags">
                                        <span className={`fc-box-pill box-pill-${wordLookupData.cardMeta.box}`}>
                                            {lang === 'en' ? `Box ${wordLookupData.cardMeta.box}` : `سندوقی ${wordLookupData.cardMeta.box}`}
                                        </span>
                                        {wordLookupData.cardMeta.sourceLabel && (
                                            <span className="fc-wb-source-pill" title={wordLookupData.cardMeta.sourceLabel}>
                                                🎬 {wordLookupData.cardMeta.sourceLabel}
                                            </span>
                                        )}
                                    </div>

                                    <div className="fc-wb-card-actions">
                                        <button onClick={() => doTTS(wordLookupData.cardMeta!.front, () => {})} title="Listen 🔊"><Volume2 size={16} /></button>
                                        <button onClick={() => { setWordLookupModalOpen(false); navigate('/flashcards'); }} title="Open in Flashcards Deck 🃏"><ExternalLink size={16} /></button>
                                    </div>
                                </div>

                                {/* Card Body: English & Kurdish */}
                                <div className="fc-wb-card-body">
                                    <div className="fc-wb-front" dir="ltr">
                                        {(() => {
                                            const frontText = wordLookupData.cardMeta.front;
                                            const target = (wordLookupData.clickedWord || '').toLowerCase().replace(/[^\w]/g, '');
                                            if (!target) return `"${frontText}"`;
                                            const tokens = frontText.split(/(\s+|[.,!?;:"'—–-]+)/);
                                            return (
                                                <span>
                                                    "
                                                    {tokens.map((tok, idx) => {
                                                        const cleanTok = tok.toLowerCase().replace(/[^\w]/g, '');
                                                        if (cleanTok && cleanTok === target) {
                                                            return (
                                                                <span key={idx} className="card-highlight-active-word">
                                                                    {tok}
                                                                </span>
                                                            );
                                                        }
                                                        return <span key={idx}>{tok}</span>;
                                                    })}
                                                    "
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div className="fc-wb-back" dir="rtl">"{wordLookupData.cardMeta.back}"</div>
                                    {wordLookupData.cardMeta.quote && wordLookupData.cardMeta.quote !== wordLookupData.cardMeta.front && (
                                        <div className="fc-wb-quote" dir="ltr">"{wordLookupData.cardMeta.quote}"</div>
                                    )}
                                </div>

                                {/* Card Footer: Status & Ease */}
                                <div className="fc-wb-card-footer">
                                    <span className={`fc-wb-status-badge ${wordLookupData.cardMeta.isDue ? 'badge-due' : 'badge-learned'}`}>
                                        <span className={`status-dot ${wordLookupData.cardMeta.isDue ? 'dot-due' : 'dot-learned'}`}>●</span>
                                        {wordLookupData.cardMeta.isDue 
                                            ? (lang === 'en' ? 'Due for Review' : 'کاتی پێداچوونەوەیە') 
                                            : (lang === 'en' ? 'Learned' : 'فێربوویت')}
                                    </span>
                                    {wordLookupData.cardMeta.ease && (
                                        <span className="fc-wb-ease">
                                            {lang === 'en' ? 'Ease:' : 'ئاسانی:'} {((wordLookupData.cardMeta.ease / 2.5) * 100).toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="ai-result" dir="rtl" style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                                <p style={{ 
                                    padding: '15px', 
                                    background: 'rgba(255,255,255,0.03)', 
                                    borderRadius: '8px',
                                    marginBottom: '15px'
                                }}>
                                    {wordLookupData.translation}
                                </p>
                                <button 
                                    className="sub-save-btn" 
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                    onClick={(e) => {
                                        addToFlashcards(e, wordLookupData.word, wordLookupData.translation, {
                                            cardType: 'word',
                                            quote: currentOrigSub?.text || wordLookupData.word,
                                            translatedQuote: currentTransSub?.text || '',
                                            timestamp: currentOrigSub?.start ?? currentTime,
                                            subtitleId: currentOrigSub?.id
                                        });
                                        setWordLookupModalOpen(false);
                                        if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                                    }}
                                >
                                    <BookmarkPlus size={18} /> {t('add_to_flashcards')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* POST-MOVIE COMPLETION & QUIZ MODAL */}
            {completionModalOpen && (
                <div className="practice-overlay">
                    <div className="practice-card completion-modal-card">
                        <button className="practice-close" onClick={() => setCompletionModalOpen(false)}>
                            <X size={18} />
                        </button>

                        <div className="completion-trophy-wrap">
                            <Trophy size={46} className="completion-trophy-icon" />
                        </div>

                        <h2 className="completion-title">
                            {lang === 'en' ? '🎉 Congratulations! Completed!' : '🎉 پیرۆزە! فیلمەکە تەواو بوو!'}
                        </h2>

                        <p className="completion-movie-name">
                            {movie?.title} {episodeNum > 0 ? (lang === 'en' ? `(Episode ${episodeNum})` : `(ئەڵقەی ${episodeNum})`) : ''}
                        </p>

                        <div className="completion-xp-pill">
                            <Award size={18} color="#fbbf24" />
                            <span>+50 XP {lang === 'en' ? 'Earned for Watching' : 'بەدەستهێنرا بۆ تەواوکردن 🌟'}</span>
                        </div>

                        <p className="completion-desc">
                            {lang === 'en'
                                ? 'Test your comprehension of words & phrases from this movie with a 3-question quick quiz to win extra +50 XP!'
                                : 'دەتەوێت ۳ پرسیاری تاقیکردنەوەی خێرا لەسەر وشەکانی ئەم فیلمە ئەنجام بدەیت بۆ بردنەوەی 50+ خاڵی XPی زیاتر؟'}
                        </p>

                        <div className="completion-actions">
                            <button className="completion-start-quiz-btn" onClick={generateAndShowQuiz}>
                                <Brain size={20} /> {lang === 'en' ? 'Start Comprehension Quiz (+50 XP)' : 'دەستپێکردنی تاقیکردنەوە (+50 XP) 🎯'}
                            </button>

                            <div className="completion-secondary-row">
                                {nextEpisode ? (
                                    <button className="completion-next-btn" onClick={goToNext}>
                                        <SkipForward size={16} /> {lang === 'en' ? `Next Episode (E${nextEpisode.e})` : `ئەڵقەی دواتر (ئەڵقەی ${nextEpisode.e}) ⏭️`}
                                    </button>
                                ) : (
                                    <button className="completion-home-btn" onClick={() => navigate('/')}>
                                        <Home size={16} /> {lang === 'en' ? 'Back to Home' : 'گەڕانەوە بۆ پەڕەی سەرەکی 🏠'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MINI QUIZ MODAL */}
            {quizModalOpen && (
                <div className="practice-overlay">
                    <div className="practice-card ai-explanation-card">
                        <button className="practice-close" onClick={() => {
                            setQuizModalOpen(false);
                            if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                        }}>
                            <X size={18} />
                        </button>
                        <h3 className="ai-modal-title"><Brain size={24} className="ai-brain-icon" /> {lang === 'en' ? 'Quick Comprehension Quiz' : 'تاقیکردنەوەی تێگەیشتن'}</h3>
                        <div className="ai-explanation-content">
                            {quizLoading ? (
                                <div className="ai-loader">
                                    <Loader2 size={32} className="spinning" />
                                    <p>{lang === 'en' ? 'Generating 3 questions from movie content...' : 'دروستکردنی ٣ پرسیار لە وشەکانی فیلمەکە...'}</p>
                                </div>
                            ) : quizData.length > 0 && quizCurrentQ < quizData.length ? (
                                <div className="quiz-container" dir={lang === 'en' ? 'ltr' : 'rtl'} style={{ textAlign: 'center' }}>
                                    <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px', color: '#f8fafc' }}>{quizData[quizCurrentQ].question}</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {quizData[quizCurrentQ].options.map((opt: string, i: number) => {
                                            const isSelected = quizAnsweredIndex === i;
                                            const isCorrectAnswer = i === quizData[quizCurrentQ].answerIndex;
                                            let bg = 'rgba(255, 255, 255, 0.08)';
                                            let border = '1px solid rgba(255, 255, 255, 0.12)';
                                            let color = '#fff';
                                            let shadow = 'none';

                                            if (quizAnsweredIndex !== null) {
                                                if (isSelected && isCorrectAnswer) {
                                                    bg = '#10b981';
                                                    border = '1px solid #10b981';
                                                    color = '#ffffff';
                                                    shadow = '0 0 15px rgba(16, 185, 129, 0.4)';
                                                } else if (isSelected && !isCorrectAnswer) {
                                                    bg = '#ef4444';
                                                    border = '1px solid #ef4444';
                                                    color = '#ffffff';
                                                    shadow = '0 0 15px rgba(239, 68, 68, 0.4)';
                                                } else if (isCorrectAnswer) {
                                                    bg = 'rgba(16, 185, 129, 0.35)';
                                                    border = '1px solid #10b981';
                                                    color = '#6ee7b7';
                                                } else {
                                                    bg = 'rgba(255, 255, 255, 0.03)';
                                                    border = '1px solid rgba(255, 255, 255, 0.05)';
                                                    color = '#64748b';
                                                }
                                            }

                                            return (
                                                <button 
                                                    key={`${quizCurrentQ}-${i}`}
                                                    disabled={quizAnsweredIndex !== null}
                                                    style={{ 
                                                        padding: '14px 18px', 
                                                        background: bg, 
                                                        border: border, 
                                                        borderRadius: '12px', 
                                                        color: color, 
                                                        boxShadow: shadow,
                                                        fontSize: '15px', 
                                                        fontWeight: 600, 
                                                        cursor: quizAnsweredIndex !== null ? 'default' : 'pointer', 
                                                        transition: 'all 0.2s ease',
                                                        textAlign: 'center'
                                                    }}
                                                    onClick={() => {
                                                        if (quizAnsweredIndex !== null) return;
                                                        setQuizAnsweredIndex(i);
                                                        const isCorrect = i === quizData[quizCurrentQ].answerIndex;
                                                        if (isCorrect) {
                                                            setQuizScore(prev => prev + 1);
                                                        }
                                                        setTimeout(() => {
                                                            const nextQ = quizCurrentQ + 1;
                                                            if (nextQ >= quizData.length) {
                                                                const finalScore = quizScore + (isCorrect ? 1 : 0);
                                                                const won = Math.max(20, finalScore * 20);
                                                                setQuizXpWon(won);
                                                                if (user) {
                                                                    syncProgress({ points: won }).catch(() => {});
                                                                }
                                                            }
                                                            setQuizAnsweredIndex(null); // Completely resets state for next question!
                                                            setQuizCurrentQ(nextQ);
                                                        }, 900);
                                                    }}
                                                >
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p style={{ marginTop: '15px', color: 'var(--text-secondary)', fontSize: '13px' }}>{lang === 'en' ? `Question ${quizCurrentQ + 1} of ${quizData.length}` : `پرسیاری ${quizCurrentQ + 1} لە ${quizData.length}`}</p>
                                </div>
                            ) : (
                                <div className="quiz-result" dir={lang === 'en' ? 'ltr' : 'rtl'} style={{ textAlign: 'center' }}>
                                    <div className="completion-trophy-wrap" style={{ margin: '0 auto 12px' }}>
                                        <Trophy size={40} color="#fbbf24" />
                                    </div>
                                    <h4 style={{ fontSize: '22px', color: '#4ade80', marginBottom: '8px', fontWeight: 800 }}>{lang === 'en' ? '🎉 Quiz Completed!' : 'تاقیکردنەوە تەواو بوو! 🎉'}</h4>
                                    <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#f1f5f9', marginBottom: '10px' }}>
                                        {lang === 'en' ? `Your Score: ${quizScore} / ${quizData.length}` : `ئەنجامەکەت: ${quizScore} لە ${quizData.length}`}
                                    </p>
                                    <div className="completion-xp-pill" style={{ margin: '0 auto 20px', display: 'inline-flex' }}>
                                        <Award size={18} color="#fbbf24" />
                                        <span>+{quizXpWon || Math.max(20, quizScore * 20)} XP {lang === 'en' ? 'Awarded to your Profile' : 'زیادکرا بۆ پڕۆفایلەکەت! 🌟'}</span>
                                    </div>
                                    <div className="completion-secondary-row" style={{ marginTop: '12px' }}>
                                        {nextEpisode ? (
                                            <button className="completion-next-btn" onClick={goToNext} style={{ width: '100%', padding: '12px' }}>
                                                <SkipForward size={18} /> {lang === 'en' ? `Next Episode (E${nextEpisode.e})` : `ئەڵقەی دواتر (ئەڵقەی ${nextEpisode.e}) ⏭️`}
                                            </button>
                                        ) : (
                                            <button className="completion-home-btn" onClick={() => navigate('/')} style={{ width: '100%', padding: '12px' }}>
                                                <Home size={18} /> {lang === 'en' ? 'Back to Home' : 'گەڕانەوە بۆ پەڕەی سەرەکی 🏠'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* AUTH REQUIRED MODAL PROMPT */}
            {authPrompt?.open && (
                <div className="modal-overlay" style={{ zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAuthPrompt(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center', padding: '32px 24px', borderRadius: '24px', background: 'rgba(18, 18, 28, 0.96)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255, 255, 255, 0.15)', boxShadow: '0 20px 60px rgba(0,0,0,0.95)' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(34, 211, 238, 0.15)', border: '1.5px solid #22d3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#22d3ee' }}>
                            <Sparkles size={32} />
                        </div>
                        <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '10px', color: '#ffffff' }}>{authPrompt.title}</h3>
                        <p style={{ fontSize: '14.5px', color: 'rgba(255, 255, 255, 0.8)', lineHeight: '1.6', marginBottom: '24px' }}>
                            {authPrompt.message}
                        </p>
                        <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                            <button
                                onClick={() => navigate('/auth')}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    borderRadius: '14px',
                                    background: '#22d3ee',
                                    color: '#09090b',
                                    fontWeight: '800',
                                    fontSize: '15px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 0 20px rgba(34, 211, 238, 0.4)'
                                }}
                            >
                                {t('sign_in')} / {t('sign_up')}
                            </button>
                            <button
                                onClick={() => setAuthPrompt(null)}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '14px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    color: '#ffffff',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    cursor: 'pointer'
                                }}
                            >
                                {lang === 'en' ? 'Dismiss and keep watching' : 'داخستن و بەردەوامبوون لە سەیرکردن'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LANGUAGE PRACTICE OVERLAY */}
            {practiceActive && (
                <div className="practice-overlay" onClick={closePractice}>
                    <div className="practice-card practice-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="practice-modal-header">
                            <div className="practice-header-left">
                                <span className="practice-header-icon">
                                    <Mic size={18} />
                                </span>
                                <h3 className="practice-header-title">{lang === 'en' ? 'Pronunciation Practice' : 'ڕاهێنانی گۆکردن'}</h3>
                            </div>
                            <button className="ai-modal-close-btn" onClick={closePractice} title="Close">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="practice-target" dir="ltr">"{practiceText}"</div>

                        {practicePhase === 'reading' && (
                            <div className="practice-phase">
                                <div className="practice-reading-anim">
                                    <Volume1 size={36} />
                                </div>
                                <p className="practice-phase-label">{lang === 'en' ? 'Reading aloud...' : 'دەیخوێنمەوە...'}</p>
                            </div>
                        )}

                        {practicePhase === 'listening' && (
                            <div className="practice-phase">
                                <p className="practice-phase-label">{lang === 'en' ? 'Ready? Click microphone and repeat' : 'ئامادەی؟ کلیک بکە و بیدووبارە بکەوە'}</p>
                                
                                <label className="practice-strict-toggle">
                                    <input type="checkbox" checked={strictMode} onChange={e => setStrictMode(e.target.checked)} />
                                    <span>{t('strict_accuracy_mode')}</span>
                                </label>

                                <div className="practice-phase-buttons">
                                    <button className="practice-start-btn" onClick={() => doListen(practiceText)}>
                                        <Mic size={18} /> {lang === 'en' ? 'Start Speaking' : 'دەست بکە بە قسەکردن'}
                                    </button>
                                    <button className="practice-replay-tts" onClick={() => doTTS(practiceText, () => { })}>
                                        <Volume2 size={16} /> {lang === 'en' ? 'Listen Again' : 'دووبارە بیخوێنەوە'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {practicePhase === 'recording' && (
                            <div className="practice-phase">
                                <div className="practice-mic-anim">
                                    <Mic size={40} />
                                </div>
                                <p className="practice-phase-label">{lang === 'en' ? 'Listening... Speak now' : 'گوێم لێیە... قسە بکە'}</p>
                            </div>
                        )}

                        {practicePhase === 'scoring' && (
                            <div className="practice-score-wrap">
                                <div className={`practice-score-circle score-${practiceScore >= 80 ? 'high' : practiceScore >= 50 ? 'mid' : 'low'}`}>
                                    {practiceScore}%
                                </div>
                                <div className="practice-feedback">
                                    {practiceScore >= 80
                                        ? (lang === 'en' ? '🌟 Great job! Keep going' : '🌟 ئافەرین! بەردەوام بە')
                                        : practiceScore >= 50
                                            ? (strictMode && speechConfidence < 0.85 ? (lang === 'en' ? '💬 Spoken, but pronunciation was unclear' : '💬 وشەکانت وت، بەڵام گۆکردنەکەت ڕوون نەبوو') : (lang === 'en' ? '📚 Good attempt' : '📚 پێویستە هەڵبدەی'))
                                            : (lang === 'en' ? '💪 Try Again' : '💪 هەوڵبدەوە')}
                                </div>

                                {/* Interactive Sentence Diff */}
                                <div className="practice-sentence-diff" dir="ltr">
                                    {sentenceDiff.map((item, idx) => {
                                        const isMistake = item.status === 'mistake';
                                        const isSelected = selectedMistakeWord?.word === item.word;
                                        return (
                                            <span
                                                key={idx}
                                                className={`diff-word-pill ${item.status} ${isSelected ? 'selected' : ''}`}
                                                onClick={() => {
                                                    if (isMistake) {
                                                        setSelectedMistakeWord(item);
                                                    }
                                                    doTTS(item.word, () => {});
                                                }}
                                                title={isMistake ? (lang === 'en' ? 'Click to hear pronunciation' : 'کلیک بکە بۆ بیستنی دەنگەکە') : undefined}
                                            >
                                                {item.word}
                                                {item.status === 'correct' && <Check size={11} className="diff-icon diff-check" />}
                                                {isMistake && <X size={11} className="diff-icon diff-x" />}
                                            </span>
                                        );
                                    })}
                                </div>

                                <div className="practice-btns">
                                    <button className="practice-retry" onClick={retryPractice}>
                                        <MicOff size={14} /> {t('try_again')}
                                    </button>
                                    {practiceScore < 100 && practiceScore > 0 && (
                                        <button 
                                            className="practice-ai-feedback-btn" 
                                            onClick={() => getAiPronunciationFeedback()} 
                                            disabled={isAiFeedbackLoading}
                                        >
                                            <Brain size={14} /> {
                                                (() => {
                                                    const allMistakes = sentenceDiff.filter(d => d.status === 'mistake');
                                                    if (allMistakes.length > 1) {
                                                        return lang === 'en' ? `🧠 AI Coach (3 Credits)` : `🧠 شیکاری AI بۆ هەموو هەڵەکان (٣ کرێدیت)`;
                                                    }
                                                    if (selectedMistakeWord) {
                                                        return lang === 'en' ? `🧠 AI: "${selectedMistakeWord.word}" (3 Credits)` : `🧠 شیکاری AI: "${selectedMistakeWord.word}" (٣ کرێدیت)`;
                                                    }
                                                    return lang === 'en' ? 'AI Analysis (3 Credits)' : 'شیکاری AI (٣ کرێدیت)';
                                                })()
                                            }
                                        </button>
                                    )}
                                    <button className="practice-continue" onClick={closePractice}>
                                        <CheckCircle size={14} /> {lang === 'en' ? 'Continue' : 'بەردەوام بە'}
                                    </button>
                                </div>

                                {isAiFeedbackLoading && (
                                    <div className="ai-loader" style={{ padding: '12px 0' }}>
                                        <Loader2 size={22} className="spinning" />
                                        <p style={{ fontSize: '13px' }}>{lang === 'en' ? 'AI is analyzing your pronunciation...' : 'مامۆستای AI سەرقاڵی شیکارکردنی دەنگەکەیە...'}</p>
                                    </div>
                                )}

                                {aiPronunciationFeedback && (
                                    <div className="ai-feedback-box" dir={lang === 'en' ? 'ltr' : 'rtl'}>
                                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a855f7', marginBottom: '8px', fontSize: '13.5px' }}>
                                            <Brain size={15} /> {lang === 'en' ? 'AI Pronunciation Coach' : 'ڕێنمایی گۆکردن لە AI'}
                                        </h4>
                                        <div className="ai-feedback-text">
                                            {aiPronunciationFeedback.split('\n').filter(Boolean).map((line, lIdx) => (
                                                <p key={lIdx} className="ai-feedback-p">
                                                    {line}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TOP BAR */}
            <div className={`watch-topbar ${showControls ? 'visible' : ''}`}>
                <button className="watch-back" onClick={backTo}>
                    <ArrowRight size={20} />
                    <span className="back-title">{episodeTitle || movie.title}</span>
                </button>
                {nextEpisode && (
                    <div className="sub-toggles">
                        <button className="next-ep-btn" onClick={goToNext}>
                            {nextEpisode.newSeason ? (lang === 'en' ? `Season ${nextEpisode.s} - Episode ${nextEpisode.e}` : `سیزنی ${nextEpisode.s} - ئالقەی ${nextEpisode.e}`) : (lang === 'en' ? `Episode ${nextEpisode.e} ▶` : `ئالقەی ${nextEpisode.e} ▶`)}
                        </button>
                    </div>
                )}
            </div>

            {/* CONTROLS */}
            <div className={`watch-controls ${showControls ? 'visible' : ''}`}>
                <div className="progress-wrap">
                    <div className="progress-track" onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = (e.clientX - rect.left) / rect.width;
                        commitSeek(ratio * (effectiveDuration || 0));
                    }}>
                        <div className="progress-fill-bg" style={{ width: `${bufferedPercent}%` }} />
                        <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                        <div className="progress-thumb" style={{ left: `${progressPercent}%` }} />
                        <input type="range" min={0} max={effectiveDuration || 1} step={0.1}
                            value={currentTime} onChange={handleSeek}
                            onMouseDown={() => { isScrubbingRef.current = true; }}
                            onMouseUp={finishSeek}
                            onTouchStart={() => { isScrubbingRef.current = true; }}
                            onTouchEnd={finishSeek}
                            onKeyUp={finishSeek}
                            ref={progressRef} className="progress-range-hidden" />
                    </div>
                </div>

                <div className="controls-row">
                    <div className="controls-left">
                        <button className="ctrl-btn play-ctrl" onClick={togglePlay} title={isPlaying ? (lang === 'en' ? 'Pause' : 'وەستاندن') : (lang === 'en' ? 'Play' : 'پەخشکردن')}>
                            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                        </button>

                        <button type="button" className="ctrl-btn skip-ctrl" onClick={() => skip(-10)} title={lang === 'en' ? '10s Back' : '١٠ چرکە پاشخستن'}>
                            <RotateCcw size={19} />
                        </button>

                        <button type="button" className="ctrl-btn skip-ctrl" onClick={() => skip(10)} title={lang === 'en' ? '10s Forward' : '١٠ چرکە پێشخستن'}>
                            <RotateCw size={19} />
                        </button>

                        {nextEpisode && (
                            <button 
                                type="button" 
                                className="ctrl-btn next-ep-ctrl-btn" 
                                onClick={goToNext} 
                                title={lang === 'en' ? `Next Episode (E${nextEpisode.e})` : `ئەڵقەی دواتر (ئەڵقەی ${nextEpisode.e})`}
                            >
                                <SkipForward size={18} fill="currentColor" />
                                <span className="next-ep-ctrl-label">{lang === 'en' ? `Next (E${nextEpisode.e})` : `ئەڵقەی دواتر`}</span>
                            </button>
                        )}

                        <div className="time-display">
                            <span className="current-time-text">{fmt(currentTime)}</span>
                            <span className="time-sep">/</span>
                            <span className="total-time-text">{fmt(effectiveDuration)}</span>
                        </div>
                        <div className={`volume-popover-wrap ${showVolumePopup ? 'active' : ''}`}>
                            <button 
                                type="button"
                                className={`ctrl-btn volume-btn ${showVolumePopup ? 'active' : ''}`} 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowVolumePopup(prev => !prev);
                                }}
                                title={lang === 'en' ? 'Volume' : 'دەنگ'}
                            >
                                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>
                            {showVolumePopup && (
                                <div className="vertical-volume-popup" onClick={e => e.stopPropagation()}>
                                    <div className="vertical-vol-slider-wrap">
                                        <input 
                                            type="range" 
                                            min={0} 
                                            max={1} 
                                            step={0.02} 
                                            value={isMuted ? 0 : volume} 
                                            onChange={(e) => {
                                                if (isMuted) setIsMuted(false);
                                                handleVolume(e);
                                            }} 
                                            className="vertical-vol-range" 
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="controls-right">
                        {/* Quick Pill Badges for Subtitles & Quality */}
                        <button 
                            type="button"
                            className={`quick-pill-badge ${showOriginal ? 'active' : ''}`}
                            onClick={handleToggleOriginal}
                            title={lang === 'en' ? 'Toggle English Subtitles' : (showOriginal ? 'کوژاندنەوەی سەبتایتڵی ئینگلیزی' : 'داگیرساندنی سەبتایتڵی ئینگلیزی')}
                        >
                            <span className="badge-txt-full">English</span>
                            <span className="badge-txt-short">EN</span>
                        </button>

                        <button 
                            type="button"
                            className={`quick-pill-badge ${showTranslated ? 'active' : ''}`}
                            onClick={handleToggleTranslated}
                            title={lang === 'en' ? 'Toggle Kurdish Subtitles' : (showTranslated ? 'کوژاندنەوەی سەبتایتڵی کوردی' : 'داگیرساندنی سەبتایتڵی کوردی')}
                        >
                            <span className="badge-txt-full">{lang === 'en' ? 'Kurdish' : 'کوردی'}</span>
                            <span className="badge-txt-short">{lang === 'en' ? 'KU' : 'کوردی'}</span>
                        </button>

                        <button 
                            type="button"
                            className="quick-pill-badge quality-badge"
                            onClick={() => {
                                setShowSettings(true);
                                setSettingsTab('quality');
                            }}
                            title={lang === 'en' ? 'Change Quality' : 'کوالیتی ڤیدیۆ'}
                        >
                            {currentQuality === -1 
                                ? (autoDetectedHeight ? `Auto (${autoDetectedHeight}p)` : 'Auto') 
                                : (qualityLevels.find(q => q.id === currentQuality)?.label.replace('خۆکار ', '').replace('(', '').replace(')', '') || 'Auto')}
                        </button>

                        <button 
                            type="button"
                            className={`ctrl-btn tooltip ${showSettings ? 'active' : ''}`} 
                            onClick={() => {
                                setShowSettings(!showSettings);
                                setSettingsTab('main');
                            }}
                            title={lang === 'en' ? 'Settings' : 'ڕێکخستنەکان ⚙️'}
                        >
                            <Settings size={20} />
                        </button>

                        <button 
                            type="button"
                            className="ctrl-btn tooltip pip-btn" 
                            onClick={togglePictureInPicture}
                            title={lang === 'en' ? 'Picture-in-Picture' : 'وێنە لەناو وێنە (PiP)'}
                        >
                            <PictureInPicture2 size={20} />
                        </button>

                        <button 
                            type="button"
                            className="ctrl-btn tooltip fullscreen-btn" 
                            onClick={toggleFullscreen}
                            title={lang === 'en' ? 'Fullscreen' : 'شاشەی تەواو'}
                        >
                            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* MODERN NESTED SETTINGS FLYOUT MENU */}
            {showSettings && (
                    <div className="modern-settings-menu" dir="rtl" onClick={e => e.stopPropagation()}>
                        {/* 1. MAIN MENU */}
                        {settingsTab === 'main' && (
                            <div className="settings-tab-pane">
                                <div className="settings-pane-header">
                                    <h4>{lang === 'en' ? 'Playback Settings' : 'ڕێکخستنەکان'}</h4>
                                    <button className="settings-close-btn" onClick={() => setShowSettings(false)}>
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="settings-menu-list">
                                    <div className="settings-menu-item" onClick={() => setSettingsTab('quality')}>
                                        <div className="menu-item-left">
                                            <Sliders size={18} className="menu-item-icon" />
                                            <span>{lang === 'en' ? 'Quality' : 'کواڵێتی'}</span>
                                        </div>
                                        <div className="menu-item-right">
                                            <span className="menu-item-value">
                                                {currentQuality === -1 
                                                    ? (autoDetectedHeight ? `Auto (${autoDetectedHeight}p)` : (lang === 'en' ? 'Auto' : 'خۆکار'))
                                                    : (qualityLevels.find(q => q.id === currentQuality)?.label || 'Auto')}
                                            </span>
                                            <ChevronLeft size={16} className="menu-item-arrow" />
                                        </div>
                                    </div>

                                    <div className="settings-menu-item" onClick={() => setSettingsTab('speed')}>
                                        <div className="menu-item-left">
                                            <Gauge size={18} className="menu-item-icon" />
                                            <span>{lang === 'en' ? 'Speed' : 'خێرایی'}</span>
                                        </div>
                                        <div className="menu-item-right">
                                            <span className="menu-item-value">{playbackRate === 1 ? (lang === 'en' ? 'Normal' : 'ئاسایی') : `${playbackRate}x`}</span>
                                            <ChevronLeft size={16} className="menu-item-arrow" />
                                        </div>
                                    </div>

                                    <div className="settings-menu-item" onClick={() => setSettingsTab('aspect')}>
                                        <div className="menu-item-left">
                                            <Maximize2 size={18} className="menu-item-icon" />
                                            <span>{lang === 'en' ? 'Aspect' : 'قەبارە'}</span>
                                        </div>
                                        <div className="menu-item-right">
                                            <span className="menu-item-value">{aspectRatio === 'default' ? 'Default' : aspectRatio}</span>
                                            <ChevronLeft size={16} className="menu-item-arrow" />
                                        </div>
                                    </div>

                                    <div className="settings-menu-item" onClick={() => setIsFlipped(!isFlipped)}>
                                        <div className="menu-item-left">
                                            <FlipHorizontal size={18} className="menu-item-icon" />
                                            <span>{lang === 'en' ? 'Flip' : 'ئاوێنە'}</span>
                                        </div>
                                        <div className="menu-item-right">
                                            <span className="menu-item-value">{isFlipped ? (lang === 'en' ? 'Flipped' : 'پێچەوانە') : (lang === 'en' ? 'Normal' : 'ئاسایی')}</span>
                                        </div>
                                    </div>

                                    <div className="settings-menu-item" onClick={() => setSettingsTab('subtitles')}>
                                        <div className="menu-item-left">
                                            <Sliders size={18} className="menu-item-icon" />
                                            <span>{lang === 'en' ? 'Subtitle' : 'سەبتایتڵ'}</span>
                                        </div>
                                        <div className="menu-item-right">
                                            <span className="menu-item-value">{transFontSize}px</span>
                                            <ChevronLeft size={16} className="menu-item-arrow" />
                                        </div>
                                    </div>

                                    <div className="settings-menu-item" onClick={() => setSettingsTab('delay')}>
                                        <div className="menu-item-left">
                                            <Clock size={18} className="menu-item-icon" />
                                            <span>{lang === 'en' ? 'Sync' : 'دواخستن'}</span>
                                        </div>
                                        <div className="menu-item-right">
                                            <span className="menu-item-value">{subDelay === 0 ? '0.0s' : `${subDelay > 0 ? '+' : ''}${subDelay.toFixed(1)}s`}</span>
                                            <ChevronLeft size={16} className="menu-item-arrow" />
                                        </div>
                                    </div>

                                    <div className="settings-menu-item" onClick={() => setFamilyMode(!familyMode)}>
                                        <div className="menu-item-left">
                                            <Shield size={18} className="menu-item-icon" />
                                            <span>{lang === 'en' ? 'Filter' : 'فلتەر'}</span>
                                        </div>
                                        <div className="menu-item-right">
                                            <span className={`menu-status-pill ${familyMode ? 'active' : ''}`}>{familyMode ? (lang === 'en' ? 'ON' : 'چالاکە') : (lang === 'en' ? 'OFF' : 'ناچالاکە')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. SPEED SUB-MENU */}
                        {settingsTab === 'speed' && (
                            <div className="settings-tab-pane">
                                <div className="settings-pane-header">
                                    <button className="settings-back-btn" onClick={() => setSettingsTab('main')}>
                                        <ChevronRight size={18} />
                                        <span>{lang === 'en' ? 'Speed' : 'خێرایی'}</span>
                                    </button>
                                </div>
                                <div className="settings-sub-options">
                                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => (
                                        <div 
                                            key={rate} 
                                            className={`settings-option-item ${playbackRate === rate ? 'selected' : ''}`}
                                            onClick={() => {
                                                setPlaybackRate(rate);
                                                if (videoRef.current) videoRef.current.playbackRate = rate;
                                            }}
                                        >
                                            <span>{rate === 1 ? (lang === 'en' ? 'Normal (1.0x)' : 'ئاسایی (1.0x)') : `${rate}x`}</span>
                                            {playbackRate === rate && <Check size={16} className="option-check" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 3. ASPECT RATIO SUB-MENU */}
                        {settingsTab === 'aspect' && (
                            <div className="settings-tab-pane">
                                <div className="settings-pane-header">
                                    <button className="settings-back-btn" onClick={() => setSettingsTab('main')}>
                                        <ChevronRight size={18} />
                                        <span>{lang === 'en' ? 'Aspect' : 'قەبارە'}</span>
                                    </button>
                                </div>
                                <div className="settings-sub-options">
                                    {[
                                        { id: 'default', label: lang === 'en' ? 'Default (Fit)' : 'بنەڕەتی' },
                                        { id: 'fill', label: lang === 'en' ? 'Cover / Fill' : 'پڕکردنەوە' },
                                        { id: 'stretch', label: lang === 'en' ? 'Stretch (16:9)' : 'کێشان' },
                                        { id: '4:3', label: '4:3' }
                                    ].map(opt => (
                                        <div 
                                            key={opt.id} 
                                            className={`settings-option-item ${aspectRatio === opt.id ? 'selected' : ''}`}
                                            onClick={() => setAspectRatio(opt.id as any)}
                                        >
                                            <span>{opt.label}</span>
                                            {aspectRatio === opt.id && <Check size={16} className="option-check" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 4. SUBTITLES SUB-MENU */}
                        {settingsTab === 'subtitles' && (
                            <div className="settings-tab-pane">
                                <div className="settings-pane-header">
                                    <button className="settings-back-btn" onClick={() => setSettingsTab('main')}>
                                        <ChevronRight size={18} />
                                        <span>{lang === 'en' ? 'Subtitle' : 'سەبتایتڵ'}</span>
                                    </button>
                                </div>
                                <div className="settings-slider-group">
                                    <div className="slider-row">
                                        <div className="slider-label-row">
                                            <span>{lang === 'en' ? 'Opacity' : 'شەفافیەت'}</span>
                                            <span className="slider-num">{subBgOpacity}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min={0} 
                                            max={100} 
                                            step={5}
                                            value={subBgOpacity} 
                                            onChange={e => setSubBgOpacity(+e.target.value)} 
                                        />
                                    </div>

                                    <div className="slider-row">
                                        <div className="slider-label-row">
                                            <span>{lang === 'en' ? 'Color' : 'ڕەنگ'}</span>
                                        </div>
                                        <div className="sub-theme-pill-row">
                                            {[
                                                { id: 'black', color: '#09090b', title: 'ڕەش' },
                                                { id: 'purple', color: '#4c1d95', title: 'مۆر' },
                                                { id: 'blue', color: '#1e3a8a', title: 'شین' },
                                                { id: 'transparent', color: 'transparent', title: 'بێ باکگراوند' },
                                            ].map(thm => (
                                                <button
                                                    key={thm.id}
                                                    type="button"
                                                    className={`sub-color-swatch ${thm.id === 'transparent' ? 'swatch-transparent' : ''} ${subBgTheme === thm.id ? 'active' : ''}`}
                                                    style={{ backgroundColor: thm.color }}
                                                    onClick={() => setSubBgTheme(thm.id as any)}
                                                    title={thm.title}
                                                >
                                                    {subBgTheme === thm.id && <Check size={14} color="#ffffff" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="slider-row">
                                        <div className="slider-label-row">
                                            <span>{lang === 'en' ? 'Kurdish' : 'کوردی'}</span>
                                            <span className="slider-num">{transFontSize}px</span>
                                        </div>
                                        <input type="range" min={5} max={48} value={transFontSize} onChange={e => setTransFontSize(+e.target.value)} />
                                    </div>

                                    <div className="slider-row">
                                        <div className="slider-label-row">
                                            <span>{lang === 'en' ? 'English' : 'ئینگلیزی'}</span>
                                            <span className="slider-num">{origFontSize}px</span>
                                        </div>
                                        <input type="range" min={5} max={40} value={origFontSize} onChange={e => setOrigFontSize(+e.target.value)} />
                                    </div>

                                    <div className="slider-row">
                                        <div className="slider-label-row">
                                            <span>{lang === 'en' ? 'Position' : 'بەرزی'}</span>
                                            <span className="slider-num">{subtitlePos}px</span>
                                        </div>
                                        <input type="range" min={-40} max={160} value={subtitlePos} onChange={e => setSubtitlePos(+e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 5. DELAY SUB-MENU */}
                        {settingsTab === 'delay' && (
                            <div className="settings-tab-pane">
                                <div className="settings-pane-header">
                                    <button className="settings-back-btn" onClick={() => setSettingsTab('main')}>
                                        <ChevronRight size={18} />
                                        <span>{lang === 'en' ? 'Sync' : 'دواخستن'}</span>
                                    </button>
                                </div>
                                <div className="delay-control-box">
                                    <div className="delay-val-display">
                                        {subDelay > 0 ? `+${subDelay.toFixed(1)}s` : `${subDelay.toFixed(1)}s`}
                                    </div>
                                    <div className="delay-btn-row">
                                        <button type="button" onClick={() => setSubDelay(prev => Math.max(-30, +(prev - 0.5).toFixed(1)))}>-0.5s</button>
                                        <button type="button" onClick={() => setSubDelay(prev => Math.max(-30, +(prev - 0.1).toFixed(1)))}>-0.1s</button>
                                        <button type="button" className="reset-btn" onClick={() => setSubDelay(0)}>0.0s</button>
                                        <button type="button" onClick={() => setSubDelay(prev => Math.min(30, +(prev + 0.1).toFixed(1)))}>+0.1s</button>
                                        <button type="button" onClick={() => setSubDelay(prev => Math.min(30, +(prev + 0.5).toFixed(1)))}>+0.5s</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 6. QUALITY SUB-MENU */}
                        {settingsTab === 'quality' && (
                            <div className="settings-tab-pane">
                                <div className="settings-pane-header">
                                    <button className="settings-back-btn" onClick={() => setSettingsTab('main')}>
                                        <ChevronRight size={18} />
                                        <span>{lang === 'en' ? 'Quality' : 'کواڵێتی'}</span>
                                    </button>
                                </div>
                                <div className="settings-sub-options">
                                    {qualityLevels.map(q => (
                                        <div 
                                            key={q.id} 
                                            className={`settings-option-item ${currentQuality === q.id ? 'selected' : ''}`}
                                            onClick={() => handleQualityChange(q.id)}
                                        >
                                            <span>{q.label}</span>
                                            {currentQuality === q.id && <Check size={16} className="option-check" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

            {/* Dual Subtitle Free Trial Quota / Paywall Modal */}
            <DualSubTrialModal
                isOpen={showDualTrialModal}
                onClose={() => setShowDualTrialModal(false)}
                onContinueSingle={() => {
                    setShowDualTrialModal(false);
                    if (dualSubExpiredAction === 'block_all') {
                        setShowOriginal(false);
                        setShowTranslated(false);
                    } else if (dualSubExpiredAction === 'kurdish_only') {
                        setShowOriginal(false);
                        setShowTranslated(true);
                    } else if (dualSubExpiredAction === 'english_only') {
                        setShowOriginal(true);
                        setShowTranslated(false);
                    }
                }}
                trialMinutes={dualSubTrialMinutes}
                resetHours={dualSubResetHours}
            />
        </div>
    );
}
