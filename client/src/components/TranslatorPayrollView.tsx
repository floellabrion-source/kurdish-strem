import React, { useState, useEffect } from 'react';
import axios from '../api/client';
import { 
    Wallet, FileText, CheckCircle, Clock, ArrowDownCircle, 
    Printer, Share2, Copy, Check, Eye, AlertCircle, RefreshCw,
    TrendingUp, Calendar, Film, ShieldCheck, Download
} from 'lucide-react';
import './TranslatorPayrollView.css';

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

interface LineEditEntry {
    id: string;
    movieId: string;
    movieTitle: string;
    seasonNum?: number | null;
    episodeNum?: number | null;
    subtitleId: string;
    charDiff: number;
    timestamp: number;
    isPaid: boolean;
    payoutReceiptId: string | null;
}

interface PayrollStats {
    userId: string;
    username: string;
    name: string;
    rate: { lines: number; priceIqd: number };
    unpaidLines: number;
    totalEditedLines: number;
    estimatedEarningsIqd: number;
    totalAdvanceIqd: number;
    netPayableIqd: number;
    advances: { id: string; amountIqd: number; note: string; date: string; paidBy: string }[];
    payoutHistory: PayoutReceipt[];
    recentEdits: LineEditEntry[];
}

export default function TranslatorPayrollView() {
    const [stats, setStats] = useState<PayrollStats | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [activeSubTab, setActiveSubTab] = useState<'receipts' | 'edits' | 'advances'>('receipts');
    const [selectedReceipt, setSelectedReceipt] = useState<PayoutReceipt | null>(null);
    const [copied, setCopied] = useState<boolean>(false);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/payroll/my-stats');
            setStats(res.data);
        } catch (err) {
            console.error('Failed to load payroll stats:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

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
            <div className="payroll-loading-wrap">
                <RefreshCw size={28} className="spinning" color="#10b981" />
                <p>خەریکی بارکردنی حیساباتی وەرگێڕان...</p>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="payroll-empty-state">
                <AlertCircle size={32} color="#f59e0b" />
                <p>هیچ زانیارییەکی حیسابات بەردەست نییە</p>
            </div>
        );
    }

    const rate = stats.rate || { lines: 600, priceIqd: 1500 };

    return (
        <div className="translator-payroll-container">
            {/* Top Overview Cards */}
            <div className="payroll-hero-cards-grid">
                {/* Card 1: Unpaid Lines & Estimated Earnings */}
                <div className="payroll-stat-card card-highlight">
                    <div className="card-top">
                        <div className="stat-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                            <Wallet size={22} />
                        </div>
                        <span className="pill-badge-green">شایستەی ئێستا</span>
                    </div>
                    <div className="card-val-row">
                        <span className="card-big-num">{stats.unpaidLines.toLocaleString()}</span>
                        <span className="card-unit">دێڕی کارپێکراو</span>
                    </div>
                    <div className="card-sub-iqd">
                        <span>بڕی شایستە: </span>
                        <strong className="iqd-highlight">{stats.estimatedEarningsIqd.toLocaleString()} IQD</strong>
                    </div>
                </div>

                {/* Card 2: Custom Rate */}
                <div className="payroll-stat-card">
                    <div className="card-top">
                        <div className="stat-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                            <TrendingUp size={22} />
                        </div>
                        <span className="pill-badge-blue">نرخی دیاریکراوت</span>
                    </div>
                    <div className="card-val-row">
                        <span className="card-big-num">{rate.priceIqd.toLocaleString()}</span>
                        <span className="card-unit">دینار / {rate.lines} دێڕ</span>
                    </div>
                    <div className="card-sub-iqd">
                        <span>تێکرای هەر دێڕێک: </span>
                        <strong>{(rate.priceIqd / rate.lines).toFixed(2)} IQD</strong>
                    </div>
                </div>

                {/* Card 3: Net Payable after Advance */}
                <div className="payroll-stat-card">
                    <div className="card-top">
                        <div className="stat-icon-wrap" style={{ background: 'rgba(250, 204, 21, 0.2)', color: '#facc15' }}>
                            <ArrowDownCircle size={22} />
                        </div>
                        <span className="pill-badge-yellow">ماوە بۆ وەرگرتن</span>
                    </div>
                    <div className="card-val-row">
                        <span className="card-big-num" style={{ color: '#fde047' }}>{stats.netPayableIqd.toLocaleString()}</span>
                        <span className="card-unit">IQD</span>
                    </div>
                    <div className="card-sub-iqd">
                        <span>پێشەکی وەرگیراو: </span>
                        <strong style={{ color: stats.totalAdvanceIqd > 0 ? '#f87171' : '#94a3b8' }}>{stats.totalAdvanceIqd.toLocaleString()} IQD</strong>
                    </div>
                </div>

                {/* Card 4: Lifetime Total Lines */}
                <div className="payroll-stat-card">
                    <div className="card-top">
                        <div className="stat-icon-wrap" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
                            <FileText size={22} />
                        </div>
                        <span className="pill-badge-purple">کۆی گشتی ژیان</span>
                    </div>
                    <div className="card-val-row">
                        <span className="card-big-num">{stats.totalEditedLines.toLocaleString()}</span>
                        <span className="card-unit">دێڕ لەمێژوودا</span>
                    </div>
                    <div className="card-sub-iqd">
                        <span>وەسڵە پارەدراوەکان: </span>
                        <strong>{stats.payoutHistory.length} وەسڵ</strong>
                    </div>
                </div>
            </div>

            {/* Sub-tabs Navigation */}
            <div className="payroll-subtabs-nav">
                <button 
                    type="button" 
                    className={`payroll-tab-btn ${activeSubTab === 'receipts' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('receipts')}
                >
                    <FileText size={16} />
                    <span>مێژووی وەسڵە فەرمییەکان ({stats.payoutHistory.length})</span>
                </button>

                <button 
                    type="button" 
                    className={`payroll-tab-btn ${activeSubTab === 'edits' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('edits')}
                >
                    <Clock size={16} />
                    <span>دوایین دێڕە کارپێکراوەکان ({stats.recentEdits.length})</span>
                </button>

                <button 
                    type="button" 
                    className={`payroll-tab-btn ${activeSubTab === 'advances' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('advances')}
                >
                    <ArrowDownCircle size={16} />
                    <span>پێشەکییەکان ({stats.advances.length})</span>
                </button>
            </div>

            {/* Tab 1: Payout Receipts History */}
            {activeSubTab === 'receipts' && (
                <div className="payroll-table-section">
                    {stats.payoutHistory.length === 0 ? (
                        <div className="payroll-empty-table">
                            <FileText size={40} color="#64748b" />
                            <h4>هێشتا هیچ وەسڵێکی پارەدان نییە</h4>
                            <p>کاتێک سەرۆک شایستەی دێڕەکانت دەدات، لێرە وەسڵی فەرمی لەگەڵ دابەزاندنی PDF ئەرشیف دەبێت.</p>
                        </div>
                    ) : (
                        <div className="table-responsive-wrapper">
                            <table className="payroll-modern-table">
                                <thead>
                                    <tr>
                                        <th>ژمارەی وەسڵ</th>
                                        <th>بەروار</th>
                                        <th>دێڕی کارکراو</th>
                                        <th>کۆی بڕ (IQD)</th>
                                        <th>پێشەکی</th>
                                        <th>بڕی دراو (Net)</th>
                                        <th>دراوە لەلایەن</th>
                                        <th>کردار</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.payoutHistory.map((r) => (
                                        <tr key={r.receiptId}>
                                            <td className="receipt-id-cell">
                                                <code>{r.receiptId}</code>
                                            </td>
                                            <td>{new Date(r.date).toLocaleDateString('ckb-IQ', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                            <td><strong>{r.linesPaid.toLocaleString()} دێڕ</strong></td>
                                            <td>{r.grossAmountIqd.toLocaleString()} IQD</td>
                                            <td>{r.advanceDeductedIqd > 0 ? `-${r.advanceDeductedIqd.toLocaleString()} IQD` : '—'}</td>
                                            <td><strong className="net-paid-cell">{r.netAmountPaidIqd.toLocaleString()} IQD</strong></td>
                                            <td>{r.paidBy}</td>
                                            <td>
                                                <button 
                                                    type="button" 
                                                    className="btn-view-receipt"
                                                    onClick={() => setSelectedReceipt(r)}
                                                >
                                                    <Eye size={14} />
                                                    <span>بینینی وەسڵ</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Tab 2: Recent Line Edits Log */}
            {activeSubTab === 'edits' && (
                <div className="payroll-table-section">
                    <div className="table-responsive-wrapper">
                        <table className="payroll-modern-table">
                            <thead>
                                <tr>
                                    <th>فیلم / زنجیرە</th>
                                    <th>ژمارەی دێڕ</th>
                                    <th>گۆڕانکاری پیت</th>
                                    <th>کات</th>
                                    <th>دۆخی حیسابات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentEdits.map((e) => (
                                    <tr key={e.id}>
                                        <td className="movie-title-cell">
                                            <Film size={14} color="#38bdf8" />
                                            <span>{e.movieTitle} {e.seasonNum ? `(S${e.seasonNum}E${e.episodeNum})` : ''}</span>
                                        </td>
                                        <td><strong>دێڕی #{e.subtitleId}</strong></td>
                                        <td><span className="badge-char-diff">+{e.charDiff} پیت</span></td>
                                        <td>{new Date(e.timestamp).toLocaleString('ckb-IQ', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</td>
                                        <td>
                                            {e.isPaid ? (
                                                <span className="status-badge paid">✓ دراوە ({e.payoutReceiptId})</span>
                                            ) : (
                                                <span className="status-badge unpaid">⏳ نەدراوە (کارپێکراو)</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tab 3: Advances */}
            {activeSubTab === 'advances' && (
                <div className="payroll-table-section">
                    {stats.advances.length === 0 ? (
                        <div className="payroll-empty-table">
                            <CheckCircle size={40} color="#10b981" />
                            <h4>هیچ قەرز یان پێشەکییەکت نییە</h4>
                            <p>هەموو شایستە داراییەکانت بەبێ هیچ لێبڕینێکی پێشەکی هەژمار دەکرێن.</p>
                        </div>
                    ) : (
                        <div className="table-responsive-wrapper">
                            <table className="payroll-modern-table">
                                <thead>
                                    <tr>
                                        <th>بڕی پێشەکی</th>
                                        <th>تێبینی / هۆکار</th>
                                        <th>بەروار</th>
                                        <th>تۆمارکراوە لەلایەن</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.advances.map((a) => (
                                        <tr key={a.id}>
                                            <td><strong style={{ color: '#f87171' }}>{a.amountIqd.toLocaleString()} IQD</strong></td>
                                            <td>{a.note || 'پێشەکی'}</td>
                                            <td>{new Date(a.date).toLocaleDateString('ckb-IQ', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                                            <td>{a.paidBy}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Official Printable Receipt Modal */}
            {selectedReceipt && (
                <div className="receipt-modal-backdrop" onClick={() => setSelectedReceipt(null)}>
                    <div className="receipt-modal-card" onClick={e => e.stopPropagation()}>
                        {/* Printable Area */}
                        <div className="official-receipt-sheet" id="official-printable-receipt">
                            {/* Watermark / Header */}
                            <div className="receipt-header-row">
                                <div className="receipt-brand">
                                    <div className="kst-logo-badge">KST</div>
                                    <div className="brand-text">
                                        <h3>KST Film Platform</h3>
                                        <p>وەسڵی فەرمیی شایستەی دارایی وەرگێڕان</p>
                                    </div>
                                </div>
                                <div className="receipt-meta-box">
                                    <div className="meta-line"><strong>ژمارەی وەسڵ:</strong> <code>{selectedReceipt.receiptId}</code></div>
                                    <div className="meta-line"><strong>بەروار:</strong> {new Date(selectedReceipt.date).toLocaleDateString('ckb-IQ', { year: 'numeric', month: 'numeric', day: 'numeric' })}</div>
                                </div>
                            </div>

                            <hr className="receipt-divider" />

                            {/* Translator Info */}
                            <div className="receipt-info-grid">
                                <div className="info-box">
                                    <span className="info-label">ناوی وەرگێڕ:</span>
                                    <span className="info-value">{selectedReceipt.name || selectedReceipt.username}</span>
                                </div>
                                <div className="info-box">
                                    <span className="info-label">نازناو (Username):</span>
                                    <span className="info-value">@{selectedReceipt.username}</span>
                                </div>
                                <div className="info-box">
                                    <span className="info-label">نرخی کار:</span>
                                    <span className="info-value">هەر {selectedReceipt.rate.lines} دێڕ = {selectedReceipt.rate.priceIqd.toLocaleString()} IQD</span>
                                </div>
                                <div className="info-box">
                                    <span className="info-label">دراوە لەلایەن:</span>
                                    <span className="info-value">{selectedReceipt.paidBy}</span>
                                </div>
                            </div>

                            {/* Movie Breakdown if available */}
                            {selectedReceipt.movieBreakdown && selectedReceipt.movieBreakdown.length > 0 && (
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
                                            {selectedReceipt.movieBreakdown.map((m, idx) => (
                                                <tr key={idx}>
                                                    <td>{m.title}</td>
                                                    <td><strong>{m.lines.toLocaleString()} دێڕ</strong></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Calculations Table */}
                            <div className="receipt-financial-summary">
                                <div className="summary-row">
                                    <span>کۆی گشتیی دێڕە کارپێکراوەکان:</span>
                                    <strong>{selectedReceipt.linesPaid.toLocaleString()} دێڕ</strong>
                                </div>
                                <div className="summary-row">
                                    <span>کۆی شایستەی دارایی بنەڕەتی:</span>
                                    <strong>{selectedReceipt.grossAmountIqd.toLocaleString()} IQD</strong>
                                </div>
                                {selectedReceipt.advanceDeductedIqd > 0 && (
                                    <div className="summary-row deduction">
                                        <span>داشکاندنی پارەی پێشەکی:</span>
                                        <strong>-{selectedReceipt.advanceDeductedIqd.toLocaleString()} IQD</strong>
                                    </div>
                                )}
                                <div className="summary-row grand-total">
                                    <span>بڕی پارەی تەواوی وەرگیراو:</span>
                                    <span className="total-amount-pill">{selectedReceipt.netAmountPaidIqd.toLocaleString()} IQD</span>
                                </div>
                            </div>

                            {/* Stamp & Verification */}
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
                                    <p className="note-text">{selectedReceipt.note || 'پارەدانی تەواو کراوە بە سەرکەوتوویی'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Action Buttons */}
                        <div className="receipt-modal-actions no-print">
                            <button type="button" className="btn-receipt-action print" onClick={handlePrintReceipt}>
                                <Printer size={16} />
                                <span>چاپکردن / PDF 🖨️</span>
                            </button>

                            <button type="button" className="btn-receipt-action copy" onClick={() => handleCopyReceiptText(selectedReceipt)}>
                                {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                                <span>{copied ? 'کۆپیکرا! ✓' : 'کۆپیکردنی دەق بۆ تێلیگرام 📋'}</span>
                            </button>

                            <button type="button" className="btn-receipt-action close" onClick={() => setSelectedReceipt(null)}>
                                <span>داخستن</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
