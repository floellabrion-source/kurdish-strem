import { useState, useEffect, useRef } from 'react';
import axios from '../api/client';
import {
    Plus, Film, Trash2, Edit3, Save, X,
    CheckCircle, AlertCircle, Loader2, FileText,
    Image, Video, Layers, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
    PlusCircle, ListVideo, Upload, Languages, Shield, ShieldCheck, Link as LinkIcon, Star, Play, Search,
    Users, BarChart2, CreditCard, Sparkles, Filter, Download, Pause, History, Trophy, BookOpen,
    HardDrive, Bell
} from 'lucide-react';
import { Movie, Season, Episode, LanguageMetrics, getCefrDisplayLevel, getCefrColor } from '../types';
import { runAiTranslationAndAnalysis, triggerFileDownload, pauseTranslationTask } from '../utils/aiTranslator';
import SrtTranslator from './SrtTranslator';
import AdminUsers from './AdminUsers';
import AdminAnalytics from './AdminAnalytics';
import AdminActivityLog from './AdminActivityLog';
import AdminBackups from './AdminBackups';
import { AdminNotificationManager } from '../components/AdminNotificationManager';
import DualSrtVideoEditor from '../components/DualSrtVideoEditor';
import EpisodeManagerModal from '../components/EpisodeManagerModal';
import LanguageMetricsModal from '../components/LanguageMetricsModal';
import SubtitleDiffViewer from '../components/SubtitleDiffViewer';
import AdminGlossary from './AdminGlossary';
import AdminCredits from './AdminCredits';
import AdminPlans from './AdminPlans';
import AiTranslationTracker from '../components/AiTranslationTracker';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebSocket } from '../context/WebSocketContext';
import './Admin.css';

interface Toast { id: number; msg: string; type: 'success' | 'error'; }

const GENRES_LIST = [
    { id: 'crime', ku: 'تاوانکاری', en: 'Crime' },
    { id: 'drama', ku: 'دراما', en: 'Drama' },
    { id: 'scifi', ku: 'زانستی خەیاڵی', en: 'Sci-Fi' },
    { id: 'thriller', ku: 'هەستبزوێن', en: 'Thriller' },
    { id: 'action', ku: 'ئاکشن', en: 'Action' },
    { id: 'adventure', ku: 'سەرکێشی', en: 'Adventure' },
    { id: 'family', ku: 'خێزانی', en: 'Family' },
    { id: 'fantasy', ku: 'خەیاڵی', en: 'Fantasy' },
    { id: 'music', ku: 'موزیک', en: 'Music' },
    { id: 'history', ku: 'مێژوویی', en: 'History' },
    { id: 'horror', ku: 'ترسناک', en: 'Horror' },
    { id: 'documentary', ku: 'دۆکیۆمێنتاری', en: 'Documentary' },
    { id: 'comedy', ku: 'کۆمێدی', en: 'Comedy' },
    { id: 'western', ku: 'ڕۆژئاوایی', en: 'Western' },
    { id: 'sport', ku: 'وەرزشی', en: 'Sport' },
    { id: 'medical', ku: 'پزیشکی', en: 'Medical' },
    { id: 'short', ku: 'کورتە', en: 'Short' },
    { id: 'social', ku: 'کۆمەڵایەتی', en: 'Social' },
    { id: 'tragedy', ku: 'تراژیدی', en: 'Tragedy' },
    { id: 'mystery', ku: 'سیخوڕی', en: 'Mystery' },
    { id: 'classic', ku: 'کلاسیک', en: 'Classic' },
    { id: 'samurai', ku: 'سامۆرای', en: 'Samurai' },
    { id: 'biography', ku: 'بیۆگرافی', en: 'Biography' },
    { id: 'war', ku: 'جەنگ', en: 'War' }
];

const genreMap: Record<string, string> = {
    'Crime': 'تاوانکاری', 'Drama': 'دراما', 'Sci-Fi': 'زانستی خەیاڵی', 'Thriller': 'هەستبزوێن',
    'Action': 'ئاکشن', 'Adventure': 'سەرکێشی', 'Family': 'خێزانی', 'Fantasy': 'خەیاڵی',
    'Music': 'موزیک', 'History': 'مێژوویی', 'Horror': 'ترسناک', 'Documentary': 'دۆکیۆمێنتاری',
    'Comedy': 'کۆمێدی', 'Western': 'ڕۆژئاوایی', 'Sport': 'وەرزشی', 'Short': 'کورتە',
    'Romance': 'ڕۆمانسی', 'War': 'جەنگ', 'Biography': 'بیۆگرافی', 'Mystery': 'نهێنی ئامێز',
    'Animation': 'ئەنیمێشن'
};

export default function Admin() {
    const { user } = useAuth();
    const { lang, t } = useLanguage();
    const isSuperAdmin = user?.role === 'super_admin' || user?.username === 'maher2' || user?.username?.toLowerCase() === 'admin';
    const canAddMovies = isSuperAdmin || (user?.role === 'admin' && (user?.permissions ? Boolean(user.permissions.canAddMovies) : true));
    const canTranslate = isSuperAdmin || (user?.role === 'admin' && (user?.permissions ? Boolean(user.permissions.canTranslate) : true));
    const canManageCredits = isSuperAdmin || (user?.role === 'admin' && (user?.permissions ? Boolean(user.permissions.canManageCredits) : true));
    const canManageComments = isSuperAdmin || (user?.role === 'admin' && (user?.permissions ? Boolean(user.permissions.canManageComments) : true));
    const canPublishDirectly = isSuperAdmin || (user?.role === 'admin' && (user?.permissions ? Boolean(user.permissions.canPublishDirectly) : false));

    const [activeTab, setActiveTab] = useState<'movies' | 'approvals' | 'hero' | 'credits' | 'plans' | 'users' | 'analytics' | 'activities' | 'ai_tracking' | 'glossary' | 'backups' | 'notifications_manager'>(() => {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const urlTab = urlParams.get('tab');
            if (urlTab) return urlTab as any;
            const saved = localStorage.getItem('admin_active_tab');
            if (saved) return saved as any;
        } catch {}
        return 'movies';
    });

    useEffect(() => {
        try {
            localStorage.setItem('admin_active_tab', activeTab);
            const url = new URL(window.location.href);
            url.searchParams.set('tab', activeTab);
            window.history.replaceState({}, '', url.toString());
        } catch {}
    }, [activeTab]);

    const adminTabsRef = useRef<HTMLDivElement>(null);
    const [heroSearchTerm, setHeroSearchTerm] = useState('');
    const [pendingCreditsCount, setPendingCreditsCount] = useState(0);
    const [movies, setMovies] = useState<Movie[]>(() => {
        try {
            const cached = localStorage.getItem('ks_cached_movies');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [loading, setLoading] = useState(() => !Boolean(localStorage.getItem('ks_cached_movies')));
    const [showForm, setShowForm] = useState(false);
    const [editMovie, setEditMovie] = useState<Movie | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    
    // Subtitle & Episode Management Modals
    const [episodesModalMovie, setEpisodesModalMovie] = useState<Movie | null>(null);
    const [srtEditorData, setSrtEditorData] = useState<{
        open: boolean;
        movieId: string;
        movieTitle: string;
        seasonNum?: number;
        episodeNum?: number;
        episodeTitle?: string;
        videoUrl?: string;
    } | null>(() => {
        try {
            const saved = sessionStorage.getItem('admin_srt_editor');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        try {
            if (srtEditorData?.open) {
                sessionStorage.setItem('admin_srt_editor', JSON.stringify(srtEditorData));
            } else {
                sessionStorage.removeItem('admin_srt_editor');
            }
        } catch {}
    }, [srtEditorData]);

    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
    const [expandedMovies, setExpandedMovies] = useState<Record<string, boolean>>({});

    const toggleMovieExpand = (movieId: string) => {
        setExpandedMovies(prev => ({ ...prev, [movieId]: !prev[movieId] }));
    };

    const [sensitiveTarget, setSensitiveTarget] = useState<{ movieId: string, seasonNum?: number, episodeId?: string } | null>(null);
    const [sensitiveScenes, setSensitiveScenes] = useState<{ start: number, end: number }[]>([]);
    const [diffViewerTarget, setDiffViewerTarget] = useState<{ movieId: string; movieTitle: string; seasonNum?: number; episodeNum?: number; episodeTitle?: string; seasons?: any[] } | null>(null);

    const [editEpisodeTarget, setEditEpisodeTarget] = useState<{ movieId: string, seasonNum: number, epId: string } | null>(null);
    const [editEpForm, setEditEpForm] = useState({ title: '', description: '', duration: '' });

    const [fetchingImdbRating, setFetchingImdbRating] = useState(false);

    const [metricsTarget, setMetricsTarget] = useState<{
        movieId: string;
        movieTitle: string;
        seasonNum?: number;
        episodeId?: string;
        episodeTitle?: string;
        initialMetrics?: LanguageMetrics;
    } | null>(null);

    const handleSaveLanguageMetrics = async (newMetrics: LanguageMetrics) => {
        if (!metricsTarget) return;
        try {
            const movie = movies.find(m => m.id === metricsTarget.movieId);
            if (!movie) return;

            if (metricsTarget.seasonNum !== undefined && metricsTarget.episodeId) {
                const updatedSeasons = (movie.seasons || []).map(s => {
                    if (s.number !== metricsTarget.seasonNum) return s;
                    return {
                        ...s,
                        episodes: s.episodes.map(e => {
                            if (e.id !== metricsTarget.episodeId) return e;
                            return { ...e, languageMetrics: newMetrics };
                        })
                    };
                });
                await axios.put(`/api/admin/movies/${movie.id}`, { seasons: updatedSeasons });
                toast('ئامارەکانی زمانی ئەڵقە بە سەرکەوتوویی پاشەکەوت کران ✓');
            } else {
                const levelCefr = newMetrics.cefrLevel || 'A2';
                await axios.put(`/api/admin/movies/${movie.id}`, { languageMetrics: newMetrics, level: levelCefr });
                toast('ئامارەکانی زمانی فیلم بە سەرکەوتوویی پاشەکەوت کران ✓');
        }
        load();
        setMetricsTarget(null);
    } catch (err) {
        console.error(err);
        toast('نەتوانرا ئامارەکان پاشەکەوت بکرێن', 'error');
    }
};

const [movieTransProgress, setMovieTransProgress] = useState<Record<string, { status: 'running' | 'paused' | 'done', statusText: string, percent: number }>>({});

const handleDownloadMovieOriginalSrt = async (movie: Movie) => {
    try {
        const res = await axios.get(`/api/admin/movies/${movie.id}/srt-content`);
        const origText = res.data.originalSrtText || '';
        if (!origText.trim()) {
            toast('فایلی ئۆرجیناڵ بەردەست نییە بۆ داگرتن', 'error');
            return;
        }
        triggerFileDownload(origText, `${movie.title}_original.srt`);
        toast('فایلی ئۆرجیناڵ داگیرا ✓');
    } catch (err) {
        console.error(err);
        toast('نەتوانرا فایلی ئۆرجیناڵ دابگیرێت', 'error');
    }
};

const handleDownloadMovieKurdishSrt = async (movie: Movie) => {
    try {
        const res = await axios.get(`/api/admin/movies/${movie.id}/srt-content`);
        const kurdishText = res.data.translatedSrtText || '';
        if (!kurdishText.trim()) {
            toast('فایلی کوردی بەردەست نییە بۆ داگرتن', 'error');
            return;
        }
        triggerFileDownload(kurdishText, `${movie.title}_kurdish.srt`);
        toast('فایلی سەبتایتڵی کوردی داگیرا ✓');
    } catch (err) {
        console.error(err);
        toast('نەتوانرا فایلی کوردی دابگیرێت', 'error');
    }
};

const handleDownloadMovieMetricsTxt = (movie: Movie) => {
    const m = movie.languageMetrics;
    if (!m) {
        toast('ئاماری زمان بۆ ئەم بەرهەمە دروست نەکراوە', 'error');
        return;
    }
    const txtContent = `ئامارەکانی زمانی فیلم/ئەنیمەیشنی: ${movie.title} (${movie.year || ''})\n\nسەرجەمی وشەکان: ${m.totalWords}\nئاستی گشتی CEFR: ${m.cefrLevel}\nچڕی فەرهەنگی: ${m.lexicalDensity}%\nجۆراوجۆری وشەکان: ${m.vocabDiversity}%\n\nدابەشبوونی ئاستەکانی زمان:\nA1: ${m.distribution?.A1 || 0}%\nA2: ${m.distribution?.A2 || 0}%\nB1: ${m.distribution?.B1 || 0}%\nB2: ${m.distribution?.B2 || 0}%\nC1: ${m.distribution?.C1 || 0}%\nC2: ${m.distribution?.C2 || 0}%\n\n١٠ وشە ئەکادیمی و پێشکەوتووەکان:\n${(m.difficultWords || []).map((w, idx) => `${idx + 1}. ${w.word} (${w.type}): ${w.definition}`).join('\n')}\n\nوشە دووبارەبووەکان:\n${(m.repeatedWords || []).map(w => `* ${w.word}: ${w.count} جار (${w.meaning || ''})`).join('\n')}`;

    triggerFileDownload(txtContent, `${movie.title}_analysis.txt`);
    toast('فایلی شیکاریی زمانەوانی (.txt) داگیرا ✓');
};

const handleAiTranslateMovie = async (movie: Movie) => {
    const taskId = `${movie.id}-m-m`;
    const curr = movieTransProgress[movie.id];

    // If currently running, PAUSE it!
    if (curr?.status === 'running') {
        pauseTranslationTask(taskId);
        setMovieTransProgress(prev => ({
            ...prev,
            [movie.id]: { ...prev[movie.id], status: 'paused', statusText: 'خەریکی ڕاگرتن...' }
        }));
        toast('وەرگێڕان ڕاگیرا ⏸️');
        return;
    }

    // Start or Resume
    setMovieTransProgress(prev => ({
        ...prev,
        [movie.id]: { status: 'running', statusText: 'دەستپێکردن...', percent: curr?.percent || 0 }
    }));

    try {
        const result = await runAiTranslationAndAnalysis(
            movie.id,
            undefined,
            undefined,
            (statusText, percent, status) => {
                setMovieTransProgress(prev => ({
                    ...prev,
                    [movie.id]: { status, statusText, percent }
                }));
            }
        );

        if (result.status === 'paused') {
            toast(`وەرگێڕان ڕاگیرا لە (${result.translatedCount}/${result.totalCount} دێڕ) ⏸️`);
            load();
            return;
        }

        if (result.metrics) {
            const levelCefr = result.metrics.cefrLevel || 'A2';
            await axios.put(`/api/admin/movies/${movie.id}`, {
                translatedSrt: 'translated.srt',
                languageMetrics: result.metrics,
                level: levelCefr
            });
        } else {
            await axios.put(`/api/admin/movies/${movie.id}`, {
                translatedSrt: 'translated.srt'
            });
        }

        toast(`فیلمی ${movie.title} بە سەرکەوتوویی وەرگێڕدرا! ✓`);
        setMovieTransProgress(prev => {
            const next = { ...prev };
            delete next[movie.id];
            return next;
        });
        load();
    } catch (err: any) {
        console.error(err);
        const msg = err.response?.data?.error?.message || err.message || 'هەڵەیەک لە وەرگێڕاندا ڕوویدا';
        toast(msg, 'error');
        setMovieTransProgress(prev => {
            const next = { ...prev };
            delete next[movie.id];
            return next;
        });
    }
};

const handleDirectMovieSrtUpload = async (movie: Movie, file: File, srtType: 'original' | 'translated') => {
    try {
        const text = await file.text();
        const payload: any = {};
        if (srtType === 'original') payload.originalSrtText = text;
        else payload.translatedSrtText = text;

        await axios.post(`/api/admin/movies/${movie.id}/srt-content`, payload);
        toast(`فایلی ${srtType === 'original' ? 'ئۆرجیناڵ' : 'کوردی'} بارکرا ✓`);
        setMovies(prev => prev.map(m => {
            if (m.id !== movie.id) return m;
            return {
                ...m,
                originalSrt: srtType === 'original' ? `${movie.id}_original.srt` : m.originalSrt,
                translatedSrt: srtType === 'translated' ? `${movie.id}_translated.srt` : m.translatedSrt
            };
        }));
        load(true);
    } catch (err) {
        console.error('Direct movie SRT upload failed', err);
        doUpload(movie.id, file, 'srt', { srtType });
    }
};

const handleDeleteMovieVideo = async (movie: Movie) => {
    if (!window.confirm(`ئایا دڵنیایت لە سڕینەوەی فایلی ڤیدیۆی فیلمی "${movie.title}" لە سێرڤەر؟`)) return;
    try {
        await axios.delete(`/api/admin/movies/${movie.id}/video`);
        toast('فایلی ڤیدیۆی فیلمەکە بە سەرکەوتوویی سڕایەوە ✓');
        load(true);
    } catch {
        toast('کێشەیەک لە سڕینەوەی ڤیدیۆ ڕوویدا', 'error');
    }
};

const handleDeleteMovieSrt = async (movie: Movie, srtType: 'original' | 'translated') => {
    const label = srtType === 'translated' ? 'سەبتایتڵی کوردی' : 'سەبتایتڵی ئەسڵی';
    if (!window.confirm(`ئایا دڵنیایت لە سڕینەوەی ${label}ی فیلمی "${movie.title}"؟`)) return;
    try {
        await axios.delete(`/api/admin/movies/${movie.id}/srt/${srtType}`);
        toast(`${label} بە سەرکەوتوویی سڕایەوە ✓`);
        load(true);
    } catch {
        toast(`کێشەیەک لە سڕینەوەی ${label} ڕوویدا`, 'error');
    }
};

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'movie' | 'series' | 'animation'>('all');
    const [selectedAdminGenres, setSelectedAdminGenres] = useState<string[]>([]);
    const [selectedAdminLevel, setSelectedAdminLevel] = useState<string>('');
    const [showAdminGenreMenu, setShowAdminGenreMenu] = useState(false);
    const [showAdminLevelMenu, setShowAdminLevelMenu] = useState(false);
    const [showAdminTypeMenu, setShowAdminTypeMenu] = useState(false);
    const adminFiltersRef = useRef<HTMLDivElement>(null);

    const [form, setForm] = useState({
        title: '', description: '', descriptionKu: '', descriptionEn: '', descriptionAr: '', language: '', genre: '', year: new Date().getFullYear().toString(), endYear: '',
        duration: '', type: 'movie' as 'movie' | 'series' | 'animation', imdbRating: '' as string | number,
        posterUrl: '', seasons: [] as Season[]
    });

    const refs = {
        video: useRef<Record<string, HTMLInputElement | null>>({}),
        poster: useRef<Record<string, HTMLInputElement | null>>({}),
        origSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        transSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        epVideo: useRef<Record<string, HTMLInputElement | null>>({}),
        epOrigSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        epTransSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        r2Video: useRef<Record<string, HTMLInputElement | null>>({}),
        r2EpVideo: useRef<Record<string, HTMLInputElement | null>>({}),
    };

    const toast = (msg: string, type: 'success' | 'error' = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, msg, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
    };

    const load = (silent = false) => {
        if (!silent && movies.length === 0) setLoading(true);
        axios.get('/api/movies')
            .then(r => {
                if (Array.isArray(r.data)) {
                    setMovies(r.data);
                    try {
                        localStorage.setItem('ks_cached_movies', JSON.stringify(r.data));
                    } catch {}
                }
            })
            .catch((err) => {
                console.error('[Admin load error]', err);
                // Auto retry once after 600ms if initial load failed during page mount
                setTimeout(() => {
                    axios.get('/api/movies').then(retryRes => {
                        if (Array.isArray(retryRes.data)) {
                            setMovies(retryRes.data);
                            try {
                                localStorage.setItem('ks_cached_movies', JSON.stringify(retryRes.data));
                            } catch {}
                        }
                    }).catch(() => {});
                }, 600);
            })
            .finally(() => {
                setLoading(false);
            });

        if (isSuperAdmin || canManageCredits) {
            axios.get('/api/admin/credit-requests')
                .then(r => {
                    const pending = (r.data || []).filter((req: any) => req.status === 'pending').length;
                    setPendingCreditsCount(pending);
                })
                .catch(() => {});
        }
    };

    const { lastEvent } = useWebSocket();

    // Real-time synchronization when movies are submitted, approved, or rejected
    useEffect(() => {
        if (!lastEvent) return;
        if (
            lastEvent.event === 'MOVIE_APPROVAL_SUBMITTED' ||
            lastEvent.event === 'MOVIE_APPROVED' ||
            lastEvent.event === 'MOVIE_REJECTED' ||
            lastEvent.event === 'GLOSSARY_UPDATED'
        ) {
            load(true);
        }
    }, [lastEvent]);

    useEffect(() => { load(); }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (adminFiltersRef.current && !adminFiltersRef.current.contains(event.target as Node)) {
                setShowAdminGenreMenu(false);
                setShowAdminLevelMenu(false);
                setShowAdminTypeMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCreate = async () => {
        if (!form.title.trim()) { toast('ناوی بەرهەمەکە داخڵ بکە', 'error'); return; }
        try {
            let formToSend = { ...form };
            if (formToSend.title.includes('http') || formToSend.title.includes('imdb.com') || /^tt\d{7,8}$/i.test(formToSend.title.trim())) {
                const match = formToSend.title.match(/tt\d{7,8}/i);
                if (match) {
                    try {
                        const omdbCheck = await axios.get(`/api/omdb-rating?title=${match[0]}`);
                        if (omdbCheck.data && omdbCheck.data.title) {
                            formToSend.title = omdbCheck.data.title;
                        }
                    } catch {}
                }
            }
            const res = await axios.post('/api/admin/movies', { ...formToSend, year: parseInt(formToSend.year), endYear: formToSend.endYear ? parseInt(formToSend.endYear) : null });
            toast('بە سەرکەوتوویی زیاد کرا ✓');
            setShowForm(false);
            setForm({ title: '', description: '', descriptionKu: '', descriptionEn: '', descriptionAr: '', language: '', genre: '', year: new Date().getFullYear().toString(), endYear: '', duration: '', type: 'movie' as 'movie' | 'series' | 'animation', imdbRating: '', posterUrl: '', seasons: [] });
            if (res.data) {
                setMovies(prev => [res.data, ...prev.filter(m => m.id !== res.data.id)]);
            }
            load(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const handleSaveEdit = async () => {
        if (!editMovie) return;
        try {
            let movieToSave = { ...editMovie };
            if (movieToSave.title.includes('http') || movieToSave.title.includes('imdb.com') || /^tt\d{7,8}$/i.test(movieToSave.title.trim())) {
                const match = movieToSave.title.match(/tt\d{7,8}/i);
                if (match) {
                    try {
                        const omdbCheck = await axios.get(`/api/omdb-rating?title=${match[0]}`);
                        if (omdbCheck.data && omdbCheck.data.title) {
                            movieToSave.title = omdbCheck.data.title;
                        }
                    } catch {}
                }
            }
            await axios.put(`/api/admin/movies/${movieToSave.id}`, movieToSave);
            toast('پاشەکەوت کرا ✓');
            setEditMovie(null);
            load(true);
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const handleDelete = async (movie: Movie) => {
        if (!confirm(`ئایا دڵنیایت لە سڕینەوەی "${movie.title}"؟`)) return;
        try {
            await axios.delete(`/api/admin/movies/${movie.id}`);
            toast('سڕایەوە ✓');
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const handleSaveSensitive = async () => {
        if (!sensitiveTarget) return;
        const movieIdx = movies.findIndex(m => m.id === sensitiveTarget.movieId);
        if (movieIdx === -1) return;

        const updatedMovie = JSON.parse(JSON.stringify(movies[movieIdx]));

        if (sensitiveTarget.episodeId !== undefined && sensitiveTarget.seasonNum !== undefined) {
            const season = updatedMovie.seasons.find((s: Season) => s.number === sensitiveTarget.seasonNum);
            if (season) {
                const ep = season.episodes.find((e: Episode) => e.id === sensitiveTarget.episodeId);
                if (ep) ep.sensitiveScenes = sensitiveScenes;
            }
        } else {
            updatedMovie.sensitiveScenes = sensitiveScenes;
        }

        try {
            await axios.put(`/api/admin/movies/${updatedMovie.id}`, updatedMovie);
            toast('کاتی نەشیاو دیاری کرا ✓');
            setSensitiveTarget(null);
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const openSensitiveModal = (movieId: string, seasonNum?: number, episodeId?: string) => {
        setSensitiveTarget({ movieId, seasonNum, episodeId });
        const m = movies.find(x => x.id === movieId);
        if (episodeId && seasonNum && m?.seasons) {
            const ep = m.seasons.find(s => s.number === seasonNum)?.episodes.find(e => e.id === episodeId);
            setSensitiveScenes(ep?.sensitiveScenes || []);
        } else if (m) {
            setSensitiveScenes(m.sensitiveScenes || []);
        }
    };

    const openEditEpisodeModal = (movieId: string, seasonNum: number, ep: Episode) => {
        setEditEpisodeTarget({ movieId, seasonNum, epId: ep.id });
        setEditEpForm({ title: ep.title || '', description: ep.description || '', duration: ep.duration || '' });
    };

    const saveEpisodeEdit = async () => {
        if (!editEpisodeTarget) return;
        const { movieId, seasonNum, epId } = editEpisodeTarget;
        const m = movies.find(x => x.id === movieId);
        if (!m) return;
        const updated = JSON.parse(JSON.stringify(m));
        const season = updated.seasons?.find((s: Season) => s.number === seasonNum);
        const ep = season?.episodes.find((e: Episode) => e.id === epId);
        if (ep) {
            ep.title = editEpForm.title;
            ep.description = editEpForm.description;
            ep.duration = editEpForm.duration;
        }
        try {
            await axios.put(`/api/admin/movies/${movieId}`, updated);
            toast('زانیاری ئەڵقە پاشەکەوت کرا ✓');
            setEditEpisodeTarget(null);
            load(true);
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const handleToggleFeatured = async (movie: Movie) => {
        try {
            const nextState = !movie.isFeatured;
            await axios.put(`/api/admin/movies/${movie.id}`, { isFeatured: nextState });
            setMovies(prev => prev.map(m => m.id === movie.id ? { ...m, isFeatured: nextState } : m));
            toast(nextState ? `زیاد کرا بۆ هیرۆ (Hero Banner) 🌟` : `لە هیرۆ سڕایەوە ❌`);
        } catch {
            toast('کێشەیەک ڕووی دا', 'error');
        }
    };

    const handleApproveMovie = async (movie: Movie) => {
        try {
            const res = await axios.post(`/api/admin/movies/${movie.id}/approve`);
            toast(res.data.message || 'بەرهەمەکە بە سەرکەوتوویی پەسەندکرا و بڵاوکرایەوە ✓');
            load(true);
        } catch (err: any) {
            toast(err.response?.data?.error || 'نەتوانرا پەسەند بکرێت', 'error');
        }
    };

    const handleRejectMovie = async (movie: Movie) => {
        const reason = prompt('تکایە هۆکاری ڕەتکردنەوە بنووسە بۆ ئەوەی ئەدمینەکە چاکی بکات:');
        if (reason === null) return;
        try {
            const res = await axios.post(`/api/admin/movies/${movie.id}/reject`, { reason });
            toast(res.data.message || 'داواکارییەکە ڕەتکرایەوە', 'error');
            load(true);
        } catch (err: any) {
            toast(err.response?.data?.error || 'نەتوانرا ڕەت بکرێتەوە', 'error');
        }
    };

    const doUpload = async (movieId: string, file: File, type: string, extra?: { season?: number; episode?: number; srtType?: string }) => {
        const key = `${movieId}-${type}-${extra?.season || 0}-${extra?.episode || 0}`;
        setUploading(u => ({ ...u, [key]: true }));
        setUploadProgress(p => ({ ...p, [key]: 0 }));
        
        const fd = new FormData();
        const token = localStorage.getItem('kurdish_stream_token') || localStorage.getItem('ks_token');
        const config = {
            timeout: 0,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: (progressEvent: any) => {
                if (progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(p => ({ ...p, [key]: percentCompleted }));
                }
            }
        };

        try {
            if (type === 'video') { fd.append('video', file, file.name); await axios.post(`/api/admin/movies/${movieId}/video`, fd, config); toast('ڤیدیۆکە بارکرا ✓'); }
            else if (type === 'poster') { fd.append('poster', file, file.name); await axios.post(`/api/admin/movies/${movieId}/poster`, fd, config); toast('وێنەی پۆستەر بارکرا ✓'); }
            else if (type === 'srt') { fd.append('srt', file, file.name); await axios.post(`/api/admin/movies/${movieId}/srt/${extra?.srtType}`, fd, config); toast(`SRT ${extra?.srtType === 'original' ? 'ئەسڵی' : 'وەرگێڕدراو'} بارکرا ✓`); }
            else if (type === 'ep-video') { fd.append('video', file, file.name); await axios.post(`/api/admin/movies/${movieId}/seasons/${extra!.season}/episodes/${extra!.episode}/video`, fd, config); toast(`ڤیدیۆی ئالقەی ${extra!.episode} بارکرا ✓`); }
            else if (type === 'ep-srt') { fd.append('srt', file, file.name); await axios.post(`/api/admin/movies/${movieId}/seasons/${extra!.season}/episodes/${extra!.episode}/srt/${extra!.srtType}`, fd, config); toast(`SRT ئالقەی ${extra!.episode} بارکرا ✓`); }
            load(true);
        } catch (err: any) {
            console.error('Upload error:', err);
            const msg = err?.response?.data?.error || err?.message || 'بارکردن سەرکەوتوو نەبوو';
            toast(msg, 'error');
        }
        finally { 
            setUploading(u => ({ ...u, [key]: false }));
            setUploadProgress(p => ({ ...p, [key]: 0 }));
        }
    };

    const doR2Upload = async (movieId: string, file: File, target: 'video' | 'poster', extra?: { season?: number; episodeId?: string; episodeNum?: number }) => {
        const key = `${movieId}-${target}-${extra?.episodeId || 'main'}`;
        setUploading(u => ({ ...u, [key]: true }));
        setUploadProgress(p => ({ ...p, [key]: 0 }));

        const token = localStorage.getItem('kurdish_stream_token') || localStorage.getItem('ks_token');
        const config = {
            timeout: 0,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: (progressEvent: any) => {
                if (progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(p => ({ ...p, [key]: percentCompleted }));
                }
            }
        };

        try {
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('movieId', movieId);
            fd.append('target', target);
            if (extra?.season !== undefined) fd.append('season', String(extra.season));
            if (extra?.episodeId) fd.append('episodeId', extra.episodeId);

            await axios.post('/api/admin/r2/upload', fd, config);
            toast(`فایلەکە بە سەرکەوتوویی بارکرا ☁️`);
            load(true);
        } catch (err: any) {
            console.error("R2 Error:", err);
            const errMsg = err?.response?.data?.error || err.message || "هەڵەیەک لە کاتی ئەپلۆد ڕوویدا";
            toast(`هەڵە: ${errMsg}`, 'error');
        } finally {
            setUploading(u => ({ ...u, [key]: false }));
            setUploadProgress(p => ({ ...p, [key]: 0 }));
        }
    };

    const addBulkEpisodes = async (movieId: string, seasonNum: number, count: number) => {
        try {
            await axios.post(`/api/admin/movies/${movieId}/seasons/${seasonNum}/episodes/bulk`, { count });
            toast(`${count} ئالقە زیاد کران ✓`);
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const addSeason = async (movieId: string) => {
        try { await axios.post(`/api/admin/movies/${movieId}/seasons`); toast(`سیزن زیاد کرا ✓`); load(); }
        catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const addEpisode = async (movieId: string, seasonNum: number) => {
        try { await axios.post(`/api/admin/movies/${movieId}/seasons/${seasonNum}/episodes`); toast(`ئەڵقە زیاد کرا ✓`); load(); }
        catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const deleteSeason = async (movieId: string, seasonNum: number) => {
        if (!window.confirm(`دڵنیایت لە سڕینەوەی سیزنی ${seasonNum} لەگەڵ هەموو ئەڵقەکانی؟`)) return;
        const m = movies.find(x => x.id === movieId);
        if (!m) return;
        const updated = JSON.parse(JSON.stringify(m));
        updated.seasons = (updated.seasons || []).filter((s: Season) => s.number !== seasonNum);
        try {
            await axios.put(`/api/admin/movies/${movieId}`, updated);
            toast(`سیزنی ${seasonNum} سڕایەوە ✓`);
            load();
        } catch {
            toast('کێشەیەک ڕووی دا لە سڕینەوەی سیزن', 'error');
        }
    };

    const deleteEpisode = async (movieId: string, seasonNum: number, episodeId: string) => {
        if (!window.confirm('دڵنیایت لە سڕینەوەی ئەم ئەڵقەیە؟')) return;
        const m = movies.find(x => x.id === movieId);
        if (!m) return;
        const updated = JSON.parse(JSON.stringify(m));
        const s = updated.seasons?.find((x: Season) => x.number === seasonNum);
        if (s) {
            s.episodes = (s.episodes || []).filter((e: Episode) => e.id !== episodeId);
            try {
                await axios.put(`/api/admin/movies/${movieId}`, updated);
                toast('ئەڵقە سڕایەوە ✓');
                load();
            } catch {
                toast('کێشەیەک ڕووی دا لە سڕینەوەی ئەڵقە', 'error');
            }
        }
    };

    const openSrtEditorModal = (
        movieId: string,
        movieTitle: string,
        seasonNum?: number,
        episodeNum?: number,
        episodeTitle?: string,
        videoUrl?: string
    ) => {
        setSrtEditorData({
            open: true,
            movieId,
            movieTitle,
            seasonNum,
            episodeNum,
            episodeTitle,
            videoUrl
        });
    };

    const saveMovieVideoUrl = async (movieId: string, url: string) => {
        const m = movies.find(x => x.id === movieId);
        if (!m) return;
        const updated = JSON.parse(JSON.stringify(m));
        updated.videoUrl = url;
        try {
            await axios.put(`/api/admin/movies/${movieId}`, updated);
            toast('لینکی ڤیدیۆ پاشەکەوت کرا ✓');
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const saveEpVideoUrl = async (movieId: string, seasonNum: number, epId: string, url: string) => {
        const m = movies.find(x => x.id === movieId);
        if (!m) return;
        const updated = JSON.parse(JSON.stringify(m));
        const season = updated.seasons?.find((s: Season) => s.number === seasonNum);
        const ep = season?.episodes.find((e: Episode) => e.id === epId);
        if (ep) { ep.videoUrl = url; }
        try {
            await axios.put(`/api/admin/movies/${movieId}`, updated);
            toast('لینکی ڤیدیۆ پاشەکەوت کرا ✓');
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const fetchImdbRating = async (title: string, isEditForm: boolean = false) => {
        if (!title) {
            toast('تکایە ناو، کۆد، یان لینکی IMDb فیلمەکە داخڵ بکە', 'error');
            return;
        }
        setFetchingImdbRating(true);
        try {
            const response = await axios.get(`/api/omdb-rating?title=${encodeURIComponent(title)}`);
            const { 
                title: resolvedTitle, 
                imdbRating, 
                plotEn, 
                plotKu, 
                plotAr, 
                genre, 
                year, 
                endYear, 
                runtime, 
                poster, 
                type, 
                seasons, 
                language 
            } = response.data;
            
            // Translate genres
            let kurdishGenres = '';
            if (genre) {
                const englishGenres = genre.split(',').map((g: string) => g.trim());
                const translated = englishGenres.map((g: string) => genreMap[g] || g);
                kurdishGenres = translated.join('، ');
            }

            if (isEditForm) {
                setEditMovie(m => m ? { 
                    ...m, 
                    title: resolvedTitle || m.title,
                    imdbRating: imdbRating !== null ? imdbRating.toString() : '',
                    description: m.description || plotKu || '',
                    descriptionKu: m.descriptionKu || plotKu || '',
                    descriptionEn: m.descriptionEn || plotEn || '',
                    descriptionAr: m.descriptionAr || plotAr || '',
                    language: m.language || language || '',
                    genre: m.genre || kurdishGenres || '',
                    year: m.year || year || m.year,
                    endYear: endYear !== undefined ? endYear : m.endYear,
                    duration: m.duration || runtime || '',
                    type: (type as any) || m.type,
                    posterUrl: m.posterUrl || poster || '',
                    seasons: seasons && seasons.length > 0 && (!m.seasons || m.seasons.length === 0) ? seasons : m.seasons
                } : null);
            } else {
                setForm(f => ({ 
                    ...f, 
                    title: resolvedTitle || f.title,
                    imdbRating: imdbRating !== null ? imdbRating.toString() : '',
                    description: f.description || plotKu || '',
                    descriptionKu: f.descriptionKu || plotKu || '',
                    descriptionEn: f.descriptionEn || plotEn || '',
                    descriptionAr: f.descriptionAr || plotAr || '',
                    language: f.language || language || '',
                    genre: f.genre || kurdishGenres || '',
                    year: year ? year.toString() : f.year,
                    endYear: endYear ? endYear.toString() : '',
                    duration: f.duration || runtime || '',
                    type: (type as any) || f.type,
                    posterUrl: f.posterUrl || poster || '',
                    seasons: seasons && seasons.length > 0 ? seasons : f.seasons
                }));
            }
            toast(`زانیارییەکانی ${resolvedTitle || title} بە سەرکەوتوویی هێنران ✓`);
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || 'کێشەیەک لە هێنانی زانیارییەکان ڕوویدا';
            toast(errorMessage, 'error');
        } finally {
            setFetchingImdbRating(false);
        }
    };

    const filteredMovies = movies.filter(m => {
        const matchesType = filterType === 'all' || m.type === filterType;
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || (
            m.title.toLowerCase().includes(searchLower) || 
            (m.genre && m.genre.toLowerCase().includes(searchLower)) ||
            (m.year && m.year.toString().includes(searchLower))
        );
        const matchesGenres = selectedAdminGenres.length === 0 || selectedAdminGenres.some(g => m.genre?.includes(g));
        const matchesLevel = !selectedAdminLevel || m.languageMetrics?.cefrLevel === selectedAdminLevel || m.level === selectedAdminLevel;

        return matchesType && matchesSearch && matchesGenres && matchesLevel;
    });

    return (
        <div className="admin-page">
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`}>
                        {t.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                        {t.msg}
                    </div>
                ))}
            </div>

            <div className="admin-header">
                <div>
                    <h1 className="admin-title">
                        {isSuperAdmin 
                            ? (lang === 'en' ? 'Super Admin Panel' : 'پانێلی سەرپەرشتیاری گشتی (سەرۆک)')
                            : (lang === 'en' ? 'Admin & Translation Panel' : 'پانێلی ئەدمین و وەرگێڕان')}
                    </h1>
                    <p className="admin-sub">
                        {lang === 'en' ? `${movies.length} items registered` : `${movies.length} بەرهەم تۆمارکراوە`}
                    </p>
                </div>
                {activeTab === 'movies' && canAddMovies && (
                    <button className="btn-add" onClick={() => setShowForm(true)}>
                        <Plus size={18} /> {lang === 'en' ? 'New Item' : 'بەرهەمی نوێ'}
                    </button>
                )}
            </div>

            <div className="admin-tabs-scroll-container">
                <div 
                    ref={adminTabsRef}
                    className="admin-tabs"
                    onWheel={(e) => {
                        if (adminTabsRef.current && e.deltaY !== 0) {
                            adminTabsRef.current.scrollLeft += (e.deltaY > 0 ? 120 : -120);
                        }
                    }}
                >
                    {(canAddMovies || canTranslate) && (
                        <button className={`admin-tab-btn ${activeTab === 'movies' ? 'active' : ''}`} onClick={() => setActiveTab('movies')}>
                            <Film size={18} /> {lang === 'en' ? 'Movies' : 'بەرهەمەکان'}
                        </button>
                    )}
                    {(isSuperAdmin || canPublishDirectly) && (
                        <button className={`admin-tab-btn ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>
                            <ShieldCheck size={18} /> {lang === 'en' ? 'Audit & Approvals' : 'چاودێری و پەسەندکردن'} {movies.filter(m => m.status === 'pending_approval').length > 0 && (
                                <span className="pending-badge-counter">{movies.filter(m => m.status === 'pending_approval').length}</span>
                            )}
                        </button>
                    )}
                    {isSuperAdmin && (
                        <button className={`admin-tab-btn ${activeTab === 'hero' ? 'active' : ''}`} onClick={() => setActiveTab('hero')}>
                            <Sparkles size={18} /> {lang === 'en' ? 'Hero Banners' : 'بەڕێوەبردنی هیرۆ'} ({movies.filter(m => m.isFeatured).length})
                        </button>
                    )}
                    {(isSuperAdmin || canManageCredits) && (
                        <button className={`admin-tab-btn ${activeTab === 'credits' ? 'active' : ''}`} onClick={() => setActiveTab('credits')}>
                            <CreditCard size={18} /> {lang === 'en' ? 'Credits & Receipts' : 'کرێدیت و وەسڵەکان'} {pendingCreditsCount > 0 && (
                                <span className="pending-badge-counter">{pendingCreditsCount}</span>
                            )}
                        </button>
                    )}
                    {isSuperAdmin && (
                        <button className={`admin-tab-btn ${activeTab === 'plans' ? 'active' : ''}`} onClick={() => setActiveTab('plans')}>
                            <Layers size={18} /> {lang === 'en' ? 'Credit Plans' : 'پلانەکانی کڕین'}
                        </button>
                    )}
                    {isSuperAdmin && (
                        <button className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                            <Users size={18} /> {lang === 'en' ? 'Users & Admins' : 'بەکارهێنەران و ئەدمینەکان'}
                        </button>
                    )}
                    {isSuperAdmin && (
                        <button className={`admin-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                            <BarChart2 size={18} /> {lang === 'en' ? 'Analytics' : 'ئامارەکان'}
                        </button>
                    )}
                    {isSuperAdmin && (
                        <button className={`admin-tab-btn ${activeTab === 'backups' ? 'active' : ''}`} onClick={() => setActiveTab('backups')}>
                            <HardDrive size={18} /> {lang === 'en' ? 'Backups' : 'باکئەپ و پاراستن'}
                        </button>
                    )}
                    {isSuperAdmin && (
                        <button className={`admin-tab-btn ${activeTab === 'notifications_manager' ? 'active' : ''}`} onClick={() => setActiveTab('notifications_manager')}>
                            <Bell size={18} /> {lang === 'en' ? 'Push & Notifications' : 'ڕێکخستنی نۆتفیکەیشن'}
                        </button>
                    )}
                    {isSuperAdmin && (
                        <button className={`admin-tab-btn ${activeTab === 'activities' ? 'active' : ''}`} onClick={() => setActiveTab('activities')}>
                            <Shield size={18} /> {lang === 'en' ? 'Security & Logs' : 'ئاسایش و لۆگەکان'}
                        </button>
                    )}
                    <button className={`admin-tab-btn ${activeTab === 'glossary' ? 'active' : ''}`} onClick={() => setActiveTab('glossary')}>
                        <BookOpen size={18} /> {lang === 'en' ? 'Glossary' : 'فەرهەنگۆک'}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay for Admin Filters */}
            {(showAdminGenreMenu || showAdminLevelMenu || showAdminTypeMenu) && (
                <div 
                    className="menu-overlay-mobile" 
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 90 }}
                    onClick={() => {
                        setShowAdminGenreMenu(false);
                        setShowAdminLevelMenu(false);
                        setShowAdminTypeMenu(false);
                    }}
                />
            )}

            {activeTab === 'movies' && (
                <>
                    <div className="admin-search-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '24px', position: 'relative', zIndex: 95 }}>
                        <div className="admin-search-input-wrap" style={{ flex: 1, minWidth: '240px' }}>
                            <Search size={18} className="admin-search-icon" />
                            <input 
                                type="text" 
                                placeholder="گەڕان بەپێی ناو، چەشن یان ساڵ..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="admin-search-input"
                            />
                            {searchTerm && (
                                <button className="admin-search-clear" onClick={() => setSearchTerm('')}>
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {/* Modern Filter Buttons Bar */}
                        <div className="filters-right" ref={adminFiltersRef} style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', alignItems: 'center', position: 'relative' }}>
                            {/* Genre Filter */}
                            <div className={`filter-dropdown ${showAdminGenreMenu ? 'active' : ''}`} style={{ position: 'relative' }}>
                                <button className={`admin-pill-filter-btn ${selectedAdminGenres.length > 0 ? 'active' : ''}`} title="چەشنەکان" onClick={() => { setShowAdminGenreMenu(!showAdminGenreMenu); setShowAdminLevelMenu(false); setShowAdminTypeMenu(false); }}>
                                    <Filter size={16} /> 
                                    <span className="admin-pill-filter-label">چەشنەکان</span>
                                    {selectedAdminGenres.length > 0 && <span className="filter-badge">{selectedAdminGenres.length}</span>} 
                                    <ChevronDown size={14} className={`chevron ${showAdminGenreMenu ? 'open' : ''}`} />
                                </button>
                                {showAdminGenreMenu && (
                                    <div className="filter-menu genre-menu modern-menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100, width: '340px', background: '#12121e', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '16px', padding: '16px', boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)' }}>
                                        <div className="menu-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>
                                            <span>هەڵبژاردنی چەشن ({selectedAdminGenres.length})</span>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {selectedAdminGenres.length > 0 && <button className="clear-btn-small" onClick={() => setSelectedAdminGenres([])}>سڕینەوە</button>}
                                                <button onClick={() => setShowAdminGenreMenu(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="genre-grid-modern" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
                                            {GENRES_LIST.map(g => {
                                                const isSelected = selectedAdminGenres.includes(g.id) || selectedAdminGenres.includes(g.ku) || selectedAdminGenres.includes(g.en);
                                                return (
                                                    <label key={g.id} className={`filter-option modern-option ${isSelected ? 'selected' : ''}`}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSelected} 
                                                            onChange={() => setSelectedAdminGenres(prev => 
                                                                isSelected ? prev.filter(x => x !== g.id && x !== g.ku && x !== g.en) : [...prev, g.ku]
                                                            )} 
                                                        />
                                                        <span>{lang === 'en' ? g.en : g.ku}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        <button 
                                            onClick={() => setShowAdminGenreMenu(false)}
                                            style={{
                                                marginTop: '12px',
                                                width: '100%',
                                                padding: '8px',
                                                background: '#22d3ee',
                                                color: '#000',
                                                border: 'none',
                                                borderRadius: '10px',
                                                fontWeight: 'bold',
                                                fontSize: '13px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            جێبەجێکردن / داخستن
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Type Filter */}
                            <div className={`filter-dropdown ${showAdminTypeMenu ? 'active' : ''}`} style={{ position: 'relative' }}>
                                <button className={`admin-pill-filter-btn ${filterType !== 'all' ? 'active' : ''}`} title="جۆری بەرهەم" onClick={() => { setShowAdminTypeMenu(!showAdminTypeMenu); setShowAdminGenreMenu(false); setShowAdminLevelMenu(false); }}>
                                    <Film size={16} /> 
                                    <span className="admin-pill-filter-label">{filterType === 'movie' ? 'فیلم' : filterType === 'series' ? 'زنجیرە' : filterType === 'animation' ? 'ئەنیمێشن' : 'جۆری بەرهەم'}</span>
                                    <ChevronDown size={14} className={`chevron ${showAdminTypeMenu ? 'open' : ''}`} />
                                </button>
                                {showAdminTypeMenu && (
                                    <div className="filter-menu year-menu modern-menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100, width: '200px', background: '#12121e', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '16px', padding: '14px', boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)' }}>
                                        <div className="year-grid-modern" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {[
                                                { id: 'all', label: 'هەموو جۆرەکان' },
                                                { id: 'movie', label: 'فیلم' },
                                                { id: 'series', label: 'زنجیرە' },
                                                { id: 'animation', label: 'ئەنیمێشن' }
                                            ].map(t => (
                                                <button
                                                    key={t.id}
                                                    className={`year-btn-modern ${filterType === t.id ? 'active' : ''}`}
                                                    onClick={() => { setFilterType(t.id as any); setShowAdminTypeMenu(false); }}
                                                    style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Level Filter */}
                            <div className={`filter-dropdown ${showAdminLevelMenu ? 'active' : ''}`} style={{ position: 'relative' }}>
                                <button className={`admin-pill-filter-btn ${selectedAdminLevel ? 'active' : ''}`} title="ئاستی زمان" onClick={() => { setShowAdminLevelMenu(!showAdminLevelMenu); setShowAdminGenreMenu(false); setShowAdminTypeMenu(false); }}>
                                    <Layers size={16} /> 
                                    <span className="admin-pill-filter-label">{selectedAdminLevel || 'ئاستی زمان'}</span>
                                    <ChevronDown size={14} className={`chevron ${showAdminLevelMenu ? 'open' : ''}`} />
                                </button>
                                {showAdminLevelMenu && (
                                    <div className="filter-menu year-menu modern-menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100, width: '220px', background: '#12121e', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '16px', padding: '14px', boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)' }}>
                                        <div className="menu-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>
                                            <span>ئاستی زمان</span>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {selectedAdminLevel && <button className="clear-btn-small" onClick={() => setSelectedAdminLevel('')}>سڕینەوە</button>}
                                                <button onClick={() => setShowAdminLevelMenu(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="year-grid-modern" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                                            <button className={`year-btn-modern ${selectedAdminLevel === '' ? 'active' : ''}`} onClick={() => { setSelectedAdminLevel(''); setShowAdminLevelMenu(false); }}>
                                                هەموو
                                            </button>
                                            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => (
                                                <button key={l} className={`year-btn-modern ${selectedAdminLevel === l ? 'active' : ''}`} onClick={() => { setSelectedAdminLevel(l); setShowAdminLevelMenu(false); }}>
                                                    {l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Clear All Filters Button */}
                            {(selectedAdminGenres.length > 0 || filterType !== 'all' || selectedAdminLevel || searchTerm) && (
                                <button 
                                    onClick={() => {
                                        setSelectedAdminGenres([]);
                                        setFilterType('all');
                                        setSelectedAdminLevel('');
                                        setSearchTerm('');
                                    }}
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        color: '#fca5a5',
                                        padding: '8px 14px',
                                        borderRadius: '999px',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <X size={14} /> پاککردنەوە
                                </button>
                            )}
                        </div>
                    </div>

                    <SrtTranslator />

            {loading ? (
                <div className="admin-loading"><Loader2 size={32} className="spinning" /></div>
            ) : filteredMovies.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>هیچ بەرهەمێک نەدۆزرایەوە...</div>
            ) : (
                <div className="movies-admin-list">
                    {filteredMovies.map(movie => (
                        <div key={movie.id} className="admin-card">
                            <div className="ac-top">
                                <div className="ac-poster" onClick={() => refs.poster.current[movie.id]?.click()}>
                                    {(movie.posterCloudUrl || movie.posterUrl) ? <img src={movie.posterCloudUrl || movie.posterUrl} className="ac-poster-img" alt="" /> : <div className="ac-poster-placeholder"><Upload size={22} /></div>}
                                    <input type="file" className="hidden-input" ref={el => { refs.poster.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'poster')} />
                                </div>
                                <div className="ac-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <h3 className="ac-title">{movie.title}</h3>
                                        {movie.status === 'pending_approval' ? (
                                            <span className="movie-status-pill pending">⏳ چاوەڕوانی پەسەندکردن</span>
                                        ) : movie.status === 'draft' ? (
                                            <span className="movie-status-pill draft">📝 ڕەشنووس</span>
                                        ) : (
                                            <span className="movie-status-pill published">✅ بڵاوکراوەتەوە</span>
                                        )}
                                        {movie.isFeatured && (
                                            <span style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.45)', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Star size={11} fill="#fbbf24" color="#fbbf24" /> هیرۆ (Hero)
                                            </span>
                                        )}
                                    </div>
                                    <div className="ac-meta">
                                        <span>{movie.year}</span>
                                        <span className={`type-badge ${movie.type}`}>{movie.type === ('movie' as any) ? 'فیلم' : movie.type === ('animation' as any) ? 'ئەنیمێشن' : 'زنجیرە'}</span>
                                        {(() => {
                                            const lvl = getCefrDisplayLevel(movie.level, movie.languageMetrics?.cefrLevel);
                                            if (!lvl) return null;
                                            const colorInfo = getCefrColor(lvl);
                                            return (
                                                <span style={{ fontSize: '11px', background: colorInfo.bg, color: colorInfo.text, padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                                                    {lvl}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <p className="ac-desc">{movie.description}</p>
                                </div>
                                <div className="ac-actions">
                                    <button 
                                        className={`ac-btn ${movie.isFeatured ? 'featured-active-btn' : ''}`} 
                                        title={movie.isFeatured ? "سڕینەوە لە هیرۆ (Hero Banner)" : "زیادکردن بۆ هیرۆ (Hero Banner)"} 
                                        onClick={() => handleToggleFeatured(movie)}
                                    >
                                        <Star size={16} fill={movie.isFeatured ? "#fbbf24" : "none"} color={movie.isFeatured ? "#fbbf24" : "currentColor"} />
                                    </button>
                                    <button className="ac-btn" title="دەستکاریکردن" onClick={() => setEditMovie(movie)}><Edit3 size={16} /></button>
                                    <button className="ac-btn" title="سڕینەوە" onClick={() => handleDelete(movie)}><Trash2 size={16} /></button>
                                    {movie.type === ('series' as any) ? (
                                        <button 
                                            className="ac-btn" 
                                            title="بەڕێوەبردنی ئەڵقەکان و سەبتایتڵ" 
                                            onClick={() => setEpisodesModalMovie(movie)}
                                        >
                                            <ListVideo size={16} />
                                        </button>
                                    ) : (
                                        <button 
                                            className={`ac-btn ${expandedMovies[movie.id] ? 'featured-active-btn' : ''}`} 
                                            title="بەڕێوەبردن و ئەپڵۆدی ڤیدیۆ و سەبتایتڵ" 
                                            onClick={() => toggleMovieExpand(movie.id)}
                                        >
                                            <Film size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {movie.type !== ('series' as any) && expandedMovies[movie.id] && (
                                <div className="ac-uploads-container">
                                    {/* Video Sources Row */}
                                    <div className="ac-uploads-section">
                                        <div className="ac-section-badge" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>سەرچاوەی ڤیدیۆ</span>
                                            {(movie.videoFile || movie.videoUrl) && (
                                                <button
                                                    type="button"
                                                    className="ac-sub-chip del"
                                                    onClick={() => handleDeleteMovieVideo(movie)}
                                                    title="سڕینەوەی ڤیدیۆی ئەم فیلمە لە سێرڤەر"
                                                    style={{ marginRight: 'auto' }}
                                                >
                                                    <Trash2 size={11} /> سڕینەوە
                                                </button>
                                            )}
                                        </div>
                                        <div className="ac-video-grid">
                                            <div className={`ac-upload-card ${movie.videoFile ? 'done' : ''}`} onClick={() => refs.video.current[movie.id]?.click()}>
                                                <input type="file" className="hidden-input" ref={el => { refs.video.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'video')} />
                                                <div className="ac-upload-icon-wrap">
                                                    {uploading[`${movie.id}-video-0-0`] ? 
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                                                            <Loader2 className="spinning" />
                                                            <span style={{ fontSize: '12px' }}>{uploadProgress[`${movie.id}-video-0-0`] || 0}%</span>
                                                        </div> 
                                                        : <Video size={20} />}
                                                </div>
                                                <div className="ac-upload-label">Server</div>
                                            </div>

                                            <div className={`ac-upload-card cloud-upload ${movie.videoUrl && movie.videoUrl.includes('r2') ? 'done' : ''}`} onClick={() => refs.r2Video.current[movie.id]?.click()}>
                                                <input type="file" className="hidden-input" ref={el => { refs.r2Video.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doR2Upload(movie.id, e.target.files[0], 'video')} />
                                                <div className="ac-upload-icon-wrap">
                                                    {uploading[`${movie.id}-video-main`] ? 
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                                                            <Loader2 className="spinning" />
                                                            <span style={{ fontSize: '12px' }}>{uploadProgress[`${movie.id}-video-main`] || 0}%</span>
                                                        </div>
                                                        : <Upload size={20} />}
                                                </div>
                                                <div className="ac-upload-label">Cloud R2</div>
                                            </div>

                                            <div className={`ac-upload-card ${movie.videoUrl ? 'done' : ''}`} onClick={() => { const u = window.prompt('URL:', movie.videoUrl || ''); if(u) saveMovieVideoUrl(movie.id, u); }}>
                                                <div className="ac-upload-icon-wrap">
                                                    <LinkIcon size={20} />
                                                </div>
                                                <div className="ac-upload-label">Link 🔗</div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Subtitle Sources Row */}
                                    <div className="ac-uploads-section">
                                        <div className="ac-section-badge">سەبتایتڵ و وەرگێڕان</div>
                                        <div className="ac-srt-grid">
                                            {/* Original SRT Card */}
                                            <div className="ac-srt-block-wrap">
                                                <div className={`ac-upload-card ${movie.originalSrt ? 'done' : ''}`} onClick={() => refs.origSrt.current[movie.id]?.click()}>
                                                    <input type="file" className="hidden-input" ref={el => { refs.origSrt.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && handleDirectMovieSrtUpload(movie, e.target.files[0], 'original')} />
                                                    <div className="ac-upload-icon-wrap">
                                                        {uploading[`${movie.id}-srt-0-0`] ? <Loader2 className="spinning" /> : <FileText size={20} />}
                                                    </div>
                                                    <div className="ac-upload-label">SRT ئەسڵی</div>
                                                </div>
                                                <div className="ac-srt-sub-row">
                                                    {movie.originalSrt && (
                                                        <button
                                                            className="ac-sub-chip dl"
                                                            onClick={(e) => { e.stopPropagation(); handleDownloadMovieOriginalSrt(movie); }}
                                                            title="داگرتنی فایلی سەبتایتڵی ئەسڵی (.srt)"
                                                        >
                                                            <Download size={11} /> داگرتن
                                                        </button>
                                                    )}
                                                    <button
                                                        className="ac-sub-chip edit"
                                                        onClick={(e) => { e.stopPropagation(); openSrtEditorModal(movie.id, movie.title, undefined, undefined, undefined, movie.videoUrl || (movie.videoFile ? `/uploads/movies/${movie.id}/${movie.videoFile}` : '')); }}
                                                        title="ئیدیتکردنی سەبتایتڵ"
                                                    >
                                                        <Edit3 size={11} /> چاککردن
                                                    </button>
                                                    {movie.originalSrt && (
                                                        <button
                                                            className="ac-sub-chip del"
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteMovieSrt(movie, 'original'); }}
                                                            title="سڕینەوەی سەبتایتڵی ئەسڵی"
                                                        >
                                                            <Trash2 size={11} /> سڕینەوە
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {/* Kurdish SRT Card */}
                                            <div className="ac-srt-block-wrap">
                                                <div className={`ac-upload-card ${movie.translatedSrt ? 'done' : ''}`} onClick={() => refs.transSrt.current[movie.id]?.click()}>
                                                    <input type="file" className="hidden-input" ref={el => { refs.transSrt.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && handleDirectMovieSrtUpload(movie, e.target.files[0], 'translated')} />
                                                    <div className="ac-upload-icon-wrap">
                                                        {uploading[`${movie.id}-srt-0-0`] ? <Loader2 className="spinning" /> : <Languages size={20} />}
                                                    </div>
                                                    <div className="ac-upload-label">SRT کوردی</div>
                                                </div>
                                                <div className="ac-srt-sub-row">
                                                    {(() => {
                                                        const p = movieTransProgress[movie.id];
                                                        const isRunning = p?.status === 'running';
                                                        const isPaused = p?.status === 'paused';

                                                        return (
                                                            <button
                                                                className={`ac-sub-chip ai ${isRunning ? 'running' : ''} ${isPaused ? 'paused' : ''}`}
                                                                onClick={(e) => { e.stopPropagation(); handleAiTranslateMovie(movie); }}
                                                                title={isRunning ? "کلیک بکە بۆ ڕاگرتنی کاتی (Pause)" : isPaused ? "کلیک بکە بۆ دەستپێکردنەوە لەم شوێنەی وەستاوە (Resume)" : "وەرگێڕان و دروستکردنی ئامارەکانی زمانی ئەم فیلمە بە AI"}
                                                            >
                                                                {isRunning ? (
                                                                    <>
                                                                        <Pause size={11} />
                                                                        <span>ڕاگرتن ({p.percent}%)</span>
                                                                    </>
                                                                ) : isPaused ? (
                                                                    <>
                                                                        <Play size={11} fill="#fbbf24" color="#fbbf24" />
                                                                        <span>دەستپێکردنەوە ({p.percent}%)</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Sparkles size={11} />
                                                                        <span>وەرگێڕان AI</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        );
                                                    })()}
                                                    {movie.translatedSrt && (
                                                        <button
                                                            className="ac-sub-chip dl"
                                                            onClick={(e) => { e.stopPropagation(); handleDownloadMovieKurdishSrt(movie); }}
                                                            title="داگرتنی فایلی سەبتایتڵی کوردی (.srt)"
                                                        >
                                                            <Download size={11} /> داگرتن
                                                        </button>
                                                    )}
                                                    <button
                                                        className="ac-sub-chip edit"
                                                        onClick={(e) => { e.stopPropagation(); openSrtEditorModal(movie.id, movie.title, undefined, undefined, undefined, movie.videoUrl || (movie.videoFile ? `/uploads/movies/${movie.id}/${movie.videoFile}` : '')); }}
                                                        title="ئیدیتکردنی سەبتایتڵ"
                                                    >
                                                        <Edit3 size={11} /> چاککردن
                                                    </button>
                                                    {movie.translatedSrt && (
                                                        <button
                                                            className="ac-sub-chip del"
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteMovieSrt(movie, 'translated'); }}
                                                            title="سڕینەوەی سەبتایتڵی کوردی"
                                                        >
                                                            <Trash2 size={11} /> سڕینەوە
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Sensitive / Inappropriate Scenes Row */}
                                    <div className="ac-uploads-section">
                                        <div className="ac-section-badge" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fca5a5' }}>
                                                <Shield size={14} color="#f87171" />
                                                {lang === 'en' ? 'Inappropriate / Mature Scenes (Family Mode)' : 'دیمەنی نەشیاو (مۆدی خێزانی)'}
                                            </span>
                                            {movie.sensitiveScenes && movie.sensitiveScenes.length > 0 ? (
                                                <span style={{ fontSize: '11px', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                                    {movie.sensitiveScenes.length} {lang === 'en' ? 'scenes marked' : 'دیمەن دیاریکراوە'}
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                                    {lang === 'en' ? 'None' : 'دیارینەکراوە'}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="ac-sensitive-card-btn"
                                                onClick={() => openSensitiveModal(movie.id)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    padding: '9px 16px',
                                                    background: (movie.sensitiveScenes && movie.sensitiveScenes.length > 0) ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                                                    border: (movie.sensitiveScenes && movie.sensitiveScenes.length > 0) ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: (movie.sensitiveScenes && movie.sensitiveScenes.length > 0) ? '#fecaca' : '#cbd5e1',
                                                    borderRadius: '10px',
                                                    fontSize: '12.5px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <Shield size={16} color="#f87171" />
                                                <span>{lang === 'en' ? 'Manage Sensitive Scenes' : 'ڕێکخستن و بڕینی دیمەنی نەشیاو'}</span>
                                                {movie.sensitiveScenes && movie.sensitiveScenes.length > 0 && (
                                                    <span style={{ background: '#ef4444', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                                                        {movie.sensitiveScenes.length}
                                                    </span>
                                                )}
                                            </button>

                                            {movie.sensitiveScenes && movie.sensitiveScenes.length > 0 && (
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {movie.sensitiveScenes.slice(0, 4).map((s, idx) => {
                                                        const startMin = Math.floor(s.start / 60);
                                                        const startSec = Math.floor(s.start % 60);
                                                        const endMin = Math.floor(s.end / 60);
                                                        const endSec = Math.floor(s.end % 60);
                                                        return (
                                                            <span 
                                                                key={idx} 
                                                                style={{ 
                                                                    background: 'rgba(239, 68, 68, 0.08)', 
                                                                    color: '#fca5a5', 
                                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                    padding: '4px 10px', 
                                                                    borderRadius: '8px', 
                                                                    fontSize: '11.5px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    direction: 'ltr'
                                                                }}
                                                            >
                                                                ⏱ {startMin}:{String(startSec).padStart(2, '0')} - {endMin}:{String(endSec).padStart(2, '0')}
                                                            </span>
                                                        );
                                                    })}
                                                    {movie.sensitiveScenes.length > 4 && (
                                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>+{movie.sensitiveScenes.length - 4} زیاتر</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {movie.type === ('series' as any) && expandedSeries[movie.id] && (
                                <div className="series-manager">
                                    <div className="series-manager-header">
                                        <h4>سیزن و ئالقەکان</h4>
                                        <button className="btn-add-season" onClick={() => addSeason(movie.id)}>سیزنی نوێ</button>
                                    </div>
                                    {movie.seasons?.map(season => (
                                        <SeasonPanel
                                            key={season.id}
                                            season={season}
                                            movieId={movie.id}
                                            onAddEpisode={() => addEpisode(movie.id, season.number)}
                                            onBulkAdd={(count: number) => addBulkEpisodes(movie.id, season.number, count)}
                                            onEpVideo={(n: number, f: File) => doUpload(movie.id, f, 'ep-video', { season: season.number, episode: n })}
                                            onEpSrt={(n: number, f: File, t: string) => doUpload(movie.id, f, 'ep-srt', { season: season.number, episode: n, srtType: t })}
                                            onSensitive={(epId: string) => openSensitiveModal(movie.id, season.number, epId)}
                                            onEpVideoUrl={(epId: string, url: string) => saveEpVideoUrl(movie.id, season.number, epId, url)}
                                            onR2Upload={(n: number, f: File, id: string) => doR2Upload(movie.id, f, 'video', { season: season.number, episodeId: id })}
                                            uploading={uploading}
                                            uploadProgress={uploadProgress}
                                            epVideoRef={refs.epVideo}
                                            epOrigSrtRef={refs.epOrigSrt}
                                            epTransSrtRef={refs.epTransSrt}
                                            r2EpVideoRef={refs.r2EpVideo}
                                            onEditEpisode={(ep: Episode) => openEditEpisodeModal(movie.id, season.number, ep)}
                                            onOpenSrtEditor={(ep: Episode) => openSrtEditorModal(movie.id, movie.title, season.number, ep.number, ep.title, ep.videoUrl || (ep.videoFile ? `/uploads/movies/${movie.id}/seasons/s${season.number}/e${ep.number}/${ep.videoFile}` : ''))}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            </>)}

            {activeTab === 'hero' && (
                <div className="admin-hero-manager">
                    {/* Info Banner */}
                    <div className="hero-info-banner">
                        <div className="hero-info-text">
                            <h2>
                                <Sparkles size={20} color="#8b5cf6" />
                                {lang === 'en' ? 'Manage Hero Banner Carousel' : 'بەڕێوەبردنی پۆستەرەکانی هیرۆ (Hero Banner Carousel)'}
                            </h2>
                            <p>
                                {lang === 'en' 
                                    ? 'These banners are displayed dynamically at the top carousel of your main homepage.' 
                                    : 'ئەم پۆستەرانە ڕاستەوخۆ لە بەشی سەرەوەی لاپەڕەی سەرەکی پرۆژەکەت وەک کاروسێل نیشان دەدرێن.'}
                            </p>
                        </div>
                        <div className="hero-count-badge">
                            <span>{movies.filter(m => m.isFeatured).length} {lang === 'en' ? 'Active Banners' : 'پۆستەری چالاک'}</span>
                        </div>
                    </div>

                    {/* Search & Add Section */}
                    <div className="hero-search-card">
                        <h3>
                            <Search size={16} color="#22d3ee" /> 
                            {lang === 'en' ? 'Quick Search & Add to Hero' : 'گەڕان و زیادکردنی خێرا بۆ هیرۆ'}
                        </h3>
                        <div className="admin-search-input-wrap" style={{ width: '100%' }}>
                            <Search size={18} className="admin-search-icon" />
                            <input 
                                type="text" 
                                placeholder={lang === 'en' ? "Type movie or series title to quickly add..." : "ناوی فیلم یان زنجیرە بنووسە بۆ زیادکردنی خێرا..."} 
                                value={heroSearchTerm}
                                onChange={(e) => setHeroSearchTerm(e.target.value)}
                                className="admin-search-input"
                            />
                            {heroSearchTerm && (
                                <button className="admin-search-clear" onClick={() => setHeroSearchTerm('')}>
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {/* Search Results Dropdown/Grid */}
                        {heroSearchTerm.trim() !== '' && (
                            <div className="hero-search-results-grid">
                                {movies.filter(m => m.title.toLowerCase().includes(heroSearchTerm.toLowerCase())).length === 0 ? (
                                    <div className="hero-search-empty">
                                        {lang === 'en' ? 'No items found...' : 'هیچ بەرهەمێک نەدۆزرایەوە...'}
                                    </div>
                                ) : (
                                    movies.filter(m => m.title.toLowerCase().includes(heroSearchTerm.toLowerCase())).map(m => (
                                        <div key={m.id} className="hero-search-item">
                                            <div className="hero-search-poster">
                                                {(m.posterCloudUrl || m.posterUrl) ? <img src={m.posterCloudUrl || m.posterUrl} alt="" /> : null}
                                            </div>
                                            <div className="hero-search-info">
                                                <div className="hero-search-title">{m.title}</div>
                                                <div className="hero-search-sub">
                                                    {m.year} | {m.type === 'movie' ? (lang === 'en' ? 'Movie' : 'فیلم') : m.type === 'animation' ? (lang === 'en' ? 'Animation' : 'ئەنیمێشن') : (lang === 'en' ? 'Series' : 'زنجیرە')}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleToggleFeatured(m)}
                                                className={`btn-hero-toggle ${m.isFeatured ? 'featured' : ''}`}
                                            >
                                                {m.isFeatured ? (lang === 'en' ? 'Remove ❌' : 'سڕینەوە ❌') : (lang === 'en' ? '+ Add' : '+ زیادکردن')}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Active Hero List */}
                    <div className="hero-active-section">
                        <h3 className="hero-active-title">
                            <Film size={18} color="#8b5cf6" /> 
                            {lang === 'en' ? `Active Hero Banners (${movies.filter(m => m.isFeatured).length})` : `پۆستەرە چالاکەکانی هیرۆ (${movies.filter(m => m.isFeatured).length})`}
                        </h3>

                        {movies.filter(m => m.isFeatured).length === 0 ? (
                            <div className="hero-empty-box">
                                <Sparkles size={36} color="#8b5cf6" className="hero-empty-icon" />
                                <h4>{lang === 'en' ? 'No banners in Hero carousel!' : 'هیچ پۆستەرێک نییە لە هیرۆدا!'}</h4>
                                <p>{lang === 'en' ? 'Use the quick search above to add movies or series to the hero carousel.' : 'لە ڕێگەی گەڕانەکەی سەرەوە ناوی فیلمەکە بنووسە یان لە بەشی بەرهەمەکان کلیک لە دوگمەی 🌟 زیادکردن بکە.'}</p>
                            </div>
                        ) : (
                            <div className="hero-cards-grid">
                                {movies.filter(m => m.isFeatured).map((movie, idx) => (
                                    <div key={movie.id} className="hero-card-item">
                                        <div className="hero-card-order-badge">
                                            #{idx + 1}
                                        </div>
                                        <div className="hero-card-poster">
                                            {(movie.posterCloudUrl || movie.posterUrl) ? <img src={movie.posterCloudUrl || movie.posterUrl} alt="" /> : null}
                                        </div>
                                        <div className="hero-card-details">
                                            <h4 title={movie.title}>{movie.title}</h4>
                                            <div className="hero-card-meta">
                                                <span>{movie.year}</span>
                                                <span>•</span>
                                                <span>{movie.type === 'movie' ? (lang === 'en' ? 'Movie' : 'فیلم') : movie.type === 'animation' ? (lang === 'en' ? 'Animation' : 'ئەنیمێشن') : (lang === 'en' ? 'Series' : 'زنجیرە')}</span>
                                                {movie.imdbRating && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="hero-card-rating"><Star size={12} fill="#fbbf24" /> {movie.imdbRating}</span>
                                                    </>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => handleToggleFeatured(movie)}
                                                className="btn-hero-remove"
                                            >
                                                <Trash2 size={14} /> {lang === 'en' ? 'Remove from Hero' : 'سڕینەوە لە هیرۆ'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'approvals' && (
                <AiTranslationTracker 
                    pendingMovies={movies.filter(m => m.status === 'pending_approval')}
                    onApproveMovie={handleApproveMovie}
                    onRejectMovie={handleRejectMovie}
                    onEditMovie={setEditMovie}
                    onRefreshMovies={() => load(true)}
                />
            )}

            {activeTab === 'credits' && <AdminCredits />}
            {activeTab === 'plans' && isSuperAdmin && <AdminPlans />}
            {activeTab === 'users' && <AdminUsers />}
            {activeTab === 'analytics' && <AdminAnalytics />}
            {activeTab === 'backups' && isSuperAdmin && <AdminBackups />}
            {activeTab === 'notifications_manager' && isSuperAdmin && <AdminNotificationManager />}
            {activeTab === 'activities' && isSuperAdmin && <AdminActivityLog />}
            {activeTab === 'glossary' && <AdminGlossary />}

            {/* EPISODE MANAGER MODAL */}
            {episodesModalMovie && (
                <EpisodeManagerModal
                    movie={movies.find(m => m.id === episodesModalMovie.id) || episodesModalMovie}
                    onClose={() => setEpisodesModalMovie(null)}
                    onAddSeason={addSeason}
                    onDeleteSeason={deleteSeason}
                    onAddEpisode={addEpisode}
                    onBulkAdd={addBulkEpisodes}
                    onDeleteEpisode={deleteEpisode}
                    onEditEpisode={(movieId, sNum, ep) => openEditEpisodeModal(movieId, sNum, ep)}
                    onEpVideo={(movieId, sNum, epNum, file) => doUpload(movieId, file, 'ep-video', { season: sNum, episode: epNum })}
                    onR2Upload={(movieId, sNum, epId, epNum, file) => doR2Upload(movieId, file, 'video', { season: sNum, episodeId: epId })}
                    onEpVideoUrl={(movieId, sNum, epId, url) => saveEpVideoUrl(movieId, sNum, epId, url)}
                    onEpSrt={(movieId, sNum, epNum, file, type) => doUpload(movieId, file, 'ep-srt', { season: sNum, episode: epNum, srtType: type })}
                    onSensitive={(movieId, sNum, epId) => openSensitiveModal(movieId, sNum, epId)}
                    onOpenSrtEditor={(movieId, mTitle, sNum, epNum, epTitle, vUrl) => openSrtEditorModal(movieId, mTitle, sNum, epNum, epTitle, vUrl)}
                    onOpenMetricsModal={(movie, sNum, ep) => setMetricsTarget({
                        movieId: movie.id,
                        movieTitle: movie.title,
                        seasonNum: sNum,
                        episodeId: ep.id,
                        episodeTitle: `${ep.number} (${ep.title})`,
                        initialMetrics: ep.languageMetrics
                    })}
                    onReloadMovie={load}
                    uploading={uploading}
                    uploadProgress={uploadProgress}
                />
            )}

            {/* DUAL SUBTITLE & VIDEO EDITOR MODAL */}
            {srtEditorData?.open && (
                <DualSrtVideoEditor
                    movieId={srtEditorData.movieId}
                    movieTitle={srtEditorData.movieTitle}
                    seasonNum={srtEditorData.seasonNum}
                    episodeNum={srtEditorData.episodeNum}
                    episodeTitle={srtEditorData.episodeTitle}
                    videoUrl={srtEditorData.videoUrl}
                    onClose={() => setSrtEditorData(null)}
                    onSaved={() => {
                        toast('سەبتایتڵەکان نوێکرانەوە ✓');
                        load();
                    }}
                />
            )}

            {/* LANGUAGE METRICS MANAGER MODAL */}
            {metricsTarget && (
                <LanguageMetricsModal
                    title={metricsTarget.movieTitle}
                    subtitle={metricsTarget.episodeTitle}
                    initialMetrics={metricsTarget.initialMetrics}
                    onSave={handleSaveLanguageMetrics}
                    onClose={() => setMetricsTarget(null)}
                />
            )}

            {/* GLOBAL ADD MOVIE / SERIES MODAL */}
            {showForm && (
                <div className="form-overlay" onClick={() => setShowForm(false)}>
                    <div 
                        className={`form-modal ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} 
                        dir={lang === 'en' ? 'ltr' : 'rtl'}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="form-header">
                            <h2>{lang === 'en' ? 'New Movie / Series' : 'بەرهەمی نوێ'}</h2>
                            <button onClick={() => setShowForm(false)} className="close-btn" title={lang === 'en' ? "Close" : "داخستن"}><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            {form.posterUrl && (
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
                                    <img src={form.posterUrl} alt="Poster" style={{ width: '120px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />
                                </div>
                            )}
                            <div className="type-selector">
                                <button className={`type-btn ${form.type === 'movie' ? 'active-movie' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'movie' }))}>
                                    <Film size={18} /> {lang === 'en' ? 'Movie' : 'فیلم'}
                                </button>
                                <button className={`type-btn ${form.type === 'series' ? 'active-series' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'series' }))}>
                                    <Layers size={18} /> {lang === 'en' ? 'Series' : 'زنجیرە'}
                                </button>
                                <button className={`type-btn ${form.type === 'animation' ? 'active-animation' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'animation' }))}>
                                    <Play size={18} /> {lang === 'en' ? 'Animation' : 'ئەنیمێشن'}
                                </button>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                                <button onClick={() => setForm({ title: '', description: '', descriptionKu: '', descriptionEn: '', descriptionAr: '', language: '', genre: '', year: new Date().getFullYear().toString(), endYear: '', duration: '', type: 'movie', imdbRating: '', posterUrl: '', seasons: [] })} className="btn-cancel" style={{ padding: '4px 10px', fontSize: '12px' }}>{lang === 'en' ? 'Clear Form' : 'سڕینەوەی فۆڕم'}</button>
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Movie / Series Title, IMDb Code, or Full URL *' : 'ناوی فیلم / زنجیرە، کودی IMDb، یان لینکی تەواو *'}</label>
                                <input 
                                    type="text" 
                                    value={form.title} 
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
                                    onPaste={e => {
                                        const pasted = e.clipboardData.getData('text');
                                        if (pasted && (pasted.includes('imdb.com') || /tt\d{7,8}/i.test(pasted))) {
                                            setForm(f => ({ ...f, title: pasted }));
                                            setTimeout(() => fetchImdbRating(pasted), 50);
                                        }
                                    }}
                                    className="form-input" 
                                    placeholder={lang === 'en' ? "Enter English title, IMDb ID (e.g. tt0903747) or IMDb URL..." : "ناوی ئینگلیزی، کودی IMDb (وەک tt0903747) یان لینکی IMDb دابنێ..."} 
                                />
                            </div>
                            
                            <div className="form-group"><label>{lang === 'en' ? 'Spoken Language' : 'زمانی قسەکردن'}</label><input type="text" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} className="form-input" placeholder={lang === 'en' ? "e.g. English, Spanish" : "بۆ نموونە: English, Spanish"} /></div>

                            <div className="form-group"><label>{lang === 'en' ? 'Description (Kurdish)' : 'باس (کوردی)'}</label><textarea value={form.descriptionKu || form.description} onChange={e => setForm(f => ({ ...f, descriptionKu: e.target.value, description: e.target.value }))} className="form-input form-textarea" rows={3} /></div>
                            <div className="form-group"><label>{lang === 'en' ? 'Description (English)' : 'باس (English)'}</label><textarea value={form.descriptionEn} onChange={e => setForm(f => ({ ...f, descriptionEn: e.target.value }))} className="form-input form-textarea" rows={2} /></div>
                            <div className="form-group"><label>{lang === 'en' ? 'Description (Arabic)' : 'باس (عربي)'}</label><textarea value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} className="form-input form-textarea" rows={2} /></div>
                            
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Genres' : 'ژانڕ'}</label>
                                <div className="genre-admin-grid">
                                    {GENRES_LIST.map(g => {
                                        const current = (form.genre || '').split(/[,،/|]/).map(x => x.trim()).filter(Boolean);
                                        const isSelected = current.some(x => 
                                            x.toLowerCase() === g.ku.toLowerCase() || 
                                            x.toLowerCase() === g.en.toLowerCase() || 
                                            x.toLowerCase() === g.id.toLowerCase()
                                        );
                                        const labelText = lang === 'en' ? g.en : g.ku;
                                        const addValue = lang === 'en' ? g.en : g.ku;

                                        return (
                                            <label key={g.id} className="genre-admin-label">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        const currentList = (form.genre || '').split(/[,،]/).map(x => x.trim()).filter(Boolean);
                                                        if (isSelected) {
                                                            const updated = currentList.filter(x => 
                                                                x.toLowerCase() !== g.ku.toLowerCase() && 
                                                                x.toLowerCase() !== g.en.toLowerCase() && 
                                                                x.toLowerCase() !== g.id.toLowerCase()
                                                            );
                                                            setForm(f => ({ ...f, genre: updated.join(lang === 'en' ? ', ' : '، ') }));
                                                        } else {
                                                            setForm(f => ({ ...f, genre: [...currentList, addValue].join(lang === 'en' ? ', ' : '، ') }));
                                                        }
                                                    }}
                                                />
                                                <span className="checkbox-custom-admin"></span>
                                                {labelText}
                                            </label>
                                        );
                                    })}
                                </div>
                                <input type="text" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} className="form-input" style={{ marginTop: '8px' }} placeholder={lang === 'en' ? "Or write genres here..." : "یان لێرە بینوسە..."} />
                            </div>

                            <div className="form-row">
                                <div className="form-group"><label>{lang === 'en' ? 'Release Year' : 'ساڵ (دەستپێک)'}</label><input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="form-input" /></div>
                                {form.type === 'series' && <div className="form-group"><label>{lang === 'en' ? 'End Year (Empty = Ongoing)' : 'ساڵی کۆتایی (بەتاڵ بێ ئەگەر بەردەوامە)'}</label><input type="number" value={form.endYear || ''} onChange={e => setForm(f => ({ ...f, endYear: e.target.value }))} className="form-input" placeholder={lang === 'en' ? "e.g. 2024" : "بۆ نمونە: 2013"} /></div>}
                                {(form.type === 'movie' || form.type === 'animation') && <div className="form-group"><label>{lang === 'en' ? 'Duration' : 'کات'}</label><input type="text" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} className="form-input" /></div>}
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'IMDb Rating' : 'ڕەیتینگی IMDb'}</label>
                                <div className="imdb-rating-input-group">
                                    <input type="text" value={form.imdbRating as string} onChange={e => setForm(f => ({ ...f, imdbRating: e.target.value }))} className="form-input" placeholder={lang === 'en' ? "e.g. 8.5" : "بۆ نموونە: 7.5"} />
                                    <button onClick={() => fetchImdbRating(form.title)} className="btn-fetch-imdb" disabled={fetchingImdbRating}>
                                        {fetchingImdbRating ? <Loader2 size={16} className="spinning" /> : <Star size={16} />}
                                        {lang === 'en' ? 'Fetch' : 'هێنان'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setShowForm(false)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەز'}</button>
                            <button onClick={handleCreate} className="btn-save"><Save size={16} /> {lang === 'en' ? 'Add Item' : 'زیادکردن'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* GLOBAL EDIT / REVIEW MOVIE MODAL */}
            {editMovie && (
                <div className="form-overlay" onClick={() => setEditMovie(null)}>
                    <div 
                        className={`form-modal ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} 
                        dir={lang === 'en' ? 'ltr' : 'rtl'}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="form-header">
                            <h2>
                                {editMovie.status === 'pending_approval' 
                                    ? (lang === 'en' ? '🔍 Inspect & Edit: ' : '🔍 پشکنین و دەستکاری بەرهەم: ') 
                                    : (lang === 'en' ? 'Edit: ' : 'دەستکاریکردن: ')}
                                {editMovie.title}
                            </h2>
                            <button onClick={() => setEditMovie(null)} className="close-btn" title={lang === 'en' ? "Close" : "داخستن"}><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            {editMovie.status === 'pending_approval' && (
                                <div style={{ background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: '10px', padding: '12px', marginBottom: '14px', fontSize: '13px', color: '#fef08a' }}>
                                    ⏳ <strong>{lang === 'en' ? 'This item is awaiting your approval!' : 'ئەم بەرهەمە چاوەڕوانی پەسەندکردنی تۆیە!'}</strong> {lang === 'en' ? 'Submitted by:' : 'نێردراوە لەلایەن:'} <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{editMovie.submittedBy?.username || (lang === 'en' ? 'Admin' : 'ئەدمین')}</span>
                                </div>
                            )}

                            {/* Direct Quick Tools for Series & Subtitles */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                                {editMovie.type === 'series' ? (
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const target = editMovie;
                                            setEditMovie(null);
                                            setEpisodesModalMovie(target);
                                        }}
                                        style={{ flex: 1, padding: '9px 14px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#c4b5fd', borderRadius: '10px', fontSize: '12.5px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                    >
                                        <Layers size={15} /> {lang === 'en' ? 'Manage & View Episodes 🎬' : 'بەڕێوەبردن و بینینی ئەڵقەکان 🎬'}
                                    </button>
                                ) : (
                                    <>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                const target = editMovie;
                                                setEditMovie(null);
                                                openSrtEditorModal(target.id, target.title, undefined, undefined, target.title, target.videoUrl || undefined);
                                            }}
                                            style={{ flex: 1, padding: '9px 14px', background: 'rgba(34, 211, 238, 0.15)', border: '1px solid rgba(34, 211, 238, 0.4)', color: '#67e8f9', borderRadius: '10px', fontSize: '12.5px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            <Languages size={15} /> {lang === 'en' ? 'Inspect Video & Subtitles 📝' : 'پشکنینی ڤیدیۆ و سەبتایتڵەکان 📝'}
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                const target = editMovie;
                                                openSensitiveModal(target.id);
                                            }}
                                            style={{ padding: '9px 14px', background: (editMovie.sensitiveScenes && editMovie.sensitiveScenes.length > 0) ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', borderRadius: '10px', fontSize: '12.5px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            <Shield size={15} color="#f87171" /> {lang === 'en' ? 'Sensitive Scenes 🛡️' : 'دیمەنی نەشیاو 🛡️'}
                                            {editMovie.sensitiveScenes && editMovie.sensitiveScenes.length > 0 && (
                                                <span style={{ background: '#ef4444', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '8px' }}>
                                                    {editMovie.sensitiveScenes.length}
                                                </span>
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>

                            {(editMovie.posterCloudUrl || editMovie.posterUrl) && (
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
                                    <img src={editMovie.posterCloudUrl || editMovie.posterUrl} alt="Poster" style={{ width: '120px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />
                                </div>
                            )}
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Movie / Series Title, IMDb Code, or Full URL *' : 'ناوی فیلم / زنجیرە، کودی IMDb، یان لینکی تەواو *'}</label>
                                <input 
                                    type="text" 
                                    value={editMovie.title} 
                                    onChange={e => setEditMovie(m => m ? { ...m, title: e.target.value } : null)} 
                                    onPaste={e => {
                                        const pasted = e.clipboardData.getData('text');
                                        if (pasted && (pasted.includes('imdb.com') || /tt\d{7,8}/i.test(pasted))) {
                                            setEditMovie(m => m ? { ...m, title: pasted } : null);
                                            setTimeout(() => fetchImdbRating(pasted, true), 50);
                                        }
                                    }}
                                    className="form-input" 
                                    placeholder={lang === 'en' ? "Enter English title, IMDb ID (e.g. tt0903747) or IMDb URL..." : "ناوی ئینگلیزی، کودی IMDb (وەک tt0903747) یان لینکی IMDb دابنێ..."} 
                                />
                            </div>
                            
                            <div className="form-group"><label>{lang === 'en' ? 'Spoken Language' : 'زمانی قسەکردن'}</label><input type="text" value={editMovie.language || ''} onChange={e => setEditMovie(m => m ? { ...m, language: e.target.value } : null)} className="form-input" placeholder={lang === 'en' ? "e.g. English, Spanish" : "بۆ نموونە: English, Spanish"} /></div>

                            <div className="form-group"><label>{lang === 'en' ? 'Description (Kurdish)' : 'باس (کوردی)'}</label><textarea value={editMovie.descriptionKu || editMovie.description} onChange={e => setEditMovie(m => m ? { ...m, descriptionKu: e.target.value, description: e.target.value } : null)} className="form-input form-textarea" rows={3} /></div>
                            <div className="form-group"><label>{lang === 'en' ? 'Description (English)' : 'باس (English)'}</label><textarea value={editMovie.descriptionEn || ''} onChange={e => setEditMovie(m => m ? { ...m, descriptionEn: e.target.value } : null)} className="form-input form-textarea" rows={2} /></div>
                            <div className="form-group"><label>{lang === 'en' ? 'Description (Arabic)' : 'باس (عربي)'}</label><textarea value={editMovie.descriptionAr || ''} onChange={e => setEditMovie(m => m ? { ...m, descriptionAr: e.target.value } : null)} className="form-input form-textarea" rows={2} /></div>
                            
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Genres' : 'ژانڕ'}</label>
                                <div className="genre-admin-grid">
                                    {GENRES_LIST.map(g => {
                                        const current = (editMovie.genre || '').split(/[,،/|]/).map(x => x.trim()).filter(Boolean);
                                        const isSelected = current.some(x => 
                                            x.toLowerCase() === g.ku.toLowerCase() || 
                                            x.toLowerCase() === g.en.toLowerCase() || 
                                            x.toLowerCase() === g.id.toLowerCase()
                                        );
                                        const labelText = lang === 'en' ? g.en : g.ku;
                                        const addValue = lang === 'en' ? g.en : g.ku;

                                        return (
                                            <label key={g.id} className="genre-admin-label">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        const currentList = (editMovie.genre || '').split(/[,،]/).map(x => x.trim()).filter(Boolean);
                                                        let newGenre = '';
                                                        if (isSelected) {
                                                            const updated = currentList.filter(x => 
                                                                x.toLowerCase() !== g.ku.toLowerCase() && 
                                                                x.toLowerCase() !== g.en.toLowerCase() && 
                                                                x.toLowerCase() !== g.id.toLowerCase()
                                                            );
                                                            newGenre = updated.join(lang === 'en' ? ', ' : '، ');
                                                        } else {
                                                            newGenre = [...currentList, addValue].join(lang === 'en' ? ', ' : '، ');
                                                        }
                                                        setEditMovie(m => m ? { ...m, genre: newGenre } : null);
                                                    }}
                                                />
                                                <span className="checkbox-custom-admin"></span>
                                                {labelText}
                                            </label>
                                        );
                                    })}
                                </div>
                                <input type="text" value={editMovie.genre} onChange={e => setEditMovie(m => m ? { ...m, genre: e.target.value } : null)} className="form-input" style={{ marginTop: '8px' }} placeholder={lang === 'en' ? "Or write genres here..." : "یان لێرە بینوسە..."} />
                            </div>

                            <div className="form-row">
                                <div className="form-group"><label>{lang === 'en' ? 'Release Year' : 'ساڵ (دەستپێک)'}</label><input type="number" value={editMovie.year} onChange={e => setEditMovie(m => m ? { ...m, year: +e.target.value } : null)} className="form-input" /></div>
                                {editMovie.type === 'series' && <div className="form-group"><label>{lang === 'en' ? 'End Year' : 'ساڵی کۆتایی'}</label><input type="number" value={editMovie.endYear || ''} onChange={e => setEditMovie(m => m ? { ...m, endYear: e.target.value ? +e.target.value : null } : null)} className="form-input" placeholder={lang === 'en' ? "Empty = Ongoing" : "بەتاڵ = بەردەوامە"} /></div>}
                                <div className="form-group"><label>{lang === 'en' ? 'Duration' : 'کات'}</label><input type="text" value={editMovie.duration} onChange={e => setEditMovie(m => m ? { ...m, duration: e.target.value } : null)} className="form-input" /></div>
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'IMDb Rating' : 'ڕەیتینگی IMDb'}</label>
                                <div className="imdb-rating-input-group">
                                    <input type="text" value={editMovie.imdbRating as string || ''} onChange={e => setEditMovie(m => m ? { ...m, imdbRating: e.target.value } : null)} className="form-input" placeholder={lang === 'en' ? "e.g. 8.5" : "بۆ نموونە: 7.5"} />
                                    <button onClick={() => fetchImdbRating(editMovie.title, true)} className="btn-fetch-imdb" disabled={fetchingImdbRating}>
                                        {fetchingImdbRating ? <Loader2 size={16} className="spinning" /> : <Star size={16} />}
                                        {lang === 'en' ? 'Fetch' : 'هێنان'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="form-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            {editMovie.status === 'pending_approval' && isSuperAdmin ? (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            const target = editMovie;
                                            setEditMovie(null);
                                            handleApproveMovie(target);
                                        }} 
                                        className="btn-save" 
                                        style={{ background: '#10b981' }}
                                    >
                                        <CheckCircle size={15} /> {lang === 'en' ? 'Approve' : 'پەسەندکردن'}
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            const target = editMovie;
                                            setEditMovie(null);
                                            handleRejectMovie(target);
                                        }} 
                                        className="btn-cancel" 
                                        style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', borderColor: '#ef4444' }}
                                    >
                                        <X size={15} /> {lang === 'en' ? 'Reject' : 'ڕەتکردنەوە'}
                                    </button>
                                </div>
                            ) : <div />}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setEditMovie(null)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەز'}</button>
                                <button onClick={handleSaveEdit} className="btn-save"><Save size={16} /> {lang === 'en' ? 'Save Changes' : 'پاشەکەوتکردن'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SENSITIVE SCENES MODAL */}
            {sensitiveTarget && (() => {
                const targetMovie = movies.find(x => x.id === sensitiveTarget.movieId);
                const targetEp = (sensitiveTarget.episodeId && sensitiveTarget.seasonNum && targetMovie?.seasons) 
                    ? targetMovie.seasons.find(s => s.number === sensitiveTarget.seasonNum)?.episodes.find(e => e.id === sensitiveTarget.episodeId) 
                    : null;
                const titleText = targetEp 
                    ? `${targetMovie?.title || ''} - وەرزی ${sensitiveTarget.seasonNum} • ئەڵقەی ${targetEp.number || ''} (${targetEp.title || ''})`
                    : (targetMovie?.title || '');

                return (
                    <div className="form-overlay" onClick={() => setSensitiveTarget(null)}>
                        <div className={`form-modal ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'} onClick={e => e.stopPropagation()} style={{ maxWidth: '580px', width: '95%' }}>
                            <div className="form-header">
                                <div>
                                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px', margin: 0 }}>
                                        <Shield size={20} color="#f87171" />
                                        {lang === 'en' ? 'Inappropriate / Mature Scenes' : 'دیاریکردنی دیمەنە نەشیاوەکان (مۆدی خێزانی)'}
                                    </h2>
                                    {titleText && (
                                        <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                                            {titleText}
                                        </p>
                                    )}
                                </div>
                                <button onClick={() => setSensitiveTarget(null)} className="close-btn" title={lang === 'en' ? "Close" : "داخستن"}><X size={20} /></button>
                            </div>
                            <div className="form-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '12.5px', color: '#fca5a5', lineHeight: '1.6' }}>
                                    🛡️ <strong>{lang === 'en' ? 'Family Mode scene filter:' : 'فلتەری دیمەنی نەشیاو بۆ مۆدی خێزانی:'}</strong> {lang === 'en' ? 'Enter the start and end time (in seconds) for scenes that should be blurred or skipped.' : 'کاتی دەستپێک و کۆتایی بە چرکە دیاری بکە بۆ ئەو دیمەنانەی دەبێت بشاردرێنەوە یان ببڕدرێن لە کاتی سەیرکردندا.'}
                                </div>

                                {sensitiveScenes.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px 20px', color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)' }}>
                                        <Shield size={36} color="#64748b" style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
                                        <p style={{ margin: 0, fontSize: '13.5px' }}>{lang === 'en' ? 'No sensitive scenes defined yet.' : 'هیچ کاتێکی نەشیاو دیاری نەکراوە.'}</p>
                                        <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#475569' }}>{lang === 'en' ? 'Click the button below to add a timestamp range.' : 'کلیک لە دوگمەی خوارەوە بکە بۆ زیادکردنی مەودای دیمەن.'}</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {sensitiveScenes.map((s, i) => {
                                            const startMin = Math.floor(s.start / 60);
                                            const startSec = Math.floor(s.start % 60);
                                            const endMin = Math.floor(s.end / 60);
                                            const endSec = Math.floor(s.end % 60);
                                            const diffSec = Math.max(0, s.end - s.start);

                                            return (
                                                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span>#{i + 1}</span> {lang === 'en' ? 'Scene Interval' : 'مەودای دیمەن'}
                                                        </span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            {diffSec > 0 && (
                                                                <span style={{ fontSize: '11px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                                                                    ⏱ {diffSec} {lang === 'en' ? 'sec duration' : 'چرکە دەبڕدرێت'}
                                                                </span>
                                                            )}
                                                            <button 
                                                                type="button"
                                                                className="btn-cancel" 
                                                                style={{ padding: '4px 8px', minWidth: 'auto', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', cursor: 'pointer' }}
                                                                onClick={() => setSensitiveScenes(sensitiveScenes.filter((_, idx) => idx !== i))}
                                                                title={lang === 'en' ? 'Delete Scene' : 'سڕینەوە'}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                                <label style={{ fontSize: '11.5px', color: '#cbd5e1', fontWeight: 600 }}>{lang === 'en' ? 'Start (Sec)' : 'دەستپێک (چرکە)'}</label>
                                                                <span style={{ fontSize: '11px', color: '#94a3b8', direction: 'ltr' }}>{startMin}:{String(startSec).padStart(2, '0')}</span>
                                                            </div>
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                value={s.start} 
                                                                onChange={e => {
                                                                    const newS = [...sensitiveScenes];
                                                                    newS[i].start = Math.max(0, Number(e.target.value));
                                                                    setSensitiveScenes(newS);
                                                                }} 
                                                                className="form-input" 
                                                                style={{ textAlign: 'center', fontWeight: 'bold' }}
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                                <label style={{ fontSize: '11.5px', color: '#cbd5e1', fontWeight: 600 }}>{lang === 'en' ? 'End (Sec)' : 'کۆتایی (چرکە)'}</label>
                                                                <span style={{ fontSize: '11px', color: '#94a3b8', direction: 'ltr' }}>{endMin}:{String(endSec).padStart(2, '0')}</span>
                                                            </div>
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                value={s.end} 
                                                                onChange={e => {
                                                                    const newS = [...sensitiveScenes];
                                                                    newS[i].end = Math.max(0, Number(e.target.value));
                                                                    setSensitiveScenes(newS);
                                                                }} 
                                                                className="form-input" 
                                                                style={{ textAlign: 'center', fontWeight: 'bold' }}
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <button 
                                    type="button"
                                    className="btn-add" 
                                    style={{ width: '100%', marginTop: '14px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px dashed rgba(239, 68, 68, 0.4)', color: '#fca5a5', cursor: 'pointer' }} 
                                    onClick={() => setSensitiveScenes([...sensitiveScenes, { start: 0, end: 0 }])}
                                >
                                    <Plus size={16}/> {lang === 'en' ? 'Add New Scene Range' : 'زیادکردنی کاتی نەشیاوی نوێ'}
                                </button>
                            </div>
                            <div className="form-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setSensitiveTarget(null)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەز'}</button>
                                <button onClick={handleSaveSensitive} className="btn-save" style={{ background: '#ef4444' }}>
                                    <Save size={16} /> {lang === 'en' ? 'Save Changes' : 'پاشەکەوتکردن'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* EDIT EPISODE MODAL */}
            {editEpisodeTarget && (
                <div className="form-overlay" onClick={() => setEditEpisodeTarget(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>دەستکاریکردنی ئەڵقە</h2>
                            <button onClick={() => setEditEpisodeTarget(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <div className="form-group"><label>ناوی ئەڵقە</label><input type="text" value={editEpForm.title} onChange={e => setEditEpForm(f => ({ ...f, title: e.target.value }))} className="form-input" /></div>
                            <div className="form-group"><label>کورتە</label><textarea value={editEpForm.description} onChange={e => setEditEpForm(f => ({ ...f, description: e.target.value }))} className="form-input form-textarea" rows={3} /></div>
                            <div className="form-group"><label>کات (بۆ نموونە: 45 min)</label><input type="text" value={editEpForm.duration} onChange={e => setEditEpForm(f => ({ ...f, duration: e.target.value }))} className="form-input" /></div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setEditEpisodeTarget(null)} className="btn-cancel">پاشگەز</button>
                            <button onClick={saveEpisodeEdit} className="btn-save"><Save size={16} /> پاشەکەوتکردن</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SUBTITLE DIFF & HISTORY VIEWER MODAL */}
            {diffViewerTarget && (
                <SubtitleDiffViewer
                    movieId={diffViewerTarget.movieId}
                    movieTitle={diffViewerTarget.movieTitle}
                    seasonNum={diffViewerTarget.seasonNum}
                    episodeNum={diffViewerTarget.episodeNum}
                    episodeTitle={diffViewerTarget.episodeTitle}
                    seasons={diffViewerTarget.seasons}
                    onClose={() => setDiffViewerTarget(null)}
                    onRestored={() => {
                        setDiffViewerTarget(null);
                        toast('نوسخەی سەبتایتڵ بە سەرکەوتوویی گەڕێنرایەوە ✓');
                        load();
                    }}
                />
            )}

        </div>
    );
}

function SeasonPanel({ season, movieId, onAddEpisode, onBulkAdd, onEpVideo, onEpSrt, onSensitive, onEpVideoUrl, onR2Upload, uploading, uploadProgress, epVideoRef, epOrigSrtRef, epTransSrtRef, r2EpVideoRef, onEditEpisode, onOpenSrtEditor }: any) {
    const [open, setOpen] = useState(true);
    const [bulkCount, setBulkCount] = useState('');

    const sortedEpisodes = [...season.episodes].sort((a: any, b: any) => a.number - b.number);

    return (
        <div className="season-block">
            <div className="season-block-header" onClick={() => setOpen(!open)}>
                <span>سیزنی {season.number} ({season.episodes.length} ئالقە)</span>
                <div>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
            </div>
            {open && (
                <div className="episodes-list">
                    <div className="modern-bulk-add" onClick={e => e.stopPropagation()}>
                        <div className="modern-bulk-input-wrap">
                            <PlusCircle size={16} className="bulk-icon" />
                            <input 
                                type="number" 
                                min="1" 
                                max="50"
                                value={bulkCount} 
                                onChange={e => setBulkCount(e.target.value)} 
                                placeholder="ژمارەی ئەڵقەکان" 
                            />
                        </div>
                        <button 
                            className="modern-bulk-btn" 
                            disabled={!bulkCount || Number(bulkCount) <= 0}
                            onClick={() => {
                                onBulkAdd(Number(bulkCount));
                                setBulkCount('');
                            }}
                        >
                            زیادکردن
                        </button>
                    </div>
                    <div className="ep-grid">
                        {sortedEpisodes.map((ep: Episode) => (
                            <div key={ep.id} className="ep-grid-card">
                                <div className="ep-grid-title">{ep.number}. {ep.title}</div>
                                <div className="ep-grid-btns">
                                    <input type="file" className="hidden-input" ref={el => { epVideoRef.current[ep.id] = el; }} onChange={e => e.target.files?.[0] && onEpVideo(ep.number, e.target.files[0])} />
                                    <button className={`ep-mini-btn ${ep.videoFile ? 'done' : ''}`} onClick={() => epVideoRef.current[ep.id]?.click()}>
                                        {uploading[`${movieId}-ep-video-${season.number}-${ep.number}`] ? (
                                            <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
                                                <Loader2 size={11} className="spinning" />
                                                <span style={{fontSize: '9px'}}>{uploadProgress[`${movieId}-ep-video-${season.number}-${ep.number}`] || 0}%</span>
                                            </div>
                                        ) : <Video size={11} />}
                                    </button>

                                    <input type="file" className="hidden-input" ref={el => { r2EpVideoRef.current[ep.id] = el; }} onChange={e => e.target.files?.[0] && onR2Upload(ep.number, e.target.files[0], ep.id)} />
                                    <button className={`ep-mini-btn cloud-upload-btn ${ep.videoUrl && ep.videoUrl.includes('r2') ? 'done' : ''}`} onClick={() => r2EpVideoRef.current[ep.id]?.click()}>
                                        {uploading[`${movieId}-video-${ep.id}`] ? (
                                            <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
                                                <Loader2 size={11} className="spinning" />
                                                <span style={{fontSize: '9px'}}>{uploadProgress[`${movieId}-video-${ep.id}`] || 0}%</span>
                                            </div>
                                        ) : <Upload size={11} />}
                                    </button>

                                    <button className="ep-mini-btn" onClick={() => { const u = window.prompt('URL:', ep.videoUrl || ''); if(u) onEpVideoUrl(ep.id, u); }}><LinkIcon size={11} /></button>

                                    <input type="file" className="hidden-input" ref={el => { epOrigSrtRef.current[ep.id] = el; }} onChange={e => e.target.files?.[0] && onEpSrt(ep.number, e.target.files[0], 'original')} />
                                    <button className={`ep-mini-btn ${ep.originalSrt ? 'done' : ''}`} onClick={() => epOrigSrtRef.current[ep.id]?.click()}><FileText size={11} /></button>

                                    <input type="file" className="hidden-input" ref={el => { epTransSrtRef.current[ep.id] = el; }} onChange={e => e.target.files?.[0] && onEpSrt(ep.number, e.target.files[0], 'translated')} />
                                    <button className={`ep-mini-btn ${ep.translatedSrt ? 'done' : ''}`} onClick={() => epTransSrtRef.current[ep.id]?.click()}><Languages size={11} /></button>
                                    
                                    <button className={`ep-mini-btn ${ep.sensitiveScenes?.length ? 'done-alert' : ''}`} onClick={() => onSensitive(ep.id)}><Shield size={11} /></button>

                                    <button className="ep-mini-btn" title="ئیدیتکردنی سەبتایتڵ لەگەڵ ڤیدیۆکە" onClick={() => onOpenSrtEditor && onOpenSrtEditor(ep)}><BarChart2 size={11} /></button>

                                    <button className="ep-mini-btn" onClick={() => onEditEpisode(ep)}><Edit3 size={11} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
