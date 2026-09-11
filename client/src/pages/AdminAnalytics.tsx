import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/client';
import { 
    Loader2, Users, Film, Activity, CalendarDays, Calendar, 
    Smartphone, Monitor, Tablet, Globe, 
    TrendingUp, RefreshCw, Flame, Eye, Play, Sparkles, 
    Award, Tv, Radio, MapPin, Clock, UserCheck, ShieldCheck,
    Compass, Laptop
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

export interface DetailedLiveViewer {
    id: string;
    movieId: string;
    movieTitle: string;
    movieType: 'movie' | 'series' | 'animation';
    posterUrl: string;
    username: string;
    isGuest: boolean;
    countryCode: string;
    countryName: string;
    countryFlag: string;
    city?: string;
    device: 'mobile' | 'desktop' | 'tablet';
    deviceLabel: string;
    browser: string;
    videoTime: string;
    duration: string;
    lastPing: number;
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
    detailedViewers?: DetailedLiveViewer[];
}

export interface LocationStat {
    code: string;
    name: string;
    en: string;
    flag: string;
    count: number;
    percentage: number;
    topCities?: string[];
}

interface AnalyticsData {
    totalUsers: number;
    totalMovies: number;
    liveNow?: LiveNowData;
    locationStats?: LocationStat[];
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

export default function AdminAnalytics() {
    const { lang } = useLanguage();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [selectedPeriod, setSelectedPeriod] = useState<'thisWeek' | 'thisMonth' | 'thisYear' | 'allTime'>('thisWeek');
    const [autoRefresh, setAutoRefresh] = useState(true);

    const loadAnalytics = async (isManual = false) => {
        try {
            if (isManual) setRefreshing(true);
            setErrorMsg('');
            const res = await axios.get('/api/admin/analytics');
            setData(res.data);
        } catch (error) {
            console.error('Error loading analytics:', error);
            const msg = (error as any)?.response?.data?.error || (lang === 'en' ? 'Unable to load analytics data.' : 'ناتوانرێت داتای ئامار بخوێندرێتەوە.');
            setErrorMsg(msg);
        } finally {
            setLoading(false);
            if (isManual) setRefreshing(false);
        }
    };

    useEffect(() => {
        loadAnalytics();
    }, [lang]);

    // Live auto-refresh every 12 seconds
    useEffect(() => {
        if (!autoRefresh) return;
        const timer = setInterval(() => {
            loadAnalytics(false);
        }, 12000);
        return () => clearInterval(timer);
    }, [autoRefresh]);

    if (loading) {
        return (
            <div className="admin-loading">
                <Loader2 size={36} className="spinning" color="#22d3ee" />
                <p style={{ marginTop: '12px', color: '#94a3b8' }}>
                    {lang === 'en' ? 'Loading Analytics & Real-Time Data...' : 'بارکردنی ئامارەکان و بینەرانی ڕاستەوخۆ...'}
                </p>
            </div>
        );
    }

    if (!data) {
        return (
            <div style={{ textAlign: 'center', padding: '50px', color: errorMsg ? '#f87171' : '#64748b' }}>
                {errorMsg || (lang === 'en' ? 'No analytics data available' : 'هیچ داتایەک نییە')}
            </div>
        );
    }

    const liveTotal = data.liveNow?.totalLive || 0;
    const detailedViewers = data.liveNow?.detailedViewers || [];
    const locationList = data.locationStats || [];

    return (
        <div className={`analytics-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            
            {/* Top Bar with Refresh & Live Pulse */}
            <div className="analytics-top-bar">
                <div className="top-bar-left">
                    <h1 className="analytics-main-title">
                        📊 {lang === 'en' ? 'Dashboard & Live Analytics' : 'ئاماری گشتی و بینەرانی ڕاستەوخۆ'}
                    </h1>
                    <p className="analytics-main-subtitle">
                        {lang === 'en' 
                            ? 'Monitor live viewers, locations, devices, and top rankings in real time.' 
                            : 'چاودێریکردنی بینەرانی ڕاستەوخۆ، شار و وڵاتەکان، جۆری مۆبایل و پڕبینەرترین بەرهەمەکان.'}
                    </p>
                </div>

                <div className="top-bar-actions">
                    <button 
                        className={`auto-refresh-toggle ${autoRefresh ? 'active' : ''}`}
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        title={lang === 'en' ? 'Toggle Real-Time Auto-Refresh (every 12s)' : 'چالاککردن/ناچالاککردنی نوێبوونەوەی خۆکار (هەر ١٢ چرکە جارێک)'}
                    >
                        <span className={`pulse-dot ${autoRefresh ? 'green' : 'gray'}`} />
                        <span>{autoRefresh ? (lang === 'en' ? 'Live Auto-Sync ON' : 'نوێبوونەوەی ڕاستەوخۆ: چالاکە') : (lang === 'en' ? 'Auto-Sync OFF' : 'نوێبوونەوەی خۆکار: ناچالاکە')}</span>
                    </button>

                    <button 
                        className="btn-refresh-clean"
                        onClick={() => loadAnalytics(true)} 
                        disabled={refreshing}
                        title="نوێکردنەوەی دەستی"
                    >
                        <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
                        <span>{lang === 'en' ? 'Refresh' : 'نوێکردنەوە'}</span>
                    </button>
                </div>
            </div>

            {/* 4 PRIMARY STAT HIGHLIGHT CARDS */}
            <div className="primary-stats-grid">
                
                {/* 1. Live Viewers Right Now */}
                <div className={`primary-stat-card live-card ${liveTotal > 0 ? 'glowing' : ''}`}>
                    <div className="stat-card-top">
                        <span className="stat-card-title">{lang === 'en' ? 'Live Viewers Right Now' : 'بینەرانی ڕاستەوخۆ لەم ساتەدا'}</span>
                        <div className="stat-icon-wrap red-pulse">
                            <Radio size={20} className="pulse-icon-anim" />
                        </div>
                    </div>
                    <div className="stat-card-bottom">
                        <span className="stat-value live-number">{liveTotal}</span>
                        <span className="stat-badge live-badge">
                            <span className="tiny-pulse-dot" /> {liveTotal > 0 ? (lang === 'en' ? 'Currently Watching' : 'کەس لەناو پەخش دان') : (lang === 'en' ? 'Idle' : 'هیچ بینەرێک نییە')}
                        </span>
                    </div>
                </div>

                {/* 2. Today's Total Visitors */}
                <div className="primary-stat-card">
                    <div className="stat-card-top">
                        <span className="stat-card-title">{lang === 'en' ? "Today's Visitors" : 'سەردانکەرانی ئەمڕۆ'}</span>
                        <div className="stat-icon-wrap cyan">
                            <Activity size={20} />
                        </div>
                    </div>
                    <div className="stat-card-bottom">
                        <span className="stat-value">{data.visitors.daily.toLocaleString()}</span>
                        <span className="stat-badge neutral">
                            <Calendar size={12} /> {lang === 'en' ? 'Unique Devices' : 'ئامێری سەردانکەر'}
                        </span>
                    </div>
                </div>

                {/* 3. Total Registered Users */}
                <div className="primary-stat-card">
                    <div className="stat-card-top">
                        <span className="stat-card-title">{lang === 'en' ? 'Registered Users' : 'بەکارهێنەرانی تۆمارکراو'}</span>
                        <div className="stat-icon-wrap purple">
                            <Users size={20} />
                        </div>
                    </div>
                    <div className="stat-card-bottom">
                        <span className="stat-value">{data.totalUsers.toLocaleString()}</span>
                        <span className="stat-badge purple-badge">
                            <UserCheck size={12} /> {lang === 'en' ? 'Accounts' : 'هەژماری چالاک'}
                        </span>
                    </div>
                </div>

                {/* 4. Total Movies & Series */}
                <div className="primary-stat-card">
                    <div className="stat-card-top">
                        <span className="stat-card-title">{lang === 'en' ? 'Total Media' : 'کۆی فیلم و زنجیرەکان'}</span>
                        <div className="stat-icon-wrap gold">
                            <Film size={20} />
                        </div>
                    </div>
                    <div className="stat-card-bottom">
                        <span className="stat-value">{data.totalMovies.toLocaleString()}</span>
                        <span className="stat-badge gold-badge">
                            <Tv size={12} /> {lang === 'en' ? 'In Catalog' : 'بەرهەمی ماڵپەڕ'}
                        </span>
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 🔴 SECTION 1: LIVE ACTIVE VIEWERS & LOCATIONS (NEW!) */}
            {/* ========================================================= */}
            <div className="analytics-section-box live-viewers-section">
                <div className="section-box-header">
                    <div className="header-left">
                        <div className="header-icon-box live-glow">
                            <Radio size={20} color="#ef4444" />
                        </div>
                        <div>
                            <h2>{lang === 'en' ? 'Live Viewers & Locations (Real-Time)' : 'بینەرانی ڕاستەوخۆ و شوێنەکانیان (لەم چرکەیەدا)'}</h2>
                            <p>{lang === 'en' ? 'See who is watching right now, what they are watching, their country/city and device.' : 'بزانە کێ لەم ساتەدا سەیری چی دەکات، لە چ شار و وڵاتێکە و بە چ ئامێرێک سەیر دەکات.'}</p>
                        </div>
                    </div>

                    <div className="header-badge-live">
                        <span className="radar-circle" />
                        <span>{liveTotal} {lang === 'en' ? 'Active Now' : 'بینەری ڕاستەوخۆ'}</span>
                    </div>
                </div>

                {detailedViewers.length > 0 ? (
                    <div className="live-viewers-cards-grid">
                        {detailedViewers.map((viewer, index) => (
                            <div key={viewer.id || index} className="live-viewer-card">
                                
                                {/* Poster + Movie Name */}
                                <div className="lvc-movie-col">
                                    <img 
                                        src={viewer.posterUrl || '/kst-logo.png'} 
                                        alt={viewer.movieTitle} 
                                        className="lvc-poster"
                                        onError={(e) => { (e.target as any).src = '/kst-logo.png'; }}
                                    />
                                    <div className="lvc-movie-info">
                                        <h4 className="lvc-movie-title" title={viewer.movieTitle}>
                                            {viewer.movieTitle}
                                        </h4>
                                        <div className="lvc-movie-badges">
                                            <span className={`lvc-type-badge ${viewer.movieType}`}>
                                                {viewer.movieType === 'series' ? 'زنجیرە' : viewer.movieType === 'animation' ? 'ئەنیمەیشن' : 'فیلم'}
                                            </span>
                                            <span className="lvc-time-badge">
                                                <Clock size={11} /> {viewer.videoTime}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* User Info (Member vs Guest) */}
                                <div className="lvc-user-col">
                                    <span className="lvc-col-label">{lang === 'en' ? 'User:' : 'بینەر:'}</span>
                                    <div className="lvc-user-value">
                                        <span className={`user-role-pill ${viewer.isGuest ? 'guest' : 'member'}`}>
                                            {viewer.isGuest ? '👤 میوان (Guest)' : `👑 ${viewer.username}`}
                                        </span>
                                    </div>
                                    <span className="lvc-duration-text">
                                        {lang === 'en' ? `Watching for ${viewer.duration}` : `بۆ ماوەی ${viewer.duration}ە لەسەر پەخشە`}
                                    </span>
                                </div>

                                {/* Location (Country + Flag + City) */}
                                <div className="lvc-location-col">
                                    <span className="lvc-col-label">{lang === 'en' ? 'Location:' : 'شوێن:'}</span>
                                    <div className="lvc-location-box">
                                        <span className="lvc-flag">{viewer.countryFlag}</span>
                                        <div className="lvc-geo-text">
                                            <strong>{viewer.countryName}</strong>
                                            {viewer.city && <span className="lvc-city">({viewer.city})</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* Device & OS */}
                                <div className="lvc-device-col">
                                    <span className="lvc-col-label">{lang === 'en' ? 'Device:' : 'ئامێر:'}</span>
                                    <div className="lvc-device-box">
                                        {viewer.device === 'mobile' ? (
                                            <Smartphone size={16} color="#06b6d4" />
                                        ) : viewer.device === 'tablet' ? (
                                            <Tablet size={16} color="#3b82f6" />
                                        ) : (
                                            <Monitor size={16} color="#f97316" />
                                        )}
                                        <span className="lvc-device-name">{viewer.deviceLabel}</span>
                                    </div>
                                    <span className="lvc-browser-text">{viewer.browser}</span>
                                </div>

                                {/* Live Pulse Status & Link */}
                                <div className="lvc-action-col">
                                    <div className="lvc-live-indicator">
                                        <span className="live-green-dot" />
                                        <span>Live</span>
                                    </div>
                                    <Link to={`/watch/${viewer.movieId}`} className="lvc-view-btn" title="سەیرکردنی پەڕەی فیلمەکە">
                                        <Play size={14} fill="currentColor" />
                                    </Link>
                                </div>

                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="live-empty-state">
                        <div className="empty-radar-wrap">
                            <Radio size={36} color="#64748b" />
                        </div>
                        <h3>{lang === 'en' ? 'No Active Viewers at this Exact Moment' : 'لە ئێستادا هیچ بینەرێکی ڕاستەوخۆ لەناو پەخشدا نییە'}</h3>
                        <p>{lang === 'en' ? 'When any visitor (guest or member) starts watching a movie or series, their live status, movie, and location will show up here instantly.' : 'هەر کاتێک بینەرێک (چ بە ئەکاونت چ وەک میوان) دەست بە سەیرکردنی فیلم یان زنجیرەیەک بکات، ڕاستەوخۆ ناو و شوێن و ئامێرەکەی لێرە بە ڕوونی دەردەکەوێت.'}</p>
                    </div>
                )}
            </div>

            {/* ========================================================= */}
            {/* 🌍 SECTION 2: AUDIENCE BY COUNTRY & LOCATION (GEOIP) */}
            {/* ========================================================= */}
            <div className="analytics-section-box locations-section">
                <div className="section-box-header">
                    <div className="header-left">
                        <div className="header-icon-box cyan-bg">
                            <Globe size={20} color="#06b6d4" />
                        </div>
                        <div>
                            <h2>{lang === 'en' ? 'Visitor Geography & Countries' : 'دابەشبوونی بینەران بەپێی وڵات و شار'}</h2>
                            <p>{lang === 'en' ? 'Breakdown of audience traffic across different countries and regions.' : 'ڕێژەی سەردانکەران و بینەران بەپێی وڵاتەکان و شارە جیاوازەکان.'}</p>
                        </div>
                    </div>
                </div>

                {locationList.length > 0 ? (
                    <div className="locations-grid">
                        {locationList.map((loc) => (
                            <div key={loc.code} className="location-card">
                                <div className="loc-card-header">
                                    <div className="loc-title-wrap">
                                        <span className="loc-flag-big">{loc.flag}</span>
                                        <div>
                                            <h4 className="loc-country-name">{loc.name}</h4>
                                            <span className="loc-country-en">{loc.en}</span>
                                        </div>
                                    </div>
                                    <div className="loc-count-box">
                                        <span className="loc-count-num">{loc.count.toLocaleString()}</span>
                                        <span className="loc-count-pct">{loc.percentage}%</span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="loc-progress-bar">
                                    <div className="loc-progress-fill" style={{ width: `${Math.max(5, loc.percentage)}%` }} />
                                </div>

                                {loc.topCities && loc.topCities.length > 0 && (
                                    <div className="loc-cities-row">
                                        <span className="loc-city-label"><MapPin size={11} /> شارەکان:</span>
                                        {loc.topCities.map((city, cIdx) => (
                                            <span key={cIdx} className="loc-city-pill">{city}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="locations-empty">
                        <Globe size={28} color="#64748b" />
                        <p>{lang === 'en' ? 'Collecting country and geography data...' : 'لە ئێستادا داتای جوگرافیا و شارەکان کۆدەکرێتەوە...'}</p>
                    </div>
                )}
            </div>

            {/* ========================================================= */}
            {/* 📱 SECTION 3: DEVICES & TIMELINE OVERVIEW */}
            {/* ========================================================= */}
            <div className="analytics-dual-row">
                
                {/* Device Breakdown */}
                <div className="analytics-section-box half-box">
                    <div className="section-box-header">
                        <div className="header-left">
                            <div className="header-icon-box orange-bg">
                                <Smartphone size={20} color="#f97316" />
                            </div>
                            <div>
                                <h2>{lang === 'en' ? 'Device Distribution' : 'جۆری ئامێرە بەکارهاتووەکان'}</h2>
                                <p>{lang === 'en' ? 'Mobile vs Desktop vs Tablet' : 'ڕێژەی مۆبایل، کۆمپیوتەر و تابلێت'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="device-simple-list">
                        <div className="device-simple-row mobile">
                            <div className="ds-left">
                                <div className="ds-icon-box cyan"><Smartphone size={18} /></div>
                                <div>
                                    <h4>{lang === 'en' ? 'Mobile Phones' : 'مۆبایل'}</h4>
                                    <span>{data.devices?.mobile || 0} {lang === 'en' ? 'visits' : 'سەردان'}</span>
                                </div>
                            </div>
                            <div className="ds-right">
                                <span className="ds-percentage">{data.devices?.percentages?.mobile ?? 0}%</span>
                                <div className="ds-bar"><div className="ds-fill cyan" style={{ width: `${data.devices?.percentages?.mobile ?? 0}%` }} /></div>
                            </div>
                        </div>

                        <div className="device-simple-row desktop">
                            <div className="ds-left">
                                <div className="ds-icon-box orange"><Monitor size={18} /></div>
                                <div>
                                    <h4>{lang === 'en' ? 'Desktop / PC' : 'کۆمپیوتەر و لاپتۆپ'}</h4>
                                    <span>{data.devices?.desktop || 0} {lang === 'en' ? 'visits' : 'سەردان'}</span>
                                </div>
                            </div>
                            <div className="ds-right">
                                <span className="ds-percentage">{data.devices?.percentages?.desktop ?? 0}%</span>
                                <div className="ds-bar"><div className="ds-fill orange" style={{ width: `${data.devices?.percentages?.desktop ?? 0}%` }} /></div>
                            </div>
                        </div>

                        <div className="device-simple-row tablet">
                            <div className="ds-left">
                                <div className="ds-icon-box blue"><Tablet size={18} /></div>
                                <div>
                                    <h4>{lang === 'en' ? 'Tablets / iPads' : 'تابلێت و ئایپاد'}</h4>
                                    <span>{data.devices?.tablet || 0} {lang === 'en' ? 'visits' : 'سەردان'}</span>
                                </div>
                            </div>
                            <div className="ds-right">
                                <span className="ds-percentage">{data.devices?.percentages?.tablet ?? 0}%</span>
                                <div className="ds-bar"><div className="ds-fill blue" style={{ width: `${data.devices?.percentages?.tablet ?? 0}%` }} /></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Timeline Visitors (Weekly, Monthly, Yearly) */}
                <div className="analytics-section-box half-box">
                    <div className="section-box-header">
                        <div className="header-left">
                            <div className="header-icon-box purple-bg">
                                <CalendarDays size={20} color="#a855f7" />
                            </div>
                            <div>
                                <h2>{lang === 'en' ? 'Visitors Timeline' : 'ئاماری سەردانکەران بەپێی کات'}</h2>
                                <p>{lang === 'en' ? 'Weekly, Monthly and Yearly Trends' : 'کۆی سەردانکەرانی هەفتانە، مانگانە و ساڵانە'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="timeline-stats-list">
                        <div className="timeline-stat-item">
                            <div className="tsi-icon"><Calendar size={18} /></div>
                            <div className="tsi-info">
                                <span className="tsi-label">{lang === 'en' ? "This Week's Visitors" : 'سەردانکەرانی ئەم هەفتەیە'}</span>
                                <strong className="tsi-val">{data.visitors.weekly.toLocaleString()}</strong>
                            </div>
                        </div>

                        <div className="timeline-stat-item">
                            <div className="tsi-icon"><CalendarDays size={18} /></div>
                            <div className="tsi-info">
                                <span className="tsi-label">{lang === 'en' ? "This Month's Visitors" : 'سەردانکەرانی ئەم مانگە'}</span>
                                <strong className="tsi-val">{data.visitors.monthly.toLocaleString()}</strong>
                            </div>
                        </div>

                        <div className="timeline-stat-item">
                            <div className="tsi-icon"><Activity size={18} /></div>
                            <div className="tsi-info">
                                <span className="tsi-label">{lang === 'en' ? "This Year's Visitors" : 'سەردانکەرانی ئەم ساڵ'}</span>
                                <strong className="tsi-val">{data.visitors.yearly.toLocaleString()}</strong>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* ========================================================= */}
            {/* 🔥 SECTION 4: TOP WATCHED RANKINGS LEADERBOARD */}
            {/* ========================================================= */}
            <div className="analytics-section-box top-watched-section">
                <div className="section-box-header">
                    <div className="header-left">
                        <div className="header-icon-box gold-bg">
                            <Flame size={22} color="#f59e0b" />
                        </div>
                        <div>
                            <h2>{lang === 'en' ? 'Most Watched Rankings' : 'ڕیزبەندیی پڕبینەرترین فیلم و زنجیرەکان'}</h2>
                            <p>{lang === 'en' ? 'Filter by time period to discover top titles' : 'پڕبینەرترین بەرهەمەکان بەپێی کات'}</p>
                        </div>
                    </div>

                    {/* Period Tabs */}
                    <div className="period-tabs-wrap">
                        <button 
                            className={`period-tab-btn ${selectedPeriod === 'thisWeek' ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod('thisWeek')}
                        >
                            <CalendarDays size={14} />
                            <span>{lang === 'en' ? 'This Week' : 'ئەم هەفتەیە'}</span>
                        </button>
                        <button 
                            className={`period-tab-btn ${selectedPeriod === 'thisMonth' ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod('thisMonth')}
                        >
                            <Calendar size={14} />
                            <span>{lang === 'en' ? 'This Month' : 'ئەم مانگە'}</span>
                        </button>
                        <button 
                            className={`period-tab-btn ${selectedPeriod === 'thisYear' ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod('thisYear')}
                        >
                            <Activity size={14} />
                            <span>{lang === 'en' ? 'This Year' : 'ئەم ساڵ'}</span>
                        </button>
                        <button 
                            className={`period-tab-btn ${selectedPeriod === 'allTime' ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod('allTime')}
                        >
                            <Award size={14} />
                            <span>{lang === 'en' ? 'All Time' : 'کۆی گشتی'}</span>
                        </button>
                    </div>
                </div>

                {/* Leaderboard List */}
                {(() => {
                    const currentList = data.topWatched ? data.topWatched[selectedPeriod] || [] : [];
                    if (currentList.length === 0) {
                        return (
                            <div className="top-watched-empty">
                                <Film size={32} color="#64748b" />
                                <p>{lang === 'en' ? 'No viewing records for this timeframe yet.' : 'هێشتا هیچ تۆمارێکی بینین بۆ ئەم ماوەیە نییە.'}</p>
                            </div>
                        );
                    }

                    return (
                        <div className="top-watched-list">
                            {currentList.map((item, idx) => {
                                const rank = idx + 1;
                                const isTop3 = rank <= 3;
                                const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

                                return (
                                    <div key={item.id} className={`top-watched-row ${isTop3 ? `rank-top-${rank}` : ''}`}>
                                        <div className="tw-rank-box">
                                            {medalEmoji}
                                        </div>

                                        <div className="tw-poster-wrap">
                                            <img 
                                                src={item.posterUrl || '/kst-logo.png'} 
                                                alt={item.title} 
                                                className="tw-poster-img"
                                                onError={(e) => { (e.target as any).src = '/kst-logo.png'; }}
                                            />
                                        </div>

                                        <div className="tw-info-box">
                                            <div className="tw-title-row">
                                                <h4 className="tw-title">{item.title}</h4>
                                                <span className={`tw-type-pill ${item.type}`}>
                                                    {item.type === 'series' ? 'زنجیرە' : item.type === 'animation' ? 'ئەنیمەیشن' : 'فیلم'}
                                                </span>
                                                {item.year && <span className="tw-year">{item.year}</span>}
                                            </div>
                                            {item.genre && <span className="tw-genre">{item.genre}</span>}

                                            {/* Progress Bar */}
                                            <div className="tw-progress-wrap">
                                                <div className="tw-progress-fill" style={{ width: `${Math.max(6, item.percentage)}%` }} />
                                            </div>
                                        </div>

                                        <div className="tw-views-box">
                                            <span className="tw-views-num">{item.views.toLocaleString()}</span>
                                            <span className="tw-views-label">{lang === 'en' ? 'Views' : 'بینین'}</span>
                                        </div>

                                        <Link to={`/watch/${item.id}`} className="tw-action-btn" title="سەیرکردن">
                                            <Play size={15} fill="currentColor" />
                                        </Link>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </div>

            {/* Genre Preference Badges */}
            {data.genreStats && data.genreStats.length > 0 && (
                <div className="analytics-section-box genre-box">
                    <div className="section-box-header">
                        <div className="header-left">
                            <div className="header-icon-box purple-bg">
                                <Sparkles size={18} color="#a855f7" />
                            </div>
                            <div>
                                <h2>{lang === 'en' ? 'Top Favorite Genres' : 'پڕبینەرترین چەشنەکان'}</h2>
                            </div>
                        </div>
                    </div>
                    <div className="genre-pills-container">
                        {data.genreStats.map((g, idx) => (
                            <div key={idx} className="genre-stat-pill">
                                <span className="g-name">{g.genre}</span>
                                <span className="g-count">{g.count.toLocaleString()} {lang === 'en' ? 'views' : 'بینەر'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}
