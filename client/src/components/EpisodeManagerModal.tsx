import React, { useState, useRef, useEffect } from 'react';
import axios from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
    X, Plus, Trash2, Edit3, BarChart2, Video, Upload, Link as LinkIcon,
    FileText, Languages, Shield, ChevronDown, ChevronUp, PlusCircle, Loader2, Play,
    Download, Sparkles, CheckCircle2, AlertCircle, Pause, RefreshCw, Zap, BookOpen, Brain, DollarSign, Clock, Layers, Film,
    Minimize2, Maximize2, Wrench, Globe, Lock, Unlock
} from 'lucide-react';
import { Movie, Season, Episode, LanguageMetrics } from '../types';
import { 
    runAiTranslationAndAnalysis, 
    triggerFileDownload, 
    pauseTranslationTask,
    parseSRT,
    AI_TRANSLATION_MODELS,
    TRANSLATION_TONES,
    MODEL_PRICING,
    subscribeToAiTasks,
    registerAiTask,
    updateAiTask,
    removeAiTask,
    stopAiTask,
    ActiveAiTask
} from '../utils/aiTranslator';
import './EpisodeManagerModal.css';

interface EpisodeManagerModalProps {
    movie: Movie;
    onClose: () => void;
    onAddSeason: (movieId: string) => void;
    onDeleteSeason?: (movieId: string, seasonNum: number) => void;
    onAddEpisode: (movieId: string, seasonNum: number) => void;
    onBulkAdd: (movieId: string, seasonNum: number, count: number) => void;
    onDeleteEpisode?: (movieId: string, seasonNum: number, episodeId: string) => void;
    onEditEpisode: (movieId: string, seasonNum: number, ep: Episode) => void;
    onEpVideo: (movieId: string, seasonNum: number, episodeNum: number, file: File) => void;
    onR2Upload: (movieId: string, seasonNum: number, episodeId: string, episodeNum: number, file: File) => void;
    onEpVideoUrl: (movieId: string, seasonNum: number, episodeId: string, url: string) => void;
    onEpSrt: (movieId: string, seasonNum: number, episodeNum: number, file: File, srtType: 'original' | 'translated') => void;
    onSensitive: (movieId: string, seasonNum: number, epId: string) => void;
    onOpenSrtEditor: (movieId: string, movieTitle: string, seasonNum: number, episodeNum: number, episodeTitle: string, videoUrl?: string) => void;
    onOpenMetricsModal?: (movie: Movie, seasonNum: number, ep: Episode) => void;
    onReloadMovie?: () => void;
    uploading: Record<string, boolean>;
    uploadProgress: Record<string, number>;
}

export default function EpisodeManagerModal({
    movie,
    onClose,
    onAddSeason,
    onDeleteSeason,
    onAddEpisode,
    onBulkAdd,
    onDeleteEpisode,
    onEditEpisode,
    onEpVideo,
    onR2Upload,
    onEpVideoUrl,
    onEpSrt,
    onSensitive,
    onOpenSrtEditor,
    onOpenMetricsModal,
    onReloadMovie,
    uploading,
    uploadProgress
}: EpisodeManagerModalProps) {
    const { lang } = useLanguage();
    const { user } = useAuth();
    const [bulkCounts, setBulkCounts] = useState<Record<number, string>>({});
    const [epTransProgress, setEpTransProgress] = useState<Record<string, { status: 'running' | 'paused' | 'done', statusText: string, percent: number }>>({});
    const [bulkTranslatingSeason, setBulkTranslatingSeason] = useState<number | null>(null);
    const [bulkProgressText, setBulkProgressText] = useState<string>('');
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    // ─── SUBTITLE RESERVATION STATE ───
    const [reserveTarget, setReserveTarget] = useState<{ seasonNum: number; ep: Episode } | null>(null);
    const [reserveDaysInput, setReserveDaysInput] = useState<number>(5);

    const getReservationRemainingLabel = (expiresAt: number) => {
        const diffMs = expiresAt - Date.now();
        if (diffMs <= 0) return null;
        const hours = Math.ceil(diffMs / (1000 * 60 * 60));
        if (hours > 24) {
            const days = Math.ceil(hours / 24);
            return `${days} ڕۆژ`;
        }
        return `${hours} کاتژمێر`;
    };

    const handleReserveEpisode = async (seasonNum: number, ep: Episode, days: number = 5) => {
        try {
            await axios.post(`/api/admin/movies/${movie.id}/reserve`, {
                seasonNum,
                episodeNum: ep.number,
                days
            });
            showToast(`ئەڵقەی ${ep.number} بۆ ماوەی ${days} ڕۆژ حجز کرا بۆت 🔒`);
            setReserveTarget(null);
            if (onReloadMovie) onReloadMovie();
        } catch (err: any) {
            showToast(err.response?.data?.error || 'کێشەیەک لە حجزکردن ڕووی دا');
        }
    };

    const handleUnreserveEpisode = async (seasonNum: number, ep: Episode) => {
        try {
            await axios.post(`/api/admin/movies/${movie.id}/unreserve`, {
                seasonNum,
                episodeNum: ep.number
            });
            showToast(`حجزی ئەڵقەی ${ep.number} بە سەرکەوتوویی لادرا 🔓`);
            setReserveTarget(null);
            if (onReloadMovie) onReloadMovie();
        } catch (err: any) {
            showToast(err.response?.data?.error || 'کێشەیەک ڕووی دا');
        }
    };

    // ─── ACTIVE AI TASKS GLOBAL SUBSCRIPTION ───
    const [activeAiTasks, setActiveAiTasks] = useState<ActiveAiTask[]>([]);
    useEffect(() => {
        return subscribeToAiTasks(tasks => {
            setActiveAiTasks(tasks);
        });
    }, []);

    const runningTaskForMovie = activeAiTasks.find(t => t.movieId === movie.id && t.status === 'running');

    // ─── AI MASTER HUB MODAL STATE ───
    const [aiHubTarget, setAiHubTarget] = useState<{
        open: boolean;
        type: 'single' | 'bulk';
        seasonNum: number;
        episode?: Episode;
        season?: Season;
    } | null>(null);

    const [partialSrtInfo, setPartialSrtInfo] = useState<{
        totalLines: number;
        translatedLines: number;
        percent: number;
    } | null>(null);

    const [aiSelectedModel, setAiSelectedModel] = useState<string>(() => {
        return localStorage.getItem('ks_srt_ai_model') || 'google/gemini-2.5-flash';
    });
    const [aiSelectedTone, setAiSelectedTone] = useState<string>(() => {
        return localStorage.getItem('ks_srt_tone') || 'casual';
    });
    const [aiStoryContext, setAiStoryContext] = useState<string>(movie.descriptionKu || movie.description || '');
    const [aiAllGlossary, setAiAllGlossary] = useState<any[]>([]);
    const [aiRunning, setAiRunning] = useState(false);
    const [aiProgressText, setAiProgressText] = useState('');
    const [aiPercent, setAiPercent] = useState(0);
    const [aiStats, setAiStats] = useState({
        totalInTok: 0,
        totalOutTok: 0,
        costUsd: 0,
        speedTokSec: 0,
        startTime: 0,
        elapsedSec: 0
    });
    const aiAbortControllerRef = useRef<AbortController | null>(null);
    const [fetchingSynopsis, setFetchingSynopsis] = useState(false);

    // Fetch glossaries on mount
    useEffect(() => {
        axios.get('/api/glossary', { params: { movieId: movie.id } })
            .then(r => Array.isArray(r.data) && setAiAllGlossary(r.data))
            .catch(() => {});
    }, [movie.id]);

    const activeGlossaryTerms = aiAllGlossary.filter(g =>
        !g.movieId ||
        g.movieId === 'global' ||
        g.scope === 'global' ||
        g.movieId === movie.id ||
        (g.movieTitle && movie.title && g.movieTitle.toLowerCase() === movie.title.toLowerCase())
    );

    const fileRefs = {
        video: useRef<Record<string, HTMLInputElement | null>>({}),
        r2Video: useRef<Record<string, HTMLInputElement | null>>({}),
        origSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        transSrt: useRef<Record<string, HTMLInputElement | null>>({})
    };

    const showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 4000);
    };

    const seasons = movie.seasons || [];
    const totalEpisodes = seasons.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);

    // ─── AUTO-FETCH SYNOPSIS WITH FAST AI ───
    const fetchAiSynopsis = async () => {
        setFetchingSynopsis(true);
        try {
            const prompt = `کورتەیەکی سەرنجڕاکێش و پوخت بە کوردی سۆرانی (٢ بۆ ٣ دێڕ) بۆ ئەم زنجیرەیە یان فیلمە بنووسە: "${movie.title}".
تەنها دەقی کورتەکە بنووسە بەبێ هیچ پێشەکی، ناونیشان، یان کەوانەی زیادە.`;
            const res = await axios.post('/api/ai/generate', {
                contents: [{ parts: [{ text: prompt }] }],
                aiTask: 'synopsis',
                model: 'google/gemini-2.5-flash',
                max_tokens: 1000
            });
            const raw = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const clean = raw.replace(/```/g, '').replace(/^["']|["']$/g, '').trim();
            if (clean) {
                setAiStoryContext(clean);
                showToast('کورتەی چیرۆک بە سەرکەوتوویی لە AI وەرگیرا ✓');
            } else {
                showToast('نەتوانرا کورتە بە AI بدۆزرێتەوە');
            }
        } catch (err: any) {
            console.error('Synopsis fetch error:', err);
            const msg = err.response?.data?.error?.message || 'کێشەیەک لە پەیوەندی بە AI ڕوویدا';
            showToast(msg);
        } finally {
            setFetchingSynopsis(false);
        }
    };

    // ─── 1. DOWNLOAD ORIGINAL SRT ───
    const handleDownloadOriginalSrt = async (seasonNum: number, ep: Episode) => {
        try {
            const res = await axios.get(`/api/admin/movies/${movie.id}/srt-content`, {
                params: { seasonNum, episodeNum: ep.number }
            });
            const origText = res.data.originalSrtText || '';
            if (!origText.trim()) {
                showToast('فایلی ئۆرجیناڵ بەردەست نییە بۆ داگرتن');
                return;
            }
            triggerFileDownload(origText, `${movie.title}_S${seasonNum}E${ep.number}_original.srt`);
            showToast('فایلی ئۆرجیناڵ داگیرا ✓');
        } catch (err) {
            console.error(err);
            showToast('نەتوانرا فایلی ئۆرجیناڵ دابگیرێت');
        }
    };

    // ─── 2. DOWNLOAD KURDISH SRT ───
    const handleDownloadKurdishSrt = async (seasonNum: number, ep: Episode) => {
        try {
            const res = await axios.get(`/api/admin/movies/${movie.id}/srt-content`, {
                params: { seasonNum, episodeNum: ep.number }
            });
            const kurdishText = res.data.translatedSrtText || '';
            if (!kurdishText.trim()) {
                showToast('فایلی کوردی بەردەست نییە بۆ داگرتن');
                return;
            }
            triggerFileDownload(kurdishText, `${movie.title}_S${seasonNum}E${ep.number}_kurdish.srt`);
            showToast('فایلی ژێرنووسی کوردی داگیرا ✓');
        } catch (err) {
            console.error(err);
            showToast('نەتوانرا فایلی کوردی دابگیرێت');
        }
    };

    // ─── 3. DOWNLOAD LINGUISTIC ANALYSIS (.txt) ───
    const handleDownloadMetricsTxt = (seasonNum: number, ep: Episode) => {
        const m = ep.languageMetrics;
        if (!m) {
            showToast('ئاماری زمان بۆ ئەم ئەڵقەیە دروست نەکراوە');
            return;
        }

        const txtContent = `ئامارەکانی زمانی: ${movie.title} • سیزنی ${seasonNum} • ئەڵقەی ${ep.number} (${ep.title})\n\nسەرجەمی وشەکان: ${m.totalWords}\nئاستی گشتی CEFR: ${m.cefrLevel}\nچڕی فەرهەنگی: ${m.lexicalDensity}%\nجۆراوجۆری وشەکان: ${m.vocabDiversity}%\n\nدابەشبوونی ئاستەکانی زمان:\nA1: ${m.distribution?.A1 || 0}%\nA2: ${m.distribution?.A2 || 0}%\nB1: ${m.distribution?.B1 || 0}%\nB2: ${m.distribution?.B2 || 0}%\nC1: ${m.distribution?.C1 || 0}%\nC2: ${m.distribution?.C2 || 0}%\n\n١٠ وشە ئەکادیمی و پێشکەوتووەکان:\n${(m.difficultWords || []).map((w, idx) => `${idx + 1}. ${w.word} (${w.type}): ${w.definition}`).join('\n')}\n\nوشە دووبارەبووەکان:\n${(m.repeatedWords || []).map(w => `* ${w.word}: ${w.count} جار (${w.meaning || ''})`).join('\n')}`;

        triggerFileDownload(txtContent, `${movie.title}_S${seasonNum}E${ep.number}_analysis.txt`);
        showToast('فایلی شیکاریی زمانەوانی (.txt) داگیرا ✓');
    };

    // ─── DIRECT SRT UPLOAD (TEXT-BASED ENSURING 100% DISK & STATE SYNC) ───
    const handleDirectSrtUpload = async (seasonNum: number, episodeNum: number, file: File, srtType: 'original' | 'translated') => {
        try {
            const text = await file.text();
            const payload: any = {
                seasonNum,
                episodeNum
            };
            if (srtType === 'original') {
                payload.originalSrtText = text;
            } else {
                payload.translatedSrtText = text;
            }

            await axios.post(`/api/admin/movies/${movie.id}/srt-content`, payload);
            showToast(`فایلی ${srtType === 'original' ? 'ئۆرجیناڵ' : 'کوردی'} بارکرا ✓`);
            if (onReloadMovie) onReloadMovie();
        } catch (err) {
            console.error('Direct SRT upload failed, using fallback', err);
            onEpSrt(movie.id, seasonNum, episodeNum, file, srtType);
        }
    };

    // ─── 4. OPEN AI MASTER HUB FOR SINGLE EPISODE ───
    const openAiHubSingle = (seasonNum: number, ep: Episode) => {
        if (!ep.originalSrt) {
            showToast('تکایە سەرەتا فایلی ئۆرجیناڵی ئینگلیزی (Original) دابنێ');
            return;
        }
        if (!runningTaskForMovie || runningTaskForMovie.status !== 'running') {
            setAiRunning(false);
            setAiPercent(0);
            setAiProgressText('');
        }
        setPartialSrtInfo(null);
        setAiHubTarget({
            open: true,
            type: 'single',
            seasonNum,
            episode: ep
        });
        if (!aiStoryContext && (movie.descriptionKu || movie.description)) {
            setAiStoryContext(movie.descriptionKu || movie.description || '');
        }

        // Check if there is already partial translation
        axios.get(`/api/admin/movies/${movie.id}/srt-content`, {
            params: { seasonNum, episodeNum: ep.number }
        }).then(res => {
            const origText = res.data.originalSrtText || '';
            const transText = res.data.translatedSrtText || '';
            if (origText) {
                const origBlocks = parseSRT(origText);
                const transBlocks = parseSRT(transText);
                const transMap = new Map<string, string>();
                transBlocks.forEach(b => b.text.trim() && transMap.set(b.id, b.text));
                
                let done = 0;
                origBlocks.forEach(b => {
                    if (transMap.has(b.id)) done++;
                });

                if (done > 0 && done < origBlocks.length) {
                    setPartialSrtInfo({
                        totalLines: origBlocks.length,
                        translatedLines: done,
                        percent: Math.round((done / origBlocks.length) * 100)
                    });
                }
            }
        }).catch(() => {});
    };

    // ─── 5. OPEN AI MASTER HUB FOR BULK SEASON ───
    const openAiHubBulk = (season: Season) => {
        const episodesToTranslate = season.episodes.filter(e => e.originalSrt);
        if (episodesToTranslate.length === 0) {
            showToast('هیچ ئەڵقەیەک فایلی ئۆرجیناڵی (Original) نییە بۆ وەرگێڕان');
            return;
        }
        if (!runningTaskForMovie || runningTaskForMovie.status !== 'running') {
            setAiRunning(false);
            setAiPercent(0);
            setAiProgressText('');
        }
        setPartialSrtInfo(null);
        setAiHubTarget({
            open: true,
            type: 'bulk',
            seasonNum: season.number,
            season
        });
        if (!aiStoryContext && (movie.descriptionKu || movie.description)) {
            setAiStoryContext(movie.descriptionKu || movie.description || '');
        }
    };

    // ─── 6. START PROCESSING FROM AI MASTER HUB ───
    const startAiHubProcessing = async (mode: 'all' | 'translate_only' | 'analyze_only') => {
        if (!aiHubTarget) return;
        const targetType = aiHubTarget.type;
        const targetSeasonNum = aiHubTarget.seasonNum;
        const targetEpisode = aiHubTarget.episode;
        const targetSeason = aiHubTarget.season;

        const taskId = targetType === 'single'
            ? `${movie.id}-${targetSeasonNum}-${targetEpisode?.number}`
            : `${movie.id}-${targetSeasonNum}-bulk`;

        const abortController = new AbortController();
        aiAbortControllerRef.current = abortController;
        const signal = abortController.signal;

        const startTimestamp = Date.now();
        const initialStats = { totalInTok: 0, totalOutTok: 0, costUsd: 0, speedTokSec: 0, startTime: startTimestamp, elapsedSec: 0 };
        setAiStats(initialStats);
        setAiRunning(true);

        registerAiTask({
            taskId,
            movieId: movie.id,
            movieTitle: movie.title,
            seasonNum: targetSeasonNum,
            episodeNum: targetEpisode?.number,
            episodeId: targetEpisode?.id,
            type: targetType,
            model: aiSelectedModel,
            tone: aiSelectedTone,
            mode,
            status: 'running',
            percent: 5,
            statusText: 'دەستپێکردنی وەرگێڕان...',
            abortController,
            stats: initialStats,
            storyContext: aiStoryContext
        });

        const timerInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.max(1, Math.round((now - startTimestamp) / 1000));
            setAiStats(prev => ({ ...prev, elapsedSec: elapsed }));
        }, 1000);

        const updateAiStats = (inT: number, outT: number) => {
            setAiStats(prev => {
                const nextIn = prev.totalInTok + inT;
                const nextOut = prev.totalOutTok + outT;
                const pricing = MODEL_PRICING[aiSelectedModel] || { inPricePerM: 3.0, outPricePerM: 15.0 };
                const cost = (nextIn / 1_000_000) * pricing.inPricePerM + (nextOut / 1_000_000) * pricing.outPricePerM;
                const now = Date.now();
                const elapsed = Math.max(1, Math.round((now - startTimestamp) / 1000));
                const speed = Math.round(nextOut / elapsed);
                const stats = {
                    totalInTok: nextIn,
                    totalOutTok: nextOut,
                    costUsd: cost,
                    speedTokSec: speed,
                    startTime: startTimestamp,
                    elapsedSec: elapsed
                };
                updateAiTask(taskId, { stats });
                return stats;
            });
        };

        try {
            if (targetType === 'single' && targetEpisode) {
                const ep = targetEpisode;
                const seasonNum = targetSeasonNum;
                const epKey = `${seasonNum}-${ep.id}`;
                const epSpecific = ep.description ? ` | Episode Synopsis: "${ep.description}"` : '';
                const contextStr = `Show Title: "${movie.title}" | Season ${seasonNum}, Episode ${ep.number}: "${ep.title}"${epSpecific} | Genre: ${movie.genre || 'Drama'} | Main Story Arc: ${aiStoryContext}`;

                setAiProgressText(`دەستپێکردنی ئەڵقەی ${ep.number}...`);
                setAiPercent(5);
                setEpTransProgress(prev => ({
                    ...prev,
                    [epKey]: { status: 'running', statusText: 'وەرگێڕان بە AI...', percent: 5 }
                }));

                const result = await runAiTranslationAndAnalysis(
                    movie.id,
                    seasonNum,
                    ep.number,
                    (statusText, percent, status) => {
                        setAiProgressText(statusText);
                        setAiPercent(percent);
                        updateAiTask(taskId, { statusText, percent, status });
                        setEpTransProgress(prev => ({
                            ...prev,
                            [epKey]: { status, statusText, percent }
                        }));
                    },
                    {
                        model: aiSelectedModel,
                        tone: aiSelectedTone,
                        mode,
                        contextStr,
                        glossaryTerms: activeGlossaryTerms,
                        signal,
                        onStatsUpdate: updateAiStats
                    }
                );

                if (result.status === 'paused') {
                    showToast(`وەرگێڕانی ئەڵقەی ${ep.number} ڕاگیرا ⏸️`);
                    updateAiTask(taskId, { status: 'paused', statusText: 'وەرگێڕان ڕاگیرا' });
                } else {
                    const updatedSeasons = (movie.seasons || []).map(s => {
                        if (s.number !== seasonNum) return s;
                        return {
                            ...s,
                            episodes: s.episodes.map(e => {
                                if (e.id !== ep.id) return e;
                                return {
                                    ...e,
                                    translatedSrt: mode === 'analyze_only' ? (e.translatedSrt || null) : 'translated.srt',
                                    languageMetrics: result.metrics || e.languageMetrics
                                };
                            })
                        };
                    });
                    await axios.put(`/api/admin/movies/${movie.id}`, { seasons: updatedSeasons });
                    showToast(`ئەڵقەی ${ep.number} بە سەرکەوتوویی تەواو بوو! ✓`);
                    removeAiTask(taskId);
                    setEpTransProgress(prev => {
                        const next = { ...prev };
                        delete next[epKey];
                        return next;
                    });
                }
            } else if (targetType === 'bulk' && targetSeason) {
                const season = targetSeason;
                const eps = season.episodes.filter(e => e.originalSrt);
                if (eps.length === 0) {
                    showToast('هیچ ئەڵقەیەک فایلی ئۆرجیناڵی نییە');
                    setAiRunning(false);
                    removeAiTask(taskId);
                    return;
                }

                let doneCount = 0;
                let workingSeasons: Season[] = JSON.parse(JSON.stringify(movie.seasons || []));

                for (const ep of eps) {
                    if (signal.aborted) break;
                    const epSpecific = ep.description ? ` | Episode Synopsis: "${ep.description}"` : '';
                    const contextStr = `Show Title: "${movie.title}" | Season ${season.number}, Episode ${ep.number}: "${ep.title}"${epSpecific} | Genre: ${movie.genre || 'Drama'} | Main Story Arc: ${aiStoryContext}`;

                    setAiProgressText(`وەرگێڕانی ئەڵقەی ${ep.number} (${doneCount + 1}/${eps.length})...`);
                    const epKey = `${season.number}-${ep.id}`;
                    setEpTransProgress(prev => ({
                        ...prev,
                        [epKey]: { status: 'running', statusText: 'وەرگێڕان...', percent: 10 }
                    }));

                    const result = await runAiTranslationAndAnalysis(
                        movie.id,
                        season.number,
                        ep.number,
                        (statusText, percent, status) => {
                            const fullStatusText = `ئەڵقەی ${ep.number} (${doneCount + 1}/${eps.length}): ${statusText}`;
                            setAiProgressText(fullStatusText);
                            const totalPct = Math.round(((doneCount * 100) + percent) / eps.length);
                            setAiPercent(totalPct);
                            updateAiTask(taskId, { statusText: fullStatusText, percent: totalPct, status });
                            setEpTransProgress(prev => ({
                                ...prev,
                                [epKey]: { status, statusText, percent }
                            }));
                        },
                        {
                            model: aiSelectedModel,
                            tone: aiSelectedTone,
                            mode,
                            contextStr,
                            glossaryTerms: activeGlossaryTerms,
                            signal,
                            onStatsUpdate: updateAiStats
                        }
                    );

                    if (result.status === 'done') {
                        doneCount++;
                        workingSeasons = workingSeasons.map((s: Season) => {
                            if (s.number !== season.number) return s;
                            return {
                                ...s,
                                episodes: s.episodes.map((e: Episode) => {
                                    if (e.id !== ep.id) return e;
                                    return {
                                        ...e,
                                        translatedSrt: mode === 'analyze_only' ? (e.translatedSrt || null) : 'translated.srt',
                                        languageMetrics: result.metrics || e.languageMetrics
                                    };
                                })
                            };
                        });
                        await axios.put(`/api/admin/movies/${movie.id}`, { seasons: workingSeasons });
                    }
                }
                removeAiTask(taskId);
                showToast(`تەواوی وەرزی ${season.number} (${doneCount} ئەڵقە) بە سەرکەوتوویی تەواو بوو! ✓`);
            }
        } catch (err: any) {
            if (!signal.aborted) {
                console.error('AI Hub Error:', err);
                const msg = err.response?.data?.error?.message || err.message || 'هەڵەیەک ڕوویدا';
                setAiProgressText(`❌ کێشە: ${msg}`);
                setAiPercent(0);
                showToast(`❌ ${msg}`);
                updateAiTask(taskId, { status: 'error', error: msg, statusText: `❌ ${msg}` });
            }
        } finally {
            clearInterval(timerInterval);
            setAiRunning(false);
            if (onReloadMovie) onReloadMovie();
        }
    };

    // ─── 7. STOP AI HUB PROCESSING ───
    const stopAiHubProcessing = () => {
        if (aiAbortControllerRef.current) {
            aiAbortControllerRef.current.abort();
        }
        if (runningTaskForMovie) {
            stopAiTask(runningTaskForMovie.taskId);
        }
        setAiRunning(false);
        setEpTransProgress(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => {
                if (next[k].status === 'running') {
                    next[k] = { ...next[k], status: 'paused', statusText: 'ڕاگیراوە' };
                }
            });
            return next;
        });
        showToast('وەرگێڕان دەستبەجێ وەستێنرا 🛑');
    };

    const handleModelChange = (modelId: string) => {
        setAiSelectedModel(modelId);
        localStorage.setItem('ks_srt_ai_model', modelId);
    };

    const handleToneChange = (toneId: string) => {
        setAiSelectedTone(toneId);
        localStorage.setItem('ks_srt_tone', toneId);
    };

    // ─── 6. DELETE EPISODE VIDEO ───
    const handleDeleteEpisodeVideo = async (seasonNum: number, ep: Episode) => {
        if (!window.confirm(`ئایا دڵنیایت لە سڕینەوەی فایلی ڤیدیۆی ئەڵقەی ${ep.number} لە سێرڤەر؟`)) return;
        try {
            await axios.delete(`/api/admin/movies/${movie.id}/seasons/${seasonNum}/episodes/${ep.number}/video`);
            showToast(`فایلی ڤیدیۆی ئەڵقەی ${ep.number} بە سەرکەوتوویی سڕایەوە ✓`);
            if (onReloadMovie) onReloadMovie();
        } catch {
            showToast('کێشەیەک لە سڕینەوەی ڤیدیۆ ڕوویدا');
        }
    };

    // ─── 7. DELETE EPISODE SUBTITLE ───
    const handleDeleteEpisodeSrt = async (seasonNum: number, ep: Episode, srtType: 'original' | 'translated') => {
        const label = srtType === 'translated' ? 'سەبتایتڵی کوردی' : 'سەبتایتڵی ئۆرجیناڵ';
        if (!window.confirm(`ئایا دڵنیایت لە سڕینەوەی ${label}ی ئەڵقەی ${ep.number}؟`)) return;
        try {
            await axios.delete(`/api/admin/movies/${movie.id}/seasons/${seasonNum}/episodes/${ep.number}/srt/${srtType}`);
            showToast(`${label}ی ئەڵقەی ${ep.number} بە سەرکەوتوویی سڕایەوە ✓`);
            if (onReloadMovie) onReloadMovie();
        } catch {
            showToast(`کێشەیەک لە سڕینەوەی ${label} ڕوویدا`);
        }
    };

    const handleToggleEpStatus = async (seasonNum: number, ep: Episode) => {
        const isCurrentlyPublished = ep.status === 'published';
        const targetStatus: 'published' | 'draft' = isCurrentlyPublished ? 'draft' : 'published';

        try {
            const updatedMovie = JSON.parse(JSON.stringify(movie));
            const season = updatedMovie.seasons?.find((s: Season) => s.number === seasonNum);
            const targetEp = season?.episodes?.find((e: Episode) => e.id === ep.id);
            if (targetEp) {
                targetEp.status = targetStatus;
            }
            await axios.put(`/api/admin/movies/${movie.id}`, updatedMovie);
            showToast(targetStatus === 'published' 
                ? `ئەڵقەی ${ep.number} بڵاوکرایەوە بۆ بینەران 🌐` 
                : `ئەڵقەی ${ep.number} خرایە دۆخی تەکنیک و وەرگێڕان 🛠️`);
            if (onReloadMovie) onReloadMovie();
        } catch (err: any) {
            showToast(err.response?.data?.error || 'کێشەیەک ڕووی دا');
        }
    };

    // A task is running ONLY when locally running OR running in global background task registry
    const isTaskRunning = Boolean(aiRunning || (runningTaskForMovie && runningTaskForMovie.status === 'running'));

    const currentRunningTask = runningTaskForMovie && runningTaskForMovie.status === 'running' ? runningTaskForMovie : null;
    const displayStats = isTaskRunning && currentRunningTask?.stats ? currentRunningTask.stats : aiStats;
    const displayPercent = isTaskRunning && currentRunningTask ? currentRunningTask.percent : (isTaskRunning ? aiPercent : 0);
    const displayProgressText = isTaskRunning && currentRunningTask ? currentRunningTask.statusText : aiProgressText;



    return (
        <div className="ep-modal-backdrop" onClick={onClose}>
            <div className={`ep-modal-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="ep-modal-header">
                    <div className="ep-modal-header-left">
                        <button className="ep-modal-close-btn" onClick={onClose}>
                            <X size={18} />
                        </button>
                        <button className="btn-add-season-pill" onClick={() => onAddSeason(movie.id)}>
                            {lang === 'en' ? '+ New Season' : '+ سیزنی نوێ'}
                        </button>
                    </div>
                    <div className="ep-modal-header-right">
                        <h2>{lang === 'en' ? 'Manage Episodes:' : 'بەڕێوەبردنی ئەڵقەکانی:'} {movie.title}</h2>
                        <p>{seasons.length} {lang === 'en' ? 'Seasons' : 'وەرز'} • {totalEpisodes} {lang === 'en' ? 'Episodes' : 'ئەڵقە'}</p>
                    </div>
                </div>

                {/* Toast Notification */}
                {toastMsg && (
                    <div className="ep-modal-toast">
                        <Sparkles size={16} />
                        <span>{toastMsg}</span>
                    </div>
                )}

                {/* Body */}
                <div className="ep-modal-body">
                    {seasons.length === 0 ? (
                        <div className="ep-empty-state">
                            <PlusCircle size={48} color="#8b5cf6" />
                            <h3>{lang === 'en' ? 'No Seasons Yet!' : 'هیچ وەرزێک نییە!'}</h3>
                            <p>{lang === 'en' ? "Click 'New Season' button above to create the first season." : "کلیک لە دوگمەی 'سیزنی نوێ' بکە بۆ دروستکردنی یەکەم سیزن."}</p>
                            <button className="btn-add-season-pill" onClick={() => onAddSeason(movie.id)}>
                                {lang === 'en' ? '+ Add Season' : '+ زیادکردنی سیزن'}
                            </button>
                        </div>
                    ) : (
                        seasons.map(season => {
                            const sortedEpisodes = [...(season.episodes || [])].sort((a, b) => a.number - b.number);
                            const isBulkTranslating = bulkTranslatingSeason === season.number;

                            return (
                                <div key={season.id || season.number} className="season-card-block">
                                    {/* Season Header */}
                                    <div className="season-card-header">
                                        <div className="season-card-actions">
                                            {onDeleteSeason && (
                                                <button
                                                    className="season-action-btn del"
                                                    title={lang === 'en' ? 'Delete Season' : 'سڕینەوەی سیزن'}
                                                    onClick={() => onDeleteSeason(movie.id, season.number)}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}

                                            {/* BULK SEASON AI TRANSLATION BUTTON (Icon Only) */}
                                            <button
                                                className="season-action-btn bulk-ai"
                                                disabled={isBulkTranslating || sortedEpisodes.length === 0}
                                                onClick={() => openAiHubBulk(season)}
                                                title={isBulkTranslating ? bulkProgressText : (lang === 'en' ? "Bulk Translate Season via AI Master" : "وەرگێڕانی هەمووی بە AI Master (ژیری دەستکرد)")}
                                            >
                                                {isBulkTranslating ? (
                                                    <Loader2 size={15} className="spinning" />
                                                ) : (
                                                    <Sparkles size={15} />
                                                )}
                                            </button>

                                            <button
                                                className="season-action-btn add-ep"
                                                onClick={() => onAddEpisode(movie.id, season.number)}
                                            >
                                                <Plus size={14} />
                                                <span>{lang === 'en' ? 'New Episode' : 'ئەڵقەی نوێ'}</span>
                                            </button>

                                            {/* Bulk Add Input */}
                                            <div className="season-bulk-wrap">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    placeholder={lang === 'en' ? 'Count' : 'ژمارە'}
                                                    value={bulkCounts[season.number] || ''}
                                                    onChange={e => setBulkCounts({ ...bulkCounts, [season.number]: e.target.value })}
                                                    className="season-bulk-input"
                                                />
                                                <button
                                                    className="season-bulk-submit-btn"
                                                    disabled={!bulkCounts[season.number] || Number(bulkCounts[season.number]) <= 0}
                                                    onClick={() => {
                                                        onBulkAdd(movie.id, season.number, Number(bulkCounts[season.number]));
                                                        setBulkCounts({ ...bulkCounts, [season.number]: '' });
                                                    }}
                                                >
                                                    {lang === 'en' ? 'Bulk Add' : 'زیادکردنی بەکۆمەڵ'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="season-title-info">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                <h3>{lang === 'en' ? `Season ${season.number}` : `سیزنی ${season.number}`}</h3>
                                                <span className="season-stats-badge">
                                                    🎬 {lang === 'en' ? 'Video' : 'ڤیدیۆ'}: {sortedEpisodes.filter((e: Episode) => e.videoUrl || e.videoFile).length}/{sortedEpisodes.length} | 📝 {lang === 'en' ? 'Subtitles' : 'سەبتایتڵ'}: {sortedEpisodes.filter((e: Episode) => e.translatedSrt).length}/{sortedEpisodes.length}
                                                </span>
                                            </div>
                                            <span>{sortedEpisodes.length} {lang === 'en' ? 'Episodes' : 'ئەڵقە'}</span>
                                        </div>
                                    </div>

                                    {/* Episode Cards Grid */}
                                    <div className="episodes-cards-grid">
                                        {sortedEpisodes.map((ep: Episode) => {
                                            const epEffectiveVideoUrl = ep.videoUrl || (ep.videoFile ? `/uploads/movies/${movie.id}/seasons/s${season.number}/e${ep.number}/${ep.videoFile}` : '');
                                            const epKey = `${season.number}-${ep.id}`;
                                            const isTranslatingThis = epTransProgress[epKey]?.status === 'running';
                                            const hasVideo = !!(ep.videoUrl || ep.videoFile);
                                            const hasSub = !!ep.translatedSrt;
                                            const hasSensitive = !!(ep.sensitiveScenes && ep.sensitiveScenes.length > 0);

                                            return (
                                                <div key={ep.id} className={`ep-item-card ${hasSub ? 'has-subtitles-card' : ''}`}>
                                                    {/* Top Bar: Action Icons + Title & Badge */}
                                                    <div className="ep-item-top">
                                                        <div className="ep-item-actions-left">
                                                            {onDeleteEpisode && (
                                                                <button
                                                                    className="ep-action-btn del"
                                                                    title={lang === 'en' ? 'Delete Episode' : 'سڕینەوەی ئەڵقە'}
                                                                    onClick={() => onDeleteEpisode(movie.id, season.number, ep.id)}
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            )}
                                                            <button
                                                                className="ep-action-btn edit"
                                                                title={lang === 'en' ? 'Edit Episode Info' : 'دەستکاریکردنی زانیاری ئەڵقە'}
                                                                onClick={() => onEditEpisode(movie.id, season.number, ep)}
                                                            >
                                                                <Edit3 size={13} />
                                                            </button>
                                                            <button
                                                                className="ep-action-btn srt-editor-btn"
                                                                title={lang === 'en' ? 'Edit Subtitles with Video' : 'ئیدیتکردنی هەردوو سەبتایتڵ لەگەڵ ڤیدیۆکە'}
                                                                onClick={() => onOpenSrtEditor(movie.id, movie.title, season.number, ep.number, ep.title, epEffectiveVideoUrl)}
                                                            >
                                                                <BarChart2 size={13} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`ep-action-btn status-btn ${ep.status === 'published' ? 'is-published' : 'is-draft'}`}
                                                                title={ep.status === 'published' 
                                                                    ? "بڵاوکراوەتەوە بۆ بینەران - کلیک بکە بۆ گۆڕین بۆ دۆخی تەکنیک و وەرگێڕان" 
                                                                    : "لە دۆخی تەکنیک و وەرگێڕاندایە (تەنها ئەدمین) - کلیک بکە بۆ بڵاوکردنەوە بۆ بینەران"}
                                                                onClick={() => handleToggleEpStatus(season.number, ep)}
                                                            >
                                                                {ep.status === 'published' ? <Globe size={13} color="#34d399" /> : <Wrench size={13} color="#fbbf24" />}
                                                            </button>
                                                            {(() => {
                                                                const isReserved = Boolean(ep.reservation && ep.reservation.expiresAt > Date.now());
                                                                const isMyReserve = Boolean(isReserved && ep.reservation?.userId === user?.id);
                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        className={`ep-action-btn reserve-btn ${isReserved ? (isMyReserve ? 'my-reserve' : 'other-reserve') : ''}`}
                                                                        title={isReserved 
                                                                            ? `🔒 حجزکراوە لەلایەن: ${ep.reservation?.username} (${getReservationRemainingLabel(ep.reservation!.expiresAt)}) - کلیک بکە بۆ بەڕێوەبردن`
                                                                            : 'حیجزکردنی ئەم ئەڵقەیە بۆ خۆت (مۆڵەتی کاتی)'}
                                                                        onClick={() => {
                                                                            setReserveDaysInput(ep.reservation?.days || 5);
                                                                            setReserveTarget({ seasonNum: season.number, ep });
                                                                        }}
                                                                    >
                                                                        <Lock size={13} color={isReserved ? (isMyReserve ? '#c084fc' : '#fbbf24') : undefined} />
                                                                    </button>
                                                                );
                                                            })()}
                                                        </div>
                                                        <div className="ep-item-info-right">
                                                            <div className="ep-title-row">
                                                                <span className="ep-title-text">{ep.title}</span>
                                                                <span className="ep-number-badge">{ep.number}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                                                                {(() => {
                                                                    const isReserved = Boolean(ep.reservation && ep.reservation.expiresAt > Date.now());
                                                                    if (!isReserved) return null;
                                                                    const isMyReserve = Boolean(ep.reservation?.userId === user?.id);
                                                                    const remainingText = getReservationRemainingLabel(ep.reservation!.expiresAt);
                                                                    return (
                                                                        <span
                                                                            className={`ep-status-tag reservation-tag ${isMyReserve ? 'my-reserve' : 'other-reserve'}`}
                                                                            title={`حجزکراوە تا: ${new Date(ep.reservation!.expiresAt).toLocaleDateString('ckb')}`}
                                                                            onClick={() => {
                                                                                setReserveDaysInput(ep.reservation?.days || 5);
                                                                                setReserveTarget({ seasonNum: season.number, ep });
                                                                            }}
                                                                            style={{ cursor: 'pointer' }}
                                                                        >
                                                                            <Lock size={10} /> 🔒 {ep.reservation?.username} ({remainingText})
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {hasVideo && hasSub ? (
                                                                    <span className="ep-status-tag ready">✅ {lang === 'en' ? 'Ready' : 'بە تەواوی ئامادەیە'}</span>
                                                                ) : hasSub ? (
                                                                    <span className="ep-status-tag sub-only">📝 {lang === 'en' ? 'Subtitles Present' : 'سەبتایتڵ هەیە'}</span>
                                                                ) : hasVideo ? (
                                                                    <span className="ep-status-tag video-only">🎬 {lang === 'en' ? 'Video Present' : 'ڤیدیۆ هەیە'}</span>
                                                                ) : (
                                                                    <span className="ep-status-tag missing">⏳ {lang === 'en' ? 'Empty' : 'بەتاڵە'}</span>
                                                                )}
                                                                {hasSensitive && (
                                                                    <span className="ep-status-tag sensitive">🛡️ {lang === 'en' ? 'Sensitive Scenes' : 'دیمەنی نەشیاو'} ({ep.sensitiveScenes?.length})</span>
                                                                )}
                                                                {ep.duration && <span className="ep-duration-text">{ep.duration}</span>}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Section 1: Video */}
                                                    <div className="ep-section-group">
                                                        <div className="ep-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span>{lang === 'en' ? 'Video' : 'ڤیدیۆ'}</span>
                                                            {hasVideo && (
                                                                <button 
                                                                    type="button"
                                                                    className="ep-delete-chip" 
                                                                    title={lang === 'en' ? 'Delete video for this episode' : 'سڕینەوەی ڤیدیۆی ئەم ئەڵقەیە لە سێرڤەر'} 
                                                                    onClick={() => handleDeleteEpisodeVideo(season.number, ep)}
                                                                >
                                                                    <Trash2 size={11} /> <span>{lang === 'en' ? 'Delete' : 'سڕینەوە'}</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="ep-buttons-row">
                                                            <button
                                                                className={`ep-source-btn ${ep.videoUrl && !ep.videoUrl.includes('r2') ? 'done' : ''}`}
                                                                onClick={() => {
                                                                    const u = window.prompt(lang === 'en' ? 'Episode Video URL:' : 'URL ڤیدیۆی ئەڵقە:', ep.videoUrl || '');
                                                                    if (u !== null) onEpVideoUrl(movie.id, season.number, ep.id, u);
                                                                }}
                                                            >
                                                                <LinkIcon size={14} />
                                                                <span>Link</span>
                                                            </button>
                                                            <input
                                                                type="file"
                                                                className="hidden-input"
                                                                ref={el => { fileRefs.video.current[ep.id] = el; }}
                                                                onChange={e => e.target.files?.[0] && onEpVideo(movie.id, season.number, ep.number, e.target.files[0])}
                                                            />
                                                            <button
                                                                className={`ep-source-btn ${ep.videoFile ? 'done' : ''}`}
                                                                onClick={() => fileRefs.video.current[ep.id]?.click()}
                                                            >
                                                                {uploading[`${movie.id}-ep-video-${season.number}-${ep.number}`] ? (
                                                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                        <Loader2 size={12} className="spinning" />
                                                                        <span>{uploadProgress[`${movie.id}-ep-video-${season.number}-${ep.number}`] || 0}%</span>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <Video size={14} />
                                                                        <span>Server</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Section 2: Subtitles */}
                                                    <div className="ep-section-group">
                                                        <div className="ep-section-label">{lang === 'en' ? 'Subtitles' : 'ژێرنووس'}</div>
                                                        <div className="ep-buttons-row">
                                                            {/* Kurdish SRT Block */}
                                                            <div className="ep-srt-combined-btn">
                                                                <input
                                                                    type="file"
                                                                    className="hidden-input"
                                                                    ref={el => { fileRefs.transSrt.current[ep.id] = el; }}
                                                                    onChange={e => e.target.files?.[0] && handleDirectSrtUpload(season.number, ep.number, e.target.files[0], 'translated')}
                                                                />
                                                                <button
                                                                    className={`ep-source-btn ${ep.translatedSrt ? 'done' : ''}`}
                                                                    onClick={() => fileRefs.transSrt.current[ep.id]?.click()}
                                                                    title={lang === 'en' ? 'Upload Kurdish Subtitle' : 'داغڵکردنی فایلی کوردی ئامادەکراو'}
                                                                >
                                                                    {uploading[`${movie.id}-ep-srt-${season.number}-${ep.number}-translated`] ? (
                                                                        <Loader2 size={12} className="spinning" />
                                                                    ) : (
                                                                        <Languages size={14} />
                                                                    )}
                                                                    <span>Kurdish</span>
                                                                </button>

                                                                <div className="ep-srt-sub-actions">
                                                                    {/* AI Translate Single Episode Button */}
                                                                    {(() => {
                                                                        const epProg = epTransProgress[`${season.number}-${ep.id}`];
                                                                        const isEpRunning = epProg?.status === 'running';
                                                                        const isEpPaused = epProg?.status === 'paused';

                                                                        return (
                                                                            <button
                                                                                className={`ep-srt-action-chip btn-chip-ai ${isEpRunning ? 'running' : ''} ${isEpPaused ? 'paused' : ''}`}
                                                                                onClick={() => openAiHubSingle(season.number, ep)}
                                                                                title={lang === 'en' ? "Open AI Master Hub for this episode" : "کردنەوەی AI Master Hub بۆ ئەم ئەڵقەیە"}
                                                                            >
                                                                                {isEpRunning ? (
                                                                                    <>
                                                                                        <Pause size={10} />
                                                                                        <span>{lang === 'en' ? 'Pause' : 'ڕاگرتن'} ({epProg.percent}%)</span>
                                                                                    </>
                                                                                ) : isEpPaused ? (
                                                                                    <>
                                                                                        <Play size={10} fill="#fbbf24" color="#fbbf24" />
                                                                                        <span>{lang === 'en' ? 'Resume' : 'دەستپێکردنەوە'} ({epProg.percent}%)</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Sparkles size={10} />
                                                                                        <span>{lang === 'en' ? 'AI Translate' : 'وەرگێڕان AI'}</span>
                                                                                    </>
                                                                                )}
                                                                            </button>
                                                                        );
                                                                    })()}

                                                                    {/* Download Kurdish SRT Button */}
                                                                    {ep.translatedSrt && (
                                                                        <button
                                                                            className="ep-srt-action-chip btn-chip-dl"
                                                                            onClick={() => handleDownloadKurdishSrt(season.number, ep)}
                                                                            title={lang === 'en' ? 'Download Kurdish Subtitles (.srt)' : 'داگرتنی فایلی سەبتایتڵی کوردی (.srt)'}
                                                                        >
                                                                            <Download size={10} />
                                                                            <span>{lang === 'en' ? 'Download' : 'داگرتن'}</span>
                                                                        </button>
                                                                    )}

                                                                    <button
                                                                        className="ep-srt-action-chip btn-chip-edit"
                                                                        title={lang === 'en' ? 'Edit Subtitle with Video' : 'ئیدیتکردنی سەبتایتڵ بە شاشە'}
                                                                        onClick={() => onOpenSrtEditor(movie.id, movie.title, season.number, ep.number, ep.title, epEffectiveVideoUrl)}
                                                                    >
                                                                        <Edit3 size={10} />
                                                                    </button>

                                                                    {/* Delete Kurdish SRT Button */}
                                                                    {ep.translatedSrt && (
                                                                        <button
                                                                            className="ep-srt-action-chip btn-chip-del"
                                                                            onClick={() => handleDeleteEpisodeSrt(season.number, ep, 'translated')}
                                                                            title={lang === 'en' ? 'Delete Kurdish Subtitle' : 'سڕینەوەی سەبتایتڵی کوردی'}
                                                                        >
                                                                            <Trash2 size={10} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Original SRT Block */}
                                                            <div className="ep-srt-combined-btn">
                                                                <input
                                                                    type="file"
                                                                    className="hidden-input"
                                                                    ref={el => { fileRefs.origSrt.current[ep.id] = el; }}
                                                                    onChange={e => e.target.files?.[0] && handleDirectSrtUpload(season.number, ep.number, e.target.files[0], 'original')}
                                                                />
                                                                <button
                                                                    className={`ep-source-btn ${ep.originalSrt ? 'done' : ''}`}
                                                                    onClick={() => fileRefs.origSrt.current[ep.id]?.click()}
                                                                    title={lang === 'en' ? 'Upload Original English Subtitle' : 'داغڵکردنی فایلی ئۆرجیناڵی ئینگلیزی'}
                                                                >
                                                                    {uploading[`${movie.id}-ep-srt-${season.number}-${ep.number}-original`] ? (
                                                                        <Loader2 size={12} className="spinning" />
                                                                    ) : (
                                                                        <FileText size={14} />
                                                                    )}
                                                                    <span>Original</span>
                                                                </button>

                                                                <div className="ep-srt-sub-actions">
                                                                    {/* Download Original SRT Button */}
                                                                    {ep.originalSrt && (
                                                                        <button
                                                                            className="ep-srt-action-chip btn-chip-dl"
                                                                            onClick={() => handleDownloadOriginalSrt(season.number, ep)}
                                                                            title={lang === 'en' ? 'Download Original Subtitle (.srt)' : 'داگرتنی فایلی سەبتایتڵی ئۆرجیناڵ (.srt)'}
                                                                        >
                                                                            <Download size={10} />
                                                                            <span>{lang === 'en' ? 'Download' : 'داگرتن'}</span>
                                                                        </button>
                                                                    )}

                                                                    <button
                                                                        className="ep-srt-action-chip btn-chip-edit"
                                                                        title={lang === 'en' ? 'Edit Subtitle with Video' : 'ئیدیتکردنی سەبتایتڵ بە شاشە'}
                                                                        onClick={() => onOpenSrtEditor(movie.id, movie.title, season.number, ep.number, ep.title, epEffectiveVideoUrl)}
                                                                    >
                                                                        <Edit3 size={10} />
                                                                        <span>{lang === 'en' ? 'Edit' : 'چاککردن'}</span>
                                                                    </button>

                                                                    {/* Delete Original SRT Button */}
                                                                    {ep.originalSrt && (
                                                                        <button
                                                                            className="ep-srt-action-chip btn-chip-del"
                                                                            onClick={() => handleDeleteEpisodeSrt(season.number, ep, 'original')}
                                                                            title={lang === 'en' ? 'Delete Original Subtitle' : 'سڕینەوەی سەبتایتڵی ئۆرجیناڵ'}
                                                                        >
                                                                            <Trash2 size={10} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Section 3: Extra Features */}
                                                    <div className="ep-section-group">
                                                        <div className="ep-section-label">{lang === 'en' ? 'Advanced' : 'تایبەتمەندی تر'}</div>
                                                        <div className="ep-buttons-row">
                                                            {onOpenMetricsModal && (
                                                                <button
                                                                    className={`ep-source-btn ${ep.languageMetrics ? 'done' : ''}`}
                                                                    style={{ borderColor: ep.languageMetrics ? '#059669' : 'rgba(124, 58, 237, 0.4)', color: ep.languageMetrics ? '#047857' : '#6d28d9', fontWeight: 600 }}
                                                                    onClick={() => onOpenMetricsModal(movie, season.number, ep)}
                                                                    title={lang === 'en' ? 'Manage Language Metrics' : 'پەیستکردن و بەڕێوەبردنی ئامارەکانی زمانی ئەم ئەڵقەیە'}
                                                                >
                                                                    <BarChart2 size={14} />
                                                                    <span>{lang === 'en' ? 'Language Metrics' : 'ئامارەکانی زمان'}</span>
                                                                </button>
                                                            )}

                                                            {/* Download Analysis TXT Button on Episode Card */}
                                                            {ep.languageMetrics && (
                                                                <button
                                                                    className="ep-source-btn done"
                                                                    style={{ borderColor: '#7c3aed', color: '#6d28d9', background: 'rgba(124, 58, 237, 0.12)', fontWeight: 600 }}
                                                                    onClick={() => handleDownloadMetricsTxt(season.number, ep)}
                                                                    title={lang === 'en' ? 'Download Linguistic Analysis (.txt)' : 'داگرتنی فایلی شیکاریی زمانەوانی (.txt)'}
                                                                >
                                                                    <Download size={14} />
                                                                    <span>{lang === 'en' ? 'Download (.txt)' : 'داگرتنی ئامار (.txt)'}</span>
                                                                </button>
                                                            )}

                                                            <button
                                                                className={`ep-source-btn sensitive-btn ${ep.sensitiveScenes?.length ? 'has-sensitive' : ''}`}
                                                                onClick={() => onSensitive(movie.id, season.number, ep.id)}
                                                            >
                                                                <Shield size={14} />
                                                                <span>{lang === 'en' ? 'Sensitive Scenes' : 'دیمەنی نەشیاو'}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* ─── FLOATING LIVE MINI-TRACKER (When AI runs in background and hub modal is closed) ─── */}
                {runningTaskForMovie && !aiHubTarget && (
                    <div className="ep-floating-ai-tracker">
                        <div className="tracker-right">
                            <div className="tracker-spinner">
                                <Sparkles size={16} className="spinning" />
                            </div>
                            <div className="tracker-details">
                                <div className="tracker-header">
                                    <strong>
                                        {runningTaskForMovie.type === 'single'
                                            ? `وەرگێڕانی زیرەک: وەرزی ${runningTaskForMovie.seasonNum} • ئەڵقەی ${runningTaskForMovie.episodeNum}`
                                            : `وەرگێڕانی بەکۆمەڵ: تەواوی وەرزی ${runningTaskForMovie.seasonNum}`}
                                    </strong>
                                    <span className="tracker-pct-pill">{runningTaskForMovie.percent}%</span>
                                </div>
                                <div className="tracker-subtext">
                                    <span>{runningTaskForMovie.statusText}</span>
                                    <span className="tracker-cost">خەرجی: ${runningTaskForMovie.stats?.costUsd?.toFixed(4) || '0.0000'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="tracker-left">
                            <button
                                type="button"
                                className="btn-tracker-expand"
                                onClick={() => {
                                    if (runningTaskForMovie.type === 'single') {
                                        const season = seasons.find(s => s.number === runningTaskForMovie.seasonNum);
                                        const ep = season?.episodes?.find(e => e.number === runningTaskForMovie.episodeNum);
                                        setAiHubTarget({
                                            open: true,
                                            type: 'single',
                                            seasonNum: runningTaskForMovie.seasonNum || 1,
                                            episode: ep
                                        });
                                    } else {
                                        const season = seasons.find(s => s.number === runningTaskForMovie.seasonNum);
                                        setAiHubTarget({
                                            open: true,
                                            type: 'bulk',
                                            seasonNum: runningTaskForMovie.seasonNum || 1,
                                            season
                                        });
                                    }
                                }}
                            >
                                <Maximize2 size={13} />
                                <span>پیشاندانی وردەکاری</span>
                            </button>
                            <button
                                type="button"
                                className="btn-tracker-stop"
                                onClick={() => stopAiTask(runningTaskForMovie.taskId)}
                                title="ڕاگرتنی دەستبەجێ"
                            >
                                <X size={13} />
                                <span>ڕاگرتن</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── AI MASTER HUB MODAL ─── */}
                {aiHubTarget && aiHubTarget.open && (
                    <div className="ep-ai-hub-backdrop" onClick={() => setAiHubTarget(null)}>
                        <div className="ep-ai-hub-modal" onClick={e => e.stopPropagation()}>
                            {/* Hub Header */}
                            <div className="ep-ai-hub-header">
                                <div className="ep-ai-hub-header-right">
                                    <div className="ep-ai-hub-badge">
                                        <Sparkles size={14} />
                                        <span>AI Master Translation Hub</span>
                                    </div>
                                    <h3>
                                        {aiHubTarget.type === 'single'
                                            ? `وەرگێڕانی زیرەک بۆ ${movie.title} • سیزنی ${aiHubTarget.seasonNum} • ئەڵقەی ${aiHubTarget.episode?.number}`
                                            : `وەرگێڕانی بەکۆمەڵ بۆ ${movie.title} • تەواوی سیزنی ${aiHubTarget.seasonNum} (${aiHubTarget.season?.episodes?.filter(e => e.originalSrt).length || 0} ئەڵقە)`}
                                    </h3>
                                </div>
                                <div className="ep-ai-hub-header-left">
                                    {isTaskRunning && (
                                        <button
                                            type="button"
                                            className="btn-header-stop-chip"
                                            onClick={stopAiHubProcessing}
                                            title="ڕاگرتنی وەرگێڕان"
                                        >
                                            <X size={14} />
                                            <span>🛑 ڕاگرتن</span>
                                        </button>
                                    )}
                                    <button
                                        className="ep-modal-close-btn"
                                        onClick={() => setAiHubTarget(null)}
                                        title="داخستنی پەنجەرە (وەرگێڕان لە پاشبنەما بەردەوام دەبێت)"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="ep-ai-hub-body">
                                {/* 0. Resume Notice Banner (if partially translated) */}
                                {partialSrtInfo && (
                                    <div className="ep-ai-resume-banner">
                                        <div className="resume-banner-right">
                                            <div className="resume-icon-badge">
                                                <RefreshCw size={16} className="spinning-slow" />
                                            </div>
                                            <div className="resume-banner-texts">
                                                <strong>ئەم ئەڵقەیە پێشتر {partialSrtInfo.translatedLines} لە {partialSrtInfo.totalLines} دێڕی وەرگێڕدراوە ({partialSrtInfo.percent}%).</strong>
                                                <span>پڕۆسەکە دەستبەجێ لە دێڕی <strong>{partialSrtInfo.translatedLines + 1}</strong>ەوە بەردەوام دەبێت (Resume) بەبێ بەفیڕۆدانی تۆکن یان خەرجی دووبارە!</span>
                                            </div>
                                        </div>
                                        <div className="resume-banner-actions">
                                            {!isTaskRunning && (
                                                <button
                                                    type="button"
                                                    className="btn-resume-direct"
                                                    onClick={() => startAiHubProcessing('translate_only')}
                                                    title="دەستپێکردنەوەی خێرا لەو شوێنەی وەستاوە"
                                                >
                                                    <Play size={13} fill="#000" color="#000" />
                                                    <span>دەستپێکردنەوە لە دێڕی {partialSrtInfo.translatedLines + 1}</span>
                                                </button>
                                            )}
                                            <span className="resume-pct-pill">{partialSrtInfo.percent}% ئامادەیە</span>
                                        </div>
                                    </div>
                                )}

                                {/* 1. Context, Genre, Story & Glossary Banner */}
                                <div className="ep-ai-hub-context-card">
                                    <div className="ep-ai-hub-context-top">
                                        <div className="ep-ai-hub-context-tags">
                                            <span className="context-pill show-name">🎬 {movie.title}</span>
                                            {aiHubTarget.type === 'single' ? (
                                                <span className="context-pill ep-info">
                                                    وەرزی {aiHubTarget.seasonNum} • ئەڵقەی {aiHubTarget.episode?.number}: {aiHubTarget.episode?.title}
                                                </span>
                                            ) : (
                                                <span className="context-pill ep-info">
                                                    تەواوی وەرزی {aiHubTarget.seasonNum}
                                                </span>
                                            )}
                                            {movie.genre && (
                                                <span className="context-pill genre">🎭 {movie.genre}</span>
                                            )}
                                        </div>
                                        <div className="ep-ai-hub-glossary-badge">
                                            <BookOpen size={13} />
                                            <span>{activeGlossaryTerms.length} زاراوەی فەرهەنگ بەستراوە</span>
                                        </div>
                                    </div>

                                    <div className="ep-ai-hub-story-box">
                                        <div className="story-box-header">
                                            <label>کورتەی چیرۆک و جیهانی بەرهەمەکە (Story & Context):</label>
                                            <button
                                                type="button"
                                                className="btn-fetch-synopsis"
                                                disabled={fetchingSynopsis || isTaskRunning}
                                                onClick={fetchAiSynopsis}
                                                title="دۆزینەوەی خۆکاری کورتە و ژانەر بە ژیری دەستکرد"
                                            >
                                                {fetchingSynopsis ? <Loader2 size={12} className="spinning" /> : <RefreshCw size={12} />}
                                                <span>دۆزینەوەی کورتە بە AI</span>
                                            </button>
                                        </div>
                                        <textarea
                                            value={aiStoryContext}
                                            onChange={e => setAiStoryContext(e.target.value)}
                                            placeholder="کورتەیەکی گشتی لەسەر چیرۆک و ڕووداوەکان بنووسە بۆ بەرزکردنەوەی کوالێتی وەرگێڕان..."
                                            disabled={isTaskRunning}
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                {/* 2. Tone Selector */}
                                <div className="ep-ai-hub-section">
                                    <div className="ep-ai-hub-section-title">
                                        <span>🎭 شێوازی دەربڕین و دەنگی کوردی (Tone):</span>
                                    </div>
                                    <div className="ep-ai-tones-grid">
                                        {TRANSLATION_TONES.map(t => (
                                            <div
                                                key={t.id}
                                                className={`ep-ai-tone-card ${aiSelectedTone === t.id ? 'active' : ''} ${isTaskRunning ? 'disabled' : ''}`}
                                                onClick={() => !isTaskRunning && handleToneChange(t.id)}
                                            >
                                                <div className="tone-card-top">
                                                    <span className="tone-icon">{t.icon}</span>
                                                    <span className="tone-name">{t.name}</span>
                                                    {aiSelectedTone === t.id && <span className="tone-check">✓</span>}
                                                </div>
                                                <p className="tone-desc">{t.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 3. Model Selector */}
                                <div className="ep-ai-hub-section">
                                    <div className="ep-ai-hub-section-title">
                                        <span>🧠 مۆدێلی ژیری دەستکرد بۆ وەرگێڕان (AI Model):</span>
                                    </div>
                                    <div className="ep-ai-models-grid">
                                        {AI_TRANSLATION_MODELS.map(m => (
                                            <div
                                                key={m.id}
                                                className={`ep-ai-model-card ${aiSelectedModel === m.id ? 'active' : ''} ${isTaskRunning ? 'disabled' : ''}`}
                                                onClick={() => !isTaskRunning && handleModelChange(m.id)}
                                            >
                                                <div className="model-card-top">
                                                    <span className="model-badge">{m.badge}</span>
                                                    <span className="model-name">{m.name}</span>
                                                    <span className="model-icon">{m.icon}</span>
                                                </div>
                                                <p className="model-desc">{m.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 4. Live Progress & Stats Bar (when active or running) */}
                                {(isTaskRunning || displayPercent > 0) && (
                                    <div className="ep-ai-hub-stats-card">
                                        <div className="stats-meter-row">
                                            <div className="stat-pill cost">
                                                <DollarSign size={13} />
                                                <span>خەرجی: <strong>${displayStats.costUsd.toFixed(5)}</strong></span>
                                            </div>
                                            <div className="stat-pill speed">
                                                <Zap size={13} />
                                                <span>خێرایی: <strong>{displayStats.speedTokSec} tok/s</strong></span>
                                            </div>
                                            <div className="stat-pill tokens">
                                                <Brain size={13} />
                                                <span>تۆکنەکان: <strong>{displayStats.totalInTok.toLocaleString()} In / {displayStats.totalOutTok.toLocaleString()} Out</strong></span>
                                            </div>
                                            <div className="stat-pill elapsed">
                                                <Clock size={13} />
                                                <span>کات: <strong>{displayStats.elapsedSec}s</strong></span>
                                            </div>
                                        </div>

                                        <div className="ep-ai-progress-wrap">
                                            <div className="ep-ai-progress-bar-bg">
                                                <div className="ep-ai-progress-bar-fill" style={{ width: `${displayPercent}%` }} />
                                            </div>
                                            <div className="ep-ai-progress-info">
                                                <div className="ep-progress-info-left">
                                                    <Loader2 size={13} className="spinning" />
                                                    <span>{displayProgressText || 'لە پرۆسەدایە...'}</span>
                                                </div>
                                                <div className="ep-progress-info-right">
                                                    <span className="percent-text">{displayPercent}%</span>
                                                    {isTaskRunning && (
                                                        <button
                                                            type="button"
                                                            className="btn-meter-stop-inline"
                                                            onClick={stopAiHubProcessing}
                                                            title="ڕاگرتن"
                                                        >
                                                            🛑 ڕاگرتن
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 5. Footer Actions (3 Modes or Background Minimize + Stop) */}
                            <div className="ep-ai-hub-footer">
                                {isTaskRunning ? (
                                    <div className="ep-ai-running-footer-row">
                                        <button
                                            type="button"
                                            className="btn-ai-minimize"
                                            onClick={() => setAiHubTarget(null)}
                                            title="پەنجەرەکە دابخە، وەرگێڕان بە شێوەی خۆکار لە پاشبنەما بەردەوام دەبێت و تەواو دەبێت"
                                        >
                                            <Minimize2 size={16} />
                                            <span>داخستن و بەردەوامبوون لە پاشبنەما (Background)</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-ai-stop"
                                            onClick={stopAiHubProcessing}
                                        >
                                            <X size={16} />
                                            <span>🛑 ڕاگرتنی دەستبەجێ (Stop / Pause)</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="ep-ai-modes-grid">
                                        <button
                                            type="button"
                                            className="btn-ai-mode-action btn-translate-only"
                                            onClick={() => startAiHubProcessing('translate_only')}
                                        >
                                            <Languages size={17} />
                                            <div className="mode-btn-text">
                                                <strong>
                                                    {partialSrtInfo ? `🔤 بەردەوامبوون (لە دێڕی ${partialSrtInfo.translatedLines + 1})` : '🔤 تەنها وەرگێڕانی سەبتایتڵ'}
                                                </strong>
                                                <span>وەرگێڕانی خێرا و ئابووری بۆ ناو ئەڵقەکە</span>
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            className="btn-ai-mode-action btn-analyze-only"
                                            onClick={() => startAiHubProcessing('analyze_only')}
                                        >
                                            <BarChart2 size={17} />
                                            <div className="mode-btn-text">
                                                <strong>📊 تەنها شیکاریی زمانی CEFR</strong>
                                                <span>ئامادەکردنی ئاستەکانی زمان و وشە قورسەکان</span>
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            className="btn-ai-mode-action btn-all-modes"
                                            onClick={() => startAiHubProcessing('all')}
                                        >
                                            <Sparkles size={17} />
                                            <div className="mode-btn-text">
                                                <strong>
                                                    {partialSrtInfo ? `✨ بەردەوامبوونی گشتی (Resume لە ${partialSrtInfo.percent}%)` : '✨ هەردووکی پێکەوە (شیکاری + وەرگێڕان)'}
                                                </strong>
                                                <span>ئامادەکردنی تەواوی ژێرنووس و ئامارەکان</span>
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── SUBTITLE TASK RESERVATION MODAL ─── */}
                {reserveTarget && (
                    <div className="reservation-modal-backdrop" onClick={() => setReserveTarget(null)}>
                        <div className="reservation-modal-box" onClick={e => e.stopPropagation()}>
                            <div className="reservation-modal-header">
                                <h3>
                                    <Lock size={18} color="#c084fc" /> 
                                    {lang === 'en' ? `Reserve Episode ${reserveTarget.ep.number}` : `حیجزکردنی وەرگێڕانی ئەڵقەی ${reserveTarget.ep.number}`}
                                </h3>
                                <button className="reservation-close-btn" onClick={() => setReserveTarget(null)}>
                                    <X size={16} />
                                </button>
                            </div>

                            {reserveTarget.ep.reservation && reserveTarget.ep.reservation.expiresAt > Date.now() ? (
                                <div className="reservation-active-info">
                                    <div className="reserve-user-badge">
                                        <div>👤 وەرگێڕی حیجزکەر: <strong>{reserveTarget.ep.reservation.username}</strong></div>
                                        <div>⏳ کاتی ماوە: <strong>{getReservationRemainingLabel(reserveTarget.ep.reservation.expiresAt)}</strong></div>
                                        <div>📅 بەرواری بەسەرچوون: <strong>{new Date(reserveTarget.ep.reservation.expiresAt).toLocaleString('ckb')}</strong></div>
                                    </div>

                                    <div className="reservation-actions-row">
                                        {(reserveTarget.ep.reservation.userId === user?.id || user?.role === 'super_admin' || user?.username === 'maher2') && (
                                            <button
                                                type="button"
                                                className="btn-unreserve-danger"
                                                onClick={() => handleUnreserveEpisode(reserveTarget.seasonNum, reserveTarget.ep)}
                                            >
                                                <Unlock size={15} /> {lang === 'en' ? 'Release Lock (Unreserve)' : 'لابردنی حجز (ئازادکردن)'}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="btn-reserve-primary"
                                            onClick={() => handleReserveEpisode(reserveTarget.seasonNum, reserveTarget.ep, reserveDaysInput)}
                                        >
                                            <RefreshCw size={15} /> {lang === 'en' ? 'Extend 5 More Days' : 'درێژکردنەوەی مۆڵەت (+٥ ڕۆژ)'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="reservation-form">
                                    <p className="reservation-desc">
                                        {lang === 'en' 
                                            ? 'Reserve this episode for translation. Other admins cannot edit or overwrite it during your reservation period. If not completed in time, it will auto-unlock.' 
                                            : 'کاتێک ئەم ئەڵقەیە حجز دەکەیت، هیچ وەرگێڕ و ئەدمینێکی تر ناتوانێت دەستکاری بکات تا کارەکەت تەواو دەکەیت. ئەگەر لەم ماوەیەدا کارەکەت نەکرد، خۆی قوفڵەکەی دەکرێتەوە.'}
                                    </p>

                                    <label className="reservation-field-label">
                                        {lang === 'en' ? 'Select duration:' : 'ماوەی مۆڵەتی پێویست دیاری بکە:'}
                                    </label>
                                    <div className="reservation-days-options">
                                        {[1, 3, 5, 7, 10, 14].map(days => (
                                            <button
                                                key={days}
                                                type="button"
                                                className={`btn-day-choice ${reserveDaysInput === days ? 'active' : ''}`}
                                                onClick={() => setReserveDaysInput(days)}
                                            >
                                                {days} ڕۆژ
                                            </button>
                                        ))}
                                    </div>

                                    <div className="reservation-actions-row" style={{ marginTop: '20px' }}>
                                        <button
                                            type="button"
                                            className="btn-reserve-cancel"
                                            onClick={() => setReserveTarget(null)}
                                        >
                                            پاشگەزبوونەوە
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-reserve-primary"
                                            onClick={() => handleReserveEpisode(reserveTarget.seasonNum, reserveTarget.ep, reserveDaysInput)}
                                        >
                                            <Lock size={15} /> {lang === 'en' ? `Reserve for ${reserveDaysInput} Days` : `حیجزکردن بۆ ${reserveDaysInput} ڕۆژ 🔒`}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
