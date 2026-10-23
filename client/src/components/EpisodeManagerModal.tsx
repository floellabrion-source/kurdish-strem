import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
    X, Plus, Trash2, Edit3, BarChart2, Video, Upload, Link as LinkIcon,
    FileText, Languages, Shield, ChevronDown, ChevronUp, PlusCircle, Loader2, Play,
    Download, Sparkles, CheckCircle2, AlertCircle, Pause, RefreshCw, Zap, BookOpen, Brain, DollarSign, Clock, Layers, Film,
    Minimize2, Maximize2, Wrench, Globe, Lock, Unlock, Cloud, Search, FolderOpen, Folder
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
    ActiveAiTask,
    QueuedTranslationJob,
    subscribeToTranslationQueue,
    addToTranslationQueue,
    removeFromTranslationQueue,
    isEpisodeQueued,
    getQueuedJob,
    getQueuePosition,
    getTranslationQueue
} from '../utils/aiTranslator';
import './EpisodeManagerModal.css';

// ─── HELPER: EXTRACT EPISODE NUMBER FROM SUBTITLE FILENAME ───
export function parseEpisodeNumberFromFilename(filename: string, seasonNum: number): number | null {
    const name = filename.replace(/\.(srt|vtt|sub|txt)$/i, '').trim();

    // 1. Season & Episode combo: S01E02, s1e2, S01.E02, S01_E02, S01 - E02
    const seMatch = name.match(/s0*(\d+)[._\-\s]*e0*(\d+)/i);
    if (seMatch) {
        const s = parseInt(seMatch[1], 10);
        const e = parseInt(seMatch[2], 10);
        if (s === seasonNum) return e;
        return e;
    }

    // 2. 1x02 or 01x02 or 1X2 pattern
    const xMatch = name.match(/(\d+)x0*(\d+)/i);
    if (xMatch) {
        const s = parseInt(xMatch[1], 10);
        const e = parseInt(xMatch[2], 10);
        if (s === seasonNum) return e;
        return e;
    }

    // 3. Ep 02, Episode 02, EP02, Ep.02, Ep_02, E02
    const epMatch = name.match(/(?:episode|ep|e)[._\-\s]*0*(\d{1,4})/i);
    if (epMatch) {
        return parseInt(epMatch[1], 10);
    }

    // 4. 3-digit season+episode: e.g. 102 for Season 1 Episode 2
    if (seasonNum > 0 && seasonNum < 10) {
        const threeDigit = name.match(new RegExp(`[._\\-\\s]${seasonNum}0*(\\d{2})[._\\-\\s]`));
        if (threeDigit) {
            return parseInt(threeDigit[1], 10);
        }
    }

    // 5. Bracketed or separated number: [02], (02), - 02 -, _02_
    const bracketMatch = name.match(/[\[\(_\-\s]0*(\d{1,3})[\]\)_\-\s]/);
    if (bracketMatch) {
        return parseInt(bracketMatch[1], 10);
    }

    // 6. Trailing number: "Title - 02" or "Title_02" or "Title 02"
    const endNumMatch = name.match(/[._\-\s]0*(\d{1,3})$/);
    if (endNumMatch) {
        return parseInt(endNumMatch[1], 10);
    }

    // 7. Standalone number: "02" or "2"
    const justNumMatch = name.match(/^0*(\d+)$/);
    if (justNumMatch) {
        return parseInt(justNumMatch[1], 10);
    }

    return null;
}

// ─── HELPER: CONVERT WEBVTT TO SRT FORMAT IF NEEDED ───
export function convertVttToSrt(content: string): string {
    if (!content || !content.trim().startsWith('WEBVTT')) {
        return content;
    }
    let text = content.replace(/^WEBVTT[^\r\n]*(\r\n|\n|\r)/i, '');
    text = text.replace(/NOTE(\s+[^\r\n]*)?(\r\n|\n|\r)[^]*?(\r\n\r\n|\n\n|\r\r)/gi, '');
    text = text.replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2');
    text = text.replace(/(^|[\r\n])(\d{2}:\d{2})\.(\d{3})/g, '$100:$2,$3');
    return text.trim();
}

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

    // ─── CLOUDFLARE R2 BULK AUTO-LINK STATE ───
    const [r2Target, setR2Target] = useState<{
        season: Season;
        keyword: string;
        loading: boolean;
        saving: boolean;
        data: {
            totalEpisodes: number;
            readyCount: number;
            alreadyLinkedCount: number;
            missingCount: number;
            episodes: Array<{
                id: string;
                number: number;
                title: string;
                currentVideoUrl: string;
                matchedVideoUrl: string | null;
                folder: string | null;
                status: 'ready' | 'already_linked' | 'missing';
            }>;
            extraInR2: any[];
        } | null;
        error: string | null;
    } | null>(null);

    const scanR2ForSeason = async (season: Season, keyword: string) => {
        try {
            setR2Target(prev => prev ? { ...prev, loading: true, error: null } : null);
            const res = await axios.get(`/api/admin/movies/${movie.id}/r2-scan`, {
                params: {
                    seasonNum: season.number,
                    keyword: keyword.trim()
                }
            });
            setR2Target(prev => prev ? { ...prev, loading: false, data: res.data, error: null } : null);
        } catch (err: any) {
            console.error('R2 scan error:', err);
            const status = err.response?.status;
            let errMsg = err.response?.data?.error;
            if (!errMsg) {
                if (status === 404) {
                    errMsg = 'ڕێگای پشکنین لە سێرڤەر نەدۆزرایەوە (404) — تکایە لە تێرمیناڵی سێرڤەر (VPS) ئەم فەرمانە لێبدە: pm2 restart kurdish-stream-api تا سێرڤەرەکە نوێ ببێتەوە.';
                } else if (status === 500) {
                    errMsg = 'هەڵەی ناوخۆیی سێرڤەر (500) لە کاتی پشکنینی Cloudflare R2';
                } else if (status === 403) {
                    errMsg = 'مۆڵەتی ئەدمین پێویستە بۆ پشکنینی Cloudflare R2 (403)';
                } else if (err.message) {
                    errMsg = err.message;
                } else {
                    errMsg = 'هەڵەیەک لە پشکنینی Cloudflare R2 ڕوویدا';
                }
            }
            setR2Target(prev => prev ? {
                ...prev,
                loading: false,
                error: errMsg
            } : null);
        }
    };

    const openR2AutoLink = (season: Season) => {
        const initialKeyword = movie.title || '';
        setR2Target({
            season,
            keyword: initialKeyword,
            loading: true,
            saving: false,
            data: null,
            error: null
        });
        scanR2ForSeason(season, initialKeyword);
    };

    const handleApplyR2Links = async () => {
        if (!r2Target || !r2Target.data) return;
        try {
            setR2Target(prev => prev ? { ...prev, saving: true } : null);
            const res = await axios.post(`/api/admin/movies/${movie.id}/auto-link-r2`, {
                seasonNum: r2Target.season.number,
                keyword: r2Target.keyword
            });
            showToast(res.data.message || 'ئەڵقەکان بە سەرکەوتوویی بەسترانەوە ⚡');
            setR2Target(null);
            if (onReloadMovie) onReloadMovie();
        } catch (err: any) {
            setR2Target(prev => prev ? { ...prev, saving: false } : null);
            showToast(err.response?.data?.error || 'کێشەیەک لە بەستنەوە ڕوویدا');
        }
    };

    // ─── BATCH SUBTITLES LINKER STATE ───
    const [batchSubTarget, setBatchSubTarget] = useState<{
        season: Season;
        items: Array<{
            file: File;
            detectedEpNum: number | null;
            selectedEpNum: number | null;
            autoMatched: boolean;
        }>;
        saving: boolean;
    } | null>(null);

    const [batchSubType, setBatchSubType] = useState<'original' | 'translated'>('original');
    const [batchSaveProgressText, setBatchSaveProgressText] = useState<string>('');
    const batchFileInputRef = useRef<HTMLInputElement | null>(null);
    const batchFolderInputRef = useRef<HTMLInputElement | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

    const handleTriggerBatchSub = (season: Season) => {
        setBatchSubTarget({
            season,
            items: [],
            saving: false
        });
    };

    const processAddedFiles = (filesToAdd: File[]) => {
        if (!batchSubTarget || filesToAdd.length === 0) return;
        const season = batchSubTarget.season;

        const filtered = filesToAdd.filter(f => /\.(srt|vtt)$/i.test(f.name));
        if (filtered.length === 0) {
            showToast('هیچ فایلی ژێرنووسی (.srt یان .vtt) نەدۆزرایەوە');
            return;
        }

        const newItems = filtered.map(file => {
            const detected = parseEpisodeNumberFromFilename(file.name, season.number);
            const exists = detected !== null && season.episodes.some(ep => ep.number === detected);
            return {
                file,
                detectedEpNum: detected,
                selectedEpNum: exists ? detected : null,
                autoMatched: exists
            };
        });

        setBatchSubTarget(prev => {
            if (!prev) return null;
            const existingNames = new Set(prev.items.map(it => it.file.name));
            const uniqueNew = newItems.filter(it => !existingNames.has(it.file.name));
            const combined = [...prev.items, ...uniqueNew];
            combined.sort((a, b) => (a.selectedEpNum ?? 9999) - (b.selectedEpNum ?? 9999));
            return {
                ...prev,
                items: combined
            };
        });
    };

    const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        processAddedFiles(Array.from(files));
        e.target.value = '';
    };

    const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        processAddedFiles(Array.from(files));
        e.target.value = '';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);

        if (!batchSubTarget) return;
        const extracted: File[] = [];
        const items = e.dataTransfer.items;

        if (items && items.length > 0) {
            const queue: any[] = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
                    if (entry) {
                        queue.push(entry);
                    } else {
                        const f = item.getAsFile();
                        if (f && /\.(srt|vtt)$/i.test(f.name)) extracted.push(f);
                    }
                }
            }

            while (queue.length > 0) {
                const entry = queue.shift();
                if (entry.isFile) {
                    const f = await new Promise<File>(resolve => entry.file(resolve));
                    if (/\.(srt|vtt)$/i.test(f.name)) extracted.push(f);
                } else if (entry.isDirectory) {
                    const reader = entry.createReader();
                    const readBatch = async (): Promise<any[]> => {
                        return new Promise(resolve => {
                            reader.readEntries((entries: any[]) => resolve(entries || []));
                        });
                    };
                    let batch = await readBatch();
                    while (batch.length > 0) {
                        queue.push(...batch);
                        batch = await readBatch();
                    }
                }
            }
        } else if (e.dataTransfer.files) {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                const f = e.dataTransfer.files[i];
                if (/\.(srt|vtt)$/i.test(f.name)) extracted.push(f);
            }
        }

        processAddedFiles(extracted);
    };

    const handleUpdateItemEpisode = (index: number, epNum: number | null) => {
        setBatchSubTarget(prev => {
            if (!prev) return null;
            const items = [...prev.items];
            items[index] = {
                ...items[index],
                selectedEpNum: epNum,
                autoMatched: false
            };
            return { ...prev, items };
        });
    };

    const handleRemoveBatchItem = (index: number) => {
        setBatchSubTarget(prev => {
            if (!prev) return null;
            const items = prev.items.filter((_, i) => i !== index);
            return { ...prev, items };
        });
    };

    const handleSaveBatchSubtitles = async () => {
        if (!batchSubTarget || batchSubTarget.saving) return;
        const assignedItems = batchSubTarget.items.filter(it => it.selectedEpNum !== null);
        if (assignedItems.length === 0) {
            showToast('هیچ فایلێک بە ئەڵقەکان نەبەستراوەتەوە');
            return;
        }

        try {
            setBatchSubTarget(prev => prev ? { ...prev, saving: true } : null);
            setBatchSaveProgressText(`خوێندنەوەی فایلی ژێرنووسەکان... (0/${assignedItems.length})`);

            const itemsPayload = [];
            for (let i = 0; i < assignedItems.length; i++) {
                const it = assignedItems[i];
                setBatchSaveProgressText(`خوێندنەوەی ئەڵقەی ${it.selectedEpNum}... (${i + 1}/${assignedItems.length})`);
                let rawText = await it.file.text();
                rawText = convertVttToSrt(rawText);
                itemsPayload.push({
                    episodeNum: it.selectedEpNum,
                    srtText: rawText
                });
            }

            setBatchSaveProgressText('پاشەکەوت دەکرێت لە سێرڤەر...');

            try {
                const res = await axios.post(`/api/admin/movies/${movie.id}/seasons/${batchSubTarget.season.number}/batch-srt`, {
                    subType: batchSubType,
                    items: itemsPayload
                });
                showToast(res.data.message || `${itemsPayload.length} ژێرنووس بە سەرکەوتوویی پاشەکەوت کران ✅`);
            } catch (apiErr: any) {
                if (apiErr.response?.status === 404) {
                    for (let i = 0; i < itemsPayload.length; i++) {
                        const item = itemsPayload[i];
                        setBatchSaveProgressText(`پاشەکەوتکردنی ئەڵقەی ${item.episodeNum} (${i + 1}/${itemsPayload.length})...`);
                        const payload: any = {
                            seasonNum: batchSubTarget.season.number,
                            episodeNum: item.episodeNum
                        };
                        if (batchSubType === 'original') {
                            payload.originalSrtText = item.srtText;
                        } else {
                            payload.translatedSrtText = item.srtText;
                        }
                        await axios.post(`/api/admin/movies/${movie.id}/srt-content`, payload);
                    }
                    showToast(`${itemsPayload.length} ژێرنووس بە سەرکەوتوویی پاشەکەوت کران ✅`);
                } else {
                    throw apiErr;
                }
            }

            setBatchSubTarget(null);
            if (onReloadMovie) onReloadMovie();
        } catch (err: any) {
            console.error('Batch save error:', err);
            setBatchSubTarget(prev => prev ? { ...prev, saving: false } : null);
            showToast(err.response?.data?.error || err.message || 'هەڵەیەک لە پاشەکەوتکردنی ژێرنووسەکان ڕوویدا');
        }
    };

    // ─── ACTIVE AI TASKS GLOBAL SUBSCRIPTION ───
    const [activeAiTasks, setActiveAiTasks] = useState<ActiveAiTask[]>([]);
    useEffect(() => {
        return subscribeToAiTasks(tasks => {
            setActiveAiTasks(tasks);
        });
    }, []);

    // ─── TRANSLATION QUEUE SUBSCRIPTION ───
    const [queueList, setQueueList] = useState<QueuedTranslationJob[]>([]);
    useEffect(() => {
        return subscribeToTranslationQueue(q => {
            setQueueList(q);
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
    const [runningTargetKey, setRunningTargetKey] = useState<string | null>(null);
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
            const targetDesc = aiHubTarget?.type === 'single' && aiHubTarget?.episode
                ? `زنجیرەی "${movie.title}" - سیزنی ${aiHubTarget.seasonNum} - ئەڵقەی ${aiHubTarget.episode.number} (${aiHubTarget.episode.title || ''})`
                : `زنجیرە یان فیلمی: "${movie.title}"`;

            const prompt = `کورتەیەکی سەرنجڕاکێش و پوخت بە کوردی سۆرانی (٢ بۆ ٣ دێڕ) لەسەر چیرۆک و ڕووداوەکان بنووسە بۆ ${targetDesc}.
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
        const thisEpRunning = activeAiTasks.some(t =>
            t.status === 'running' &&
            t.movieId === movie.id &&
            t.type === 'single' &&
            Number(t.seasonNum) === Number(seasonNum) &&
            Number(t.episodeNum) === Number(ep.number)
        );
        if (!thisEpRunning) {
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
        // If this episode is already queued, restore its queued settings
        const queuedJob = getQueuedJob(movie.id, seasonNum, ep.number);
        if (queuedJob) {
            setAiStoryContext(queuedJob.storyContext || '');
            if (queuedJob.model) setAiSelectedModel(queuedJob.model);
            if (queuedJob.tone) setAiSelectedTone(queuedJob.tone);
        } else {
            // Always reset context for the active episode so previous episode's text doesn't persist
            const initialContext = ep.description || movie.descriptionKu || movie.description || '';
            setAiStoryContext(initialContext);
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
        const bulkRunning = activeAiTasks.some(t =>
            t.status === 'running' &&
            t.movieId === movie.id &&
            t.type === 'bulk' &&
            Number(t.seasonNum) === Number(season.number)
        );
        if (!bulkRunning) {
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
        setAiStoryContext(movie.descriptionKu || movie.description || '');
    };

    const isQueueProcessingRef = useRef(false);

    // ─── EXECUTE SINGLE EPISODE TRANSLATION ───
    const executeSingleEpisodeTranslation = async (
        targetSeasonNum: number,
        targetEpisode: Episode,
        mode: 'all' | 'translate_only' | 'analyze_only',
        storyContext: string,
        model: string,
        tone: string
    ) => {
        const ep = targetEpisode;
        const seasonNum = targetSeasonNum;
        const taskId = `${movie.id}-${seasonNum}-${ep.number}`;

        const abortController = new AbortController();
        aiAbortControllerRef.current = abortController;
        const signal = abortController.signal;

        const startTimestamp = Date.now();
        const initialStats = { totalInTok: 0, totalOutTok: 0, costUsd: 0, speedTokSec: 0, startTime: startTimestamp, elapsedSec: 0 };
        setAiStats(initialStats);
        setAiRunning(true);
        setRunningTargetKey(`single-${seasonNum}-${ep.number}`);

        registerAiTask({
            taskId,
            movieId: movie.id,
            movieTitle: movie.title,
            seasonNum,
            episodeNum: ep.number,
            episodeId: ep.id,
            type: 'single',
            model,
            tone,
            mode,
            status: 'running',
            percent: 5,
            statusText: `دەستپێکردنی ئەڵقەی ${ep.number}...`,
            abortController,
            stats: initialStats,
            storyContext
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
                const pricing = MODEL_PRICING[model] || { inPricePerM: 3.0, outPricePerM: 15.0 };
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

        const epKey = `${seasonNum}-${ep.id}`;
        setAiProgressText(`دەستپێکردنی ئەڵقەی ${ep.number}...`);
        setAiPercent(5);
        setEpTransProgress(prev => ({
            ...prev,
            [epKey]: { status: 'running', statusText: 'وەرگێڕان بە AI...', percent: 5 }
        }));

        try {
            const epSpecific = ep.description ? ` | Episode Synopsis: "${ep.description}"` : '';
            const contextStr = `Show Title: "${movie.title}" | Season ${seasonNum}, Episode ${ep.number}: "${ep.title}"${epSpecific} | Genre: ${movie.genre || 'Drama'} | Main Story Arc: ${storyContext}`;

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
                    model,
                    tone,
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
                await axios.post(`/api/admin/movies/${movie.id}/seasons/${seasonNum}/episodes/${ep.id}/metrics`, {
                    languageMetrics: result.metrics || ep.languageMetrics,
                    translatedSrt: mode === 'analyze_only' ? (ep.translatedSrt || null) : 'translated.srt'
                });
                if (onReloadMovie) onReloadMovie();
                showToast(`ئەڵقەی ${ep.number} بە سەرکەوتوویی تەواو بوو! ✓`);
                removeAiTask(taskId);
                setEpTransProgress(prev => {
                    const next = { ...prev };
                    delete next[epKey];
                    return next;
                });
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
            setRunningTargetKey(null);
            if (onReloadMovie) onReloadMovie();
        }
    };

    // ─── CHECK & TRIGGER NEXT QUEUED JOB ───
    const checkAndProcessNextQueueJob = async () => {
        if (isQueueProcessingRef.current) return;
        const isBusy = activeAiTasks.some(t => t.status === 'running') || aiRunning || Boolean(runningTargetKey);
        if (isBusy) return;

        const queue = getTranslationQueue();
        const nextJob = queue.find(j => j.movieId === movie.id);
        if (!nextJob) return;

        isQueueProcessingRef.current = true;
        try {
            removeFromTranslationQueue(nextJob.queueId);
            showToast(`دەستپێکردنی خۆکاری ئەڵقەی ${nextJob.episodeNum} لە ڕیزبەندی 🚀`);
            const targetSeason = seasons.find(s => s.number === nextJob.seasonNum);
            const epObj = targetSeason?.episodes?.find(e => e.number === nextJob.episodeNum);
            if (epObj) {
                await executeSingleEpisodeTranslation(
                    nextJob.seasonNum,
                    epObj,
                    nextJob.mode,
                    nextJob.storyContext,
                    nextJob.model,
                    nextJob.tone
                );
            }
        } finally {
            isQueueProcessingRef.current = false;
        }
    };

    // Auto-run next job in queue whenever a task finishes
    useEffect(() => {
        const isBusy = activeAiTasks.some(t => t.status === 'running') || aiRunning;
        if (!isBusy && queueList.some(j => j.movieId === movie.id)) {
            checkAndProcessNextQueueJob();
        }
    }, [activeAiTasks, queueList, aiRunning]);

    // ─── 6. START PROCESSING FROM AI MASTER HUB ───
    const startAiHubProcessing = async (mode: 'all' | 'translate_only' | 'analyze_only') => {
        if (!aiHubTarget) return;
        const targetType = aiHubTarget.type;
        const targetSeasonNum = aiHubTarget.seasonNum;
        const targetEpisode = aiHubTarget.episode;
        const targetSeason = aiHubTarget.season;

        if (targetType === 'single' && targetEpisode) {
            await executeSingleEpisodeTranslation(
                targetSeasonNum,
                targetEpisode,
                mode,
                aiStoryContext,
                aiSelectedModel,
                aiSelectedTone
            );
            return;
        }

        // Bulk season mode
        const taskId = `${movie.id}-${targetSeasonNum}-bulk`;
        const abortController = new AbortController();
        aiAbortControllerRef.current = abortController;
        const signal = abortController.signal;

        const startTimestamp = Date.now();
        const initialStats = { totalInTok: 0, totalOutTok: 0, costUsd: 0, speedTokSec: 0, startTime: startTimestamp, elapsedSec: 0 };
        setAiStats(initialStats);
        setAiRunning(true);
        setRunningTargetKey(`bulk-${targetSeasonNum}`);

        registerAiTask({
            taskId,
            movieId: movie.id,
            movieTitle: movie.title,
            seasonNum: targetSeasonNum,
            type: 'bulk',
            model: aiSelectedModel,
            tone: aiSelectedTone,
            mode,
            status: 'running',
            percent: 5,
            statusText: 'دەستپێکردنی وەرگێڕانی بەکۆمەڵ...',
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
            if (targetSeason) {
                const season = targetSeason;
                const eps = season.episodes.filter(e => e.originalSrt);
                if (eps.length === 0) {
                    showToast('هیچ ئەڵقەیەک فایلی ئۆرجیناڵی نییە');
                    setAiRunning(false);
                    removeAiTask(taskId);
                    return;
                }

                let doneCount = 0;

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
                        await axios.post(`/api/admin/movies/${movie.id}/seasons/${season.number}/episodes/${ep.id}/metrics`, {
                            languageMetrics: result.metrics || ep.languageMetrics,
                            translatedSrt: mode === 'analyze_only' ? (ep.translatedSrt || null) : 'translated.srt'
                        });
                        if (onReloadMovie) onReloadMovie();
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
            setRunningTargetKey(null);
            if (onReloadMovie) onReloadMovie();
        }
    };

    // ─── HANDLE START OR QUEUE ───
    const handleStartOrQueue = (mode: 'all' | 'translate_only' | 'analyze_only') => {
        if (!aiHubTarget) return;

        // If current target is ALREADY queued, update its settings
        if (isThisTargetQueued && currentTargetQueuedJob) {
            addToTranslationQueue({
                ...currentTargetQueuedJob,
                model: aiSelectedModel,
                tone: aiSelectedTone,
                mode,
                storyContext: aiStoryContext
            });
            showToast(`تێبینی و ڕێکخستنەکانی ئەڵقەی ${aiHubTarget.episode?.number} لە ڕیزبەندیدا نوێکرانەوە ✓`);
            setAiHubTarget(null);
            return;
        }

        // If another task is currently running and this is a single episode, queue it!
        if (aiHubTarget.type === 'single' && aiHubTarget.episode && isOtherTaskRunning) {
            const ep = aiHubTarget.episode;
            const seasonNum = aiHubTarget.seasonNum;
            const queueJob: QueuedTranslationJob = {
                queueId: `${movie.id}-${seasonNum}-${ep.number}`,
                movieId: movie.id,
                movieTitle: movie.title,
                seasonNum,
                episodeNum: ep.number,
                episodeId: ep.id,
                episodeTitle: ep.title,
                type: 'single',
                model: aiSelectedModel,
                tone: aiSelectedTone,
                mode,
                storyContext: aiStoryContext,
                addedAt: Date.now()
            };
            addToTranslationQueue(queueJob);
            showToast(`ئەڵقەی ${ep.number} خرایە ڕیزبەندی وەرگێڕان ⏳ - دوای ئەڵقەی پێشوو، خۆکارانە دەست پێدەکات!`);
            setAiHubTarget(null);
            return;
        }

        // Otherwise, start immediately
        startAiHubProcessing(mode);
    };

    // ─── 7. STOP AI HUB PROCESSING ───
    const stopAiHubProcessing = () => {
        if (runningTaskForCurrentTarget) {
            stopAiTask(runningTaskForCurrentTarget.taskId);
        } else if (runningTaskForMovie) {
            stopAiTask(runningTaskForMovie.taskId);
        }
        if (aiAbortControllerRef.current) {
            aiAbortControllerRef.current.abort();
        }
        setAiRunning(false);
        setRunningTargetKey(null);
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

    // ─── TASK AND QUEUE RESOLUTION FOR CURRENT TARGET ───
    const runningTaskForCurrentTarget = useMemo(() => {
        if (!aiHubTarget) return null;
        return activeAiTasks.find(t => {
            if (t.status !== 'running') return false;
            if (t.movieId !== movie.id) return false;
            if (aiHubTarget.type === 'single') {
                return t.type === 'single' && Number(t.seasonNum) === Number(aiHubTarget.seasonNum) && Number(t.episodeNum) === Number(aiHubTarget.episode?.number);
            } else {
                return t.type === 'bulk' && Number(t.seasonNum) === Number(aiHubTarget.seasonNum);
            }
        }) || null;
    }, [aiHubTarget, activeAiTasks, movie.id]);

    const isThisTargetRunning = useMemo(() => {
        if (!aiHubTarget) return false;
        if (runningTaskForCurrentTarget) return true;
        if (!runningTargetKey) return false;
        const currentKey = aiHubTarget.type === 'single'
            ? `single-${aiHubTarget.seasonNum}-${aiHubTarget.episode?.number}`
            : `bulk-${aiHubTarget.seasonNum}`;
        return runningTargetKey === currentKey;
    }, [aiHubTarget, runningTaskForCurrentTarget, runningTargetKey]);

    // Is any other task running in background?
    const anyActiveRunningTask = useMemo(() => {
        return activeAiTasks.find(t => t.status === 'running') || null;
    }, [activeAiTasks]);

    const isOtherTaskRunning = Boolean(
        (anyActiveRunningTask && (!aiHubTarget || !runningTaskForCurrentTarget)) ||
        (runningTargetKey && (!aiHubTarget || runningTargetKey !== (aiHubTarget.type === 'single' ? `single-${aiHubTarget.seasonNum}-${aiHubTarget.episode?.number}` : `bulk-${aiHubTarget.seasonNum}`)))
    );

    // Is current target queued?
    const currentTargetQueuedJob = useMemo(() => {
        if (!aiHubTarget || aiHubTarget.type !== 'single' || !aiHubTarget.episode) return null;
        return getQueuedJob(movie.id, aiHubTarget.seasonNum, aiHubTarget.episode.number);
    }, [aiHubTarget, queueList, movie.id]);

    const isThisTargetQueued = Boolean(currentTargetQueuedJob);
    const currentTargetQueuePos = useMemo(() => {
        if (!aiHubTarget || aiHubTarget.type !== 'single' || !aiHubTarget.episode) return 0;
        return getQueuePosition(movie.id, aiHubTarget.seasonNum, aiHubTarget.episode.number);
    }, [aiHubTarget, queueList, movie.id]);

    const isTaskRunning = isThisTargetRunning;
    const currentRunningTask = runningTaskForCurrentTarget;
    const displayStats = isThisTargetRunning && currentRunningTask?.stats ? currentRunningTask.stats : (isThisTargetRunning ? aiStats : { totalInTok: 0, totalOutTok: 0, costUsd: 0, speedTokSec: 0, startTime: 0, elapsedSec: 0 });
    const displayPercent = isThisTargetRunning && currentRunningTask ? currentRunningTask.percent : (isThisTargetRunning ? aiPercent : 0);
    const displayProgressText = isThisTargetRunning && currentRunningTask ? currentRunningTask.statusText : (isThisTargetRunning ? aiProgressText : '');



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

                                            {/* BULK R2 AUTO-LINK BUTTON */}
                                            <button
                                                className="season-action-btn auto-r2-btn"
                                                title={lang === 'en' ? 'Auto-Link Episodes from Cloudflare R2 ⚡' : 'بەستنەوەی خودکاری ئەڵقەکان لە Cloudflare R2 ⚡'}
                                                onClick={() => openR2AutoLink(season)}
                                            >
                                                <Zap size={14} />
                                                <span>{lang === 'en' ? 'Auto-Link R2 ⚡' : 'بەستنەوە لە R2 ⚡'}</span>
                                            </button>
                                            {/* BULK SEASON SUBTITLES LINK BUTTON */}
                                            <button
                                                type="button"
                                                className="season-action-btn bulk-sub-btn"
                                                title={lang === 'en' ? 'Batch Upload Season Subtitles (.srt, .vtt) 📂' : 'بەستنەوەی ژێرنووسی هەموو ئەڵقەکان پێکەوە (Batch Subtitles) 📂'}
                                                onClick={() => handleTriggerBatchSub(season)}
                                            >
                                                <FileText size={14} />
                                                <span>{lang === 'en' ? 'Batch Subtitles 📂' : 'دانانی ژێرنووسەکان 📂'}</span>
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
                                                        <div className="ep-title-row">
                                                            <span className="ep-number-badge">{ep.number}</span>
                                                            <span className="ep-title-text" title={ep.title}>{ep.title}</span>
                                                        </div>
                                                        <div className="ep-item-actions-left">
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
                                                            <button
                                                                className="ep-action-btn srt-editor-btn"
                                                                title={lang === 'en' ? 'Edit Subtitles with Video' : 'ئیدیتکردنی هەردوو سەبتایتڵ لەگەڵ ڤیدیۆکە'}
                                                                onClick={() => onOpenSrtEditor(movie.id, movie.title, season.number, ep.number, ep.title, epEffectiveVideoUrl)}
                                                            >
                                                                <BarChart2 size={13} />
                                                            </button>
                                                            <button
                                                                className="ep-action-btn edit"
                                                                title={lang === 'en' ? 'Edit Episode Info' : 'دەستکاریکردنی زانیاری ئەڵقە'}
                                                                onClick={() => onEditEpisode(movie.id, season.number, ep)}
                                                            >
                                                                <Edit3 size={13} />
                                                            </button>
                                                            {onDeleteEpisode && (
                                                                <button
                                                                    className="ep-action-btn del"
                                                                    title={lang === 'en' ? 'Delete Episode' : 'سڕینەوەی ئەڵقە'}
                                                                    onClick={() => onDeleteEpisode(movie.id, season.number, ep.id)}
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="ep-status-row-badges">
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
                                                                className={`ep-source-btn ${ep.videoUrl ? 'done' : ''}`}
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
                                                                        const isEpQueued = isEpisodeQueued(movie.id, season.number, ep.number);
                                                                        const queuePos = getQueuePosition(movie.id, season.number, ep.number);

                                                                        return (
                                                                            <button
                                                                                className={`ep-srt-action-chip btn-chip-ai ${isEpRunning ? 'running' : ''} ${isEpPaused ? 'paused' : ''} ${isEpQueued ? 'queued' : ''}`}
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
                                                                                ) : isEpQueued ? (
                                                                                    <>
                                                                                        <Clock size={10} />
                                                                                        <span>{lang === 'en' ? `Queued (#${queuePos})` : `لە ڕیزبەندی (#${queuePos})`}</span>
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
                                    {queueList.filter(j => j.movieId === movie.id).length > 0 && (
                                        <span className="tracker-queue-pill" title="ژمارەی ئەڵقەکانی چاوەڕوان لە ڕیزبەندی">
                                            ⏳ {queueList.filter(j => j.movieId === movie.id).length} لە ڕیزبەندی
                                        </span>
                                    )}
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
                                    {isThisTargetRunning && (
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
                                    {isThisTargetQueued && (
                                        <div className="btn-header-queued-chip">
                                            <Clock size={13} />
                                            <span>⏳ لە ڕیزبەندییە (#{currentTargetQueuePos})</span>
                                        </div>
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
                                {/* Notice Banner if Target is already Queued */}
                                {isThisTargetQueued && (
                                    <div className="ep-ai-queue-status-banner">
                                        <div className="queue-status-banner-left">
                                            <div className="queue-icon-badge">
                                                <Clock size={18} color="#a855f7" />
                                            </div>
                                            <div className="queue-banner-texts">
                                                <strong>ئەم ئەڵقەیە لە ڕیزبەندی وەرگێڕاندایە (نۆرەی #{currentTargetQueuePos}) ⏳</strong>
                                                <span>پاش تەواوبوونی کارەکانی پێش خۆی، سیستەمەکە بە شێوەیەکی ئۆتۆماتیکی بەم کورتە و تێبینییانە دەست پێدەکات. دەتوانیت تێبینییەکان نوێ بکەیتەوە یان لە ڕیزبەندی لایبەیت.</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-cancel-from-queue"
                                            onClick={() => {
                                                if (currentTargetQueuedJob) {
                                                    removeFromTranslationQueue(currentTargetQueuedJob.queueId);
                                                    showToast(`ئەڵقەی ${aiHubTarget.episode?.number} لە ڕیزبەندی لابرا 🗑️`);
                                                }
                                            }}
                                            title="سڕینەوە لە ڕیزبەندی چاوەڕوانی"
                                        >
                                            <Trash2 size={13} />
                                            <span>سڕینەوە لە ڕیزبەندی</span>
                                        </button>
                                    </div>
                                )}

                                {/* Notice Banner if Another Episode/Task is currently Running */}
                                {isOtherTaskRunning && !isThisTargetRunning && !isThisTargetQueued && (
                                    <div className="ep-ai-other-running-notice">
                                        <div className="other-running-icon">
                                            <Sparkles size={16} color="#a855f7" className="spinning" />
                                        </div>
                                        <div className="other-running-text">
                                            <strong>
                                                {anyActiveRunningTask?.episodeNum
                                                    ? `ئەڵقەی ${anyActiveRunningTask.episodeNum} ئێستا خەریکی وەرگێڕانە (${anyActiveRunningTask.percent || 0}%)...`
                                                    : `کارێکی تری وەرگێڕان ئێستا لە پاشبنەما خەریکی کارە...`}
                                            </strong>
                                            <span>
                                                تێبینی و کورتەی چیرۆک بۆ ئەم ئەڵقەیە بنووسە و لە خوارەوە مۆدەکەی هەڵبژێرە؛ ڕاستەوخۆ دەخرێتە ڕیزبەندی (Queue) و هەر کە ئەڵقەی پێشوو تەواو بوو، بێ ئەوەی دەستی لێبدەیتەوە خۆکارانە دەست پێدەکات!
                                            </span>
                                        </div>
                                    </div>
                                )}

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
                                            {!isThisTargetRunning && (
                                                <button
                                                    type="button"
                                                    className="btn-resume-direct"
                                                    onClick={() => handleStartOrQueue('translate_only')}
                                                    title="دەستپێکردنەوەی خێرا لەو شوێنەی وەستاوە"
                                                >
                                                    <Play size={13} fill="#000" color="#000" />
                                                    <span>{isOtherTaskRunning ? `خستنە ڕیزبەندی لە دێڕی ${partialSrtInfo.translatedLines + 1} ⏳` : `دەستپێکردنەوە لە دێڕی ${partialSrtInfo.translatedLines + 1}`}</span>
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

                                {/* 4. Live Progress & Stats Bar (ONLY when THIS target is actively running) */}
                                {isThisTargetRunning && (
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
                                                    {isThisTargetRunning && (
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

                            {/* 5. Footer Actions (3 Modes, Queued State, or Background Minimize + Stop) */}
                            <div className="ep-ai-hub-footer">
                                {isThisTargetRunning ? (
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
                                ) : isThisTargetQueued ? (
                                    <div className="ep-ai-queued-footer-row">
                                        <button
                                            type="button"
                                            className="btn-ai-queue-update"
                                            onClick={() => handleStartOrQueue(currentTargetQueuedJob?.mode || 'translate_only')}
                                            title="پاشەکەوتکردنی کورتە و مۆدێلی نوێ لەناو ڕیزبەندی"
                                        >
                                            <CheckCircle2 size={16} />
                                            <span>💾 نوێکردنەوەی تێبینییەکان لە ڕیزبەندی (Update Queued Job)</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-ai-queue-remove"
                                            onClick={() => {
                                                if (currentTargetQueuedJob) {
                                                    removeFromTranslationQueue(currentTargetQueuedJob.queueId);
                                                    showToast(`ئەڵقەی ${aiHubTarget.episode?.number} لە ڕیزبەندی لابرا 🗑️`);
                                                    setAiHubTarget(null);
                                                }
                                            }}
                                            title="لابردنی ئەم ئەڵقەیە لە ڕیزبەندی چاوەڕوانی"
                                        >
                                            <Trash2 size={16} />
                                            <span>سڕینەوە لە ڕیزبەندی</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="ep-ai-modes-grid">
                                        <button
                                            type="button"
                                            className="btn-ai-mode-action btn-translate-only"
                                            onClick={() => handleStartOrQueue('translate_only')}
                                        >
                                            <Languages size={17} />
                                            <div className="mode-btn-text">
                                                <strong>
                                                    {isOtherTaskRunning 
                                                        ? `🔤 خستنە ڕیزبەندی (تەنها وەرگێڕان ⏳)`
                                                        : (partialSrtInfo ? `🔤 بەردەوامبوون (لە دێڕی ${partialSrtInfo.translatedLines + 1})` : '🔤 تەنها وەرگێڕانی سەبتایتڵ')}
                                                </strong>
                                                <span>
                                                    {isOtherTaskRunning 
                                                        ? `دوای ئەڵقەی ${anyActiveRunningTask?.episodeNum || 'پێشوو'} خۆکارانە دەست پێدەکات` 
                                                        : 'وەرگێڕانی خێرا و ئابووری بۆ ناو ئەڵقەکە'}
                                                </span>
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            className="btn-ai-mode-action btn-analyze-only"
                                            onClick={() => handleStartOrQueue('analyze_only')}
                                        >
                                            <BarChart2 size={17} />
                                            <div className="mode-btn-text">
                                                <strong>
                                                    {isOtherTaskRunning 
                                                        ? `📊 خستنە ڕیزبەندی (تەنها شیکاری ⏳)` 
                                                        : '📊 تەنها شیکاریی زمانی CEFR'}
                                                </strong>
                                                <span>
                                                    {isOtherTaskRunning 
                                                        ? `دوای ئەڵقەی ${anyActiveRunningTask?.episodeNum || 'پێشوو'} خۆکارانە دەست پێدەکات` 
                                                        : 'ئامادەکردنی ئاستەکانی زمان و وشە قورسەکان'}
                                                </span>
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            className="btn-ai-mode-action btn-all-modes"
                                            onClick={() => handleStartOrQueue('all')}
                                        >
                                            <Sparkles size={17} />
                                            <div className="mode-btn-text">
                                                <strong>
                                                    {isOtherTaskRunning 
                                                        ? `✨ خستنە ڕیزبەندی (شیکاری + وەرگێڕان ⏳)`
                                                        : (partialSrtInfo ? `✨ بەردەوامبوونی گشتی (Resume لە ${partialSrtInfo.percent}%)` : '✨ هەردووکی پێکەوە (شیکاری + وەرگێڕان)')}
                                                </strong>
                                                <span>
                                                    {isOtherTaskRunning 
                                                        ? `دوای ئەڵقەی ${anyActiveRunningTask?.episodeNum || 'پێشوو'} خۆکارانە دەست پێدەکات` 
                                                        : 'ئامادەکردنی تەواوی ژێرنووس و ئامارەکان'}
                                                </span>
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

                {/* ─── CLOUDFLARE R2 AUTO-LINK MODAL ─── */}
                {r2Target && (
                    <div className="ep-modal-backdrop r2-link-backdrop" onClick={() => !r2Target.saving && setR2Target(null)}>
                        <div className="r2-link-modal-card" onClick={e => e.stopPropagation()}>
                            {/* Modal Header */}
                            <div className="r2-link-modal-header">
                                <div className="r2-link-header-left">
                                    <div className="r2-link-icon-bubble">
                                        <Zap size={22} className="r2-bolt-icon" />
                                    </div>
                                    <div>
                                        <h3 className="r2-link-modal-title">
                                            {lang === 'en' 
                                                ? `Auto-Link Episodes from Cloudflare R2 (Season ${r2Target.season.number})` 
                                                : `بەستنەوەی خودکاری ئەڵقەکان لە Cloudflare R2 (سیزنی ${r2Target.season.number}) ⚡`}
                                        </h3>
                                        <p className="r2-link-modal-subtitle">
                                            {lang === 'en' 
                                                ? 'Scans your R2 bucket for HLS master.m3u8 playlists and matches each episode accurately by number.' 
                                                : 'پشکنینی فۆڵدەرەکانی ناو Cloudflare بە دوای فایلی master.m3u8 و بەستنەوەی ئەڵقەکان بە پێی ژمارە.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="ep-modal-close-btn"
                                    disabled={r2Target.saving}
                                    onClick={() => setR2Target(null)}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Keyword Search / Refine Bar */}
                            <div className="r2-link-search-bar">
                                <div className="r2-search-input-wrap">
                                    <Search size={16} className="r2-search-icon" />
                                    <input
                                        type="text"
                                        placeholder={lang === 'en' ? 'Search keyword in R2 folders (e.g. wayward pines)...' : 'ناوی زنجیرە لەناو Cloudflare (نموونە: wayward pines)...'}
                                        value={r2Target.keyword}
                                        onChange={e => setR2Target({ ...r2Target, keyword: e.target.value })}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                scanR2ForSeason(r2Target.season, r2Target.keyword);
                                            }
                                        }}
                                        className="r2-search-input"
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="r2-search-refresh-btn"
                                    disabled={r2Target.loading || r2Target.saving}
                                    onClick={() => scanR2ForSeason(r2Target.season, r2Target.keyword)}
                                >
                                    {r2Target.loading ? <Loader2 size={15} className="spinning" /> : <RefreshCw size={15} />}
                                    <span>{lang === 'en' ? 'Scan R2' : 'پشکنینەوە'}</span>
                                </button>
                            </div>

                            {/* Modal Body / Status */}
                            <div className="r2-link-modal-body">
                                {r2Target.loading && (
                                    <div className="r2-link-loading-state">
                                        <Loader2 size={36} className="spinning r2-spinner" />
                                        <p>{lang === 'en' ? 'Scanning Cloudflare R2 bucket...' : 'پشکنینی فۆڵدەرەکانی Cloudflare R2 دەکرێت...'}</p>
                                        <span>{lang === 'en' ? 'Connecting to storage and analyzing master.m3u8 files' : 'پەیوەندی لەگەڵ کلاودفلێر دەبەسترێت و فایلەکانی master.m3u8 شیدەکرێنەوە'}</span>
                                    </div>
                                )}

                                {r2Target.error && !r2Target.loading && (
                                    <div className="r2-link-error-state">
                                        <AlertCircle size={28} color="#ef4444" />
                                        <p>{r2Target.error}</p>
                                        <button
                                            type="button"
                                            className="btn-r2-retry"
                                            onClick={() => scanR2ForSeason(r2Target.season, r2Target.keyword)}
                                        >
                                            <RefreshCw size={14} /> دووبارە هەوڵبدەوە
                                        </button>
                                    </div>
                                )}

                                {r2Target.data && !r2Target.loading && (
                                    <>
                                        {/* Stats Bar */}
                                        <div className="r2-link-stats-row">
                                            <div className="r2-stat-pill total">
                                                <span>کۆی ئەڵقەکان:</span>
                                                <strong>{r2Target.data.totalEpisodes}</strong>
                                            </div>
                                            <div className="r2-stat-pill ready">
                                                <span>ئامادەیە بۆ بەستنەوە:</span>
                                                <strong>{r2Target.data.readyCount}</strong>
                                            </div>
                                            <div className="r2-stat-pill already">
                                                <span>پێشتر بەستراوەتەوە:</span>
                                                <strong>{r2Target.data.alreadyLinkedCount}</strong>
                                            </div>
                                            <div className={`r2-stat-pill missing ${r2Target.data.missingCount > 0 ? 'has-missing' : ''}`}>
                                                <span>لە R2 نەدۆزرایەوە (بەتاڵ دەمێنێتەوە):</span>
                                                <strong>{r2Target.data.missingCount}</strong>
                                            </div>
                                        </div>

                                        {/* Notice banner if some episodes missing */}
                                        {r2Target.data.missingCount > 0 && (
                                            <div className="r2-missing-alert-box">
                                                <AlertCircle size={18} color="#f59e0b" />
                                                <span>
                                                    ئاگاداری: {r2Target.data.missingCount} ئەڵقە لەناو Cloudflare فایلیان نەدۆزرایەوە. 
                                                    ئەم ئەڵقانە وەک خۆیان بە بەتاڵی دەمێننەوە و هیچ ئەڵقەیەکی تریان ناخرێتە شوێن.
                                                </span>
                                            </div>
                                        )}

                                        {/* Episodes Table / List */}
                                        <div className="r2-episodes-list-wrap">
                                            <table className="r2-episodes-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '80px' }}>ئەڵقە</th>
                                                        <th>ناونیشان</th>
                                                        <th>دۆخی پشکنین لە R2</th>
                                                        <th>لینکی بەستراوە / فۆڵدەری دۆزراوە</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {r2Target.data.episodes.map(ep => {
                                                        const isReady = ep.status === 'ready';
                                                        const isAlready = ep.status === 'already_linked';
                                                        const isMissing = ep.status === 'missing';

                                                        return (
                                                            <tr key={ep.id} className={`r2-row-${ep.status}`}>
                                                                <td>
                                                                    <span className="r2-ep-badge">{ep.number}</span>
                                                                </td>
                                                                <td>
                                                                    <div className="r2-ep-title-cell">
                                                                        <strong>{ep.title || `ئەڵقەی ${ep.number}`}</strong>
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    {isReady && (
                                                                        <span className="r2-status-tag ready">
                                                                            <CheckCircle2 size={13} /> ئامادەیە بۆ بەستنەوە ⚡
                                                                        </span>
                                                                    )}
                                                                    {isAlready && (
                                                                        <span className="r2-status-tag already">
                                                                            <CheckCircle2 size={13} /> پێشتر بەستراوەتەوە ✓
                                                                        </span>
                                                                    )}
                                                                    {isMissing && (
                                                                        <span className="r2-status-tag missing">
                                                                            <AlertCircle size={13} /> نەدۆزرایەوە (بەتاڵ دەبێت)
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td>
                                                                    {ep.matchedVideoUrl ? (
                                                                        <div className="r2-url-preview-cell" title={ep.matchedVideoUrl}>
                                                                            <code>{ep.matchedVideoUrl}</code>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="r2-no-url-text">هیچ فایلێک نییە</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="r2-link-modal-footer">
                                <button
                                    type="button"
                                    className="btn-reserve-cancel"
                                    disabled={r2Target.saving}
                                    onClick={() => setR2Target(null)}
                                >
                                    {lang === 'en' ? 'Cancel' : 'داخستن'}
                                </button>

                                <button
                                    type="button"
                                    className="btn-r2-apply-primary"
                                    disabled={
                                        r2Target.loading || 
                                        r2Target.saving || 
                                        !r2Target.data || 
                                        (r2Target.data.readyCount === 0 && r2Target.data.alreadyLinkedCount === 0)
                                    }
                                    onClick={handleApplyR2Links}
                                >
                                    {r2Target.saving ? (
                                        <>
                                            <Loader2 size={16} className="spinning" />
                                            <span>{lang === 'en' ? 'Linking in Progress...' : 'لە بەستنەوەدایە...'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Zap size={16} />
                                            <span>
                                                {lang === 'en'
                                                    ? `Auto-Link ${r2Target.data?.readyCount || 0} Episodes Now ⚡`
                                                    : `بەستنەوەی ${r2Target.data ? (r2Target.data.readyCount > 0 ? r2Target.data.readyCount : r2Target.data.alreadyLinkedCount) : 0} ئەڵقە ئێستا ⚡`}
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── HIDDEN INPUTS FOR BATCH SUBTITLES ─── */}
                <input
                    type="file"
                    multiple
                    accept=".srt,.vtt"
                    ref={batchFileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFilesSelected}
                />
                <input
                    type="file"
                    // @ts-ignore
                    webkitdirectory=""
                    directory=""
                    multiple
                    ref={batchFolderInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFolderSelected}
                />

                {/* ─── BATCH SUBTITLES LINKER MODAL ─── */}
                {batchSubTarget && (
                    <div
                        className="ep-modal-backdrop batch-sub-backdrop"
                        onClick={() => !batchSubTarget.saving && setBatchSubTarget(null)}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <div className="batch-sub-modal-card" onClick={e => e.stopPropagation()}>
                            {/* Modal Header */}
                            <div className="batch-sub-modal-header">
                                <div className="batch-sub-header-left">
                                    <div className="batch-sub-icon-bubble">
                                        <FolderOpen size={22} className="batch-sub-icon" />
                                    </div>
                                    <div>
                                        <h3 className="batch-sub-modal-title">
                                            {lang === 'en'
                                                ? `Batch Link Subtitles (Season ${batchSubTarget.season.number})`
                                                : `بەستنەوەی بەکۆمەڵی ژێرنووسەکان (سیزنی ${batchSubTarget.season.number}) 📂`}
                                        </h3>
                                        <p className="batch-sub-modal-subtitle">
                                            {lang === 'en'
                                                ? 'Upload your season folder or files — all episodes match automatically.'
                                                : 'تەواوی فۆڵدەری زنجیرەکە یاخود فایلەکان هەڵبژێرە، سیستەمەکە خۆکارانە ئەڵقەکان دەبەستێتەوە.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="ep-modal-close-btn"
                                    disabled={batchSubTarget.saving}
                                    onClick={() => setBatchSubTarget(null)}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Subtitle Category Selection Bar */}
                            <div className="batch-sub-type-bar">
                                <span className="batch-sub-type-label">
                                    {lang === 'en' ? 'Subtitle Category:' : 'جۆری ژێرنووس بۆ داغڵکردن:'}
                                </span>
                                <div className="batch-sub-type-options">
                                    <label className={`batch-type-pill ${batchSubType === 'original' ? 'active' : ''}`}>
                                        <input
                                            type="radio"
                                            name="batchSubType"
                                            value="original"
                                            checked={batchSubType === 'original'}
                                            onChange={() => setBatchSubType('original')}
                                        />
                                        <FileText size={14} />
                                        <span>{lang === 'en' ? 'Original (English / Source)' : 'ئەسڵی (ئینگلیزی / سەرچاوە - Original)'}</span>
                                    </label>
                                    <label className={`batch-type-pill ${batchSubType === 'translated' ? 'active' : ''}`}>
                                        <input
                                            type="radio"
                                            name="batchSubType"
                                            value="translated"
                                            checked={batchSubType === 'translated'}
                                            onChange={() => setBatchSubType('translated')}
                                        />
                                        <Languages size={14} />
                                        <span>{lang === 'en' ? 'Kurdish (Translated)' : 'کوردی (وەرگێڕدراو - Kurdish)'}</span>
                                    </label>
                                </div>
                            </div>

                            {/* Action / Summary Bar */}
                            <div className="batch-sub-action-bar">
                                <div className="batch-sub-summary">
                                    <span className="batch-badge-count">
                                        {batchSubTarget.items.filter(it => it.selectedEpNum !== null).length} / {batchSubTarget.items.length} {lang === 'en' ? 'Episodes Matched' : 'ئەڵقە بەستراونەتەوە'}
                                    </span>
                                    <span className="batch-badge-season-info">
                                        {batchSubTarget.season.episodes.length} {lang === 'en' ? 'episodes in season' : 'ئەڵقە لەم وەرزەدا هەیە'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        className="batch-btn-add-more"
                                        style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: '#34d399', color: '#34d399' }}
                                        onClick={() => batchFolderInputRef.current?.click()}
                                        title="تەواوی فۆڵدەری سەرەکی زنجیرەکە هەڵبژێرە، هەموو ژێرنووسەکانی ناو سابفۆڵدەرەکانیش دەخوێنێتەوە"
                                    >
                                        <FolderOpen size={14} />
                                        <span>{lang === 'en' ? 'Pick Season Folder 📁' : 'هەڵبژاردنی تەواوی فۆڵدەر 📁'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="batch-btn-add-more"
                                        onClick={() => batchFileInputRef.current?.click()}
                                    >
                                        <Plus size={14} />
                                        <span>{lang === 'en' ? 'Add files' : 'فایلی تر'}</span>
                                    </button>
                                    {batchSubTarget.items.length > 0 && (
                                        <button
                                            type="button"
                                            className="batch-btn-add-more"
                                            style={{ color: '#f87171' }}
                                            onClick={() => setBatchSubTarget(prev => prev ? { ...prev, items: [] } : null)}
                                            title="سڕینەوەی هەمووی"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Scrollable File List or Empty Dropzone */}
                            {batchSubTarget.items.length === 0 ? (
                                <div
                                    className={`batch-empty-dropzone ${isDraggingOver ? 'is-dragging' : ''}`}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                >
                                    <div className="batch-dropzone-icon-wrap">
                                        <FolderOpen size={40} />
                                    </div>
                                    <h4>{lang === 'en' ? 'Drop Season Folder or Files Here' : 'تەواوی فۆڵدەر یان فایلەکان لێرە فڕێ بدە (Drag & Drop)'}</h4>
                                    <p>
                                        {lang === 'en'
                                            ? 'Drag the main series folder (e.g. Below 2026) here — all subfolders and .srt files will be scanned automatically!'
                                            : 'دەتوانیت تەواوی فۆڵدەری سەرەکی زنجیرەکە (Below 2026) ڕاستەوخۆ بە ماوس ڕابکێشیتە ئێرە؛ هەموو فۆڵدەر و ئەڵقەکانی ناوی بە خۆکار دەردەهێنرێن!'}
                                    </p>
                                    <div className="batch-dropzone-buttons">
                                        <button
                                            type="button"
                                            className="batch-btn-pick-folder"
                                            onClick={() => batchFolderInputRef.current?.click()}
                                        >
                                            <FolderOpen size={16} />
                                            <span>{lang === 'en' ? 'Select Season Folder 📁' : 'هەڵبژاردنی تەواوی فۆڵدەر (Folder) 📁'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="batch-btn-pick-files"
                                            onClick={() => batchFileInputRef.current?.click()}
                                        >
                                            <FileText size={16} />
                                            <span>{lang === 'en' ? 'Select Files (.srt) 📄' : 'دیاریکردنی فایلەکان (.srt) 📄'}</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="batch-sub-list-container">
                                    {batchSubTarget.items.map((item, idx) => {
                                        const matchedEp = batchSubTarget.season.episodes.find(e => e.number === item.selectedEpNum);
                                        const alreadyHas = matchedEp ? (batchSubType === 'original' ? !!matchedEp.originalSrt : !!matchedEp.translatedSrt) : false;
                                        const isDuplicate = item.selectedEpNum !== null && batchSubTarget.items.filter(it => it.selectedEpNum === item.selectedEpNum).length > 1;

                                        return (
                                            <div key={idx} className={`batch-sub-row ${item.selectedEpNum !== null ? 'is-matched' : 'is-unmatched'}`}>
                                                <div className="batch-sub-file-info">
                                                    <FileText size={18} className="batch-file-icon" />
                                                    <div className="batch-sub-filename" title={item.file.name}>
                                                        <span>{item.file.name}</span>
                                                    </div>
                                                    <span className="batch-file-size">{(item.file.size / 1024).toFixed(1)} KB</span>
                                                </div>

                                                <div className="batch-sub-match-col">
                                                    <span className="batch-arrow-label">➡️</span>
                                                    <select
                                                        className={`batch-ep-select ${item.selectedEpNum !== null ? 'has-val' : 'no-val'}`}
                                                        value={item.selectedEpNum ?? ''}
                                                        onChange={e => handleUpdateItemEpisode(idx, e.target.value ? parseInt(e.target.value, 10) : null)}
                                                    >
                                                        <option value="">{lang === 'en' ? '-- Skip / Unassigned --' : '-- پشتگوێخستن --'}</option>
                                                        {batchSubTarget.season.episodes.map(ep => (
                                                            <option key={ep.id} value={ep.number}>
                                                                {lang === 'en' ? `Episode ${ep.number} (${ep.title})` : `ئەڵقەی ${ep.number} (${ep.title})`}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    {item.selectedEpNum !== null && (
                                                        <div className="batch-status-chips">
                                                            <span className="batch-tag matched-tag">
                                                                <CheckCircle2 size={12} />
                                                                <span>{item.autoMatched ? (lang === 'en' ? 'Auto-matched' : 'خۆکار دۆزرایەوە') : (lang === 'en' ? 'Manual' : 'دەستی')}</span>
                                                            </span>
                                                            {isDuplicate && (
                                                                <span className="batch-tag duplicate-tag" title="ئەم ئەڵقەیە بۆ زیاتر لە یەک فایل هەڵبژێردراوە">
                                                                    <AlertCircle size={11} />
                                                                    <span>{lang === 'en' ? 'Duplicate ep' : 'ئەڵقەی دووبارە'}</span>
                                                                </span>
                                                            )}
                                                            {alreadyHas && !isDuplicate && (
                                                                <span className="batch-tag overwrite-tag" title="ئەم ئەڵقەیە پێشتر ئەم جۆرە ژێرنووسەی هەبووە و دەگۆڕدرێت بەمە">
                                                                    <RefreshCw size={11} />
                                                                    <span>{lang === 'en' ? 'Overwrites existing' : 'نوێکردنەوە'}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    type="button"
                                                    className="batch-remove-file-btn"
                                                    title={lang === 'en' ? 'Remove file' : 'سڕینەوەی ئەم فایلە'}
                                                    onClick={() => handleRemoveBatchItem(idx)}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Modal Footer */}
                            <div className="batch-sub-modal-footer">
                                <button
                                    type="button"
                                    className="batch-btn-cancel"
                                    disabled={batchSubTarget.saving}
                                    onClick={() => setBatchSubTarget(null)}
                                >
                                    {lang === 'en' ? 'Cancel' : 'هەڵوەشاندنەوە'}
                                </button>
                                <button
                                    type="button"
                                    className="batch-btn-save"
                                    disabled={batchSubTarget.saving || batchSubTarget.items.filter(it => it.selectedEpNum !== null).length === 0}
                                    onClick={handleSaveBatchSubtitles}
                                >
                                    {batchSubTarget.saving ? (
                                        <>
                                            <Loader2 size={16} className="spinning" />
                                            <span>{batchSaveProgressText || (lang === 'en' ? 'Saving...' : 'پاشەکەوت دەکرێت...')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={16} />
                                            <span>
                                                {lang === 'en'
                                                    ? `Save ${batchSubTarget.items.filter(it => it.selectedEpNum !== null).length} Subtitles 🚀`
                                                    : `پاشەکەوتکردنی ${batchSubTarget.items.filter(it => it.selectedEpNum !== null).length} ژێرنووس 🚀`}
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
