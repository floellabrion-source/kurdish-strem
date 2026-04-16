import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
    ArrowRight, Play, Pause, Volume2, VolumeX,
    Maximize, Minimize, RotateCcw, RotateCw, Settings,
    SkipForward, SkipBack, Mic, MicOff, Volume1, X, CheckCircle, BookmarkPlus, Brain, Loader2, Shield, EyeOff
} from 'lucide-react';
import { Movie } from '../types';
import { useAuth } from '../context/AuthContext';
import './Watch.css';

const parseSRT = (data: string) => {
    if (!data) return [];
    const clean = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = clean.split(/\n\s*\n/);
    const subs: { id: number; start: number; end: number; text: string }[] = [];
    const toSec = (t: string) => {
        const [h, m, rest] = t.split(':');
        const [s, ms] = rest.split(',');
        return +h * 3600 + +m * 60 + +s + +ms / 1000;
    };
    blocks.forEach(b => {
        const lines = b.trim().split('\n');
        if (lines.length < 3) return;
        const id = parseInt(lines[0]);
        const tm = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
        if (!tm || isNaN(id)) return;
        subs.push({ id, start: toSec(tm[1]), end: toSec(tm[2]), text: lines.slice(2).join('\n').replace(/<[^>]*>/g, '') });
    });
    return subs;
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

    const [movie, setMovie] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);
    const [videoLoadError, setVideoLoadError] = useState('');
    const [originalSubs, setOriginalSubs] = useState<ReturnType<typeof parseSRT>>([]);
    const [translatedSubs, setTranslatedSubs] = useState<ReturnType<typeof parseSRT>>([]);
    const { user, syncProgress } = useAuth();
    
    // Family Mode / Blur
    const [sensitiveScenes, setSensitiveScenes] = useState<{start: number, end: number}[]>([]);
    const [familyMode, setFamilyMode] = useState(() => {
        const saved = localStorage.getItem('familyMode');
        return saved ? saved === 'true' : true; // Default ON
    });

    useEffect(() => {
        localStorage.setItem('familyMode', familyMode.toString());
    }, [familyMode]);

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
    const [origFontSize, setOrigFontSize] = useState(20);
    const [transFontSize, setTransFontSize] = useState(26);
    const [subtitlePos, setSubtitlePos] = useState(10);
    const [subDelay, setSubDelay] = useState(0);
    const syncBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [syncBadgeVisible, setSyncBadgeVisible] = useState(false);
    const [skipIndicator, setSkipIndicator] = useState<'forward' | 'backward' | null>(null);
    const [episodeTitle, setEpisodeTitle] = useState('');
    const [resumePrompt, setResumePrompt] = useState<number | null>(null); // saved time to resume from
    const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // localStorage key for this content
    const progressKey = `progress_${id}_s${seasonNum}_e${episodeNum}`;

    // Flashcard interaction
    const [flashcardToast, setFlashcardToast] = useState(false);
    const flashcardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const addToFlashcards = (e: React.MouseEvent, front: string, back: string) => {
        e.stopPropagation();
        try {
            const saved = localStorage.getItem('kurdish_stream_flashcards');
            const cards = saved ? JSON.parse(saved) : [];
            // Check if already exists
            if (!cards.find((c: any) => c.front.trim() === front.trim())) {
                const now = Date.now();
                cards.unshift({ id: now.toString(), front, back, ease: 2.5, interval: 0, nextReview: now });
                localStorage.setItem('kurdish_stream_flashcards', JSON.stringify(cards));
                if (user) syncProgress({ flashcards: cards });
            }
            
            // Show toast
            setFlashcardToast(true);
            if (flashcardTimerRef.current) clearTimeout(flashcardTimerRef.current);
            flashcardTimerRef.current = setTimeout(() => setFlashcardToast(false), 2000);
        } catch (err) { }
    };

    // AI Explanation Feature
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiExplanation, setAiExplanation] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
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

    const explainWithAi = async (text: string) => {
        if (videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
        setAiModalOpen(true);
        setIsAiLoading(true);
        setAiExplanation('');

        try {
            const res = await postAiWithRetry({
                contents: [{ parts: [{ text: `You are a professional English teacher for Kurdish speakers. Briefly explain the grammar, context, and vocabulary of this English sentence in very clear Kurdish Sorani (کوردی سۆرانی). Format the response nicely. WARNING: You MUST use ONLY the Arabic alphabet for Kurdish texts. Never use Latin/Hawar letters (like ê, û, î, ş, ç) for Kurdish. \n\nSentence: "${text}"` }] }]
            });
            const expl = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'وەڵامێک نەهات.';
            setAiExplanation(expl);
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
    
    // AI Pronunciation Feedback
    const [aiPronunciationFeedback, setAiPronunciationFeedback] = useState('');
    const [isAiFeedbackLoading, setIsAiFeedbackLoading] = useState(false);

    const getAiPronunciationFeedback = async (spoken: string, target: string) => {
        setIsAiFeedbackLoading(true);
        setAiPronunciationFeedback('');

        try {
            const res = await postAiWithRetry({
                contents: [{ parts: [{ text: `You are an English language pronunciation coach. The user tried to say: "${target}". However, the speech recognition heard them say: "${spoken}". Briefly explain in Kurdish Sorani (کوردی سۆرانی) what their mistake was and how to pronounce the misunderstood words correctly. If they were very close, encourage them. WARNING: You MUST write the Kurdish explanation in the Arabic alphabet only. Never use Latin letters (like ê, û, î, ş) for Kurdish words!` }] }]
            });
            const expl = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'وەڵامێک نەهات.';
            setAiPronunciationFeedback(expl);
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
            // Apply confidence multiplier if in strict mode
            // e.g. if confidence is 60%, score drops significantly
            score = score * confidence;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    };

    const doListen = (target: string) => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            alert('بروەزەرەکەت speech recognition پشتگیری ناکات. Chrome بەکاربهێنە.');
            setPracticePhase('scoring');
            setPracticeScore(0);
            return;
        }
        setPracticePhase('recording');
        const r = new SR();
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
            setPracticePhase('scoring');
            
            if (score >= 80) syncProgress({ points: 10 });
        };
        r.onerror = (e: any) => {
            console.warn('SR error', e.error);
            if (e.error === 'not-allowed') {
                alert('مایکرۆفۆنەکەت destegîرێنداو نییە. بڕۆ بۆ settings بروەزەر و destegîری مایکرۆفۆن بدە.');
            }
            setPracticePhase('listening');
        };
        r.onnomatch = () => { setPracticePhase('listening'); };
        r.start();
        recognitionRef.current = r;
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

    const getStreamUrl = () => {
        if (!movie) return null;
        if (episodeNum > 0) {
            const season = movie.seasons?.find(s => s.number === seasonNum);
            const episode = season?.episodes.find(e => e.number === episodeNum);
            if (!episode) return null;
            if (episode.videoUrl) return episode.videoUrl;
            if (episode.videoFile) return `/api/stream/${id}?s=${seasonNum}&e=${episodeNum}`;
            return null;
        }
        if (movie.videoUrl) return movie.videoUrl;
        if (movie.videoFile) return `/api/stream/${id}`;
        return null;
    };

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
        axios.get(`/api/movies/${id}`).then(async res => {
            const m: Movie = res.data;
            setMovie(m);
            if (episodeNum > 0 && m.seasons) {
                const season = m.seasons.find(s => s.number === seasonNum);
                const episode = season?.episodes.find(e => e.number === episodeNum);
                if (episode) {
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

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) { v.play(); setIsPlaying(true); }
        else { v.pause(); setIsPlaying(false); }
    };

    const skip = (s: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(v.currentTime + s, v.duration || 0));
        setSkipIndicator(s > 0 ? 'forward' : 'backward');
        setTimeout(() => setSkipIndicator(null), 600);
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
        setCurrentTime(t);
        if (videoRef.current) videoRef.current.currentTime = t;
    };

    const handleTimeUpdate = () => {
        const v = videoRef.current;
        if (!v) return;
        setCurrentTime(v.currentTime);
        if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
        
        // Save progress locally every 5 seconds
        if (v.currentTime > 10) {
            const rounded = Math.floor(v.currentTime);
            localStorage.setItem(progressKey, String(rounded));
            
            // Sync with backend every 15 seconds
            if (rounded % 15 === 0 && user) {
                const hKey = `${id}_s${seasonNum}_e${episodeNum}`;
                const title = episodeNum > 0 ? episodeTitle : movie?.title || 'Unknown';
                syncProgress({ history: { [hKey]: { time: rounded, title, date: new Date().toISOString() } } });
            }
        }
    };

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;
    const adjTime = currentTime - subDelay;
    const currentOrigSub = originalSubs.find(s => adjTime >= s.start && adjTime <= s.end);
    const currentTransSub = translatedSubs.find(s => adjTime >= s.start && adjTime <= s.end);

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

    if (loading) return (<div className="watch-loading"><div className="loading-spinner" /></div>);
    if (!movie) return (
        <div className="watch-error">
            <p>فیلمەکە نەدۆزرایەوە</p>
            <button onClick={() => navigate('/')} className="back-btn-err">
                <ArrowRight size={16} /> گەرانەوە
            </button>
        </div>
    );

    const isSensitiveNow = familyMode && sensitiveScenes.some(s => currentTime >= s.start && currentTime <= s.end);
    const streamUrl = getStreamUrl();
    const videoFileName = getCurrentVideoFileName();
    const browserSupportsMkv = typeof document !== 'undefined'
        ? !!document.createElement('video').canPlayType('video/x-matroska')
        : true;
    const mkvUnsupported = !!videoFileName?.toLowerCase().endsWith('.mkv') && !browserSupportsMkv;
    const effectiveStreamUrl = mkvUnsupported ? null : streamUrl;

    return (
        <div
            className="watch-container"
            ref={containerRef}
            onMouseMove={resetControlsTimer}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            onTouchStart={resetControlsTimer}
            onTouchMove={resetControlsTimer}
        >
            {/* VIDEO */}
            <video
                key={effectiveStreamUrl || 'no-stream'}
                ref={videoRef}
                src={effectiveStreamUrl || undefined}
                className={`watch-video ${isSensitiveNow ? 'blur-video' : ''}`}
                autoPlay
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={e => {
                    setVideoLoadError('');
                    const v = e.currentTarget;
                    setDuration(v.duration);
                    setCurrentTime(0);
                    // Check for saved resume position
                    const saved = localStorage.getItem(progressKey);
                    if (saved) {
                        const t = parseInt(saved);
                        // Only prompt if more than 30s saved and not near the end
                        if (t > 30 && t < v.duration - 30) {
                            setResumePrompt(t);
                            v.pause();
                            return;
                        }
                    }
                    v.play().then(() => setIsPlaying(true)).catch(() => { });
                }}
                onPlay={() => { setIsPlaying(true); resetControlsTimer(); }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                    localStorage.removeItem(progressKey); // clear progress when done
                    if (nextEpisode) goToNext();
                }}
                onError={() => setVideoLoadError('ڤیدیۆکە لەسەر سێرڤەر نەدۆزرایەوە یان فایلەکە کێشەی هەیە.')}
                onClick={togglePlay}
            />

            {(!effectiveStreamUrl || videoLoadError) && (
                <div className="sensitive-overlay">
                    <Shield size={64} className="sensitive-icon" />
                    <h2>ڤیدیۆ بەردەست نییە</h2>
                    <p>
                        {mkvUnsupported
                            ? 'ئەم ڤیدیۆیە .mkv ـە و بروەزەرەکەت پشتگیری ناکات. بۆ چارەسەر mp4 بەکاربهێنە یان فایلەکە بگۆڕە بۆ mp4.'
                            : (videoLoadError || 'بۆ ئەم ئالقە/فیلمە هێشتا ڤیدیۆ دانەنراوە.')}
                    </p>
                </div>
            )}

            {isSensitiveNow && (
                <div className="sensitive-overlay">
                    <Shield size={64} className="sensitive-icon" />
                    <h2>دیمەنی نەشیاو شاردراوەتەوە</h2>
                    <p>بۆ بینینی دیمەنەکە، فلتەری خێزانی (Family Mode) بکوژێنەوە لە خوارەوە</p>
                </div>
            )}

            {/* RESUME PROMPT */}
            {resumePrompt !== null && (
                <div className="resume-prompt">
                    <div className="resume-card">
                        <p className="resume-label">لە <strong>{Math.floor(resumePrompt / 60)}:{String(Math.floor(resumePrompt % 60)).padStart(2, '0')}</strong> وەستاندبوویت</p>
                        <div className="resume-btns">
                            <button className="resume-btn-yes" onClick={() => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = resumePrompt;
                                    videoRef.current.play().then(() => setIsPlaying(true));
                                }
                                setResumePrompt(null);
                            }}>بەردەوام بە ▶</button>
                            <button className="resume-btn-no" onClick={() => {
                                localStorage.removeItem(progressKey);
                                if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                                setResumePrompt(null);
                            }}>سەرەوە دەستپێبکە</button>
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
            <div className="subtitle-area" style={{ bottom: `${subtitlePos + 90}px` }}>
                {showTranslated && currentTransSub && (
                    <div className="subtitle-text subtitle-translated" style={{ fontSize: transFontSize }}>
                        {currentTransSub.text}
                    </div>
                )}
                {showOriginal && currentOrigSub && (
                    <div
                        className="subtitle-text subtitle-original subtitle-clickable"
                        style={{ fontSize: origFontSize }}
                        title="کلیک بکە بۆ فێربونی زمان 🎤 یان سەیڤی فلاشکارتی بکە"
                    >
                        <div className="sub-actions-row">
                            <span className="sub-ai-btn" onClick={(e) => { e.stopPropagation(); explainWithAi(currentOrigSub.text); }} title="شیکاری ڕێزمان بە AI 🤖">
                                <Brain size={16} /> شیکاری AI
                            </span>
                            <span className="sub-save-btn" onClick={(e) => addToFlashcards(e, currentOrigSub.text, currentTransSub?.text || '')} title="زیادی بکە بۆ فلاش کارتەکان 🃏">
                                <BookmarkPlus size={18} />
                            </span>
                            <span className="sub-practice-btn" onClick={() => startPractice(currentOrigSub.text)}>
                                <Mic size={16} /> فێربوون
                            </span>
                        </div>
                        {currentOrigSub.text}
                    </div>
                )}
            </div>

            {/* FLASHCARD TOAST */}
            {flashcardToast && (
                <div className="flashcard-save-toast">
                    <CheckCircle size={16} /> لە فلاش کارت پارێزرا! 🃏
                </div>
            )}

            {/* SYNC BADGE - shows on [ ] key press */}
            {syncBadgeVisible && (
                <div className="sync-badge">
                    سەبتایتڵ: {subDelay > 0 ? '+' : ''}{subDelay.toFixed(1)}s
                    <span className="sync-badge-hint">[ ] بەکاربهێنە</span>
                </div>
            )}

            {/* AI EXPLANATION MODAL */}
            {aiModalOpen && (
                <div className="practice-overlay">
                    <div className="practice-card ai-explanation-card">
                        <button className="practice-close" onClick={() => {
                            setAiModalOpen(false);
                            if (videoRef.current) videoRef.current.play().then(() => setIsPlaying(true));
                        }}><X size={18} /></button>
                        
                        <h3 className="ai-modal-title"><Brain size={24} className="ai-brain-icon" /> مامۆستای ژیری دەستکرد</h3>
                        <div className="ai-target-sentence" dir="ltr">"{currentOrigSub?.text}"</div>

                        {isAiLoading ? (
                            <div className="ai-loader">
                                <Loader2 size={32} className="spinning" />
                                <p>ژیری دەستکرد سەرقاڵی شیکارکردنی ڕستەکەیە...</p>
                            </div>
                        ) : (
                            <div className="ai-result" dir="rtl">
                                {aiExplanation.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* LANGUAGE PRACTICE OVERLAY */}
            {practiceActive && (
                <div className="practice-overlay">
                    <div className="practice-card">
                        <button className="practice-close" onClick={closePractice}><X size={18} /></button>

                        <div className="practice-target">"{practiceText}"</div>

                        {practicePhase === 'reading' && (
                            <div className="practice-phase">
                                <div className="practice-reading-anim">
                                    <Volume1 size={36} />
                                </div>
                                <p className="practice-phase-label">دەیخوێنمەوە...</p>
                            </div>
                        )}

                        {practicePhase === 'listening' && (
                            <div className="practice-phase">
                                <p className="practice-phase-label">ئامادەی؟ کلیک بکە و بیدووبارە بکەوە</p>
                                
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#aaa', fontSize: '13px', cursor: 'pointer', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '6px' }}>
                                    <input type="checkbox" checked={strictMode} onChange={e => setStrictMode(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                                    تەحەدای گۆکردن (سزا بۆ گۆکردنی ناڕوون)
                                </label>

                                <button className="practice-start-btn" onClick={() => doListen(practiceText)}>
                                    <Mic size={22} /> دەست بکە بە قسەکردن
                                </button>
                                <button className="practice-replay-tts" onClick={() => doTTS(practiceText, () => { })}>
                                    <Volume1 size={14} /> دووبارە بیخوێنەوە
                                </button>
                            </div>
                        )}

                        {practicePhase === 'recording' && (
                            <div className="practice-phase">
                                <div className="practice-mic-anim">
                                    <Mic size={40} />
                                </div>
                                <p className="practice-phase-label">گوێم لێیە... قسە بکە</p>
                            </div>
                        )}

                        {practicePhase === 'scoring' && (
                            <div className="practice-score-wrap">
                                {spokenText && (
                                    <div className="practice-spoken">تۆ گوتت: <em>"{spokenText}"</em></div>
                                )}
                                <div className={`practice-score-circle score-${practiceScore >= 80 ? 'high' : practiceScore >= 50 ? 'mid' : 'low'}`}>
                                    {practiceScore}%
                                </div>
                                <div className="practice-feedback">
                                    {practiceScore >= 80
                                        ? '🌟 ئافەرین! بەردەوام بە'
                                        : practiceScore >= 50
                                            ? (strictMode && speechConfidence < 0.85 ? '💬 وشەکانت وت، بەڵام گۆکردنەکەت ڕوون نەبوو' : '📚 پێویستە هەڵبدەی')
                                            : '💪 هەوڵبدەوە'}
                                </div>
                                <div className="practice-btns">
                                    <button className="practice-retry" onClick={retryPractice}>
                                        <MicOff size={14} /> دووبارە هەوڵبدە
                                    </button>
                                    {practiceScore < 100 && practiceScore > 0 && spokenText && (
                                        <button className="practice-ai-feedback-btn" onClick={() => getAiPronunciationFeedback(spokenText, practiceText)} disabled={isAiFeedbackLoading}>
                                            <Brain size={14} /> شیکاری AI
                                        </button>
                                    )}
                                    <button className="practice-continue" onClick={closePractice}>
                                        <CheckCircle size={14} /> بەردەوام بە
                                    </button>
                                </div>

                                {isAiFeedbackLoading && (
                                    <div className="ai-loader" style={{ padding: '15px 0' }}>
                                        <Loader2 size={24} className="spinning" />
                                        <p style={{ fontSize: '13px' }}>AI شی دەکاتەوە تۆ چیت وت...</p>
                                    </div>
                                )}
                                {aiPronunciationFeedback && (
                                    <div className="ai-feedback-box" dir="rtl">
                                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a855f7', marginBottom: '8px' }}>
                                            <Brain size={16} /> ئەنجامی AI
                                        </h4>
                                        <p style={{ color: '#e2e8f0', fontSize: '14px', lineHeight: '1.6' }}>{aiPronunciationFeedback}</p>
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
                <div className="sub-toggles">
                    <button className={`sub-toggle-btn ${showTranslated ? 'active' : ''}`} onClick={() => setShowTranslated(!showTranslated)}>
                        وەرگێڕدراو
                    </button>
                    <button className={`sub-toggle-btn ${showOriginal ? 'active' : ''}`} onClick={() => setShowOriginal(!showOriginal)}>
                        ئەسڵی
                    </button>
                    {nextEpisode && (
                        <button className="next-ep-btn" onClick={goToNext}>
                            {nextEpisode.newSeason ? `سیزنی ${nextEpisode.s} - ئالقەی ${nextEpisode.e}` : `ئالقەی ${nextEpisode.e} ▶`}
                        </button>
                    )}
                </div>
            </div>

            {/* CONTROLS */}
            <div className={`watch-controls ${showControls ? 'visible' : ''}`}>
                <div className="progress-wrap">
                    <span className="time-label">{fmt(currentTime)}</span>
                    <div className="progress-track" onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = (e.clientX - rect.left) / rect.width;
                        const newTime = ratio * (duration || 0);
                        if (videoRef.current) videoRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                    }}>
                        <div className="progress-fill-bg" style={{ width: `${bufferedPercent}%` }} />
                        <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                        <div className="progress-thumb" style={{ left: `${progressPercent}%` }} />
                        <input type="range" min={0} max={duration || 1} step={0.1}
                            value={currentTime} onChange={handleSeek}
                            ref={progressRef} className="progress-range-hidden" />
                    </div>
                    <span className="time-label">{fmt(duration)}</span>
                </div>

                <div className="controls-row">
                    <div className="controls-left">
                        <button className="ctrl-btn" onClick={() => skip(-10)}><RotateCcw size={20} /><span className="ctrl-label">١٠</span></button>
                        <button className="ctrl-btn play-ctrl" onClick={togglePlay}>
                            {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
                        </button>
                        <button className="ctrl-btn" onClick={() => skip(10)}><RotateCw size={20} /><span className="ctrl-label">١٠</span></button>
                        <button className="ctrl-btn" onClick={toggleMute}>
                            {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </button>
                        <input type="range" min={0} max={1} step={0.02} value={volume} onChange={handleVolume} className="volume-bar" />
                        <span className="vol-label">{Math.round(volume * 100)}%</span>
                    </div>
                    <div className="controls-right">
                        <div className="key-hints"><kbd>&lt;</kbd> <kbd>&gt;</kbd> = ١٠ چرکە</div>
                        <button 
                            className={`ctrl-btn tooltip ${familyMode ? 'family-mode-on' : 'family-mode-off'}`} 
                            data-tip={familyMode ? 'فلتەری خێزانی چالاکە' : 'فلتەری خێزانی ناچالاکە'} 
                            onClick={() => setFamilyMode(!familyMode)}
                        >
                            {familyMode ? <Shield size={20} /> : <EyeOff size={20} />}
                        </button>
                        <button className={`ctrl-btn ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(!showSettings)}>
                            <Settings size={20} />
                        </button>
                        <button className="ctrl-btn" onClick={toggleFullscreen}>
                            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                        </button>
                    </div>
                </div>

                {showSettings && (
                    <div className="settings-panel">
                        <h4 className="settings-title">ڕێکخستنەکان</h4>
                        <div className="setting-row">
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>دواخستنی سەبتایتڵ: {subDelay > 0 ? '+' : ''}{subDelay.toFixed(1)}s</span>
                                {subDelay !== 0 && (
                                    <span
                                        style={{ fontSize: '11px', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}
                                        onClick={() => setSubDelay(0)}
                                    >ڕێکخستنەوە ✕</span>
                                )}
                            </label>
                            <input type="range" min={-15} max={15} step={0.1} value={subDelay} onChange={e => setSubDelay(+e.target.value)} />
                        </div>
                        <div className="setting-row">
                            <label>قەبارەی وەرگێڕدراو: {transFontSize}px</label>
                            <input type="range" min={14} max={60} value={transFontSize} onChange={e => setTransFontSize(+e.target.value)} />
                        </div>
                        <div className="setting-row">
                            <label>قەبارەی ئەسڵی: {origFontSize}px</label>
                            <input type="range" min={12} max={50} value={origFontSize} onChange={e => setOrigFontSize(+e.target.value)} />
                        </div>
                        <div className="setting-row">
                            <label>شوێنی سەبتایتڵ: {subtitlePos}px</label>
                            <input type="range" min={0} max={150} value={subtitlePos} onChange={e => setSubtitlePos(+e.target.value)} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
