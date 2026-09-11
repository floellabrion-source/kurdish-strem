import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from '../api/client';
import {
    X, Save, Play, Pause, RotateCcw, RotateCw, Plus, Trash2,
    Sparkles, Loader2, Languages, Video, FileText, CheckCircle, Clock,
    FastForward, Rewind, SlidersHorizontal, ArrowDownCircle, Check, Search,
    AlertTriangle, ArrowRight, ListFilter, Sliders, Upload, Eye, EyeOff, Link as LinkIcon,
    History, ShieldAlert, MessageSquare, Unlock, BookOpen, ShieldCheck, Shield
} from 'lucide-react';
import SubtitleDiffViewer from './SubtitleDiffViewer';
import InternalNotesModal from './InternalNotesModal';
import SubtitleQcModal from './SubtitleQcModal';
import { runSubtitleQc } from '../utils/subtitleQc';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
import './DualSrtVideoEditor.css';

interface SubtitleLine {
    id: number;
    startTime: string;
    endTime: string;
    startSec: number;
    endSec: number;
    english: string;
    kurdish: string;
}

interface DualSrtVideoEditorProps {
    movieId: string;
    movieTitle: string;
    seasonNum?: number;
    episodeNum?: number;
    episodeTitle?: string;
    videoUrl?: string;
    onClose: () => void;
    onSaved?: () => void;
}

const timeStringToSec = (t: string): number => {
    if (!t) return 0;
    const parts = t.trim().split(':');
    if (parts.length < 3) return 0;
    const [h, m] = parts;
    const [s, ms] = (parts[2] || '').split(',');
    return (+h || 0) * 3600 + (+m || 0) * 60 + (+s || 0) + (+ms || 0) / 1000;
};

const secToTimeString = (sec: number): string => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

const parseSrtText = (raw: string): { id: number; startTime: string; endTime: string; startSec: number; endSec: number; text: string }[] => {
    if (!raw) return [];
    const clean = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = clean.split(/\n\s*\n/);
    const result: any[] = [];

    blocks.forEach((b, idx) => {
        const lines = b.trim().split('\n');
        if (lines.length < 2) return;
        const timeMatch = (lines[1] || '').match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
        if (!timeMatch) return;
        const startTime = timeMatch[1];
        const endTime = timeMatch[2];
        const text = lines.slice(2).join('\n');
        result.push({
            id: parseInt(lines[0], 10) || (idx + 1),
            startTime,
            endTime,
            startSec: timeStringToSec(startTime),
            endSec: timeStringToSec(endTime),
            text
        });
    });
    return result;
};

// Smart subtitle alignment function: Matches Kurdish blocks to English reference by ID & Timestamp
const matchKurdishToEnglish = (
    parsedOrig: { id: number; startTime: string; endTime: string; startSec: number; endSec: number; text: string }[],
    parsedTrans: { id: number; startTime: string; endTime: string; startSec: number; endSec: number; text: string }[]
): SubtitleLine[] => {
    if (parsedOrig.length === 0 && parsedTrans.length > 0) {
        return parsedTrans.map((t, idx) => ({
            id: idx + 1,
            startTime: t.startTime,
            endTime: t.endTime,
            startSec: t.startSec,
            endSec: t.endSec,
            english: '',
            kurdish: t.text
        }));
    }

    if (parsedOrig.length === 0 && parsedTrans.length === 0) {
        return [{
            id: 1,
            startTime: '00:00:01,000',
            endTime: '00:00:04,000',
            startSec: 1,
            endSec: 4,
            english: '',
            kurdish: ''
        }];
    }

    const matchedTransIndices = new Set<number>();
    const merged: SubtitleLine[] = [];

    parsedOrig.forEach((orig, idx) => {
        let matchedKurdish = '';

        // 1. Direct ID or position index match (preferred)
        const idMatchIdx = parsedTrans.findIndex((t, tIdx) =>
            !matchedTransIndices.has(tIdx) &&
            t.id === orig.id
        );

        if (idMatchIdx !== -1) {
            matchedKurdish = parsedTrans[idMatchIdx].text;
            matchedTransIndices.add(idMatchIdx);
        } else if (parsedTrans[idx] && !matchedTransIndices.has(idx) && Math.abs(parsedTrans[idx].startSec - orig.startSec) < 5.0) {
            matchedKurdish = parsedTrans[idx].text;
            matchedTransIndices.add(idx);
        } else {
            // 2. Match by timestamp overlap (within 2.5s)
            const timeMatchIdx = parsedTrans.findIndex((t, tIdx) =>
                !matchedTransIndices.has(tIdx) &&
                Math.abs(t.startSec - orig.startSec) <= 2.5
            );
            if (timeMatchIdx !== -1) {
                matchedKurdish = parsedTrans[timeMatchIdx].text;
                matchedTransIndices.add(timeMatchIdx);
            }
        }

        merged.push({
            id: idx + 1,
            startTime: orig.startTime,
            endTime: orig.endTime,
            startSec: orig.startSec,
            endSec: orig.endSec,
            english: orig.text,
            kurdish: matchedKurdish
        });
    });

    return merged;
};

export default function DualSrtVideoEditor({
    movieId,
    movieTitle,
    seasonNum,
    episodeNum,
    episodeTitle,
    videoUrl,
    onClose,
    onSaved
}: DualSrtVideoEditorProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [translatingAll, setTranslatingAll] = useState(false);
    const [translatingLine, setTranslatingLine] = useState<number | null>(null);
    const [lines, setLines] = useState<SubtitleLine[]>([]);
    const [activeLineId, setActiveLineId] = useState<number | null>(null);
    const [selectedLineId, setSelectedLineId] = useState<number>(1);
    const [customShiftSec, setCustomShiftSec] = useState<string>('1.0');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterMode, setFilterMode] = useState<'all' | 'empty' | 'translated' | 'flagged' | 'sensitive'>('all');
    const [emptyFilterIds, setEmptyFilterIds] = useState<number[] | null>(null);
    const [emptyNavIndex, setEmptyNavIndex] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [flaggedLineIds, setFlaggedLineIds] = useState<number[]>([]);
    
    // Inappropriate / Mature Scenes (Family Mode) State
    const [sensitiveScenes, setSensitiveScenes] = useState<{ start: number, end: number }[]>([]);
    const [showSensitiveModal, setShowSensitiveModal] = useState<boolean>(false);
    const [recordingSensitiveStart, setRecordingSensitiveStart] = useState<number | null>(null);
    const [manualStartStr, setManualStartStr] = useState<string>('');
    const [manualEndStr, setManualEndStr] = useState<string>('');

    // Translation Progress & Pause State
    const [translateAllProgress, setTranslateAllProgress] = useState<{ status: 'running' | 'paused' | 'done', percent: number } | null>(null);
    const [aiUsedInSession, setAiUsedInSession] = useState<boolean>(false);
    const editorPauseRef = useRef<boolean>(false);

    // Video toggle & Local Video State
    const [localVideoUrl, setLocalVideoUrl] = useState<string>('');
    const [showVideoPanel, setShowVideoPanel] = useState<boolean>(!!videoUrl);

    // Shift toolbar toggle state (default collapsed to save maximum vertical space for lines)
    const [showShiftToolbar, setShowShiftToolbar] = useState<boolean>(false);

    const { user } = useAuth();
    const { lang } = useLanguage();
    const [mobileTab, setMobileTab] = useState<'editor' | 'video'>('editor');
    const [showDiffViewer, setShowDiffViewer] = useState<boolean>(false);
    const [showNotesModal, setShowNotesModal] = useState<boolean>(false);
    const [lockState, setLockState] = useState<{
        locked: boolean;
        isSelf: boolean;
        lockedBy?: { id: string; username: string; role: string; lockedAt: number };
    } | null>(null);

    // Team Glossary state (Show-specific + Global)
    const [glossary, setGlossary] = useState<any[]>([]);
    const [showGlossaryDrawer, setShowGlossaryDrawer] = useState<boolean>(false);
    const [glossarySearch, setGlossarySearch] = useState<string>('');
    const [glossaryTab, setGlossaryTab] = useState<'show' | 'global' | 'all'>('show');
    const [newTermEn, setNewTermEn] = useState<string>('');
    const [newTermKu, setNewTermKu] = useState<string>('');
    const [newTermScope, setNewTermScope] = useState<'show' | 'global'>('show');
    const [addingTerm, setAddingTerm] = useState<boolean>(false);

    // AI Line Suggestions State (3 creative options)
    const [lineSuggestions, setLineSuggestions] = useState<{
        lineId: number;
        options: string[];
    } | null>(null);

    // Automated Subtitle QC State
    const [showQcModal, setShowQcModal] = useState<boolean>(false);

    // Live Subtitle QC Report
    const qcReport = useMemo(() => {
        return runSubtitleQc(lines);
    }, [lines]);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const linesContainerRef = useRef<HTMLDivElement | null>(null);
    const origFileInputRef = useRef<HTMLInputElement | null>(null);
    const transFileInputRef = useRef<HTMLInputElement | null>(null);
    const localVideoInputRef = useRef<HTMLInputElement | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const jumpToLine = (targetLineId: number) => {
        setSelectedLineId(targetLineId);
        setActiveLineId(targetLineId);
        setFilterMode('all');
        setSearchQuery('');
        setTimeout(() => {
            const rowEl = document.getElementById(`sub-row-${targetLineId}`);
            if (rowEl) {
                rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 150);
    };

    const { lastEvent } = useWebSocket();

    // Listen to Real-time WebSocket lock updates
    useEffect(() => {
        if (!lastEvent) return;
        if (lastEvent.event === 'SUBTITLE_LOCK_UPDATE') {
            const { movieId: targetId, seasonNum: targetSeason, episodeNum: targetEp, action, lockedBy } = lastEvent.payload || {};
            if (targetId === movieId && targetSeason === seasonNum && targetEp === episodeNum) {
                if (action === 'release' || action === 'force_unlock') {
                    setLockState({ locked: false, isSelf: true });
                } else if (lockedBy) {
                    const isSelf = lockedBy.id === user?.id;
                    setLockState({
                        locked: !isSelf,
                        isSelf,
                        lockedBy
                    });
                }
            }
        }
    }, [lastEvent, movieId, seasonNum, episodeNum, user?.id]);

    // Editing Lock: Acquire lock & maintain heartbeat every 15s
    useEffect(() => {
        const acquireLock = async () => {
            try {
                const res = await axios.post(`/api/admin/movies/${movieId}/lock`, {
                    seasonNum,
                    episodeNum,
                    action: 'acquire'
                });
                setLockState(res.data);
            } catch (err) {
                console.error(err);
            }
        };

        acquireLock();

        const heartbeatTimer = setInterval(async () => {
            try {
                const res = await axios.post(`/api/admin/movies/${movieId}/lock`, {
                    seasonNum,
                    episodeNum,
                    action: 'heartbeat'
                });
                setLockState(res.data);
            } catch (err) {
                console.error(err);
            }
        }, 15000);

        return () => {
            clearInterval(heartbeatTimer);
            axios.post(`/api/admin/movies/${movieId}/lock`, {
                seasonNum,
                episodeNum,
                action: 'release'
            }).catch(() => {});
        };
    }, [movieId, seasonNum, episodeNum]);

    // Load team glossary (Show-Specific + Global)
    useEffect(() => {
        axios.get('/api/glossary', { params: { movieId } })
            .then(res => {
                if (Array.isArray(res.data)) {
                    setGlossary(res.data);
                }
            })
            .catch(err => console.error('Failed to load glossary in editor:', err));
    }, [movieId]);

    // Quick add new term to glossary from inside the editor
    const handleAddQuickTerm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTermEn.trim() || !newTermKu.trim()) {
            showToast('تکایە هەردوو وشەی ئینگلیزی و کوردی بنووسە', 'error');
            return;
        }
        setAddingTerm(true);
        try {
            const isShowScope = newTermScope === 'show' && movieId;
            const payload = {
                english: newTermEn.trim(),
                kurdish: newTermKu.trim(),
                movieId: isShowScope ? movieId : null,
                movieTitle: isShowScope ? (movieTitle || 'زنجیرە') : null,
                category: isShowScope ? 'سینەما' : 'گشتی',
                note: isShowScope ? `تایبەت بە زنجیرەی ${movieTitle}` : ''
            };
            const res = await axios.post('/api/admin/glossary', payload);
            showToast(res.data.message || 'وشەکە بە سەرکەوتوویی زیادکرا ✓');
            setGlossary(prev => [res.data.entry, ...prev]);
            setNewTermEn('');
            setNewTermKu('');
        } catch (err: any) {
            showToast(err.response?.data?.error || 'کێشەیەک لە زیادکردنی وشەدا ڕوویدا', 'error');
        } finally {
            setAddingTerm(false);
        }
    };

    // Match glossary terms in English text
    const findGlossaryMatches = (englishText: string) => {
        if (!englishText || !glossary.length) return [];
        const lower = englishText.toLowerCase();
        return glossary.filter(term => {
            if (!term.english) return false;
            const cleanTerm = term.english.toLowerCase().trim();
            const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|\\b|\\s)${escaped}(\\b|\\s|$)`, 'i');
            return regex.test(lower);
        });
    };

    // Force Unlock Handler for Super Admin
    const handleForceUnlock = async () => {
        try {
            await axios.post(`/api/admin/movies/${movieId}/lock`, {
                seasonNum,
                episodeNum,
                action: 'force_unlock'
            });
            showToast('قوفڵەکە شکێنرا و وەرگێڕان ئازاد کرا 🔓');
            setLockState({ locked: false, isSelf: true });
        } catch (err) {
            console.error(err);
            showToast('نەتوانرا قوفڵەکە بشکێنرێت', 'error');
        }
    };

    // Load SRT contents with smart alignment
    useEffect(() => {
        const loadSubtitles = async () => {
            setLoading(true);
            try {
                const params: any = {};
                if (seasonNum !== undefined && episodeNum !== undefined) {
                    params.seasonNum = seasonNum;
                    params.episodeNum = episodeNum;
                }
                const res = await axios.get(`/api/admin/movies/${movieId}/srt-content`, { params });
                const origRaw = res.data.originalSrtText || '';
                const transRaw = res.data.translatedSrtText || '';

                const parsedOrig = parseSrtText(origRaw);
                const parsedTrans = parseSrtText(transRaw);

                const mergedLines = matchKurdishToEnglish(parsedOrig, parsedTrans);

                setLines(mergedLines);
                setSelectedLineId(1);

                // Fetch latest team notes to extract any flagged lines from Super Admin
                try {
                    const notesRes = await axios.get(`/api/admin/movies/${movieId}/notes`, {
                        params: { seasonNum, episodeNum }
                    });
                    const flagged = new Set<number>();
                    notesRes.data.forEach((n: any) => {
                        if (n.flaggedLines && Array.isArray(n.flaggedLines)) {
                            n.flaggedLines.forEach((id: number) => flagged.add(id));
                        }
                    });
                    setFlaggedLineIds(Array.from(flagged));
                } catch (e) {}

                // Fetch sensitive scenes for movie/episode
                try {
                    const movieRes = await axios.get(`/api/movies/${movieId}`);
                    const m = movieRes.data;
                    if (seasonNum !== undefined && episodeNum !== undefined && m?.seasons) {
                        const season = m.seasons.find((s: any) => s.number === seasonNum);
                        const ep = season?.episodes?.find((e: any) => e.number === episodeNum);
                        setSensitiveScenes(ep?.sensitiveScenes || []);
                    } else if (m) {
                        setSensitiveScenes(m.sensitiveScenes || []);
                    }
                } catch (e) {}
            } catch (err) {
                console.error(err);
                showToast('نەتوانرا سەبتایتڵەکان باربکرێن', 'error');
            } finally {
                setLoading(false);
            }
        };

        loadSubtitles();
    }, [movieId, seasonNum, episodeNum]);

    // Handle local file import (Original or Kurdish SRT)
    const handleImportLocalSrt = (file: File, type: 'original' | 'kurdish') => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = (e.target?.result as string) || '';
            const parsed = parseSrtText(text);

            if (type === 'original') {
                const currentTrans = lines
                    .map(l => ({ id: l.id, startTime: l.startTime, endTime: l.endTime, startSec: l.startSec, endSec: l.endSec, text: l.kurdish }))
                    .filter(t => t.text.trim());
                const merged = matchKurdishToEnglish(parsed, currentTrans);
                setLines(merged);
                showToast(`فایلی ئۆرجیناڵ بارکرا (${parsed.length} دێڕ) ✓`);
            } else {
                const currentOrig = lines
                    .map(l => ({ id: l.id, startTime: l.startTime, endTime: l.endTime, startSec: l.startSec, endSec: l.endSec, text: l.english }))
                    .filter(o => o.text.trim());
                if (currentOrig.length > 0) {
                    const merged = matchKurdishToEnglish(currentOrig, parsed);
                    setLines(merged);
                } else {
                    setLines(parsed.map((p, idx) => ({
                        id: idx + 1,
                        startTime: p.startTime,
                        endTime: p.endTime,
                        startSec: p.startSec,
                        endSec: p.endSec,
                        english: '',
                        kurdish: p.text
                    })));
                }
                showToast(`فایلی کوردی بارکرا (${parsed.length} دێڕ) ✓`);
            }
        };
        reader.readAsText(file, 'utf-8');
    };

    // Handle local video selection
    const handleLocalVideoSelect = (file: File) => {
        const url = URL.createObjectURL(file);
        setLocalVideoUrl(url);
        setShowVideoPanel(true);
        showToast('ڤیدیۆکە بە سەرکەوتوویی بۆ بینین بارکرا ✓');
    };

    // Handle video time update
    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const curr = videoRef.current.currentTime;
        setCurrentTime(curr);

        const currentLine = lines.find(l => curr >= l.startSec && curr <= l.endSec);
        if (currentLine && currentLine.id !== activeLineId) {
            setActiveLineId(currentLine.id);
            const el = document.getElementById(`sub-row-${currentLine.id}`);
            if (el && linesContainerRef.current) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    };

    const seekToTime = (sec: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = sec;
            videoRef.current.play().catch(() => {});
        }
    };

    const handleLineChange = (id: number, field: 'english' | 'kurdish' | 'startTime' | 'endTime', val: string) => {
        setLines(prev => prev.map(l => {
            if (l.id !== id) return l;
            const updated = { ...l, [field]: val };
            if (field === 'startTime') updated.startSec = timeStringToSec(val);
            if (field === 'endTime') updated.endSec = timeStringToSec(val);
            return updated;
        }));
    };

    const setLineStartToCurrentVideo = (id: number) => {
        const timeStr = secToTimeString(currentTime);
        handleLineChange(id, 'startTime', timeStr);
        showToast(`کاتی دەستپێک دیاریکرا: ${timeStr}`);
    };

    const setLineEndToCurrentVideo = (id: number) => {
        const timeStr = secToTimeString(currentTime);
        handleLineChange(id, 'endTime', timeStr);
        showToast(`کاتی کۆتایی دیاریکرا: ${timeStr}`);
    };

    // ─── INAPPROPRIATE / SENSITIVE SCENES HELPERS ───
    const isLineSensitive = (line: SubtitleLine) => {
        return sensitiveScenes.some(s => {
            return line.startSec < s.end && line.endSec > s.start;
        });
    };

    const toggleLineSensitive = (line: SubtitleLine) => {
        const isSens = isLineSensitive(line);
        if (isSens) {
            const next = sensitiveScenes.filter(s => !(line.startSec < s.end && line.endSec > s.start));
            setSensitiveScenes(next);
            showToast(lang === 'en' ? `Removed sensitive mark for Line #${line.id}` : `دێڕی #${line.id} لە دیمەنی نەشیاو دەرهێنرا`);
        } else {
            const start = Math.floor(line.startSec);
            const end = Math.max(start + 1, Math.ceil(line.endSec));
            const next = [...sensitiveScenes, { start, end }].sort((a, b) => a.start - b.start);
            setSensitiveScenes(next);
            showToast(lang === 'en' ? `Line #${line.id} marked as Sensitive Scene 🛡️` : `دێڕی #${line.id} وەک دیمەنی نەشیاو نیشانکرا 🛡️`);
        }
    };

    const handleStartMarkSensitive = () => {
        const start = Math.max(0, Math.floor(currentTime));
        setRecordingSensitiveStart(start);
        showToast(lang === 'en' ? `Recording sensitive scene started at ${secToTimeString(start)}. Click STOP when scene finishes 🛑` : `دەستپێکی دیمەنی نەشیاو لە ${secToTimeString(start)} دیاریکرا. کاتێک دیمەنەکە تەواوبوو، کلیک لەسەر وەستاندن [🛑] بکە`);
    };

    const handleStopMarkSensitive = () => {
        if (recordingSensitiveStart === null) return;
        const start = recordingSensitiveStart;
        const end = Math.max(start + 1, Math.ceil(currentTime));
        setSensitiveScenes(prev => [...prev, { start, end }].sort((a, b) => a.start - b.start));
        setRecordingSensitiveStart(null);
        showToast(lang === 'en' ? `Sensitive scene recorded from ${secToTimeString(start)} to ${secToTimeString(end)} (${end - start}s) 🛡️` : `دیمەنی نەشیاوی بێ قسە لە ${secToTimeString(start)} تا ${secToTimeString(end)} (${end - start} چرکە) تۆمارکرا 🛡️`);
    };

    const handleCancelMarkSensitive = () => {
        setRecordingSensitiveStart(null);
        showToast(lang === 'en' ? 'Cancelled sensitive scene marking' : 'تۆمارکردنی دیمەنی نەشیاو هەڵوەشایەوە');
    };

    const handleQuickAddSensitivePreset = (seconds: number) => {
        const start = Math.max(0, Math.floor(currentTime));
        const end = start + seconds;
        setSensitiveScenes(prev => [...prev, { start, end }].sort((a, b) => a.start - b.start));
        showToast(lang === 'en' ? `Added ${seconds}s sensitive scene from ${secToTimeString(start)} to ${secToTimeString(end)} 🛡️` : `دیمەنی ${seconds} چرکەیی لە ${secToTimeString(start)} تا ${secToTimeString(end)} تۆمارکرا 🛡️`);
    };

    const handleAddManualRange = (e: React.FormEvent) => {
        e.preventDefault();
        const startSec = timeStringToSec(manualStartStr);
        const endSec = timeStringToSec(manualEndStr);
        if (endSec <= startSec) {
            showToast(lang === 'en' ? 'End time must be greater than start time' : 'کاتی کۆتایی دەبێت لە کاتی دەستپێک زیاتر بێت', 'error');
            return;
        }
        setSensitiveScenes(prev => [...prev, { start: Math.floor(startSec), end: Math.ceil(endSec) }].sort((a, b) => a.start - b.start));
        setManualStartStr('');
        setManualEndStr('');
        showToast(lang === 'en' ? 'Sensitive scene range added ✓' : 'مەودای دیمەنی نەشیاو بە سەرکەوتوویی زیادکرا ✓');
    };

    // ─── TIME SHIFT & OFFSET TOOL ───
    const shiftSubtitlesFrom = (fromId: number, deltaSeconds: number) => {
        if (!deltaSeconds || isNaN(deltaSeconds)) return;

        setLines(prev => prev.map(l => {
            if (l.id < fromId) return l;

            const newStart = Math.max(0, l.startSec + deltaSeconds);
            const newEnd = Math.max(newStart + 0.2, l.endSec + deltaSeconds);

            return {
                ...l,
                startSec: newStart,
                endSec: newEnd,
                startTime: secToTimeString(newStart),
                endTime: secToTimeString(newEnd)
            };
        }));

        const sign = deltaSeconds > 0 ? `+${deltaSeconds}` : `${deltaSeconds}`;
        showToast(`کاتی هەموو دێڕەکانی #${fromId} بەرەو خوارەوە بە بڕی (${sign}s) گۆڕدرا ✓`);
    };

    const addNewLineAfter = (index: number) => {
        const current = lines[index];
        const newStartSec = current ? current.endSec + 0.1 : 0;
        const newEndSec = newStartSec + 3;

        const newLine: SubtitleLine = {
            id: Date.now(),
            startTime: secToTimeString(newStartSec),
            endTime: secToTimeString(newEndSec),
            startSec: newStartSec,
            endSec: newEndSec,
            english: '',
            kurdish: ''
        };

        const updated = [...lines];
        updated.splice(index + 1, 0, newLine);
        const reindexed = updated.map((l, i) => ({ ...l, id: i + 1 }));
        setLines(reindexed);
    };

    const deleteLine = (id: number) => {
        if (lines.length <= 1) {
            showToast('ناتوانیت هەموو دێڕەکان بسڕیتەوە', 'error');
            return;
        }
        const updated = lines.filter(l => l.id !== id).map((l, i) => ({ ...l, id: i + 1 }));
        setLines(updated);
    };

    // AI translate a single line with deep surrounding context (5 lines before + 5 lines after)
    const translateSingleLine = async (line: SubtitleLine) => {
        if (!line.english.trim()) {
            showToast('تکایە سەرەتا دەقی ئینگلیزی بنووسە', 'error');
            return;
        }
        setTranslatingLine(line.id);
        try {
            const currentIndex = lines.findIndex(l => l.id === line.id);
            
            // Gather 5 lines before and 5 lines after for deep scene context
            const beforeLines = lines.slice(Math.max(0, currentIndex - 5), currentIndex)
                .filter(l => l.english.trim())
                .map(l => `[Context Line ${l.id}] EN: "${l.english}" ${l.kurdish ? `| KU: "${l.kurdish}"` : ''}`)
                .join('\n');
            
            const afterLines = lines.slice(currentIndex + 1, currentIndex + 6)
                .filter(l => l.english.trim())
                .map(l => `[Context Line ${l.id}] EN: "${l.english}" ${l.kurdish ? `| KU: "${l.kurdish}"` : ''}`)
                .join('\n');

            const currentKurdish = line.kurdish.trim();
            const isRegenerate = Boolean(currentKurdish);

            const glossaryText = glossary.length > 0
                ? `\nTEAM MANDATORY GLOSSARY (Strictly use these exact Kurdish translations):\n` + glossary.map((g: any) => `- "${g.english}" => "${g.kurdish}"`).join('\n')
                : '';

            const prompt = `ACT AS AN EXPERT CINEMATIC SUBTITLE TRANSLATOR.
Movie/Show: "${movieTitle || 'Movie'}" ${episodeTitle ? `- Episode: "${episodeTitle}"` : ''}
${glossaryText}

SURROUNDING SCENE CONTEXT (PRECEDING 5 LINES):
${beforeLines || '(Start of scene)'}

TARGET LINE TO TRANSLATE (Line #${line.id}):
English: "${line.english}"
${isRegenerate ? `Current Kurdish text: "${currentKurdish}"\nNOTE: The user is requesting a BETTER, MORE NATURAL, and DIFFERENT translation variation! Do NOT repeat the exact same previous translation.` : ''}

SURROUNDING SCENE CONTEXT (FOLLOWING 5 LINES):
${afterLines || '(End of scene)'}

CRITICAL RULES:
1. Translate specifically for natural, everyday spoken Central Kurdish (Sorani) cinematic dialogue.
2. Deeply understand the scene context, character relationships, idioms, and genre-specific terms (e.g. 'barn' can be 'تەویلە' or 'گەوڕ', 'walkers' are zombies 'زۆمبی' / 'مردووی ڕۆیشتوو').
3. Provide 3 DISTINCT and fluent translation alternatives in Central Kurdish (Sorani) without repeating the previous translation.
Output EXACTLY 3 lines in this format with NO extra text:
Option 1: [Translation 1]
Option 2: [Translation 2]
Option 3: [Translation 3]`;

            const selectedModel = localStorage.getItem('ks_srt_ai_model') || 'anthropic/claude-sonnet-5';

            const res = await axios.post('/api/ai/generate', {
                contents: [{ parts: [{ text: prompt }] }],
                aiTask: 'srt_line_translation',
                model: selectedModel,
                lineCount: 1,
                movieTitle: movieTitle || 'Line Translation'
            }, {
                timeout: 90000
            });

            const rawText = (res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            
            // Extract options
            const extractedOptions: string[] = [];
            const matches = rawText.match(/Option\s*\d+\s*:\s*(.+)/gi);
            if (matches && matches.length > 0) {
                matches.forEach((m: string) => {
                    const clean = m.replace(/^Option\s*\d+\s*:\s*/i, '').trim().replace(/^"|"$/g, '');
                    if (clean && !extractedOptions.includes(clean)) {
                        extractedOptions.push(clean);
                    }
                });
            }

            if (extractedOptions.length === 0) {
                const linesRaw = rawText.split('\n').map((l: string) => l.trim().replace(/^[-*•\d.]+\s*/, '').replace(/^"|"$/g, '')).filter(Boolean);
                if (linesRaw.length > 0) {
                    extractedOptions.push(...linesRaw.slice(0, 3));
                } else {
                    extractedOptions.push(rawText);
                }
            }

            const chosenText = extractedOptions[0] || rawText;
            handleLineChange(line.id, 'kurdish', chosenText);
            setAiUsedInSession(true);
            setLineSuggestions({
                lineId: line.id,
                options: extractedOptions
            });
            showToast(`دێڕی #${line.id} بە ۳ پێشنیاری جیاواز داڕێژرایەوە ✓`);
        } catch (err) {
            console.error(err);
            showToast('هەڵەیەک ڕوویدا لە وەرگێڕاندا', 'error');
        } finally {
            setTranslatingLine(null);
        }
    };

    // AI translate all missing Kurdish lines (Pause & Resume enabled)
    const translateAllLines = async () => {
        if (translateAllProgress?.status === 'running') {
            editorPauseRef.current = true;
            setTranslateAllProgress(prev => prev ? { ...prev, status: 'paused' } : null);
            showToast('وەرگێڕان ڕاگیرا ⏸️');
            return;
        }

        editorPauseRef.current = false;
        const untranslated = lines.filter(l => l.english.trim() && !l.kurdish.trim());
        if (untranslated.length === 0) {
            showToast('هەموو دێڕەکان وەرگێڕدراون یان دەقی ئینگلیزییان نییە', 'error');
            return;
        }

        setTranslatingAll(true);
        setTranslateAllProgress({ status: 'running', percent: 0 });
        showToast(`خەریکی وەرگێڕانی ${untranslated.length} دێڕ بە AI...`);

        try {
            const BATCH_SIZE = 20;
            let done = 0;
            for (let i = 0; i < untranslated.length; i += BATCH_SIZE) {
                if (editorPauseRef.current) {
                    const pausedPct = Math.round((done / untranslated.length) * 100);
                    setTranslateAllProgress({ status: 'paused', percent: pausedPct });
                    showToast(`وەرگێڕان لە ${done}/${untranslated.length} دێڕ ڕاگیرا ⏸️`);
                    return;
                }

                const batch = untranslated.slice(i, i + BATCH_SIZE);
                const batchText = batch.map((b, idx) => `[${idx + 1}] ${b.english}`).join('\n');

                const prompt = `Translate the following English subtitle lines into natural Central Kurdish (Sorani). Return ONLY lines in format [Index] Translation:\n\n${batchText}`;
                const res = await axios.post('/api/ai/generate', {
                    contents: [{ parts: [{ text: prompt }] }],
                    aiTask: 'srt_translation',
                    lineCount: batch.length,
                    movieTitle: movieTitle || 'Batch Translation'
                });

                const raw = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const resultLines = raw.split('\n');

                setLines(prev => {
                    const next = [...prev];
                    batch.forEach((item, bIdx) => {
                        const targetIdx = next.findIndex(x => x.id === item.id);
                        if (targetIdx !== -1) {
                            const matchedLine = resultLines.find((r: string) => r.startsWith(`[${bIdx + 1}]`));
                            if (matchedLine) {
                                const cleanText = matchedLine.replace(/^\[\d+\]\s*/, '').trim();
                                next[targetIdx] = { ...next[targetIdx], kurdish: cleanText };
                            }
                        }
                    });
                    return next;
                });

                setAiUsedInSession(true);
                done += batch.length;
                const currentPct = Math.round((done / untranslated.length) * 100);
                setTranslateAllProgress({ status: 'running', percent: currentPct });
            }
            showToast('وەرگێڕانی هەموو دێڕەکان تەواو بوو! ✓');
            setTranslateAllProgress(null);
        } catch (err) {
            console.error(err);
            showToast('هەڵەیەک لە وەرگێڕانی تەواودا ڕوویدا', 'error');
            setTranslateAllProgress(null);
        } finally {
            setTranslatingAll(false);
        }
    };

    // Save SRT files back to backend
    const handleSave = async () => {
        setSaving(true);
        try {
            const originalSrtText = lines
                .map((l, i) => `${i + 1}\n${l.startTime} --> ${l.endTime}\n${l.english.trim()}`)
                .join('\n\n');

            const translatedSrtText = lines
                .map((l, i) => {
                    const k = isLineUntranslated(l) ? '' : l.kurdish.trim();
                    return `${i + 1}\n${l.startTime} --> ${l.endTime}\n${k}`;
                })
                .join('\n\n');

            const selectedModel = localStorage.getItem('ks_srt_ai_model') || 'anthropic/claude-sonnet-5';
            const payload: any = {
                originalSrtText,
                translatedSrtText,
                isAi: aiUsedInSession,
                aiModel: aiUsedInSession ? selectedModel : undefined,
                note: aiUsedInSession ? `وەرگێڕان و دەستکاریکردن بە AI (${selectedModel})` : 'دەستکاریکردنی سەبتایتڵ'
            };
            if (seasonNum !== undefined && episodeNum !== undefined) {
                payload.seasonNum = seasonNum;
                payload.episodeNum = episodeNum;
            }

            const res = await axios.post(`/api/admin/movies/${movieId}/srt-content`, payload);

            // Also sync sensitive scenes to movie/episode
            try {
                const movieRes = await axios.get(`/api/movies/${movieId}`);
                const updatedMovie = movieRes.data;
                if (seasonNum !== undefined && episodeNum !== undefined && updatedMovie.seasons) {
                    const season = updatedMovie.seasons.find((s: any) => s.number === seasonNum);
                    if (season) {
                        const ep = season.episodes?.find((e: any) => e.number === episodeNum);
                        if (ep) ep.sensitiveScenes = sensitiveScenes;
                    }
                } else {
                    updatedMovie.sensitiveScenes = sensitiveScenes;
                }
                await axios.put(`/api/admin/movies/${movieId}`, updatedMovie);
            } catch (sensErr) {
                console.error('Failed to sync sensitive scenes', sensErr);
            }

            showToast(res.data.message || (lang === 'en' ? 'Subtitles & Sensitive scenes saved ✓' : 'سەبتایتڵ و دیمەنە نەشیاوەکان بە سەرکەوتوویی پاشەکەوت کران ✓'));
            if (onSaved) onSaved();
        } catch (err) {
            console.error(err);
            showToast('نەتوانرا سەبتایتڵەکان پاشەکەوت بکرێن', 'error');
        } finally {
            setSaving(false);
        }
    };

    const effectiveVideoSrc = localVideoUrl || videoUrl || `/api/stream/movies/${movieId}${seasonNum !== undefined && episodeNum !== undefined ? `?s=${seasonNum}&e=${episodeNum}` : ''}`;
    const activeLine = lines.find(l => currentTime >= l.startSec && currentTime <= l.endSec);

    const isLineUntranslated = (l: SubtitleLine) => {
        const k = l.kurdish.trim();
        const e = l.english.trim();
        if (!k) return true;
        if (e && k.toLowerCase() === e.toLowerCase() && /[a-zA-Z]{2,}/.test(k)) return true;
        return false;
    };

    const toggleEmptyFilter = () => {
        if (filterMode === 'empty') {
            setFilterMode('all');
            setEmptyFilterIds(null);
        } else {
            const ids = lines.filter(l => isLineUntranslated(l)).map(l => l.id);
            setEmptyFilterIds(ids);
            setFilterMode('empty');
        }
    };

    // Filtered Lines by Search Query and Filter Mode
    const filteredLines = useMemo(() => {
        let result = lines;

        if (filterMode === 'empty') {
            if (emptyFilterIds) {
                result = result.filter(l => emptyFilterIds.includes(l.id));
            } else {
                result = result.filter(l => isLineUntranslated(l));
            }
        } else if (filterMode === 'translated') {
            result = result.filter(l => !isLineUntranslated(l));
        } else if (filterMode === 'flagged') {
            result = result.filter(l => flaggedLineIds.includes(l.id));
        } else if (filterMode === 'sensitive') {
            result = result.filter(l => isLineSensitive(l));
        }

        if (!searchQuery.trim()) return result;
        const q = searchQuery.trim().toLowerCase();
        const num = parseInt(q.replace(/[^\d]/g, ''), 10);

        return result.filter(line => {
            if (!isNaN(num) && line.id === num) return true;
            if (line.english.toLowerCase().includes(q)) return true;
            if (line.kurdish.toLowerCase().includes(q)) return true;
            if (line.startTime.includes(q) || line.endTime.includes(q)) return true;
            return false;
        });
    }, [lines, searchQuery, filterMode, emptyFilterIds]);

    // Missing Kurdish Lines (both empty and untranslated english text)
    const emptyKurdishLines = useMemo(() => {
        return lines.filter(l => l.english.trim() && isLineUntranslated(l));
    }, [lines]);

    const navigateToNextEmpty = () => {
        if (emptyKurdishLines.length === 0) return;
        const nextIdx = (emptyNavIndex + 1) % emptyKurdishLines.length;
        setEmptyNavIndex(nextIdx);
        const targetLine = emptyKurdishLines[nextIdx];
        if (targetLine) {
            setSelectedLineId(targetLine.id);
            const el = document.getElementById(`sub-row-${targetLine.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    return (
        <div className="dual-srt-modal-backdrop" onClick={onClose}>
            <div className={`dual-srt-modal ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'} onClick={e => e.stopPropagation()}>
                {/* Hidden File Inputs for Manual Loading */}
                <input
                    type="file"
                    accept=".srt"
                    ref={origFileInputRef}
                    style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && handleImportLocalSrt(e.target.files[0], 'original')}
                />
                <input
                    type="file"
                    accept=".srt"
                    ref={transFileInputRef}
                    style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && handleImportLocalSrt(e.target.files[0], 'kurdish')}
                />
                <input
                    type="file"
                    accept="video/*"
                    ref={localVideoInputRef}
                    style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && handleLocalVideoSelect(e.target.files[0])}
                />

                {/* Header */}
                <div className="dual-srt-header">
                    <div className="dual-srt-title-wrap">
                        <div className="dual-srt-badge">{lang === 'en' ? 'Advanced Subtitle Editor' : 'ئیدیتۆری پێشکەوتووی سەبتایتڵ'}</div>
                        <h2>{movieTitle} {seasonNum !== undefined ? `• ${lang === 'en' ? 'Season' : 'سیزنی'} ${seasonNum}` : ''} {episodeNum !== undefined ? `• ${lang === 'en' ? 'Episode' : 'ئەڵقەی'} ${episodeNum}` : ''} {episodeTitle ? `(${episodeTitle})` : ''}</h2>
                    </div>

                    <div className="dual-srt-header-actions">
                        {/* Toggle Video Button */}
                        <button
                            className={`btn-dual-toolbar-toggle ${showVideoPanel ? 'active' : ''}`}
                            onClick={() => setShowVideoPanel(!showVideoPanel)}
                            title={showVideoPanel ? (lang === 'en' ? 'Hide video player' : 'شاردنەوەی شاشەی ڤیدیۆ') : (lang === 'en' ? 'Show video player' : 'پیشاندانی شاشەی ڤیدیۆ')}
                        >
                            {showVideoPanel ? <EyeOff size={16} /> : <Eye size={16} />}
                            <span className="btn-label-text">{showVideoPanel ? (lang === 'en' ? 'Hide Video' : 'شاردنەوەی ڤیدیۆ') : (lang === 'en' ? 'Show Video' : 'پیشاندانی ڤیدیۆ')}</span>
                        </button>

                        {(() => {
                            const isAllRunning = translateAllProgress?.status === 'running';
                            const isAllPaused = translateAllProgress?.status === 'paused';

                            return (
                                <button
                                    className={`btn-dual-ai-translate ${isAllRunning ? 'running' : ''} ${isAllPaused ? 'paused' : ''}`}
                                    disabled={loading}
                                    onClick={translateAllLines}
                                    title={isAllRunning ? (lang === 'en' ? "Click to Pause" : "کلیک بکە بۆ ڕاگرتنی کاتی (Pause)") : isAllPaused ? (lang === 'en' ? "Click to Resume" : "کلیک بکە بۆ دەستپێکردنەوە لەم شوێنەی وەستاوە (Resume)") : (lang === 'en' ? "Translate all lines using AI" : "وەرگێڕانی هەمووی بە AI")}
                                >
                                    {isAllRunning ? (
                                        <>
                                            <Pause size={16} />
                                            <span className="btn-label-text">{lang === 'en' ? 'Pause' : 'ڕاگرتن'} ({translateAllProgress?.percent}%)</span>
                                        </>
                                    ) : isAllPaused ? (
                                        <>
                                            <Play size={16} fill="#fbbf24" color="#fbbf24" />
                                            <span className="btn-label-text">{lang === 'en' ? 'Resume' : 'دەستپێکردنەوە'} ({translateAllProgress?.percent}%)</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={16} />
                                            <span className="btn-label-text">{lang === 'en' ? 'AI Translate All' : 'وەرگێڕانی هەمووی بە AI'}</span>
                                        </>
                                    )}
                                </button>
                            );
                        })()}

                        <button
                            className="btn-dual-toolbar-file"
                            style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#7dd3fc' }}
                            onClick={() => setShowDiffViewer(true)}
                            title={lang === 'en' ? "View translation diff and revision history" : "مێژووی دەستکاری و گۆڕانکارییەکان (Diff History)"}
                        >
                            <History size={16} />
                            <span className="btn-label-text">{lang === 'en' ? 'Diff History 📜' : 'مێژووی دەستکاری 📜'}</span>
                        </button>

                        <button
                            className="btn-dual-toolbar-file"
                            style={{
                                background: qcReport.criticalCount > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.15)',
                                borderColor: qcReport.criticalCount > 0 ? 'rgba(239, 68, 68, 0.45)' : 'rgba(16, 185, 129, 0.4)',
                                color: qcReport.criticalCount > 0 ? '#fca5a5' : '#6ee7b7'
                            }}
                            onClick={() => setShowQcModal(true)}
                            title={lang === 'en' ? "Run Subtitle Quality Control (QC)" : "پشکنینی کوالێتی و هەڵەکانی سەبتایتڵ (Subtitle QC)"}
                        >
                            <ShieldCheck size={16} />
                            <span className="btn-label-text">{lang === 'en' ? 'Quality Check (QC)' : 'پشکنینی کوالێتی (QC)'}</span>
                            {qcReport.totalIssues > 0 && (
                                <span className="badge-count" style={{
                                    fontSize: '10px',
                                    background: qcReport.criticalCount > 0 ? '#ef4444' : '#f59e0b',
                                    color: '#fff',
                                    padding: '1px 5px',
                                    borderRadius: '999px',
                                    fontWeight: '900'
                                }}>
                                    {qcReport.totalIssues}
                                </span>
                            )}
                        </button>

                        <button
                            className="btn-dual-toolbar-file"
                            style={{
                                background: sensitiveScenes.length > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                borderColor: sensitiveScenes.length > 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.12)',
                                color: sensitiveScenes.length > 0 ? '#fca5a5' : '#cbd5e1'
                            }}
                            onClick={() => setShowSensitiveModal(true)}
                            title={lang === 'en' ? "Manage Inappropriate / Sensitive Scenes (Family Mode)" : "بەڕێوەبردنی دیمەنە نەشیاوەکان (مۆدی خێزانی)"}
                        >
                            <Shield size={16} color="#f87171" />
                            <span className="btn-label-text">{lang === 'en' ? 'Sensitive Scenes' : 'دیمەنی نەشیاو 🛡️'}</span>
                            {sensitiveScenes.length > 0 && (
                                <span className="badge-count" style={{
                                    fontSize: '10px',
                                    background: '#ef4444',
                                    color: '#fff',
                                    padding: '1px 5px',
                                    borderRadius: '999px',
                                    fontWeight: '900'
                                }}>
                                    {sensitiveScenes.length}
                                </span>
                            )}
                        </button>

                        <button
                            className="btn-dual-toolbar-file"
                            style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#6ee7b7' }}
                            onClick={() => setShowGlossaryDrawer(true)}
                            title={lang === 'en' ? "Open Team Glossary and Terminology Drawer" : "فەرهەنگۆکی وشە و زاراوەکان"}
                        >
                            <BookOpen size={16} />
                            <span className="btn-label-text">{lang === 'en' ? 'Glossary 📖' : 'فەرهەنگۆک 📖'}</span>
                        </button>

                        <button
                            className="btn-dual-toolbar-file"
                            style={{ background: 'rgba(168, 85, 247, 0.15)', borderColor: 'rgba(168, 85, 247, 0.4)', color: '#d8b4fe' }}
                            onClick={() => setShowNotesModal(true)}
                            title={lang === 'en' ? "Team Internal Production Notes" : "تێبینییە ناوخۆییەکانی تیم"}
                        >
                            <MessageSquare size={16} />
                            <span className="btn-label-text">{lang === 'en' ? 'Team Notes 💬' : 'تێبینییەکان 💬'}</span>
                        </button>

                        <button
                            className="btn-dual-save"
                            disabled={saving || loading || (lockState?.locked && !lockState?.isSelf)}
                            onClick={handleSave}
                            title={lang === 'en' ? 'Save subtitles' : 'پاشەکەوتکردن'}
                        >
                            {saving ? <Loader2 size={16} className="spinning" /> : <Save size={16} />}
                            <span className="btn-label-text">{lang === 'en' ? 'Save' : 'پاشەکەوتکردن'}</span>
                        </button>

                        <button className="btn-dual-close" onClick={onClose} title="داخستن">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Active Editing Lock Warning Banner */}
                {lockState?.locked && !lockState?.isSelf && (
                    <div className="dual-editor-lock-banner">
                        <div className="lock-banner-left">
                            <ShieldAlert size={20} color="#f59e0b" />
                            <span>
                                🔒 <strong>{lang === 'en' ? 'This subtitle is locked:' : 'ئەم سەبتایتڵە قوفڵکراوە:'}</strong> {lang === 'en' ? `Currently being edited by (${lockState.lockedBy?.username || 'another admin'}) to prevent merge conflicts (Read-Only Mode).` : `لە ئێستادا لەلایەن (${lockState.lockedBy?.username || 'ئەدمینێکی تر'}) دەستکاری دەکرێت تا کاری یەکتر تێکنەدەن (دۆخی تەنها خوێندنەوە).`}
                            </span>
                        </div>
                        {user?.role === 'super_admin' && (
                            <button className="btn-force-unlock" onClick={handleForceUnlock}>
                                <Unlock size={14} /> {lang === 'en' ? 'Force Unlock' : 'شکاندنی قوفڵ (Force Unlock)'}
                            </button>
                        )}
                    </div>
                )}

                {/* Flagged Lines from Super Admin Feedback Banner */}
                {flaggedLineIds.length > 0 && (
                    <div className="empty-kurdish-alert-banner" style={{ background: 'rgba(168, 85, 247, 0.15)', borderColor: 'rgba(168, 85, 247, 0.4)', color: '#e9d5ff' }}>
                        <div className="alert-banner-left">
                            <MessageSquare size={18} color="#c084fc" />
                            <span>
                                📌 <strong>{lang === 'en' ? 'Super Admin Feedback:' : 'تێبینی سەرۆک:'}</strong> {lang === 'en' ? `Revisions requested for (${flaggedLineIds.length}) lines: (Lines ${flaggedLineIds.join(', ')})` : `بەڕێوەبەر داوای چاکسازی لە (${flaggedLineIds.length}) دێڕ کردووە: (دێڕەکانی ${flaggedLineIds.join('، ')})`}
                            </span>
                        </div>
                        <button 
                            className={`btn-jump-empty-line ${filterMode === 'flagged' ? 'active' : ''}`}
                            style={{ background: filterMode === 'flagged' ? '#8b5cf6' : 'rgba(168, 85, 247, 0.25)', border: '1px solid rgba(168, 85, 247, 0.5)', color: '#ffffff' }}
                            onClick={() => setFilterMode(filterMode === 'flagged' ? 'all' : 'flagged')}
                        >
                            🔍 {filterMode === 'flagged' ? (lang === 'en' ? 'Show All Lines' : 'پیشاندانی هەموو دێڕەکان') : (lang === 'en' ? 'Show Super Admin Flagged Only' : 'پیشاندانی تەنها دێڕە دیاریکراوەکانی سەرۆک')}
                        </button>
                    </div>
                )}

                {/* Translation Progress & Empty Kurdish Lines Alert Banner */}
                {lines.length > 0 && (
                    emptyKurdishLines.length > 0 ? (
                        <div className="empty-kurdish-alert-banner">
                            <div className="alert-banner-left">
                                <AlertTriangle size={18} className="alert-icon" />
                                <span>
                                    {lang === 'en' ? 'Notice:' : 'ئاگاداری:'} <strong>{emptyKurdishLines.length} {lang === 'en' ? 'Kurdish lines missing/empty' : 'دێڕی ژێرنووسی کوردی بەتاڵە'}</strong> ({lang === 'en' ? `Out of ${lines.length} lines - ${Math.round(((lines.length - emptyKurdishLines.length) / lines.length) * 100)}% Complete` : `لە کۆی ${lines.length} دێڕ - ${Math.round(((lines.length - emptyKurdishLines.length) / lines.length) * 100)}% تەواوبووە`})
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <button 
                                    className={`btn-jump-empty-line ${filterMode === 'empty' ? 'active' : ''}`}
                                    style={{ background: filterMode === 'empty' ? '#ef4444' : 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)' }}
                                    onClick={toggleEmptyFilter}
                                >
                                    🔍 {filterMode === 'empty' ? (lang === 'en' ? 'Show All Lines' : 'پیشاندانی هەموو دێڕەکان') : (lang === 'en' ? 'Show Empty Only' : 'تەنها دێڕە بەتاڵەکان')}
                                </button>
                                <button className="btn-jump-empty-line" onClick={navigateToNextEmpty}>
                                    {lang === 'en' ? 'Jump to Empty ⏩' : 'بڕۆ بۆ دێڕی بەتاڵ ⏩'} ({emptyNavIndex + 1}/{emptyKurdishLines.length})
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-kurdish-alert-banner success">
                            <div className="alert-banner-left">
                                <CheckCircle size={18} color="#10b981" />
                                <span>
                                    {lang === 'en' ? 'Great job!' : 'دەستخۆش!'} <strong>{lang === 'en' ? `All (${lines.length}) lines translated into Kurdish` : `تەواوی دێڕەکان (${lines.length} دێڕ) بە کوردی وەرگێڕدراون`}</strong> {lang === 'en' ? 'with zero empty lines (100% Complete).' : 'و هیچ دێڕێکی بەتاڵ نییە (100% تەواو).'}
                                </span>
                            </div>
                            <button 
                                className="btn-jump-empty-line"
                                onClick={() => setFilterMode('all')}
                            >
                                {lang === 'en' ? `View All Lines (${lines.length})` : `پشکنینی هەموو دێڕەکان (${lines.length})`}
                            </button>
                        </div>
                    )
                )}

                {/* Mobile Tab Switcher */}
                <div className="dual-srt-mobile-nav-tabs">
                    <button
                        className={`mobile-tab-btn ${mobileTab === 'editor' ? 'active' : ''}`}
                        onClick={() => setMobileTab('editor')}
                    >
                        <ListFilter size={15} />
                        <span>ژێرنووسەکان ({lines.length})</span>
                    </button>
                    <button
                        className={`mobile-tab-btn ${mobileTab === 'video' ? 'active' : ''}`}
                        onClick={() => setMobileTab('video')}
                    >
                        <Video size={15} />
                        <span>شاشەی ڤیدیۆ</span>
                    </button>
                </div>

                {/* Body Content */}
                <div className={`dual-srt-body ${!showVideoPanel ? 'no-video-mode' : ''}`}>
                    {/* Video Preview Player Panel (Collapsible) */}
                    {showVideoPanel && (
                        <div className={`dual-srt-video-panel ${mobileTab === 'video' ? 'mobile-show' : 'mobile-hide'}`}>
                            <div className="video-player-wrapper">
                                {effectiveVideoSrc ? (
                                    <video
                                        ref={videoRef}
                                        src={effectiveVideoSrc}
                                        controls
                                        onTimeUpdate={handleTimeUpdate}
                                        className="dual-srt-video-el"
                                    />
                                ) : (
                                    <div className="video-no-src-placeholder">
                                        <Video size={36} color="#8b5cf6" style={{ opacity: 0.6 }} />
                                        <p>{lang === 'en' ? 'No video attached for this episode' : 'هیچ ڤیدیۆیەک دانەنراوە بۆ ئەم ئەڵقەیە'}</p>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="btn-video-quick-add"
                                                onClick={() => localVideoInputRef.current?.click()}
                                            >
                                                <Upload size={13} /> {lang === 'en' ? 'Select Video File' : 'هەڵبژاردنی فایلی ڤیدیۆ'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Live Subtitle Overlay on Video */}
                                {activeLine && (activeLine.english || activeLine.kurdish) && (
                                    <div className="video-subtitle-overlay-box">
                                        {activeLine.english && (
                                            <div className="v-sub-line v-sub-en">{activeLine.english}</div>
                                        )}
                                        {activeLine.kurdish && (
                                            <div className="v-sub-line v-sub-ku">{activeLine.kurdish}</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="video-sync-bar">
                                <div className="video-time-display">
                                    <Clock size={16} /> {lang === 'en' ? 'Current Time:' : 'کاتی هەنووکە:'} <strong>{secToTimeString(currentTime)}</strong>
                                </div>
                                <div className="video-quick-controls">
                                    <button onClick={() => seekToTime(Math.max(0, currentTime - 5))} title={lang === 'en' ? '5s Backward' : '٥ چرکە بۆ دواوە'}><RotateCcw size={14} /> -5s</button>
                                    <button onClick={() => seekToTime(currentTime + 5)} title={lang === 'en' ? '5s Forward' : '٥ چرکە بۆ پێشەوە'}><RotateCw size={14} /> +5s</button>
                                </div>
                            </div>

                            {/* Inappropriate Scene Marker Toolbox for Non-dialogue & Dialogue scenes */}
                            <div className="video-sensitive-control-card">
                                <div className="sens-card-header">
                                    <div className="sens-card-title">
                                        <Shield size={14} color="#ef4444" />
                                        <span>{lang === 'en' ? 'Non-Dialogue Mature Scene Marker' : 'دیاریکردنی دیمەنی نەشیاوی بێ قسە (مۆدی خێزانی)'}</span>
                                    </div>
                                    {sensitiveScenes.length > 0 && (
                                        <span className="sens-badge-count">{sensitiveScenes.length} {lang === 'en' ? 'scenes' : 'دیمەن'}</span>
                                    )}
                                </div>

                                {recordingSensitiveStart !== null ? (
                                    <div className="sens-recording-live-box">
                                        <div className="sens-recording-indicator">
                                            <span className="pulse-dot"></span>
                                            <span>
                                                {lang === 'en' ? '🔴 Marking In Progress:' : '🔴 خەریکی تۆمارکردنی دیمەنە:'} <strong>{secToTimeString(recordingSensitiveStart)}</strong> ➜ <strong>{secToTimeString(currentTime)}</strong> ({Math.max(1, Math.round(currentTime - recordingSensitiveStart))}s)
                                            </span>
                                        </div>
                                        <div className="sens-recording-actions">
                                            <button
                                                type="button"
                                                className="btn-stop-sens-record"
                                                onClick={handleStopMarkSensitive}
                                            >
                                                🛑 {lang === 'en' ? 'Stop & Save Scene (Mark OUT)' : 'کۆتایی دیمەن و تۆمارکردن [🛑]'}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-cancel-sens-record"
                                                onClick={handleCancelMarkSensitive}
                                                title={lang === 'en' ? 'Cancel' : 'پاشگەزبوونەوە'}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="sens-normal-controls">
                                        {/* Primary Live IN Button */}
                                        <button
                                            type="button"
                                            className="btn-start-sens-record"
                                            onClick={handleStartMarkSensitive}
                                            title={lang === 'en' ? "Click when inappropriate scene starts (Mark IN)" : "کاتێک دیمەنی نەشیاو دەستی پێکرد لێرە پەنجە بنێ (دیاریکردنی دەستپێک)"}
                                        >
                                            <span className="rec-circle"></span>
                                            <span>{lang === 'en' ? 'Start Inappropriate Scene (Mark IN)' : 'دەستپێکی دیمەنی نەشیاو (Mark IN)'}</span>
                                        </button>

                                        {/* Quick Preset Buttons */}
                                        <div className="sens-preset-row">
                                            <span className="preset-label">{lang === 'en' ? 'Quick +Sec:' : 'لە کاتی ڤیدیۆوە:'}</span>
                                            <button type="button" className="btn-sens-preset" onClick={() => handleQuickAddSensitivePreset(5)}>+5s</button>
                                            <button type="button" className="btn-sens-preset" onClick={() => handleQuickAddSensitivePreset(10)}>+10s</button>
                                            <button type="button" className="btn-sens-preset" onClick={() => handleQuickAddSensitivePreset(20)}>+20s</button>
                                            <button type="button" className="btn-sens-preset" onClick={() => handleQuickAddSensitivePreset(30)}>+30s</button>
                                        </div>

                                        {/* If active line is present */}
                                        {activeLine && (
                                            <button
                                                type="button"
                                                className={`btn-toggle-active-line-sens ${isLineSensitive(activeLine) ? 'active' : ''}`}
                                                onClick={() => toggleLineSensitive(activeLine)}
                                            >
                                                <Shield size={12} />
                                                <span>
                                                    {isLineSensitive(activeLine)
                                                        ? (lang === 'en' ? `Line #${activeLine.id} Marked (Remove)` : `دێڕی #${activeLine.id} نیشانکراوە (لابردن)`)
                                                        : (lang === 'en' ? `Mark Subtitle Line #${activeLine.id}` : `نیشانکردنی دێڕی ژێرنووسی #${activeLine.id}`)}
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Quick switch back to editor on mobile */}
                            <button className="btn-mobile-return-editor" onClick={() => setMobileTab('editor')}>
                                {lang === 'en' ? 'Return to Subtitles 📝' : 'گەڕانەوە بۆ ژێرنووسەکان 📝'}
                            </button>
                        </div>
                    )}

                    {/* Subtitles Table with Shift Toolbar */}
                    <div className={`dual-srt-editor-panel ${mobileTab === 'video' ? 'mobile-hide' : 'mobile-show'}`}>
                        {/* Search and Navigation Bar with Quick Shift Toggle */}
                        <div className="dual-srt-search-toolbar">
                            <div className="srt-search-input-wrap">
                                <Search size={15} className="srt-search-icon" />
                                <input
                                    type="text"
                                    placeholder={lang === 'en' ? "Search by line (#6), Kurdish, English text, or time..." : "بگەڕێ بەپێی ژمارەی دێڕ (وەک: 6#)، دەقی کوردی، ئینگلیزی، یان کات..."}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="srt-search-input"
                                />
                                {searchQuery && (
                                    <button className="btn-clear-srt-search" onClick={() => setSearchQuery('')}>
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            <div className="srt-search-right-tools">
                                <button
                                    className={`btn-toggle-shift-bar ${filterMode === 'sensitive' ? 'active' : ''}`}
                                    style={filterMode === 'sensitive' ? { background: '#ef4444', borderColor: '#ef4444', color: '#ffffff' } : sensitiveScenes.length > 0 ? { background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)', color: '#fca5a5' } : {}}
                                    onClick={() => setFilterMode(filterMode === 'sensitive' ? 'all' : 'sensitive')}
                                    title={lang === 'en' ? "Filter lines marked as sensitive / mature scenes" : "فلتەرکردنی تەنها دێڕە نەشیاوەکان (مۆدی خێزانی)"}
                                >
                                    <Shield size={13} color={filterMode === 'sensitive' ? '#ffffff' : '#f87171'} />
                                    <span>{lang === 'en' ? `Sensitive (${sensitiveScenes.length})` : `دیمەنی نەشیاو (${sensitiveScenes.length})`}</span>
                                </button>

                                <button
                                    className={`btn-toggle-shift-bar ${showShiftToolbar ? 'active' : ''}`}
                                    onClick={() => setShowShiftToolbar(!showShiftToolbar)}
                                    title={showShiftToolbar ? (lang === 'en' ? 'Hide time shift toolbar' : 'شاردنەوەی بەشی گۆڕینی کات') : (lang === 'en' ? 'Show time shift toolbar' : 'پیشاندانی بەشی گۆڕینی کات (Time Shift)')}
                                >
                                    <Sliders size={13} />
                                    <span>{lang === 'en' ? 'Time Shift' : 'گۆڕینی کات'} {showShiftToolbar ? '▲' : '▼'}</span>
                                </button>

                                <div className="srt-search-count-badge">
                                    {searchQuery ? (
                                        <span>{lang === 'en' ? 'Found:' : 'دۆزراوە:'} <strong>{filteredLines.length}</strong> / <strong>{lines.length}</strong></span>
                                    ) : (
                                        <span>{lang === 'en' ? 'Total Lines:' : 'کۆی دێڕەکان:'} <strong>{lines.length}</strong></span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Collapsible Time Shift Control Bar */}
                        {showShiftToolbar && (
                            <div className="dual-srt-shift-toolbar">
                                <div className="shift-target-badge">
                                    <span className="shift-target-label">{lang === 'en' ? 'Selected Line:' : 'دێڕی دیاریکراو:'}</span>
                                    <span className="shift-target-pill">{lang === 'en' ? `Line #${selectedLineId}` : `دێڕی #${selectedLineId}`}</span>
                                </div>

                                <div className="shift-btn-group">
                                    <span className="shift-label">{lang === 'en' ? 'Shift downwards:' : 'گۆڕینی کات بۆ خوارەوە:'}</span>
                                    <button
                                        className="btn-shift-step"
                                        title={lang === 'en' ? `Delay 5s from line ${selectedLineId} downwards` : `٥ چرکە دواخستن بۆ دێڕی ${selectedLineId} و هەموو خوارەوە`}
                                        onClick={() => shiftSubtitlesFrom(selectedLineId, -5)}
                                    >
                                        -5s
                                    </button>
                                    <button
                                        className="btn-shift-step"
                                        title={lang === 'en' ? `Delay 1s from line ${selectedLineId} downwards` : `١ چرکە دواخستن بۆ دێڕی ${selectedLineId} و هەموو خوارەوە`}
                                        onClick={() => shiftSubtitlesFrom(selectedLineId, -1)}
                                    >
                                        -1s
                                    </button>
                                    <button
                                        className="btn-shift-step"
                                        title={lang === 'en' ? `Delay 0.5s from line ${selectedLineId} downwards` : `٠.٥ چرکە دواخستن بۆ دێڕی ${selectedLineId} و هەموو خوارەوە`}
                                        onClick={() => shiftSubtitlesFrom(selectedLineId, -0.5)}
                                    >
                                        -0.5s
                                    </button>
                                    <button
                                        className="btn-shift-step plus"
                                        title={lang === 'en' ? `Advance 0.5s from line ${selectedLineId} downwards` : `٠.٥ چرکە پێشخستن بۆ دێڕی ${selectedLineId} و هەموو خوارەوە`}
                                        onClick={() => shiftSubtitlesFrom(selectedLineId, 0.5)}
                                    >
                                        +0.5s
                                    </button>
                                    <button
                                        className="btn-shift-step plus"
                                        title={lang === 'en' ? `Advance 1s from line ${selectedLineId} downwards` : `١ چرکە پێشخستن بۆ دێڕی ${selectedLineId} و هەموو خوارەوە`}
                                        onClick={() => shiftSubtitlesFrom(selectedLineId, 1)}
                                    >
                                        +1s
                                    </button>
                                    <button
                                        className="btn-shift-step plus"
                                        title={lang === 'en' ? `Advance 5s from line ${selectedLineId} downwards` : `٥ چرکە پێشخستن بۆ دێڕی ${selectedLineId} و هەموو خوارەوە`}
                                        onClick={() => shiftSubtitlesFrom(selectedLineId, 5)}
                                    >
                                        +5s
                                    </button>
                                </div>

                                {/* Custom Shift Value */}
                                <div className="shift-custom-group">
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={customShiftSec}
                                        onChange={e => setCustomShiftSec(e.target.value)}
                                        className="shift-custom-input"
                                        title={lang === 'en' ? "Shift amount in seconds" : "بڕی کاتی دیاریکراو بە چرکە"}
                                    />
                                    <button
                                        className="btn-shift-custom-apply"
                                        onClick={() => shiftSubtitlesFrom(selectedLineId, parseFloat(customShiftSec) || 0)}
                                        title={lang === 'en' ? "Apply shift to selected line and all below" : "جێبەجێکردنی کاتی دیاریکراو لەم دێڕەوە بۆ خوارەوە"}
                                    >
                                        {lang === 'en' ? 'Apply' : 'جێبەجێکردن'}
                                    </button>
                                </div>

                                {/* Video Current Time Pin Button */}
                                {showVideoPanel && (
                                    <button
                                        className="btn-shift-sync-video"
                                        onClick={() => setLineStartToCurrentVideo(selectedLineId)}
                                        title={lang === 'en' ? "Set start time of this line to current video time" : "کاتی دەستپێکی ئەم دێڕە ڕێکبخە لەگەڵ چرکەی هەنووکەی ڤیدیۆکە"}
                                    >
                                        ⚡ {lang === 'en' ? 'Start Time = Video Time' : 'کاتی دەستپێک = کاتی ڤیدیۆ'}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Table Header */}
                        <div className="dual-srt-table-header">
                            <div className="th-col th-idx">#</div>
                            <div className="th-col th-times">{lang === 'en' ? 'Timestamps (Start / End)' : 'کاتەکان (دەستپێک / کۆتایی)'}</div>
                            <div className="th-col th-en">{lang === 'en' ? 'English Subtitle' : 'ژێرنووسی ئینگلیزی (English)'}</div>
                            <div className="th-col th-ku">{lang === 'en' ? 'Kurdish Subtitle' : 'ژێرنووسی کوردی (Kurdish)'}</div>
                            <div className="th-col th-actions">{lang === 'en' ? 'Actions' : 'کردارەکان'}</div>
                        </div>

                        {/* Table Body / Lines List */}
                        <div className="dual-srt-lines-list" ref={linesContainerRef}>
                            {loading ? (
                                <div className="dual-srt-loading">
                                    <Loader2 size={32} className="spinning" />
                                    <span>{lang === 'en' ? 'Loading subtitles...' : 'سەبتایتڵەکان ئامادە دەکرێن...'}</span>
                                </div>
                            ) : filteredLines.length === 0 ? (
                                <div className="dual-srt-empty">
                                    <FileText size={40} color="#64748b" style={{ margin: '0 auto 12px' }} />
                                    <h4>{lang === 'en' ? 'No Subtitle Lines Found' : 'هیچ دێڕێک نەدۆزرایەوە'}</h4>
                                    <p>{lang === 'en' ? 'You can import an .srt file above or add new lines.' : 'دەتوانیت لە سەرەوە فایلی .srt باربکەیت یان دێڕی نوێ زیاد بکەیت.'}</p>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
                                        <button className="btn-add-line-large" onClick={() => origFileInputRef.current?.click()}>
                                            <FileText size={14} /> {lang === 'en' ? 'Import Original .srt' : 'بارکردنی فایلی Original'}
                                        </button>
                                        <button className="btn-add-line-large" onClick={() => addNewLineAfter(0)}>
                                            <Plus size={14} /> {lang === 'en' ? 'Add New Line' : 'زیادکردنی دێڕی نوێ'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                filteredLines.map((line, idx) => {
                                    const isActive = line.id === activeLineId;
                                    const isSelected = line.id === selectedLineId;
                                    const isTranslating = translatingLine === line.id;
                                    const isKurdishEmpty = isLineUntranslated(line);
                                    const isEnglishDuplicate = isKurdishEmpty && line.kurdish.trim() && line.english.trim() && line.kurdish.trim().toLowerCase() === line.english.trim().toLowerCase();

                                    return (
                                        <div
                                            key={line.id}
                                            id={`sub-row-${line.id}`}
                                            className={`dual-srt-row ${isActive ? 'active-row' : ''} ${isSelected ? 'selected-row' : ''} ${isKurdishEmpty ? 'row-missing-kurdish' : ''} ${isLineSensitive(line) ? 'row-is-sensitive' : ''}`}
                                            onClick={() => setSelectedLineId(line.id)}
                                        >
                                            {/* Index + Play Trigger */}
                                            <div>
                                                <button
                                                    className={`btn-play-line ${isSelected ? 'selected-btn' : ''}`}
                                                    title={lang === 'en' ? `Play video at ${line.startTime}` : `دەستپێکردنی ڤیدیۆ لە کاتی ${line.startTime}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        seekToTime(line.startSec);
                                                    }}
                                                >
                                                    <Play size={10} fill="currentColor" /> {line.id}
                                                </button>
                                            </div>

                                            {/* Timestamps Editor */}
                                            <div className="time-col-wrap">
                                                <div className="time-input-group">
                                                    <span className="time-marker-tag start">{lang === 'en' ? 'Start' : 'دەستپێک'}</span>
                                                    <input
                                                        type="text"
                                                        value={line.startTime}
                                                        onChange={e => handleLineChange(line.id, 'startTime', e.target.value)}
                                                        className="time-input"
                                                        dir="ltr"
                                                        title={lang === 'en' ? "Start timestamp (HH:MM:SS,MS)" : "کاتی دەستپێک (HH:MM:SS,MS)"}
                                                    />
                                                    {showVideoPanel && (
                                                        <button
                                                            className="btn-sync-time"
                                                            title={lang === 'en' ? "Set start to current video timestamp" : "کاتی ڤیدیۆکە دابنێ بۆ دەستپێک"}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setLineStartToCurrentVideo(line.id);
                                                            }}
                                                        >
                                                            ⏱️
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="time-input-group">
                                                    <span className="time-marker-tag end">{lang === 'en' ? 'End' : 'کۆتایی'}</span>
                                                    <input
                                                        type="text"
                                                        value={line.endTime}
                                                        onChange={e => handleLineChange(line.id, 'endTime', e.target.value)}
                                                        className="time-input"
                                                        dir="ltr"
                                                        title={lang === 'en' ? "End timestamp (HH:MM:SS,MS)" : "کاتی کۆتایی (HH:MM:SS,MS)"}
                                                    />
                                                    {showVideoPanel && (
                                                        <button
                                                            className="btn-sync-time"
                                                            title={lang === 'en' ? "Set end to current video timestamp" : "کاتی ڤیدیۆکە دابنێ بۆ کۆتایی"}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setLineEndToCurrentVideo(line.id);
                                                            }}
                                                        >
                                                            ⏱️
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* English Subtitle Textarea */}
                                            <div>
                                                <textarea
                                                    value={line.english}
                                                    onChange={e => handleLineChange(line.id, 'english', e.target.value)}
                                                    placeholder="English subtitle text..."
                                                    className="sub-textarea"
                                                    rows={Math.max(2, line.english.split('\n').length)}
                                                    dir="ltr"
                                                />
                                            </div>

                                            {/* Kurdish Subtitle Textarea */}
                                            <div style={{ position: 'relative' }}>
                                                {flaggedLineIds.includes(line.id) && (
                                                    <span style={{ position: 'absolute', top: '-8px', left: '6px', fontSize: '10px', background: '#8b5cf6', color: '#fff', padding: '1px 6px', borderRadius: '4px', zIndex: 2, fontWeight: 'bold', boxShadow: '0 0 8px rgba(139, 92, 246, 0.6)' }}>
                                                        📌 {lang === 'en' ? 'Super Admin Note' : 'تێبینی سەرۆک'}
                                                    </span>
                                                )}
                                                {isLineSensitive(line) && (
                                                    <span style={{ position: 'absolute', top: '-8px', left: flaggedLineIds.includes(line.id) ? '105px' : '6px', fontSize: '10px', background: '#ef4444', color: '#fff', padding: '1px 7px', borderRadius: '4px', zIndex: 2, fontWeight: 'bold', boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)' }}>
                                                        🛡️ {lang === 'en' ? 'Mature Scene' : 'دیمەنی نەشیاو (مۆدی خێزانی)'}
                                                    </span>
                                                )}
                                                {isEnglishDuplicate && (
                                                    <span style={{ position: 'absolute', top: '-8px', right: '6px', fontSize: '10px', background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: '4px', zIndex: 2, fontWeight: 'bold' }}>
                                                        ⚠️ {lang === 'en' ? 'Untranslated (English duplicate)' : 'وەرنەگێڕدراو (دەقی ئینگلیزییە)'}
                                                    </span>
                                                )}
                                                {filterMode === 'empty' && !isKurdishEmpty && (
                                                    <span style={{ position: 'absolute', top: '-8px', right: '6px', fontSize: '10px', background: '#10b981', color: '#fff', padding: '1px 6px', borderRadius: '4px', zIndex: 2, fontWeight: 'bold' }}>
                                                        {lang === 'en' ? 'Translated ✓' : 'وەرگێڕدرا ✓'}
                                                    </span>
                                                )}

                                                {/* Glossary Matches Hint Pills */}
                                                {(() => {
                                                    const matches = findGlossaryMatches(line.english);
                                                    if (!matches.length) return null;
                                                    return (
                                                        <div className="glossary-term-hints-bar">
                                                            <span className="hint-label">💡 {lang === 'en' ? 'Glossary:' : 'فەرهەنگ:'}</span>
                                                            {matches.map(m => (
                                                                <button
                                                                    key={m.id}
                                                                    type="button"
                                                                    className="btn-glossary-hint-pill"
                                                                    title={m.note ? `${m.english} ➜ ${m.kurdish}\nNote: ${m.note}` : `${m.english} ➜ ${m.kurdish}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (lockState?.locked && !lockState?.isSelf) return;
                                                                        const currentKu = (line.kurdish || '').trim();
                                                                        let newKu = currentKu ? `${currentKu} ${m.kurdish}` : m.kurdish;
                                                                        handleLineChange(line.id, 'kurdish', newKu);
                                                                    }}
                                                                >
                                                                    <span className="pill-en">{m.english}</span>
                                                                    <span className="pill-arrow">➜</span>
                                                                    <span className="pill-ku">{m.kurdish}</span>
                                                                    <span className="pill-plus">+</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                                <textarea
                                                    value={line.kurdish}
                                                    onChange={e => handleLineChange(line.id, 'kurdish', e.target.value)}
                                                    placeholder={lockState?.locked && !lockState?.isSelf ? (lang === 'en' ? "This subtitle is locked (read-only)..." : "ئەم سەبتایتڵە قوفڵکراوە (تەنها بینین)...") : (lang === 'en' ? "Kurdish subtitle text..." : "دەقی ژێرنووسی کوردی...")}
                                                    readOnly={lockState?.locked && !lockState?.isSelf}
                                                    className={`sub-textarea sub-textarea-ku ${isKurdishEmpty ? 'sub-textarea-empty-warning' : ''} ${lockState?.locked && !lockState?.isSelf ? 'sub-textarea-locked' : ''}`}
                                                    rows={Math.max(2, (line.kurdish || '').split('\n').length)}
                                                    dir="rtl"
                                                />

                                                {/* AI 3-Alternative Suggestions Bar */}
                                                {lineSuggestions && lineSuggestions.lineId === line.id && lineSuggestions.options.length > 0 && (
                                                    <div className="line-ai-suggestions-box" onClick={e => e.stopPropagation()}>
                                                        <div className="line-ai-suggestions-header">
                                                            <span className="suggestions-title">✨ {lang === 'en' ? '3 Cinematic Suggestions (click to apply):' : '۳ پێشنیاری سینەمایی (کلیک بکە بۆ هەڵبژاردن):'}</span>
                                                            <button
                                                                type="button"
                                                                className="btn-close-suggestions"
                                                                onClick={() => setLineSuggestions(null)}
                                                                title={lang === 'en' ? 'Close' : 'داخستن'}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                        <div className="line-ai-suggestions-list">
                                                            {lineSuggestions.options.map((opt, optIdx) => (
                                                                <button
                                                                    key={optIdx}
                                                                    type="button"
                                                                    className={`line-ai-suggestion-pill ${line.kurdish === opt ? 'active' : ''}`}
                                                                    onClick={() => {
                                                                        handleLineChange(line.id, 'kurdish', opt);
                                                                        showToast(lang === 'en' ? `Applied variation #${optIdx + 1} ✓` : `شێوازی #${optIdx + 1} جێگیر کرا ✓`);
                                                                    }}
                                                                    title={lang === 'en' ? "Click to apply this suggestion" : "کلیک بکە بۆ جێگیرکردنی ئەم ڕستەیە"}
                                                                >
                                                                    <span className="opt-num">{optIdx + 1}</span>
                                                                    <span className="opt-txt">{opt}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions per line */}
                                            <div className="col-act">
                                                <button
                                                    type="button"
                                                    className={`btn-action-mini btn-sensitive-toggle ${isLineSensitive(line) ? 'active-sensitive' : ''}`}
                                                    title={isLineSensitive(line) ? (lang === 'en' ? "Remove from mature scenes" : "لابردنی ئەم دێڕە لە دیمەنی نەشیاو") : (lang === 'en' ? "Mark this line as mature / sensitive scene (Family Mode)" : "نیشانکردنی ئەم دێڕە وەک دیمەنی نەشیاو (مۆدی خێزانی)")}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleLineSensitive(line);
                                                    }}
                                                >
                                                    <Shield size={12} color={isLineSensitive(line) ? "#f87171" : "currentColor"} />
                                                </button>
                                                <button
                                                    className="btn-action-mini btn-ai-single"
                                                    disabled={isTranslating}
                                                    title={lang === 'en' ? "Translate this line using AI" : "وەرگێڕانی تەنها ئەم دێڕە بە AI"}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        translateSingleLine(line);
                                                    }}
                                                >
                                                    {isTranslating ? <Loader2 size={12} className="spinning" /> : <Sparkles size={12} />}
                                                </button>
                                                <button
                                                    className="btn-action-mini btn-add-row"
                                                    title={lang === 'en' ? "Insert new line below" : "زیادکردنی دێڕێکی نوێ لە دوای ئەم دێڕە"}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        addNewLineAfter(idx);
                                                    }}
                                                >
                                                    <Plus size={12} />
                                                </button>
                                                <button
                                                    className="btn-action-mini btn-del-row"
                                                    title={lang === 'en' ? "Delete this line" : "سڕینەوەی ئەم دێڕە"}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteLine(line.id);
                                                    }}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Floating Toast Notification */}
                {toast && (
                    <div className={`dual-srt-toast ${toast.type}`}>
                        {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                        <span>{toast.msg}</span>
                    </div>
                )}
            </div>

            {/* Subtitle Diff & History Modal */}
            {showDiffViewer && (
                <SubtitleDiffViewer
                    movieId={movieId}
                    movieTitle={movieTitle}
                    seasonNum={seasonNum}
                    episodeNum={episodeNum}
                    episodeTitle={episodeTitle}
                    onClose={() => setShowDiffViewer(false)}
                    onRestored={() => {
                        setShowDiffViewer(false);
                        showToast('نوسخەکە بە سەرکەوتوویی گەڕێنرایەوە ✓');
                        window.location.reload();
                    }}
                />
            )}

            {/* Internal Team Notes Modal */}
            {showNotesModal && (
                <InternalNotesModal
                    movieId={movieId}
                    movieTitle={movieTitle}
                    seasonNum={seasonNum}
                    episodeNum={episodeNum}
                    episodeTitle={episodeTitle}
                    onClose={() => setShowNotesModal(false)}
                />
            )}

            {/* QUICK GLOSSARY DRAWER MODAL */}
            {showGlossaryDrawer && (
                <div className="glossary-drawer-backdrop" onClick={() => setShowGlossaryDrawer(false)}>
                    <div className="glossary-drawer-content" onClick={e => e.stopPropagation()}>
                        <div className="glossary-drawer-header">
                            <div className="drawer-title-wrap">
                                <BookOpen size={18} color="#10b981" />
                                <h3>{lang === 'en' ? 'Terminology Glossary' : 'فەرهەنگۆکی زاراوەکان'} ({glossary.length})</h3>
                            </div>
                            <button className="btn-drawer-close" onClick={() => setShowGlossaryDrawer(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Quick Add Term Box */}
                        <form onSubmit={handleAddQuickTerm} className="drawer-quick-add-form">
                            <div className="drawer-quick-add-top">
                                <span className="drawer-add-title">{lang === 'en' ? '➕ Add New Term:' : '➕ زیادکردنی زاراوەی نوێ:'}</span>
                                <div className="drawer-scope-radios">
                                    <label className="scope-radio-label">
                                        <input 
                                            type="radio" 
                                            name="termScope" 
                                            checked={newTermScope === 'show'} 
                                            onChange={() => setNewTermScope('show')} 
                                        />
                                        <span>🎬 {lang === 'en' ? `Show-specific: ${movieTitle || 'Current'}` : `تایبەت بە ${movieTitle || 'ئەم زنجیرەیە'}`}</span>
                                    </label>
                                    <label className="scope-radio-label">
                                        <input 
                                            type="radio" 
                                            name="termScope" 
                                            checked={newTermScope === 'global'} 
                                            onChange={() => setNewTermScope('global')} 
                                        />
                                        <span>🌐 {lang === 'en' ? 'Global Glossary' : 'گشتی'}</span>
                                    </label>
                                </div>
                            </div>
                            <div className="drawer-quick-add-inputs">
                                <input
                                    type="text"
                                    placeholder="English (e.g. barn, walkers)"
                                    value={newTermEn}
                                    onChange={e => setNewTermEn(e.target.value)}
                                    dir="ltr"
                                    required
                                    className="drawer-input-en"
                                />
                                <input
                                    type="text"
                                    placeholder={lang === 'en' ? "Kurdish translation (e.g. تەویلە)" : "واتای کوردی (وەک: تەویلە، زۆمبی)"}
                                    value={newTermKu}
                                    onChange={e => setNewTermKu(e.target.value)}
                                    dir="rtl"
                                    required
                                    className="drawer-input-ku"
                                />
                                <button type="submit" className="btn-drawer-add" disabled={addingTerm}>
                                    {addingTerm ? '...' : <Plus size={14} />} {lang === 'en' ? 'Add' : 'زیادکردن'}
                                </button>
                            </div>
                        </form>

                        {/* Scope Filter Tabs */}
                        <div className="drawer-tabs-row">
                            <button 
                                type="button" 
                                className={`drawer-tab-btn ${glossaryTab === 'show' ? 'active' : ''}`}
                                onClick={() => setGlossaryTab('show')}
                            >
                                🎬 {lang === 'en' ? `Show (${glossary.filter(g => g.movieId === movieId).length})` : `تایبەت بە ${movieTitle || 'زنجیرەکە'} (${glossary.filter(g => g.movieId === movieId).length})`}
                            </button>
                            <button 
                                type="button" 
                                className={`drawer-tab-btn ${glossaryTab === 'global' ? 'active' : ''}`}
                                onClick={() => setGlossaryTab('global')}
                            >
                                🌐 {lang === 'en' ? `Global (${glossary.filter(g => !g.movieId || g.movieId === 'global').length})` : `فەرهەنگی گشتی (${glossary.filter(g => !g.movieId || g.movieId === 'global').length})`}
                            </button>
                            <button 
                                type="button" 
                                className={`drawer-tab-btn ${glossaryTab === 'all' ? 'active' : ''}`}
                                onClick={() => setGlossaryTab('all')}
                            >
                                {lang === 'en' ? `All (${glossary.length})` : `هەمووی (${glossary.length})`}
                            </button>
                        </div>

                        <div className="glossary-drawer-search">
                            <Search size={16} className="drawer-search-icon" />
                            <input 
                                type="text"
                                placeholder="گەڕان بۆ هەر وشە یان زاراوەیەک..."
                                value={glossarySearch}
                                onChange={e => setGlossarySearch(e.target.value)}
                            />
                            {glossarySearch && (
                                <button className="btn-drawer-clear" onClick={() => setGlossarySearch('')}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <div className="glossary-drawer-list">
                            {glossary
                                .filter(g => {
                                    if (glossaryTab === 'show') {
                                        if (g.movieId !== movieId) return false;
                                    } else if (glossaryTab === 'global') {
                                        if (g.movieId && g.movieId !== 'global') return false;
                                    }

                                    if (!glossarySearch.trim()) return true;
                                    const q = glossarySearch.toLowerCase().trim();
                                    return (
                                        g.english.toLowerCase().includes(q) ||
                                        g.kurdish.toLowerCase().includes(q) ||
                                        (g.note && g.note.toLowerCase().includes(q))
                                    );
                                })
                                .map(item => (
                                    <div key={item.id} className="glossary-drawer-item">
                                        <div className="drawer-item-top">
                                            <div className="drawer-item-terms">
                                                <span className="drawer-item-en">{item.english}</span>
                                                <span className="drawer-item-arrow">➜</span>
                                                <span className="drawer-item-ku">{item.kurdish}</span>
                                            </div>
                                            <div className="drawer-item-badges">
                                                {item.movieId === movieId ? (
                                                    <span className="drawer-badge-show">🎬 ئەم بەرهەمە</span>
                                                ) : (
                                                    <span className="drawer-badge-global">🌐 گشتی</span>
                                                )}
                                                <span className="drawer-item-cat">{item.category || 'گشتی'}</span>
                                            </div>
                                        </div>
                                        {item.note && <p className="drawer-item-note">💡 {item.note}</p>}
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Subtitle QC Quality Control Modal */}
            {showQcModal && (
                <SubtitleQcModal
                    lines={lines}
                    onApplyAutoFix={(fixedLines) => {
                        setLines(fixedLines);
                        showToast('کێشەکانی کاتی سەبتایتڵ بە سەرکەوتوویی چاککران ✓');
                    }}
                    onJumpToLine={(lineId) => jumpToLine(lineId)}
                    onClose={() => setShowQcModal(false)}
                />
            )}

            {/* Sensitive / Inappropriate Scenes Management Modal (Family Mode) */}
            {showSensitiveModal && (
                <div className="sensitive-modal-backdrop" onClick={() => setShowSensitiveModal(false)}>
                    <div className="sensitive-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="sensitive-modal-header">
                            <div className="sensitive-title-wrap">
                                <Shield size={20} color="#ef4444" />
                                <div>
                                    <h3>{lang === 'en' ? 'Manage Mature & Sensitive Scenes' : 'بەڕێوەبردنی دیمەنە نەشیاوەکان (مۆدی خێزانی)'}</h3>
                                    <p>{lang === 'en' ? 'Scenes marked here will be automatically skipped or blurred when users enable Family Mode.' : 'ئەو دیمەنانەی لێرە نیشان دەکرێن، کاتێک بینەر مۆدی خێزانی دەکاتەوە ڕاستەوخۆ تێدەپەڕێندرێن یان لێڵ دەکرێن.'}</p>
                                </div>
                            </div>
                            <button className="btn-drawer-close" onClick={() => setShowSensitiveModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="sensitive-modal-body">
                            {/* Manual Time Range Builder Form */}
                            <form onSubmit={handleAddManualRange} className="sensitive-manual-range-form">
                                <div className="manual-form-title">
                                    <span>{lang === 'en' ? '➕ Add Custom Non-Dialogue Time Range:' : '➕ زیادکردنی مەودای کاتی بێ قسە بە دەست:'}</span>
                                </div>
                                <div className="manual-inputs-row">
                                    <div className="manual-input-wrap">
                                        <label>{lang === 'en' ? 'Start Time:' : 'کاتی دەستپێک:'}</label>
                                        <div className="input-with-pin">
                                            <input
                                                type="text"
                                                placeholder="00:00:00,000"
                                                value={manualStartStr}
                                                onChange={e => setManualStartStr(e.target.value)}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="btn-pin-time"
                                                title={lang === 'en' ? "Grab current video timestamp" : "وەرگرتنی کاتی هەنووکەی ڤیدیۆ"}
                                                onClick={() => setManualStartStr(secToTimeString(currentTime))}
                                            >
                                                ⏱️
                                            </button>
                                        </div>
                                    </div>
                                    <div className="manual-input-wrap">
                                        <label>{lang === 'en' ? 'End Time:' : 'کاتی کۆتایی:'}</label>
                                        <div className="input-with-pin">
                                            <input
                                                type="text"
                                                placeholder="00:00:10,000"
                                                value={manualEndStr}
                                                onChange={e => setManualEndStr(e.target.value)}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="btn-pin-time"
                                                title={lang === 'en' ? "Grab current video timestamp" : "وەرگرتنی کاتی هەنووکەی ڤیدیۆ"}
                                                onClick={() => setManualEndStr(secToTimeString(currentTime))}
                                            >
                                                ⏱️
                                            </button>
                                        </div>
                                    </div>
                                    <button type="submit" className="btn-add-manual-submit">
                                        <Plus size={14} /> {lang === 'en' ? 'Add Range' : 'زیادکردن'}
                                    </button>
                                </div>
                            </form>

                            {/* Quick Add at current video time */}
                            <div className="sensitive-quick-add-box">
                                <div className="quick-add-info">
                                    <span>{lang === 'en' ? 'Current Video Time:' : 'کاتی هەنووکەی ڤیدیۆ:'} <strong>{secToTimeString(currentTime)}</strong> ({Math.floor(currentTime)}s)</span>
                                </div>
                                <div className="quick-preset-btns-row">
                                    <button
                                        type="button"
                                        className="btn-add-sensitive-now"
                                        onClick={() => handleQuickAddSensitivePreset(5)}
                                    >
                                        +5s
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-add-sensitive-now"
                                        onClick={() => handleQuickAddSensitivePreset(10)}
                                    >
                                        +10s
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-add-sensitive-now"
                                        onClick={() => handleQuickAddSensitivePreset(20)}
                                    >
                                        +20s
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-add-sensitive-now"
                                        onClick={() => handleQuickAddSensitivePreset(30)}
                                    >
                                        +30s
                                    </button>
                                </div>
                            </div>

                            {/* List of Marked Scenes */}
                            <div className="sensitive-scenes-list-header">
                                <h4>{lang === 'en' ? `Marked Sensitive Ranges (${sensitiveScenes.length})` : `دیمەنە نیشانکراوەکان (${sensitiveScenes.length})`}</h4>
                                {sensitiveScenes.length > 0 && (
                                    <button
                                        type="button"
                                        className="btn-clear-all-sensitive"
                                        onClick={() => {
                                            if (window.confirm(lang === 'en' ? 'Clear all sensitive scene markers?' : 'ئایا دڵنیایت دەتەوێت هەموو دیمەنە نەشیاوەکان بسڕیتەوە؟')) {
                                                setSensitiveScenes([]);
                                                showToast(lang === 'en' ? 'All sensitive scenes cleared' : 'هەموو نیشانەکان سڕانەوە');
                                            }
                                        }}
                                    >
                                        <Trash2 size={13} />
                                        <span>{lang === 'en' ? 'Clear All' : 'سڕینەوەی هەمووی'}</span>
                                    </button>
                                )}
                            </div>

                            {sensitiveScenes.length === 0 ? (
                                <div className="sensitive-empty-state">
                                    <Shield size={36} color="#ef4444" style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                                    <p>{lang === 'en' ? 'No sensitive scenes marked for this title.' : 'هیچ دیمەنێکی نەشیاو نیشان نەکراوە بۆ ئەم بەرهەمە.'}</p>
                                    <span className="sensitive-empty-hint">{lang === 'en' ? 'You can 1-click the shield icon 🛡️ on any subtitle line or click the button above during playback.' : 'دەتوانیت بە یەک کلیک لەسەر ئایکۆنی 🛡️ لە ڕیزی سەبتایتڵەکان یان دوگمەی کاتی ڤیدیۆ دیمەنە نەشیاوەکان نیشان بکەیت.'}</span>
                                </div>
                            ) : (
                                <div className="sensitive-scenes-table">
                                    {sensitiveScenes.map((scene, sIdx) => {
                                        const duration = Math.max(1, scene.end - scene.start);
                                        return (
                                            <div key={sIdx} className="sensitive-scene-row">
                                                <div className="scene-row-num">#{sIdx + 1}</div>
                                                <div className="scene-row-times">
                                                    <div className="scene-time-pill">
                                                        <span className="pill-tag">{lang === 'en' ? 'Start' : 'دەستپێک'}</span>
                                                        <span className="pill-val">{secToTimeString(scene.start)}</span>
                                                    </div>
                                                    <span className="scene-arrow">➜</span>
                                                    <div className="scene-time-pill">
                                                        <span className="pill-tag">{lang === 'en' ? 'End' : 'کۆتایی'}</span>
                                                        <span className="pill-val">{secToTimeString(scene.end)}</span>
                                                    </div>
                                                    <span className="scene-duration-badge">({duration}s)</span>
                                                </div>
                                                <div className="scene-row-actions">
                                                    <button
                                                        type="button"
                                                        className="btn-scene-action btn-scene-play"
                                                        title={lang === 'en' ? "Play video at this scene" : "لێدانی ڤیدیۆ لە دەستپێکی ئەم دیمەنە"}
                                                        onClick={() => {
                                                            seekToTime(scene.start);
                                                            setShowSensitiveModal(false);
                                                        }}
                                                    >
                                                        <Play size={12} fill="currentColor" /> {lang === 'en' ? 'Preview' : 'بینین'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-scene-action btn-scene-del"
                                                        title={lang === 'en' ? "Delete this sensitive scene" : "سڕینەوەی ئەم دیمەنە"}
                                                        onClick={() => {
                                                            setSensitiveScenes(prev => prev.filter((_, idx) => idx !== sIdx));
                                                        }}
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="sensitive-modal-footer">
                            <button type="button" className="btn-sensitive-save-close" onClick={() => setShowSensitiveModal(false)}>
                                <Check size={16} /> {lang === 'en' ? 'Done' : 'تەواو'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
