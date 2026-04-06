import { useState, useRef } from 'react';
import { Upload, Languages, Download, Loader2, CheckCircle, AlertCircle, X, FileText } from 'lucide-react';
import './SrtTranslator.css';

const GEMINI_API_KEY = 'AIzaSyAFEZvgIZW3NXJSUJoyRWBHZ5ccF9of3Gk';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const BATCH_SIZE = 30;

const SEP = '|||';

interface SubBlock {
    id: string;
    time: string;
    text: string;
}

const parseSRT = (raw: string): SubBlock[] => {
    const clean = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = clean.split(/\n\s*\n/);
    return blocks.map(b => {
        const lines = b.trim().split('\n');
        if (lines.length < 3) return null;
        const id = lines[0];
        const time = lines[1];
        const text = lines.slice(2).join('\n');
        if (!id || !time.includes('-->')) return null;
        return { id, time, text };
    }).filter(Boolean) as SubBlock[];
};

const toSrtString = (blocks: SubBlock[]): string =>
    blocks.map(b => `${b.id}\n${b.time}\n${b.text}`).join('\n\n');

const translateBatch = async (texts: string[]): Promise<string[]> => {
    // Replace newlines inside subtitle blocks with <br> to keep them on one logical line
    const flatTexts = texts.map(t => t.replace(/\n/g, '<br>'));

    // Build a simple numbered list for Gemini
    const input = flatTexts.map((t, i) => `${i + 1}. ${t}`).join('\n');

    const prompt = `You are a professional subtitle translator. Translate the following numbered subtitle lines to Kurdish Sorani (کوردی سۆرانی).

Rules:
- Return ONLY the translations, numbered the same way
- Do NOT add explanations or notes
- Keep <br> as is (it means line break)
- Keep names, numbers, and technical terms if they don't have Kurdish equivalents
- Use natural spoken Kurdish Sorani dialect
- WARNING: You MUST use the Arabic alphabet for Kurdish texts. DO NOT use Latin letters for Kurdish!

Subtitles to translate:
${input}

Kurdish Sorani translations (same numbering):`;

    const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse numbered lines: "1. text", "2. text", etc.
    const result: string[] = texts.map(t => t); // default to original
    const linePattern = /^(\d+)\.\s+(.+)$/;

    // Split into lines and collect
    const outputLines = raw.split('\n');
    let i = 0;
    while (i < outputLines.length) {
        const line = outputLines[i].trim();
        const match = line.match(linePattern);
        if (match) {
            const idx = parseInt(match[1]) - 1;
            if (idx >= 0 && idx < texts.length) {
                // Collect continuation lines (lines that don't start with a number)
                let content = match[2];
                let j = i + 1;
                while (j < outputLines.length && !outputLines[j].trim().match(/^\d+\.\s+/)) {
                    const nextLine = outputLines[j].trim();
                    if (nextLine) content += '\n' + nextLine;
                    j++;
                }
                // Restore <br> back to actual newlines
                result[idx] = content.replace(/<br>/g, '\n').trim();
                i = j;
                continue;
            }
        }
        i++;
    }

    return result;
};



export default function SrtTranslator() {
    const [file, setFile] = useState<File | null>(null);
    const [blocks, setBlocks] = useState<SubBlock[]>([]);
    const [translated, setTranslated] = useState<SubBlock[]>([]);
    const [status, setStatus] = useState<'idle' | 'translating' | 'done' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [open, setOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFile = (f: File) => {
        setFile(f);
        setTranslated([]);
        setStatus('idle');
        setProgress(0);
        const reader = new FileReader();
        reader.onload = e => {
            const parsed = parseSRT(e.target?.result as string);
            setBlocks(parsed);
        };
        reader.readAsText(f, 'utf-8');
    };

    const translate = async () => {
        if (!blocks.length) return;
        setStatus('translating');
        setProgress(0);
        setTotal(blocks.length);
        setErrorMsg('');

        try {
            const result: SubBlock[] = [...blocks];
            const batches: SubBlock[][] = [];
            for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
                batches.push(blocks.slice(i, i + BATCH_SIZE));
            }

            let done = 0;
            for (const batch of batches) {
                const texts = batch.map(b => b.text);
                const translatedTexts = await translateBatch(texts);
                batch.forEach((b, i) => {
                    const idx = blocks.findIndex(x => x.id === b.id);
                    if (idx !== -1) result[idx] = { ...b, text: translatedTexts[i] };
                });
                done += batch.length;
                setProgress(done);
                // Added a 4-second delay between batches to avoid Error 429 (Rate Limit)
                if (done < blocks.length) await new Promise(r => setTimeout(r, 4000));
            }

            setTranslated(result);
            setStatus('done');
        } catch (e: any) {
            setErrorMsg(e.message || 'کێشەیەک ڕووی دا');
            setStatus('error');
        }
    };

    const download = () => {
        const content = toSrtString(translated);
        const blob = new Blob(['\ufeff' + content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file ? file.name.replace('.srt', '_kurdish.srt') : 'kurdish.srt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const reset = () => {
        setFile(null);
        setBlocks([]);
        setTranslated([]);
        setStatus('idle');
        setProgress(0);
        if (fileRef.current) fileRef.current.value = '';
    };

    const percent = total > 0 ? Math.round((progress / total) * 100) : 0;

    return (
        <div className="srt-translator-wrap">
            <button className="srt-toggle-btn" onClick={() => setOpen(!open)}>
                <Languages size={18} />
                وەرگێرانی SRT بۆ کوردی (Gemini AI)
                <span className={`srt-chevron ${open ? 'open' : ''}`}>▼</span>
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
                                <p className="srt-drop-sub">ئینگلیزی، عەرەبی یان هەر زمانێک → کوردی (سۆرانی)</p>
                            </div>
                        ) : (
                            <div className="srt-file-loaded">
                                <div className="srt-file-info">
                                    <FileText size={20} />
                                    <div>
                                        <div className="srt-file-name">{file.name}</div>
                                        <div className="srt-file-meta">{blocks.length} ستەیشن ئامادەیە بۆ وەرگێران</div>
                                    </div>
                                    <button className="srt-remove-btn" onClick={reset}><X size={16} /></button>
                                </div>

                                {/* Progress */}
                                {status === 'translating' && (
                                    <div className="srt-progress-wrap">
                                        <div className="srt-progress-bar-outer">
                                            <div className="srt-progress-bar-inner" style={{ width: `${percent}%` }} />
                                        </div>
                                        <div className="srt-progress-label">
                                            <Loader2 size={14} className="spinning" />
                                            {progress} / {total} ستەیشن وەرگێردرا ({percent}%)
                                        </div>
                                    </div>
                                )}

                                {status === 'done' && (
                                    <div className="srt-success">
                                        <CheckCircle size={18} />
                                        وەرگێران تەواو بوو! {translated.length} ستەیشن وەرگێردرا.
                                    </div>
                                )}

                                {status === 'error' && (
                                    <div className="srt-error">
                                        <AlertCircle size={18} />
                                        {errorMsg}
                                    </div>
                                )}

                                {/* Buttons */}
                                <div className="srt-actions">
                                    {status !== 'done' && (
                                        <button
                                            className="srt-translate-btn"
                                            onClick={translate}
                                            disabled={status === 'translating' || blocks.length === 0}
                                        >
                                            {status === 'translating'
                                                ? <><Loader2 size={16} className="spinning" /> وەرگێردەدرێت...</>
                                                : <><Languages size={16} /> وەرگێرانی بۆ کوردی</>
                                            }
                                        </button>
                                    )}
                                    {status === 'done' && (
                                        <>
                                            <button className="srt-download-btn" onClick={download}>
                                                <Download size={16} /> داونلۆد کردنی SRT کوردی
                                            </button>
                                            <button className="srt-again-btn" onClick={reset}>
                                                فایلی تر
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Preview last translated */}
                                {status === 'done' && translated.length > 0 && (
                                    <div className="srt-preview">
                                        <div className="srt-preview-title">پێشبینی (١٠ی یەکەم):</div>
                                        {translated.slice(0, 10).map(b => (
                                            <div key={b.id} className="srt-preview-row">
                                                <span className="srt-preview-id">{b.id}</span>
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
        </div>
    );
}
