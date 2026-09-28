import React, { useState } from 'react';
import { 
    Clock, X, Zap, Sliders, CheckCircle2, RotateCcw, 
    ArrowRight, Gauge, Play, ArrowLeft, Layers
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './SmartTimeSyncModal.css';

interface SubtitleLine {
    id: number;
    startTime: string;
    endTime: string;
    startSec: number;
    endSec: number;
    english: string;
    kurdish: string;
}

interface SmartTimeSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    lines: SubtitleLine[];
    selectedLineId: number;
    currentTime: number;
    onApplyShift: (deltaSec: number, fromLineId: number) => void;
    onApplyStretch: (startLineId: number, startTargetSec: number, endLineId: number, endTargetSec: number) => void;
    onApplySpeedFactor: (factor: number) => void;
    onUndo: () => void;
    canUndo: boolean;
}

const secToTimeString = (sec: number): string => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

export default function SmartTimeSyncModal({
    isOpen,
    onClose,
    lines,
    selectedLineId,
    currentTime,
    onApplyShift,
    onApplyStretch,
    onApplySpeedFactor,
    onUndo,
    canUndo
}: SmartTimeSyncModalProps) {
    const { lang } = useLanguage();
    const [activeTab, setActiveTab] = useState<'anchor' | 'offset' | 'stretch'>('anchor');

    // Anchor Sync state
    const [anchorScope, setAnchorScope] = useState<'all' | 'from_current'>('all');

    // Custom Offset state
    const [offsetInput, setOffsetInput] = useState<string>('0.5');
    const [offsetScope, setOffsetScope] = useState<'all' | 'from_current'>('all');

    // 2-Point Stretch state
    const [stretchMode, setStretchMode] = useState<'preset' | 'twopoint'>('preset');
    const [startLineId, setStartLineId] = useState<number>(() => lines[0]?.id || 1);
    const [startTargetTimeStr, setStartTargetTimeStr] = useState<string>(() => lines[0]?.startTime || '00:00:01,000');
    const [endLineId, setEndLineId] = useState<number>(() => lines[lines.length - 1]?.id || (lines.length || 1));
    const [endTargetTimeStr, setEndTargetTimeStr] = useState<string>(() => lines[lines.length - 1]?.startTime || '01:30:00,000');

    if (!isOpen) return null;

    const selectedLine = lines.find(l => l.id === selectedLineId) || lines[0];
    const lineStartSec = selectedLine ? selectedLine.startSec : 0;
    const deltaSec = currentTime - lineStartSec;
    const roundedDelta = Math.round(deltaSec * 1000) / 1000;
    const deltaSign = roundedDelta >= 0 ? `+${roundedDelta.toFixed(3)}` : `${roundedDelta.toFixed(3)}`;

    const handleApplyAnchorSync = () => {
        if (!roundedDelta || isNaN(roundedDelta)) return;
        const fromId = anchorScope === 'all' ? 1 : selectedLineId;
        onApplyShift(roundedDelta, fromId);
    };

    const handleApplyCustomOffset = (delta: number) => {
        if (!delta || isNaN(delta)) return;
        const fromId = offsetScope === 'all' ? 1 : selectedLineId;
        onApplyShift(delta, fromId);
    };

    const handleExecuteTwoPointStretch = () => {
        const timeToSec = (t: string) => {
            const p = t.trim().split(':');
            if (p.length < 3) return 0;
            const [h, m] = p;
            const [s, ms] = (p[2] || '').split(',');
            return (+h || 0) * 3600 + (+m || 0) * 60 + (+s || 0) + (+ms || 0) / 1000;
        };

        const sTarget = timeToSec(startTargetTimeStr);
        const eTarget = timeToSec(endTargetTimeStr);

        if (eTarget <= sTarget) {
            alert(lang === 'en' ? 'End target time must be greater than start target time!' : 'کاتی کۆتایی دەبێت لە کاتی دەستپێک گەورەتر بێت!');
            return;
        }

        onApplyStretch(startLineId, sTarget, endLineId, eTarget);
    };

    return (
        <div className="smart-sync-backdrop" onClick={onClose}>
            <div className="smart-sync-modal" onClick={e => e.stopPropagation()} dir={lang === 'en' ? 'ltr' : 'rtl'}>
                {/* Header */}
                <div className="smart-sync-header">
                    <div className="smart-sync-header-left">
                        <div className="sync-icon-bubble">
                            <Clock size={20} color="#fbbf24" />
                        </div>
                        <div>
                            <h3 className="smart-sync-title">
                                {lang === 'en' ? 'Smart Subtitle Time-Sync & Offset Engine' : 'ئۆتۆ-سینکی زیرەکی کات و هاوتاکردنی ژێرنووس'}
                            </h3>
                            <p className="smart-sync-subtitle">
                                {lang === 'en' 
                                    ? `Movie total: ${lines.length} lines | Live video position: ${secToTimeString(currentTime)}` 
                                    : `کۆی گشتی دێڕەکان: ${lines.length} دێڕ | کاتی ئێستای ڤیدیۆ: ${secToTimeString(currentTime)}`}
                            </p>
                        </div>
                    </div>
                    <div className="smart-sync-header-right">
                        {canUndo && (
                            <button className="btn-sync-undo" onClick={onUndo} title={lang === 'en' ? 'Undo previous sync change' : 'گەڕانەوە بۆ پێش گۆڕانکاری (Undo)'}>
                                <RotateCcw size={15} />
                                <span>{lang === 'en' ? 'Undo' : 'گەڕانەوە (Undo)'}</span>
                            </button>
                        )}
                        <button className="btn-sync-close" onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="smart-sync-tabs">
                    <button 
                        className={`sync-tab-btn ${activeTab === 'anchor' ? 'active' : ''}`}
                        onClick={() => setActiveTab('anchor')}
                    >
                        <Zap size={16} color={activeTab === 'anchor' ? '#fbbf24' : 'currentColor'} />
                        <span>{lang === 'en' ? '1-Click Video Anchor' : 'سینکی خێرا بە کاتی ڤیدیۆ (Anchor)'}</span>
                    </button>
                    <button 
                        className={`sync-tab-btn ${activeTab === 'offset' ? 'active' : ''}`}
                        onClick={() => setActiveTab('offset')}
                    >
                        <Sliders size={16} color={activeTab === 'offset' ? '#38bdf8' : 'currentColor'} />
                        <span>{lang === 'en' ? 'Manual Time Shift' : 'گواستنەوەی کاتی گشتی (Shift)'}</span>
                    </button>
                    <button 
                        className={`sync-tab-btn ${activeTab === 'stretch' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stretch')}
                    >
                        <Gauge size={16} color={activeTab === 'stretch' ? '#34d399' : 'currentColor'} />
                        <span>{lang === 'en' ? 'Framerate Drift Stretch' : 'چارەسەری خێرایی فرەیم (24/25fps)'}</span>
                    </button>
                </div>

                {/* Tab Content */}
                <div className="smart-sync-body">
                    {/* ─── TAB 1: ANCHOR SYNC ─── */}
                    {activeTab === 'anchor' && (
                        <div className="sync-section animate-fade">
                            <div className="sync-info-box">
                                <p>
                                    {lang === 'en'
                                        ? 'Seek the video player to the exact moment where the selected line begins speaking, then click Apply to shift everything perfectly in one click.'
                                        : 'ڤیدیۆکە بهێنە سەر ئەو چرکەیەی کە ئەکتەرەکە دەست بە قسەکردنی ئەم دێڕە دەکات، پاشان کلیک لە دوگمەی سینک بکە تا هەموو دێڕەکان ڕاستەوخۆ لەگەڵ دەنگەکە هاوتا ببن.'}
                                </p>
                            </div>

                            <div className="sync-compare-grid">
                                <div className="compare-card video-card">
                                    <span className="card-label">🎬 {lang === 'en' ? 'Current Video Time' : 'کاتی ئێستای ڤیدیۆ'}</span>
                                    <div className="time-display">{secToTimeString(currentTime)}</div>
                                    <span className="card-sub">{currentTime.toFixed(3)}s</span>
                                </div>

                                <div className="compare-arrow">
                                    <ArrowRight size={24} color="#a855f7" />
                                </div>

                                <div className="compare-card subtitle-card">
                                    <span className="card-label">📝 {lang === 'en' ? `Selected Line (#${selectedLine?.id || 1})` : `دێڕی دیاریکراو (#${selectedLine?.id || 1})`}</span>
                                    <div className="time-display">{selectedLine?.startTime || '00:00:00,000'}</div>
                                    <span className="card-sub truncate">{selectedLine?.kurdish || selectedLine?.english || '...'}</span>
                                </div>
                            </div>

                            <div className="sync-delta-banner">
                                <div className="delta-pill">
                                    <span>{lang === 'en' ? 'Calculated Shift Required:' : 'جیاوازی کاتی پێویست:'}</span>
                                    <strong style={{ color: roundedDelta > 0 ? '#34d399' : roundedDelta < 0 ? '#f87171' : '#cbd5e1' }}>
                                        {deltaSign}s ({Math.abs(roundedDelta)} {lang === 'en' ? 'seconds' : 'چرکە'})
                                    </strong>
                                </div>
                            </div>

                            <div className="sync-scope-group">
                                <span className="scope-title">{lang === 'en' ? 'Apply sync to:' : 'جێبەجێکردنی سینک لەسەر:'}</span>
                                <div className="scope-options">
                                    <label className={`scope-label ${anchorScope === 'all' ? 'active' : ''}`}>
                                        <input 
                                            type="radio" 
                                            name="anchorScope" 
                                            checked={anchorScope === 'all'} 
                                            onChange={() => setAnchorScope('all')} 
                                        />
                                        <span>🌟 {lang === 'en' ? `All Subtitle Lines (Line 1 to ${lines.length})` : `تەواوی ژێرنووسەکان (دێڕی ١ تا ${lines.length})`}</span>
                                    </label>
                                    <label className={`scope-label ${anchorScope === 'from_current' ? 'active' : ''}`}>
                                        <input 
                                            type="radio" 
                                            name="anchorScope" 
                                            checked={anchorScope === 'from_current'} 
                                            onChange={() => setAnchorScope('from_current')} 
                                        />
                                        <span>📍 {lang === 'en' ? `From Current Line (#${selectedLineId} to ${lines.length})` : `تەنها لەم دێڕەوە بەرەو خوارەوە (#${selectedLineId} تا ${lines.length})`}</span>
                                    </label>
                                </div>
                            </div>

                            <button className="btn-apply-main-sync" onClick={handleApplyAnchorSync}>
                                <Zap size={18} />
                                <span>{lang === 'en' ? `Sync Subtitles Now (${deltaSign}s)` : `هاوتاکردنی تەواوی ژێرنووس ئێستا (${deltaSign}s)`}</span>
                            </button>
                        </div>
                    )}

                    {/* ─── TAB 2: MANUAL OFFSET SHIFT ─── */}
                    {activeTab === 'offset' && (
                        <div className="sync-section animate-fade">
                            <div className="sync-info-box">
                                <p>
                                    {lang === 'en'
                                        ? 'Quickly shift subtitles earlier or later by standard increments or input a precise custom offset.'
                                        : 'ژێرنووسەکان پێش یان پاش بخە بە بڕی دیاریکراو یان ژمارەیەکی دڵخوازی چرکەکان بنووسە.'}
                                </p>
                            </div>

                            {/* Quick Increment Buttons */}
                            <div className="quick-presets-section">
                                <span className="preset-group-title">{lang === 'en' ? '⚡ Quick Increment Buttons:' : '⚡ دوگمە خێراکان:'}</span>
                                <div className="preset-btns-grid">
                                    <button className="btn-preset minus" onClick={() => handleApplyCustomOffset(-2.0)}>-2.0s</button>
                                    <button className="btn-preset minus" onClick={() => handleApplyCustomOffset(-1.0)}>-1.0s</button>
                                    <button className="btn-preset minus" onClick={() => handleApplyCustomOffset(-0.5)}>-0.5s</button>
                                    <button className="btn-preset minus" onClick={() => handleApplyCustomOffset(-0.2)}>-0.2s</button>
                                    <button className="btn-preset minus" onClick={() => handleApplyCustomOffset(-0.1)}>-0.1s</button>
                                    
                                    <button className="btn-preset plus" onClick={() => handleApplyCustomOffset(0.1)}>+0.1s</button>
                                    <button className="btn-preset plus" onClick={() => handleApplyCustomOffset(0.2)}>+0.2s</button>
                                    <button className="btn-preset plus" onClick={() => handleApplyCustomOffset(0.5)}>+0.5s</button>
                                    <button className="btn-preset plus" onClick={() => handleApplyCustomOffset(1.0)}>+1.0s</button>
                                    <button className="btn-preset plus" onClick={() => handleApplyCustomOffset(2.0)}>+2.0s</button>
                                </div>
                            </div>

                            {/* Custom Input */}
                            <div className="custom-offset-row">
                                <span className="custom-input-label">{lang === 'en' ? 'Custom Shift (Seconds):' : 'بڕی دڵخواز (چرکە):'}</span>
                                <div className="custom-input-wrap">
                                    <input 
                                        type="number" 
                                        step="0.05" 
                                        value={offsetInput} 
                                        onChange={e => setOffsetInput(e.target.value)}
                                        className="offset-number-input"
                                        placeholder="e.g. 1.25 or -0.8"
                                    />
                                    <div className="custom-input-actions">
                                        <button 
                                            className="btn-shift-action minus"
                                            onClick={() => handleApplyCustomOffset(-Math.abs(parseFloat(offsetInput) || 0))}
                                        >
                                            ◀ {lang === 'en' ? 'Earlier (-)' : 'پێشخستن (-)'}
                                        </button>
                                        <button 
                                            className="btn-shift-action plus"
                                            onClick={() => handleApplyCustomOffset(Math.abs(parseFloat(offsetInput) || 0))}
                                        >
                                            ▶ {lang === 'en' ? 'Later (+)' : 'پاشخستن (+)'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="sync-scope-group">
                                <span className="scope-title">{lang === 'en' ? 'Scope of Shift:' : 'مەودای گۆڕانکاری:'}</span>
                                <div className="scope-options">
                                    <label className={`scope-label ${offsetScope === 'all' ? 'active' : ''}`}>
                                        <input 
                                            type="radio" 
                                            name="offsetScope" 
                                            checked={offsetScope === 'all'} 
                                            onChange={() => setOffsetScope('all')} 
                                        />
                                        <span>🌟 {lang === 'en' ? `All Subtitles (1 to ${lines.length})` : `تەواوی فیلمەکە (دێڕی ١ تا ${lines.length})`}</span>
                                    </label>
                                    <label className={`scope-label ${offsetScope === 'from_current' ? 'active' : ''}`}>
                                        <input 
                                            type="radio" 
                                            name="offsetScope" 
                                            checked={offsetScope === 'from_current'} 
                                            onChange={() => setOffsetScope('from_current')} 
                                        />
                                        <span>📍 {lang === 'en' ? `From Line #${selectedLineId} Onwards` : `تەنها لەم دێڕەوە (#${selectedLineId}) بۆ کۆتایی`}</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── TAB 3: FRAMERATE & DRIFT STRETCH ─── */}
                    {activeTab === 'stretch' && (
                        <div className="sync-section animate-fade">
                            <div className="sync-info-box">
                                <p>
                                    {lang === 'en'
                                        ? 'Fix progressive time drift caused by different frame rates (e.g. 23.976 fps to 25.0 fps conversion) across the entire movie duration.'
                                        : 'چارەسەرکردنی خاووبوونەوە یان خێرا لێدانی پلە بە پلەی ژێرنووس (کە بەهۆی جیاوازی 23.976fps و 25fps ڕوودەدات بە درێژایی فیلمەکە).'}
                                </p>
                            </div>

                            {/* Preset FPS Drift Fix Buttons */}
                            <div className="framerate-presets">
                                <span className="preset-group-title">🎯 {lang === 'en' ? 'Common Frame Rate Conversions:' : 'گۆڕینە باوەکانی خێرایی فرەیم:'}</span>
                                <div className="fps-grid">
                                    <button 
                                        className="btn-fps-card"
                                        onClick={() => onApplySpeedFactor(23.976 / 25.0)}
                                    >
                                        <strong>23.976 fps ➔ 25.000 fps</strong>
                                        <span>Speed factor: 0.959x (خێراترکردنەوە بە ٤.١٪)</span>
                                    </button>
                                    <button 
                                        className="btn-fps-card"
                                        onClick={() => onApplySpeedFactor(25.0 / 23.976)}
                                    >
                                        <strong>25.000 fps ➔ 23.976 fps</strong>
                                        <span>Speed factor: 1.0427x (هێواشکردنەوە بە ٤.١٪)</span>
                                    </button>
                                    <button 
                                        className="btn-fps-card"
                                        onClick={() => onApplySpeedFactor(23.976 / 24.0)}
                                    >
                                        <strong>23.976 fps ➔ 24.000 fps</strong>
                                        <span>Speed factor: 0.999x (گۆڕینی سینەمایی)</span>
                                    </button>
                                    <button 
                                        className="btn-fps-card"
                                        onClick={() => onApplySpeedFactor(24.0 / 23.976)}
                                    >
                                        <strong>24.000 fps ➔ 23.976 fps</strong>
                                        <span>Speed factor: 1.001x</span>
                                    </button>
                                </div>
                            </div>

                            {/* 2-Point Linear Calibration */}
                            <div className="twopoint-section">
                                <span className="preset-group-title">📐 {lang === 'en' ? '2-Point Precision Linear Calibration:' : 'ڕێکخستنەوەی وردی هێڵی بە دوو خاڵ:'}</span>
                                <div className="twopoint-grid">
                                    <div className="point-card">
                                        <div className="point-header">📌 {lang === 'en' ? 'Point A (Start Line)' : 'خاڵی دەستپێک (دێڕی یەکەم)'}</div>
                                        <div className="point-inputs">
                                            <div className="input-group">
                                                <label>Line #:</label>
                                                <input 
                                                    type="number" 
                                                    value={startLineId} 
                                                    onChange={e => setStartLineId(parseInt(e.target.value, 10) || 1)}
                                                    className="compact-input"
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label>Target Time:</label>
                                                <input 
                                                    type="text" 
                                                    value={startTargetTimeStr} 
                                                    onChange={e => setStartTargetTimeStr(e.target.value)}
                                                    className="compact-input"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="point-card">
                                        <div className="point-header">📌 {lang === 'en' ? 'Point B (End Line)' : 'خاڵی کۆتایی (دێڕی کۆتایی)'}</div>
                                        <div className="point-inputs">
                                            <div className="input-group">
                                                <label>Line #:</label>
                                                <input 
                                                    type="number" 
                                                    value={endLineId} 
                                                    onChange={e => setEndLineId(parseInt(e.target.value, 10) || lines.length)}
                                                    className="compact-input"
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label>Target Time:</label>
                                                <input 
                                                    type="text" 
                                                    value={endTargetTimeStr} 
                                                    onChange={e => setEndTargetTimeStr(e.target.value)}
                                                    className="compact-input"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button className="btn-apply-stretch" onClick={handleExecuteTwoPointStretch}>
                                    <Gauge size={16} />
                                    <span>{lang === 'en' ? 'Recalibrate & Stretch Subtitles' : 'جێبەجێکردنی هاوسەنگکردنەوەی خێرایی (Stretch)'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Shortcut Helper */}
                <div className="smart-sync-footer">
                    <div className="shortcut-tips">
                        <span className="tip-badge">⌨️ {lang === 'en' ? 'Live Shortcuts:' : 'کلیلە خێراکان:'}</span>
                        <span className="tip-text">
                            <strong>Shift + [</strong> (-200ms) | <strong>Shift + ]</strong> (+200ms) | <strong>Ctrl + Shift + [</strong> (-1.0s) | <strong>Ctrl + Shift + ]</strong> (+1.0s)
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
