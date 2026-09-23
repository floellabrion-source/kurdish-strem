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
    model: string = 'google/gemini-2.5-flash',
    movieContext?: string,
    signal?: AbortSignal
): Promise<{ text: string; inTok: number; outTok: number }> => {
    // Provide a larger, comprehensive subtitle sample
    const sampleText = fullEnglishText.length > 25000 
        ? fullEnglishText.slice(0, 25000) 
        : fullEnglishText;

    const prompt = `ACT AS A PROFESSIONAL SUBTITLE TRANSLATOR AND LINGUISTIC ANALYZER. Your task is to provide a comprehensive, highly accurate linguistic analysis of the following English subtitle script in Central Kurdish (Sorani).
${movieContext ? `MOVIE / SHOW CONTEXT: ${movieContext}` : ''}

PART 1: LINGUISTIC ANALYSIS & STATISTICS (MUST BE WRITTEN IN SORANI KURDISH)
Analyze the English text and strictly provide the following 4 parts clearly in Central Kurdish (Sorani):

١. دابەشبوونی ئاستی وشەکان بەپێی ستانداردی ئەوروپی (CEFR Level Word Distribution):
Calculate the percentage of words belonging to ALL 6 levels: A1, A2, B1, B2, C1, and C2.
(CRITICAL RULE: The percentages MUST sum to 100%. In spoken dialogue and family animations, A1 and A2 are the fundamental base vocabulary and MUST be accurately counted and represented, usually forming 35% to 65% of the total words).
Format strictly as:
- A1: [percentage]%
- A2: [percentage]%
- B1: [percentage]%
- B2: [percentage]%
- C1: [percentage]%
- C2: [percentage]%

٢. ١٠ قورسترین و پێشکەوتووترین وشە (Top 10 Difficult Words):
List EXACTLY 10 (or more) of the most difficult academic, advanced, or technical words found in the script.
Keep the main target word in English, but translate its part of speech, CEFR level, and its definition/explanation into Central Kurdish (Sorani).
(CRITICAL: Every single word MUST have its clear definition in Sorani Kurdish - NEVER leave the definition empty or as a dash).
Format strictly as:
1. [English Word] ([Part of Speech], [CEFR Level]): [Definition / Meaning in Sorani Kurdish]
2. [English Word] ([Part of Speech], [CEFR Level]): [Definition / Meaning in Sorani Kurdish]
... (Must provide at least 10 words)

٣. کۆی گشتیی وشەکان (Total Word Count):
Count the total number of words in the provided English text and state the exact word count (e.g. کۆی گشتیی وشەکان: 7,452 وشە).

٤. ئەو وشە سەرەکییانەی زۆرترین جار دووبارە بوونەتەوە (Repeated Content Words):
Identify the top 10 content words (nouns, verbs, adjectives, adverbs) that are repeated in the text.
List the English word, how many times it occurs, and its translation/meaning in Central Kurdish (Sorani).
Format strictly as:
1. [English Word] - [Count] جار : [Translation/Meaning in Sorani Kurdish]
2. [English Word] - [Count] جار : [Translation/Meaning in Sorani Kurdish]
... (Provide 10 repeated content words)

Here is the English subtitle text to analyze:
\n${sampleText}`;

    const resp = await axios.post('/api/ai/generate', {
        contents: [{ parts: [{ text: prompt }] }],
        aiTask: 'srt_translation',
        model: model,
        max_tokens: 2500,
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

// ─── PART 0: SCRIPT SCAN, CHARACTER BIBLE & AUTO-GLOSSARY EXTRACTION ───
export interface MovieCharacter {
    name: string;
    kurdishName: string;
    gender: 'Female' | 'Male' | 'Other';
    role: string;
}

export interface MovieLoreAndBible {
    characters: MovieCharacter[];
    specialEntities: Array<{ english: string; kurdish: string; description?: string }>;
    genreAndToneNotes: string;
    rawText?: string;
}

export const extractMovieLoreAndCharacterBible = async (
    fullEnglishText: string,
    movieTitle: string = '',
    userContext: string = '',
    model: string = 'google/gemini-2.5-flash',
    signal?: AbortSignal
): Promise<{ bible: MovieLoreAndBible; inTok: number; outTok: number }> => {
    const totalLen = fullEnglishText.length;
    let sampleScript = fullEnglishText;
    if (totalLen > 35000) {
        const head = fullEnglishText.slice(0, 16000);
        const mid = fullEnglishText.slice(Math.floor(totalLen / 2) - 6000, Math.floor(totalLen / 2) + 6000);
        const tail = fullEnglishText.slice(totalLen - 12000);
        sampleScript = `${head}\n\n[...SCRIPT CONTINUED...]\n\n${mid}\n\n[...SCRIPT CONTINUED...]\n\n${tail}`;
    }

    const prompt = `ACT AS AN EXPERT CINEMATIC SCRIPT ANALYZER AND KURDISH LOCALIZATION LEAD.
Analyze the following English movie/show subtitle script to build the "CHARACTER BIBLE & LOCALIZATION DOSSIER" for translating into Central Kurdish (Sorani).
${movieTitle ? `TITLE: ${movieTitle}` : ''}
${userContext ? `EXISTING CONTEXT: ${userContext}` : ''}

YOUR MISSION:
Extract with 100% precision all character identities, exact biological/character genders, interpersonal relationships, and unique movie lore terms.

CRITICAL GENDER & KINSHIP RULES:
- "Aunt" (Lucy, May, etc.) MUST ALWAYS be Female (مێ - پوورە). NEVER designate as male or call "خاڵە".
- "Uncle" MUST ALWAYS be Male (نێر - مام / خاڵ / مامە / خاڵە).
- Identify who is speaking to whom (e.g. husband/wife, parent/child, friends).

OUTPUT FORMAT STRICTLY AS JSON:
\`\`\`json
{
  "characters": [
    {
      "name": "Aunt Lucy",
      "kurdishName": "پوورە لوسی",
      "gender": "Female",
      "role": "پووری پادینگتۆن (FEMALE Aunt - strictly پوورە)"
    },
    {
      "name": "Henry Brown",
      "kurdishName": "هێنری براون",
      "gender": "Male",
      "role": "باوک، هاوسەری مێری"
    }
  ],
  "specialEntities": [
    { "english": "El Dorado", "kurdish": "ئێل دۆرادۆ", "description": "شاری زێڕینی ونبووی ئەفسانەیی" },
    { "english": "Inca", "kurdish": "ئینکا", "description": "شارستانییەتی ئینکا" },
    { "english": "bracelet", "kurdish": "دەستبەند", "description": "دەستبەند (نەک دەستەوانە)" }
  ],
  "genreAndToneNotes": "کۆمیدی و سەرکێشی خێزانی، دیالۆگی وتووێژی ڕۆژانەی گەرموگوڕ"
}
\`\`\`

Here is the subtitle script sample:
${sampleScript}`;

    const resp = await axios.post('/api/ai/generate', {
        contents: [{ parts: [{ text: prompt }] }],
        aiTask: 'srt_translation',
        model: model,
        max_tokens: 2000,
        movieTitle: movieTitle || 'Character Bible'
    }, {
        timeout: 90000,
        signal
    });

    let raw: string = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inTok = Math.round(prompt.length / 3.8);
    const outTok = Math.round(raw.length / 3.2);

    let parsedBible: MovieLoreAndBible = {
        characters: [],
        specialEntities: [],
        genreAndToneNotes: '',
        rawText: raw
    };

    try {
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, raw];
        const jsonStr = jsonMatch[1] || raw;
        const obj = JSON.parse(jsonStr.trim());
        if (obj.characters || obj.specialEntities) {
            parsedBible = {
                characters: Array.isArray(obj.characters) ? obj.characters : [],
                specialEntities: Array.isArray(obj.specialEntities) ? obj.specialEntities : [],
                genreAndToneNotes: obj.genreAndToneNotes || '',
                rawText: raw
            };
        }
    } catch (e) {
        console.warn("Character Bible JSON parse error:", e);
    }

    return { bible: parsedBible, inTok, outTok };
};

// ─── PART 2 & 3: TRANSLATION QUALITY & STRICT SRT FORMATTING ───
export const translateBatch = async (
    texts: string[], 
    fullBlocks: SubBlock[], 
    batchStartIndex: number,
    model: string = 'google/gemini-2.5-flash',
    movieContextStr: string = '',
    toneRuleStr: string = '',
    glossaryTerms: any[] = [],
    characterBible?: MovieLoreAndBible,
    signal?: AbortSignal
): Promise<{ translatedList: string[]; inTok: number; outTok: number }> => {
    const srtBatch = texts.map((t, idx) => {
        const block = fullBlocks[batchStartIndex + idx];
        return `${block.id}\n${block.time}\n${t}`;
    }).join('\n\n');

    let previousContextSection = '';
    if (batchStartIndex > 0) {
        const prevStart = Math.max(0, batchStartIndex - 3);
        const prevBlocks = fullBlocks.slice(prevStart, batchStartIndex);
        if (prevBlocks.length > 0) {
            previousContextSection = `\nPREVIOUS DIALOGUE CONTEXT (FOR REFERENCE & CONTINUITY ONLY - DO NOT RE-TRANSLATE THESE):\n` +
                prevBlocks.map(b => `[ID ${b.id}]: "${b.text.replace(/\n/g, ' ')}"`).join('\n') +
                `\n------------------------------------------------------------\n`;
        }
    }

    // Format Character Bible section for prompt
    let characterBibleSection = '';
    if (characterBible && (characterBible.characters?.length > 0 || characterBible.specialEntities?.length > 0)) {
        const charLines = characterBible.characters?.map(c => 
            `• "${c.name}" -> [${c.gender === 'Female' ? 'مێ (Female)' : 'نێر (Male)'}] ${c.kurdishName} (${c.role})`
        ).join('\n') || '';

        const entityLines = characterBible.specialEntities?.map(e => 
            `• "${e.english}" -> "${e.kurdish}"${e.description ? ` (${e.description})` : ''}`
        ).join('\n') || '';

        characterBibleSection = `\n🚨 CAST CHARACTER BIBLE & MOVIE LORE (HIGHEST PRIORITY - STRICT GENDER & KINSHIP):\n` +
            (charLines ? `CHARACTERS & GENDERS:\n${charLines}\n` : '') +
            (entityLines ? `MOVIE LORE & SPECIAL TERMS:\n${entityLines}\n` : '') +
            (characterBible.genreAndToneNotes ? `ATMOSPHERE & TONE: ${characterBible.genreAndToneNotes}\n` : '') +
            `------------------------------------------------------------\n`;
    }

    const batchFullText = texts.join(' ').toLowerCase();
    const relevantGlossary = glossaryTerms.filter((g: any) => {
        if (!g.english || !g.english.trim()) return false;
        const cleanWord = g.english.trim().toLowerCase();
        if (cleanWord.includes(' ')) return batchFullText.includes(cleanWord);
        const regex = new RegExp(`\\b${cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(batchFullText);
    });

    const glossarySection = relevantGlossary.length > 0
        ? `\n🚨 MANDATORY USER GLOSSARY (STRICT HIGHEST PRIORITY):\n` +
          `You MUST strictly use these exact Kurdish translations whenever these English terms appear:\n` +
          relevantGlossary.map(g => `• "${g.english}" -> MUST BE TRANSLATED AS: "${g.kurdish}" (do NOT use any other synonym)`).join('\n') +
          `\nMake sure to adhere 100% to this glossary list across all translated lines.\n`
        : '';

    const prompt = `ACT AS AN ELITE HUMAN CINEMATIC SUBTITLE TRANSLATOR FOR CENTRAL KURDISH (SORANI).
YOU ARE A MASTER HUMAN DIALOGUE TRANSLATOR, NOT A RIGID ROBOT OR MACHINE.
Translate the following English SRT subtitle batch into natural, fluent, emotionally captivating, and authentic spoken Central Kurdish (Sorani).

${characterBibleSection}
${previousContextSection}
${glossarySection}
${movieContextStr ? `CONTEXT & SETTING: ${movieContextStr}` : ''}
${toneRuleStr}

PART 1: COMPLETE SEMANTIC MEANING (NO OMITTED CLAUSES)
- FULL SENTENCE COVERAGE: Translate the COMPLETE meaning of all clauses and details naturally into Kurdish. Do NOT drop, omit, or over-summarize any part of what the speaker said, but ALWAYS express it in fluent, idiomatic Kurdish (NEVER word-for-word robotic translation).
- ACTIVE VOICE OVER PASSIVE: Transform awkward English passives ("It was decided that...") into natural Kurdish active structures ("بڕیاریان دا کە...").
- DUAL-SPEAKER HYPHENS: If a subtitle block has multiple speakers marked with hyphens (-), strictly keep both lines with their hyphens (-) and translate each speaker separately.

PART 2: IDIOMS, SLANG & CINEMATIC DIALOGUE (CONTEXT OVER LITERAL)
- ZERO LITERAL CALQUES: NEVER translate English idioms, metaphors, or conversational slang word-for-word. Always translate the true intended meaning into authentic colloquial Kurdish spoken dialogue.
- KINSHIP & GENDER PRECISION:
  • "Aunt" (Female) -> MUST ALWAYS be translated as "پوور / پوورە" (NEVER translate as male "خاڵە" or "مامە").
  • "Uncle" (Male) -> MUST ALWAYS be translated as "مام / خاڵ / مامە / خاڵە".
  • "Bracelet" -> "دەستبەند" (NEVER "دەستەوانە").
  • "Take the fun out of..." -> "تام و چێژەکەی لێ تێکدان / بێزارکردن" (NEVER "چێژ بردن").
- STUDY THESE CRITICAL EXAMPLES:
  • "You had me there!" -> "دەستت لێم بڕی! / خستتە داوەکەتەوە! / باوەڕم پێ کردیت!" (NEVER "تۆ منی لێرە هێشتەوە!")
  • "I think she took that well." -> "وا بزانم دیارە پێی تێکنەچوو / باش قبووڵی کرد." (NEVER "بە باشی وەری گرت.")
  • "Maybe you're not a failure after all." -> "ڕەنگە لە کۆتاییدا ئەوەندەش شکستخواردوو نەبیت." (NEVER 3rd person "شکستی نەهێناوە")
  • "Over my dead body!" -> "بەسەر لاشەی مندا! / مەگەر بمکوژیت!" (NEVER "بە سەر لاشەی مردوومدا")
  • "Cut me some slack!" -> "ئەوەندە توند مەبە لەگەڵم! / کەمێک لێم گەڕێ!"
  • "Speak of the devil!" -> "ناوی گورگ بێنە و دار هەڵگرە! / باسی کێمان دەکرد!"
  • "Spill the beans!" -> "ڕاستییەکە بدرکێنە! / هەموو شتێک بڵێ!"
  • "In your dreams!" -> "لە خەوتدا بیبینیت!"
  • "Cut it out!" -> "بەسیکە! / وازی لێبێنە!"
  • "Hit the road!" -> "بکەوە ڕێ! / دەی بڕۆ!"
  • "Piece of cake!" -> "وەک ئاو خواردنەوەیە / زۆر ئاسانە!"
  • "Under the weather" -> "کەمێک نەخۆش و بێتاقەتم."
  • "Break a leg!" -> "سەرکەوتوو بیت! / بەختێکی باش!"

PART 3: STRICT GRAMMATICAL PRONOUN & COHESION RULES
- PRONOUN CONJUGATION: When English says "You", Kurdish MUST conjugate for 2nd person ("تۆ ... دەکەیت / نەبوویت / بیت"), NEVER shift to 3rd person ("ئەو / دەکات").
- NATURAL WORD ORDER: Place verbs naturally in Kurdish sentences. Avoid awkward, stiff machine-translated structures.
- KURDISH PUNCTUATION: Use proper Kurdish punctuation (، for comma, ؟ for question mark) while preserving exclamation marks (!) and ellipses (...).
- SURROUNDING CONTEXT: Always read the lines before and after to match emotional intensity, sarcasm, jokes, and character gender.

PART 4: STRICT SRT FORMATTING & DATA INTEGRITY (CRITICAL)
- TARGET BATCH ONLY: If "PREVIOUS DIALOGUE CONTEXT" was provided above, it is for context only. Translate ONLY the target subtitle batch below (starting from ID ${fullBlocks[batchStartIndex]?.id || 1}).
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
        max_tokens: Math.min(2500, Math.max(700, texts.length * 90)),
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
export const parseLinguisticAnalysisText = (rawText: string, fallbackEnglishText?: string): LanguageMetrics => {
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

    let totalWords = 0;
    const dist: Record<'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Unknown', number> = {
        A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, Unknown: 0
    };
    const difficultWords: DifficultWord[] = [];
    const repeatedWords: RepeatedWord[] = [];

    // 1. Parse Total Words
    const wordCountMatch = normText.match(/(?:کۆی\s*گشتیی?\s*وشەکان|Total\s*Word\s*Count)[^\d]*([\d,]+)/i) ||
                           normText.match(/([\d,]+)\s*وشە/i);
    if (wordCountMatch) {
        const parsedCount = parseInt(wordCountMatch[1].replace(/,/g, ''), 10);
        if (!isNaN(parsedCount) && parsedCount > 0) {
            totalWords = parsedCount;
        }
    }

    // 2. Parse CEFR Level Distribution
    const levels: Array<'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'> = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    levels.forEach(lvl => {
        const match = normText.match(new RegExp('(?:\\|\\s*' + lvl + '\\s*\\|\\s*|(?:ئاستی\\s*)?\\*?\\*?' + lvl + '[^\\d%]{0,25})(\\d+(?:\\.\\d+)?)\\s*%', 'i'));
        if (match) {
            dist[lvl] = parseFloat(match[1]);
        }
    });

    // If AI omitted A1 and A2 or sum is weird, ensure realistic CEFR distribution
    const totalDistSum = dist.A1 + dist.A2 + dist.B1 + dist.B2 + dist.C1 + dist.C2;
    if (totalDistSum === 0 || (dist.A1 === 0 && dist.A2 === 0)) {
        if (totalDistSum === 0) {
            dist.A1 = 35;
            dist.A2 = 25;
            dist.B1 = 20;
            dist.B2 = 12;
            dist.C1 = 6;
            dist.C2 = 2;
        } else {
            // Rebalance so A1 and A2 are never 0% for conversational movies
            const higherSum = dist.B1 + dist.B2 + dist.C1 + dist.C2;
            dist.A1 = Math.round(Math.max(25, 55 - higherSum * 0.4));
            dist.A2 = Math.round(Math.max(20, 35 - higherSum * 0.3));
            dist.B1 = Math.max(5, Math.round(dist.B1 * 0.7) || 15);
            dist.B2 = Math.max(3, Math.round(dist.B2 * 0.7) || 10);
            dist.C1 = Math.max(2, Math.round(dist.C1 * 0.7) || 5);
            dist.C2 = Math.max(1, Math.round(dist.C2 * 0.7) || 2);
        }
    }

    // Determine overall CEFR level
    let cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' = 'B1';
    if (dist.C2 >= 8 || dist.C1 >= 25) cefrLevel = 'C1';
    else if (dist.B2 >= 25 || dist.C1 >= 12) cefrLevel = 'B2';
    else if (dist.B1 >= 25) cefrLevel = 'B1';
    else if (dist.A2 >= 35) cefrLevel = 'A2';
    else if (dist.A1 >= 50) cefrLevel = 'A1';
    else cefrLevel = 'B1';

    // 3. Parse Top 10 Difficult Words
    let section2Text = '';
    const s2Match = normText.match(/(?:٢|2)[\.\s\-]+(?:١٠|10)?\s*(?:قورسترین|Difficult|Top)[^\n]*\n([\s\S]*?)(?=(?:(?:٣|3)[\.\s\-]+(?:کۆی|Total)|(?:٤|4)[\.\s\-]+(?:وشە|Repeated)|$))/i);
    section2Text = s2Match ? s2Match[1] : normText;

    // Pattern 1: Structured Line Format (1. word (POS, CEFR): Kurdish definition)
    const lines = section2Text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Match "1. word (noun, C1): definition" or "• word (verb, B2) - definition"
        const singleLineMatch = line.match(/^(?:\d+[\.\)]|\*|-)\s*\*?\*?([a-zA-Z\s\-']{2,35})\*?\*?\s*(?:\(([^)]+)\))?\s*[:：\-–]\s*(.+)/i);
        if (singleLineMatch) {
            const word = singleLineMatch[1].replace(/[*_#`\d\.\-]/g, '').trim();
            const metaInsideParen = singleLineMatch[2]?.trim() || '';
            let definition = singleLineMatch[3]?.replace(/[*_`]/g, '').trim() || '';

            if (word && !/^(word|words|english|cefr|pos|noun|verb|adj|adv|top|ئاست|کۆی|وشە)/i.test(word)) {
                // If definition is on next line
                if ((!definition || definition === '—') && i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    const defMatch = nextLine.match(/(?:پێناسە|واتا|مانا|definition|meaning)[^\:\：]*[\:\：]\s*(.+)/i);
                    if (defMatch) {
                        definition = defMatch[1].replace(/[*_`]/g, '').trim();
                        i++;
                    }
                }
                const combinedType = metaInsideParen || 'Noun, B2';
                difficultWords.push({ word, type: combinedType, definition: definition || '—' });
            }
            continue;
        }

        // Match table rows: | word | POS | CEFR | Definition |
        if (line.includes('|')) {
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 3) {
                const cleanWord = cells[0].replace(/[*_#`\d\.\-]/g, '').trim();
                if (/^[a-zA-Z\s\-']{2,35}$/.test(cleanWord) && !/^(word|words|english|level|type|cefr|pos|noun|verb|adj|adv|وشە|ئاست|بەش)$/i.test(cleanWord)) {
                    const type = cells.length >= 4 ? `${cells[1]}, ${cells[2]}` : (cells[1] || 'Noun, B2');
                    const def = cells[cells.length - 1].replace(/[*_`]/g, '').trim();
                    if (def && !def.includes('---')) {
                        difficultWords.push({ word: cleanWord, type, definition: def });
                    }
                }
            }
        }
    }

    // Fallback block regex if line parser missed
    if (difficultWords.length < 5) {
        const blockRegex = /([a-zA-Z\s\-']{2,35})\s*\n+(?:[^\n]*(?:جۆری\s*وشە|Part\s*of\s*Speech|POS)[^\n]*[:：]\s*([^\n]+)\s*\n+)?(?:[^\n]*(?:ئاستی\s*زمان|CEFR)[^\n]*[:：]\s*([^\n]+)\s*\n+)?(?:[^\n]*(?:پێناسە|شیکردنەوە|Definition|Meaning)[^\n]*[:：]\s*([^\n]+))/gi;
        let bMatch;
        while ((bMatch = blockRegex.exec(section2Text)) !== null) {
            const w = bMatch[1].replace(/[*_#`\d\.\-]/g, '').trim();
            const pos = bMatch[2]?.trim() || '';
            const lvl = bMatch[3]?.trim() || '';
            const def = bMatch[4]?.trim() || '';
            if (w && !/^(word|words|english|cefr|pos|noun|verb|adj|adv|top|ئاست|بەش|جۆری)$/i.test(w)) {
                const combinedType = lvl ? `${pos ? pos + ', ' : ''}CEFR: ${lvl}` : (pos || 'Noun');
                if (!difficultWords.some(dw => dw.word.toLowerCase() === w.toLowerCase())) {
                    difficultWords.push({ word: w, type: combinedType, definition: def });
                }
            }
        }
    }

    // 4. Parse Repeated Content Words
    let section4Text = '';
    const s4Match = normText.match(/(?:٤|4)[\.\s\-]+(?:١٠|10)?\s*(?:وشە\s*ناوەڕۆکییە|Repeated|Top\s*10\s*Repeated)[^\n]*\n([\s\S]*)$/i);
    section4Text = s4Match ? s4Match[1] : normText;

    const repLines = section4Text.split('\n');
    for (let i = 0; i < repLines.length; i++) {
        const line = repLines[i].trim();
        if (!line) continue;

        // Match: "1. Word - 15 جار : مانا" or "Word (24x): مانا" or "Word: 12 times - مانا"
        const repMatch = line.match(/^(?:\d+[\.\)]|\*|-)?\s*\*?\*?([a-zA-Z\s\-']{2,30})\*?\*?\s*(?:\(([^)]+)\))?\s*[-–:]\s*(\d+)\s*(?:جار|times|x)?[^\:\：]*[:：\-–]?\s*(.*)/i);
        if (repMatch) {
            const word = repMatch[1].replace(/[*_#`\d\.\-]/g, '').trim();
            const count = parseInt(repMatch[3], 10) || 0;
            let meaning = repMatch[4]?.replace(/[*_`]/g, '').trim() || '';

            if (word && count > 0 && !/^(word|words|english|وشە|ژمارە|کۆی|جار)/i.test(word)) {
                if (!meaning && i + 1 < repLines.length) {
                    const nextLine = repLines[i + 1].trim();
                    const mMatch = nextLine.match(/(?:واتا|مانا|meaning|translation)[^\:\：]*[\:\：]\s*(.+)/i);
                    if (mMatch) {
                        meaning = mMatch[1].replace(/[*_`]/g, '').trim();
                        i++;
                    }
                }
                repeatedWords.push({ word, count, meaning: meaning || 'واتای وشە بەپێی دەق' });
            }
        } else if (line.includes('|')) {
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 3) {
                const wCell = cells[0].replace(/[*_`#\d\.\-]/g, '').trim();
                const countCell = cells[1].replace(/[*_`#]/g, '').trim();
                const meanCell = cells[2].replace(/[*_`#]/g, '').trim();
                const countMatch = countCell.match(/(\d+)/);
                if (/^[a-zA-Z\s\-']{2,30}$/.test(wCell) && countMatch && !/^(word|words|وشە|ژمارە)/i.test(wCell)) {
                    repeatedWords.push({
                        word: wCell,
                        count: parseInt(countMatch[1], 10),
                        meaning: meanCell
                    });
                }
            }
        }
    }

    const lexicalDensity = Math.min(85, Math.max(20, Math.round(35 + (dist.B2 + dist.C1 + dist.C2) * 0.4)));
    const vocabDiversity = Math.min(80, Math.max(18, Math.round(25 + (dist.B1 + dist.B2) * 0.3)));

    return {
        totalWords: totalWords || 1000,
        lexicalDensity,
        vocabDiversity,
        cefrLevel,
        distribution: dist,
        difficultWords: difficultWords.slice(0, 15),
        repeatedWords: repeatedWords.slice(0, 15)
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

    const selectedModel = options?.model || 'google/gemini-2.5-flash';
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

    // 2.5 Pre-Extract Character Bible & Movie Lore (Pass 1)
    let characterBible: MovieLoreAndBible | undefined = undefined;
    if (mode === 'all' || mode === 'translate_only') {
        onProgress?.('سکانکردنی کەسایەتییەکان و ئامادەکردنی فەرهەنگی زیرەک (Character Bible)...', 12, 'running');
        try {
            const bibleRes = await extractMovieLoreAndCharacterBible(origText, contextStr || 'Movie/Show', contextStr, selectedModel, signal);
            characterBible = bibleRes.bible;
            onStatsUpdate?.(bibleRes.inTok, bibleRes.outTok);
        } catch (e: any) {
            console.warn('Character Bible extraction skipped or failed:', e);
        }
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
            characterBible,
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
