import React, { useState, useMemo } from 'react';
import {
    ShieldCheck, AlertTriangle, AlertCircle, Info, CheckCircle2,
    Wand2, X, ArrowLeft, RefreshCw, Zap
} from 'lucide-react';
import { runSubtitleQc, autoFixQcIssues, QcReport, QcIssue, SubtitleLineData } from '../utils/subtitleQc';
import { useLanguage } from '../context/LanguageContext';
import './SubtitleQcModal.css';

interface SubtitleQcModalProps {
    lines: SubtitleLineData[];
    onApplyAutoFix: (fixedLines: SubtitleLineData[]) => void;
    onJumpToLine: (lineId: number) => void;
    onClose: () => void;
}

export default function SubtitleQcModal({
    lines,
    onApplyAutoFix,
    onJumpToLine,
    onClose
}: SubtitleQcModalProps) {
    const { lang } = useLanguage();
    const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'suggestion'>('all');
    const [fixedCountMessage, setFixedCountMessage] = useState<string | null>(null);

    const report: QcReport = useMemo(() => {
        return runSubtitleQc(lines);
    }, [lines]);

    const filteredIssues = useMemo(() => {
        if (filter === 'all') return report.issues;
        return report.issues.filter(i => i.severity === filter);
    }, [report.issues, filter]);

    const handleAutoFixAll = () => {
        const { fixedLines, fixedCount } = autoFixQcIssues(lines);
        if (fixedCount > 0) {
            onApplyAutoFix(fixedLines);
            setFixedCountMessage(lang === 'en' ? `(${fixedCount}) timing issues successfully resolved ✓` : `بڕی (${fixedCount}) کێشە بە سەرکەوتوویی چاککران ✓`);
            setTimeout(() => setFixedCountMessage(null), 4000);
        } else {
            setFixedCountMessage(lang === 'en' ? 'No timing issues found that require auto-fix.' : 'هیچ کێشەیەکی کاتی خۆکار نەدۆزرایەوە بۆ چاککردن.');
            setTimeout(() => setFixedCountMessage(null), 3000);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 90) return '#10b981'; // Green
        if (score >= 70) return '#fbbf24'; // Yellow
        return '#ef4444'; // Red
    };

    return (
        <div className="qc-modal-backdrop" onClick={onClose}>
            <div className={`qc-modal-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="qc-modal-header">
                    <div className="qc-header-left">
                        <div className="qc-header-icon-wrap">
                            <ShieldCheck size={22} color="#10b981" />
                        </div>
                        <div>
                            <h2>{lang === 'en' ? 'Subtitle Quality Check' : 'پشکنینی کوالێتی سەبتایتڵ'}</h2>
                            <p className="qc-header-subtitle">{lang === 'en' ? 'Timing, reading speed (CPS) and line check' : 'پشکنینی کات، خێرایی خوێندنەوە (CPS) و دێڕەکان'}</p>
                        </div>
                    </div>
                    <button className="btn-qc-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Score & Summary Banner */}
                <div className="qc-score-banner">
                    <div className="qc-score-hero-wrap">
                        <div className="qc-score-circle" style={{ borderColor: getScoreColor(report.score), boxShadow: `0 0 20px ${getScoreColor(report.score)}33` }}>
                            <span className="score-num" style={{ color: getScoreColor(report.score) }}>{report.score}</span>
                            <span className="score-label">{lang === 'en' ? '/ 100' : 'لە ١٠٠'}</span>
                        </div>

                        <div className="qc-verdict-col">
                            <div className="qc-score-status">
                                {report.score >= 90 ? (
                                    <span className="status-badge excellent">
                                        <CheckCircle2 size={15} /> {lang === 'en' ? 'Excellent Quality' : 'کوالێتی زۆر باش'}
                                    </span>
                                ) : report.score >= 70 ? (
                                    <span className="status-badge moderate">
                                        <AlertTriangle size={15} /> {lang === 'en' ? 'Moderate Quality' : 'کوالێتی مامناوەند'}
                                    </span>
                                ) : (
                                    <span className="status-badge poor">
                                        <AlertCircle size={15} /> {lang === 'en' ? 'Needs Timing Fixes' : 'پێویستی بە چاککردنی کاتە'}
                                    </span>
                                )}
                            </div>

                            <button
                                className="btn-qc-autofix"
                                onClick={handleAutoFixAll}
                                title={lang === 'en' ? "Auto-fix all overlap and short timing issues" : "چاککردنی خۆکاری هەموو کاتە پێکداچووەکان"}
                            >
                                <Wand2 size={15} />
                                <span>{lang === 'en' ? 'Auto-Fix Timings' : 'چاککردنی خۆکاری کاتەکان'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="qc-stats-grid">
                        <div className="qc-stat-card critical" onClick={() => setFilter('critical')}>
                            <div className="stat-card-val" style={{ color: '#ef4444' }}>{report.criticalCount}</div>
                            <div className="stat-card-lbl">🔴 {lang === 'en' ? 'Errors' : 'هەڵە'}</div>
                        </div>
                        <div className="qc-stat-card warning" onClick={() => setFilter('warning')}>
                            <div className="stat-card-val" style={{ color: '#fbbf24' }}>{report.warningCount}</div>
                            <div className="stat-card-lbl">🟡 {lang === 'en' ? 'Warnings' : 'ئاگاداری'}</div>
                        </div>
                        <div className="qc-stat-card suggestion" onClick={() => setFilter('suggestion')}>
                            <div className="stat-card-val" style={{ color: '#38bdf8' }}>{report.suggestionCount}</div>
                            <div className="stat-card-lbl">🔵 {lang === 'en' ? 'Suggestions' : 'پێشنیار'}</div>
                        </div>
                        <div className="qc-stat-card total" onClick={() => setFilter('all')}>
                            <div className="stat-card-val" style={{ color: '#e2e8f0' }}>{lines.length}</div>
                            <div className="stat-card-lbl">📄 {lang === 'en' ? 'Lines' : 'دێڕ'}</div>
                        </div>
                    </div>
                </div>

                {fixedCountMessage && (
                    <div className="qc-fixed-alert">
                        <Zap size={15} />
                        <span>{fixedCountMessage}</span>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="qc-filter-tabs">
                    <button
                        className={`qc-tab-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        {lang === 'en' ? `All (${report.totalIssues})` : `هەمووی (${report.totalIssues})`}
                    </button>
                    <button
                        className={`qc-tab-btn ${filter === 'critical' ? 'active' : ''}`}
                        onClick={() => setFilter('critical')}
                    >
                        🔴 {lang === 'en' ? `Errors (${report.criticalCount})` : `هەڵە (${report.criticalCount})`}
                    </button>
                    <button
                        className={`qc-tab-btn ${filter === 'warning' ? 'active' : ''}`}
                        onClick={() => setFilter('warning')}
                    >
                        🟡 {lang === 'en' ? `Warnings (${report.warningCount})` : `ئاگاداری (${report.warningCount})`}
                    </button>
                    <button
                        className={`qc-tab-btn ${filter === 'suggestion' ? 'active' : ''}`}
                        onClick={() => setFilter('suggestion')}
                    >
                        🔵 {lang === 'en' ? `Suggestions (${report.suggestionCount})` : `پێشنیار (${report.suggestionCount})`}
                    </button>
                </div>

                {/* Issues List */}
                <div className="qc-issues-list">
                    {filteredIssues.length === 0 ? (
                        <div className="qc-empty-state">
                            <CheckCircle2 size={48} color="#10b981" />
                            <h3>{lang === 'en' ? 'No issues found in this category!' : 'هیچ کێشەیەک لەم بەشەدا نییە!'}</h3>
                            <p>{lang === 'en' ? 'All subtitle lines in this category are standard and valid.' : 'تەواوی دێڕەکانی سەبتایتڵ لەم بەشەدا ستاندارد و دروستن.'}</p>
                        </div>
                    ) : (
                        filteredIssues.map(issue => (
                            <div key={issue.id} className={`qc-issue-card severity-${issue.severity}`}>
                                <div className="issue-card-header">
                                    <div className="issue-title-wrap">
                                        {issue.severity === 'critical' ? (
                                            <AlertCircle size={18} className="issue-icon-crit" />
                                        ) : issue.severity === 'warning' ? (
                                            <AlertTriangle size={18} className="issue-icon-warn" />
                                        ) : (
                                            <Info size={18} className="issue-icon-info" />
                                        )}
                                        <span className="issue-title">{issue.title}</span>
                                        <span className="issue-line-badge">{lang === 'en' ? `Line #${issue.lineId}` : `دێڕی #${issue.lineId}`}</span>
                                    </div>

                                    <button
                                        className="btn-jump-to-issue"
                                        onClick={() => {
                                            onJumpToLine(issue.lineId);
                                            onClose();
                                        }}
                                        title={lang === 'en' ? "Jump to this line in editor" : "بڕۆ بۆ ئەم دێڕە لە ناو ئیدیتۆر"}
                                    >
                                        <span>{lang === 'en' ? 'Jump to Line' : 'بڕۆ بۆ دێڕەکە'}</span>
                                        <ArrowLeft size={14} />
                                    </button>
                                </div>

                                <p className="issue-description">{issue.description}</p>

                                {(issue.currentValue || issue.suggestedValue) && (
                                    <div className="issue-meta-row">
                                        {issue.currentValue && (
                                            <span className="meta-tag current">
                                                {lang === 'en' ? 'Current: ' : 'بڕی هەنووکە: '}<strong>{issue.currentValue}</strong>
                                            </span>
                                        )}
                                        {issue.suggestedValue && (
                                            <span className="meta-tag suggested">
                                                {lang === 'en' ? 'Suggested: ' : 'پێشنیاز: '}<strong>{issue.suggestedValue}</strong>
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
