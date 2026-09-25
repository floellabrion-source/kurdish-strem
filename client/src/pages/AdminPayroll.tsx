import React, { useState, useEffect } from 'react';
import axios from '../api/client';
import {
    Wallet, Users, DollarSign, FileText, CheckCircle, Clock,
    ArrowDownCircle, Plus, Edit2, Eye, Printer, Copy, Check,
    AlertCircle, RefreshCw, TrendingUp, ShieldCheck, Search,
    ChevronDown, X, Trash2
} from 'lucide-react';
import './AdminPayroll.css';

interface PayoutReceipt {
    receiptId: string;
    date: string;
    userId: string;
    username: string;
    name: string;
    linesPaid: number;
    rate: { lines: number; priceIqd: number };
    grossAmountIqd: number;
    advanceDeductedIqd: number;
    netAmountPaidIqd: number;
    paidBy: string;
    note: string;
    movieBreakdown?: { title: string; lines: number }[];
}

interface TranslatorRecord {
    userId: string;
    username: string;
    name: string;
    role: string;
    rate: { lines: number; priceIqd: number };
    unpaidLines: number;
    totalEditedLines: number;
    estimatedEarningsIqd: number;
    totalAdvanceIqd: number;
    netPayableIqd: number;
    advances: { id: string; amountIqd: number; note: string; date: string; paidBy: string }[];
    payoutCount: number;
    payoutHistory: PayoutReceipt[];
}

interface AdminPayrollOverview {
    defaultRate: { lines: number; priceIqd: number };
    translators: TranslatorRecord[];
    systemStats: {
        totalUnpaidLines: number;
        totalEstimatedIqd: number;
        totalPaidIqd: number;
        totalTranslators: number;
    };
}

export default function AdminPayroll() {
    const [overview, setOverview] = useState<AdminPayrollOverview | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Modal States
    const [selectedTranslatorForRate, setSelectedTranslatorForRate] = useState<TranslatorRecord | null>(null);
    const [rateLines, setRateLines] = useState<number>(600);
    const [ratePriceIqd, setRatePriceIqd] = useState<number>(1500);

    const [selectedTranslatorForAdvance, setSelectedTranslatorForAdvance] = useState<TranslatorRecord | null>(null);
    const [advanceAmount, setAdvanceAmount] = useState<number>(5000);
    const [advanceNote, setAdvanceNote] = useState<string>('');

    const [selectedTranslatorForPayout, setSelectedTranslatorForPayout] = useState<TranslatorRecord | null>(null);
    const [payoutDeductAdvance, setPayoutDeductAdvance] = useState<boolean>(true);
    const [payoutNote, setPayoutNote] = useState<string>('');
    const [isExecutingPayout, setIsExecutingPayout] = useState<boolean>(false);

    const [activeReceiptModal, setActiveReceiptModal] = useState<PayoutReceipt | null>(null);
    const [viewReceiptsTranslator, setViewReceiptsTranslator] = useState<TranslatorRecord | null>(null);
    const [copied, setCopied] = useState<boolean>(false);

    const fetchOverview = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/payroll/admin-overview');
            setOverview(res.data);
        } catch (err) {
            console.error('Failed to load admin payroll overview:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOverview();
    }, []);

    // 1. Save Rate Handler
    const handleSaveRate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTranslatorForRate) return;

        try {
            await axios.post('/api/payroll/set-rate', {
                userId: selectedTranslatorForRate.userId,
                lines: rateLines,
                priceIqd: ratePriceIqd
            });
            setSelectedTranslatorForRate(null);
            fetchOverview();
        } catch (err: any) {
            alert(err.response?.data?.error || 'هەڵەیەک ڕوویدا لە دانانی نرخ');
        }
    };

    // 2. Add Advance Handler
    const handleAddAdvance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTranslatorForAdvance || advanceAmount <= 0) return;

        try {
            await axios.post('/api/payroll/add-advance', {
                userId: selectedTranslatorForAdvance.userId,
                amountIqd: advanceAmount,
                note: advanceNote
            });
            setSelectedTranslatorForAdvance(null);
            setAdvanceAmount(5000);
            setAdvanceNote('');
            fetchOverview();
        } catch (err: any) {
            alert(err.response?.data?.error || 'هەڵەیەک ڕوویدا لە تۆمارکردنی پێشەکی');
        }
    };

    // 3. Payout Handler
    const handleExecutePayout = async () => {
        if (!selectedTranslatorForPayout) return;
        setIsExecutingPayout(true);

        try {
            const res = await axios.post('/api/payroll/payout', {
                userId: selectedTranslatorForPayout.userId,
                note: payoutNote,
                deductAdvance: payoutDeductAdvance
            });

            if (res.data?.success && res.data?.receipt) {
                const receipt = res.data.receipt;
                setSelectedTranslatorForPayout(null);
                setPayoutNote('');
                // Open official receipt modal immediately
                setActiveReceiptModal(receipt);
                fetchOverview();
            }
        } catch (err: any) {
            alert(err.response?.data?.error || 'هەڵە لە پارەدان');
        } finally {
            setIsExecutingPayout(false);
        }
    };

    const handleCopyReceiptText = (r: PayoutReceipt) => {
        const text = `🧾 *وەسڵی فەرمیی شایستەی دارایی وەرگێڕان - KST Film*
━━━━━━━━━━━━━━━━━━━━
🆔 ژمارەی وەسڵ: ${r.receiptId}
👤 وەرگێڕ: ${r.name || r.username}
📅 بەروار: ${new Date(r.date).toLocaleDateString('ckb-IQ', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}

📝 دێڕی وەرگێڕدراو: ${r.linesPaid.toLocaleString()} دێڕ
🏷️ نرخ: هەر ${r.rate.lines} دێڕ = ${r.rate.priceIqd.toLocaleString()} دینار
💰 کۆی شایستە: ${r.grossAmountIqd.toLocaleString()} دیناری عێراقی
${r.advanceDeductedIqd > 0 ? `🤝 داشکاندنی پێشەکی: -${r.advanceDeductedIqd.toLocaleString()} دینار\n` : ''}💵 بڕی وەرگیراوی تەواو: ${r.netAmountPaidIqd.toLocaleString()} IQD
✍️ دراوە لەلایەن: ${r.paidBy}
📌 تێبینی: ${r.note}
━━━━━━━━━━━━━━━━━━━━
🎬 *KST Film Platform - کەی ئێس تی فیلم*`;

        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    const handlePrintReceipt = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="admin-payroll-loading">
                <RefreshCw size={32} className="spinning" color="#10b981" />
                <p>خەریکی بارکردنی داشبۆردی حیساباتی سەرۆک...</p>
            </div>
        );
    }

    if (!overview) {
        return (
            <div className="admin-payroll-empty">
                <AlertCircle size={36} color="#f59e0b" />
                <p>نەتوانرا زانیارییەکانی حیسابات باربکرێن</p>
            </div>
        );
    }

    const filteredTranslators = overview.translators.filter(t => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            t.name.toLowerCase().includes(q) ||
            t.username.toLowerCase().includes(q) ||
            t.userId.toLowerCase().includes(q)
        );
    });

    return (
        <div className="admin-payroll-page">
            {/* Top Super Admin Header */}
            <div className="admin-payroll-header">
                <div className="header-title-block">
                    <div className="icon-pill-badge">
                        <Wallet size={24} />
                    </div>
                    <div>
                        <h2>بەڕێوەبردنی حیسابات و مووچەی وەرگێڕەکان (Super Admin Payroll)</h2>
                        <p>چاودێری، دانانی نرخی دێڕ، تۆمارکردنی پێشەکی و پارەدانی فەرمی بە وەسڵی PDF</p>
                    </div>
                </div>

                <button type="button" className="btn-refresh-payroll" onClick={fetchOverview}>
                    <RefreshCw size={16} />
                    <span>نوێکردنەوەی ئامارەکان</span>
                </button>
            </div>

            {/* Boss System Summary Cards */}
            <div className="admin-payroll-metrics-grid">
                {/* Metric 1 */}
                <div className="admin-metric-card">
                    <div className="metric-header">
                        <div className="metric-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                            <Users size={22} />
                        </div>
                        <span className="metric-chip">سەرجەم وەرگێڕەکان</span>
                    </div>
                    <div className="metric-value-row">
                        <span className="metric-big-num">{overview.systemStats.totalTranslators}</span>
                        <span className="metric-unit">وەرگێڕ / ئەدمین</span>
                    </div>
                </div>

                {/* Metric 2 */}
                <div className="admin-metric-card">
                    <div className="metric-header">
                        <div className="metric-icon" style={{ background: 'rgba(250, 204, 21, 0.15)', color: '#facc15' }}>
                            <Clock size={22} />
                        </div>
                        <span className="metric-chip">کۆی دێڕە نەدراوەکان</span>
                    </div>
                    <div className="metric-value-row">
                        <span className="metric-big-num">{overview.systemStats.totalUnpaidLines.toLocaleString()}</span>
                        <span className="metric-unit">دێڕی کارپێکراو</span>
                    </div>
                </div>

                {/* Metric 3 */}
                <div className="admin-metric-card highlight-metric">
                    <div className="metric-header">
                        <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                            <DollarSign size={22} />
                        </div>
                        <span className="metric-chip green">کۆی پارەی شایستە بۆ دان</span>
                    </div>
                    <div className="metric-value-row">
                        <span className="metric-big-num text-green">{overview.systemStats.totalEstimatedIqd.toLocaleString()}</span>
                        <span className="metric-unit">IQD</span>
                    </div>
                </div>

                {/* Metric 4 */}
                <div className="admin-metric-card">
                    <div className="metric-header">
                        <div className="metric-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                            <CheckCircle size={22} />
                        </div>
                        <span className="metric-chip">کۆی پارەی دراو لە مێژوودا</span>
                    </div>
                    <div className="metric-value-row">
                        <span className="metric-big-num">{overview.systemStats.totalPaidIqd.toLocaleString()}</span>
                        <span className="metric-unit">IQD</span>
                    </div>
                </div>
            </div>

            {/* Translators Table Section */}
            <div className="admin-payroll-table-container">
                <div className="table-top-toolbar">
                    <div className="search-input-wrap">
                        <Search size={16} color="#94a3b8" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="گەڕان بەپێی ناوی وەرگێڕ یان یوزەرنەیم..."
                        />
                    </div>
                    <div className="translators-count-tag">
                        <span>{filteredTranslators.length} وەرگێڕ دۆزرایەوە</span>
                    </div>
                </div>

                <div className="table-scroll-wrap">
                    <table className="admin-payroll-table">
                        <thead>
                            <tr>
                                <th>وەرگێڕ / ئەدمین</th>
                                <th>نرخی دیاریکراو</th>
                                <th>دێڕە کارپێکراوەکان</th>
                                <th>شایستەی دارایی (IQD)</th>
                                <th>پێشەکییەکان</th>
                                <th>ماوە بۆ دان (Net)</th>
                                <th>کۆی دێڕ لەمێژوودا</th>
                                <th>کردارەکانی سەرۆک</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTranslators.map(t => {
                                const hasPendingLines = t.unpaidLines > 0;
                                return (
                                    <tr key={t.userId} className={hasPendingLines ? 'row-pending-work' : ''}>
                                        <td className="translator-user-cell">
                                            <div className="user-avatar-badge">
                                                {t.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="user-details">
                                                <strong>{t.name}</strong>
                                                <span>@{t.username} • <span className="role-tag">{t.role}</span></span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="rate-cell-badge" onClick={() => {
                                                setSelectedTranslatorForRate(t);
                                                setRateLines(t.rate?.lines || 600);
                                                setRatePriceIqd(t.rate?.priceIqd || 1500);
                                            }} title="کلیک بکە بۆ گۆڕینی نرخ">
                                                <span>{t.rate?.priceIqd.toLocaleString()} د.ع / {t.rate?.lines} دێڕ</span>
                                                <Edit2 size={12} />
                                            </div>
                                        </td>
                                        <td>
                                            <strong className="unpaid-lines-val">{t.unpaidLines.toLocaleString()} دێڕ</strong>
                                        </td>
                                        <td>
                                            <strong className="estimated-iqd-val">{t.estimatedEarningsIqd.toLocaleString()} IQD</strong>
                                        </td>
                                        <td>
                                            {t.totalAdvanceIqd > 0 ? (
                                                <span className="advance-tag-badge">-{t.totalAdvanceIqd.toLocaleString()} IQD</span>
                                            ) : (
                                                <span className="no-advance-tag">٠ IQD</span>
                                            )}
                                        </td>
                                        <td>
                                            <strong className="net-payable-val">{t.netPayableIqd.toLocaleString()} IQD</strong>
                                        </td>
                                        <td>
                                            <span className="lifetime-lines-tag">{t.totalEditedLines.toLocaleString()} دێڕ</span>
                                        </td>
                                        <td>
                                            <div className="admin-actions-cell">
                                                {/* Payout Button */}
                                                <button
                                                    type="button"
                                                    className="btn-admin-action payout"
                                                    disabled={t.unpaidLines <= 0}
                                                    onClick={() => {
                                                        setSelectedTranslatorForPayout(t);
                                                        setPayoutDeductAdvance(t.totalAdvanceIqd > 0);
                                                        setPayoutNote(`پارەدانی ${t.unpaidLines} دێڕی وەرگێڕان`);
                                                    }}
                                                    title={t.unpaidLines > 0 ? "پارەدان و سفرکردنەوەی باڵانس" : "هیچ دێڕێکی نوێ نییە بۆ پارەدان"}
                                                >
                                                    <DollarSign size={14} />
                                                    <span>پارەدان 💵</span>
                                                </button>

                                                {/* Add Advance Button */}
                                                <button
                                                    type="button"
                                                    className="btn-admin-action advance"
                                                    onClick={() => {
                                                        setSelectedTranslatorForAdvance(t);
                                                        setAdvanceAmount(5000);
                                                        setAdvanceNote('');
                                                    }}
                                                    title="تۆمارکردنی پێشەکی"
                                                >
                                                    <Plus size={14} />
                                                    <span>پێشەکی 🤝</span>
                                                </button>

                                                {/* Receipts History */}
                                                <button
                                                    type="button"
                                                    className="btn-admin-action receipts"
                                                    onClick={() => setViewReceiptsTranslator(t)}
                                                    title="بینینی وەسڵە کۆنەکان"
                                                >
                                                    <FileText size={14} />
                                                    <span>وەسڵەکان ({t.payoutCount})</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL 1: Set Custom Rate */}
            {selectedTranslatorForRate && (
                <div className="payroll-modal-overlay" onClick={() => setSelectedTranslatorForRate(null)}>
                    <div className="payroll-modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>⚙️ دانانی نرخی تایبەت بۆ ({selectedTranslatorForRate.name})</h3>
                            <button type="button" className="btn-modal-close" onClick={() => setSelectedTranslatorForRate(null)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaveRate} className="modal-body-form">
                            <p className="modal-desc">تۆ (سەرۆک) دەتوانیت نرخی وەرگێڕان بەپێی ژمارەی دێڕ بۆ ئەم وەرگێڕە دیاری بکەیت:</p>

                            <div className="form-group-row">
                                <div className="form-field">
                                    <label>ژمارەی دێڕ:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={rateLines}
                                        onChange={e => setRateLines(Math.max(1, parseInt(e.target.value) || 0))}
                                        required
                                    />
                                    <span className="field-hint">بۆ نموونە: 600 یان 300</span>
                                </div>

                                <div className="form-field">
                                    <label>بڕی پارە (دیناری عێراقی IQD):</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="250"
                                        value={ratePriceIqd}
                                        onChange={e => setRatePriceIqd(Math.max(0, parseInt(e.target.value) || 0))}
                                        required
                                    />
                                    <span className="field-hint">بۆ نموونە: 1500 یان 1000 دینار</span>
                                </div>
                            </div>

                            <div className="rate-preview-card">
                                <span>تێکرای هەر دێڕێک: </span>
                                <strong>{(ratePriceIqd / (rateLines || 1)).toFixed(2)} IQD بۆ هەر ١ دێڕ</strong>
                            </div>

                            <div className="modal-footer-actions">
                                <button type="submit" className="btn-modal-save">پاشەکەوتکردنی نرخ ✓</button>
                                <button type="button" className="btn-modal-cancel" onClick={() => setSelectedTranslatorForRate(null)}>پاشگەزبوونەوە</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: Add Advance Payment */}
            {selectedTranslatorForAdvance && (
                <div className="payroll-modal-overlay" onClick={() => setSelectedTranslatorForAdvance(null)}>
                    <div className="payroll-modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>🤝 تۆمارکردنی پێشەکی بۆ ({selectedTranslatorForAdvance.name})</h3>
                            <button type="button" className="btn-modal-close" onClick={() => setSelectedTranslatorForAdvance(null)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAddAdvance} className="modal-body-form">
                            <p className="modal-desc">ئەگەر پارەی پێشوەختەت بەم وەرگێڕە داوە، لێرە تۆماری بکە تا کاتی پارەدان خۆکارانە لێی ببڕدرێت:</p>

                            <div className="form-field">
                                <label>بڕی پێشەکی (دیناری عێراقی):</label>
                                <input
                                    type="number"
                                    min="500"
                                    step="500"
                                    value={advanceAmount}
                                    onChange={e => setAdvanceAmount(Math.max(0, parseInt(e.target.value) || 0))}
                                    required
                                />
                            </div>

                            <div className="form-field">
                                <label>تێبینی / بۆچی دراوە:</label>
                                <input
                                    type="text"
                                    value={advanceNote}
                                    onChange={e => setAdvanceNote(e.target.value)}
                                    placeholder="وەک: پێشەکی بۆ سەبتایتڵی فیلمی..."
                                />
                            </div>

                            <div className="modal-footer-actions">
                                <button type="submit" className="btn-modal-save">تۆمارکردنی پێشەکی ✓</button>
                                <button type="button" className="btn-modal-cancel" onClick={() => setSelectedTranslatorForAdvance(null)}>پاشگەزبوونەوە</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 3: Payout & Reset */}
            {selectedTranslatorForPayout && (
                <div className="payroll-modal-overlay" onClick={() => setSelectedTranslatorForPayout(null)}>
                    <div className="payroll-modal-box payout-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>💵 پارەدان و سفرکردنەوەی ({selectedTranslatorForPayout.name})</h3>
                            <button type="button" className="btn-modal-close" onClick={() => setSelectedTranslatorForPayout(null)}><X size={18} /></button>
                        </div>
                        <div className="modal-body-form">
                            <p className="modal-desc">بە پەسەندکردنی ئەم پارەدانە، دێڕەکانی ئەم وەرگێڕە دەبێتەوە **سفر** و وەسڵێکی فەرمی دروست دەبێت:</p>

                            {/* Payout Calculation breakdown */}
                            <div className="payout-summary-box">
                                <div className="payout-row">
                                    <span>ژمارەی دێڕە نەدراوەکان:</span>
                                    <strong>{selectedTranslatorForPayout.unpaidLines.toLocaleString()} دێڕ</strong>
                                </div>
                                <div className="payout-row">
                                    <span>نرخی کار:</span>
                                    <span>هەر {selectedTranslatorForPayout.rate?.lines} دێڕ = {selectedTranslatorForPayout.rate?.priceIqd.toLocaleString()} IQD</span>
                                </div>
                                <div className="payout-row">
                                    <span>کۆی شایستەی دارایی بنەڕەتی:</span>
                                    <strong>{selectedTranslatorForPayout.estimatedEarningsIqd.toLocaleString()} IQD</strong>
                                </div>

                                {selectedTranslatorForPayout.totalAdvanceIqd > 0 && (
                                    <div className="advance-deduct-option">
                                        <label className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={payoutDeductAdvance}
                                                onChange={e => setPayoutDeductAdvance(e.target.checked)}
                                            />
                                            <span>داشکاندنی پێشەکی ({selectedTranslatorForPayout.totalAdvanceIqd.toLocaleString()} IQD) لەم پارەیە</span>
                                        </label>
                                    </div>
                                )}

                                <div className="payout-row total-highlight">
                                    <span>کۆی بڕی پارەی دراو (Net Paid):</span>
                                    <strong className="grand-payout-num">
                                        {(payoutDeductAdvance 
                                            ? Math.max(0, selectedTranslatorForPayout.estimatedEarningsIqd - selectedTranslatorForPayout.totalAdvanceIqd) 
                                            : selectedTranslatorForPayout.estimatedEarningsIqd
                                        ).toLocaleString()} IQD
                                    </strong>
                                </div>
                            </div>

                            <div className="form-field">
                                <label>تێبینی بۆ وەسڵەکە (ئارەزوومەندانە):</label>
                                <input
                                    type="text"
                                    value={payoutNote}
                                    onChange={e => setPayoutNote(e.target.value)}
                                    placeholder="وەک: پارەدانی تەواوی مانگی ٩"
                                />
                            </div>

                            <div className="modal-footer-actions">
                                <button
                                    type="button"
                                    className="btn-modal-payout-confirm"
                                    disabled={isExecutingPayout}
                                    onClick={handleExecutePayout}
                                >
                                    {isExecutingPayout ? <RefreshCw size={16} className="spinning" /> : <CheckCircle size={16} />}
                                    <span>تەئکیدکردنەوە و سفرکردنەوە 💵✓</span>
                                </button>
                                <button type="button" className="btn-modal-cancel" onClick={() => setSelectedTranslatorForPayout(null)}>پاشگەزبوونەوە</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 4: Translator Receipts History Drawer */}
            {viewReceiptsTranslator && (
                <div className="payroll-modal-overlay" onClick={() => setViewReceiptsTranslator(null)}>
                    <div className="payroll-modal-box large-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>📜 مێژووی وەسڵەکانی ({viewReceiptsTranslator.name})</h3>
                            <button type="button" className="btn-modal-close" onClick={() => setViewReceiptsTranslator(null)}><X size={18} /></button>
                        </div>
                        <div className="modal-body-content">
                            {viewReceiptsTranslator.payoutHistory.length === 0 ? (
                                <div className="empty-sub-receipts">
                                    <FileText size={36} color="#64748b" />
                                    <p>هیچ وەسڵێکی پێشوو بۆ ئەم وەرگێڕە نییە</p>
                                </div>
                            ) : (
                                <table className="admin-sub-receipts-table">
                                    <thead>
                                        <tr>
                                            <th>ژمارەی وەسڵ</th>
                                            <th>بەروار</th>
                                            <th>دێڕی کارکراو</th>
                                            <th>کۆی بڕ</th>
                                            <th>پێشەکی</th>
                                            <th>دراوە (Net)</th>
                                            <th>کردار</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {viewReceiptsTranslator.payoutHistory.map(r => (
                                            <tr key={r.receiptId}>
                                                <td><code>{r.receiptId}</code></td>
                                                <td>{new Date(r.date).toLocaleDateString('ckb-IQ')}</td>
                                                <td><strong>{r.linesPaid.toLocaleString()} دێڕ</strong></td>
                                                <td>{r.grossAmountIqd.toLocaleString()} IQD</td>
                                                <td>{r.advanceDeductedIqd > 0 ? `-${r.advanceDeductedIqd.toLocaleString()} IQD` : '—'}</td>
                                                <td><strong style={{ color: '#34d399' }}>{r.netAmountPaidIqd.toLocaleString()} IQD</strong></td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="btn-view-receipt-action"
                                                        onClick={() => setActiveReceiptModal(r)}
                                                    >
                                                        <Eye size={14} />
                                                        <span>بینین / PDF</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 5: Official Printable PDF Receipt Sheet */}
            {activeReceiptModal && (
                <div className="receipt-modal-backdrop" onClick={() => setActiveReceiptModal(null)}>
                    <div className="receipt-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="official-receipt-sheet" id="official-printable-receipt">
                            <div className="receipt-header-row">
                                <div className="receipt-brand">
                                    <div className="kst-logo-badge">KST</div>
                                    <div className="brand-text">
                                        <h3>KST Film Platform</h3>
                                        <p>وەسڵی فەرمیی شایستەی دارایی وەرگێڕان</p>
                                    </div>
                                </div>
                                <div className="receipt-meta-box">
                                    <div className="meta-line"><strong>ژمارەی وەسڵ:</strong> <code>{activeReceiptModal.receiptId}</code></div>
                                    <div className="meta-line"><strong>بەروار:</strong> {new Date(activeReceiptModal.date).toLocaleDateString('ckb-IQ', { year: 'numeric', month: 'numeric', day: 'numeric' })}</div>
                                </div>
                            </div>

                            <hr className="receipt-divider" />

                            <div className="receipt-info-grid">
                                <div className="info-box">
                                    <span className="info-label">ناوی وەرگێڕ:</span>
                                    <span className="info-value">{activeReceiptModal.name || activeReceiptModal.username}</span>
                                </div>
                                <div className="info-box">
                                    <span className="info-label">نازناو (Username):</span>
                                    <span className="info-value">@{activeReceiptModal.username}</span>
                                </div>
                                <div className="info-box">
                                    <span className="info-label">نرخی کار:</span>
                                    <span className="info-value">هەر {activeReceiptModal.rate?.lines} دێڕ = {activeReceiptModal.rate?.priceIqd.toLocaleString()} IQD</span>
                                </div>
                                <div className="info-box">
                                    <span className="info-label">دراوە لەلایەن:</span>
                                    <span className="info-value">{activeReceiptModal.paidBy}</span>
                                </div>
                            </div>

                            {activeReceiptModal.movieBreakdown && activeReceiptModal.movieBreakdown.length > 0 && (
                                <div className="receipt-movie-breakdown">
                                    <h4>وردەکاریی فیلمە وەرگێڕدراوەکان لەم خولەدا:</h4>
                                    <table className="receipt-sub-table">
                                        <thead>
                                            <tr>
                                                <th>ناوی فیلم / زنجیرە</th>
                                                <th>ژمارەی دێڕ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeReceiptModal.movieBreakdown.map((m, idx) => (
                                                <tr key={idx}>
                                                    <td>{m.title}</td>
                                                    <td><strong>{m.lines.toLocaleString()} دێڕ</strong></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="receipt-financial-summary">
                                <div className="summary-row">
                                    <span>کۆی گشتیی دێڕە کارپێکراوەکان:</span>
                                    <strong>{activeReceiptModal.linesPaid.toLocaleString()} دێڕ</strong>
                                </div>
                                <div className="summary-row">
                                    <span>کۆی شایستەی دارایی بنەڕەتی:</span>
                                    <strong>{activeReceiptModal.grossAmountIqd.toLocaleString()} IQD</strong>
                                </div>
                                {activeReceiptModal.advanceDeductedIqd > 0 && (
                                    <div className="summary-row deduction">
                                        <span>داشکاندنی پارەی پێشەکی:</span>
                                        <strong>-{activeReceiptModal.advanceDeductedIqd.toLocaleString()} IQD</strong>
                                    </div>
                                )}
                                <div className="summary-row grand-total">
                                    <span>بڕی پارەی تەواوی دراو (Net Paid):</span>
                                    <span className="total-amount-pill">{activeReceiptModal.netAmountPaidIqd.toLocaleString()} IQD</span>
                                </div>
                            </div>

                            <div className="receipt-footer-signatures">
                                <div className="sig-block">
                                    <span>مۆری ڕێگەپێدان و پەسەندکردن</span>
                                    <div className="official-stamp-badge">
                                        <ShieldCheck size={18} />
                                        <span>KST FILM • VERIFIED</span>
                                    </div>
                                </div>
                                <div className="sig-block">
                                    <span>تێبینی:</span>
                                    <p className="note-text">{activeReceiptModal.note || 'پارەدانی تەواو کراوە بە سەرکەوتوویی'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="receipt-modal-actions no-print">
                            <button type="button" className="btn-receipt-action print" onClick={handlePrintReceipt}>
                                <Printer size={16} />
                                <span>چاپکردن / PDF 🖨️</span>
                            </button>

                            <button type="button" className="btn-receipt-action copy" onClick={() => handleCopyReceiptText(activeReceiptModal)}>
                                {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                                <span>{copied ? 'کۆپیکرا! ✓' : 'کۆپیکردنی دەق بۆ تێلیگرام 📋'}</span>
                            </button>

                            <button type="button" className="btn-receipt-action close" onClick={() => setActiveReceiptModal(null)}>
                                <span>داخستن</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
