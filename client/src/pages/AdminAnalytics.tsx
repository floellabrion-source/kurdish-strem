import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/client';
import { 
    Loader2, Users, Film, Activity, CalendarDays, Calendar, 
    Smartphone, Monitor, Tablet, Globe, PieChart as PieChartIcon, 
    TrendingUp, HardDrive, RefreshCw, Flame, Eye, Play, Sparkles, 
    Award, Tv, Radio, ArrowUpRight, Clock
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './AdminAnalytics.css';

export interface TopWatchedItem {
    id: string;
    title: string;
    type: 'movie' | 'series' | 'animation';
    posterUrl: string;
    year?: number;
    genre?: string;
    views: number;
    rank: number;
    percentage: number;
}

export interface LiveNowData {
    totalLive: number;
    watchingList: {
        id: string;
        title: string;
        type: 'movie' | 'series' | 'animation';
        posterUrl: string;
        activeCount: number;
    }[];
}

interface AnalyticsData {
    totalUsers: number;
    totalMovies: number;
    liveNow?: LiveNowData;
    visitors: {
        daily: number;
        weekly: number;
        monthly: number;
        yearly: number;
    };
    topWatched?: {
        thisWeek: TopWatchedItem[];
        thisMonth: TopWatchedItem[];
        thisYear: TopWatchedItem[];
        allTime: TopWatchedItem[];
    };
    genreStats?: { genre: string; count: number }[];
    devices?: {
        mobile: number;
        desktop: number;
        tablet: number;
        total: number;
        percentages: {
            mobile: number;
            desktop: number;
            tablet: number;
        };
    };
    osDistribution?: Record<string, number>;
    browsers?: Record<string, number>;
}

// Slice geometry calculation helpers
function getCoords(pct: number, radius: number, cx = 150, cy = 150) {
    const angle = 2 * Math.PI * pct - Math.PI / 2;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function makePieSlice(startPct: number, endPct: number, radius = 110, cx = 150, cy = 150) {
    if (endPct - startPct >= 0.999) {
        return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`;
    }
    const [x1, y1] = getCoords(startPct, radius, cx, cy);
    const [x2, y2] = getCoords(endPct, radius, cx, cy);
    const largeArc = endPct - startPct > 0.5 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

export default function AdminAnalytics() {
    const { lang } = useLanguage();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [activeSlice, setActiveSlice] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<'thisWeek' | 'thisMonth' | 'thisYear' | 'allTime'>('thisWeek');

    const loadAnalytics = async () => {
        try {
            setErrorMsg('');
            const res = await axios.get('/api/admin/analytics');
            setData(res.data);
        } catch (error) {
            console.error('Error loading analytics:', error);
            const msg = (error as any)?.response?.data?.error || (lang === 'en' ? 'Unable to load analytics data.' : 'ناتوانرێت داتای ئامار بخوێندرێتەوە.');
            setErrorMsg(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAnalytics();
    }, [lang]);

    // Compute Pie Chart Slices
    const pieSlices = useMemo(() => {
        if (!data?.devices) return [];

        const dev = data.devices;
        const total = (dev.mobile + dev.desktop + dev.tablet) || 1;

        const rawSlices = [
            {
                id: 'mobile',
                label: lang === 'en' ? 'Mobile' : 'مۆبایل',
                icon: <Smartphone size={16} />,
                count: dev.mobile,
                pct: dev.percentages?.mobile ?? Math.round((dev.mobile / total) * 1000) / 10,
                color: '#06b6d4', // Cyan / Teal
                hoverColor: '#22d3ee'
            },
            {
                id: 'desktop',
                label: lang === 'en' ? 'Desktop' : 'کۆمپیوتەر',
                icon: <Monitor size={16} />,
                count: dev.desktop,
                pct: dev.percentages?.desktop ?? Math.round((dev.desktop / total) * 1000) / 10,
                color: '#f97316', // Vibrant Orange
                hoverColor: '#fb923c'
            },
            {
                id: 'tablet',
                label: lang === 'en' ? 'Tablet' : 'تابلێت',
                icon: <Tablet size={16} />,
                count: dev.tablet,
                pct: dev.percentages?.tablet ?? Math.round((dev.tablet / total) * 1000) / 10,
                color: '#3b82f6', // Royal Blue
                hoverColor: '#60a5fa'
            }
        ].filter(s => s.pct > 0);

        // If no visits recorded yet, give an illustrative baseline
        if (rawSlices.length === 0) {
            return [
                { id: 'mobile', label: lang === 'en' ? 'Mobile' : 'مۆبایل', icon: <Smartphone size={16} />, count: 0, pct: 60.0, color: '#06b6d4', hoverColor: '#22d3ee', path: '', startPct: 0, endPct: 0.6, midPct: 0.3 },
                { id: 'desktop', label: lang === 'en' ? 'Desktop' : 'کۆمپیوتەر', icon: <Monitor size={16} />, count: 0, pct: 32.5, color: '#f97316', hoverColor: '#fb923c', path: '', startPct: 0.6, endPct: 0.925, midPct: 0.7625 },
                { id: 'tablet', label: lang === 'en' ? 'Tablet' : 'تابلێت', icon: <Tablet size={16} />, count: 0, pct: 7.5, color: '#3b82f6', hoverColor: '#60a5fa', path: '', startPct: 0.925, endPct: 1, midPct: 0.9625 }
            ].map(s => ({
                ...s,
                path: makePieSlice(s.startPct, s.endPct, 105, 150, 150)
            }));
        }

        let accumulated = 0;
        return rawSlices.map(s => {
            const startPct = accumulated;
            const slicePortion = s.pct / 100;
            const endPct = accumulated + slicePortion;
            accumulated = endPct;
            const midPct = (startPct + endPct) / 2;

            return {
                ...s,
                startPct,
                endPct,
                midPct,
                path: makePieSlice(startPct, endPct, 105, 150, 150)
            };
        });
    }, [data?.devices, lang]);

    if (loading) {
        return <div className="admin-loading"><Loader2 size={32} className="spinning" /></div>;
    }

    if (!data) {
        return <div style={{ textAlign: 'center', padding: '40px', color: errorMsg ? '#f87171' : '#64748b' }}>{errorMsg || (lang === 'en' ? 'No analytics data available' : 'هیچ داتایەک نییە')}</div>;
    }

    return (
        <div className={`analytics-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {/* Top Primary Stat Cards */}
            <div className="analytics-grid">
                <div className="analytics-card primary-card">
                    <div className="ac-icon-box users">
                        <Users size={24} />
                    </div>
                    <div className="ac-content">
                        <h3>{lang === 'en' ? 'Total Registered Users' : 'کۆی بەکارهێنەران'}</h3>
                        <p className="ac-value">{data.totalUsers.toLocaleString()}</p>
                    </div>
                </div>

                <div className="analytics-card primary-card">
                    <div className="ac-icon-box movies">
                        <Film size={24} />
                    </div>
                    <div className="ac-content">
                        <h3>{lang === 'en' ? 'Total Media & Shows' : 'کۆی بەرهەمەکان'}</h3>
                        <p className="ac-value">{data.totalMovies.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* DEVICE DISTRIBUTION PIE CHART SECTION */}
            <div className="device-analytics-section">
                <div className="analytics-section-header">
                    <div className="section-title-wrap">
                        <PieChartIcon size={22} color="#06b6d4" />
                        <div>
                            <h2>{lang === 'en' ? 'Visitor Device Breakdown (Pie Chart)' : 'شیکاری دیڤایسی بەکارهێنەران (هێڵکاری کێک)'}</h2>
                            <p>{lang === 'en' ? 'Percentage of visitors browsing via Mobile, Desktop, and Tablet' : 'ڕێژەی سەدی بینەران بەپێی ئامێرەکانی مۆبایل، کۆمپیوتەر، و تابلێت'}</p>
                        </div>
                    </div>
                    <button className="btn-refresh-analytics" onClick={loadAnalytics} title="نوێکردنەوە">
                        <RefreshCw size={15} />
                    </button>
                </div>

                <div className="pie-chart-card-grid">
                    {/* SVG Pie Chart */}
                    <div className="pie-chart-wrapper">
                        <svg viewBox="0 0 300 300" className="pie-chart-svg">
                            <defs>
                                <filter id="pie-shadow" x="-10%" y="-10%" width="120%" height="120%">
                                    <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.35" />
                                </filter>
                            </defs>

                            {/* Outer decorative ring */}
                            <circle cx="150" cy="150" r="118" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

                            {/* Slices */}
                            <g filter="url(#pie-shadow)">
                                {pieSlices.map((slice) => {
                                    const isHovered = activeSlice === slice.id;
                                    const [midX, midY] = getCoords(slice.midPct, 12);
                                    const transform = isHovered ? `translate(${midX - 150}, ${midY - 150}) scale(1.04)` : '';

                                    return (
                                        <path
                                            key={slice.id}
                                            d={slice.path}
                                            fill={isHovered ? slice.hoverColor : slice.color}
                                            stroke="#0f111a"
                                            strokeWidth="2.5"
                                            className="pie-slice"
                                            style={{
                                                transform,
                                                transformOrigin: '150px 150px',
                                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                cursor: 'pointer'
                                            }}
                                            onMouseEnter={() => setActiveSlice(slice.id)}
                                            onMouseLeave={() => setActiveSlice(null)}
                                        />
                                    );
                                })}
                            </g>

                            {/* Pointer callout lines and labels (matching user reference image) */}
                            {pieSlices.map((slice) => {
                                const [innerX, innerY] = getCoords(slice.midPct, 80);
                                const [outerX, outerY] = getCoords(slice.midPct, 115);
                                const isRight = outerX >= 150;
                                const labelLineEndX = isRight ? outerX + 20 : outerX - 20;

                                return (
                                    <g key={`lbl-${slice.id}`} className="pie-label-group">
                                        <circle cx={innerX} cy={innerY} r="2.5" fill="#ffffff" opacity="0.8" />
                                        <polyline
                                            points={`${innerX},${innerY} ${outerX},${outerY} ${labelLineEndX},${outerY}`}
                                            fill="none"
                                            stroke="rgba(255, 255, 255, 0.5)"
                                            strokeWidth="1"
                                        />
                                        <text
                                            x={isRight ? labelLineEndX + 4 : labelLineEndX - 4}
                                            y={outerY - 2}
                                            fill="#f8fafc"
                                            fontSize="11.5"
                                            fontWeight="800"
                                            textAnchor={isRight ? 'start' : 'end'}
                                            fontFamily="inherit"
                                        >
                                            {slice.label}
                                        </text>
                                        <text
                                            x={isRight ? labelLineEndX + 4 : labelLineEndX - 4}
                                            y={outerY + 11}
                                            fill={slice.color}
                                            fontSize="11"
                                            fontWeight="700"
                                            textAnchor={isRight ? 'start' : 'end'}
                                        >
                                            {slice.pct}%
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    {/* Side Breakdown Stats Cards */}
                    <div className="device-stats-panel">
                        <h3 className="stats-panel-title">
                            <TrendingUp size={16} color="#a78bfa" />
                            {lang === 'en' ? 'Device Distribution Details' : 'وردەکاریی ئامێرە بەکارهاتووەکان'}
                        </h3>

                        <div className="device-cards-list">
                            {pieSlices.map((item) => {
                                const isHovered = activeSlice === item.id;
                                return (
                                    <div
                                        key={item.id}
                                        className={`device-stat-row ${isHovered ? 'active' : ''}`}
                                        onMouseEnter={() => setActiveSlice(item.id)}
                                        onMouseLeave={() => setActiveSlice(null)}
                                        style={{ '--dev-color': item.color } as any}
                                    >
                                        <div className="device-stat-left">
                                            <div className="device-color-dot" style={{ background: item.color, boxShadow: `0 0 10px ${item.color}80` }}>
                                                {item.icon}
                                            </div>
                                            <div className="device-name-info">
                                                <h4>{item.label}</h4>
                                                <span>{item.count > 0 ? `${item.count} ${lang === 'en' ? 'visits' : 'سەردان'}` : (lang === 'en' ? 'Usage share' : 'پشکی بەکارهێنان')}</span>
                                            </div>
                                        </div>

                                        <div className="device-stat-right">
                                            <span className="device-percentage" style={{ color: item.color }}>
                                                {item.pct}%
                                            </span>
                                            <div className="device-progress-bg">
                                                <div className="device-progress-fill" style={{ width: `${item.pct}%`, background: item.color }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* OS Breakdown Pill Badges */}
                        {data.osDistribution && Object.keys(data.osDistribution).length > 0 && (
                            <div className="os-breakdown-box">
                                <span className="os-box-title">
                                    <HardDrive size={13} /> {lang === 'en' ? 'Operating Systems:' : 'سیستەمەکانی کارپێکردن:'}
                                </span>
                                <div className="os-pills-wrap">
                                    {Object.entries(data.osDistribution).map(([osName, count]) => (
                                        <span key={osName} className="os-pill">
                                            <strong>{osName}</strong>: {count}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* VISITOR TIMELINE STATISTICS */}
            <h2 className="analytics-section-title">
                <Activity size={20} /> {lang === 'en' ? 'Visitor Statistics' : 'ئاماری کاتیی سەردانکەران'}
            </h2>

            <div className="analytics-grid">
                <div className="analytics-card visitor-card daily">
                    <div className="ac-icon-box">
                        <Calendar size={20} />
                    </div>
                    <div className="ac-content">
                        <h3>{lang === 'en' ? "Today's Visitors" : 'سەردانکەرانی ئەمڕۆ'}</h3>
                        <p className="ac-value">{data.visitors.daily}</p>
                    </div>
                </div>

                <div className="analytics-card visitor-card weekly">
                    <div className="ac-icon-box">
                        <CalendarDays size={20} />
                    </div>
                    <div className="ac-content">
                        <h3>{lang === 'en' ? "This Week's Visitors" : 'سەردانکەرانی ئەم هەفتەیە'}</h3>
                        <p className="ac-value">{data.visitors.weekly}</p>
                    </div>
                </div>

                <div className="analytics-card visitor-card monthly">
                    <div className="ac-icon-box">
                        <Calendar size={20} />
                    </div>
                    <div className="ac-content">
                        <h3>{lang === 'en' ? "This Month's Visitors" : 'سەردانکەرانی ئەم مانگە'}</h3>
                        <p className="ac-value">{data.visitors.monthly}</p>
                    </div>
                </div>

                <div className="analytics-card visitor-card yearly">
                    <div className="ac-icon-box">
                        <Activity size={20} />
                    </div>
                    <div className="ac-content">
                        <h3>{lang === 'en' ? "This Year's Visitors" : 'سەردانکەرانی ئەم ساڵ'}</h3>
                        <p className="ac-value">{data.visitors.yearly}</p>
                    </div>
                </div>
            </div>

            {/* LIVE CONCURRENT ACTIVE WATCHERS CARD */}
            <div className="live-viewers-panel">
                <div className="live-panel-header">
                    <div className="live-header-left">
                        <span className={`live-pulse-radar ${(data.liveNow?.totalLive || 0) > 0 ? 'active' : ''}`} />
                        <div>
                            <h3>{lang === 'en' ? 'Live Active Viewers Right Now' : 'بینەرانی ڕاستەوخۆ لەم ساتەدا'}</h3>
                            <p>{lang === 'en' ? 'Users actively playing or browsing watch pages in real time' : 'ئەو بەکارهێنەرانەی لەم چرکەیەدا سەردانی پەخشی فیلم دەکەن'}</p>
                        </div>
                    </div>
                    <div className="live-counter-pill">
                        <span className="live-pill-count">{data.liveNow?.totalLive || 0}</span>
                        <span className="live-pill-label">{lang === 'en' ? 'Watching Now' : 'کەس سەیر دەکەن'}</span>
                    </div>
                </div>

                {data.liveNow && data.liveNow.watchingList.length > 0 ? (
                    <div className="live-watching-grid">
                        {data.liveNow.watchingList.map(item => (
                            <Link to={`/watch/${item.id}`} key={item.id} className="live-watching-card">
                                <img src={item.posterUrl || '/placeholder.png'} alt={item.title} className="live-card-thumb" />
                                <div className="live-card-info">
                                    <h4>{item.title}</h4>
                                    <span className="live-card-badge">
                                        <Radio size={12} className="pulsing-icon" /> {item.activeCount} {lang === 'en' ? 'viewing' : 'بینەر'}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="live-idle-state">
                        <Radio size={24} color="#64748b" />
                        <span>{lang === 'en' ? 'No active viewers at this exact moment.' : 'لە ئێستادا هیچ بینەرێکی ڕاستەوخۆ لەناو پەخشدا نییە.'}</span>
                    </div>
                )}
            </div>

            {/* TOP WATCHED LEADERBOARD (WEEKLY, MONTHLY, YEARLY, ALL-TIME) */}
            <div className="top-watched-section">
                <div className="top-watched-header">
                    <div className="top-watched-title-box">
                        <div className="top-watched-icon">
                            <Flame size={24} color="#f59e0b" />
                        </div>
                        <div>
                            <h2>{lang === 'en' ? 'Most Watched Rankings' : 'ڕیزبەندیی پڕبینەرترین فیلم و زنجیرەکان'}</h2>
                            <p>{lang === 'en' ? 'Filter by time period to discover audience trends and top titles' : 'دیاریکردنی زۆرترین بینەر بەپێی هەفتە، مانگ، ساڵ و کۆی گشتی'}</p>
                        </div>
                    </div>

                    {/* Period Tabs */}
                    <div className="period-tabs-wrap">
                        <button 
                            className={`period-tab-btn ${selectedPeriod === 'thisWeek' ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod('thisWeek')}
                        >
                            <CalendarDays size={15} />
                            <span>{lang === 'en' ? 'This Week' : 'ئەم هەفتەیە'}</span>
                        </button>
                        <button 
                            className={`period-tab-btn ${selectedPeriod === 'thisMonth' ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod('thisMonth')}
                        >
                            <Calendar size={15} />
                            <span>{lang === 'en' ? 'This Month' : 'ئەم مانگە'}</span>
                        </button>
                        <button 
                            className={`period-tab-btn ${selectedPeriod === 'thisYear' ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod('thisYear')}
                        >
                            <Activity size={15} />
                            <span>{lang === 'en' ? 'This Year' : 'ئەم ساڵ'}</span>
                        </button>
                        <button 
                            className={`period-tab-btn ${selectedPeriod === 'allTime' ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod('allTime')}
                        >
                            <Award size={15} />
                            <span>{lang === 'en' ? 'All Time' : 'کۆی گشتی'}</span>
                        </button>
                    </div>
                </div>

                {/* Leaderboard Table / List */}
                {(() => {
                    const currentList = data.topWatched ? data.topWatched[selectedPeriod] || [] : [];
                    if (currentList.length === 0) {
                        return (
                            <div className="top-watched-empty">
                                <Film size={36} color="#64748b" />
                                <p>{lang === 'en' ? 'No viewing records for this timeframe yet.' : 'هێشتا هیچ تۆمارێکی بینین بۆ ئەم ماوەیە نییە.'}</p>
                            </div>
                        );
                    }

                    return (
                        <div className="top-watched-list">
                            {currentList.map((item, idx) => {
                                const rank = idx + 1;
                                const isTop3 = rank <= 3;
                                const medalColor = rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : '#64748b';

                                return (
                                    <div key={item.id} className={`top-watched-row ${isTop3 ? `rank-top-${rank}` : ''}`}>
                                        <div className="tw-rank-box" style={{ color: medalColor }}>
                                            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                                        </div>

                                        <div className="tw-poster-wrap">
                                            <img src={item.posterUrl || '/placeholder.png'} alt={item.title} className="tw-poster-img" />
                                        </div>

                                        <div className="tw-info-box">
                                            <div className="tw-title-row">
                                                <h4 className="tw-title">{item.title}</h4>
                                                <span className={`tw-type-pill ${item.type}`}>
                                                    {item.type === 'series' ? (lang === 'en' ? 'Series' : 'زنجیرە') : item.type === 'animation' ? (lang === 'en' ? 'Animation' : 'ئەنیمەیشن') : (lang === 'en' ? 'Movie' : 'فیلم')}
                                                </span>
                                                {item.year && <span className="tw-year">{item.year}</span>}
                                            </div>
                                            {item.genre && <span className="tw-genre">{item.genre}</span>}

                                            {/* Visual Progress Bar */}
                                            <div className="tw-progress-wrap">
                                                <div className="tw-progress-fill" style={{ width: `${Math.max(6, item.percentage)}%` }} />
                                            </div>
                                        </div>

                                        <div className="tw-views-box">
                                            <span className="tw-views-num">{item.views.toLocaleString()}</span>
                                            <span className="tw-views-label">{lang === 'en' ? 'Views' : 'بینین'}</span>
                                        </div>

                                        <Link to={`/watch/${item.id}`} className="tw-action-btn" title={lang === 'en' ? 'Watch Now' : 'سەیرکردن'}>
                                            <Play size={16} fill="currentColor" />
                                        </Link>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </div>

            {/* GENRE PREFERENCE BREAKDOWN */}
            {data.genreStats && data.genreStats.length > 0 && (
                <div className="genre-analytics-card">
                    <div className="genre-card-header">
                        <Sparkles size={18} color="#a855f7" />
                        <h3>{lang === 'en' ? 'Top Watched Genres' : 'پڕبینەرترین چەشنەکان'}</h3>
                    </div>
                    <div className="genre-pills-container">
                        {data.genreStats.map((g, idx) => (
                            <div key={idx} className="genre-stat-pill">
                                <span className="g-name">{g.genre}</span>
                                <span className="g-count">{g.count} {lang === 'en' ? 'viewers' : 'بینەر'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
