import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api/client';
import {
    Activity, Trophy, Medal, Award, Star, Search, Filter,
    CheckCircle, XCircle, Trash2, Clock, User, Film,
    Languages, CreditCard, Shield, Sparkles, Loader2, ArrowUpRight,
    Flame, ShieldCheck, AlertTriangle, AlertOctagon, Package,
    RefreshCw, Globe, Smartphone, Monitor, ChevronDown, ChevronUp,
    Key, UserCheck, UserX, Info, Database
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './AdminActivityLog.css';

export interface ActivityLogItem {
    id: string;
    eventType: string;
    category?: 'security' | 'pricing' | 'content' | 'billing' | 'glossary' | 'system';
    status?: 'success' | 'warning' | 'error' | 'info';
    admin: {
        id: string;
        username: string;
        role: string;
    };
    target?: {
        id?: string;
        title?: string;
        type?: string;
        seasonNum?: number;
        episodeNum?: number;
    };
    details?: any;
    ip?: string;
    userAgent?: string;
    location?: {
        city: string;
        country: string;
        flag: string;
        isKurdish?: boolean;
        isp?: string;
    };
    timestamp: string;
}

export default function AdminActivityLog() {
    const { user } = useAuth();
    const { lang } = useLanguage();

    // Feed state
    const [logs, setLogs] = useState<ActivityLogItem[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const res = await axios.get('/api/admin/activity-logs', {
                params: {
                    category: filterCategory !== 'all' ? filterCategory : undefined,
                    search: searchQuery || undefined,
                    limit: 200
                }
            });
            setLogs(res.data.logs || []);
        } catch (err) {
            console.error('Failed to load activity logs:', err);
        } finally {
            setLoadingLogs(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [filterCategory]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchLogs();
    };

    const handleClearLogs = async () => {
        const confirmMsg = lang === 'en'
            ? 'Are you sure you want to permanently clear all activity and security logs?'
            : 'ئایا دڵنیایت لە پاککردنەوەی تەواوی تۆماری چالاکییەکان و ئاسایش؟';
        if (!window.confirm(confirmMsg)) return;

        try {
            await axios.delete('/api/admin/activity-logs/clear');
            setLogs([]);
        } catch (err) {
            console.error('Failed to clear logs:', err);
        }
    };

    // Calculate Summary Metrics
    const metrics = useMemo(() => {
        const total = logs.length;
        const securityEvents = logs.filter(l => l.category === 'security' || l.eventType.startsWith('login_'));
        const loginSuccess = logs.filter(l => l.eventType === 'login_success').length;
        const loginFailed = logs.filter(l => l.eventType === 'login_failed' || l.eventType === 'login_blocked').length;
        const pricingActions = logs.filter(l => l.category === 'pricing' || l.eventType.startsWith('plan_')).length;
        const systemErrors = logs.filter(l => l.status === 'error' || l.category === 'system' || l.eventType.includes('error')).length;

        return {
            total,
            securityTotal: securityEvents.length,
            loginSuccess,
            loginFailed,
            pricingActions,
            systemErrors
        };
    }, [logs]);

    // Parse Device & Browser helper
    const parseDeviceInfo = (ua?: string, ip?: string) => {
        let os = 'Windows';
        let browser = 'Chrome';
        let isMobile = false;

        if (ua) {
            if (/windows nt 10\.0/i.test(ua)) os = 'Windows 10/11';
            else if (/windows nt/i.test(ua)) os = 'Windows';
            else if (/iphone/i.test(ua)) { os = 'iPhone (iOS)'; isMobile = true; }
            else if (/ipad/i.test(ua)) { os = 'iPad (iPadOS)'; isMobile = true; }
            else if (/android/i.test(ua)) { os = 'Android'; isMobile = true; }
            else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
            else if (/linux/i.test(ua)) os = 'Linux';

            if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
            else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
            else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
            else if (/safari/i.test(ua)) browser = 'Apple Safari';
            else if (/opera|opr/i.test(ua)) browser = 'Opera';
        }

        let cleanIp = ip || '';
        if (cleanIp === '::1' || cleanIp === '127.0.0.1' || cleanIp === '::ffff:127.0.0.1' || cleanIp.includes('127.0.0.1')) {
            cleanIp = 'Localhost (خۆماڵی)';
        }

        return {
            os,
            browser,
            isMobile,
            deviceTitle: isMobile ? `مۆبایل (${os})` : `کۆمپیوتەر (${os})`,
            deviceIcon: isMobile ? <Smartphone size={13} /> : <Monitor size={13} />,
            browserTitle: browser,
            cleanIp
        };
    };

    // Helper to format event badge
    const getEventBadge = (item: ActivityLogItem) => {
        const { eventType, category, status } = item;

        switch (eventType) {
            case 'login_success':
                return { label: 'چوونەژوورەوەی سەرکەوتوو', icon: <ShieldCheck size={14} />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
            case 'login_failed':
                return { label: 'شکست لە چوونەژوورەوە', icon: <AlertTriangle size={14} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
            case 'login_blocked':
                return { label: 'ئەکاونتی بلۆکراو', icon: <UserX size={14} />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
            case 'user_register':
                return { label: 'خۆتۆمارکردنی نوێ', icon: <UserCheck size={14} />, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' };
            case 'plan_create':
                return { label: 'دروستکردنی پلان', icon: <Package size={14} />, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' };
            case 'plan_edit':
                return { label: 'دەستکاریی پلان و نرخ', icon: <Package size={14} />, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
            case 'plan_delete':
                return { label: 'سڕینەوەی پلان', icon: <Trash2 size={14} />, color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' };
            case 'plan_reorder':
                return { label: 'ڕیزبەندی پلانەکان', icon: <Package size={14} />, color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' };
            case 'server_error':
                return { label: 'هەڵەی سێرڤەر', icon: <AlertOctagon size={14} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' };
            case 'subtitle_edit':
                return { label: 'دەستکاری سەبتایتڵ', icon: <Languages size={14} />, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
            case 'subtitle_restore':
                return { label: 'گەڕانەوەی سەبتایتڵ', icon: <Languages size={14} />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
            case 'movie_approve':
                return { label: 'پەسەندکردنی فیلم', icon: <CheckCircle size={14} />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
            case 'movie_reject':
                return { label: 'ڕەتکردنەوەی فیلم', icon: <XCircle size={14} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
            case 'movie_add':
                return { label: 'زیادکردنی فیلم', icon: <Film size={14} />, color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' };
            case 'episode_add':
                return { label: 'زیادکردنی ئەڵقە', icon: <Film size={14} />, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' };
            case 'receipt_approve':
                return { label: 'پەسەندی وەسڵ', icon: <CreditCard size={14} />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
            case 'receipt_reject':
                return { label: 'ڕەتی وەسڵ', icon: <CreditCard size={14} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
            case 'admin_create':
                return { label: 'دروستکردنی ئەدمین', icon: <Shield size={14} />, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' };
            case 'user_suspend':
                return { label: 'ڕاگرتنی هەژمار', icon: <UserX size={14} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
            default:
                return { label: item.target?.title || 'چالاکی', icon: <Activity size={14} />, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' };
        }
    };

    return (
        <div className={`activity-page-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {/* Header */}
            <div className="activity-page-header">
                <div className="activity-header-info">
                    <h2>
                        <ShieldCheck size={24} color="#8b5cf6" />
                        {lang === 'en' ? 'System Audit, Security & Activity Logs' : 'تۆماری ئاسایش، چاودێری و پاراستنی سیستەم'}
                    </h2>
                    <p>
                        {lang === 'en'
                            ? 'Real-time security monitoring, anti-hack tracking, login audits, and system diagnostics.'
                            : 'چاودێری وردی چوونەژوورەوە، لۆگی دژە هاک، دەستکارییەکانی نرخ و دۆخی تەندروستی سێرڤەر.'}
                    </p>
                </div>
            </div>

            {/* ACTIVITY LOG FEED */}
            <div className="activity-feed-section">
                {/* Top Security & Health Stats Grid */}
                <div className="security-stats-grid">
                        <div className="sec-stat-card">
                            <div className="sec-stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
                                <Activity size={20} />
                            </div>
                            <div className="sec-stat-info">
                                <span className="sec-stat-value">{metrics.total}</span>
                                <span className="sec-stat-label">{lang === 'en' ? 'Total Logged Events' : 'کۆی گشتی ڕووداوەکان'}</span>
                            </div>
                        </div>

                        <div className="sec-stat-card">
                            <div className="sec-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                                <ShieldCheck size={20} />
                            </div>
                            <div className="sec-stat-info">
                                <span className="sec-stat-value">{metrics.loginSuccess}</span>
                                <span className="sec-stat-label">{lang === 'en' ? 'Successful Logins' : 'چوونەژوورەوەی سەرکەوتوو'}</span>
                            </div>
                        </div>

                        <div className="sec-stat-card">
                            <div className="sec-stat-icon" style={{ background: metrics.loginFailed > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(100, 116, 139, 0.15)', color: metrics.loginFailed > 0 ? '#ef4444' : '#94a3b8' }}>
                                <AlertTriangle size={20} />
                            </div>
                            <div className="sec-stat-info">
                                <span className="sec-stat-value" style={{ color: metrics.loginFailed > 0 ? '#f87171' : undefined }}>{metrics.loginFailed}</span>
                                <span className="sec-stat-label">{lang === 'en' ? 'Failed Login Attempts' : 'هەوڵی شکستی چوونەژوورەوە'}</span>
                            </div>
                        </div>

                        <div className="sec-stat-card">
                            <div className="sec-stat-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                                <Package size={20} />
                            </div>
                            <div className="sec-stat-info">
                                <span className="sec-stat-value">{metrics.pricingActions}</span>
                                <span className="sec-stat-label">{lang === 'en' ? 'Pricing & Plan Edits' : 'دەستکارییەکانی نرخ و پلان'}</span>
                            </div>
                        </div>

                        <div className="sec-stat-card">
                            <div className="sec-stat-icon" style={{ background: metrics.systemErrors > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)', color: metrics.systemErrors > 0 ? '#ef4444' : '#10b981' }}>
                                <AlertOctagon size={20} />
                            </div>
                            <div className="sec-stat-info">
                                <span className="sec-stat-value" style={{ color: metrics.systemErrors > 0 ? '#f87171' : '#10b981' }}>{metrics.systemErrors}</span>
                                <span className="sec-stat-label">{lang === 'en' ? 'Server Errors' : metrics.systemErrors === 0 ? 'سێرڤەر ١٠٠٪ پارێزراوە' : 'هەڵەکانی سێرڤەر'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Filters Bar */}
                    <div className="feed-filters-bar">
                        <div className="feed-filter-chips">
                            {[
                                { id: 'all', label: lang === 'en' ? 'All Activities' : 'هەموو چالاکییەکان' },
                                { id: 'security', label: lang === 'en' ? '🛡️ Security & Logins' : '🛡️ ئاسایش و چوونەژوورەوە' },
                                { id: 'pricing', label: lang === 'en' ? '📦 Pricing & Plans' : '📦 نرخ و پلانەکان' },
                                { id: 'billing', label: lang === 'en' ? '💳 Receipts & Credits' : '💳 وەسڵەکان و کرێدیت' },
                                { id: 'content', label: lang === 'en' ? '🎬 Movies & Subtitles' : '🎬 فیلم و سەبتایتڵ' },
                                { id: 'system', label: lang === 'en' ? '🚨 Server Health' : '🚨 هەڵەکانی سێرڤەر' }
                            ].map(f => (
                                <button
                                    key={f.id}
                                    className={`filter-chip ${filterCategory === f.id ? 'active' : ''}`}
                                    onClick={() => setFilterCategory(f.id)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button className="btn-action-refresh" onClick={fetchLogs} title="Refresh Logs">
                                <RefreshCw size={16} />
                            </button>

                            <form className="feed-search-form" onSubmit={handleSearchSubmit}>
                                <Search size={14} color="#94a3b8" />
                                <input
                                    type="text"
                                    placeholder={lang === 'en' ? 'Search by username, IP, title, error...' : 'بگەڕێ بەپێی ئەدمین، ئایپی (IP)، پلان، هەڵە...'}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="feed-search-input"
                                />
                            </form>

                            {user?.role === 'super_admin' && logs.length > 0 && (
                                <button className="btn-clear-logs" onClick={handleClearLogs} title="سڕینەوەی هەموو تۆمارەکان">
                                    <Trash2 size={14} /> {lang === 'en' ? 'Clear Logs' : 'پاککردنەوە'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Feed List */}
                    {loadingLogs ? (
                        <div className="feed-loading-box">
                            <Loader2 size={36} className="spinning" />
                            <span>{lang === 'en' ? 'Loading system audit logs...' : 'خەریکە لۆگەکانی ئاسایش و چالاکی باردەکرێن...'}</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="feed-empty-box">
                            <Activity size={44} color="#64748b" />
                            <h3>{lang === 'en' ? 'No activity logs found' : 'هیچ تۆمارێکی چالاکی نەدۆزرایەوە'}</h3>
                            <p>{lang === 'en' ? 'All security events, admin actions, and server diagnostics will be logged here.' : 'هەموو چوونەژوورەوەیەک، دەستکارییەکی نرخ و پەسەندکردن لێرە تۆمار دەبێت.'}</p>
                        </div>
                    ) : (
                        <div className="feed-timeline-list">
                            {logs.map(item => {
                                const badge = getEventBadge(item);
                                const devInfo = parseDeviceInfo(item.userAgent, item.ip);
                                const dateObj = new Date(item.timestamp);
                                const timeFormatted = dateObj.toLocaleDateString('ckb-IQ', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                                const isExpanded = expandedLogId === item.id;

                                return (
                                    <div key={item.id} className={`timeline-item-card status-${item.status || 'info'}`}>
                                        <div className="timeline-badge-col" style={{ background: badge.bg, color: badge.color }}>
                                            {badge.icon}
                                        </div>

                                        <div className="timeline-body-col">
                                            <div className="timeline-top-row">
                                                <div className="timeline-author-tag">
                                                    <span className="author-name">{item.admin?.username || 'سیستەم'}</span>
                                                    <span className={`author-role ${item.admin?.role === 'super_admin' ? 'super' : item.admin?.role === 'admin' ? 'admin' : 'user'}`}>
                                                        {item.admin?.role === 'super_admin' ? 'بەڕێوەبەری سەرەکی' : item.admin?.role === 'admin' ? 'ئەدمین' : 'بەکارهێنەر'}
                                                    </span>
                                                    <span className="event-badge-pill" style={{ background: badge.bg, color: badge.color }}>
                                                        {badge.label}
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    {/* Kurdish / Country Flag & City Badge */}
                                                    <span className={`timeline-location-tag ${item.location?.isKurdish !== false ? 'kurdish' : ''}`} title={`Location: ${item.location?.city || 'هەولێر'} (${item.location?.country || 'کوردستان'})`}>
                                                        <span className="location-flag">{item.location?.flag || '☀️'}</span>
                                                        <span>{item.location?.city || 'هەولێر'}</span>
                                                    </span>

                                                    {/* Device & Browser Badge */}
                                                    {item.userAgent && (
                                                        <span className="timeline-device-tag" title={item.userAgent}>
                                                            {devInfo.deviceIcon}
                                                            <span>{devInfo.os} • {devInfo.browser}</span>
                                                        </span>
                                                    )}

                                                    {/* Clean IP Badge */}
                                                    {devInfo.cleanIp && (
                                                        <span className="timeline-ip-tag" title={`IP Address: ${item.ip}`}>
                                                            <Globe size={11} /> {devInfo.cleanIp}
                                                        </span>
                                                    )}

                                                    <span className="timeline-date-tag">
                                                        <Clock size={12} /> {timeFormatted}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Description */}
                                            <div className="timeline-action-text" dir="rtl">
                                                {/* Security & Logins */}
                                                {item.eventType === 'login_success' && (
                                                    <span>
                                                        بە سەرکەوتوویی چووە ژوورەوە بۆ پانێڵ لە ڕێگەی <strong>{devInfo.deviceTitle}</strong> بە وێبگەڕی <strong>{devInfo.browserTitle}</strong>
                                                    </span>
                                                )}

                                                {item.eventType === 'login_failed' && (
                                                    <span style={{ color: '#f87171' }}>
                                                        ⚠️ هەوڵی چوونەژوورەوەی شکستخواردوو بۆ هەژماری <strong>"{item.details?.attemptedUsername || item.admin?.username}"</strong>. هۆکار: <em>{item.details?.reason || 'وشەی نهێنی نادروستە'}</em>
                                                    </span>
                                                )}

                                                {item.eventType === 'login_blocked' && (
                                                    <span style={{ color: '#fbbf24' }}>
                                                        🚫 ڕێگری لە چوونەژوورەوەی هەژماری ڕاگیراو کرا. هۆکار: {item.details?.reason}
                                                    </span>
                                                )}

                                                {item.eventType === 'user_register' && (
                                                    <span>
                                                        هەژماری نوێی بەکارهێنەر تۆمارکرا: <strong>{item.details?.username || item.admin?.username}</strong>
                                                    </span>
                                                )}

                                                {/* Pricing & Plans */}
                                                {item.eventType === 'plan_create' && (
                                                    <span>
                                                        پلانی نوێی <strong>{item.target?.title || item.details?.name}</strong>ی دروستکرد بە نرخی <strong>{item.details?.price} {item.details?.currency}</strong> بۆ <strong>{item.details?.credits}</strong> کرێدیت.
                                                    </span>
                                                )}

                                                {item.eventType === 'plan_edit' && (
                                                    <span>
                                                        دەستکاریی پلانی <strong>{item.target?.title || item.details?.name}</strong>ی کرد:
                                                        {item.details?.oldPrice !== item.details?.newPrice && (
                                                            <span className="price-change-pill"> نرخ: {item.details?.oldPrice} ➜ {item.details?.newPrice}</span>
                                                        )}
                                                        {item.details?.oldCredits !== item.details?.newCredits && (
                                                            <span className="price-change-pill"> کرێدیت: {item.details?.oldCredits} ➜ {item.details?.newCredits}</span>
                                                        )}
                                                    </span>
                                                )}

                                                {item.eventType === 'plan_delete' && (
                                                    <span style={{ color: '#f87171' }}>
                                                        پلانی <strong>"{item.target?.title || item.details?.name}"</strong>ی سڕییەوە.
                                                    </span>
                                                )}

                                                {item.eventType === 'plan_reorder' && (
                                                    <span>
                                                        ڕیزبەندی و شوێنی ({item.details?.count || 'هەموو'}) پلانەکانی لە پەڕەی کڕین ڕێکخستەوە.
                                                    </span>
                                                )}

                                                {/* Server Error */}
                                                {item.eventType === 'server_error' && (
                                                    <div className="error-log-box">
                                                        <AlertOctagon size={16} color="#ef4444" />
                                                        <span><strong>کێشە لە سێرڤەر:</strong> {item.details?.error || item.target?.title}</span>
                                                    </div>
                                                )}

                                                {/* Content & Subtitles */}
                                                {item.eventType === 'subtitle_edit' && (
                                                    <span>
                                                        سەبتایتڵی <strong>{item.target?.title || 'فیلم'}</strong>ی پاشەکەوت کرد:
                                                        {item.details?.linesChanged !== undefined && (
                                                            <span className="diff-stats-mini"> ({item.details.linesChanged} دێڕ دەستکاری کرا, +{item.details.wordsAdded || 0} وشە)</span>
                                                        )}
                                                    </span>
                                                )}

                                                {item.eventType === 'movie_approve' && (
                                                    <span>
                                                        فیلم/زنجیرەی <strong>{item.target?.title}</strong>ی پەسەند کرد و بڵاویکردەوە ✓
                                                    </span>
                                                )}

                                                {item.eventType === 'movie_reject' && (
                                                    <span>
                                                        فیلم/زنجیرەی <strong>{item.target?.title}</strong>ی ڕەتکردەوە. هۆکار: <em>"{item.details?.reason || 'پێداچوونەوە'}"</em>
                                                    </span>
                                                )}

                                                {item.eventType === 'movie_add' && (
                                                    <span>
                                                        فیلم/زنجیرەی نوێی <strong>{item.target?.title}</strong>ی زیاد کرد.
                                                    </span>
                                                )}

                                                {item.eventType === 'episode_add' && (
                                                    <span>
                                                        ئەڵقەی نوێی بۆ <strong>{item.target?.title}</strong> زیاد کرد.
                                                    </span>
                                                )}

                                                {/* Billing */}
                                                {item.eventType === 'receipt_approve' && (
                                                    <span>
                                                        وەسڵی کرێدیتی بەکارهێنەر <strong>{item.details?.user || ''}</strong>ی بە سەرکەوتوویی پەسەند کرد ({item.details?.amount || 0} کرێدیت).
                                                    </span>
                                                )}

                                                {item.eventType === 'receipt_reject' && (
                                                    <span style={{ color: '#f87171' }}>
                                                        وەسڵی کرێدیتی بەکارهێنەر <strong>{item.details?.user || ''}</strong>ی ڕەتکردەوە. هۆکار: <em>"{item.details?.reason || 'نادروست'}"</em>
                                                    </span>
                                                )}
                                            </div>

                                            {/* Expandable Technical Details */}
                                            {(item.userAgent || item.ip || item.details?.stack) && (
                                                <div className="timeline-details-toggle">
                                                    <button
                                                        type="button"
                                                        className="btn-toggle-details"
                                                        onClick={() => setExpandedLogId(isExpanded ? null : item.id)}
                                                    >
                                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                        <span>{isExpanded ? (lang === 'en' ? 'Hide Details' : 'شاردنەوەی وردەکاری') : (lang === 'en' ? 'View Technical Details' : 'بینینی وردەکاری تەکنیکی')}</span>
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="expanded-details-pane">
                                                            <div className="detail-cards-grid">
                                                                <div className="detail-mini-card">
                                                                    <span className="detail-mini-lbl">🏙️ شار و وڵات</span>
                                                                    <strong className="detail-mini-val" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                        <span>{item.location?.flag || '☀️'}</span>
                                                                        <span>{item.location?.city || 'هەولێر'} ({item.location?.country || 'کوردستان'})</span>
                                                                    </strong>
                                                                </div>
                                                                <div className="detail-mini-card">
                                                                    <span className="detail-mini-lbl">📱 ئامێر و سیستەم</span>
                                                                    <strong className="detail-mini-val">{devInfo.os}</strong>
                                                                </div>
                                                                <div className="detail-mini-card">
                                                                    <span className="detail-mini-lbl">🌐 وێبگەڕ (Browser)</span>
                                                                    <strong className="detail-mini-val">{devInfo.browser}</strong>
                                                                </div>
                                                                <div className="detail-mini-card">
                                                                    <span className="detail-mini-lbl">📍 ناونیشانی IP</span>
                                                                    <strong className="detail-mini-val">{devInfo.cleanIp}</strong>
                                                                </div>
                                                                <div className="detail-mini-card">
                                                                    <span className="detail-mini-lbl">⏰ کاتی چوونەژوورەوە</span>
                                                                    <strong className="detail-mini-val">{dateObj.toLocaleTimeString('en-US')}</strong>
                                                                </div>
                                                            </div>

                                                            {item.details?.stack && (
                                                                <div className="detail-row stack-trace">
                                                                    <strong>Stack Trace:</strong>
                                                                    <pre>{item.details.stack}</pre>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
    );
}
