import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { Plus, X, Trash2, Edit2, Play, CreditCard, Save, RotateCcw, Frown, Smile, CheckSquare, Sparkles, Loader2, AlertCircle, Mic, MicOff, Brain, BookOpen, MessageSquare, Volume1, Languages, Search, Boxes, Award, CheckCircle2, Download, Upload, FileText, FileSpreadsheet, Layers, Filter, ArrowUpDown, Square, FileUp, FileDown, MoreHorizontal, Check, FolderInput, Copy, FilePlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './Flashcards.css';

interface FlashcardContext {
    quote?: string;
    translatedQuote?: string;
    sourceLabel?: string;
    movieId?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    episodeTitle?: string;
    timestamp?: number;
    subtitleId?: number;
}

interface FlashcardMediaRef {
    mode?: 'local_extract' | 'remote_static';
    localRef?: {
        movieId: string;
        seasonNumber?: number;
        episodeNumber?: number;
        timestamp: number;
    };
    remote?: {
        screenshotUrl?: string | null;
        audioUrl?: string | null;
    };
}

interface FlashcardMediaAssets {
    screenshot?: string | null;
    audio?: string | null;
}

interface Card {
    id: string;
    front: string; // English
    back: string;  // Kurdish
    ease?: number;
    interval?: number;
    nextReview?: number;
    box?: number;
    reps?: number;
    createdAt?: number;
    cardType?: 'word' | 'subtitle' | string;
    context?: FlashcardContext;
    mediaRef?: FlashcardMediaRef;
    mediaAssets?: FlashcardMediaAssets;
}

type PracticeWindow = 'today' | 'week' | 'month' | 'all';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const FLASHCARD_MEDIA_MODE = (import.meta.env.VITE_FLASHCARD_MEDIA_MODE || 'local_extract') as 'local_extract' | 'remote_static';

export default function Flashcards() {
    const navigate = useNavigate();
    const { lang, t } = useLanguage();
    const [cards, setCards] = useState<Card[]>([]);
    const [view, setView] = useState<'manage' | 'practice' | 'reading'>('manage');
    const { user, syncProgress, updateCredits } = useAuth();
    const [authPrompt, setAuthPrompt] = useState<{ open: boolean; title: string; message: string } | null>(null);

    // كلیلی تایبەت بە بەکارهێنەر — هەر هەژمارەک فلاشکارتی خۆیدەهێلێتەوە
    const flashcardKey = `kurdish_stream_flashcards_${user?.id || 'guest'}`;
    // Word Bank & Manage States
    const [cardSearch, setCardSearch] = useState('');
    const [cardFilter, setCardFilter] = useState<'all' | 'due' | 'learned' | 'movie'>('all');
    const [cardSort, setCardSort] = useState<'newest' | 'oldest' | 'az' | 'ease'>('newest');
    const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
    const [bulkTextModalOpen, setBulkTextModalOpen] = useState(false);
    const [bulkImportText, setBulkImportText] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [importMenuOpen, setImportMenuOpen] = useState(false);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const importMenuRef = useRef<HTMLDivElement | null>(null);
    const exportMenuRef = useRef<HTMLDivElement | null>(null);
    const sortMenuRef = useRef<HTMLDivElement | null>(null);

    // داخستنی مینیوەکان کاتێک کلیک لە دەرەوە دەکرێت (Click Outside to Close)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
                setImportMenuOpen(false);
            }
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
                setExportMenuOpen(false);
            }
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
                setSortMenuOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setImportMenuOpen(false);
                setExportMenuOpen(false);
                setSortMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const [globalToasts, setGlobalToasts] = useState<{ id: number, msg: string, type: 'error' | 'success' }[]>([]);
    const [sceneMedia, setSceneMedia] = useState<FlashcardMediaAssets>({ screenshot: null, audio: null });
    const [sceneMediaLoading, setSceneMediaLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Reading & AI Evaluation State
    const [readingText, setReadingText] = useState('');
    const [spokenText, setSpokenText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [readingScore, setReadingScore] = useState<number | null>(null);
    const [aiFeedback, setAiFeedback] = useState('');
    const [isAiFeedbackLoading, setIsAiFeedbackLoading] = useState(false);
    const [strictMode, setStrictMode] = useState(false);
    const [speechConfidence, setSpeechConfidence] = useState(1);

    const showGlobalToast = (msg: string, type: 'error' | 'success' = 'error') => {
        const id = Date.now();
        setGlobalToasts(t => [...t, { id, msg, type }]);
        setTimeout(() => setGlobalToasts(t => t.filter(x => x.id !== id)), 4000);
    };

    const extractApiError = (err: any, fallback: string) => {
        if (err?.response?.status === 401) {
            return 'تکایە سەرەتا بچۆ ژوورەوە (Login) بۆ ئەوەی بتوانیت خزمەتگوزاری ژیری دەستکرد (AI) بەکاربهێنیت.';
        }
        if (err?.response?.status === 402) {
            return err?.response?.data?.error?.message || 'کرێدیتی پێویستت نییە بۆ بەکارهێنانی ئەم تایبەتمەندییە.';
        }
        return err?.response?.data?.error?.message || err?.response?.data?.error || fallback;
    };

    const formatSceneTime = (seconds?: number) => {
        if (!Number.isFinite(seconds)) return '';
        const total = Math.max(0, Math.floor(seconds || 0));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    const persistCardPatch = (cardId: string, patch: Partial<Card>) => {
        if (!user) return;
        const userKey = `kurdish_stream_flashcards_${user.id}`;
        const updated = cards.map(card => card.id === cardId ? { ...card, ...patch } : card);
        setCards(updated);
        localStorage.setItem(userKey, JSON.stringify(updated));
        syncProgress({ flashcards: updated });
    };

    const resolveCardMedia = async (card: Card): Promise<FlashcardMediaAssets> => {
        if (card.mediaAssets?.screenshot || card.mediaAssets?.audio) {
            return {
                screenshot: card.mediaAssets?.screenshot || null,
                audio: card.mediaAssets?.audio || null
            };
        }

        if (FLASHCARD_MEDIA_MODE === 'remote_static' && card.mediaRef?.remote) {
            return {
                screenshot: card.mediaRef.remote.screenshotUrl || null,
                audio: card.mediaRef.remote.audioUrl || null
            };
        }

        if (!card.mediaRef?.localRef?.movieId) {
            return { screenshot: null, audio: null };
        }

        const res = await apiClient.post('/api/flashcards/media', {
            movieId: card.mediaRef.localRef.movieId,
            seasonNumber: card.mediaRef.localRef.seasonNumber,
            episodeNumber: card.mediaRef.localRef.episodeNumber,
            timestamp: card.mediaRef.localRef.timestamp
        });

        return {
            screenshot: res.data?.screenshotBase64 || res.data?.screenshotUrl || null,
            audio: res.data?.audioClipBase64 || res.data?.audioUrl || null
        };
    };
    
    // Manage state
    const [frontText, setFrontText] = useState('');
    const [backText, setBackText] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

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
        const extraPenalty = Math.max(0, spW.length - hits) * 0.05;
        let score = (targetMatch - extraPenalty) * 100;
        if (isStrict) score = score * confidence;
        return Math.max(0, Math.min(100, Math.round(score)));
    };

    const doTTS = (text: string) => {
        if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const cleanText = text.replace(/["'«»]/g, '').trim();
            const utt = new SpeechSynthesisUtterance(cleanText);
            utt.lang = 'en-US';
            utt.rate = 0.88;
            utt.pitch = 1.0;

            const voices = window.speechSynthesis.getVoices();
            const enVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('David') || v.name.includes('Zira'))) || voices.find(v => v.lang.startsWith('en'));
            if (enVoice) utt.voice = enVoice;

            setTimeout(() => {
                window.speechSynthesis.speak(utt);
            }, 50);
        } catch (e) {
            console.warn('TTS error:', e);
        }
    };

    const [speechErrorType, setSpeechErrorType] = useState<string | null>(null);

    const startReadingPractice = async () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            showGlobalToast('برۆزەرەکەت پشتگیری ناسینەوەی دەنگ ناکات. تکایە Chrome یان Microsoft Edge بەکاربهێنە.', 'error');
            return;
        }

        setSpeechErrorType(null);

        try {
            // Check mic permission
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
            }
        } catch (micErr) {
            console.warn('Microphone permission error', micErr);
            showGlobalToast('تکایە لە برۆزەرەکەت ڕێگە بە مایکرۆفۆن (Allow Microphone) بدە بۆ تۆمارکردنی دەنگ.', 'error');
            return;
        }

        setIsRecording(true);
        setReadingScore(null);
        setAiFeedback('');
        setSpokenText('');

        try {
            const r = new SR();
            r.lang = 'en-US';
            r.continuous = false;
            r.interimResults = true;
            r.maxAlternatives = 1;

            let finalTranscript = '';

            r.onresult = (e: any) => {
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal) {
                        finalTranscript += e.results[i][0].transcript;
                    } else {
                        interim += e.results[i][0].transcript;
                    }
                }
                const currentSpoken = (finalTranscript || interim || '').trim();
                if (currentSpoken) {
                    setSpokenText(currentSpoken);
                }
            };

            r.onerror = (e: any) => {
                console.error('SR error', e.error);
                setIsRecording(false);
                setSpeechErrorType(e.error);
                if (e.error === 'not-allowed') {
                    showGlobalToast('مایکرۆفۆنەکەت ڕێگەی پێنەدراوە. تکایە ڕێگە بدە.', 'error');
                } else if (e.error === 'no-speech') {
                    showGlobalToast('هیچ دەنگێک نەبیسترا. تکایە کەمێک بەرزتر قسە بکە.', 'error');
                }
            };

            r.onend = () => {
                setIsRecording(false);
                if (finalTranscript.trim()) {
                    setSpokenText(finalTranscript);
                    const score = calcScore(finalTranscript, readingText, 1, strictMode);
                    setReadingScore(score);
                }
            };

            r.start();
        } catch (err) {
            console.error('Failed to start speech recognition', err);
            setIsRecording(false);
            showGlobalToast('دەستپێکردنی تۆمارکەری دەنگ سەرکەوتوو نەبوو.', 'error');
        }
    };

    const getAiReadingFeedback = async () => {
        if (!spokenText || !readingText) return;
        setIsAiFeedbackLoading(true);
        setAiFeedback('');

        if (!user) {
            showGlobalToast('تکایە سەرەتا بچۆ ژوورەوە (Login) بۆ ئەوەی بتوانیت شیکاری ڕاهێنەری AI بەکاربهێنیت.', 'error');
            return;
        }

        try {
            const res = await apiClient.post('/api/ai/generate', {
                contents: [{ parts: [{ text: `You are an English language pronunciation coach. The user tried to read this text: "${readingText}". However, the speech recognition heard them say: "${spokenText}". Briefly explain in Kurdish Sorani (کوردی سۆرانی) what their mistakes were and how to pronounce the misunderstood words correctly. If they were very close, encourage them. WARNING: You MUST write the Kurdish explanation in the Arabic alphabet only. Never use Latin letters for Kurdish words! Ensure proper Right-To-Left formatting.` }] }],
                aiTask: 'voice_correction'
            });
            const feedback = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'وەڵامێک نەهات.';
            setAiFeedback(feedback);
            if (res.data.remainingCredits !== undefined) updateCredits(res.data.remainingCredits);
        } catch (err: any) {
            const msg = extractApiError(err, 'هەڵەیەک ڕوویدا لە کاتی شیکارکردندا.');
            showGlobalToast(msg, 'error');
        } finally {
            setIsAiFeedbackLoading(false);
        }
    };
    
    // AI Variations State
    const [aiVarModalOpen, setAiVarModalOpen] = useState(false);
    const [aiVarTarget, setAiVarTarget] = useState<Card | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiVariations, setAiVariations] = useState<{front: string, back: string}[]>([]);
    const [selectedAiIndices, setSelectedAiIndices] = useState<Set<number>>(new Set([0, 1, 2]));

    const generateVariations = async (card: Card) => {
        setAiVarTarget(card);
        setAiVarModalOpen(true);
        setIsAiLoading(true);
        setAiVariations([]);
        setSelectedAiIndices(new Set([0, 1, 2]));

        try {
            const backMeaning = card.back?.trim() ? ` with intended Kurdish meaning "${card.back.trim()}"` : '';
            const promptText = `You are an expert Kurdish Sorani linguist and English teacher.
The user has a flashcard with:
- English: "${card.front}"
${card.back?.trim() ? `- Kurdish Translation: "${card.back.trim()}"` : ''}

Generate 3 natural, practical, and everyday English sentences using the word "${card.front}"${backMeaning}.
For each sentence, provide an accurate and natural Kurdish Sorani translation.

STRICT RULES:
1. Kurdish MUST be in standard Kurdish Sorani Arabic script (ئـ، پ، چ، ژ، گ، ڤ، ۆ، ێ، ڕ، ڵ، هـ). Never use Latin script for Kurdish.
2. Maintain the exact meaning and spelling of "${card.back || card.front}" in the Kurdish translations without inventing weird variations or bad suffixes.
3. Keep sentences clear, conversational, and educational.

Return STRICTLY a JSON array of 3 objects with NO markdown or explanation:
[{"front": "English sentence", "back": "ڕستەی کوردی سۆرانی بە ڕێزمانی تەواو"}]`;

            const res = await apiClient.post('/api/ai/generate', {
                contents: [{ parts: [{ text: promptText }] }],
                aiTask: 'flashcard_generation'
            });
            let rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(rawText);
            
            if (Array.isArray(parsed) && parsed.length > 0) {
                setAiVariations(parsed);
                setSelectedAiIndices(new Set(parsed.map((_, i) => i)));
                if (res.data.remainingCredits !== undefined) {
                    updateCredits(res.data.remainingCredits);
                }
            }
        } catch (err: any) {
            console.error(err);
            if (err?.response?.status === 402) {
                const msg = extractApiError(err, 'کرێدیتی پێویستت نییە بۆ دروستکردنی نموونە.');
                showGlobalToast(msg, 'error');
            }
        } finally {
            setIsAiLoading(false);
        }
    };

    const toggleAiVariationSelection = (idx: number) => {
        setSelectedAiIndices(prev => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
            }
            return next;
        });
    };

    const addSingleVariationToDeck = (v: { front: string, back: string }) => {
        const now = Date.now();
        const newCard: Card = {
            id: now.toString(),
            front: v.front,
            back: v.back,
            ease: 2.5,
            interval: 0,
            nextReview: now
        };
        saveCards([newCard, ...cards]);
        showGlobalToast(lang === 'en' ? 'Card added successfully! 🎉' : 'کارتەکە بە سەرکەوتوویی زیادکرا! 🎉', 'success');
    };

    const addSelectedVariationsToDeck = () => {
        const selected = aiVariations.filter((_, i) => selectedAiIndices.has(i));
        if (selected.length === 0) return;
        const now = Date.now();
        const newCards: Card[] = selected.map((v, idx) => ({
            id: (now + idx).toString(),
            front: v.front,
            back: v.back,
            ease: 2.5,
            interval: 0,
            nextReview: now
        }));
        saveCards([...newCards, ...cards]);
        setAiVarModalOpen(false);
        setAiVarTarget(null);
        showGlobalToast(
            lang === 'en' 
                ? `${newCards.length} cards added to Word Bank! 🎉` 
                : `${newCards.length} کارت بە سەرکەوتوویی زیادکران! 🎉`, 
            'success'
        );
    };
    
    // Practice state
    const [isFlipped, setIsFlipped] = useState(false);
    const [blurLevel, setBlurLevel] = useState(12);
    const [showImage, setShowImage] = useState(true);
    const [practicePercent, setPracticePercent] = useState(100);
    const [practiceWindow, setPracticeWindow] = useState<PracticeWindow>('all');
    const [practiceSessionIds, setPracticeSessionIds] = useState<string[]>([]);
    const [practiceRemainingIds, setPracticeRemainingIds] = useState<string[]>([]);

    useEffect(() => {
        if (!user) {
            // No user logged in -> Must be 100% empty and clean up old test/guest storage
            try {
                localStorage.removeItem('kurdish_stream_flashcards_guest');
                localStorage.removeItem('kurdish_stream_flashcards');
            } catch (e) {}
            setCards([]);
            return;
        }

        const userKey = `kurdish_stream_flashcards_${user.id}`;
        let saved = localStorage.getItem(userKey);
        let initialCards: Card[] = [];

        if (saved) {
            try {
                const parsed: Card[] = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    initialCards = parsed;
                }
            } catch (e) { }
        }

        if (user.flashcards && Array.isArray(user.flashcards) && user.flashcards.length > 0) {
            const map = new Map<string, Card>();
            user.flashcards.forEach((c: any) => map.set(c.id, c));
            initialCards.forEach(c => map.set(c.id, c));
            initialCards = Array.from(map.values());
        }

        if (initialCards.length > 0) {
            const validated = initialCards.map((c, idx) => ({
                ...c,
                ease: c.ease || 2.5,
                interval: c.interval || 0,
                nextReview: c.nextReview || Date.now(),
                createdAt: c.createdAt || (Number(c.id) > 1000000000000 ? Number(c.id) : (Date.now() - (idx * 60000)))
            }));
            setCards(validated);
            localStorage.setItem(userKey, JSON.stringify(validated));
        } else {
            setCards([]);
        }
    }, [user?.id, user?.flashcards]);

    const saveCards = (newCards: Card[]) => {
        if (!user) return;
        const userKey = `kurdish_stream_flashcards_${user.id}`;
        setCards(newCards);
        localStorage.setItem(userKey, JSON.stringify(newCards));
        syncProgress({ flashcards: newCards });
    };

    const handleSave = () => {
        if (!frontText.trim() || !backText.trim()) return;
        
        if (editingId) {
            saveCards(cards.map(c => c.id === editingId ? { ...c, front: frontText, back: backText } : c));
            setEditingId(null);
        } else {
            const now = Date.now();
            const newCard: Card = { 
                id: now.toString(), 
                front: frontText, 
                back: backText, 
                ease: 2.5, 
                interval: 0, 
                nextReview: now,
                createdAt: now
            };
            saveCards([newCard, ...cards]);
        }
        setFrontText('');
        setBackText('');
    };

    const handleEdit = (c: Card) => {
        setFrontText(c.front);
        setBackText(c.back);
        setEditingId(c.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = (id: string) => {
        if (!confirm('ئایا دڵنیایت لە سڕینەوەی ئەم کارتە؟')) return;
        saveCards(cards.filter(c => c.id !== id));
    };

    const getPracticeCutoff = (window: PracticeWindow) => {
        const now = new Date();
        if (window === 'today') {
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
        }
        if (window === 'week') {
            return Date.now() + (7 * 24 * 60 * 60 * 1000);
        }
        if (window === 'month') {
            return Date.now() + (30 * 24 * 60 * 60 * 1000);
        }
        return Infinity;
    };

    const getPracticePool = (window: PracticeWindow = 'all') => {
        const cutoff = getPracticeCutoff(window);
        if (window === 'all') {
            return allDueCards.length > 0 ? allDueCards : cards;
        }
        return cards.filter(card => !card.nextReview || card.nextReview <= cutoff);
    };

    const shuffleCards = (input: Card[]) => {
        const arr = [...input];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const createPracticeSessionIds = (window: PracticeWindow = 'all', percent: number = 100) => {
        const pool = getPracticePool(window);
        if (pool.length === 0) return [];

        const size = percent >= 100
            ? pool.length
            : Math.min(pool.length, Math.max(1, Math.round((pool.length * percent) / 100)));

        return shuffleCards(pool).slice(0, size).map(card => card.id);
    };

    const startPractice = () => {
        if (!user) {
            setAuthPrompt({
                open: true,
                title: 'پێویستە هەژمار دروست بکەیت',
                message: 'بۆ تاقیکردنەوە و بەکارهێنانی فلاش کارتەکانت، تکایە خۆت تۆمار بکە یان بچۆ ژوورەوە.'
            });
            return;
        }
        if (cards.length === 0) return;
        const sessionIds = createPracticeSessionIds(practiceWindow, 100);
        if (sessionIds.length === 0) {
            showGlobalToast('هیچ کارتێک بۆ ئەم هەڵبژاردنە نەدۆزرایەوە.', 'error');
            return;
        }
        setPracticeSessionIds(sessionIds);
        setPracticeRemainingIds(sessionIds);
        setIsFlipped(false);
        setView('practice');
    };

    const restartPractice = () => {
        if (practiceSessionIds.length === 0) {
            startPractice();
            return;
        }
        setPracticeRemainingIds(practiceSessionIds);
        setIsFlipped(false);
        setView('practice');
    };

    // Calculate due cards (cards where nextReview is in the past)
    const allDueCards = cards.filter(c => !c.nextReview || c.nextReview <= Date.now());
    allDueCards.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));

    const getCardBox = (card: Card): number => {
        if (card.box && card.box >= 1 && card.box <= 5) return card.box;
        const interval = card.interval || 0;
        if (interval <= 1) return 1;
        if (interval <= 3) return 2;
        if (interval <= 7) return 3;
        if (interval <= 16) return 4;
        return 5;
    };

    // Normalization helper for smart multi-word search (Kurdish, Arabic, and English)
    const normalizeSearchText = (text: string): string => {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '') // remove Arabic/Kurdish harakat/diacritics
            .replace(/[،,.\-–—:;!?؟"'«»()[\]{}ـ]/g, ' ') // remove punctuation and tatweel
            .replace(/[يى]/g, 'ی')
            .replace(/[ك]/g, 'ک')
            .replace(/[ة]/g, 'ە')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const filteredCards = useMemo(() => {
        const rawSearch = cardSearch.trim();
        const normSearch = normalizeSearchText(rawSearch);
        const searchTokens = normSearch.split(' ').filter(Boolean);

        let result = cards.filter(c => {
            const isDue = !c.nextReview || c.nextReview <= Date.now();
            if (cardFilter === 'due' && !isDue) return false;
            if (cardFilter === 'learned' && isDue) return false;
            if (cardFilter === 'movie' && !(c.cardType === 'subtitle' || Boolean(c.context?.sourceLabel))) return false;

            if (searchTokens.length === 0) return true;

            const cardCombined = normalizeSearchText([
                c.front,
                c.back,
                c.context?.quote || '',
                c.context?.translatedQuote || '',
                c.context?.sourceLabel || '',
                c.context?.episodeTitle || ''
            ].join(' '));

            // 1. Exact phrase match
            if (cardCombined.includes(normSearch)) return true;

            // 2. All search tokens match somewhere in the card (AND search)
            const allTokensMatch = searchTokens.every(tok => cardCombined.includes(tok));
            if (allTokensMatch) return true;

            // 3. Multi-word search fallback: at least one token matches (OR search)
            if (searchTokens.length > 1) {
                const matchCount = searchTokens.filter(tok => cardCombined.includes(tok)).length;
                if (matchCount >= 1) return true;
            }

            return false;
        });

        const getCardTime = (c: Card, fallbackIdx: number): number => {
            if (typeof c.createdAt === 'number' && Number.isFinite(c.createdAt) && c.createdAt > 0) return c.createdAt;
            const numId = Number(c.id);
            if (Number.isFinite(numId) && numId > 1000000000000) return numId;
            if (typeof c.nextReview === 'number' && Number.isFinite(c.nextReview)) return c.nextReview;
            return Date.now() - (fallbackIdx * 60000);
        };

        result.sort((a, b) => {
            // If searching with multiple words, prioritize cards with higher match relevance
            if (searchTokens.length > 1) {
                const textA = normalizeSearchText([a.front, a.back, a.context?.quote || '', a.context?.sourceLabel || ''].join(' '));
                const textB = normalizeSearchText([b.front, b.back, b.context?.quote || '', b.context?.sourceLabel || ''].join(' '));
                
                const scoreA = (textA.includes(normSearch) ? 100 : 0) + searchTokens.filter(tok => textA.includes(tok)).length * 10;
                const scoreB = (textB.includes(normSearch) ? 100 : 0) + searchTokens.filter(tok => textB.includes(tok)).length * 10;
                
                if (scoreA !== scoreB) {
                    return scoreB - scoreA;
                }
            }

            const idxA = cards.findIndex(c => c.id === a.id);
            const idxB = cards.findIndex(c => c.id === b.id);
            const timeA = getCardTime(a, idxA >= 0 ? idxA : 0);
            const timeB = getCardTime(b, idxB >= 0 ? idxB : 0);

            if (cardSort === 'newest') return timeB - timeA;
            if (cardSort === 'oldest') return timeA - timeB;
            if (cardSort === 'az') return a.front.trim().localeCompare(b.front.trim(), undefined, { sensitivity: 'base' });
            if (cardSort === 'ease') return (b.ease || 2.5) - (a.ease || 2.5);
            return 0;
        });

        return result;
    }, [cards, cardSearch, cardFilter, cardSort]);

    // Bulk selection handlers
    const toggleSelectCard = (id: string) => {
        setSelectedCardIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedCardIds.size === filteredCards.length && filteredCards.length > 0) {
            setSelectedCardIds(new Set());
        } else {
            setSelectedCardIds(new Set(filteredCards.map(c => c.id)));
        }
    };

    const handleBulkDelete = () => {
        if (selectedCardIds.size === 0) return;
        if (confirm(`دڵنیایت لە سڕینەوەی ${selectedCardIds.size} کارتی هەڵبژێردراو؟`)) {
            const updated = cards.filter(c => !selectedCardIds.has(c.id));
            saveCards(updated);
            setSelectedCardIds(new Set());
            showGlobalToast(`${selectedCardIds.size} کارت بە سەرکەوتوویی سڕانەوە.`, 'success');
        }
    };

    // Export Handlers
    const exportToJson = () => {
        setExportMenuOpen(false);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cards, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `kurdish_stream_flashcards_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showGlobalToast('فایلەکەت بە سەرکەوتوویی بە شێوازی JSON دابەزێنرا.', 'success');
    };

    const exportToCsv = () => {
        setExportMenuOpen(false);
        let csvContent = "data:text/csv;charset=utf-8,\uFEFFFront,Back,Quote,TranslatedQuote,Source,Box\n";
        cards.forEach(c => {
            const escapeCsv = (str: string = '') => `"${(str || '').replace(/"/g, '""')}"`;
            csvContent += `${escapeCsv(c.front)},${escapeCsv(c.back)},${escapeCsv(c.context?.quote)},${escapeCsv(c.context?.translatedQuote)},${escapeCsv(c.context?.sourceLabel)},${getCardBox(c)}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `kurdish_stream_flashcards_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        showGlobalToast('فایلەکەت بە سەرکەوتوویی بە شێوازی CSV / Excel دابەزێنرا.', 'success');
    };

    const exportToAnki = () => {
        setExportMenuOpen(false);
        let txtContent = "data:text/tab-separated-values;charset=utf-8,\uFEFF#separator:tab\n#html:true\n";
        cards.forEach(c => {
            const front = (c.front || '').replace(/\t/g, ' ');
            const back = (c.back || '').replace(/\t/g, ' ');
            const quote = c.context?.quote ? `<br><small style="color:#888;">"${c.context.quote}"</small>` : '';
            txtContent += `${front}${quote}\t${back}\n`;
        });
        const encodedUri = encodeURI(txtContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `kurdish_stream_anki_${new Date().toISOString().slice(0, 10)}.txt`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        showGlobalToast('فایلەکەت بۆ بەرنامەی Anki بە سەرکەوتوویی دابەزێنرا.', 'success');
    };

    // Import Handlers
    const importCards = (newCards: Card[]) => {
        const valid = newCards.filter(c => c.front && c.back);
        if (!valid.length) {
            showGlobalToast('هیچ کارتێکی دروست لە فایلەکەدا نەدۆزرایەوە.', 'error');
            return;
        }

        const existingFronts = new Set(cards.map(c => c.front.toLowerCase().trim()));
        let addedCount = 0;
        const merged = [...cards];

        valid.forEach(c => {
            if (!existingFronts.has(c.front.toLowerCase().trim())) {
                merged.push({
                    ...c,
                    id: c.id || `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    box: c.box || 1,
                    interval: c.interval || 0,
                    reps: c.reps || 0,
                    ease: c.ease || 2.5,
                    createdAt: c.createdAt || Date.now()
                });
                existingFronts.add(c.front.toLowerCase().trim());
                addedCount++;
            }
        });

        saveCards(merged);
        showGlobalToast(`سەرکەوتووانە ${addedCount} کارتی نوێ هاوردە کران (بەبێ دووبارەبوونەوە).`, 'success');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        setImportMenuOpen(false);
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                if (file.name.endsWith('.json')) {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                        importCards(parsed);
                    }
                } else if (file.name.endsWith('.csv') || file.name.endsWith('.txt') || file.name.endsWith('.tsv')) {
                    const lines = text.split('\n').filter(l => l.trim());
                    const imported: Card[] = [];
                    const startIdx = lines[0]?.toLowerCase().includes('front') ? 1 : 0;
                    for (let i = startIdx; i < lines.length; i++) {
                        const line = lines[i];
                        const parts = line.split(/[,\t]/);
                        if (parts.length >= 2) {
                            const front = parts[0].replace(/^["']|["']$/g, '').trim();
                            const back = parts[1].replace(/^["']|["']$/g, '').trim();
                            if (front && back) {
                                imported.push({
                                    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                    front,
                                    back,
                                    interval: 0,
                                    reps: 0,
                                    ease: 2.5,
                                    box: 1,
                                    createdAt: Date.now()
                                });
                            }
                        }
                    }
                    importCards(imported);
                }
            } catch (err) {
                showGlobalToast('هەڵەیەک ڕوویدا لە خوێندنەوەی فایلەکەدا.', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleBulkTextImport = () => {
        if (!bulkImportText.trim()) return;
        const lines = bulkImportText.split('\n').filter(l => l.trim());
        const imported: Card[] = [];

        lines.forEach(line => {
            // Support: "Word - وەرگێڕان", "Word : وەرگێڕان", "Word = وەرگێڕان", "Word, وەرگێڕان"
            const match = line.split(/[-:=,\t]/);
            if (match.length >= 2) {
                const front = match[0].trim();
                const back = match.slice(1).join(' ').trim();
                if (front && back) {
                    imported.push({
                        id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        front,
                        back,
                        interval: 0,
                        reps: 0,
                        ease: 2.5,
                        box: 1,
                        createdAt: Date.now()
                    });
                }
            }
        });

        if (imported.length > 0) {
            importCards(imported);
            setBulkImportText('');
            setBulkTextModalOpen(false);
        } else {
            showGlobalToast('تکایە دەقەکە بە شێوازی (Word - وەرگێڕان) بنووسە.', 'error');
        }
    };

    const practicePoolCount = getPracticePool(practiceWindow).length;
    const practiceSelectionCount = practicePoolCount === 0
        ? 0
        : Math.min(practicePoolCount, Math.max(1, Math.round((practicePoolCount * practicePercent) / 100)));

    const practiceRemainingCards = practiceRemainingIds
        .map(id => cards.find(card => card.id === id))
        .filter((card): card is Card => Boolean(card));

    const currentCard = practiceRemainingCards.length > 0 ? practiceRemainingCards[0] : null;

    useEffect(() => {
        let cancelled = false;

        const loadSceneMedia = async () => {
            if (view !== 'practice' || !currentCard) {
                setSceneMedia({ screenshot: null, audio: null });
                return;
            }

            if (!currentCard.mediaRef && !currentCard.mediaAssets) {
                setSceneMedia({ screenshot: null, audio: null });
                return;
            }

            setSceneMediaLoading(true);
            try {
                const media = await resolveCardMedia(currentCard);
                if (cancelled) return;
                setSceneMedia(media);

                if (!currentCard.mediaAssets?.screenshot && !currentCard.mediaAssets?.audio && (media.screenshot || media.audio)) {
                    persistCardPatch(currentCard.id, {
                        mediaAssets: {
                            screenshot: media.screenshot || null,
                            audio: media.audio || null
                        }
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('flashcard media load failed', err);
                    setSceneMedia({ screenshot: null, audio: null });
                }
            } finally {
                if (!cancelled) setSceneMediaLoading(false);
            }
        };

        loadSceneMedia();

        return () => {
            cancelled = true;
        };
    }, [currentCard?.id, view]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const playSceneAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        const validAudio = sceneMedia.audio && typeof sceneMedia.audio === 'string' && (sceneMedia.audio.startsWith('data:audio') || sceneMedia.audio.startsWith('http') || sceneMedia.audio.startsWith('blob:'));

        if (validAudio) {
            try {
                const audio = new Audio(sceneMedia.audio!);
                audioRef.current = audio;
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch((err) => {
                        console.warn('Scene audio failed, falling back to TTS', err);
                        doTTS(currentCard?.front || '');
                    });
                }
                return;
            } catch (err) {
                console.warn('Failed to play scene audio', err);
            }
        }

        if (currentCard?.front) {
            doTTS(currentCard.front);
        }
    };

    const rateCard = (rating: 'again' | 'hard' | 'good' | 'easy') => {
        if (!currentCard) return;

        let ease = currentCard.ease || 2.5;
        let interval = currentCard.interval || 0;

        if (rating === 'again') {
            ease = Math.max(1.3, ease - 0.2); // drop ease
            interval = 0; // Show again today/soon
        } else if (rating === 'hard') {
            ease = Math.max(1.3, ease - 0.15); // drop ease a bit
            interval = interval === 0 ? 1 : interval * 1.2;
        } else if (rating === 'good') {
            interval = interval === 0 ? 1 : interval === 1 ? 3 : interval * ease;
        } else if (rating === 'easy') {
            ease += 0.15; // boost ease
            interval = interval === 0 ? 4 : interval * ease * 1.3;
        }

        // Convert interval (in days) to timestamp
        // If 'again', show it again in 1 minute. Otherwise, full days.
        const nextReviewMs = Date.now() + (rating === 'again' || interval === 0 ? 60000 : interval * 24 * 60 * 60 * 1000);

        const updated = cards.map(c =>
            c.id === currentCard.id 
                ? { ...c, ease, interval, nextReview: nextReviewMs }
                : c
        );

        setIsFlipped(false);
        setPracticeRemainingIds(prev => prev.filter(id => id !== currentCard.id));
        setTimeout(() => {
            saveCards(updated);
        }, 150);
    };

    const touchStartXRef = useRef<number | null>(null);
    const touchStartYRef = useRef<number | null>(null);

    const handleCardTouchStart = (e: React.TouchEvent) => {
        touchStartXRef.current = e.touches[0].clientX;
        touchStartYRef.current = e.touches[0].clientY;
    };

    const handleCardTouchEnd = (e: React.TouchEvent) => {
        if (touchStartXRef.current === null || touchStartYRef.current === null) return;
        const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
        const diffY = e.changedTouches[0].clientY - touchStartYRef.current;
        touchStartXRef.current = null;
        touchStartYRef.current = null;

        // If swipe gesture detected (horizontal threshold > 50px)
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.4) {
            if (isFlipped) {
                if (diffX < 0) {
                    // Swiped Left: Good / Easy
                    rateCard('good');
                } else {
                    // Swiped Right: Again / Hard
                    rateCard('again');
                }
            } else {
                setIsFlipped(true);
            }
        }
    };

    return (
        <div className="flashcards-container" dir={lang === 'en' ? 'ltr' : 'rtl'}>
            <div className="fc-header">
                <div>
                    <h1 className="fc-title">
                        <BookOpen size={28} /> 
                        <span className="fc-title-main">{lang === 'en' ? 'My Word Bank' : 'فەرهەنگی وشەکانی من'}</span>
                    </h1>
                    <p className="fc-subtitle">
                        {lang === 'en' ? 'Saved vocabulary & smart pronunciation practice' : 'وشە سەیڤکراوەکان و ڕاهێنانی زیرەکی دەستکرد بە دەنگ'}
                    </p>
                </div>
                
                <div className="fc-view-toggles">
                    <button 
                        className={`fc-view-btn ${view === 'practice' ? 'active' : ''}`} 
                        onClick={() => {
                            if (!user) {
                                setAuthPrompt({
                                    open: true,
                                    title: 'پێویستە هەژمار دروست بکەیت',
                                    message: 'بۆ ئەنجامدانی تاقیکردنەوەی فلاش کارت، پێویستە سەرەتا بە هەژمارەکەت بچیتە ژوورەوە.'
                                });
                                return;
                            }
                            if (view !== 'practice') {
                                startPractice();
                            }
                        }} 
                        disabled={user ? cards.length === 0 : false}
                    >
                        <Play size={17} /> {t('practice')} 
                        {user && allDueCards.length > 0 && <span className="fc-badge">{allDueCards.length}</span>}
                    </button>

                    <button 
                        className={`fc-view-btn ${view === 'reading' ? 'active' : ''}`} 
                        onClick={() => {
                            if (!user) {
                                setAuthPrompt({
                                    open: true,
                                    title: 'پێویستە هەژمار دروست بکەیت',
                                    message: 'بۆ ڕاهێنانی دەنگ و بەکارهێنانی زیرەکی دەستکرد، پێویستە سەرەتا بچیتە ژوورەوە.'
                                });
                                return;
                            }
                            setView('reading');
                        }}
                    >
                        <Mic size={17} /> {t('voice_practice')}
                    </button>

                    <button 
                        className={`fc-view-btn ${view === 'manage' ? 'active' : ''}`} 
                        onClick={() => setView('manage')}
                    >
                        <BookOpen size={17} /> {t('cards_manage')} 
                        <span className="fc-badge fc-badge-neutral">{cards.length}</span>
                    </button>
                </div>
            </div>

            {view === 'manage' && (
                <div className="fc-manage-view">
                    {/* Guest Callout Banner */}
                    {!user && (
                        <div style={{
                            marginBottom: '20px',
                            padding: '16px 20px',
                            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(99, 102, 241, 0.12))',
                            border: '1.5px dashed rgba(168, 85, 247, 0.35)',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc', flexShrink: 0 }}>
                                    <BookOpen size={20} />
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 3px 0', fontSize: '0.98rem', fontWeight: 800 }}>تایبەتمەندی فلاش کارت پێویستی بە هەژمارە</h4>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>بۆ پاشەکەوتکردنی وشەکان لە فیلمەکان و ئەنجامدانی تاقیکردنەوەی فلاش کارت، تکایە بچۆ ژوورەوە.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate('/auth')}
                                style={{
                                    padding: '9px 18px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                                    color: '#ffffff',
                                    fontWeight: 800,
                                    fontSize: '0.88rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.35)'
                                }}
                            >
                                چوونەژوورەوە / خۆت تۆمار بکە
                            </button>
                        </div>
                    )}

                    {/* Hidden file input for import */}
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept=".json,.csv,.txt,.tsv" 
                        onChange={handleFileUpload} 
                    />

                    {/* Compact Iconic Action Bar */}
                    <div className="fc-wb-top-toolbar">
                        <div className="fc-wb-heading-compact">
                            <h3><BookOpen size={20} color="var(--accent)" /> {t('word_bank_heading')}</h3>
                        </div>

                        <div className="fc-wb-quick-actions">
                            {/* Import dropdown */}
                            <div className="fc-dropdown-wrapper" ref={importMenuRef}>
                                <button 
                                    className="fc-icon-action-btn"
                                    onClick={() => {
                                        if (!user) {
                                            setAuthPrompt({
                                                open: true,
                                                title: 'پێویستە هەژمار دروست بکەیت',
                                                message: 'بۆ هاوردەکردنی فلاش کارت، تکایە سەرەتا بچۆ ژوورەوە.'
                                            });
                                            return;
                                        }
                                        setImportMenuOpen(!importMenuOpen); 
                                        setExportMenuOpen(false); 
                                    }}
                                    title={t('import')}
                                >
                                    <Upload size={17} />
                                </button>
                                {importMenuOpen && (
                                    <div className="fc-dropdown-menu" dir={lang === 'en' ? 'ltr' : 'rtl'}>
                                        <button onClick={() => { setImportMenuOpen(false); fileInputRef.current?.click(); }}>
                                            <FolderInput size={16} /> {t('json_csv_file')}
                                        </button>
                                        <button onClick={() => { setImportMenuOpen(false); setBulkTextModalOpen(true); }}>
                                            <FilePlus size={16} /> {t('quick_text_import')}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Export dropdown */}
                            <div className="fc-dropdown-wrapper" ref={exportMenuRef}>
                                <button 
                                    className="fc-icon-action-btn"
                                    onClick={() => { setExportMenuOpen(!exportMenuOpen); setImportMenuOpen(false); }}
                                    disabled={cards.length === 0}
                                    title={t('export')}
                                >
                                    <Download size={17} />
                                </button>
                                {exportMenuOpen && (
                                    <div className="fc-dropdown-menu" dir={lang === 'en' ? 'ltr' : 'rtl'}>
                                        <button onClick={exportToJson}>
                                            <FileText size={16} /> {t('json_export')}
                                        </button>
                                        <button onClick={exportToCsv}>
                                            <FileSpreadsheet size={16} /> {t('csv_export')}
                                        </button>
                                        <button onClick={exportToAnki}>
                                            <Layers size={16} /> {t('anki_export')}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Add Card Toggle Button */}
                            <button 
                                className="fc-btn-new-card-compact"
                                onClick={() => {
                                    if (!user) {
                                        setAuthPrompt({
                                            open: true,
                                            title: 'پێویستە هەژمار دروست بکەیت',
                                            message: 'بۆ دروستکردنی فلاش کارت، تکایە سەرەتا بە هەژمارەکەت بچۆ ژوورەوە.'
                                        });
                                        return;
                                    }
                                    setShowAddForm(!showAddForm); setEditingId(null); setFrontText(''); setBackText(''); 
                                }}
                            >
                                <Plus size={17} /> <span>{showAddForm ? t('close') : t('new_card')}</span>
                            </button>
                        </div>
                    </div>

                    {/* Word Bank Mini Stats */}
                    <div className="fc-wordbank-stats-row">
                        <div className="fc-wb-stat">
                            <span className="fc-wb-stat-val">{cards.length}</span>
                            <span className="fc-wb-stat-lbl">{t('total_words_stat')}</span>
                        </div>
                        <div className="fc-wb-stat stat-due">
                            <span className="fc-wb-stat-val">{allDueCards.length}</span>
                            <span className="fc-wb-stat-lbl">{t('ready_review')} 🔴</span>
                        </div>
                        <div className="fc-wb-stat stat-learned">
                            <span className="fc-wb-stat-val">{cards.length - allDueCards.length}</span>
                            <span className="fc-wb-stat-lbl">{t('learned_stat')} ✅</span>
                        </div>
                    </div>

                    {/* Collapsible Add / Edit Form */}
                    {(showAddForm || editingId) && (
                        <div className="fc-form-card">
                            <div className="fc-form-header">
                                <div className="fc-form-title-group">
                                    <div className="fc-form-icon-badge">
                                        {editingId ? <Edit2 size={18} color="#c084fc" /> : <Sparkles size={18} color="#c084fc" />}
                                    </div>
                                    <div>
                                        <h3>{editingId ? t('edit_card') : t('create_new_card')}</h3>
                                        <p className="fc-form-subtitle">{lang === 'en' ? 'Add English phrase and its Kurdish translation' : 'وشە یان ڕستەی ئینگلیزی و وەرگێڕانەکەی دابنێ'}</p>
                                    </div>
                                </div>
                                <button 
                                    className="fc-form-close-btn"
                                    onClick={() => { setEditingId(null); setShowAddForm(false); setFrontText(''); setBackText(''); }}
                                    title={t('close')}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="fc-form-grid">
                                <div className="fc-input-field-card">
                                    <div className="fc-input-header">
                                        <label>{t('front_input_label')}</label>
                                        <span className="fc-input-lang-tag">EN</span>
                                    </div>
                                    <div className="fc-input-wrapper">
                                        <input 
                                            type="text" 
                                            value={frontText} 
                                            onChange={e => setFrontText(e.target.value)} 
                                            placeholder={lang === 'en' ? 'e.g. Inevitable' : 'نموونە: Actually...'} 
                                            dir="ltr"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="fc-input-field-card">
                                    <div className="fc-input-header">
                                        <label>{t('back_input_label')}</label>
                                        <span className="fc-input-lang-tag">KU</span>
                                    </div>
                                    <div className="fc-input-wrapper">
                                        <input 
                                            type="text" 
                                            value={backText} 
                                            onChange={e => setBackText(e.target.value)} 
                                            placeholder={lang === 'en' ? 'e.g. حەتمی / چارەنووسساز' : 'نموونە: لە ڕاستیدا...'} 
                                            dir="rtl"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Live Preview Card */}
                            {(frontText.trim() || backText.trim()) && (
                                <div className="fc-form-preview-row">
                                    <span className="fc-preview-label">{lang === 'en' ? 'Live Preview:' : 'پێشبینینی ڕاستەوخۆ:'}</span>
                                    <div className="fc-form-live-card">
                                        <div className="fc-live-front" dir="ltr">{frontText.trim() || '...'}</div>
                                        <div className="fc-live-divider" />
                                        <div className="fc-live-back" dir="rtl">{backText.trim() || '...'}</div>
                                    </div>
                                </div>
                            )}

                            <div className="fc-form-actions">
                                <button className="fc-btn-cancel" onClick={() => { setEditingId(null); setShowAddForm(false); setFrontText(''); setBackText(''); }}>
                                    <X size={16} /> {t('cancel')}
                                </button>
                                <button className="fc-btn-save" onClick={handleSave} disabled={!frontText.trim() || !backText.trim()}>
                                    {editingId ? <><Save size={16} /> {t('save_btn')}</> : <><Plus size={16} /> {t('add_btn')}</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Floating Bulk Actions Bar (When cards are selected) */}
                    {selectedCardIds.size > 0 && (
                        <div className="fc-bulk-bar" dir={lang === 'en' ? 'ltr' : 'rtl'}>
                            <div className="fc-bulk-info">
                                <CheckSquare size={18} color="var(--accent)" />
                                <span>{selectedCardIds.size} {lang === 'en' ? 'cards selected' : 'کارت هەڵبژێردراوە'}</span>
                            </div>
                            <div className="fc-bulk-actions">
                                <button className="fc-bulk-btn fc-bulk-delete" onClick={handleBulkDelete}>
                                    <Trash2 size={16} /> {t('delete_selected')}
                                </button>
                                <button className="fc-bulk-btn fc-bulk-cancel" onClick={() => setSelectedCardIds(new Set())}>
                                    <X size={16} /> {t('cancel')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Search, Filter & Sort Control Panel */}
                    <div className="fc-wb-panel">
                        <div className="fc-wb-panel-top">
                            <div className="fc-wb-search-bar">
                                <Search size={18} className="fc-wb-search-icon" />
                                <input 
                                    type="text" 
                                    placeholder={t('search_word_placeholder')} 
                                    value={cardSearch} 
                                    onChange={e => setCardSearch(e.target.value)} 
                                />
                                {cardSearch && (
                                    <button className="fc-wb-search-clear" onClick={() => setCardSearch('')}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="fc-wb-sort-wrapper" ref={sortMenuRef}>
                                <button 
                                    type="button"
                                    className={`fc-wb-sort-btn ${sortMenuOpen ? 'open' : ''}`}
                                    onClick={() => setSortMenuOpen(!sortMenuOpen)}
                                >
                                    <span className="fc-sort-btn-label">
                                        {cardSort === 'newest' ? t('sort_newest') :
                                         cardSort === 'oldest' ? t('sort_oldest') :
                                         cardSort === 'az' ? t('sort_az') : t('sort_ease')}
                                    </span>
                                    <ArrowUpDown size={15} className="fc-sort-icon" />
                                </button>

                                {sortMenuOpen && (
                                    <div className="fc-sort-dropdown-menu" dir={lang === 'en' ? 'ltr' : 'rtl'}>
                                        <button
                                            type="button"
                                            className={`fc-sort-menu-item ${cardSort === 'newest' ? 'active' : ''}`}
                                            onClick={() => { setCardSort('newest'); setSortMenuOpen(false); }}
                                        >
                                            <span className="fc-sort-item-text">{t('sort_newest')}</span>
                                            {cardSort === 'newest' && <Check size={16} color="var(--accent)" />}
                                        </button>
                                        <button
                                            type="button"
                                            className={`fc-sort-menu-item ${cardSort === 'oldest' ? 'active' : ''}`}
                                            onClick={() => { setCardSort('oldest'); setSortMenuOpen(false); }}
                                        >
                                            <span className="fc-sort-item-text">{t('sort_oldest')}</span>
                                            {cardSort === 'oldest' && <Check size={16} color="var(--accent)" />}
                                        </button>
                                        <button
                                            type="button"
                                            className={`fc-sort-menu-item ${cardSort === 'az' ? 'active' : ''}`}
                                            onClick={() => { setCardSort('az'); setSortMenuOpen(false); }}
                                        >
                                            <span className="fc-sort-item-text">{t('sort_az')}</span>
                                            {cardSort === 'az' && <Check size={16} color="var(--accent)" />}
                                        </button>
                                        <button
                                            type="button"
                                            className={`fc-sort-menu-item ${cardSort === 'ease' ? 'active' : ''}`}
                                            onClick={() => { setCardSort('ease'); setSortMenuOpen(false); }}
                                        >
                                            <span className="fc-sort-item-text">{t('sort_ease')}</span>
                                            {cardSort === 'ease' && <Check size={16} color="var(--accent)" />}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modern Rounded Filter Pills */}
                        <div className="fc-wb-pills-row">
                            <button className={`fc-wb-pill ${cardFilter === 'all' ? 'active' : ''}`} onClick={() => setCardFilter('all')}>
                                {t('all_filter')} <span className="pill-count">{cards.length}</span>
                            </button>
                            <button className={`fc-wb-pill ${cardFilter === 'due' ? 'active' : ''}`} onClick={() => setCardFilter('due')}>
                                {t('ready_review')} 🔴 <span className="pill-count">{allDueCards.length}</span>
                            </button>
                            <button className={`fc-wb-pill ${cardFilter === 'learned' ? 'active' : ''}`} onClick={() => setCardFilter('learned')}>
                                {t('learned_stat')} ✅ <span className="pill-count">{cards.length - allDueCards.length}</span>
                            </button>
                            <button className={`fc-wb-pill ${cardFilter === 'movie' ? 'active' : ''}`} onClick={() => setCardFilter('movie')}>
                                🎬 {t('from_movies')}
                            </button>
                        </div>

                        {/* Select All Toggle Bar */}
                        {filteredCards.length > 0 && (
                            <div className="fc-wb-select-bar" dir={lang === 'en' ? 'ltr' : 'rtl'}>
                                <button className="fc-wb-btn-select-all" onClick={toggleSelectAll}>
                                    {selectedCardIds.size === filteredCards.length ? <CheckSquare size={17} color="var(--accent)" /> : <Square size={17} />}
                                    <span>{t('select_all_cards')} ({filteredCards.length})</span>
                                </button>
                                {selectedCardIds.size > 0 && (
                                    <span className="fc-wb-selected-count">({selectedCardIds.size})</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Cards Grid */}
                    {filteredCards.length === 0 ? (
                        <div className="fc-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '2.5rem 1.5rem' }}>
                            <Search size={36} style={{ color: '#a855f7', opacity: 0.8 }} />
                            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'inherit' }}>
                                {cards.length === 0 
                                    ? t('no_cards_in_bank')
                                    : cardSearch.trim()
                                        ? `هیچ کارتێک نەدۆزرایەوە بۆ « ${cardSearch} »`
                                        : t('no_cards_found_filter')}
                            </div>
                            {cardSearch.trim() && (
                                <button 
                                    type="button" 
                                    className="fc-btn-cancel"
                                    onClick={() => setCardSearch('')}
                                    style={{ marginTop: '6px', fontSize: '0.85rem', padding: '8px 16px', borderRadius: '10px' }}
                                >
                                    <X size={14} /> سڕینەوەی گەڕان
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="fc-wb-cards-grid">
                            {filteredCards.map(card => {
                                const isDue = !card.nextReview || card.nextReview <= Date.now();
                                const isSelected = selectedCardIds.has(card.id);

                                return (
                                    <div key={card.id} className={`fc-wb-card ${isDue ? 'wb-card-due' : ''} ${isSelected ? 'wb-card-selected' : ''}`}>
                                        {/* Card Top: Tags & Actions */}
                                        <div className="fc-wb-card-header">
                                            <div className="fc-wb-card-tags">
                                                <button 
                                                    className="fc-wb-card-check-btn" 
                                                    onClick={() => toggleSelectCard(card.id)}
                                                    title={isSelected ? 'Deselect' : 'Select'}
                                                >
                                                    {isSelected ? <CheckSquare size={18} color="var(--accent)" /> : <Square size={18} />}
                                                </button>
                                                {card.context?.sourceLabel && (
                                                    <span className="fc-wb-source-pill" title={card.context.sourceLabel}>
                                                        🎬 {card.context.sourceLabel}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="fc-wb-card-actions">
                                                <button onClick={() => doTTS(card.front)} title="Listen 🔊"><Volume1 size={16} /></button>
                                                <button onClick={() => generateVariations(card)} title="AI Variations"><Sparkles size={16} /></button>
                                                <button onClick={() => handleEdit(card)} title="Edit"><Edit2 size={16} /></button>
                                                <button onClick={() => handleDelete(card.id)} title="Delete" className="btn-del"><Trash2 size={16} /></button>
                                            </div>
                                        </div>

                                        {/* Card Body: English & Kurdish */}
                                        <div className="fc-wb-card-body">
                                            <div className="fc-wb-front" dir="ltr">{card.front}</div>
                                            <div className="fc-wb-back" dir="rtl">{card.back}</div>
                                            {card.context?.quote && card.context.quote.trim().toLowerCase() !== card.front.trim().toLowerCase() && (
                                                <div className="fc-wb-quote" dir="ltr">"{card.context.quote}"</div>
                                            )}
                                        </div>

                                        {/* Card Footer: Status */}
                                        <div className="fc-wb-card-footer">
                                            <span className={`fc-wb-status-badge ${isDue ? 'badge-due' : 'badge-learned'}`}>
                                                {isDue ? t('due_now_badge') : t('learned_badge')}
                                            </span>
                                            {card.ease && (
                                                <span className="fc-wb-ease">
                                                    {t('ease_lbl')} {((card.ease / 2.5) * 100).toFixed(0)}%
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Bulk Text Import Modal */}
                    {bulkTextModalOpen && (
                        <div className="fc-modal-overlay">
                            <div className="fc-modal-content fc-bulk-import-modal" dir="rtl">
                                <button className="fc-modal-close" onClick={() => setBulkTextModalOpen(false)}><X size={18} /></button>
                                <h3 className="fc-modal-title"><FilePlus size={20} color="var(--accent)" /> هاوردەکردنی خێرا بە دەق</h3>
                                <p className="fc-modal-desc">
                                    دەتوانیت چەندین وشە و وەرگێڕانەکانیان بە یەکجار لێرە دابنێیت. لە هەر دێڕێکدا بەم شێوازە بنووسە:  
                                    <code dir="ltr" style={{ display: 'block', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '8px', marginTop: '6px', color: '#38bdf8' }}>
                                        Apple - سێو<br/>
                                        Knowledge - زانیاری<br/>
                                        Opportunity - دەرفەت
                                    </code>
                                </p>

                                <textarea 
                                    className="fc-bulk-textarea"
                                    value={bulkImportText}
                                    onChange={e => setBulkImportText(e.target.value)}
                                    placeholder="Apple - سێو&#10;Book - پەڕتووک..."
                                    dir="ltr"
                                />

                                <div className="fc-modal-actions" style={{ justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
                                    <button className="fc-btn-cancel" onClick={() => setBulkTextModalOpen(false)}>
                                        پاشگەزبوونەوە
                                    </button>
                                    <button className="fc-btn-save" onClick={handleBulkTextImport} disabled={!bulkImportText.trim()}>
                                        <Upload size={16} /> هاوردەکردن
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {aiVarModalOpen && (
                        <div className="fc-modal-overlay" onClick={() => setAiVarModalOpen(false)}>
                            <div className="fc-modal-content fc-ai-modal" onClick={e => e.stopPropagation()} dir={lang === 'en' ? 'ltr' : 'rtl'}>
                                <button className="fc-modal-close" onClick={() => setAiVarModalOpen(false)}><X size={18} /></button>
                                <h3 className="fc-modal-title"><Sparkles size={20} color="#a855f7" /> {lang === 'en' ? 'AI Sentence Variations' : 'نموونەی زیاتر بە AI'}</h3>
                                <p className="fc-modal-desc">
                                    {lang === 'en' 
                                        ? `Choose which sentences you'd like to add for "${aiVarTarget?.front}":` 
                                        : `ئەو ڕستانە دیاریبکە کە دەتەوێت بۆ وشەی "${aiVarTarget?.front}" زیاد بکرێن:`}
                                </p>

                                {isAiLoading ? (
                                    <div className="fc-ai-loader">
                                        <Loader2 size={32} className="spinning" />
                                        <p>{lang === 'en' ? 'Generating smart sentences...' : 'چاوەڕێ بە... زیرەکی دەستکرد ڕستەکان دروست دەکات'}</p>
                                    </div>
                                ) : (
                                    <div className="fc-ai-results">
                                        {aiVariations.length > 0 ? (
                                            <div className="fc-ai-list">
                                                {aiVariations.map((v, i) => {
                                                    const isChecked = selectedAiIndices.has(i);
                                                    return (
                                                        <div 
                                                            key={i} 
                                                            className={`fc-ai-card ${isChecked ? 'selected' : ''}`}
                                                            onClick={() => toggleAiVariationSelection(i)}
                                                        >
                                                            <div className="fc-ai-card-main">
                                                                <button 
                                                                    className="fc-ai-check-box"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleAiVariationSelection(i);
                                                                    }}
                                                                >
                                                                    {isChecked ? <CheckSquare size={18} color="var(--accent)" /> : <Square size={18} />}
                                                                </button>
                                                                <div className="fc-ai-card-content">
                                                                    <div className="fc-ai-front" dir="ltr">{v.front}</div>
                                                                    <div className="fc-ai-back" dir="rtl">{v.back}</div>
                                                                </div>
                                                            </div>

                                                            <div className="fc-ai-card-actions" onClick={e => e.stopPropagation()}>
                                                                <button 
                                                                    className="fc-ai-card-action-btn" 
                                                                    onClick={() => doTTS(v.front)} 
                                                                    title="Listen"
                                                                >
                                                                    <Volume1 size={15} />
                                                                </button>
                                                                <button 
                                                                    className="fc-ai-card-add-single"
                                                                    onClick={() => addSingleVariationToDeck(v)}
                                                                    title={lang === 'en' ? 'Add this card only' : 'تەنها ئەمە زیاد بکە'}
                                                                >
                                                                    <Plus size={14} /> {lang === 'en' ? 'Add' : 'زیادکردن'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                <div className="fc-ai-modal-footer">
                                                    <button 
                                                        className="fc-btn-save fc-ai-btn-save-all" 
                                                        onClick={addSelectedVariationsToDeck} 
                                                        disabled={selectedAiIndices.size === 0}
                                                    >
                                                        <Plus size={17} />
                                                        {selectedAiIndices.size === aiVariations.length 
                                                            ? (lang === 'en' ? 'Add All 3 Cards 🃏' : 'هەرسێکیان زیاد بکە 🃏') 
                                                            : (lang === 'en' ? `Add Selected (${selectedAiIndices.size}) 🃏` : `زیادکردنی هەڵبژێردراوەکان (${selectedAiIndices.size}) 🃏`)}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="fc-error">{lang === 'en' ? 'Could not generate sentences. Please try again.' : 'نەتوانرا نموونە دروست بکرێت. دووبارە تاقیبکەرەوە.'}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {view === 'reading' && (
                <div className="fc-reading-view">
                    {/* Voice Tutor Header */}
                    <div className="fc-voice-tutor-header">
                        <div className="fc-voice-tutor-badge">
                            <Mic size={18} /> {t('voice_practice')}
                        </div>
                        <h2>{t('voice_coach_heading')}</h2>
                        <p>{t('voice_coach_desc')}</p>
                    </div>

                    {/* Quick Pick from User's Flashcards */}
                    {cards.length > 0 && (
                        <div className="fc-voice-quick-picker">
                            <span className="fc-voice-picker-label"><Sparkles size={15} color="var(--accent)" /> {t('quick_pick_cards')}</span>
                            <div className="fc-voice-chips-scroll">
                                {cards.slice(0, 15).map(c => (
                                    <button 
                                        key={c.id} 
                                        className={`fc-voice-chip ${readingText === c.front ? 'active' : ''}`}
                                        onClick={() => {
                                            setReadingText(c.front);
                                            setReadingScore(null);
                                            setSpokenText('');
                                            setAiFeedback('');
                                        }}
                                    >
                                        {c.front}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Target Sentence Card */}
                    <div className="fc-voice-target-card">
                        <div className="fc-voice-target-top">
                            <label>{t('target_text_label')}</label>
                            <button 
                                className="fc-btn-listen-native" 
                                onClick={() => doTTS(readingText || 'Hello')}
                                disabled={!readingText.trim()}
                            >
                                <Volume1 size={17} /> {t('listen_native')}
                            </button>
                        </div>

                        <textarea 
                            className="fc-reading-textarea"
                            value={readingText}
                            onChange={e => {
                                setReadingText(e.target.value);
                                setReadingScore(null);
                                setSpokenText('');
                                setAiFeedback('');
                            }}
                            placeholder={t('voice_textarea_placeholder')}
                            dir="ltr"
                        />

                        <div className="fc-voice-target-bottom">
                            <label className="fc-strict-toggle">
                                <input type="checkbox" checked={strictMode} onChange={e => setStrictMode(e.target.checked)} />
                                <span>{t('strict_accuracy_mode')}</span>
                            </label>
                        </div>
                    </div>

                    {/* Interactive Recording Area */}
                    <div className="fc-reading-practice-area">
                        {!isRecording ? (
                            <button 
                                className="fc-mic-start-btn" 
                                onClick={startReadingPractice}
                                disabled={!readingText.trim()}
                                title="Start"
                            >
                                <Mic size={36} />
                                <span>{t('start_speaking_btn')}</span>
                            </button>
                        ) : (
                            <div className="fc-recording-status">
                                <div className="fc-mic-pulse">
                                    <Mic size={44} />
                                </div>
                                <p className="fc-recording-prompt">{t('speak_now')}</p>
                                <button className="fc-btn-cancel" onClick={() => setIsRecording(false)}>
                                    {t('cancel')}
                                </button>
                            </div>
                        )}

                        {speechErrorType === 'network' && (
                            <div className="fc-speech-network-alert" dir="rtl">
                                <div className="fc-alert-icon">💡</div>
                                <div className="fc-alert-content">
                                    <h4>پەیوەندی بە سێرڤەری دەنگی Google بێ وەڵامە</h4>
                                    <p>خزمەتگوزاری ناسینەوەی دەنگی Google لە وێبگەڕی Chrome لە عێراق/کوردستان هەندێک جار دەبەسترێت. بۆ ئەوەی دەنگەکەت بە تەواوی و بێ کێشە بناسرێتەوە:</p>
                                    <ul>
                                        <li>🌐 ئەم لاپەڕەیە لە وێبگەڕی <strong>Microsoft Edge</strong> بکەرەوە (کە سێرڤەری دەنگی جیهانی مایکرۆسۆفت بەکاردەهێنێت و ١٠٠٪ کار دەکات).</li>
                                        <li>📶 یان لە کاتی بەکارهێنانی Chrome پشکنین بکە کە ئینتەرنێت یان VPN لەسەر هێڵەکەت پەیوەستە.</li>
                                    </ul>
                                </div>
                            </div>
                        )}
                        {readingScore !== null && !isRecording && (
                            <div className="fc-reading-result">
                                <div className="fc-result-card">
                                    <div className="fc-result-top-row">
                                        <div className={`fc-score-circle score-${readingScore >= 80 ? 'high' : readingScore >= 50 ? 'mid' : 'low'}`}>
                                            <strong>{readingScore}%</strong>
                                            <small>{readingScore >= 80 ? 'نایابە 🏆' : readingScore >= 50 ? 'باشە 👍' : 'دووبارە 🔄'}</small>
                                        </div>
                                        <div className="fc-result-meta">
                                            <h3>{readingScore >= 80 ? 'ئاستی گۆکردن: نایاب و دروست' : readingScore >= 50 ? 'ئاستی گۆکردن: باش و قبوڵکراو' : 'پێویستی بە ڕاهێنانی زیاترە'}</h3>
                                            <p>{spokenText ? `دەنگی تۆمارکراو: "${spokenText}"` : 'هیچ دەنگێک نەبیسترا'}</p>
                                        </div>
                                    </div>

                                    {/* Word-by-Word Sequence Alignment Analysis */}
                                    {readingText.trim() && (
                                        <div className="fc-word-diff-section">
                                            <span className="fc-diff-title">شیکاری وشە بە وشەی ڕستەکە:</span>
                                            <div className="fc-word-diff-badges" dir="ltr">
                                                {(() => {
                                                    const norm = (s: string) => s.toLowerCase().replace(/[^\w]/g, '').trim();
                                                    const tgW = readingText.split(/\s+/).filter(Boolean);
                                                    const spW = spokenText.split(/\s+/).filter(Boolean);

                                                    const n = tgW.length;
                                                    const m = spW.length;

                                                    // DP table for Needleman-Wunsch / LCS alignment
                                                    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

                                                    for (let i = 0; i <= n; i++) dp[i][0] = -i;
                                                    for (let j = 0; j <= m; j++) dp[0][j] = -j;

                                                    for (let i = 1; i <= n; i++) {
                                                        for (let j = 1; j <= m; j++) {
                                                            const isExact = norm(tgW[i - 1]) === norm(spW[j - 1]);
                                                            const matchScore = isExact ? 2 : -1;
                                                            dp[i][j] = Math.max(
                                                                dp[i - 1][j - 1] + matchScore,
                                                                dp[i - 1][j] - 1,
                                                                dp[i][j - 1] - 1
                                                            );
                                                        }
                                                    }

                                                    // Backtrack
                                                    let i = n, j = m;
                                                    const result: { target: string; spoken: string | null; isCorrect: boolean }[] = [];

                                                    while (i > 0 || j > 0) {
                                                        if (i > 0 && j > 0) {
                                                            const isExact = norm(tgW[i - 1]) === norm(spW[j - 1]);
                                                            const matchScore = isExact ? 2 : -1;
                                                            if (dp[i][j] === dp[i - 1][j - 1] + matchScore) {
                                                                result.unshift({
                                                                    target: tgW[i - 1],
                                                                    spoken: spW[j - 1],
                                                                    isCorrect: isExact
                                                                });
                                                                i--;
                                                                j--;
                                                                continue;
                                                            }
                                                        }
                                                        if (i > 0 && dp[i][j] === dp[i - 1][j] - 1) {
                                                            result.unshift({
                                                                target: tgW[i - 1],
                                                                spoken: null,
                                                                isCorrect: false
                                                            });
                                                            i--;
                                                        } else if (j > 0) {
                                                            j--;
                                                        } else {
                                                            break;
                                                        }
                                                    }

                                                    return result.map((item, idx) => (
                                                        <span 
                                                            key={idx} 
                                                            className={`fc-word-badge ${item.isCorrect ? 'word-correct' : 'word-miss'}`}
                                                            title={item.spoken ? `تۆ وتت: ${item.spoken}` : 'نەبیستراوە'}
                                                        >
                                                            {item.target} {item.isCorrect ? '✓' : '✗'}
                                                            {!item.isCorrect && item.spoken && (
                                                                <small className="fc-word-said">({item.spoken})</small>
                                                            )}
                                                        </span>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="fc-result-actions">
                                    <button className="fc-btn-save" onClick={startReadingPractice}>
                                        <RotateCcw size={18} /> دووبارە هەوڵبدەوە
                                    </button>
                                    <button 
                                        className="fc-btn-ai-feedback" 
                                        onClick={getAiReadingFeedback}
                                        disabled={isAiFeedbackLoading || !spokenText}
                                    >
                                        <Brain size={18} /> شیکاری ڕاهێنەری AI
                                    </button>
                                </div>

                                {isAiFeedbackLoading && (
                                    <div className="fc-ai-loader">
                                        <Loader2 size={26} className="spinning" />
                                        <p>ژیری دەستکرد شیکاری گۆکردن و دەنگەکەت دەکات...</p>
                                    </div>
                                )}

                                {aiFeedback && (
                                    <div className="fc-ai-feedback-box" dir="rtl">
                                        <h4><Sparkles size={18} /> ئامۆژگاری و ڕاستکردنەوەی AI:</h4>
                                        <p>{aiFeedback}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {view === 'practice' && (
                <div className="fc-practice-view">

                    {!currentCard ? (
                        <div className="fc-done-msg">
                            <CheckSquare size={64} color="#4ade80" />
                            <h2>زۆر باشە! 🎉</h2>
                            <p>
                                {practiceSessionIds.length > 0
                                    ? `تۆ پێداچوونەوەت بۆ ${practiceSessionIds.length} کارت کرد.`
                                    : 'تۆ پێداچوونەوەت بۆ هەموو کارتەکانی ئەمڕۆت کرد.'}
                            </p>
                            <p>دواتر دووبارە سەردان بکەرەوە بۆ ئەوەی وشەی زیاترت بێتەوە بیر.</p>
                            <div className="fc-done-actions">
                                <button className="fc-btn-secondary fc-btn-restart-practice" onClick={restartPractice}>
                                    <RotateCcw size={18} /> دووبارە تاقی بکەرەوە
                                </button>
                                <button className="fc-btn-save" onClick={() => setView('manage')}>
                                    گەڕانەوە بۆ کارتەکان
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="fc-practice-header">
                                <div className="fc-practice-progress-container">
                                    <div 
                                        className="fc-practice-progress-fill" 
                                        style={{ 
                                            width: `${practiceSessionIds.length > 0 ? Math.round(((practiceSessionIds.length - practiceRemainingCards.length) / practiceSessionIds.length) * 100) : 0}%` 
                                        }} 
                                    />
                                </div>
                                
                                <div className="fc-practice-subbar">
                                    <div className="fc-practice-counter">
                                        <Sparkles size={15} color="#22d3ee" />
                                        <span>{t('remaining_for_review')} <strong>{practiceRemainingCards.length}</strong> {t('of_cards')} <strong>{practiceSessionIds.length}</strong> {t('cards_count_unit')}</span>
                                    </div>
                                    
                                    <div className="fc-practice-settings">
                                        <button 
                                            className={`fc-settings-btn ${!showImage ? 'off' : ''}`}
                                            onClick={() => setShowImage(!showImage)}
                                            title={showImage ? t('hide_image') : t('show_image')}
                                        >
                                            <Sparkles size={14} /> <span>{showImage ? t('hide_image') : t('show_image')}</span>
                                        </button>
                                        
                                        {showImage && (
                                            <div className="fc-blur-control">
                                                <span>{t('blur_lbl')} {blurLevel}px</span>
                                                <input 
                                                    type="range" 
                                                    min="0" 
                                                    max="30" 
                                                    value={blurLevel} 
                                                    onChange={(e) => setBlurLevel(parseInt(e.target.value))}
                                                    className="fc-blur-slider"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div 
                                className="fc-scene"
                                onTouchStart={handleCardTouchStart}
                                onTouchEnd={handleCardTouchEnd}
                            >
                                <div className={`fc-card-3d ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
                                    <div className="fc-card-face fc-card-front">
                                        <div
                                            className="fc-card-backdrop"
                                            style={{
                                                backgroundImage: sceneMedia.screenshot && showImage ? `url(${sceneMedia.screenshot})` : 'none',
                                                filter: `blur(${blurLevel}px)`,
                                                opacity: showImage ? 1 : 0
                                            }}
                                        />
                                        <div className="fc-card-overlay" style={{ opacity: showImage ? 1 : 0.95 }} />
                                        <span className="fc-hint">{t('click_to_see_answer')}</span>
                                        <div className="fc-card-topbar">
                                            <div className="fc-card-source">
                                                {currentCard.context?.sourceLabel || 'Binama'}
                                            </div>
                                            <div className="fc-card-stamp">
                                                {currentCard.context?.timestamp !== undefined ? formatSceneTime(currentCard.context.timestamp) : 'Scene'}
                                            </div>
                                        </div>
                                        <div className="fc-card-body">
                                            {currentCard.context?.quote && currentCard.context.quote.trim().toLowerCase() !== currentCard.front.trim().toLowerCase() && (
                                                <div className="fc-card-quote" dir="ltr">"{currentCard.context.quote}"</div>
                                            )}
                                            <div className="fc-card-text fc-card-word" dir="ltr">{currentCard.front}</div>
                                        </div>
                                        <div className="fc-card-footer">
                                            <button
                                                className="fc-scene-audio-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    playSceneAudio();
                                                }}
                                                disabled={sceneMediaLoading}
                                            >
                                                <Volume1 size={16} />
                                                {sceneMediaLoading ? '...' : (sceneMedia.audio ? t('scene_audio_btn') : t('listen_btn'))}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="fc-card-face fc-card-back">
                                        <div
                                            className="fc-card-backdrop"
                                            style={{
                                                backgroundImage: sceneMedia.screenshot && showImage ? `url(${sceneMedia.screenshot})` : 'none',
                                                filter: `blur(${blurLevel}px)`,
                                                opacity: showImage ? 1 : 0
                                            }}
                                        />
                                        <div className="fc-card-overlay fc-card-overlay-back" style={{ opacity: showImage ? 1 : 0.95 }} />
                                        <span className="fc-hint">{t('translation_and_context')}</span>
                                        <div className="fc-card-topbar">
                                            <div className="fc-card-source">
                                                {currentCard.context?.episodeTitle || currentCard.context?.sourceLabel || 'Binama'}
                                            </div>
                                            <div className="fc-card-stamp">
                                                {currentCard.cardType === 'subtitle' ? 'Subtitle' : 'Word'}
                                            </div>
                                        </div>
                                        <div className="fc-card-body">
                                            <div className="fc-card-text fc-card-translation" dir="rtl">{currentCard.back}</div>
                                            {currentCard.context?.translatedQuote && currentCard.context.translatedQuote.trim() !== currentCard.back.trim() && (
                                                <div className="fc-card-translation-quote" dir="rtl">"{currentCard.context.translatedQuote}"</div>
                                            )}
                                        </div>
                                        <div className="fc-card-footer">
                                            <button
                                                className="fc-scene-audio-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    playSceneAudio();
                                                }}
                                                disabled={sceneMediaLoading}
                                            >
                                                <Volume1 size={16} />
                                                {sceneMediaLoading ? '...' : (sceneMedia.audio ? t('scene_audio_btn') : t('listen_btn'))}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="fc-practice-controls">
                                {!isFlipped ? (
                                    <button className="fc-flip-btn" onClick={() => setIsFlipped(true)}>
                                        {t('flip_card_hint')}
                                    </button>
                                ) : (
                                    <div className="fc-rating-buttons">
                                        <button className="fc-rate-btn rate-again" onClick={() => rateCard('again')}>
                                            <RotateCcw size={16} /> {t('again')}
                                            <small>&lt; 1 min</small>
                                        </button>
                                        <button className="fc-rate-btn rate-hard" onClick={() => rateCard('hard')}>
                                            <Frown size={16} /> {t('hard')}
                                            <small>{currentCard.interval === 0 ? (lang === 'en' ? 'Tomorrow' : 'سبەینێ') : `${Math.round(currentCard.interval || 1)} ${lang === 'en' ? 'days' : 'ڕۆژ'}`}</small>
                                        </button>
                                        <button className="fc-rate-btn rate-good" onClick={() => rateCard('good')}>
                                            <Smile size={16} /> {t('good')}
                                            <small>{Math.round((currentCard.interval === 0 ? 1 : currentCard.interval === 1 ? 3 : (currentCard.interval||1) * (currentCard.ease||2.5)))} {lang === 'en' ? 'days' : 'ڕۆژ'}</small>
                                        </button>
                                        <button className="fc-rate-btn rate-easy" onClick={() => rateCard('easy')}>
                                            <CheckSquare size={16} /> {t('easy')}
                                            <small>{Math.round(currentCard.interval === 0 ? 4 : (currentCard.interval||1) * (currentCard.ease||2.5) * 1.3)} {lang === 'en' ? 'days' : 'ڕۆژ'}</small>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
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
                                خۆت تۆمار بکە / چوونەژوورەوە
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
                                داخستن
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Toasts */}
            <div className="global-toast-container">
                {globalToasts.map(t => (
                    <div key={t.id} className={`global-toast global-toast-${t.type}`}>
                        {t.type === 'error' ? <AlertCircle size={20} /> : <CheckSquare size={20} />}
                        <span>{t.msg}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
