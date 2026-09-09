import React, { useState } from 'react';
import { X, Save, Sparkles, BarChart2, Check, AlertCircle, Plus, Trash2, HelpCircle, Download, FileText } from 'lucide-react';
import { LanguageMetrics, DifficultWord, RepeatedWord } from '../types';
import { parseLinguisticAnalysisText, triggerFileDownload } from '../utils/aiTranslator';
import './LanguageMetricsModal.css';

interface LanguageMetricsModalProps {
    title: string;
    subtitle?: string;
    initialMetrics?: LanguageMetrics;
    onSave: (metrics: LanguageMetrics) => Promise<void>;
    onClose: () => void;
}

export default function LanguageMetricsModal({
    title,
    subtitle,
    initialMetrics,
    onSave,
    onClose
}: LanguageMetricsModalProps) {
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
    const [activeTab, setActiveTab] = useState<'paste' | 'preview'>('paste');

    const handleAutoParse = () => {
        if (!rawText.trim()) return;
        const parsed = parseLinguisticAnalysisText(rawText);
        setMetrics(parsed);
        setActiveTab('preview');
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
            : `ئامارەکانی زمانی: ${title} ${subtitle || ''}\n\nسەرجەمی وشەکان: ${metrics.totalWords}\nئاستی گشتی CEFR: ${metrics.cefrLevel}\nچڕی فەرهەنگی: ${metrics.lexicalDensity}%\nجۆراوجۆری وشەکان: ${metrics.vocabDiversity}%\n\nدابەشبوونی ئاستەکان:\nA1: ${metrics.distribution.A1}%\nA2: ${metrics.distribution.A2}%\nB1: ${metrics.distribution.B1}%\nB2: ${metrics.distribution.B2}%\nC1: ${metrics.distribution.C1}%\nC2: ${metrics.distribution.C2}%\n\n١٠ وشە ئەکادیمی و پێشکەوتووەکان:\n${(metrics.difficultWords || []).map((w, idx) => `${idx + 1}. ${w.word} (${w.type}): ${w.definition}`).join('\n')}\n\nوشە دووبارەبووەکان:\n${(metrics.repeatedWords || []).map(w => `* ${w.word}: ${w.count} جار (${w.meaning || ''})`).join('\n')}`;

        triggerFileDownload(
            txtContent,
            `${title.replace(/\s+/g, '_')}_${subtitle ? subtitle.replace(/[\s\(\)]+/g, '_') : ''}_analysis.txt`
        );
    };

    return (
        <div className="lm-modal-backdrop" onClick={onClose}>
            <div className="lm-modal-container" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="lm-modal-header">
                    <div className="lm-modal-title-wrap">
                        <div className="lm-badge">ئامارەکانی زمان • Language Metrics</div>
                        <h2>{title} {subtitle ? `• ${subtitle}` : ''}</h2>
                    </div>
                    <button className="lm-close-btn" onClick={onClose}>
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
                        <span>پەیستکردنی دەقی شیکاریی AI (Paste Text)</span>
                    </button>
                    <button
                        className={`lm-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('preview')}
                    >
                        <BarChart2 size={15} />
                        <span>پێشبینی و دەستکاریکردنی ئامارەکان (Preview & Edit)</span>
                    </button>
                </div>

                {/* Body */}
                <div className="lm-modal-body">
                    {activeTab === 'paste' ? (
                        <div className="lm-paste-pane">
                            <div className="lm-paste-intro">
                                <Sparkles size={18} className="text-purple-400" />
                                <p>
                                    تەواوی دەقی <strong>بەشی ١ (PART 1: LINGUISTIC ANALYSIS & STATISTICS)</strong> کە ژیریی دەستکردەکە بۆی دروستکردوویت لێرە پەیست بکە و کلیک لە دوگمەی شیکردنەوە بکە:
                                </p>
                            </div>
                            <textarea
                                className="lm-paste-textarea"
                                value={rawText}
                                onChange={e => setRawText(e.target.value)}
                                placeholder="دەقی شیکاریی زمانەوانی لێرە پەیست بکە (کۆی گشتی وشەکان، ئاستەکانی CEFR، ١٠ وشە قورسەکان، وشە دووبارەبووەکان)..."
                                rows={14}
                            />
                            <div className="lm-paste-actions">
                                <button
                                    className="btn-lm-parse"
                                    disabled={!rawText.trim()}
                                    onClick={handleAutoParse}
                                >
                                    <Sparkles size={16} />
                                    شیکردنەوە و پڕکردنەوەی خۆکار (Auto Parse)
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="lm-preview-pane">
                            {/* Top Stat Cards */}
                            <div className="lm-stats-grid">
                                <div className="lm-stat-card">
                                    <span className="stat-label">سەرجەمی وشەکان</span>
                                    <input
                                        type="number"
                                        className="stat-input"
                                        value={metrics.totalWords}
                                        onChange={e => setMetrics({ ...metrics, totalWords: parseInt(e.target.value, 10) || 0 })}
                                    />
                                </div>
                                <div className="lm-stat-card">
                                    <span className="stat-label">چڕی فەرهەنگی</span>
                                    <input
                                        type="number"
                                        className="stat-input"
                                        value={metrics.lexicalDensity}
                                        onChange={e => setMetrics({ ...metrics, lexicalDensity: parseInt(e.target.value, 10) || 0 })}
                                    />
                                </div>
                                <div className="lm-stat-card">
                                    <span className="stat-label">جۆراوجۆری وشەکان</span>
                                    <input
                                        type="number"
                                        className="stat-input"
                                        value={metrics.vocabDiversity}
                                        onChange={e => setMetrics({ ...metrics, vocabDiversity: parseInt(e.target.value, 10) || 0 })}
                                    />
                                </div>
                                <div className="lm-stat-card">
                                    <span className="stat-label">ئاستی گشتی CEFR</span>
                                    <select
                                        className="stat-select"
                                        value={metrics.cefrLevel}
                                        onChange={e => setMetrics({ ...metrics, cefrLevel: e.target.value as any })}
                                    >
                                        <option value="A1">A1 (سەرەتایی)</option>
                                        <option value="A2">A2 (ئاسان)</option>
                                        <option value="B1">B1 (مامناوەند)</option>
                                        <option value="B2">B2 (سەروو مامناوەند)</option>
                                        <option value="C1">C1 (پێشکەوتوو)</option>
                                        <option value="C2">C2 (پسپۆڕ)</option>
                                    </select>
                                </div>
                            </div>

                            {/* CEFR Level Bars */}
                            <div className="lm-section-block">
                                <h4>دابەشبوونی ئاستەکانی زمان (CEFR Distribution %)</h4>
                                <div className="cefr-bars-editor">
                                    {(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map(lvl => (
                                        <div key={lvl} className="cefr-bar-row">
                                            <span className="cefr-level-badge">{lvl}</span>
                                            <div className="cefr-track">
                                                <div className="cefr-fill" style={{ width: `${metrics.distribution[lvl] || 0}%` }} />
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
                                    <h4>وشە ئەکادیمی و پێشکەوتووەکان ({metrics.difficultWords?.length || 0})</h4>
                                    <button
                                        className="btn-add-mini"
                                        onClick={() => setMetrics({
                                            ...metrics,
                                            difficultWords: [...(metrics.difficultWords || []), { word: '', type: 'Noun', definition: '' }]
                                        })}
                                    >
                                        <Plus size={14} /> زیادکردنی وشە
                                    </button>
                                </div>
                                <div className="diff-words-grid">
                                    {(metrics.difficultWords || []).map((dw, i) => (
                                        <div key={i} className="diff-word-card-edit">
                                            <div className="diff-card-header">
                                                <input
                                                    type="text"
                                                    placeholder="Word (English)"
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
                                                    placeholder="Type (e.g. Noun, Verb)"
                                                    value={dw.type}
                                                    onChange={e => {
                                                        const updated = [...(metrics.difficultWords || [])];
                                                        updated[i].type = e.target.value;
                                                        setMetrics({ ...metrics, difficultWords: updated });
                                                    }}
                                                    className="dw-type-input"
                                                />
                                                <button
                                                    className="btn-dw-del"
                                                    onClick={() => {
                                                        const updated = (metrics.difficultWords || []).filter((_, idx) => idx !== i);
                                                        setMetrics({ ...metrics, difficultWords: updated });
                                                    }}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                            <textarea
                                                placeholder="مانا و ڕوونکردنەوە بە کوردی..."
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
                                    <h4>وشە دووبارەبووەکان و وەرگێڕان ({metrics.repeatedWords?.length || 0})</h4>
                                    <button
                                        className="btn-add-mini"
                                        onClick={() => setMetrics({
                                            ...metrics,
                                            repeatedWords: [...(metrics.repeatedWords || []), { word: '', count: 5, meaning: '' }]
                                        })}
                                    >
                                        <Plus size={14} /> زیادکردنی وشە
                                    </button>
                                </div>
                                <div className="rep-words-flex">
                                    {(metrics.repeatedWords || []).map((rw, i) => (
                                        <div key={i} className="rep-word-chip-edit">
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
                                                placeholder="مانا"
                                                className="rw-meaning-input"
                                                value={rw.meaning || ''}
                                                onChange={e => {
                                                    const updated = [...(metrics.repeatedWords || [])];
                                                    updated[i].meaning = e.target.value;
                                                    setMetrics({ ...metrics, repeatedWords: updated });
                                                }}
                                            />
                                            <button
                                                className="btn-rw-del"
                                                onClick={() => {
                                                    const updated = (metrics.repeatedWords || []).filter((_, idx) => idx !== i);
                                                    setMetrics({ ...metrics, repeatedWords: updated });
                                                }}
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
