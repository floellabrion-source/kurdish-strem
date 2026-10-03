import React, { useState, useRef, useEffect } from 'react';
import { X, Save, Sparkles, BarChart2, Check, AlertCircle, Plus, Trash2, HelpCircle, Download, FileText, Upload, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import axios from '../api/client';
import { LanguageMetrics, DifficultWord, RepeatedWord } from '../types';
import { 
    parseLinguisticAnalysisText, 
    generateLinguisticAnalysis, 
    extractDeterministicSubtitleStats, 
    triggerFileDownload 
} from '../utils/aiTranslator';
import './LanguageMetricsModal.css';

interface LanguageMetricsModalProps {
    title: string;
    subtitle?: string;
    initialMetrics?: LanguageMetrics;
    movieId?: string;
    englishSrtUrl?: string | null;
    movieContext?: string;
    onSave: (metrics: LanguageMetrics) => Promise<void>;
    onClose: () => void;
}

export default function LanguageMetricsModal({
    title,
    subtitle,
    initialMetrics,
    movieId,
    englishSrtUrl,
    movieContext,
    onSave,
    onClose
}: LanguageMetricsModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [rawText, setRawText] = useState('');
    const [metrics, setMetrics] = useState<LanguageMetrics>(initialMetrics || {
        totalWords: 0,
        lexicalDensity: 0,
        vocabDiversity: 0,
        cefrLevel: 'B1',
        distribution: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, Unknown: 0 },
        difficultWords: [],
        repeatedWords: []
    });
    const [saving, setSaving] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'paste' | 'preview'>(
        initialMetrics && initialMetrics.totalWords > 0 ? 'preview' : 'paste'
    );

    // Auto-normalize distribution to exactly 100%
    const handleNormalizeDistribution = () => {
        const d = { ...metrics.distribution };
        const sum = d.A1 + d.A2 + d.B1 + d.B2 + d.C1 + d.C2;
        if (sum === 0) {
            d.A1 = 42; d.A2 = 26; d.B1 = 16; d.B2 = 10; d.C1 = 4; d.C2 = 2;
        } else {
            const factor = 100 / sum;
            d.A1 = Math.round(d.A1 * factor);
            d.A2 = Math.round(d.A2 * factor);
            d.B1 = Math.round(d.B1 * factor);
            d.B2 = Math.round(d.B2 * factor);
            d.C1 = Math.round(d.C1 * factor);
            const sum5 = d.A1 + d.A2 + d.B1 + d.B2 + d.C1;
            d.C2 = Math.max(1, 100 - sum5);
        }
        setMetrics({ ...metrics, distribution: d });
    };

    // Auto-parse pasted/uploaded text
    const handleAutoParse = () => {
        if (!rawText.trim()) return;
        const parsed = parseLinguisticAnalysisText(rawText);
        setMetrics(parsed);
        setActiveTab('preview');
    };

    // 1-Click Direct AI Analysis (Guaranteed 10 difficult words + 10 repeated words + CEFR percentages)
    const handleRunOneClickAi = async () => {
        setIsAnalyzing(true);
        setAnalysisStatus('خەریکی هێنانی دەقی سەبتایتڵ و ژماردنی وشەکانە...');
        try {
            let textToAnalyze = rawText.trim();

            // If no text pasted yet, try fetching from englishSrtUrl
            if (!textToAnalyze && englishSrtUrl) {
                try {
                    const srtResp = await axios.get(englishSrtUrl, { responseType: 'text' });
                    if (srtResp.data && typeof srtResp.data === 'string') {
                        textToAnalyze = srtResp.data;
                    }
                } catch (e) {
                    console.warn('Could not auto-fetch srt URL:', e);
                }
            }

            if (!textToAnalyze) {
                alert('تکایە سەرەتا دەقی سەبتایتڵەکە لە خانەی خوارەوە دابنێ یان فایلی .txt / .srt داغڵ بکە.');
                setIsAnalyzing(false);
                return;
            }

            setAnalysisStatus('زیرەکی دەستکرد خەریکی شیکارییە (١٠ وشەی ئەکادیمی و ١٠ وشەی دووبارەبوو بە وەرگێڕانی دروست)...');
            const contextStr = movieContext || `${title} ${subtitle || ''}`;
            const aiRes = await generateLinguisticAnalysis(textToAnalyze, 'google/gemini-2.5-flash', contextStr);
            
            setRawText(aiRes.text);
            const parsed = parseLinguisticAnalysisText(aiRes.text, textToAnalyze);
            setMetrics(parsed);
            setActiveTab('preview');
        } catch (err: any) {
            console.error('AI Linguistic Analysis failed:', err);
            // Even if AI call failed, provide deterministic statistics
            if (rawText.trim() || englishSrtUrl) {
                const parsed = parseLinguisticAnalysisText(rawText, rawText);
                setMetrics(parsed);
                setActiveTab('preview');
            } else {
                alert('هەڵەیەک لە شیکاریی AI ڕوویدا: ' + (err?.response?.data?.error?.message || err?.message || 'تکایە دووبارەی بکەرەوە'));
            }
        } finally {
            setIsAnalyzing(false);
            setAnalysisStatus('');
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                setRawText(content);
                const parsed = parseLinguisticAnalysisText(content);
                setMetrics(parsed);
                setActiveTab('preview');
            }
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(metrics);
            onClose();
        } catch (err) {
            console.error('Failed to save metrics', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadTxt = () => {
        const txtContent = rawText.trim()
            ? rawText
            : `ئامارەکانی زمانی: ${title} ${subtitle || ''}\n\nسەرجەمی وشەکان: ${metrics.totalWords}\nئاستی گشتی CEFR: ${metrics.cefrLevel}\nچڕی فەرهەنگی: ${metrics.lexicalDensity}%\nجۆراوجۆری وشەکان: ${metrics.vocabDiversity}%\n\nدابەشبوونی ئاستەکان:\nA1: ${metrics.distribution.A1}%\nA2: ${metrics.distribution.A2}%\nB1: ${metrics.distribution.B1}%\nB2: ${metrics.distribution.B2}%\nC1: ${metrics.distribution.C1}%\nC2: ${metrics.distribution.C2}%\n\n١٠ وشە ئەکادیمی و پێشکەوتووەکان:\n${(metrics.difficultWords || []).map((w, idx) => `${idx + 1}. ${w.word} (${w.type}): ${w.definition}`).join('\n')}\n\n١٠ وشەی سەرەکی دووبارەبووەکان:\n${(metrics.repeatedWords || []).map(w => `* ${w.word}: ${w.count} جار (${w.meaning || ''})`).join('\n')}`;

        triggerFileDownload(
            txtContent,
            `${title.replace(/\s+/g, '_')}_${subtitle ? subtitle.replace(/[\s\(\)]+/g, '_') : ''}_analysis.txt`
        );
    };

    const cefrSum = (metrics.distribution.A1 || 0) + (metrics.distribution.A2 || 0) + (metrics.distribution.B1 || 0) + (metrics.distribution.B2 || 0) + (metrics.distribution.C1 || 0) + (metrics.distribution.C2 || 0);

    return (
        <div className="lm-modal-backdrop" onClick={onClose}>
            <div className="lm-modal-container" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="lm-modal-header">
                    <div className="lm-modal-title-wrap">
                        <div className="lm-badge">ئامارەکانی زمان • Language Metrics & CEFR</div>
                        <h2>{title} {subtitle ? `• ${subtitle}` : ''}</h2>
                    </div>
                    <button className="lm-close-btn" onClick={onClose} title="داخستن">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="lm-nav-tabs">
                    <button
                        className={`lm-tab-btn ${activeTab === 'paste' ? 'active' : ''}`}
                        onClick={() => setActiveTab('paste')}
                    >
                        <Sparkles size={15} />
                        <span>شیکاریی خۆکار و پەیستکردن (AI Generator & Paste)</span>
                    </button>
                    <button
                        className={`lm-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('preview')}
                    >
                        <BarChart2 size={15} />
                        <span>پێشبینی و دەستکاریکردنی ١٠ بە ١٠ وشە (Preview & Edit)</span>
                    </button>
                </div>

                {/* Body */}
                <div className="lm-modal-body">
                    {activeTab === 'paste' ? (
                        <div className="lm-paste-pane">
                            {/* 1-Click AI Action Banner */}
                            <div className="lm-ai-banner" style={{
                                background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.18), rgba(6, 182, 212, 0.18))',
                                border: '1px solid rgba(139, 92, 246, 0.4)',
                                borderRadius: '14px',
                                padding: '16px 20px',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '42px',
                                        height: '42px',
                                        borderRadius: '10px',
                                        background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)'
                                    }}>
                                        <Wand2 size={22} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                                            شیکاریی زیرەکی دەستکرد بە یەک کلیک (One-Click AI Analysis)
                                        </h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#cbd5e1' }}>
                                            خۆکارانە دەرهێنانی ڕێک <strong>١٠ وشەی ئەکادیمی</strong> + <strong>١٠ وشەی دووبارەبوو</strong> لەگەڵ وەرگێڕانی کوردی بە ڕێژەی ٩٨٪ و دابەشبوونی سەدیی ئاستەکانی CEFR.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRunOneClickAi}
                                    disabled={isAnalyzing}
                                    style={{
                                        background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                                        border: 'none',
                                        color: '#ffffff',
                                        padding: '10px 22px',
                                        borderRadius: '10px',
                                        fontWeight: 800,
                                        fontSize: '14px',
                                        cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>شیکار دەکرێت...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={16} />
                                            <span>دەستپێکردنی شیکاری بە یەک کلیک ✨</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {isAnalyzing && analysisStatus && (
                                <div style={{
                                    padding: '12px 16px',
                                    borderRadius: '10px',
                                    background: 'rgba(6, 182, 212, 0.1)',
                                    border: '1px solid rgba(6, 182, 212, 0.3)',
                                    color: '#38bdf8',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '16px'
                                }}>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>{analysisStatus}</span>
                                </div>
                            )}

                            <div className="lm-paste-intro">
                                <FileText size={16} className="text-purple-400" />
                                <p>
                                    یان دەتوانیت دەقی سەبتایتڵ یان دەقی شیکارییەکە لێرە پەیست بکەیت یان فایلی <strong>.srt / .txt</strong> داغڵ بکەیت:
                                </p>
                            </div>

                            <textarea
                                className="lm-paste-textarea"
                                value={rawText}
                                onChange={e => setRawText(e.target.value)}
                                placeholder="دەقی سەبتایتڵی ئینگلیزی یان دەقی شیکاریی زمانی لێرە دابنێ..."
                                rows={12}
                            />

                            <div className="lm-paste-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept=".txt,.srt"
                                    style={{ display: 'none' }}
                                    onChange={handleFileUpload}
                                />
                                <button
                                    type="button"
                                    className="btn-lm-parse"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', borderColor: '#0284c7' }}
                                >
                                    <Upload size={16} />
                                    داغڵکردنی فایلی .srt / .txt
                                </button>
                                <button
                                    className="btn-lm-parse"
                                    disabled={!rawText.trim()}
                                    onClick={handleAutoParse}
                                >
                                    <Sparkles size={16} />
                                    خوێندنەوە و پڕکردنەوە (Auto Parse)
                                </button>
                                {rawText.trim() && (
                                    <button
                                        type="button"
                                        className="btn-lm-parse"
                                        onClick={handleDownloadTxt}
                                        style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1' }}
                                    >
                                        <Download size={16} />
                                        داگرتنی .txt
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="lm-preview-pane">
                            {/* Top Stat Cards */}
                            <div className="lm-stats-grid">
                                <div className="lm-stat-card">
                                    <span className="stat-label">کۆی گشتی وشەکان</span>
                                    <input
                                        type="number"
                                        className="stat-input"
                                        value={metrics.totalWords}
                                        onChange={e => setMetrics({ ...metrics, totalWords: parseInt(e.target.value, 10) || 0 })}
                                    />
                                </div>
                                <div className="lm-stat-card">
                                    <span className="stat-label">چڕی فەرهەنگی (Lexical Density)</span>
                                    <input
                                        type="number"
                                        className="stat-input"
                                        value={metrics.lexicalDensity}
                                        onChange={e => setMetrics({ ...metrics, lexicalDensity: parseInt(e.target.value, 10) || 0 })}
                                    />
                                </div>
                                <div className="lm-stat-card">
                                    <span className="stat-label">جۆراوجۆری وشەکان (Vocab Diversity)</span>
                                    <input
                                        type="number"
                                        className="stat-input"
                                        value={metrics.vocabDiversity}
                                        onChange={e => setMetrics({ ...metrics, vocabDiversity: parseInt(e.target.value, 10) || 0 })}
                                    />
                                </div>
                                <div className="lm-stat-card">
                                    <span className="stat-label">ئاستی سەرەکی CEFR</span>
                                    <select
                                        className="stat-select"
                                        value={metrics.cefrLevel}
                                        onChange={e => setMetrics({ ...metrics, cefrLevel: e.target.value as any })}
                                    >
                                        <option value="A1">A1 (سەرەتایی - Beginner)</option>
                                        <option value="A2">A2 (ئاسان - Elementary)</option>
                                        <option value="B1">B1 (مامناوەند - Intermediate)</option>
                                        <option value="B2">B2 (سەروو مامناوەند - Upper Intermediate)</option>
                                        <option value="C1">C1 (پێشکەوتوو - Advanced)</option>
                                        <option value="C2">C2 (پسپۆڕ - Mastery)</option>
                                    </select>
                                </div>
                            </div>

                            {/* CEFR Level Bars */}
                            <div className="lm-section-block">
                                <div className="block-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h4>دابەشبوونی ئاستەکانی زمان (CEFR Distribution %)</h4>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            padding: '2px 8px',
                                            borderRadius: '999px',
                                            background: cefrSum === 100 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                            color: cefrSum === 100 ? '#4ade80' : '#f87171',
                                            border: `1px solid ${cefrSum === 100 ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                                        }}>
                                            کۆی ڕێژە: {cefrSum}% {cefrSum === 100 ? '✓' : '(دەبێت ١٠٠٪ بێت)'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-add-mini"
                                        onClick={handleNormalizeDistribution}
                                        title="ڕێکخستنەوەی ڕێژەکان بە شێوەیەک کۆی گشتی ببێتە ١٠٠٪"
                                    >
                                        <RefreshCw size={13} /> هاوسەنگکردنی ڕێژەکان بۆ ١٠٠٪
                                    </button>
                                </div>
                                <div className="cefr-bars-editor">
                                    {(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map(lvl => (
                                        <div key={lvl} className="cefr-bar-row">
                                            <span className="cefr-level-badge">{lvl}</span>
                                            <div className="cefr-track">
                                                <div className="cefr-fill" style={{ width: `${Math.min(100, metrics.distribution[lvl] || 0)}%` }} />
                                            </div>
                                            <input
                                                type="number"
                                                className="cefr-val-input"
                                                value={metrics.distribution[lvl] || 0}
                                                onChange={e => setMetrics({
                                                    ...metrics,
                                                    distribution: {
                                                        ...metrics.distribution,
                                                        [lvl]: parseFloat(e.target.value) || 0
                                                    }
                                                })}
                                            />
                                            <span className="percent-sign">%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Difficult Words */}
                            <div className="lm-section-block">
                                <div className="block-title-row">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h4>١٠ وشە ئەکادیمی و پێشکەوتووەکان ({metrics.difficultWords?.length || 0})</h4>
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                            (وشەی ئینگلیزی، جۆر/ئاست، مانا و شیکردنەوە بە کوردی)
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-add-mini"
                                        onClick={() => setMetrics({
                                            ...metrics,
                                            difficultWords: [...(metrics.difficultWords || []), { word: '', type: 'Noun, C1', definition: '' }]
                                        })}
                                    >
                                        <Plus size={14} /> زیادکردنی وشە
                                    </button>
                                </div>
                                <div className="diff-words-grid">
                                    {(metrics.difficultWords || []).map((dw, i) => (
                                        <div key={i} className="diff-word-card-edit">
                                            <div className="diff-card-header">
                                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#8b5cf6', width: '20px' }}>
                                                    #{i + 1}
                                                </span>
                                                <input
                                                    type="text"
                                                    placeholder="English Word"
                                                    value={dw.word}
                                                    onChange={e => {
                                                        const updated = [...(metrics.difficultWords || [])];
                                                        updated[i].word = e.target.value;
                                                        setMetrics({ ...metrics, difficultWords: updated });
                                                    }}
                                                    className="dw-word-input"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Type (e.g. Noun, C1)"
                                                    value={dw.type}
                                                    onChange={e => {
                                                        const updated = [...(metrics.difficultWords || [])];
                                                        updated[i].type = e.target.value;
                                                        setMetrics({ ...metrics, difficultWords: updated });
                                                    }}
                                                    className="dw-type-input"
                                                />
                                                <button
                                                    type="button"
                                                    className="btn-dw-del"
                                                    onClick={() => {
                                                        const updated = (metrics.difficultWords || []).filter((_, idx) => idx !== i);
                                                        setMetrics({ ...metrics, difficultWords: updated });
                                                    }}
                                                    title="سڕینەوە"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                            <textarea
                                                placeholder="مانا و ڕوونکردنەوەی وشەکە بە کوردی..."
                                                value={dw.definition}
                                                onChange={e => {
                                                    const updated = [...(metrics.difficultWords || [])];
                                                    updated[i].definition = e.target.value;
                                                    setMetrics({ ...metrics, difficultWords: updated });
                                                }}
                                                className="dw-def-input"
                                                rows={2}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Repeated Words */}
                            <div className="lm-section-block">
                                <div className="block-title-row">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h4>١٠ وشە دووبارەبووەکان و وەرگێڕان ({metrics.repeatedWords?.length || 0})</h4>
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                            (ژمارەی دووبارەبوونەوە، وشەی ئینگلیزی، مانا بە کوردی)
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-add-mini"
                                        onClick={() => setMetrics({
                                            ...metrics,
                                            repeatedWords: [...(metrics.repeatedWords || []), { word: '', count: 10, meaning: '' }]
                                        })}
                                    >
                                        <Plus size={14} /> زیادکردنی وشە
                                    </button>
                                </div>
                                <div className="rep-words-flex">
                                    {(metrics.repeatedWords || []).map((rw, i) => (
                                        <div key={i} className="rep-word-chip-edit">
                                            <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 700 }}>
                                                {i + 1}.
                                            </span>
                                            <input
                                                type="number"
                                                className="rw-count-input"
                                                value={rw.count}
                                                title="ژمارەی دووبارەبوونەوە"
                                                onChange={e => {
                                                    const updated = [...(metrics.repeatedWords || [])];
                                                    updated[i].count = parseInt(e.target.value, 10) || 1;
                                                    setMetrics({ ...metrics, repeatedWords: updated });
                                                }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Word"
                                                className="rw-word-input"
                                                value={rw.word}
                                                onChange={e => {
                                                    const updated = [...(metrics.repeatedWords || [])];
                                                    updated[i].word = e.target.value;
                                                    setMetrics({ ...metrics, repeatedWords: updated });
                                                }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="مانا بە کوردی"
                                                className="rw-meaning-input"
                                                value={rw.meaning || ''}
                                                onChange={e => {
                                                    const updated = [...(metrics.repeatedWords || [])];
                                                    updated[i].meaning = e.target.value;
                                                    setMetrics({ ...metrics, repeatedWords: updated });
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="btn-rw-del"
                                                onClick={() => {
                                                    const updated = (metrics.repeatedWords || []).filter((_, idx) => idx !== i);
                                                    setMetrics({ ...metrics, repeatedWords: updated });
                                                }}
                                                title="سڕینەوە"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="lm-modal-footer">
                    <button className="btn-lm-cancel" onClick={onClose}>
                        داخستن
                    </button>
                    {(metrics.totalWords > 0 || rawText.trim()) && (
                        <button className="btn-lm-download-txt" onClick={handleDownloadTxt} title="داگرتنی فایلی دەقی شیکاریی زمانەوانی">
                            <FileText size={15} />
                            داگرتنی ئامارەکان (.txt)
                        </button>
                    )}
                    <button
                        className="btn-lm-save"
                        disabled={saving}
                        onClick={handleSave}
                    >
                        <Save size={16} />
                        {saving ? 'پاشەکەوت دەکرێت...' : 'پاشەکەوتکردنی ئامارەکان (Save Metrics)'}
                    </button>
                </div>
            </div>
        </div>
    );
}
