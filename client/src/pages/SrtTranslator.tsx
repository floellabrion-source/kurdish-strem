import { useState, useRef, useEffect, useMemo } from 'react';
import axios from '../api/client';
import { useAuth } from '../context/AuthContext';
import { 
    Upload, Languages, Download, Loader2, CheckCircle, AlertCircle, X, 
    FileText, BarChart3, Sparkles, Copy, Clapperboard, BookOpen, 
    Zap, DollarSign, Gauge, Sliders, Check, Coins
} from 'lucide-react';
import './SrtTranslator.css';

const BATCH_SIZE = 35;

interface SubBlock {
    id: string;
    time: string;
    text: string;
}

const parseSRT = (raw: string): SubBlock[] => {
    const clean = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = clean.split(/\n{2,}/);
    const parsed: SubBlock[] = [];

    for (const b of blocks) {
        const lines = b.trim().split('\n').map(l => l.trim());
        if (lines.length < 2) continue;
        
        let id = '';
        let time = '';
        let textLines: string[] = [];

        if (lines[0].includes('-->')) {
            time = lines[0];
            textLines = lines.slice(1);
        } else if (lines.length >= 2 && lines[1].includes('-->')) {
            id = lines[0];
            time = lines[1];
            textLines = lines.slice(2);
        } else {
            const arrowIdx = lines.findIndex(l => l.includes('-->'));
            if (arrowIdx !== -1) {
                id = lines.slice(0, arrowIdx).join(' ');
                time = lines[arrowIdx];
                textLines = lines.slice(arrowIdx + 1);
            }
        }

        if (time && textLines.length > 0) {
            parsed.push({
                id: id || String(parsed.length + 1),
                time,
                text: textLines.join('\n')
            });
        }
    }

    return parsed;
};

const toSrtString = (blocks: SubBlock[]): string =>
    blocks.map(b => `${b.id}\n${b.time}\n${b.text}`).join('\n\n');

// ─── AI MODELS ───
export const AI_TRANSLATION_MODELS = [
    {
        id: 'anthropic/claude-sonnet-4.6',
        name: 'Claude Sonnet Latest',
        desc: 'نوێترین و بەهێزترین وەرگێڕی ئەدەبی و سینەمایی (4.6)',
        badge: 'نوێترین ✨',
        icon: '✨'
    },
    {
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        desc: 'ڤێرژنی جێگیر و داهێنەری باڵا (پێشنیارکراو)',
        badge: 'پێشنیارکراو ⭐',
        icon: '💎'
    },
    {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        desc: 'زۆر خێرا و کەم خەرج بۆ فایلی گەورە',
        badge: 'زۆر خێرا ⚡',
        icon: '⚡'
    },
    {
        id: 'openai/gpt-4o',
        name: 'OpenAI GPT-4o',
        desc: 'وەرگێڕانی ستاندارد و ڕێزمانی ڕێک',
        badge: 'GPT-4o 🌟',
        icon: '🌟'
    }
];

// ─── PRICING PER 1M TOKENS ───
export const MODEL_PRICING: Record<string, { inPricePerM: number; outPricePerM: number }> = {
    'anthropic/claude-sonnet-4.6': { inPricePerM: 3.0, outPricePerM: 15.0 },
    'anthropic/claude-sonnet-4.5': { inPricePerM: 3.0, outPricePerM: 15.0 },
    'anthropic/claude-sonnet-5': { inPricePerM: 3.0, outPricePerM: 15.0 },
    'google/gemini-2.5-flash': { inPricePerM: 0.15, outPricePerM: 0.60 },
    'openai/gpt-4o': { inPricePerM: 2.50, outPricePerM: 10.00 }
};

// ─── TRANSLATION TONES ───
export const TRANSLATION_TONES = [
    {
        id: 'casual',
        name: 'سینەمایی و ڕۆژانە',
        desc: 'دیالۆگی وتووێژی ڕۆژانەی هاوچەرخ و سروشتی',
        icon: '🎭',
        promptRule: 'TRANSLATION STYLE: Natural, fluent, everyday spoken Central Kurdish (Sorani) cinematic dialogue. Make it sound like modern real Kurdish speech.'
    },
    {
        id: 'formal',
        name: 'ئەدەبی و پاراو',
        desc: 'ڕستەی ستاندارد و پاراو بۆ فیلمی مێژوویی و دۆکیۆمێنتاری',
        icon: '📜',
        promptRule: 'TRANSLATION STYLE: High-standard, formal, literary Central Kurdish (Sorani) with precise grammar and vocabulary.'
    },
    {
        id: 'family',
        name: 'خێزانی و پارێزراو',
        desc: 'گۆڕینی وشە نەشیاو و جوێنەکان بۆ دەستەواژەی گونجاو',
        icon: '👨‍👩‍👧',
        promptRule: 'TRANSLATION STYLE: Family-friendly. Politely sanitize all profanity, coarse insults, and vulgar slang into culturally clean and respectful Kurdish equivalents.'
    }
];

// ─── FILENAME PARSER ───
export const parseFilenameContext = (filename: string) => {
    const base = filename.replace(/\.(srt|vtt|sub|txt)$/i, '');
    const seMatch = base.match(/(?:S|Season\s*)(\d{1,2})(?:E|Episode\s*|\s*x\s*)(\d{1,2})/i);
    let season: number | null = null;
    let episode: number | null = null;
    let titlePart = base;

    if (seMatch) {
        season = parseInt(seMatch[1], 10);
        episode = parseInt(seMatch[2], 10);
        titlePart = base.split(seMatch[0])[0];
    }

    const cleanTitle = titlePart
        .replace(/[._\-]+/g, ' ')
        .replace(/\b(720p|1080p|2160p|4k|hdtv|web-dl|webrip|bluray|brrip|dvdrip|x264|x265|hevc|aac|fqm|ettv|rarbg|yify|my-subs|english|eng|sub|central|kurdish|amc)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        title: cleanTitle,
        season,
        episode
    };
};

// ─── PART 1: LINGUISTIC ANALYSIS & STATISTICS ───
const generateLinguisticAnalysis = async (
    fullEnglishText: string, 
    model: string, 
    movieContext?: string,
    signal?: AbortSignal
): Promise<{ text: string; inTok: number; outTok: number }> => {
    const prompt = `ACT AS A PROFESSIONAL LINGUISTIC ANALYZER. Your task is to provide a comprehensive linguistic analysis of the following English subtitle script in Central Kurdish (Sorani).
${movieContext ? `MOVIE / SHOW CONTEXT: ${movieContext}` : ''}

PART 1: LINGUISTIC ANALYSIS & STATISTICS (MUST BE WRITTEN IN SORANI KURDISH)
Provide the following 4 sections clearly formatted in Central Kurdish (Sorani):

١. دابەشبوونی ئاستی وشەکان بەپێی ستانداردی ئەوروپی (CEFR Level Word Distribution):
Provide the percentage of words belonging to A1, A2, B1, B2, C1, and C2 levels.

٢. ١٠ قورسترین و پێشکەوتووترین وشە (Top 10 Difficult Words):
List the 10 most difficult academic/advanced/technical words found in the script. Keep the main target word in English, but translate its part of speech, CEFR level, and definition/explanation into Central Kurdish (Sorani).

٣. کۆی گشتیی وشەکان (Total Word Count):
Count the total number of words in the provided English text and state the exact word count.

٤. ئەو وشە سەرەکییانەی زۆرترین جار دووبارە بوونەتەوە (Repeated Content Words):
Identify which content words (nouns, verbs, adjectives, adverbs) are repeated in the text, and list how many times each repeated word occurs along with its translation/meaning in Central Kurdish (Sorani).

Here is the English subtitle script to analyze:
\n${fullEnglishText.slice(0, 15000)}`;

    const resp = await axios.post('/api/ai/generate', {
        contents: [{ parts: [{ text: prompt }] }],
        aiTask: 'synopsis',
        model: model,
        lineCount: 10,
        movieTitle: movieContext || 'Linguistic Analysis'
    }, {
        timeout: 180000,
        signal
    });

    let raw: string = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanText = raw.replace(/```(txt|markdown|text)?/gi, '').replace(/```/g, '').trim();

    const inTok = Math.round(prompt.length / 3.8);
    const outTok = Math.round(cleanText.length / 3.2);

    return { text: cleanText, inTok, outTok };
};

// ─── PART 2 & 3: TRANSLATION QUALITY & STRICT SRT FORMATTING ───
const translateBatch = async (
    texts: string[], 
    fullBlocks: SubBlock[], 
    batchStartIndex: number, 
    model: string,
    movieContextStr: string,
    toneRuleStr: string,
    glossaryTerms: any[],
    signal?: AbortSignal
): Promise<{ translatedList: string[]; inTok: number; outTok: number }> => {
    const srtBatch = texts.map((t, idx) => {
        const block = fullBlocks[batchStartIndex + idx];
        return `${block.id}\n${block.time}\n${t}`;
    }).join('\n\n');

    const glossarySection = glossaryTerms.length > 0
        ? `\nTEAM MANDATORY GLOSSARY (Strictly use these exact Kurdish translations if these English words appear):\n` +
          glossaryTerms.map(g => `- "${g.english}" => "${g.kurdish}"`).join('\n')
        : '';

    const prompt = `ACT AS A PROFESSIONAL SUBTITLE TRANSLATOR. Translate the following English SRT subtitle batch into high-quality, natural, and fluent Central Kurdish (Sorani) adhering strictly to these rules:

${movieContextStr ? `CONTEXT & SETTING: ${movieContextStr}` : ''}
${toneRuleStr}
${glossarySection}

PART 2: TRANSLATION QUALITY (CONTEXT OVER LITERAL)
- CONTEXTUAL & IDIOMATIC TRANSLATION: Do NOT translate word-for-word. Read surrounding lines to understand context, tone, and story. Ensure meaning flows naturally.
- NATURAL DIALOGUE: Ensure Kurdish translation sounds like natural, everyday spoken dialogue, not robotic or textbook.
- SLANG & IDIOMS: Adapt English idioms, jokes, phrases, and slang into culturally appropriate Central Kurdish (Sorani) equivalents.

PART 3: STRICT SRT FORMATTING & DATA INTEGRITY (CRITICAL)
- ABSOLUTE PRESERVATION OF TIMESTAMPS & INDEX NUMBERS: Copy the EXACT Index Number and EXACT Timestamp from original. DO NOT alter timestamps. DO NOT merge or split blocks.
- STRICT LINE-BY-LINE PROCESSING: Process sequentially, line by line. Do not skip any blocks.
- NO UNTRANSLATED TEXT: Every English dialogue must be translated into Central Kurdish.
- STRICT SRT SPACING: Do NOT insert blank lines between timestamp and translated text. The translated text must appear on the very next line. Exactly ONE blank line between subtitle blocks.
- PRESERVE ALL PUNCTUATION & HTML TAGS: Keep dialogue hyphens (-), keep all HTML tags (<i>, </i>, <font>, etc.).
- Output ONLY the translated SRT text with no extra commentary:

${srtBatch}`;

    const resp = await axios.post('/api/ai/generate', {
        contents: [{ parts: [{ text: prompt }] }],
        aiTask: 'srt_translation',
        model: model,
        lineCount: texts.length,
        movieTitle: movieContextStr || 'SRT Subtitle Translation'
    }, {
        timeout: 180000,
        signal
    });

    let raw: string = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/```(srt|txt|text)?/gi, '').replace(/```/g, '').trim();

    const inTok = Math.round(prompt.length / 3.8);
    const outTok = Math.round(raw.length / 3.2);

    const result: string[] = [...texts];

    try {
        const parsedReturned = parseSRT(raw);
        if (parsedReturned.length > 0) {
            texts.forEach((_, i) => {
                const targetBlock = fullBlocks[batchStartIndex + i];
                // 1. Match by exact original Block ID
                const matchedById = parsedReturned.find(b => b.id === targetBlock?.id);
                // 2. Or fallback to i-th block in returned batch
                const translatedBlock = matchedById || parsedReturned[i];
                if (translatedBlock && translatedBlock.text && translatedBlock.text.trim()) {
                    result[i] = translatedBlock.text.trim();
                }
            });
        }
    } catch (err) {
        console.warn("SRT parsing failed, fallback...", raw, err);
    }

    return { translatedList: result, inTok, outTok };
};

export default function SrtTranslator() {
    const { user, refreshUser } = useAuth();
    const [globalToasts, setGlobalToasts] = useState<{ id: number, msg: string, type: 'error' | 'success' }[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [blocks, setBlocks] = useState<SubBlock[]>([]);
    const [translated, setTranslated] = useState<SubBlock[]>([]);
    const [linguisticAnalysis, setLinguisticAnalysis] = useState<string>('');
    const [analyzing, setAnalyzing] = useState(false);
    const [status, setStatus] = useState<'idle' | 'analyzing' | 'translating' | 'done' | 'error' | 'stopped'>('idle');
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [open, setOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const stopRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Platform Movies & Glossary Cache
    const [moviesList, setMoviesList] = useState<any[]>([]);
    const [allGlossary, setAllGlossary] = useState<any[]>([]);

    // Feature 1 & 2: Show Context & Auto-Detect
    const [detectedContext, setDetectedContext] = useState<{
        title: string;
        season: number | null;
        episode: number | null;
        matchedMovieId: string | null;
        genre: string;
        summary: string;
    } | null>(null);
    const [fetchingStory, setFetchingStory] = useState(false);

    // Feature 3: Selected Tone
    const [selectedTone, setSelectedTone] = useState<string>(() => {
        return localStorage.getItem('ks_srt_tone') || 'casual';
    });

    // Feature 4: Live Stats & Cost Meter
    const [stats, setStats] = useState<{
        totalInTok: number;
        totalOutTok: number;
        costUsd: number;
        speedTokSec: number;
        startTime: number;
        elapsedSec: number;
    }>({
        totalInTok: 0,
        totalOutTok: 0,
        costUsd: 0,
        speedTokSec: 0,
        startTime: 0,
        elapsedSec: 0
    });

    // Selected AI Model
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        const cached = localStorage.getItem('ks_srt_ai_model');
        if (cached && AI_TRANSLATION_MODELS.some(m => m.id === cached)) return cached;
        return 'anthropic/claude-sonnet-5';
    });

    // Fetch movies & glossary on mount
    useEffect(() => {
        axios.get('/api/movies')
            .then(r => Array.isArray(r.data) && setMoviesList(r.data))
            .catch(() => {});
        axios.get('/api/glossary')
            .then(r => Array.isArray(r.data) && setAllGlossary(r.data))
            .catch(() => {});
    }, []);

    const handleModelChange = (modelId: string) => {
        setSelectedModel(modelId);
        localStorage.setItem('ks_srt_ai_model', modelId);
    };

    const handleToneChange = (toneId: string) => {
        setSelectedTone(toneId);
        localStorage.setItem('ks_srt_tone', toneId);
    };

    const showGlobalToast = (msg: string, type: 'error' | 'success' = 'error') => {
        const id = Date.now();
        setGlobalToasts(t => [...t, { id, msg, type }]);
        setTimeout(() => setGlobalToasts(t => t.filter(x => x.id !== id)), 4000);
    };

    // Auto-fetch movie synopsis using fast AI
    const fetchAiSynopsis = async (
        title: string, 
        season: number | null, 
        episode: number | null, 
        currentGenre?: string
    ) => {
        if (!title || title === 'فیلم/زنجیرە') return;
        setFetchingStory(true);
        try {
            const seStr = season && episode ? `Season ${season} Episode ${episode}` : '';
            const prompt = `You are a cinematic database and movie expert. 
For the movie/series: "${title}" ${seStr}.
Provide:
1. Genre in Kurdish (e.g. ترسناک، دراما، زۆمبی or زانستی، سەرکێشی).
2. A concise 2-sentence synopsis in Central Kurdish (Sorani) summarizing the main premise, world setting, and characters to help a subtitle translator understand the context.

FORMAT YOUR RESPONSE EXACTLY AS JSON:
{"genre": "<kurdish genre>", "summary": "<2-sentence Kurdish synopsis>"}`;

            const resp = await axios.post('/api/ai/generate', {
                contents: [{ parts: [{ text: prompt }] }],
                aiTask: 'srt_translation',
                model: 'google/gemini-2.5-flash'
            }, { timeout: 30000 });

            let text: string = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            text = text.replace(/```(json)?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(text);

            setDetectedContext(prev => prev ? ({
                ...prev,
                genre: currentGenre || parsed.genre || prev.genre || 'سینەمایی',
                summary: parsed.summary || prev.summary
            }) : null);
        } catch (err) {
            console.warn('Failed to auto-fetch AI synopsis:', err);
        } finally {
            setFetchingStory(false);
        }
    };

    // Filter active glossary for current movie + global
    const activeGlossary = useMemo(() => {
        const movieId = detectedContext?.matchedMovieId;
        return allGlossary.filter(g => {
            if (movieId && g.movieId === movieId) return true;
            return !g.movieId || g.movieId === 'global';
        });
    }, [allGlossary, detectedContext?.matchedMovieId]);

    // Handle File Drop / Selection & Auto-Detect Movie Context
    const handleFile = (f: File) => {
        setFile(f);
        setTranslated([]);
        setLinguisticAnalysis('');
        setStatus('idle');
        setProgress(0);
        setStats({ totalInTok: 0, totalOutTok: 0, costUsd: 0, speedTokSec: 0, startTime: 0, elapsedSec: 0 });
        stopRef.current = false;

        // Parse filename
        const parsed = parseFilenameContext(f.name);
        
        // Match with local movie database
        let matchedMovie: any = null;
        if (parsed.title) {
            const cleanQuery = parsed.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            matchedMovie = moviesList.find(m => {
                const titleClean = (m.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const origClean = (m.originalTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                return titleClean.includes(cleanQuery) || cleanQuery.includes(titleClean) ||
                       origClean.includes(cleanQuery) || cleanQuery.includes(origClean);
            });
        }

        const initialTitle = matchedMovie?.title || parsed.title || 'فیلم/زنجیرە';
        const initialGenre = matchedMovie?.genre || '';
        const initialSummary = matchedMovie?.description || '';

        setDetectedContext({
            title: initialTitle,
            season: parsed.season,
            episode: parsed.episode,
            matchedMovieId: matchedMovie?.id || null,
            genre: initialGenre,
            summary: initialSummary
        });

        // If synopsis is missing, automatically discover it with AI
        if (!initialSummary && initialTitle) {
            fetchAiSynopsis(initialTitle, parsed.season, parsed.episode, initialGenre);
        }

        const reader = new FileReader();
        reader.onload = e => {
            const parsedBlocks = parseSRT(e.target?.result as string);
            setBlocks(parsedBlocks);
            setTranslated([...parsedBlocks]);
        };
        reader.readAsText(f, 'utf-8');
    };

    // Construct Context Strings
    const getMovieContextPromptStr = () => {
        if (!detectedContext) return '';
        const se = detectedContext.season && detectedContext.episode 
            ? `(Season ${detectedContext.season}, Episode ${detectedContext.episode})` 
            : '';
        return `Title: "${detectedContext.title}" ${se} | Genre: ${detectedContext.genre || 'Cinematic Drama'} | Context: ${detectedContext.summary || 'Movie/TV Dialogue'}`;
    };

    const getTonePromptRule = () => {
        const tone = TRANSLATION_TONES.find(t => t.id === selectedTone) || TRANSLATION_TONES[0];
        return tone.promptRule;
    };

    // Recalculate Live Stats
    const updateStats = (inTokDelta: number, outTokDelta: number, startTimestamp: number) => {
        setStats(prev => {
            const newIn = prev.totalInTok + inTokDelta;
            const newOut = prev.totalOutTok + outTokDelta;
            const pricing = MODEL_PRICING[selectedModel] || MODEL_PRICING['anthropic/claude-sonnet-5'];
            const cost = (newIn / 1000000) * pricing.inPricePerM + (newOut / 1000000) * pricing.outPricePerM;
            const now = Date.now();
            const elapsed = Math.max(1, Math.round((now - startTimestamp) / 1000));
            const speed = Math.round(newOut / elapsed);

            return {
                totalInTok: newIn,
                totalOutTok: newOut,
                costUsd: cost,
                speedTokSec: speed,
                startTime: startTimestamp,
                elapsedSec: elapsed
            };
        });
    };

    // Standalone CEFR Linguistic Analysis Run
    const handleRunOnlyLinguisticAnalysis = async () => {
        return startProcessing('analyze_only');
    };

    // Processing (Mode: 'all' | 'translate_only' | 'analyze_only')
    const startProcessing = async (mode: 'all' | 'translate_only' | 'analyze_only' = 'all') => {
        if (!blocks.length) return;
        setErrorMsg('');
        stopRef.current = false;
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        const startTimestamp = Date.now();
        setStats({ totalInTok: 0, totalOutTok: 0, costUsd: 0, speedTokSec: 0, startTime: startTimestamp, elapsedSec: 0 });

        try {
            // STEP 1: Generate Linguistic Analysis if mode is 'all' or 'analyze_only'
            if (mode === 'all' || mode === 'analyze_only') {
                setStatus('analyzing');
                setAnalyzing(true);
                const allEnglishText = blocks.map(b => b.text).join('\n');
                try {
                    const { text: analysisReport, inTok, outTok } = await generateLinguisticAnalysis(
                        allEnglishText, 
                        selectedModel, 
                        getMovieContextPromptStr(),
                        signal
                    );
                    setLinguisticAnalysis(analysisReport);
                    updateStats(inTok, outTok, startTimestamp);
                    if (mode === 'analyze_only') {
                        setAnalyzing(false);
                        setStatus('done');
                        showGlobalToast('شیکاریی زمانەوانی و CEFR بە سەرکەوتوویی ئامادە کرا! ✓', 'success');
                        return;
                    }
                } catch (err: any) {
                    if (stopRef.current || signal.aborted) {
                        setStatus('stopped');
                        setAnalyzing(false);
                        return;
                    }
                    console.warn('Analysis step had issue, continuing to translation...', err);
                    if (mode === 'analyze_only') {
                        setAnalyzing(false);
                        throw err;
                    }
                } finally {
                    setAnalyzing(false);
                }
            }

            if (stopRef.current || signal.aborted) {
                setStatus('stopped');
                return;
            }

            // STEP 2: Translate SRT Blocks Batch by Batch if mode is 'all' or 'translate_only'
            setStatus('translating');
            setProgress(0);
            setTotal(blocks.length);
            const currentResult: SubBlock[] = [...blocks];
            const batches: SubBlock[][] = [];
            for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
                batches.push(blocks.slice(i, i + BATCH_SIZE));
            }

            let done = 0;
            const movieContextStr = getMovieContextPromptStr();
            const toneRuleStr = getTonePromptRule();

            for (const batch of batches) {
                if (stopRef.current || signal.aborted) {
                    setStatus('stopped');
                    break;
                }

                const texts = batch.map(b => b.text);
                let translatedTexts: string[] = [];
                let retries = 4;
                let success = false;

                while (retries > 0 && !success && !stopRef.current && !signal.aborted) {
                    try {
                        const batchRes = await translateBatch(
                            texts, 
                            blocks, 
                            done, 
                            selectedModel,
                            movieContextStr,
                            toneRuleStr,
                            activeGlossary,
                            signal
                        );
                        translatedTexts = batchRes.translatedList;
                        updateStats(batchRes.inTok, batchRes.outTok, startTimestamp);
                        success = true;
                    } catch (err: any) {
                        if (stopRef.current || signal.aborted || err?.name === 'CanceledError' || err?.name === 'AbortError') {
                            setStatus('stopped');
                            break;
                        }
                        const errStatus = err?.response?.status;
                        if (errStatus === 402) {
                            refreshUser();
                            throw err; // Stop retries immediately on insufficient credits
                        } else if (errStatus === 429) {
                            retries--;
                            if (retries === 0) throw err;
                            await new Promise(r => setTimeout(r, 4000));
                        } else {
                            throw err;
                        }
                    }
                }

                if (stopRef.current || signal.aborted) {
                    setStatus('stopped');
                    break;
                }

                batch.forEach((b, i) => {
                    const idx = blocks.findIndex(x => x.id === b.id);
                    if (idx !== -1 && translatedTexts[i]) {
                        currentResult[idx] = { ...b, text: translatedTexts[i] };
                    }
                });
                done += batch.length;
                setProgress(done);
                setTranslated([...currentResult]);
                refreshUser(); // Keep live credit balance up to date in UI

                if (done < blocks.length && !stopRef.current && !signal.aborted) {
                    await new Promise(r => setTimeout(r, 600));
                }
            }

            if (!stopRef.current && !signal.aborted) {
                setStatus('done');
                showGlobalToast(
                    mode === 'translate_only' 
                        ? 'وەرگێڕانی سەبتایتڵ بە سەرکەوتوویی تەواو بوو! ✓' 
                        : 'شیکاری و وەرگێڕان بە سەرکەوتوویی تەواو بوو! ✓', 
                    'success'
                );
            }
        } catch (e: any) {
            if (stopRef.current || abortControllerRef.current?.signal.aborted) {
                setStatus('stopped');
            } else {
                refreshUser();
                const msg = e.response?.data?.error?.message || e.response?.data?.error || e.message || 'کێشەیەک ڕووی دا';
                setErrorMsg(msg);
                setStatus('error');
                showGlobalToast(msg, 'error');
            }
        }
    };

    const stopTranslation = () => {
        stopRef.current = true;
        if (abortControllerRef.current) {
            try {
                abortControllerRef.current.abort();
            } catch {}
        }
        setStatus('stopped');
        setAnalyzing(false);
        showGlobalToast('وەرگێڕان دەستبەجێ وەستێنرا 🛑', 'error');
    };

    // Download 1: Subtitle SRT File
    const downloadSrt = () => {
        const content = toSrtString(translated);
        const blob = new Blob(['\ufeff' + content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file ? file.name.replace(/\.srt$/i, '_kurdish.srt') : 'kurdish.srt';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Download 2: Linguistic Analysis TXT File
    const downloadAnalysisTxt = () => {
        if (!linguisticAnalysis) return;
        const blob = new Blob(['\ufeff' + linguisticAnalysis], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file ? file.name.replace(/\.srt$/i, '_linguistic_analysis.txt') : 'linguistic_analysis.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const reset = () => {
        setFile(null);
        setBlocks([]);
        setTranslated([]);
        setLinguisticAnalysis('');
        setDetectedContext(null);
        setStatus('idle');
        setProgress(0);
        setStats({ totalInTok: 0, totalOutTok: 0, costUsd: 0, speedTokSec: 0, startTime: 0, elapsedSec: 0 });
        if (fileRef.current) fileRef.current.value = '';
    };

    const percent = total > 0 ? Math.round((progress / total) * 100) : 0;

    return (
        <div className="srt-translator-wrap">
            <button className="srt-toggle-btn" onClick={() => setOpen(!open)}>
                <div className="srt-toggle-title-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Languages size={17} className="srt-toggle-icon" />
                    <span className="srt-title-desktop">وەرگێڕان و شیکاریی SRT بۆ کوردی (AI Master)</span>
                    <span className="srt-title-mobile">وەرگێڕی زیرەکی SRT</span>
                </div>
                <div className="srt-toggle-right-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {user && (
                        <span className="srt-credits-pill">
                            <Coins size={13} color="#facc15" />
                            <span>{user.role === 'super_admin' ? 'سەرۆک' : `${(user.credits || 0).toLocaleString()} کرێدیت`}</span>
                        </span>
                    )}
                    <span className={`srt-chevron ${open ? 'open' : ''}`}>▼</span>
                </div>
            </button>

            {open && (
                <div className="srt-panel">
                    <div className="srt-panel-inner">
                        {/* Drop Zone */}
                        {!file ? (
                            <div
                                className="srt-drop-zone"
                                onClick={() => fileRef.current?.click()}
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && f.name.endsWith('.srt')) handleFile(f); }}
                            >
                                <input type="file" accept=".srt" ref={fileRef} className="hidden-input" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                                <Upload size={36} className="srt-drop-icon" />
                                <p className="srt-drop-text">فایلی SRT لێرە بخە یان کلیک بکە</p>
                                <p className="srt-drop-sub">ناسینەوەی خۆکاری ناوی فیلم + شیکاری زمانەوانی + وەرگێڕانی دەستەیی کوردی سۆرانی</p>
                            </div>
                        ) : (
                            <div className="srt-file-loaded">
                                <div className="srt-file-info">
                                    <FileText size={20} />
                                    <div>
                                        <div className="srt-file-name">{file.name}</div>
                                        <div className="srt-file-meta">{blocks.length} بلۆکی سەبتایتڵ ئامادەیە</div>
                                    </div>
                                    <button className="srt-remove-btn" onClick={reset} title="سڕینەوە و هەڵبژاردنی فایلی نوێ"><X size={16} /></button>
                                </div>

                                {/* Feature 1 & 2: Auto-Detected Movie Context & Glossary Banner */}
                                {detectedContext && (
                                    <div className="srt-context-banner">
                                        <div className="srt-context-header">
                                            <div className="srt-context-title-wrap">
                                                <Clapperboard size={16} color="#38bdf8" />
                                                <span className="srt-context-title">
                                                    بەرهەمی دۆزراوە: <strong>{detectedContext.title}</strong>
                                                    {detectedContext.season && detectedContext.episode && (
                                                        <span className="srt-context-ep-tag">
                                                            وەرزی {detectedContext.season} • ئەڵقەی {detectedContext.episode}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            <div className="srt-context-glossary-badge">
                                                <BookOpen size={13} />
                                                <span>{activeGlossary.length} زاراوەی فەرهەنگ بەستراوە</span>
                                            </div>
                                        </div>

                                        {/* Movie Link Dropdown / Selector */}
                                        <div className="srt-context-controls">
                                            <label className="srt-context-label">🎬 پەیوەستکردن بە فەرهەنگی بەرهەم:</label>
                                            <select
                                                value={detectedContext.matchedMovieId || 'global'}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    const matched = moviesList.find(m => m.id === val);
                                                    const newTitle = matched ? matched.title : detectedContext.title;
                                                    const newGenre = matched ? matched.genre : detectedContext.genre;
                                                    const newSummary = matched ? matched.description : detectedContext.summary;

                                                    setDetectedContext({
                                                        ...detectedContext,
                                                        matchedMovieId: val === 'global' ? null : val,
                                                        title: newTitle,
                                                        genre: newGenre,
                                                        summary: newSummary
                                                    });

                                                    if (!newSummary && newTitle) {
                                                        fetchAiSynopsis(newTitle, detectedContext.season, detectedContext.episode, newGenre);
                                                    }
                                                }}
                                                className="srt-context-select"
                                                disabled={status === 'analyzing' || status === 'translating'}
                                            >
                                                <option value="global">🌐 فەرهەنگی گشتی (تەواوی فیلم و زنجیرەکان)</option>
                                                {moviesList.map(m => (
                                                    <option key={m.id} value={m.id}>
                                                        🎬 زنجیرەی: {m.title}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Visible Story & Synopsis Box */}
                                        <div className="srt-story-box">
                                            <div className="srt-story-header">
                                                <div className="srt-story-header-left">
                                                    <Sparkles size={14} color="#38bdf8" />
                                                    <span className="srt-story-label">کورتەی چیرۆک و جیهانی بەرهەمەکە (Story & Context):</span>
                                                </div>
                                                <div className="srt-story-header-right">
                                                    {detectedContext.genre && (
                                                        <span className="srt-story-genre-tag">🎭 {detectedContext.genre}</span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="btn-story-refresh"
                                                        onClick={() => fetchAiSynopsis(detectedContext.title, detectedContext.season, detectedContext.episode, detectedContext.genre)}
                                                        disabled={fetchingStory || status === 'analyzing' || status === 'translating'}
                                                        title="دۆزینەوەی دووبارەی کورتەی چیرۆک بە ژیری دەستکرد"
                                                    >
                                                        {fetchingStory ? <Loader2 size={12} className="spinning" /> : <Sparkles size={12} />}
                                                        {fetchingStory ? 'لە کاتی دۆزینەوەدایە...' : 'دۆزینەوەی کورتە بە AI'}
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea
                                                className="srt-story-textarea"
                                                placeholder="کورتەی چیرۆکی فیلمەکە لێرە دەردەکەوێت و دەدرێت بە AI بۆ تێگەیشتن لە دیالۆگەکان (دەتوانیت خۆت دەستکاری بکەیت)..."
                                                value={detectedContext.summary || ''}
                                                onChange={e => setDetectedContext({ ...detectedContext, summary: e.target.value })}
                                                rows={2}
                                                disabled={status === 'analyzing' || status === 'translating'}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Feature 3: Tone & Dialect Selector */}
                                <div className="srt-tone-selection-box">
                                    <div className="srt-tone-header">
                                        <Sliders size={16} className="tone-icon" />
                                        <span>شێوازی دەربڕین و دەنگی کوردی (Tone):</span>
                                    </div>
                                    <div className="srt-tone-grid">
                                        {TRANSLATION_TONES.map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                className={`srt-tone-card ${selectedTone === t.id ? 'active' : ''}`}
                                                onClick={() => handleToneChange(t.id)}
                                                disabled={status === 'analyzing' || status === 'translating'}
                                            >
                                                <div className="srt-tone-card-top">
                                                    <span className="srt-tone-icon">{t.icon}</span>
                                                    <span className="srt-tone-name">{t.name}</span>
                                                    {selectedTone === t.id && <Check size={14} className="tone-check" />}
                                                </div>
                                                <div className="srt-tone-desc">{t.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Status Progress */}
                                {status === 'analyzing' && (
                                    <div className="srt-progress-wrap">
                                        <div className="srt-progress-label">
                                            <Loader2 size={16} className="spinning" />
                                            بەشی ١: خەریکی شیکاریی زمانەوانییە (ئاستەکانی CEFR، وشە قورسەکان، وشە دووبارەبووەکان)...
                                        </div>
                                    </div>
                                )}

                                {status === 'translating' && (
                                    <div className="srt-progress-wrap">
                                        <div className="srt-progress-bar-outer">
                                            <div className="srt-progress-bar-inner" style={{ width: `${percent}%` }} />
                                        </div>
                                        <div className="srt-progress-label">
                                            <Loader2 size={14} className="spinning" />
                                            بەشی ٢ و ٣: {progress} / {total} بلۆک وەرگێڕدرا ({percent}%)
                                        </div>
                                    </div>
                                )}

                                {/* Feature 4: Live Stats & Cost Meter */}
                                {(status === 'translating' || status === 'done' || stats.totalOutTok > 0) && (
                                    <div className="srt-live-stats-bar">
                                        <div className="stat-pill stat-cost">
                                            <DollarSign size={14} />
                                            <span>خەرجی: <strong>${stats.costUsd.toFixed(4)}</strong></span>
                                        </div>
                                        <div className="stat-pill stat-speed">
                                            <Gauge size={14} />
                                            <span>خێرایی: <strong>{stats.speedTokSec} tok/s</strong></span>
                                        </div>
                                        <div className="stat-pill stat-tokens">
                                            <Zap size={14} />
                                            <span>تۆکنەکان: <strong>{stats.totalInTok.toLocaleString()} In / {stats.totalOutTok.toLocaleString()} Out</strong></span>
                                        </div>
                                        {status === 'translating' && total > 0 && progress > 0 && (
                                            <div className="stat-pill stat-time">
                                                <span>⏱️ کاتی ماوە: <strong>~{Math.max(1, Math.round(((total - progress) / Math.max(1, progress)) * stats.elapsedSec))}s</strong></span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {status === 'done' && (
                                    <div className="srt-success">
                                        <CheckCircle size={18} />
                                        شیکاریی زمانەوانی و وەرگێڕانی {translated.length} بلۆک بە سەرکەوتوویی تەواو بوو!
                                    </div>
                                )}

                                {status === 'stopped' && (
                                    <div className="srt-stopped-msg">
                                        <AlertCircle size={18} />
                                        وەرگێڕان وەستێنرا. دەتوانیت ئەوەی تەواوکراوە داونلۆدی بکەیت.
                                    </div>
                                )}

                                {status === 'error' && (
                                    <div className="srt-error">
                                        <AlertCircle size={18} />
                                        {errorMsg}
                                    </div>
                                )}

                                {/* AI Model Selection */}
                                <div className="srt-model-selection-box">
                                    <div className="srt-model-header">
                                        <Sparkles size={16} className="sparkle-icon" />
                                        <span>مۆدێلی ژیری دەستکرد بۆ وەرگێڕان:</span>
                                    </div>
                                    <div className="srt-model-grid">
                                        {AI_TRANSLATION_MODELS.map(m => (
                                            <button
                                                key={m.id}
                                                type="button"
                                                className={`srt-model-card ${selectedModel === m.id ? 'active' : ''}`}
                                                onClick={() => handleModelChange(m.id)}
                                                disabled={status === 'analyzing' || status === 'translating'}
                                            >
                                                <div className="srt-model-card-top">
                                                    <span className="srt-model-name">{m.icon} {m.name}</span>
                                                    <span className="srt-model-badge">{m.badge}</span>
                                                </div>
                                                <div className="srt-model-desc">{m.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="srt-actions">
                                    {(status === 'analyzing' || status === 'translating') ? (
                                        <button className="srt-stop-btn" onClick={stopTranslation}>
                                            <X size={16} /> ڕاگرتن
                                        </button>
                                    ) : (status !== 'done' && status !== 'stopped') && (
                                        <div className="srt-actions-modes-grid">
                                            {/* Mode 1: Translate Only */}
                                            <button
                                                type="button"
                                                className="srt-btn-mode srt-btn-translate-only"
                                                onClick={() => startProcessing('translate_only')}
                                                disabled={blocks.length === 0 || analyzing}
                                                title="تەنها دێڕەکانی سەبتایتڵ وەردەگێڕێت (خێراتر و کەم خەرجتر)"
                                            >
                                                <Languages size={16} />
                                                <span>🔤 تەنها وەرگێڕانی سەبتایتڵ</span>
                                            </button>

                                            {/* Mode 2: Linguistic Analysis Only */}
                                            <button
                                                type="button"
                                                className="srt-btn-mode srt-btn-analyze-only"
                                                onClick={() => startProcessing('analyze_only')}
                                                disabled={blocks.length === 0 || analyzing}
                                                title="تەنها شیکاریی زمانەوانی و CEFR ئامادە دەکات"
                                            >
                                                {analyzing ? <Loader2 size={16} className="spinning" /> : <BarChart3 size={16} />}
                                                <span>{analyzing ? 'خەریکی شیکارییە...' : '📊 تەنها شیکاریی زمانی CEFR'}</span>
                                            </button>

                                            {/* Mode 3: Both (Full Pipeline) */}
                                            <button
                                                type="button"
                                                className="srt-btn-mode srt-btn-both-primary"
                                                onClick={() => startProcessing('all')}
                                                disabled={blocks.length === 0 || analyzing}
                                                title="شیکاری زمانەوانی و وەرگێڕانی سەبتایتڵ پێکەوە ئەنجام دەدات"
                                            >
                                                <Sparkles size={16} />
                                                <span>✨ هەردووکی پێکەوە (شیکاری + وەرگێڕان)</span>
                                            </button>
                                        </div>
                                    )}

                                    {(status === 'done' || status === 'stopped') && (
                                        <div className="srt-download-buttons-group">
                                            {/* Download Button 1: SRT */}
                                            <button className="srt-download-btn srt-download-primary" onClick={downloadSrt}>
                                                <Download size={16} /> داگرتنی فایلی سەبتایتڵ (.srt)
                                            </button>

                                            {/* Download Button 2: Linguistic Analysis TXT */}
                                            {linguisticAnalysis ? (
                                                <button className="srt-download-btn srt-download-txt" onClick={downloadAnalysisTxt}>
                                                    <FileText size={16} /> داگرتنی شیکاریی CEFR (.txt)
                                                </button>
                                            ) : (
                                                <button className="srt-download-btn srt-download-txt" onClick={handleRunOnlyLinguisticAnalysis} disabled={analyzing}>
                                                    {analyzing ? <Loader2 size={16} className="spinning" /> : <BarChart3 size={16} />}
                                                    {analyzing ? 'خەریکی شیکارییە...' : 'دروستکردنی شیکاریی CEFR'}
                                                </button>
                                            )}

                                            <button className="srt-again-btn" onClick={reset}>
                                                فایلی نوێ
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Part 1: Linguistic Analysis View Box */}
                                {linguisticAnalysis && (
                                    <div className="srt-analysis-box">
                                        <div className="srt-analysis-header">
                                            <div className="srt-analysis-title">
                                                <BarChart3 size={18} />
                                                <span>بەشی یەکەم: شیکاریی زمانەوانی و ئاستی CEFR و ئامار</span>
                                            </div>
                                            <div className="srt-analysis-actions">
                                                <button
                                                    type="button"
                                                    className="srt-analysis-copy-btn"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(linguisticAnalysis);
                                                        showGlobalToast('شیکارییەکە کۆپی کرا! ✓', 'success');
                                                    }}
                                                    title="کۆپیکردنی دەق"
                                                >
                                                    <Copy size={15} /> کۆپی
                                                </button>
                                                <button
                                                    type="button"
                                                    className="srt-analysis-dl-btn"
                                                    onClick={downloadAnalysisTxt}
                                                    title="داگرتنی فایل (.txt)"
                                                >
                                                    <Download size={15} /> داگرتن (.txt)
                                                </button>
                                            </div>
                                        </div>
                                        <pre className="srt-analysis-content">{linguisticAnalysis}</pre>
                                    </div>
                                )}

                                {/* Preview Translated SRT (First 10 blocks) */}
                                {(status === 'done' || status === 'stopped') && translated.length > 0 && (
                                    <div className="srt-preview">
                                        <div className="srt-preview-title">پێشبینیی ژێرنووسی کوردی (١٠ی یەکەم):</div>
                                        {translated.slice(0, 10).map(b => (
                                            <div key={b.id} className="srt-preview-row">
                                                <span className="srt-preview-id">{b.id}</span>
                                                <span className="srt-preview-time">{b.time}</span>
                                                <span className="srt-preview-text">{b.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Global Toasts */}
            <div className="global-toast-container">
                {globalToasts.map(t => (
                    <div key={t.id} className={`global-toast global-toast-${t.type}`}>
                        {t.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                        <span>{t.msg}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
