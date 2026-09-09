import { Link, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { 
    Settings, Edit2, Play, Bookmark, Film, Tv, CreditCard, ShoppingCart, 
    Clock, CalendarDays, Calendar, X, Zap, Check, Image as ImageIcon, 
    AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Brain, Trophy, 
    Sparkles, BookOpen, Layers, Volume2, Bell, Smartphone, Camera, Loader2, Trash2
} from 'lucide-react';
import axios from '../api/client';
import AchievementsGrid from '../components/AchievementsGrid';
import { calculateUserXP, getUserRank } from '../utils/achievements';
import { OptimizedImage } from '../components/OptimizedImage';
import { subscribeToPushNotifications } from '../utils/pushNotifications';
import './Profile.css';

// Media Item Interface
interface MediaItem {
    id: string;
    _id?: string;
    title: string;
    type: 'movie' | 'series';
    posterUrl: string;
    posterCloudUrl?: string;
    poster?: string;
    genre?: string;
    year?: string | number;
    imdbRating?: string | number;
}

// Helper to calculate stats
const getStats = (dailyStats: Record<string, { watchMinutes: number; sentencesSeen: number }> | undefined, period: 'day' | 'week' | 'month') => {
    if (!dailyStats) return { watchMinutes: 0, sentencesSeen: 0 };
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    let minutes = 0;
    let sentences = 0;

    Object.entries(dailyStats).forEach(([dateStr, stats]) => {
        let isIncluded = false;
        
        if (period === 'day') {
            isIncluded = dateStr === todayStr;
        } else {
            const d = new Date(dateStr);
            const todayDate = new Date(todayStr);
            const diffTime = Math.abs(todayDate.getTime() - d.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (period === 'week') {
                isIncluded = diffDays <= 7 && d <= todayDate;
            } else if (period === 'month') {
                isIncluded = diffDays <= 30 && d <= todayDate;
            }
        }

        if (isIncluded) {
            minutes += stats.watchMinutes || 0;
            sentences += stats.sentencesSeen || 0;
        }
    });

    return { watchMinutes: minutes, sentencesSeen: sentences };
};

// Helper to calculate streak
const getStreak = (dailyStats: Record<string, { watchMinutes: number; sentencesSeen: number }> | undefined, dailyGoal: number) => {
    if (!dailyStats) return 0;
    let streak = 0;
    const now = new Date();
    
    for (let i = 0; i < 365; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        const stats = dailyStats[dateStr];
        if (stats && stats.watchMinutes >= dailyGoal) {
            streak++;
        } else if (i === 0) {
            continue;
        } else {
            break;
        }
    }
    return streak;
};

export default function Profile() {
    const navigate = useNavigate();
    const { user, refreshUser, syncProgress } = useAuth();
    const { lang, t } = useLanguage();

    // Main Tab State: 'media' | 'achievements' | 'notifications'
    const [activeTab, setActiveTab] = useState<'media' | 'achievements' | 'notifications'>('media');

    // Media library sub-filter
    const [mediaSubTab, setMediaSubTab] = useState<'all' | 'movies' | 'series' | 'watchlater'>('all');

    // Media lists
    const [favoriteMovies, setFavoriteMovies] = useState<MediaItem[]>([]);
    const [favoriteSeries, setFavoriteSeries] = useState<MediaItem[]>([]);
    const [watchLaterItems, setWatchLaterItems] = useState<MediaItem[]>([]);

    // Notifications state
    const [showOlderNotifications, setShowOlderNotifications] = useState(false);

    // Fetch Favorite Media
    useEffect(() => {
        if (user?.favorites && user.favorites.length > 0) {
            const fetchFavorites = async () => {
                try {
                    const response = await axios.post('/api/media/favorites', { ids: user.favorites });
                    const movies = response.data.filter((item: MediaItem) => item.type === 'movie');
                    const series = response.data.filter((item: MediaItem) => item.type === 'series');
                    setFavoriteMovies(movies);
                    setFavoriteSeries(series);
                } catch (error) {
                    console.error('Failed to fetch favorite media:', error);
                }
            };
            fetchFavorites();
        } else {
            setFavoriteMovies([]);
            setFavoriteSeries([]);
        }
    }, [user?.favorites]);

    // Fetch Watch Later Media
    useEffect(() => {
        if (user?.watchLater && user.watchLater.length > 0) {
            const fetchWatchLater = async () => {
                try {
                    const response = await axios.post('/api/media/watchlater', { ids: user.watchLater });
                    setWatchLaterItems(response.data);
                } catch (error) {
                    console.error('Failed to fetch watch later media:', error);
                }
            };
            fetchWatchLater();
        } else {
            setWatchLaterItems([]);
        }
    }, [user?.watchLater]);

    const [imgError, setImgError] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Check if user has uploaded a custom avatar or if Google provided an actual photo
    const rawAvatar = user?.avatar || user?.avatarUrl || '';
    const isGoogleDefault = rawAvatar.includes('lh3.googleusercontent.com/a/ACg8');
    const hasCustomAvatar = Boolean(rawAvatar && !isGoogleDefault && !imgError);
    const avatarUrl = rawAvatar;

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert(lang === 'en' ? 'Image size must be less than 5MB' : 'قەبارەی وێنە نابێت لە 5MB زیاتر بێت');
            return;
        }

        const formData = new FormData();
        formData.append('avatar', file);

        setUploadingAvatar(true);
        try {
            const res = await axios.post('/api/user/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                setImgError(false);
                await refreshUser();
            }
        } catch (err: any) {
            console.error('Failed to upload avatar', err);
            alert(err.response?.data?.error || (lang === 'en' ? 'Failed to upload photo' : 'بارکردنی وێنە سەرکەوتوو نەبوو'));
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleRemoveAvatar = async () => {
        if (!window.confirm(lang === 'en' ? 'Remove photo and use letter avatar?' : 'دڵنیایت لە لابردنی وێنەکە و بەکارهێنانی پیتی سەرەتا؟')) return;
        setUploadingAvatar(true);
        try {
            await axios.post('/api/user/avatar', { avatarUrl: '' });
            setImgError(true);
            await refreshUser();
        } catch (err) {
            console.error('Failed to remove avatar', err);
        } finally {
            setUploadingAvatar(false);
        }
    };

    // Daily & Periodic stats
    const dailyStats = getStats(user?.dailyStats, 'day');
    const weeklyStats = getStats(user?.dailyStats, 'week');
    const monthlyStats = getStats(user?.dailyStats, 'month');

    // Daily Goal management
    const goalStorageKey = `ks_daily_goal_${user?.id || 'guest'}`;
    const storedGoal = Number(localStorage.getItem(goalStorageKey) || '0');
    const resolvedDailyGoal = storedGoal > 0 ? storedGoal : (user?.dailyGoal || 15);

    const [isEditingGoal, setIsGoalEditing] = useState(false);
    const [tempGoal, setTempGoal] = useState(resolvedDailyGoal);
    const dailyGoal = resolvedDailyGoal;

    useEffect(() => {
        setTempGoal(resolvedDailyGoal);
    }, [resolvedDailyGoal]);

    const effectiveGoal = isEditingGoal ? tempGoal : dailyGoal;
    const streak = getStreak(user?.dailyStats, effectiveGoal);
    const goalProgress = Math.min((dailyStats.watchMinutes / effectiveGoal) * 100, 100);

    const updateGoal = async () => {
        try {
            localStorage.setItem(goalStorageKey, String(tempGoal));
            await syncProgress({ dailyGoal: tempGoal });
            setIsGoalEditing(false);
        } catch (err) {
            console.error('Failed to update goal', err);
        }
    };

    // XP and Rank calculations
    const xp = calculateUserXP(user);
    const rank = getUserRank(xp);
    const currentLevel = user?.level || localStorage.getItem('kurdish_stream_user_level') || null;

    // Web Push State
    const [pushStatus, setPushStatus] = useState<'default' | 'enabled' | 'denied'>('default');
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') setPushStatus('enabled');
            else if (Notification.permission === 'denied') setPushStatus('denied');
        }
    }, []);

    const handleEnablePush = async () => {
        const ok = await subscribeToPushNotifications();
        if (ok) setPushStatus('enabled');
    };

    if (!user) {
        return (
            <div className="profile-loading">
                <p>{t('loading')}</p>
            </div>
        );
    }

    const handleTabChange = async (tab: 'media' | 'achievements' | 'notifications') => {
        setActiveTab(tab);
        if (tab === 'notifications') {
            try {
                await axios.post('/api/user/notifications/read');
                await refreshUser();
            } catch (error) {
                console.error('Failed to mark notifications as read:', error);
            }
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await axios.post('/api/user/notifications/read');
            await refreshUser();
        } catch (error) {
            console.error('Failed to mark notifications as read:', error);
        }
    };

    const handleNotificationClick = async (notif: any) => {
        if (!notif) return;
        if (!notif.read && notif.id) {
            try {
                await axios.post(`/api/user/notifications/${notif.id}/read`);
                await refreshUser();
            } catch (e) {}
        }
        if (notif.link) {
            navigate(notif.link);
        }
    };

    // Filtered media items based on sub-tab
    const getDisplayedMedia = () => {
        if (mediaSubTab === 'movies') return favoriteMovies;
        if (mediaSubTab === 'series') return favoriteSeries;
        if (mediaSubTab === 'watchlater') return watchLaterItems;
        // 'all': combine all unique
        const combined = [...favoriteMovies, ...favoriteSeries, ...watchLaterItems];
        const seen = new Set();
        return combined.filter(item => {
            const id = item.id || item._id;
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    };

    const displayedMedia = getDisplayedMedia();

    return (
        <div className="profile-page modern-profile">
            {/* 1. HERO IDENTITY BANNER */}
            <div className="profile-hero-modern">
                <div 
                    className="profile-blur-bg" 
                    style={{ backgroundImage: hasCustomAvatar ? `url(${avatarUrl})` : undefined }}
                ></div>

                <div className="profile-hero-content-modern">
                    <div 
                        className="profile-avatar-wrapper"
                        onClick={() => fileInputRef.current?.click()}
                        title={lang === 'en' ? 'Click to change profile picture' : 'کلیک بکە بۆ گۆڕینی وێنەی پرۆفایل 📷'}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleAvatarUpload} 
                            accept="image/*" 
                            style={{ display: 'none' }} 
                        />

                        {hasCustomAvatar ? (
                            <img 
                                src={avatarUrl} 
                                alt="" 
                                onError={() => setImgError(true)} 
                                className="profile-avatar-modern" 
                            />
                        ) : (
                            <div className="profile-avatar-letter">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                        )}

                        <button 
                            type="button" 
                            className="profile-avatar-upload-btn" 
                            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                            title={lang === 'en' ? 'Change Photo' : 'گۆڕینی وێنە 📷'}
                            disabled={uploadingAvatar}
                        >
                            {uploadingAvatar ? (
                                <Loader2 size={16} className="spinning" color="#ffffff" />
                            ) : (
                                <Camera size={16} color="#ffffff" strokeWidth={2.2} />
                            )}
                        </button>

                        <div className="avatar-level-badge">
                            <span>Lvl {rank.level}</span>
                        </div>
                    </div>

                    <div className="profile-info-header">
                        <div className="profile-title-row">
                            <h1 className="profile-name-modern">{user.username}</h1>
                            {user.role === 'admin' || user.role === 'super_admin' ? (
                                <span className="profile-role-badge admin">👑 {lang === 'en' ? 'Administrator' : 'سەرپەرشتیار'}</span>
                            ) : (
                                <span className="profile-role-badge vip">✨ VIP Member</span>
                            )}
                        </div>
                        <p className="profile-handle-modern">@{user.username.toLowerCase()}</p>
                    </div>

                    <div className="profile-header-actions">
                        <button className="btn-modern-action" onClick={() => navigate('/assessment')}>
                            <Brain size={16} />
                            <span>{currentLevel ? `${lang === 'en' ? 'Level' : 'ئاستی'}: ${currentLevel}` : (lang === 'en' ? 'Test English' : 'تاقیکردنەوەی ئاست')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. TOP 3 MASTER METRIC CARDS */}
            <div className="profile-master-metrics">
                {/* Card 1: Credits & Subscription Plan */}
                <div className="metric-card credits-card">
                    <div className="metric-card-header">
                        <div className="metric-icon-wrap credits">
                            <Zap size={22} color="#fbbf24" fill="#fbbf24" />
                        </div>
                        <button className="btn-metric-action" onClick={() => navigate('/buy-credits')}>
                            <ShoppingCart size={14} />
                            <span>{user?.plan ? (lang === 'en' ? 'Renew / Upgrade' : 'نوێکردنەوە / کڕین') : (lang === 'en' ? 'Get Plan' : '+ کڕینی پلان')}</span>
                        </button>
                    </div>
                    <div className="metric-card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span className="metric-label">{lang === 'en' ? 'Available Credits' : 'کرێدیتی بەردەست'}</span>
                            {user.plan && (
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                                    {user.plan}
                                </span>
                            )}
                        </div>
                        <h2 className="metric-value credits-val">{(user.credits || 0).toLocaleString()}</h2>
                        <span className="metric-subtext" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {user.subscriptionExpiresAt ? (
                                (() => {
                                    const days = Math.max(0, Math.ceil((user.subscriptionExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
                                    return days > 0
                                        ? (lang === 'en' ? `⏳ ${days} days remaining on 30-day plan` : `⏳ ${days} ڕۆژ لە پلانی مانگانە ماوە`)
                                        : (lang === 'en' ? '⚠️ Plan expired - Top-up to activate' : '⚠️ پلانی مانگانە بەسەرچوو - نوێی بکەرەوە');
                                })()
                            ) : (
                                lang === 'en' ? 'For AI subtitles, flashcards & tools' : 'تایبەت بە سەبتایتڵ، فلاشکارت و ئامرازەکان'
                            )}
                        </span>
                    </div>
                </div>

                {/* Card 2: Language Rank & XP */}
                <div className="metric-card rank-card" onClick={() => handleTabChange('achievements')}>
                    <div className="metric-card-header">
                        <div className="metric-icon-wrap rank">
                            <Trophy size={22} color="#a78bfa" />
                        </div>
                        <span className="rank-level-chip">Level {rank.level}</span>
                    </div>
                    <div className="metric-card-body">
                        <span className="metric-label">{lang === 'en' ? rank.titleEn : rank.titleKu}</span>
                        <h2 className="metric-value rank-val">{xp.toLocaleString()} <span className="unit">XP</span></h2>
                        <span className="metric-subtext link-hint">{lang === 'en' ? 'View Badges & Awards ➜' : 'بینینی باج و دەستکەوتەکان ➜'}</span>
                    </div>
                </div>

                {/* Card 3: Daily Streak & Goal */}
                <div className="metric-card streak-card">
                    <div className="metric-card-header">
                        <div className="metric-icon-wrap streak">
                            <span className="flame-icon">🔥</span>
                        </div>
                        {isEditingGoal ? (
                            <div className="goal-inline-edit">
                                <div className="goal-input-stepper">
                                    <button type="button" className="btn-goal-step" onClick={() => setTempGoal(g => Math.max(5, g - 5))}>-</button>
                                    <input 
                                        type="number" 
                                        value={tempGoal} 
                                        onChange={(e) => setTempGoal(Math.max(1, parseInt(e.target.value) || 0))}
                                        min="1"
                                        max="300"
                                        autoFocus
                                    />
                                    <span className="goal-unit-label">خ</span>
                                    <button type="button" className="btn-goal-step" onClick={() => setTempGoal(g => Math.min(300, g + 5))}>+</button>
                                </div>
                                <button onClick={updateGoal} className="btn-goal-save" title={lang === 'en' ? 'Save' : 'پاشەکەوتکردن'}><Check size={12} strokeWidth={3} /></button>
                                <button onClick={() => { setIsGoalEditing(false); setTempGoal(dailyGoal); }} className="btn-goal-cancel" title={lang === 'en' ? 'Cancel' : 'پاشگەزبوونەوە'}><X size={12} strokeWidth={3} /></button>
                            </div>
                        ) : (
                            <button className="btn-metric-action edit-goal" onClick={() => setIsGoalEditing(true)} title={lang === 'en' ? 'Edit daily goal' : 'دەستکاریکردنی ئامانجی ڕۆژانە'}>
                                <Edit2 size={11} />
                                <span>{dailyGoal} {t('minutes')}</span>
                            </button>
                        )}
                    </div>
                    <div className="metric-card-body">
                        <span className="metric-label">{lang === 'en' ? 'Daily Streak' : 'بەردەوامی ڕۆژانە'}</span>
                        <h2 className="metric-value streak-val">{streak} <span className="unit">{lang === 'en' ? 'Days' : 'ڕۆژ'}</span></h2>
                        
                        {/* Progress bar */}
                        <div className="mini-streak-bar">
                            <div className="mini-streak-fill" style={{ width: `${goalProgress}%` }}></div>
                        </div>
                        <span className="metric-subtext">
                            {goalProgress >= 100 
                                ? (lang === 'en' ? 'Goal Achieved Today! 🎉' : 'ئامانجی ئەمڕۆ بەدیهات! 🎉') 
                                : `${dailyStats.watchMinutes} / ${dailyGoal} ${lang === 'en' ? 'mins watched today' : 'خولەک سەیرکراوە'}`}
                        </span>
                    </div>
                </div>
            </div>

            {/* 3. MODERN TAB NAVIGATION BAR */}
            <div className="profile-tabs-modern">
                <button 
                    className={`modern-tab-btn ${activeTab === 'media' ? 'active' : ''}`} 
                    onClick={() => handleTabChange('media')}
                >
                    <Film size={17} />
                    <span>{lang === 'en' ? 'My Library' : 'فیلم و دراماکانم'}</span>
                    <span className="tab-pill-count">{favoriteMovies.length + favoriteSeries.length + watchLaterItems.length}</span>
                </button>

                <button 
                    className={`modern-tab-btn ${activeTab === 'achievements' ? 'active' : ''}`} 
                    onClick={() => handleTabChange('achievements')}
                >
                    <Trophy size={17} />
                    <span>{lang === 'en' ? 'Achievements' : 'دەستکەوت و باجەکان'}</span>
                </button>

                <button 
                    className={`modern-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`} 
                    onClick={() => handleTabChange('notifications')}
                >
                    <span>🔔 {lang === 'en' ? 'Notifications' : 'ئاگادارییەکان'}</span>
                    {user?.notifications?.some(n => !n.read) && <span className="notification-dot-pulse"></span>}
                </button>
            </div>

            {/* 4. TAB CONTENTS AREA */}
            <div className="profile-tab-content-wrapper">
                
                {/* TAB 1: MEDIA LIBRARY */}
                {activeTab === 'media' && (
                    <div className="media-library-section">
                        {/* Media Sub-filter pills */}
                        <div className="media-subfilter-bar">
                            <button 
                                className={`subfilter-pill ${mediaSubTab === 'all' ? 'active' : ''}`}
                                onClick={() => setMediaSubTab('all')}
                                title={lang === 'en' ? 'All Saved' : 'هەموو پاشەکەوتکراوەکان'}
                            >
                                <Layers size={15} />
                                <span>{lang === 'en' ? 'All' : 'هەمووی'}</span>
                                <span className="subfilter-count">({favoriteMovies.length + favoriteSeries.length + watchLaterItems.length})</span>
                            </button>
                            <button 
                                className={`subfilter-pill ${mediaSubTab === 'movies' ? 'active' : ''}`}
                                onClick={() => setMediaSubTab('movies')}
                                title={lang === 'en' ? 'Favorite Movies' : 'فیلمە دڵخوازەکان'}
                            >
                                <Film size={15} />
                                <span>{lang === 'en' ? 'Movies' : 'فیلم'}</span>
                                <span className="subfilter-count">({favoriteMovies.length})</span>
                            </button>
                            <button 
                                className={`subfilter-pill ${mediaSubTab === 'series' ? 'active' : ''}`}
                                onClick={() => setMediaSubTab('series')}
                                title={lang === 'en' ? 'Favorite Series' : 'زنجیرە دڵخوازەکان'}
                            >
                                <Tv size={15} />
                                <span>{lang === 'en' ? 'Series' : 'زنجیرە'}</span>
                                <span className="subfilter-count">({favoriteSeries.length})</span>
                            </button>
                            <button 
                                className={`subfilter-pill ${mediaSubTab === 'watchlater' ? 'active' : ''}`}
                                onClick={() => setMediaSubTab('watchlater')}
                                title={lang === 'en' ? 'Watch Later' : 'سەیرکردنی دواتر'}
                            >
                                <Bookmark size={15} />
                                <span>{lang === 'en' ? 'Watchlist' : 'دواتر'}</span>
                                <span className="subfilter-count">({watchLaterItems.length})</span>
                            </button>
                        </div>

                        {/* Media Grid */}
                        {displayedMedia.length > 0 ? (
                            <div className="profile-media-grid">
                                {displayedMedia.map(item => {
                                    const posterSrc = item.posterCloudUrl || item.posterUrl || item.poster || '/placeholder.png';
                                    const linkPath = item.type === 'series' ? `/series/${item.id || item._id}` : `/movie/${item.id || item._id}`;
                                    
                                    return (
                                        <Link key={item.id || item._id} to={linkPath} className="modern-media-card">
                                            <div className="media-card-poster-wrap">
                                                <OptimizedImage 
                                                    src={posterSrc} 
                                                    alt={item.title} 
                                                    isThumbnail={true}
                                                    className="media-poster-img" 
                                                />
                                                <div className="media-card-overlay">
                                                    <div className="media-play-btn-circle">
                                                        <Play size={20} fill="#ffffff" color="#ffffff" />
                                                    </div>
                                                </div>
                                                <span className="media-type-tag">
                                                    {item.type === 'series' ? (lang === 'en' ? 'Series' : 'زنجیرە') : (lang === 'en' ? 'Movie' : 'فیلم')}
                                                </span>
                                            </div>
                                            <div className="media-card-info">
                                                <h4 className="media-card-title">{item.title}</h4>
                                                {item.year && <span className="media-card-year">{item.year}</span>}
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="profile-empty-state">
                                <Film size={48} color="#64748b" />
                                <h3>{lang === 'en' ? 'No media items here' : 'هیچ فیلم یان درامایەک لەم بەشەدا نییە'}</h3>
                                <p>{lang === 'en' ? 'Click the favorite or bookmark button on movies to add them to your collection.' : 'دەتوانیت لە کاتی سەیرکردنی فیلمەکان دوگمەی دڵخواز یان دواتر سەیریکە لێبدەیت تا لێرە کۆببنەوە.'}</p>
                                <button className="btn-empty-action" onClick={() => navigate('/')}>
                                    <Play size={16} />
                                    <span>{lang === 'en' ? 'Browse Movies' : 'گەڕان بەناو فیلمەکاندا'}</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: ACHIEVEMENTS & BADGES */}
                {activeTab === 'achievements' && (
                    <div className="profile-achievements-tab">
                        <AchievementsGrid streakDays={streak} />
                    </div>
                )}

                {/* TAB 3: NOTIFICATIONS */}
                {activeTab === 'notifications' && (() => {
                    const isSameDay = (d1: Date, d2: Date) => {
                        return d1.getFullYear() === d2.getFullYear() &&
                               d1.getMonth() === d2.getMonth() &&
                               d1.getDate() === d2.getDate();
                    };

                    const allNotifications = user?.notifications ? [...user.notifications].reverse() : [];
                    const today = new Date();
                    const todayNotifications = allNotifications.filter(n => isSameDay(new Date(n.date), today));
                    const olderNotifications = allNotifications.filter(n => !isSameDay(new Date(n.date), today));

                    return (
                        <div className="notifications-content">
                            {/* Web Push Subscription Banner */}
                            {pushStatus !== 'enabled' && (
                                <div className="push-permission-card">
                                    <div className="push-card-info">
                                        <div className="push-bell-icon">
                                            <Bell size={22} color="#8b5cf6" />
                                        </div>
                                        <div>
                                            <h4>{lang === 'en' ? 'Get Instant Mobile Notifications' : 'ئاگاداری ڕاستەوخۆ لەسەر مۆبایلەکەت چالاک بکە'}</h4>
                                            <p>{lang === 'en' ? 'Get notified when new movies are added, credit receipts are approved, or to protect your daily streak.' : 'لە کاتی بڵاوبوونەوەی فیلمی نوێ، پەسەندکردنی وەسڵ و کەمبوونەوەی خاڵەکانت دەستبەجێ نۆتفیکەیشن لەسەر مۆبایلەکەت ببینە.'}</p>
                                        </div>
                                    </div>
                                    <button className="btn-enable-push" onClick={handleEnablePush}>
                                        <Smartphone size={16} />
                                        <span>{lang === 'en' ? 'Enable Notifications' : 'چالاککردنی ئاگاداری مۆبایل'}</span>
                                    </button>
                                </div>
                            )}

                            {allNotifications.length === 0 ? (
                                <div className="profile-empty-state">
                                    <AlertCircle size={48} color="#64748b" />
                                    <h3>{lang === 'en' ? 'No notifications yet' : 'هیچ ئاگادارییەکت نییە'}</h3>
                                    <p>{lang === 'en' ? 'All server updates, level-ups, and payment confirmations will arrive here.' : 'تەواوی ئاگادارییەکانی سێرڤەر و پەسەندکردنی وەسڵەکانت لێرە دەردەکەون.'}</p>
                                </div>
                            ) : (
                                <div className="notifications-container-grouped">
                                    <div className="notifications-group-header">
                                        <div className="group-title-wrap">
                                            <h3>{lang === 'en' ? "Today's Notifications" : 'ئاگادارییەکانی ئەمڕۆ'}</h3>
                                            <span className="badge-count">{todayNotifications.length}</span>
                                        </div>
                                        {allNotifications.some(n => !n.read) && (
                                            <button className="btn-mark-read" onClick={handleMarkAllAsRead}>
                                                <Check size={14} /> {lang === 'en' ? 'Mark all as read' : 'هەموو وەک خوێندراوە دیاری بکە'}
                                            </button>
                                        )}
                                    </div>

                                    {todayNotifications.length === 0 ? (
                                        <div className="empty-day-notifications">
                                            <span>{lang === 'en' ? 'No notifications today' : 'هیچ ئاگادارییەکی نوێ نییە بۆ ئەمڕۆ'}</span>
                                        </div>
                                    ) : (
                                        <div className="notifications-list">
                                            {todayNotifications.map(notification => {
                                                const title = notification.title || '';
                                                const msg = notification.message || '';
                                                const isError = notification.type === 'error' || title.includes('ڕەتکرایەوە') || title.includes('Rejected') || title.includes('هەڵە');
                                                const isWarning = notification.type === 'warning' || title.includes('⚠️') || title.includes('ئاگاداری') || title.includes('نادروست') || title.includes('Warning') || title.includes('چاوەڕوان') || msg.includes('نەناسرا') || msg.includes('ڕاپۆرت');

                                                return (
                                                    <div 
                                                        key={notification.id} 
                                                        className={`notification-item ${!notification.read ? 'unread' : ''} ${notification.link ? 'clickable' : ''}`}
                                                        onClick={() => handleNotificationClick(notification)}
                                                    >
                                                        <div className="notification-icon">
                                                            {isError ? (
                                                                <div className="notif-icon-circle error"><AlertCircle size={20} color="#ef4444" /></div>
                                                            ) : isWarning ? (
                                                                <div className="notif-icon-circle warning"><AlertTriangle size={20} color="#f59e0b" /></div>
                                                            ) : (
                                                                <div className="notif-icon-circle success"><Check size={20} color="#10b981" /></div>
                                                            )}
                                                        </div>
                                                        <div className="notification-details">
                                                            <div className="notif-title-row">
                                                                <h4>{notification.title || 'ئاگاداری'}</h4>
                                                                {notification.link && <span className="notif-link-badge">بینین ➜</span>}
                                                            </div>
                                                            <p>{notification.message}</p>
                                                            <span className="notification-date">
                                                                {new Date(notification.date).toLocaleTimeString('ku-IQ', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {olderNotifications.length > 0 && (
                                        <div className="older-notifications-wrapper">
                                            <button 
                                                className="btn-toggle-older"
                                                onClick={() => setShowOlderNotifications(!showOlderNotifications)}
                                            >
                                                <span>{lang === 'en' ? 'Older Notifications' : 'ئاگادارییە کۆنەکان'} ({olderNotifications.length})</span>
                                                {showOlderNotifications ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>

                                            {showOlderNotifications && (
                                                <div className="notifications-list older-list">
                                                    {olderNotifications.map(notification => {
                                                        const title = notification.title || '';
                                                        const msg = notification.message || '';
                                                        const isError = notification.type === 'error' || title.includes('ڕەتکرایەوە') || title.includes('Rejected') || title.includes('هەڵە');
                                                        const isWarning = notification.type === 'warning' || title.includes('⚠️') || title.includes('ئاگاداری') || title.includes('نادروست') || title.includes('Warning') || title.includes('چاوەڕوان') || msg.includes('نەناسرا') || msg.includes('ڕاپۆرت');

                                                        return (
                                                            <div 
                                                                key={notification.id} 
                                                                className={`notification-item ${!notification.read ? 'unread' : ''} older-item ${notification.link ? 'clickable' : ''}`}
                                                                onClick={() => handleNotificationClick(notification)}
                                                            >
                                                                <div className="notification-icon">
                                                                    {isError ? (
                                                                        <div className="notif-icon-circle error"><AlertCircle size={20} color="#ef4444" /></div>
                                                                    ) : isWarning ? (
                                                                        <div className="notif-icon-circle warning"><AlertTriangle size={20} color="#f59e0b" /></div>
                                                                    ) : (
                                                                        <div className="notif-icon-circle success"><Check size={20} color="#10b981" /></div>
                                                                    )}
                                                                </div>
                                                                <div className="notification-details">
                                                                    <div className="notif-title-row">
                                                                        <h4>{notification.title || 'ئاگاداری'}</h4>
                                                                        {notification.link && <span className="notif-link-badge">بینین ➜</span>}
                                                                    </div>
                                                                    <p>{notification.message}</p>
                                                                    <span className="notification-date">
                                                                        {new Date(notification.date).toLocaleDateString('ku-IQ', {
                                                                            year: 'numeric',
                                                                            month: 'long',
                                                                            day: 'numeric'
                                                                        })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })()}

            </div>
        </div>
    );
}
