import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api/client';
import { 
    Sparkles, Search, History, ArrowLeftRight, User, Calendar, 
    FileText, CheckCircle2, ChevronRight, RefreshCw, Layers, Film, 
    ExternalLink, Filter, Zap, Clock, ShieldCheck, CheckCircle,
    X, Edit3, AlertCircle
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { Movie } from '../types';
import SubtitleDiffViewer from './SubtitleDiffViewer';
import './AiTranslationTracker.css';

interface AiTranslationEntry {
    id: string;
    movieId: string;
    movieTitle: string;
    posterUrl?: string;
    seasonNum?: number;
    episodeNum?: number;
    savedAt: string;
    savedBy?: {
        id: string;
        username: string;
        role: string;
    };
    isAi: boolean;
    aiModel: string;
    aiTone?: string;
    linesChanged: number;
    wordsAdded: number;
    wordsRemoved: number;
    totalLines: number;
    note?: string;
}

interface AiTranslationTrackerProps {
    pendingMovies?: Movie[];
    onApproveMovie?: (movie: Movie) => void;
    onRejectMovie?: (movie: Movie) => void;
    onEditMovie?: (movie: Movie) => void;
    onRefreshMovies?: () => void;
}

const formatModelName = (modelId?: string) => {
    if (!modelId) return 'AI Master';
    const m = modelId.toLowerCase();
    if (m.includes('claude')) return '✨ Claude Sonnet';
    if (m.includes('gemini')) return '⚡ Gemini Flash';
    if (m.includes('gpt-4o') || m.includes('gpt4o')) return '🌟 GPT-4o';
    if (m.includes('deepseek')) return '🧠 DeepSeek R1';
    if (m.includes('llama')) return '🦙 Llama 3.3';
    const shortName = modelId.split('/').pop() || modelId;
    return `✨ ${shortName}`;
};

export default function AiTranslationTracker({
    pendingMovies = [],
    onApproveMovie,
    onRejectMovie,
    onEditMovie,
    onRefreshMovies
}: AiTranslationTrackerProps) {
    const { lang } = useLanguage();
    const [subTab, setSubTab] = useState<'pending' | 'ai_history'>(() => {
        try {
            const saved = localStorage.getItem('admin_ai_tracker_subtab');
            if (saved === 'pending' || saved === 'ai_history') return saved;
        } catch {}
        return pendingMovies.length > 0 ? 'pending' : 'ai_history';
    });

    useEffect(() => {
        try {
            localStorage.setItem('admin_ai_tracker_subtab', subTab);
        } catch {}
    }, [subTab]);

    const [entries, setEntries] = useState<AiTranslationEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedModel, setSelectedModel] = useState('all');
    const [inspectDiff, setInspectDiff] = useState<{
        movieId: string;
        movieTitle: string;
        seasonNum?: number;
        episodeNum?: number;
        episodeTitle?: string;
        seasons?: any[];
        historyId?: string;
    } | null>(null);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/admin/ai-translation-history');
            if (Array.isArray(res.data)) {
                setEntries(res.data);
            }
        } catch (err) {
            console.error('Failed to fetch AI translation history:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    // Refresh both history and movies
    const handleGlobalRefresh = () => {
        fetchHistory();
        if (onRefreshMovies) onRefreshMovies();
    };

    // Summary Stats
    const totalLines = useMemo(() => entries.reduce((acc, e) => acc + (e.linesChanged || 0), 0), [entries]);
    const totalWords = useMemo(() => entries.reduce((acc, e) => acc + (e.wordsAdded || 0), 0), [entries]);
    const uniqueUsers = useMemo(() => new Set(entries.map(e => e.savedBy?.username).filter(Boolean)).size, [entries]);

    // Grouping: One Card per (Movie + Admin + Season/Episode)
    interface GroupedAiEntry {
        key: string;
        movieId: string;
        movieTitle: string;
        posterUrl?: string;
        seasonNum?: number;
        episodeNum?: number;
        savedBy?: {
            id: string;
            username: string;
            role: string;
        };
        latestSavedAt: string;
        totalLinesChanged: number;
        totalWordsAdded: number;
        totalWordsRemoved: number;
        versionsCount: number;
        aiModels: string[];
        latestNote?: string;
        latestHistoryId: string;
        historyIds: string[];
    }

    const groupedEntries = useMemo(() => {
        const map = new Map<string, GroupedAiEntry>();

        entries.forEach(entry => {
            const userId = entry.savedBy?.id || entry.savedBy?.username || 'unknown';
            const key = `${entry.movieId}-${entry.seasonNum ?? 'm'}-${entry.episodeNum ?? 'm'}-${userId}`;

            const existing = map.get(key);
            if (!existing) {
                map.set(key, {
                    key,
                    movieId: entry.movieId,
                    movieTitle: entry.movieTitle,
                    posterUrl: entry.posterUrl,
                    seasonNum: entry.seasonNum,
                    episodeNum: entry.episodeNum,
                    savedBy: entry.savedBy,
                    latestSavedAt: entry.savedAt,
                    totalLinesChanged: entry.linesChanged || 0,
                    totalWordsAdded: entry.wordsAdded || 0,
                    totalWordsRemoved: entry.wordsRemoved || 0,
                    versionsCount: 1,
                    aiModels: entry.aiModel ? [entry.aiModel] : [],
                    latestNote: entry.note,
                    latestHistoryId: entry.id,
                    historyIds: [entry.id]
                });
            } else {
                existing.totalLinesChanged += (entry.linesChanged || 0);
                existing.totalWordsAdded += (entry.wordsAdded || 0);
                existing.totalWordsRemoved += (entry.wordsRemoved || 0);
                existing.versionsCount += 1;
                if (entry.aiModel && !existing.aiModels.includes(entry.aiModel)) {
                    existing.aiModels.push(entry.aiModel);
                }
                existing.historyIds.push(entry.id);
                if (new Date(entry.savedAt).getTime() > new Date(existing.latestSavedAt).getTime()) {
                    existing.latestSavedAt = entry.savedAt;
                    existing.latestNote = entry.note;
                    existing.latestHistoryId = entry.id;
                }
            }
        });

        return Array.from(map.values()).sort((a, b) => 
            new Date(b.latestSavedAt).getTime() - new Date(a.latestSavedAt).getTime()
        );
    }, [entries]);

    const filteredGroupedEntries = useMemo(() => {
        return groupedEntries.filter(e => {
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const matchTitle = (e.movieTitle || '').toLowerCase().includes(term);
                const matchUser = (e.savedBy?.username || '').toLowerCase().includes(term);
                const matchNote = (e.latestNote || '').toLowerCase().includes(term);
                if (!matchTitle && !matchUser && !matchNote) return false;
            }
            if (selectedModel !== 'all') {
                const hasModel = e.aiModels.some(m => {
                    if (selectedModel === 'claude' && m.toLowerCase().includes('claude')) return true;
                    if (selectedModel === 'gemini' && m.toLowerCase().includes('gemini')) return true;
                    if (selectedModel === 'gpt' && m.toLowerCase().includes('gpt')) return true;
                    return false;
                });
                if (!hasModel) return false;
            }
            return true;
        });
    }, [groupedEntries, searchTerm, selectedModel]);

    const filteredPendingMovies = useMemo(() => {
        if (!searchTerm) return pendingMovies;
        const term = searchTerm.toLowerCase();
        return pendingMovies.filter(m => 
            m.title.toLowerCase().includes(term) || 
            (m.genre && m.genre.toLowerCase().includes(term)) ||
            (m.submittedBy?.username && m.submittedBy.username.toLowerCase().includes(term))
        );
    }, [pendingMovies, searchTerm]);

    const openPendingMovieDiff = (movie: Movie) => {
        let sNum = undefined;
        let epNum = undefined;
        let epTitle = undefined;
        if (movie.type === 'series' && movie.seasons && movie.seasons.length > 0) {
            for (const s of movie.seasons) {
                for (const ep of s.episodes || []) {
                    if (ep.translatedSrt || ep.originalSrt) {
                        sNum = s.number;
                        epNum = ep.number;
                        epTitle = ep.title;
                        break;
                    }
                }
                if (sNum) break;
            }
            if (!sNum) {
                sNum = movie.seasons[0].number;
                epNum = movie.seasons[0].episodes?.[0]?.number || 1;
                epTitle = movie.seasons[0].episodes?.[0]?.title;
            }
        }
        setInspectDiff({
            movieId: movie.id,
            movieTitle: movie.title,
            seasonNum: sNum,
            episodeNum: epNum,
            episodeTitle: epTitle,
            seasons: movie.seasons
        });
    };

    return (
        <div className="ai-tracker-wrapper" dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {/* Header & Overview Stats */}
            <div className="ai-tracker-hero">
                <div className="ai-tracker-hero-info">
                    <div className="ai-tracker-title-row">
                        <div className="ai-tracker-icon-badge">
                            <ShieldCheck size={26} color="#c084fc" />
                        </div>
                        <div>
                            <h2>{lang === 'en' ? 'Audit & Approvals Governance' : 'مەرکەزی چاودێری و پەسەندکردنی سەرۆک'}</h2>
                            <p>{lang === 'en' ? 'Inspect AI translations line-by-line, review subtitle diffs, and approve submitted movies & series.' : 'پشکنینی وەرگێڕانەکانی AI دێڕ بە دێڕ، بینینی جیاوازییەکان بە سەوز و سوور، و پەسەندکردنی بەرهەمەکان.'}</p>
                        </div>
                    </div>
                </div>

                <div className="ai-tracker-stats-grid">
                    <div 
                        className={`ai-stat-card clickable ${subTab === 'pending' ? 'active' : ''}`}
                        onClick={() => setSubTab('pending')}
                    >
                        <div className="stat-card-top">
                            <span className="stat-label">{lang === 'en' ? 'Pending Approval' : 'چاوەڕوانی پەسەندکردن'}</span>
                            <CheckCircle size={16} color={pendingMovies.length > 0 ? '#ef4444' : '#10b981'} />
                        </div>
                        <div className="stat-card-val" style={{ color: pendingMovies.length > 0 ? '#f87171' : undefined }}>
                            {pendingMovies.length}
                        </div>
                    </div>

                    <div 
                        className={`ai-stat-card clickable ${subTab === 'ai_history' ? 'active' : ''}`}
                        onClick={() => setSubTab('ai_history')}
                    >
                        <div className="stat-card-top">
                            <span className="stat-label">{lang === 'en' ? 'AI Sessions' : 'کۆی وەرگێڕانەکان'}</span>
                            <History size={16} color="#38bdf8" />
                        </div>
                        <div className="stat-card-val">{entries.length}</div>
                    </div>

                    <div className="ai-stat-card">
                        <div className="stat-card-top">
                            <span className="stat-label">{lang === 'en' ? 'Lines Modified' : 'دێڕی وەرگێڕدراو'}</span>
                            <FileText size={16} color="#10b981" />
                        </div>
                        <div className="stat-card-val">{totalLines.toLocaleString()}</div>
                    </div>

                    <div className="ai-stat-card">
                        <div className="stat-card-top">
                            <span className="stat-label">{lang === 'en' ? 'Words Generated' : 'کۆی وشەکان'}</span>
                            <Zap size={16} color="#f59e0b" />
                        </div>
                        <div className="stat-card-val">+{totalWords.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Sub Tabs Selector */}
            <div className="governance-subtabs-nav">
                <button 
                    className={`gov-tab-btn ${subTab === 'pending' ? 'active' : ''}`}
                    onClick={() => setSubTab('pending')}
                >
                    <CheckCircle size={16} />
                    <span>{lang === 'en' ? 'Pending Approvals' : 'چاوەڕوانی پەسەندکردن'}</span>
                    {pendingMovies.length > 0 && (
                        <span className="gov-counter-pill">{pendingMovies.length}</span>
                    )}
                </button>

                <button 
                    className={`gov-tab-btn ${subTab === 'ai_history' ? 'active' : ''}`}
                    onClick={() => setSubTab('ai_history')}
                >
                    <Sparkles size={16} />
                    <span>{lang === 'en' ? 'AI Translation & Diff Tracking' : 'چاودێری و تۆمارکردنی وەرگێڕانی AI'}</span>
                    <span className="gov-counter-pill blue">{entries.length}</span>
                </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="ai-tracker-toolbar">
                <div className="ai-search-box">
                    <Search size={16} className="search-icon" />
                    <input 
                        type="text" 
                        placeholder={
                            subTab === 'pending'
                                ? (lang === 'en' ? 'Search pending movies by title, genre, author...' : 'گەڕان بەپێی ناوی فیلم، جۆر، ناوی ئەدمین...')
                                : (lang === 'en' ? 'Search by movie title, episode or username...' : 'گەڕان بەپێی ناوی فیلم، ئەڵقە یان ناوی بەکارهێنەر...')
                        } 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                    />
                </div>

                {subTab === 'ai_history' && (
                    <div className="ai-model-filter-pills">
                        <button 
                            className={`model-pill ${selectedModel === 'all' ? 'active' : ''}`}
                            onClick={() => setSelectedModel('all')}
                        >
                            {lang === 'en' ? 'All Models' : 'هەموو مۆدێلەکان'}
                        </button>
                        <button 
                            className={`model-pill ${selectedModel === 'claude' ? 'active' : ''}`}
                            onClick={() => setSelectedModel('claude')}
                        >
                            ✨ Claude
                        </button>
                        <button 
                            className={`model-pill ${selectedModel === 'gemini' ? 'active' : ''}`}
                            onClick={() => setSelectedModel('gemini')}
                        >
                            ⚡ Gemini
                        </button>
                        <button 
                            className={`model-pill ${selectedModel === 'gpt' ? 'active' : ''}`}
                            onClick={() => setSelectedModel('gpt')}
                        >
                            🌟 GPT-4o
                        </button>
                    </div>
                )}

                <button className="btn-refresh-tracker" onClick={handleGlobalRefresh} title={lang === 'en' ? 'Refresh' : 'نوێکردنەوە'}>
                    <RefreshCw size={15} className={loading ? 'spinning' : ''} />
                    <span>{lang === 'en' ? 'Refresh' : 'نوێکردنەوە'}</span>
                </button>
            </div>

            {/* Content View Based on Sub Tab */}
            {subTab === 'pending' ? (
                <div className="pending-approvals-section">
                    {filteredPendingMovies.length === 0 ? (
                        <div className="ai-tracker-empty">
                            <CheckCircle size={48} color="#10b981" />
                            <h3>{lang === 'en' ? 'No pending items!' : 'هیچ کارێکی چاوەڕوانکراو نییە!'}</h3>
                            <p>{lang === 'en' ? 'All movies, series and subtitles have been reviewed and published.' : 'تەواوی بەرهەم و سەبتایتڵەکان پێداچوونەوەیان بۆ کراوە و پەسەند کراون.'}</p>
                        </div>
                    ) : (
                        <div className="approvals-grid">
                            {filteredPendingMovies.map(movie => (
                                <div key={movie.id} className="approval-card">
                                    <div className="approval-card-body">
                                        <div className="approval-poster-wrap">
                                            <img 
                                                src={movie.posterCloudUrl || movie.posterUrl || 'https://placehold.co/150x220/1e293b/white?text=No+Poster'} 
                                                alt={movie.title} 
                                                className="approval-poster" 
                                            />
                                            <span className="approval-poster-badge">
                                                {movie.type === 'series' ? (lang === 'en' ? 'Series' : 'زنجیرە') : movie.type === 'animation' ? (lang === 'en' ? 'Animation' : 'ئەنیمێشن') : (lang === 'en' ? 'Movie' : 'فیلم')}
                                            </span>
                                        </div>

                                        <div className="approval-info">
                                            <div className="approval-title-row">
                                                <h3 title={movie.title}>{movie.title}</h3>
                                            </div>

                                            <div className="approval-meta">
                                                {movie.year && <span className="meta-pill">📅 {movie.year}</span>}
                                                {movie.imdbRating && <span className="meta-pill imdb">⭐ {movie.imdbRating}</span>}
                                                {movie.duration && <span className="meta-pill">⏱️ {movie.duration}</span>}
                                                {movie.genre && <span className="meta-pill genre">🎭 {movie.genre.split('،')[0]}</span>}
                                            </div>

                                            <div className="approval-submitter-box">
                                                <div className="submitter-line">
                                                    <span>{lang === 'en' ? 'Submitted by:' : 'نێردراوە لەلایەن:'}</span>
                                                    <strong className="submitter-name">@{movie.submittedBy?.username || movie.lastEditedBy?.username || (lang === 'en' ? 'Admin' : 'ئەدمین')}</strong>
                                                </div>
                                                <span className="approval-date">
                                                    ⏰ {new Date(movie.submittedBy?.at || movie.lastEditedBy?.at || movie.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'ckb-IQ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            {(lang === 'en' ? (movie.descriptionEn || movie.description) : (movie.descriptionKu || movie.description)) && (
                                                <p className="approval-desc">{lang === 'en' ? (movie.descriptionEn || movie.description) : (movie.descriptionKu || movie.description)}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="approval-card-actions-grid">
                                        {onApproveMovie && (
                                            <button className="btn-appr-action btn-appr-approve" onClick={() => onApproveMovie(movie)}>
                                                <CheckCircle size={15} />
                                                <span>{lang === 'en' ? 'Approve & Publish' : 'پەسەندکردن و بڵاوکردنەوە'}</span>
                                            </button>
                                        )}

                                        <button 
                                            className="btn-appr-action btn-appr-diff" 
                                            onClick={() => openPendingMovieDiff(movie)}
                                            title={lang === 'en' ? "Inspect subtitle translation differences in green and red" : "پشکنینی جیاوازی وەرگێڕانەکان بە سوور و سەوز"}
                                        >
                                            <History size={15} />
                                            <span>{lang === 'en' ? 'Subtitle Diff 📊' : 'جیاوازی سەبتایتڵ 📊'}</span>
                                        </button>

                                        {onEditMovie && (
                                            <button className="btn-appr-action btn-appr-edit" onClick={() => onEditMovie(movie)}>
                                                <Edit3 size={15} />
                                                <span>{lang === 'en' ? 'Inspect & Edit' : 'پشکنین و دەستکاری'}</span>
                                            </button>
                                        )}

                                        {onRejectMovie && (
                                            <button className="btn-appr-action btn-appr-reject" onClick={() => onRejectMovie(movie)}>
                                                <X size={15} />
                                                <span>{lang === 'en' ? 'Reject' : 'ڕەتکردنەوە'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* AI Translation History Grid */
                <>
                    {loading ? (
                        <div className="ai-tracker-loading">
                            <div className="spinner-tracker" />
                            <span>{lang === 'en' ? 'Loading AI translation history...' : 'بارکردنی مێژووی وەرگێڕانەکانی AI...'}</span>
                        </div>
                    ) : filteredGroupedEntries.length === 0 ? (
                        <div className="ai-tracker-empty">
                            <History size={48} color="#64748b" />
                            <h3>{lang === 'en' ? 'No AI translation records found' : 'هیچ تۆمارێکی وەرگێڕانی AI نەدۆزرایەوە'}</h3>
                            <p>{lang === 'en' ? 'Whenever someone translates SRT files with AI, full line-by-line diff snapshots will appear here.' : 'کاتێک ئەدمین یان وەرگێڕەکان ژێرنووس بە AI وەردەگێڕن، تۆماری وردی دێڕ بە دێڕ لێرە دەردەکەوێت.'}</p>
                        </div>
                    ) : (
                        <div className="ai-entries-grid">
                            {filteredGroupedEntries.map(entry => {
                                const dateObj = new Date(entry.latestSavedAt);
                                const formattedDate = dateObj.toLocaleDateString(lang === 'en' ? 'en-US' : 'ckb-IQ', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });

                                return (
                                    <div key={entry.key} className="ai-entry-card">
                                        <div className="entry-card-header">
                                            <div className="entry-movie-info">
                                                {entry.posterUrl ? (
                                                    <img src={entry.posterUrl} alt="" className="entry-poster-thumb" />
                                                ) : (
                                                    <div className="entry-poster-placeholder">
                                                        <Film size={18} />
                                                    </div>
                                                )}
                                                <div>
                                                    <h4 className="entry-movie-title">{entry.movieTitle}</h4>
                                                    <div className="entry-meta-tags">
                                                        <span className="entry-time-pill"><Clock size={11} /> {formattedDate}</span>
                                                        <span className="entry-author-pill"><User size={11} /> {entry.savedBy?.username || 'Admin'}</span>
                                                        {entry.versionsCount > 1 && (
                                                            <span className="entry-versions-badge">
                                                                🔄 {entry.versionsCount} {lang === 'en' ? 'revisions' : 'نوسخە'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="entry-model-badge">
                                                <span>{formatModelName(entry.aiModels[0] || 'AI')}</span>
                                            </div>
                                        </div>

                                        <div className="entry-stats-row">
                                            <div className="entry-stat-item">
                                                <span className="label">{lang === 'en' ? 'Modified' : 'گۆڕدراو'}</span>
                                                <strong className="val mod">📝 {entry.totalLinesChanged} {lang === 'en' ? 'lines' : 'دێڕ'}</strong>
                                            </div>
                                            <div className="entry-stat-item">
                                                <span className="label">{lang === 'en' ? 'Words' : 'وشەی نوێ'}</span>
                                                <strong className="val add">+{entry.totalWordsAdded}</strong>
                                            </div>
                                            <div className="entry-stat-item">
                                                <span className="label">{lang === 'en' ? 'Removed' : 'سڕدراوە'}</span>
                                                <strong className="val rem">-{entry.totalWordsRemoved}</strong>
                                            </div>
                                        </div>

                                        {entry.latestNote && (
                                            <div className="entry-note-box">
                                                💬 {entry.latestNote.replace(/\(anthropic\/[^)]+\)/gi, '').replace(/\(google\/[^)]+\)/gi, '').replace(/\(openai\/[^)]+\)/gi, '').trim()}
                                            </div>
                                        )}

                                        <div className="entry-card-footer">
                                            <button 
                                                className="btn-inspect-diff"
                                                onClick={() => setInspectDiff({
                                                    movieId: entry.movieId,
                                                    movieTitle: entry.movieTitle,
                                                    seasonNum: entry.seasonNum,
                                                    episodeNum: entry.episodeNum,
                                                    historyId: entry.latestHistoryId
                                                })}
                                            >
                                                <ArrowLeftRight size={15} />
                                                <span>{lang === 'en' ? 'Inspect Line-by-Line Diff' : '🔍 پیشاندانی جیاوازی دێڕ بە دێڕ'}</span>
                                                <ChevronRight size={15} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Line-by-line Diff Modal */}
            {inspectDiff && (
                <SubtitleDiffViewer 
                    movieId={inspectDiff.movieId}
                    movieTitle={inspectDiff.movieTitle}
                    seasonNum={inspectDiff.seasonNum}
                    episodeNum={inspectDiff.episodeNum}
                    episodeTitle={inspectDiff.episodeTitle}
                    seasons={inspectDiff.seasons}
                    initialHistoryId={inspectDiff.historyId}
                    onClose={() => setInspectDiff(null)}
                />
            )}
        </div>
    );
}
