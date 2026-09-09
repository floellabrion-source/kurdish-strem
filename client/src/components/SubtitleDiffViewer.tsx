import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api/client';
import {
    X, History, ArrowLeftRight, RotateCcw, CheckCircle, AlertTriangle,
    FileText, User, Calendar, Plus, Trash2, ArrowRight, Loader2,
    Filter, ChevronRight, Sparkles, Check, MessageSquare, Send,
    CornerDownLeft, ShieldAlert, CheckSquare, Square, Layers, Film, ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './SubtitleDiffViewer.css';

interface SubtitleDiffViewerProps {
    movieId: string;
    movieTitle: string;
    seasonNum?: number;
    episodeNum?: number;
    episodeTitle?: string;
    seasons?: any[];
    initialHistoryId?: string;
    onClose: () => void;
    onRestored?: () => void;
}

interface HistorySummary {
    id: string;
    movieId: string;
    seasonNum?: number;
    episodeNum?: number;
    savedAt: string;
    savedBy?: {
        id: string;
        username: string;
        role: string;
    };
    isAi?: boolean;
    aiModel?: string;
    aiTone?: string;
    linesChanged: number;
    wordsAdded: number;
    wordsRemoved: number;
    totalLines: number;
    note?: string;
}

interface WordToken {
    type: 'added' | 'removed' | 'unchanged';
    text: string;
}

interface DiffLine {
    id: number;
    startTime: string;
    endTime: string;
    oldText: string;
    newText: string;
    status: 'modified' | 'added' | 'deleted' | 'unchanged';
    wordDiff: WordToken[];
}

const PRESET_REASONS = [
    { ku: 'هەڵەی ڕێنووس و تایپ (Typo)', en: 'Typo / Spelling Error' },
    { ku: 'وەرگێڕانی ناڕوون یان هەڵە', en: 'Inaccurate or Unclear Translation' },
    { ku: 'دێڕی بەتاڵ یان وەرنەگێڕدراو', en: 'Empty or Untranslated Line' },
    { ku: 'کێشەی کات و هاوکاتکردن (Sync)', en: 'Timing / Sync Issue' },
    { ku: 'ڕێکخستنەوەی ڕستە و دەربڕین', en: 'Grammar & Phrasing Adjustment' }
];

export default function SubtitleDiffViewer({
    movieId,
    movieTitle,
    seasonNum,
    episodeNum,
    episodeTitle,
    seasons,
    initialHistoryId,
    onClose,
    onRestored
}: SubtitleDiffViewerProps) {
    const { user } = useAuth();
    const { lang } = useLanguage();
    const [curSeasonNum, setCurSeasonNum] = useState<number | undefined>(seasonNum);
    const [curEpisodeNum, setCurEpisodeNum] = useState<number | undefined>(episodeNum);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [loadingDiff, setLoadingDiff] = useState(true);
    const [restoring, setRestoring] = useState(false);
    const [historyList, setHistoryList] = useState<HistorySummary[]>([]);
    const [selectedHistoryId, setSelectedHistoryId] = useState<string>(initialHistoryId || '');
    const [diffData, setDiffData] = useState<{
        historyEntry: any;
        stats: { linesChanged: number; wordsAdded: number; wordsRemoved: number; totalLines: number };
        diffLines: DiffLine[];
    } | null>(null);

    const [filterOnlyChanges, setFilterOnlyChanges] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [jumpIndex, setJumpIndex] = useState<number>(0);
    const [toast, setToast] = useState<string | null>(null);

    // Multi-select for line-specific feedback
    const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);
    const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
    const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0].ku);
    const [customComment, setCustomComment] = useState<string>('');
    const [sendingFeedback, setSendingFeedback] = useState<boolean>(false);
    const [filterAiOnly, setFilterAiOnly] = useState<boolean>(false);

    const isSuperAdmin = user?.role === 'super_admin' || user?.username === '1' || user?.username?.toLowerCase() === 'admin';

    const filteredHistoryList = useMemo(() => {
        let list = historyList;
        if (!isSuperAdmin) {
            list = list.filter(h =>
                (h.savedBy?.id && String(h.savedBy.id) === String(user?.id)) ||
                (h.savedBy?.username && h.savedBy.username.toLowerCase() === user?.username?.toLowerCase())
            );
        }
        if (filterAiOnly) {
            list = list.filter(h => h.isAi || h.aiModel || h.note?.includes('AI') || h.note?.includes('زیرەکی'));
        }
        return list;
    }, [historyList, isSuperAdmin, user, filterAiOnly]);

    const showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3500);
    };
    const setToastMsg = (msg: string | null) => setToast(msg);

    // 1. Fetch History Revisions List
    useEffect(() => {
        let isMounted = true;
        const fetchHistory = async () => {
            setLoadingHistory(true);
            setLoadingDiff(true);
            setDiffData(null);
            setSelectedHistoryId('');

            if (curSeasonNum !== undefined && curEpisodeNum === undefined) {
                setHistoryList([]);
                setLoadingHistory(false);
                setLoadingDiff(false);
                return;
            }

            try {
                const res = await axios.get(`/api/admin/movies/${movieId}/subtitle-history`, {
                    params: { seasonNum: curSeasonNum, episodeNum: curEpisodeNum }
                });
                if (!isMounted) return;
                const list = res.data || [];
                setHistoryList(list);
                if (list.length > 0) {
                    const matchInitial = initialHistoryId && list.find((h: any) => h.id === initialHistoryId);
                    setSelectedHistoryId(matchInitial ? initialHistoryId : list[0].id);
                } else {
                    setSelectedHistoryId('');
                    setDiffData(null);
                    setLoadingDiff(false);
                }
            } catch (err) {
                console.error(err);
                if (isMounted) {
                    setHistoryList([]);
                    setSelectedHistoryId('');
                    setDiffData(null);
                    setLoadingDiff(false);
                }
            } finally {
                if (isMounted) setLoadingHistory(false);
            }
        };

        fetchHistory();
        return () => { isMounted = false; };
    }, [movieId, curSeasonNum, curEpisodeNum]);

    // 2. Fetch Diff for the Selected Revision
    useEffect(() => {
        if (!selectedHistoryId) {
            setDiffData(null);
            setLoadingDiff(false);
            return;
        }

        let isMounted = true;
        const fetchDiff = async () => {
            setLoadingDiff(true);
            try {
                const res = await axios.get(`/api/admin/movies/${movieId}/subtitle-diff`, {
                    params: { historyId: selectedHistoryId, seasonNum: curSeasonNum, episodeNum: curEpisodeNum }
                });
                if (isMounted) {
                    setDiffData(res.data);
                    setJumpIndex(0);
                    setSelectedLineIds([]);
                }
            } catch (err) {
                console.error(err);
                if (isMounted) setDiffData(null);
            } finally {
                if (isMounted) setLoadingDiff(false);
            }
        };

        fetchDiff();
        return () => { isMounted = false; };
    }, [selectedHistoryId, movieId]);

    // Handle Approve / Set Version as Active
    const handleRestoreVersion = async (historyId: string) => {
        if (!window.confirm('ئایا دڵنیایت لە پەسەندکردن و چالاککردنی ئەم وەرگێڕانە بۆ بینەران؟')) return;

        setRestoring(true);
        try {
            await axios.post(`/api/admin/movies/${movieId}/subtitle-restore`, {
                historyId,
                seasonNum: curSeasonNum || seasonNum,
                episodeNum: curEpisodeNum || episodeNum
            });
            showToast('ئەم وەرگێڕانە بە سەرکەوتوویی پەسەند کرا و کرا بە سەبتایتڵی سەرەکی ✓');
            if (onRestored) onRestored();
        } catch (err) {
            console.error(err);
            showToast('نەتوانرا وەرگێڕانەکە پەسەند بکرێت');
        } finally {
            setRestoring(false);
        }
    };

    // Toggle select line
    const toggleSelectLine = (id: number) => {
        setSelectedLineIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].sort((a, b) => a - b)
        );
    };

    // Filter Lines
    const displayedLines = useMemo(() => {
        if (!diffData) return [];
        let list = diffData.diffLines;

        if (filterOnlyChanges) {
            list = list.filter(l => l.status !== 'unchanged');
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(l =>
                l.oldText.toLowerCase().includes(q) ||
                l.newText.toLowerCase().includes(q) ||
                l.id.toString().includes(q)
            );
        }

        return list;
    }, [diffData, filterOnlyChanges, searchQuery]);

    // Changed lines for jump button
    const changedLines = useMemo(() => {
        if (!diffData) return [];
        return diffData.diffLines.filter(l => l.status !== 'unchanged');
    }, [diffData]);

    const handleJumpNext = () => {
        if (changedLines.length === 0) return;
        const nextIdx = (jumpIndex + 1) % changedLines.length;
        setJumpIndex(nextIdx);

        const targetLine = changedLines[nextIdx];
        const element = document.getElementById(`diff-row-${targetLine.id}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    // Handle Send Feedback / Rejection
    const handleSendFeedback = async (action: 'notify' | 'reject') => {
        if (selectedLineIds.length === 0) return;

        setSendingFeedback(true);
        try {
            const res = await axios.post(`/api/admin/movies/${movieId}/feedback`, {
                seasonNum,
                episodeNum,
                historyId: selectedHistoryId,
                targetAdminUsername: diffData?.historyEntry?.savedBy?.username,
                lineIds: selectedLineIds,
                reason: selectedReason,
                customNote: customComment.trim(),
                action
            });

            showToast(res.data.message || 'تێبینی بۆ ئەدمینەکە بە سەرکەوتوویی نێردرا ✓');
            setShowFeedbackModal(false);
            setSelectedLineIds([]);
            setCustomComment('');

            if (action === 'reject') {
                setTimeout(() => {
                    if (onRestored) onRestored();
                    onClose();
                }, 1200);
            }
        } catch (err) {
            console.error(err);
            showToast('نەتوانرا تێبینی بنێردرێت');
        } finally {
            setSendingFeedback(false);
        }
    };

    return (
        <div className="diff-modal-backdrop" onClick={onClose}>
            <div 
                className={`diff-modal-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} 
                dir={lang === 'en' ? 'ltr' : 'rtl'}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="diff-modal-header">
                    <div className="diff-header-main-row">
                        <div className="diff-header-title-group">
                            <History size={20} color="#38bdf8" />
                            <h2>{lang === 'en' ? 'Subtitle Diff & History' : 'پشکنەری جیاوازی سەبتایتڵ'}</h2>
                            <span className="diff-movie-title-pill">{movieTitle}</span>
                        </div>

                        <div className="diff-header-right-actions">
                            <button className="btn-diff-close" onClick={onClose} title={lang === 'en' ? "Close" : "داخستن"}>
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Season & Episode Dropdowns (for Series) */}
                    {seasons && seasons.length > 0 ? (() => {
                        const currentSeasonObj = seasons.find(x => x.number === (curSeasonNum || seasons[0]?.number || 1));
                        const currentSeasonEpisodes = currentSeasonObj?.episodes || [];

                        return (
                            <div className="diff-season-ep-dropdown-wrap">
                                <div className="diff-select-group">
                                    <Layers size={13} className="diff-select-icon" />
                                    <select
                                        value={curSeasonNum || seasons[0]?.number || 1}
                                        onChange={e => {
                                            const s = parseInt(e.target.value, 10);
                                            setCurSeasonNum(s);
                                            const sObj = seasons.find(x => x.number === s);
                                            const epList = sObj?.episodes || [];
                                            setCurEpisodeNum(epList.length > 0 ? epList[0].number : undefined);
                                            setSelectedHistoryId('');
                                            setDiffData(null);
                                        }}
                                        className="diff-styled-select"
                                    >
                                        {seasons.map((s: any) => (
                                            <option key={s.number} value={s.number}>{lang === 'en' ? `Season ${s.number}` : `وەرز ${s.number}`} {s.episodes && s.episodes.length === 0 ? (lang === 'en' ? '(Empty)' : '(بەتاڵ)') : ''}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={13} className="diff-select-arrow" />
                                </div>
                                <div className="diff-select-group">
                                    <Film size={13} className="diff-select-icon" />
                                    <select
                                        value={curEpisodeNum !== undefined ? curEpisodeNum : ''}
                                        onChange={e => setCurEpisodeNum(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                        className="diff-styled-select"
                                        disabled={currentSeasonEpisodes.length === 0}
                                    >
                                        {currentSeasonEpisodes.length === 0 ? (
                                            <option value="">{lang === 'en' ? '(No episodes)' : '(هیچ ئەڵقەیەک نییە)'}</option>
                                        ) : (
                                            currentSeasonEpisodes.map((ep: any) => (
                                                <option key={ep.number} value={ep.number}>{lang === 'en' ? `Episode ${ep.number}` : `ئەڵقەی ${ep.number}`} {ep.title ? `- ${ep.title}` : ''}</option>
                                            ))
                                        )}
                                    </select>
                                    <ChevronDown size={13} className="diff-select-arrow" />
                                </div>
                            </div>
                        );
                    })() : (
                        curSeasonNum && curEpisodeNum && (
                            <div className="diff-sub-badge-row">
                                <span className="diff-sub-badge">
                                    {lang === 'en' ? `Season ${curSeasonNum} - Episode ${curEpisodeNum}` : `سیزنی ${curSeasonNum} - ئەڵقەی ${curEpisodeNum}`} {episodeTitle ? `(${episodeTitle})` : ''}
                                </span>
                            </div>
                        )
                    )}

                    {/* Approve & Activate Version Action (Super Admin) */}
                    {selectedHistoryId && user?.role === 'super_admin' && (
                        <div className="diff-header-approve-row">
                            <button
                                className="btn-diff-approve-version"
                                disabled={restoring}
                                onClick={() => handleRestoreVersion(selectedHistoryId)}
                                title={lang === 'en' ? "Approve and set this subtitle as the official version" : "پەسەندکردن و دانانی ئەم وەرگێڕانە وەک سەبتایتڵی سەرەکی بۆ بینەران"}
                            >
                                {restoring ? <Loader2 size={15} className="spinning" /> : <CheckCircle size={15} />}
                                <span>
                                    {(() => {
                                        const idx = historyList.findIndex(h => h.id === selectedHistoryId);
                                        const vNum = idx !== -1 ? historyList.length - idx : null;
                                        if (lang === 'en') {
                                            return vNum ? `Approve & Activate (#${vNum})` : 'Approve & Activate Version';
                                        }
                                        return vNum ? `پەسەندکردن و چالاککردنی ئەم وەرگێڕانە (نوسخەی #${vNum})` : 'پەسەندکردن و چالاککردنی ئەم وەرگێڕانە';
                                    })()}
                                </span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Toast message */}
                {toast && (
                    <div className="diff-toast-banner">
                        <CheckCircle size={16} color="#10b981" />
                        <span>{toast}</span>
                    </div>
                )}

                {/* Main Body: Revisions Sidebar + Comparison View */}
                <div className="diff-modal-body">
                    {/* Left Sidebar: Revisions Timeline */}
                    <div className="diff-sidebar">
                        <div className="diff-sidebar-header">
                            <History size={16} color="#38bdf8" />
                            <span>
                                {lang === 'en' 
                                    ? (isSuperAdmin ? `Revision History (${filteredHistoryList.length})` : `My Revision History (${filteredHistoryList.length})`)
                                    : (isSuperAdmin ? `مێژووی دەستکارییەکان (${filteredHistoryList.length})` : `مێژووی دەستکارییەکانی من (${filteredHistoryList.length})`)}
                            </span>
                        </div>

                        {/* AI / All Filter Tabs */}
                        <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', background: 'rgba(0, 0, 0, 0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <button
                                type="button"
                                onClick={() => setFilterAiOnly(false)}
                                style={{
                                    flex: 1,
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    background: !filterAiOnly ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                    color: !filterAiOnly ? '#38bdf8' : '#94a3b8',
                                    border: !filterAiOnly ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {lang === 'en' ? 'All Versions' : 'هەموو نوسخەکان'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilterAiOnly(true)}
                                style={{
                                    flex: 1,
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    background: filterAiOnly ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                                    color: filterAiOnly ? '#d8b4fe' : '#94a3b8',
                                    border: filterAiOnly ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Sparkles size={11} color={filterAiOnly ? '#c084fc' : '#94a3b8'} />
                                {lang === 'en' ? 'AI Only' : 'تەنها AI'}
                            </button>
                        </div>

                        {loadingHistory ? (
                            <div className="diff-sidebar-loading">
                                <Loader2 size={24} className="spinning" />
                                <span>{lang === 'en' ? 'Loading history...' : 'بارکردنی مێژوو...'}</span>
                            </div>
                        ) : filteredHistoryList.length === 0 ? (
                            <div className="diff-sidebar-empty">
                                <FileText size={32} color="#64748b" />
                                <p>{lang === 'en' ? 'No revisions recorded yet.' : (isSuperAdmin ? 'هیچ مێژوویەکی دەستکاری تۆمار نەکراوە.' : 'هیچ مێژوویەکی دەستکاری بۆ تۆ لەم بەرهەمەدا نییە.')}</p>
                                <span className="diff-empty-subtext">
                                    {lang === 'en' 
                                        ? 'When subtitles are edited and saved, revision snapshots will appear here.' 
                                        : (isSuperAdmin ? 'کاتێک لە سەبتایتڵ ئیدیتۆر دەستکاریی دەکرێت، مێژووەکان لێرە تۆمار دەبن.' : 'کاتێک تۆ لە سەبتایتڵ ئیدیتۆر دەستکاریی دەکەیت، نوسخەکانی خۆت لێرە دەبینیت.')}
                                </span>
                            </div>
                        ) : (
                            <div className="diff-history-list">
                                {filteredHistoryList.map((h, i) => {
                                    const isSelected = h.id === selectedHistoryId;
                                    const isAiRev = Boolean(h.isAi || h.aiModel || h.note?.includes('AI') || h.note?.includes('زیرەکی'));
                                    const dateObj = new Date(h.savedAt);
                                    const formattedDate = dateObj.toLocaleDateString(lang === 'en' ? 'en-US' : 'ckb-IQ', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });

                                    return (
                                        <div
                                            key={h.id}
                                            className={`history-item-card ${isSelected ? 'active' : ''}`}
                                            onClick={() => setSelectedHistoryId(h.id)}
                                        >
                                            <div className="history-item-top">
                                                <span className="history-rev-tag">{lang === 'en' ? `Version #${filteredHistoryList.length - i}` : `نوسخەی #${filteredHistoryList.length - i}`}</span>
                                                <span className="history-time-tag">{formattedDate}</span>
                                            </div>

                                            {isAiRev && (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', margin: '4px 0' }}>
                                                    <Sparkles size={11} color="#a855f7" />
                                                    <span>{h.aiModel || 'AI Translation'}</span>
                                                </div>
                                            )}

                                            <div className="history-author-row">
                                                <User size={13} color="#38bdf8" />
                                                <span>
                                                    {lang === 'en' ? 'By:' : 'لەلایەن:'} <strong>{h.savedBy?.username || (lang === 'en' ? 'Admin' : 'ئەدمین')}</strong> ({h.savedBy?.role === 'super_admin' ? (lang === 'en' ? 'Super Admin' : 'بەڕێوەبەر') : (lang === 'en' ? 'Admin' : 'ئەدمین')})
                                                </span>
                                            </div>

                                            <div className="history-stats-pills">
                                                <span className="stat-pill modified">📝 {h.linesChanged} {lang === 'en' ? 'lines' : 'دێڕ'}</span>
                                                <span className="stat-pill added">+{h.wordsAdded} {lang === 'en' ? 'words' : 'وشە'}</span>
                                                <span className="stat-pill removed">-{h.wordsRemoved} {lang === 'en' ? 'words' : 'وشە'}</span>
                                            </div>

                                            {h.note && (
                                                <div className="history-note-text">
                                                    💬 {h.note}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Right Area: Diff Stats & Line by Line Comparator */}
                    <div className="diff-content-area">
                        {loadingDiff ? (
                            <div className="diff-main-loading">
                                <Loader2 size={36} className="spinning" />
                                <span>{lang === 'en' ? 'Preparing diff comparator...' : 'ئامادەکردنی بینەری جیاوازییەکان...'}</span>
                            </div>
                        ) : !diffData ? (
                            <div className="diff-main-empty">
                                <History size={48} color="#38bdf8" style={{ marginBottom: '12px', opacity: 0.8 }} />
                                <h3>{lang === 'en' ? 'No revisions found' : 'هیچ مێژوویەکی دەستکاری تۆمار نەکراوە'}</h3>
                                <p style={{ color: '#94a3b8', fontSize: '13px', maxWidth: '440px', textAlign: 'center', lineHeight: '1.6', marginTop: '8px' }}>
                                    {lang === 'en' 
                                        ? 'When subtitles are edited in the subtitle editor, revision snapshots will appear here with green and red diff highlights.' 
                                        : 'کاتێک لە بەشی Dual Editor یان لە کاتی وەرگێڕاندا دەستکاریی دێڕەکانی سەبتایتڵەکە بکەیت و پاشەکەوتی بکەیت، نوسخەی پێشوو و نوێ لێرە تۆمار دەکرێن و هەموو جیاوازییەکان بە ڕەنگی سەوز و سوور دەردەکەون.'}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Mobile Revision Dropdown Selector */}
                                {historyList.length > 0 && (
                                    <div className="diff-mobile-rev-bar">
                                        <label className="mobile-rev-label">
                                            <History size={15} color="#38bdf8" />
                                            <span>{lang === 'en' ? `Revisions (${historyList.length}):` : `نوسخەی دەستکاری (${historyList.length}):`}</span>
                                        </label>
                                        <select 
                                            value={selectedHistoryId} 
                                            onChange={e => setSelectedHistoryId(e.target.value)}
                                            className="mobile-rev-select"
                                        >
                                            {historyList.map((h, i) => (
                                                <option key={h.id} value={h.id}>
                                                    {lang === 'en' ? `Version #${historyList.length - i}` : `نوسخەی #${historyList.length - i}`} • {h.savedBy?.username || (lang === 'en' ? 'Admin' : 'ئەدمین')} ({h.linesChanged} {lang === 'en' ? 'lines' : 'دێڕ'})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Top Stats Cards Banner */}
                                <div className="diff-stats-banner">
                                    <div className="diff-stat-card lines-changed">
                                        <div className="stat-card-title">{lang === 'en' ? 'Lines Changed' : 'دێڕە دەستکاریکراوەکان'}</div>
                                        <div className="stat-card-val">{diffData.stats.linesChanged} <span className="stat-total-label">{lang === 'en' ? `of ${diffData.stats.totalLines}` : `لە ${diffData.stats.totalLines}`}</span></div>
                                    </div>
                                    <div className="diff-stat-card words-added">
                                        <div className="stat-card-title">{lang === 'en' ? 'Words Added (+)' : 'وشە نوێیەکان (زیادکراو)'}</div>
                                        <div className="stat-card-val">+{diffData.stats.wordsAdded} <span className="stat-unit">{lang === 'en' ? 'words' : 'وشە'}</span></div>
                                    </div>
                                    <div className="diff-stat-card words-removed">
                                        <div className="stat-card-title">{lang === 'en' ? 'Words Removed (-)' : 'وشە سڕدراوەکان'}</div>
                                        <div className="stat-card-val">-{diffData.stats.wordsRemoved} <span className="stat-unit">{lang === 'en' ? 'words' : 'وشە'}</span></div>
                                    </div>
                                    <div className="diff-stat-card author-info">
                                        <div className="stat-card-title">{lang === 'en' ? 'Edited By' : 'دەستکاریکراوە لەلایەن'}</div>
                                        <div className="stat-card-author">{diffData.historyEntry?.savedBy?.username || (lang === 'en' ? 'Admin' : 'ئەدمین')}</div>
                                    </div>
                                </div>

                                {/* Control & Filter Toolbar */}
                                <div className="diff-toolbar">
                                    <div className="diff-toolbar-left">
                                        <input
                                            type="text"
                                            placeholder={lang === 'en' ? "Search in old or new text..." : "بگەڕێ لە ناو دەقە کۆن یان نوێیەکان..."}
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="diff-search-input"
                                        />
                                    </div>

                                    <div className="diff-toolbar-right">
                                        <button
                                            className={`diff-filter-btn ${filterOnlyChanges ? 'active' : ''}`}
                                            onClick={() => setFilterOnlyChanges(!filterOnlyChanges)}
                                        >
                                            <Filter size={13} />
                                            {lang === 'en' 
                                                ? (filterOnlyChanges ? 'Show Only Changes' : 'Show All Lines')
                                                : (filterOnlyChanges ? 'پیشاندانی تەنها گۆڕانکارییەکان' : 'پیشاندانی هەموو دێڕەکان')}
                                        </button>

                                        {changedLines.length > 0 && (
                                            <button className="diff-jump-btn" onClick={handleJumpNext}>
                                                {lang === 'en' ? `Next Change ⏩ (${jumpIndex + 1}/${changedLines.length})` : `بڕۆ بۆ گۆڕانکاری دواتر ⏩ (${jumpIndex + 1}/${changedLines.length})`}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Floating Selection Action Bar when lines are selected - Super Admin ONLY */}
                                {isSuperAdmin && selectedLineIds.length > 0 && (
                                    <div className="diff-selection-bar">
                                        <div className="selection-bar-info">
                                            <CheckSquare size={18} color="#a855f7" />
                                            <span>
                                                <strong>{selectedLineIds.length} {lang === 'en' ? 'lines' : 'دێڕ'}</strong> {lang === 'en' ? 'selected:' : 'هەڵبژێردراون:'}
                                                <span className="selected-lines-chips">
                                                    ({selectedLineIds.join(', ')})
                                                </span>
                                            </span>
                                        </div>

                                        <div className="selection-bar-actions">
                                            <button
                                                className="btn-send-feedback-trigger"
                                                onClick={() => setShowFeedbackModal(true)}
                                            >
                                                <MessageSquare size={15} />
                                                {lang === 'en' ? 'Send Feedback to Admin 💬' : 'ناردنی تێبینی و ڕێنمایی بۆ ئەدمین 💬'}
                                            </button>

                                            <button
                                                className="btn-clear-selection"
                                                onClick={() => setSelectedLineIds([])}
                                            >
                                                ✕ {lang === 'en' ? 'Clear' : 'لابردن'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Line by Line Diff Table */}
                                <div className={`diff-table-container ${!isSuperAdmin ? 'no-admin-select' : ''}`}>
                                    <div className="diff-table-header">
                                        {isSuperAdmin && (
                                            <div className="dth-col dth-select">
                                                <span style={{ fontSize: '10px' }}>{lang === 'en' ? 'Select' : 'دیاریکردن'}</span>
                                            </div>
                                        )}
                                        <div className="dth-col dth-num">#</div>
                                        <div className="dth-col dth-time">{lang === 'en' ? 'Timecodes' : 'کاتەکان'}</div>
                                        <div className="dth-col dth-old">{lang === 'en' ? '🔴 Old Version' : '🔴 دەقی پێشوو (Old Version)'}</div>
                                        <div className="dth-col dth-new">{lang === 'en' ? '🟢 New Version (Edited)' : '🟢 دەقی نوێی دەستکاریکراو (New Version)'}</div>
                                    </div>

                                    <div className="diff-table-body">
                                        {displayedLines.length === 0 ? (
                                            <div className="diff-no-rows">
                                                <CheckCircle size={32} color="#10b981" />
                                                <h4>{lang === 'en' ? 'No differences found' : 'هیچ جیاوازییەک نەدۆزرایەوە'}</h4>
                                                <p>{lang === 'en' ? 'All lines in this view are identical.' : 'تەواوی دێڕەکان لەم فلتەرەدا هاوشێوەن و هیچ گۆڕانکارییەک نییە.'}</p>
                                            </div>
                                        ) : (
                                            displayedLines.map(line => {
                                                const isModified = line.status === 'modified';
                                                const isAdded = line.status === 'added';
                                                const isDeleted = line.status === 'deleted';
                                                const isSelected = selectedLineIds.includes(line.id);

                                                return (
                                                    <div
                                                        key={line.id}
                                                        id={`diff-row-${line.id}`}
                                                        className={`diff-row ${line.status} ${isSelected ? 'row-selected' : ''}`}
                                                        onClick={() => isSuperAdmin && toggleSelectLine(line.id)}
                                                    >
                                                        {/* Checkbox column - Super Admin Only */}
                                                        {isSuperAdmin && (
                                                            <div className="dtb-col dtb-select" onClick={e => e.stopPropagation()}>
                                                                <button
                                                                    className={`btn-line-checkbox ${isSelected ? 'checked' : ''}`}
                                                                    onClick={() => toggleSelectLine(line.id)}
                                                                    title={lang === 'en' ? "Select this line for feedback" : "هەڵبژاردنی ئەم دێڕە بۆ ناردنی تێبینی"}
                                                                >
                                                                    {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Line ID */}
                                                        <div className="dtb-col dtb-num">
                                                            <span className="diff-id-badge">{line.id}</span>
                                                        </div>

                                                        {/* Timestamps */}
                                                        <div className="dtb-col dtb-time">
                                                            <span>{line.startTime}</span>
                                                            <span className="time-arrow">↓</span>
                                                            <span>{line.endTime}</span>
                                                        </div>

                                                        {/* Old Subtitle Text */}
                                                        <div className="dtb-col dtb-old">
                                                            {isAdded ? (
                                                                <span className="diff-empty-placeholder">{lang === 'en' ? '(New line added in this version)' : '(دێڕی نوێیە لەم نوسخەیە)'}</span>
                                                            ) : (
                                                                <div className="diff-text-content">
                                                                    {isModified ? (
                                                                        line.wordDiff.map((token, tIdx) => {
                                                                            if (token.type === 'removed') {
                                                                                return <span key={tIdx} className="diff-word-removed">{token.text}</span>;
                                                                            }
                                                                            if (token.type === 'unchanged') {
                                                                                return <span key={tIdx}>{token.text}</span>;
                                                                            }
                                                                            return null;
                                                                        })
                                                                    ) : (
                                                                        <span>{line.oldText || (lang === 'en' ? '(Empty)' : '(بەتاڵ)')}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* New Subtitle Text */}
                                                        <div className="dtb-col dtb-new">
                                                            {isDeleted ? (
                                                                <span className="diff-empty-placeholder">{lang === 'en' ? '(Deleted)' : '(سڕدراوەتەوە)'}</span>
                                                            ) : (
                                                                <div className="diff-text-content">
                                                                    {isModified ? (
                                                                        line.wordDiff.map((token, tIdx) => {
                                                                            if (token.type === 'added') {
                                                                                return <span key={tIdx} className="diff-word-added">{token.text}</span>;
                                                                            }
                                                                            if (token.type === 'unchanged') {
                                                                                return <span key={tIdx}>{token.text}</span>;
                                                                            }
                                                                            return null;
                                                                        })
                                                                    ) : (
                                                                        <span>{line.newText || (lang === 'en' ? '(Empty)' : '(بەتاڵ)')}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Send Line Feedback Modal */}
                {showFeedbackModal && (
                    <div className="feedback-modal-overlay" onClick={() => setShowFeedbackModal(false)}>
                        <div className="feedback-modal-card" onClick={e => e.stopPropagation()}>
                            <div className="feedback-card-header">
                                <div className="fb-header-title">
                                    <MessageSquare size={20} color="#a855f7" />
                                    <h3>{lang === 'en' ? 'Send Feedback / Instructions to Admin' : 'ناردنی تێبینی و ڕێنمایی بۆ ئەدمین'}</h3>
                                </div>
                                <button className="btn-close-submodal" onClick={() => setShowFeedbackModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="feedback-card-body">
                                <div className="feedback-lines-badge-row">
                                    <span className="fb-label">{lang === 'en' ? 'Translator Admin:' : 'ئەدمینی وەرگێڕ:'}</span>
                                    <span style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.4)', color: '#7dd3fc', padding: '2px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                                        👤 {diffData?.historyEntry?.savedBy?.username || (lang === 'en' ? 'Admin' : 'ئەدمین')}
                                    </span>
                                </div>

                                <div className="feedback-lines-badge-row">
                                    <span className="fb-label">{lang === 'en' ? 'Selected Lines:' : 'دێڕە دیاریکراوەکان:'}</span>
                                    <div className="fb-lines-tags">
                                        {selectedLineIds.map(id => (
                                            <span key={id} className="fb-line-tag">{lang === 'en' ? `Line ${id}` : `دێڕی ${id}`}</span>
                                        ))}
                                    </div>
                                </div>

                                <div className="feedback-presets-group">
                                    <label className="fb-field-label">{lang === 'en' ? 'Select Primary Reason:' : 'هۆکاری سەرەکی هەڵبژێرە:'}</label>
                                    <div className="preset-reasons-grid">
                                        {PRESET_REASONS.map(r => {
                                            const rText = lang === 'en' ? r.en : r.ku;
                                            return (
                                                <button
                                                    key={r.ku}
                                                    type="button"
                                                    className={`preset-reason-btn ${selectedReason === r.ku ? 'active' : ''}`}
                                                    onClick={() => setSelectedReason(r.ku)}
                                                >
                                                    {rText}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="feedback-input-group">
                                    <label className="fb-field-label">{lang === 'en' ? 'Additional Notes & Correction Suggestions (Optional):' : 'تێبینی زیاتر و شێوازی چاککردن (ئارەزوومەندانە):'}</label>
                                    <textarea
                                        className="fb-textarea"
                                        placeholder={lang === 'en' ? "e.g. Line 30 has a typo, or Line 150 phrasing needs refinement..." : "بۆ نموونە: دێڕی ٣٠ پیتێکی زیادەی تێدایە، یان دێڕی ١٥٠ دەربڕینەکەی ڕێکخەرەوە..."}
                                        rows={3}
                                        value={customComment}
                                        onChange={e => setCustomComment(e.target.value)}
                                    />
                                </div>

                                <div className="feedback-actions-row">
                                    <button
                                        className="btn-send-notify"
                                        disabled={sendingFeedback}
                                        onClick={() => handleSendFeedback('notify')}
                                    >
                                        {sendingFeedback ? <Loader2 size={16} className="spinning" /> : <Send size={16} />}
                                        {lang === 'en' ? 'Send Feedback to Admin (Notify) 💬' : 'ناردنی تێبینی بۆ ئەدمین (Notify) 💬'}
                                    </button>

                                    <button
                                        className="btn-send-reject"
                                        disabled={sendingFeedback}
                                        onClick={() => handleSendFeedback('reject')}
                                        title={lang === 'en' ? "Reject movie and send back to draft with this feedback" : "ڕەتکردنەوەی کارەکە و گەڕاندنەوە بۆ دۆخی ڕەشنووس لەگەڵ ئەم تێبینییە"}
                                    >
                                        <ShieldAlert size={16} />
                                        {lang === 'en' ? 'Reject with this Feedback ❌' : 'ڕەتکردنەوە لەگەڵ ئەم تێبینییە ❌'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
