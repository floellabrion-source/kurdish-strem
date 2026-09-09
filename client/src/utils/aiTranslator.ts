import axios from '../api/client';
import { LanguageMetrics, DifficultWord, RepeatedWord } from '../types';

export interface SubBlock {
    id: string;
    time: string;
    text: string;
}

export interface TranslationTaskStatus {
    taskId: string;
    status: 'idle' | 'running' | 'paused' | 'done' | 'error';
    percent: number;
    statusText: string;
    translatedCount: number;
    totalCount: number;
}

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

export const parseSRT = (raw: string): SubBlock[] => {
    if (!raw) return [];
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

export const toSrtString = (blocks: SubBlock[]): string =>
    blocks.map(b => `${b.id}\n${b.time}\n${b.text}`).join('\n\n');

// ─── GLOBAL PAUSE & RESUME REGISTRY ───
const pauseSignals = new Set<string>();

export interface ActiveAiTask {
    taskId: string;
    movieId: string;
    movieTitle?: string;
    seasonNum?: number;
    episodeNum?: number;
    episodeId?: string;
    type: 'single' | 'bulk';
    model: string;
    tone: string;
    mode: 'all' | 'translate_only' | 'analyze_only';
    status: 'running' | 'paused' | 'done' | 'error';
    percent: number;
    statusText: string;
    abortController: AbortController;
    stats: {
        totalInTok: number;
        totalOutTok: number;
        costUsd: number;
        speedTokSec: number;
        startTime: number;
        elapsedSec: number;
    };
    storyContext?: string;
    lastResult?: any;
    error?: string;
}

const activeTasksRegistry = new Map<string, ActiveAiTask>();
const taskListeners = new Set<(tasks: ActiveAiTask[]) => void>();

export const notifyTaskListeners = () => {
    const list = Array.from(activeTasksRegistry.values());
    taskListeners.forEach(fn => fn(list));
};

export const subscribeToAiTasks = (fn: (tasks: ActiveAiTask[]) => void) => {
    taskListeners.add(fn);
    fn(Array.from(activeTasksRegistry.values()));
    return () => {
        taskListeners.delete(fn);
    };
};

export const registerAiTask = (task: ActiveAiTask) => {
    activeTasksRegistry.set(task.taskId, task);
    notifyTaskListeners();
};

export const updateAiTask = (taskId: string, partial: Partial<ActiveAiTask>) => {
    const existing = activeTasksRegistry.get(taskId);
    if (existing) {
        Object.assign(existing, partial);
        notifyTaskListeners();
    }
};

export const removeAiTask = (taskId: string) => {
    activeTasksRegistry.delete(taskId);
    notifyTaskListeners();
};

export const getActiveAiTask = (taskId: string) => activeTasksRegistry.get(taskId);
export const getAllActiveAiTasks = () => Array.from(activeTasksRegistry.values());

export const stopAiTask = (taskId: string) => {
    const task = activeTasksRegistry.get(taskId);
    if (task) {
        task.abortController.abort();
        task.status = 'paused';
        task.statusText = 'وەرگێڕان ڕاگیرا 🛑';
        notifyTaskListeners();
    }
};

export const pauseTranslationTask = (taskId: string) => {
    pauseSignals.add(taskId);
    stopAiTask(taskId);
};

export const resumeTranslationTask = (taskId: string) => {
    pauseSignals.delete(taskId);
};

export const isTaskPaused = (taskId: string): boolean => {
    return pauseSignals.has(taskId);
};

// ─── PART 1: LINGUISTIC ANALYSIS & STATISTICS ───
export const generateLinguisticAnalysis = async (
    fullEnglishText: string,
    model: string = 'anthropic/claude-sonnet-4.6',
    movieContext?: string,
    signal?: AbortSignal
): Promise<{ text: string; inTok: number; outTok: number }> => {
    const prompt = `ACT AS A PROFESSIONAL LINGUISTIC ANALYZER. Provide a concise, highly accurate linguistic analysis of this English subtitle script in Central Kurdish (Sorani).
${movieContext ? `MOVIE / SHOW CONTEXT: ${movieContext}` : ''}

Provide ONLY the following 4 sections in Sorani Kurdish:

١. دابەشبوونی ئاستی وشەکان بەپێی ستانداردی ئەوروپی (CEFR Level Distribution):
Percentage for A1, A2, B1, B2, C1, C2.

٢. ١٠ قورسترین و پێشکەوتووترین وشە (Top 10 Difficult Words):
List 10 difficult words with English word, part of speech, CEFR level, and Sorani definition.

٣. کۆی گشتیی وشەکان (Total Word Count):
Total number of words.

٤. ئەو وشە سەرەکییانەی زۆرترین جار دووبارە بوونەتەوە (Repeated Content Words):
Top repeated content words with count and Sorani meaning.

Subtitle Sample:
\n${fullEnglishText.slice(0, 6000)}`;

    const resp = await axios.post('/api/ai/generate', {
        contents: [{ parts: [{ text: prompt }] }],
        aiTask: 'srt_translation',
        model: model,
        max_tokens: 1500
    }, {
        timeout: 120000,
        signal
    });

    let raw: string = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanText = raw.replace(/```(txt|markdown|text)?/gi, '').replace(/```/g, '').trim();

    const inTok = Math.round(prompt.length / 3.8);
    const outTok = Math.round(cleanText.length / 3.2);

    return { text: cleanText, inTok, outTok };
};

// ─── PART 2 & 3: TRANSLATION QUALITY & STRICT SRT FORMATTING ───
export const translateBatch = async (
    texts: string[], 
    fullBlocks: SubBlock[], 
    batchStartIndex: number,
    model: string = 'anthropic/claude-sonnet-5',
    movieContextStr: string = '',
    toneRuleStr: string = '',
    glossaryTerms: any[] = [],
    signal?: AbortSignal
): Promise<{ translatedList: string[]; inTok: number; outTok: number }> => {
    const srtBatch = texts.map((t, idx) => {
        const block = fullBlocks[batchStartIndex + idx];
        return `${block.id}\n${block.time}\n${t}`;
    }).join('\n\n');

    const glossarySection = glossaryTerms.length > 0
        ? `\n🚨 MANDATORY GLOSSARY RULES (STRICT HIGHEST PRIORITY):\n` +
          `You MUST strictly use these exact Kurdish translations whenever these English terms appear (including plurals and inflections):\n` +
          glossaryTerms.map(g => `• "${g.english}" -> MUST BE TRANSLATED AS: "${g.kurdish}" (do NOT use any other translation/synonym for this term)`).join('\n') +
          `\nMake sure to adhere 100% to this glossary list across all translated lines.\n`
        : '';

    const prompt = `ACT AS A PROFESSIONAL SUBTITLE TRANSLATOR. Translate the following English SRT subtitle batch into high-quality, natural, and fluent Central Kurdish (Sorani) adhering strictly to these rules:

${glossarySection}
${movieContextStr ? `CONTEXT & SETTING: ${movieContextStr}` : ''}
${toneRuleStr}

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
        movieTitle: movieContextStr || 'SRT Batch Translation'
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
                const matchedById = parsedReturned.find(b => b.id === targetBlock?.id);
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

// ─── PARSE LINGUISTIC ANALYSIS TEXT TO LANGUAGE METRICS OBJECT ───
export const parseLinguisticAnalysisText = (rawText: string): LanguageMetrics => {
    // Convert Kurdish / Eastern Arabic numerals to ASCII digits
    const toAsciiDigits = (s: string) => {
        const map: Record<string, string> = {
            '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
            '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
            '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
            '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
            '٪': '%'
        };
        return s.replace(/[٠-٩۰-۹٪]/g, ch => map[ch] || ch);
    };

    const normText = toAsciiDigits(rawText || '');

    let totalWords = 1000;
    const dist: Record<'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Unknown', number> = {
        A1: 20, A2: 25, B1: 30, B2: 15, C1: 8, C2: 2, Unknown: 0
    };
    const difficultWords: DifficultWord[] = [];
    const repeatedWords: RepeatedWord[] = [];

    // 1. Parse Total Words
    const wordCountMatch = normText.match(/(?:کۆی\s*گشتیی?\s*وشەکان|Total\s*Word\s*Count)[^\d]*([\d,]+)/i) ||
                           normText.match(/(\d+)\s*وشە/i);
    if (wordCountMatch) {
        const parsedCount = parseInt(wordCountMatch[1].replace(/,/g, ''), 10);
        if (!isNaN(parsedCount) && parsedCount > 0) {
            totalWords = parsedCount;
        }
    }

    // 2. Parse CEFR Level Distribution
    const levels: Array<'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'> = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    levels.forEach(lvl => {
        const match = normText.match(new RegExp('(?:\\|\\s*' + lvl + '\\s*\\|\\s*|' + lvl + '[^\\d%]{0,12})(\\d+(?:\\.\\d+)?)\\s*%', 'i'));
        if (match) {
            dist[lvl] = Math.round(parseFloat(match[1]));
        }
    });

    // Determine overall CEFR level
    let cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' = 'B1';
    if (dist.C2 >= 5 || dist.C1 >= 15) cefrLevel = 'C1';
    else if (dist.B2 >= 20 || dist.C1 >= 8) cefrLevel = 'B2';
    else if (dist.B1 >= 20) cefrLevel = 'B1';
    else if (dist.A2 >= 30) cefrLevel = 'A2';
    else cefrLevel = 'A1';

    // 3. Parse Top 10 Difficult Words (Handle both Markdown Tables and Lists)
    const lines = normText.split('\n');
    for (const line of lines) {
        // A) Markdown Table row
        if (line.includes('|')) {
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 3) {
                // Find column containing English word
                for (let cIdx = 0; cIdx < Math.min(cells.length - 1, 3); cIdx++) {
                    const cleanWord = cells[cIdx].replace(/[*_#`]/g, '').trim();
                    if (/^[a-zA-Z\s\-']{2,30}$/.test(cleanWord) && !/^(word|words|english|level|type|cefr|pos|noun|verb|adj|adv|وشە|ئاست|بەش)$/i.test(cleanWord)) {
                        const type = cells.length >= 4 && cIdx + 1 < cells.length - 1
                            ? cells[cIdx + 1].replace(/[*_`]/g, '').trim()
                            : 'Noun';
                        const def = cells[cells.length - 1].replace(/[*_`]/g, '').trim();
                        if (def && def.length > 1 && !def.includes('---')) {
                            difficultWords.push({ word: cleanWord, type: type || 'Noun', definition: def });
                        }
                        break;
                    }
                }
            }
        } else {
            // B) List item format: "1. **Word** (Noun): Definition"
            const listMatch = line.match(/(?:^|\n)\s*(?:\d+[\.\)]|\*|-)\s*\*?\*?([a-zA-Z\s\-']{2,30})\*?\*?\s*(?:\(([^)]+)\)|-\s*([a-zA-Z\s]+))?[:\s\-]+([^\n]+)/i);
            if (listMatch) {
                const word = listMatch[1]?.trim();
                const type = listMatch[2]?.trim() || listMatch[3]?.trim() || 'Noun';
                const definition = listMatch[4]?.trim().replace(/^[:\s*-]+/, '').replace(/^(?:واتا|مانا|ڕوونکردنەوە)[:\s*]+/, '') || '';
                if (word && definition && !/^(word|words|english|وشە)/i.test(word) && difficultWords.length < 20) {
                    difficultWords.push({ word, type, definition });
                }
            }
        }
    }

    // 4. Parse Repeated Content Words
    for (const line of lines) {
        if (line.includes('|')) {
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 3) {
                const wCell = cells[0].replace(/[*_`#]/g, '').trim();
                const countCell = cells[1].replace(/[*_`#]/g, '').trim();
                const meanCell = cells[2].replace(/[*_`#]/g, '').trim();
                const countMatch = countCell.match(/(\d+)/);
                if (/^[a-zA-Z\s\-']{2,30}$/.test(wCell) && countMatch && !/^(word|وشە|ژمارە)/i.test(wCell)) {
                    repeatedWords.push({
                        word: wCell,
                        count: parseInt(countMatch[1], 10),
                        meaning: meanCell
                    });
                }
            }
        } else {
            const rMatch = line.match(/[\*\-]\s*\*?\*?([a-zA-Z\s\/\-']{2,30})\*?\*?\s*[:=]\s*(\d+)\s*جار(?:\s*\(([^)]+)\))?/i);
            if (rMatch) {
                const word = rMatch[1]?.trim();
                const count = parseInt(rMatch[2], 10) || 1;
                const meaning = rMatch[3]?.trim() || '';
                if (word && word.length > 0 && repeatedWords.length < 30) {
                    repeatedWords.push({ word, count, meaning });
                }
            }
        }
    }

    const lexicalDensity = Math.min(85, Math.max(20, Math.round(35 + (dist.B2 + dist.C1 + dist.C2) * 0.4)));
    const vocabDiversity = Math.min(80, Math.max(18, Math.round(25 + (dist.B1 + dist.B2) * 0.3)));

    return {
        totalWords,
        lexicalDensity,
        vocabDiversity,
        cefrLevel,
        distribution: dist,
        difficultWords: difficultWords.length > 0 ? difficultWords.slice(0, 10) : undefined,
        repeatedWords: repeatedWords.length > 0 ? repeatedWords.slice(0, 15) : undefined
    };
};

export interface AiTranslationOptions {
    model?: string;
    tone?: string;
    mode?: 'all' | 'translate_only' | 'analyze_only';
    contextStr?: string;
    glossaryTerms?: any[];
    signal?: AbortSignal;
    onStatsUpdate?: (inTok: number, outTok: number) => void;
}

// ─── COMPLETE TRANSLATION & ANALYSIS PIPELINE WITH PAUSE & RESUME SUPPORT ───
export async function runAiTranslationAndAnalysis(
    movieId: string,
    seasonNum?: number,
    episodeNum?: number,
    onProgress?: (statusText: string, percent: number, status: 'running' | 'paused' | 'done') => void,
    options?: AiTranslationOptions
): Promise<{
    status: 'done' | 'paused';
    metrics?: LanguageMetrics;
    analysisReport?: string;
    kurdishSrt: string;
    translatedCount: number;
    totalCount: number;
}> {
    const taskId = `${movieId}-${seasonNum ?? 'm'}-${episodeNum ?? 'm'}`;
    resumeTranslationTask(taskId); // Reset any previous pause signal

    const selectedModel = options?.model || 'anthropic/claude-sonnet-5';
    const selectedTone = options?.tone || 'casual';
    const mode = options?.mode || 'all';
    const contextStr = options?.contextStr || '';
    const glossaryTerms = options?.glossaryTerms || [];
    const signal = options?.signal;
    const onStatsUpdate = options?.onStatsUpdate;

    const toneObj = TRANSLATION_TONES.find(t => t.id === selectedTone) || TRANSLATION_TONES[0];
    const toneRuleStr = toneObj.promptRule;

    // 1. Fetch original and existing translated SRT text (with 30s timeout)
    onProgress?.('بارکردنی فایلی ئینگلیزی (Original)...', 5, 'running');
    let res: any;
    try {
        res = await axios.get(`/api/admin/movies/${movieId}/srt-content`, {
            params: { seasonNum, episodeNum },
            signal,
            timeout: 30000  // 30 second timeout for SRT fetch
        });
    } catch (fetchErr: any) {
        if (signal?.aborted || fetchErr?.code === 'ERR_CANCELED') {
            onProgress?.('ڕاگیرا', 0, 'paused');
            return { status: 'paused', kurdishSrt: '', translatedCount: 0, totalCount: 0 };
        }
        if (fetchErr?.code === 'ECONNABORTED' || fetchErr?.message?.includes('timeout')) {
            throw new Error(`کات بەسەرچوو کاتی بارکردنی فایلی SRT! (Timeout). تکایە دووبارە هەوڵبدەرەوە.`);
        }
        throw fetchErr;
    }


    const origText = res.data.originalSrtText || '';
    const existingTransText = res.data.translatedSrtText || '';

    if (!origText.trim()) {
        throw new Error('فایلی ئینگلیزی (Original) بەردەست نییە! تکایە سەرەتا فایلی ئینگلیزی دابنێ.');
    }

    const parsedOrigBlocks = parseSRT(origText);
    const parsedExistingTrans = parseSRT(existingTransText);

    // Build map of already translated lines
    const existingTransMap = new Map<string, string>();
    parsedExistingTrans.forEach(b => {
        if (b.text.trim()) existingTransMap.set(b.id, b.text);
    });

    // Initialize full working blocks array
    const translatedBlocks: SubBlock[] = parsedOrigBlocks.map(b => ({
        ...b,
        text: existingTransMap.get(b.id) || ''
    }));

    // Find indices that still need translation
    const pendingIndices: number[] = [];
    translatedBlocks.forEach((b, idx) => {
        if (!b.text.trim()) {
            pendingIndices.push(idx);
        }
    });

    const totalBlocks = parsedOrigBlocks.length;
    let completedCount = totalBlocks - pendingIndices.length;

    // 2. Generate Linguistic Analysis if mode is 'all' or 'analyze_only'
    let analysisReport = '';
    let parsedMetrics: LanguageMetrics | undefined;

    if (mode === 'all' || mode === 'analyze_only') {
        if (completedCount === 0 || !existingTransText.trim() || mode === 'analyze_only') {
            onProgress?.('ئەنجامدانی شیکاریی زمانەوانی (CEFR، وشە قورسەکان)...', 10, 'running');
            try {
                const analysisRes = await generateLinguisticAnalysis(origText, selectedModel, contextStr, signal);
                analysisReport = analysisRes.text;
                parsedMetrics = parseLinguisticAnalysisText(analysisReport);

                // Compute exact word count mathematically from subtitle blocks
                const exactWordCount = parsedOrigBlocks.reduce((acc, b) => {
                    const words = b.text.trim().split(/\s+/).filter(w => w.length > 0 && !w.startsWith('<'));
                    return acc + words.length;
                }, 0);
                if (exactWordCount > 0) {
                    parsedMetrics.totalWords = exactWordCount;
                }

                onStatsUpdate?.(analysisRes.inTok, analysisRes.outTok);

                if (mode === 'analyze_only') {
                    onProgress?.('شیکاریی زمانەوانی تەواو بوو! ✓', 100, 'done');
                    return {
                        status: 'done',
                        metrics: parsedMetrics,
                        analysisReport,
                        kurdishSrt: existingTransText,
                        translatedCount: completedCount,
                        totalCount: totalBlocks
                    };
                }
            } catch (e: any) {
                if (isTaskPaused(taskId) || signal?.aborted) {
                    onProgress?.('ڕاگیرا', 0, 'paused');
                    return { status: 'paused', kurdishSrt: existingTransText, translatedCount: completedCount, totalCount: totalBlocks };
                }
                console.warn('Analysis generation skipped:', e);
            }
        }
    }

    if (isTaskPaused(taskId) || signal?.aborted) {
        onProgress?.('ڕاگیرا', 0, 'paused');
        return { status: 'paused', kurdishSrt: existingTransText, translatedCount: completedCount, totalCount: totalBlocks };
    }

    // If already 100% translated, finish immediately without calling AI
    if (pendingIndices.length === 0) {
        onProgress?.('ئەم ئەڵقەیە پێشتر 100% تەواو بووە (تێپەڕێنرا ✓)', 100, 'done');
        return {
            status: 'done',
            metrics: parsedMetrics,
            analysisReport,
            kurdishSrt: existingTransText,
            translatedCount: totalBlocks,
            totalCount: totalBlocks
        };
    }

    // 3. Translate remaining batches with PAUSE/RESUME check
    const BATCH_SIZE = 35;

    for (let pIdx = 0; pIdx < pendingIndices.length; pIdx += BATCH_SIZE) {
        if (isTaskPaused(taskId) || signal?.aborted) {
            const pausedPct = Math.round((completedCount / totalBlocks) * 100);
            onProgress?.(`ڕاگیرا لە ${completedCount}/${totalBlocks} دێڕ (${pausedPct}%)`, pausedPct, 'paused');
            return {
                status: 'paused',
                metrics: parsedMetrics,
                analysisReport,
                kurdishSrt: toSrtString(translatedBlocks),
                translatedCount: completedCount,
                totalCount: totalBlocks
            };
        }

        const batchTargetIndices = pendingIndices.slice(pIdx, pIdx + BATCH_SIZE);
        const batchEnglishTexts = batchTargetIndices.map(idx => parsedOrigBlocks[idx].text);
        const batchFirstIndex = batchTargetIndices[0];

        const batchRes = await translateBatch(
            batchEnglishTexts, 
            parsedOrigBlocks, 
            batchFirstIndex, 
            selectedModel,
            contextStr,
            toneRuleStr,
            glossaryTerms,
            signal
        );

        onStatsUpdate?.(batchRes.inTok, batchRes.outTok);

        // Update translated blocks
        batchTargetIndices.forEach((origIdx, bIdx) => {
            translatedBlocks[origIdx].text = batchRes.translatedList[bIdx] || parsedOrigBlocks[origIdx].text;
        });

        completedCount += batchTargetIndices.length;
        const currentPct = Math.min(95, Math.round((completedCount / totalBlocks) * 100));

        // Auto-save batch progress directly to server after every batch
        const currentSrtString = toSrtString(translatedBlocks);
        await axios.post(`/api/admin/movies/${movieId}/srt-content`, {
            seasonNum,
            episodeNum,
            translatedSrtText: currentSrtString,
            isAi: true,
            aiModel: selectedModel,
            note: `وەرگێڕانی دەستەیی بە AI (${selectedModel})`
        }, { signal }).catch(err => console.warn('Incremental SRT save warning:', err));

        if (isTaskPaused(taskId) || signal?.aborted) {
            onProgress?.(`ڕاگیرا لە ${completedCount}/${totalBlocks} دێڕ (${currentPct}%)`, currentPct, 'paused');
            return {
                status: 'paused',
                metrics: parsedMetrics,
                analysisReport,
                kurdishSrt: currentSrtString,
                translatedCount: completedCount,
                totalCount: totalBlocks
            };
        }

        onProgress?.(`وەرگێڕانی ${completedCount}/${totalBlocks} دێڕ (${currentPct}%)...`, currentPct, 'running');
    }

    const finalKurdishSrt = toSrtString(translatedBlocks);

    // 4. Final Save to server
    onProgress?.('پاشەکەوتکردنی کۆتایی لە سێرڤەر...', 98, 'running');
    await axios.post(`/api/admin/movies/${movieId}/srt-content`, {
        seasonNum,
        episodeNum,
        translatedSrtText: finalKurdishSrt,
        isAi: true,
        aiModel: selectedModel,
        note: `وەرگێڕانی تەواو بە AI (${selectedModel})`
    }, { signal });

    onProgress?.('وەرگێڕان تەواو بوو! ✓', 100, 'done');

    return {
        status: 'done',
        metrics: parsedMetrics,
        analysisReport,
        kurdishSrt: finalKurdishSrt,
        translatedCount: totalBlocks,
        totalCount: totalBlocks
    };
}

// ─── DOWNLOAD HELPER FOR SRT & TXT FILES ───
export function triggerFileDownload(content: string, filename: string, mimeType: string = 'text/plain;charset=utf-8') {
    const blob = new Blob(['\ufeff' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
