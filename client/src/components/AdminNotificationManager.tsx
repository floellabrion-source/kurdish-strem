import React, { useState, useEffect } from 'react';
import { Bell, Send, Clock, ShieldAlert, Sparkles, Check, Flame, Moon, Smartphone, RefreshCw, Layers } from 'lucide-react';
import axios from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './AdminNotificationManager.css';

interface NotificationSettings {
    inactivityReminderDays: number;
    inactivityPenaltyXP: number;
    reminderFrequencyDays: number;
    autoNewContentPush: boolean;
    autoCreditStatusPush: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    lastUpdatedBy?: string;
    lastUpdatedAt?: number;
}

export const AdminNotificationManager: React.FC = () => {
    const { lang } = useLanguage();
    const [settings, setSettings] = useState<NotificationSettings>({
        inactivityReminderDays: 3,
        inactivityPenaltyXP: 20,
        reminderFrequencyDays: 3,
        autoNewContentPush: true,
        autoCreditStatusPush: true,
        quietHoursEnabled: false,
        quietHoursStart: "23:00",
        quietHoursEnd: "08:00"
    });

    const [totalSubscribers, setTotalSubscribers] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Broadcast form
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [broadcastUrl, setBroadcastUrl] = useState('/');
    const [selectedPageType, setSelectedPageType] = useState<string>('home');
    const [selectedMovieId, setSelectedMovieId] = useState<string>('');
    const [moviesList, setMoviesList] = useState<any[]>([]);
    const [broadcastType, setBroadcastType] = useState<'info' | 'warning' | 'success'>('info');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);
    const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const [res, moviesRes] = await Promise.all([
                axios.get('/api/admin/notification-settings'),
                axios.get('/api/movies').catch(() => ({ data: [] }))
            ]);
            if (res.data.success) {
                setSettings(res.data.settings);
                setTotalSubscribers(res.data.totalSubscribers || 0);
            }
            if (moviesRes.data && Array.isArray(moviesRes.data)) {
                setMoviesList(moviesRes.data);
            }
        } catch (err) {
            console.error('Failed to load notification settings:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    // Handle Page Selection Change
    const handlePageTypeChange = (type: string) => {
        setSelectedPageType(type);
        if (type === 'home') {
            setBroadcastUrl('/');
        } else if (type === 'buy_credits') {
            setBroadcastUrl('/buy-credits');
        } else if (type === 'assessment') {
            setBroadcastUrl('/assessment');
        } else if (type === 'profile') {
            setBroadcastUrl('/profile');
        } else if (type === 'specific_movie') {
            if (moviesList.length > 0) {
                const first = moviesList[0];
                setSelectedMovieId(first.id);
                setBroadcastUrl(first.type === 'series' ? `/series/${first.id}` : `/movie/${first.id}`);
            }
        }
    };

    const handleMovieSelect = (mId: string) => {
        setSelectedMovieId(mId);
        const m = moviesList.find(x => x.id === mId);
        if (m) {
            setBroadcastUrl(m.type === 'series' ? `/series/${m.id}` : `/movie/${m.id}`);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setStatusMsg(null);
        try {
            const res = await axios.post('/api/admin/notification-settings', settings);
            if (res.data.success) {
                setSettings(res.data.settings);
                setStatusMsg({ 
                    type: 'success', 
                    text: lang === 'en' ? 'Notification & schedule settings saved successfully ✓' : 'ڕێکخستنەکانی کات و نۆتفیکەیشن بە سەرکەوتوویی پاشەکەوت کران ✓' 
                });
            }
        } catch (err: any) {
            setStatusMsg({ 
                type: 'error', 
                text: err.response?.data?.error || (lang === 'en' ? 'Failed to save settings' : 'نەتوانرا ڕێکخستنەکان پاشەکەوت بکرێن') 
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSendBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
            setStatusMsg({ 
                type: 'error', 
                text: lang === 'en' ? 'Please enter both title and message body' : 'تکایە ناونیشان و دەقی پەیامەکە بنووسە' 
            });
            return;
        }

        const confirmText = lang === 'en' 
            ? 'Are you sure you want to broadcast this notification to all registered users and devices?' 
            : 'ئایا دڵنیایت لە ناردنی ئەم ئاگادارییە بۆ سەرجەم بەکارهێنەران و ئامێرەکان؟';
        if (!window.confirm(confirmText)) {
            return;
        }

        setSendingBroadcast(true);
        setBroadcastResult(null);
        try {
            const res = await axios.post('/api/admin/notifications/broadcast', {
                title: broadcastTitle,
                message: broadcastMessage,
                url: broadcastUrl,
                type: broadcastType
            });
            if (res.data.success) {
                setBroadcastResult(res.data.message);
                setBroadcastTitle('');
                setBroadcastMessage('');
            }
        } catch (err: any) {
            setBroadcastResult(lang === 'en' ? `Broadcast error: ${err.response?.data?.error || err.message}` : `هەڵە لە ناردن: ${err.response?.data?.error || err.message}`);
        } finally {
            setSendingBroadcast(false);
        }
    };

    if (loading) {
        return (
            <div className="admin-notif-loading">
                <RefreshCw className="spin-icon" size={28} />
                <span>{lang === 'en' ? 'Loading notification settings...' : 'بارکردنی ڕێکخستنەکانی نۆتفیکەیشن...'}</span>
            </div>
        );
    }

    return (
        <div className={`admin-notification-manager ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {/* Header Banner */}
            <div className="notif-header-banner">
                <div className="notif-header-info">
                    <div className="notif-icon-badge">
                        <Bell size={24} color="#8b5cf6" />
                    </div>
                    <div>
                        <h2>{lang === 'en' ? 'Push Notifications & Schedule Management' : 'بەڕێوەبردنی نۆتفیکەیشن و کاتەکانی ئاگاداری'}</h2>
                        <p>{lang === 'en' ? 'Configure automated reminder intervals, inactive penalties, and direct broadcasts.' : 'تەنها سەرۆک ئەدمین دەسەڵاتی دەستکاریکردنی کاتەکانی نۆتفیکەیشن و سزای تەمبەڵی هەیە.'}</p>
                    </div>
                </div>

                <div className="notif-stat-pill">
                    <Smartphone size={18} color="#10b981" />
                    <span><strong>{totalSubscribers}</strong> {lang === 'en' ? 'mobile devices connected' : 'ئامێری مۆبایل بەستراونەتەوە'}</span>
                </div>
            </div>

            {statusMsg && (
                <div className={`notif-status-alert ${statusMsg.type}`}>
                    {statusMsg.text}
                </div>
            )}

            <div className="notif-grid-layout">
                {/* 1. Schedule & Timing Configuration Form */}
                <form onSubmit={handleSaveSettings} className="notif-card-box">
                    <div className="card-box-header">
                        <Clock size={20} color="#f59e0b" />
                        <h3>{lang === 'en' ? 'Inactivity Penalty & Reminder Intervals' : 'ڕێکخستنی کاتەکانی سزای تەمبەڵی و ئاگادارییەکان'}</h3>
                    </div>

                    <div className="notif-form-grid">
                        <div className="form-group-notif">
                            <label>
                                <Flame size={16} color="#f97316" />
                                {lang === 'en' ? 'Inactivity days before penalty starts (Inactivity Days):' : 'دوای چەند ڕۆژ ناچالاکی ئاگاداری بنێردرێت؟ (Inactivity Days)'}
                            </label>
                            <div className="input-with-unit">
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    value={settings.inactivityReminderDays}
                                    onChange={e => setSettings({ ...settings, inactivityReminderDays: Math.max(1, parseInt(e.target.value) || 1) })}
                                />
                                <span className="unit-tag">{lang === 'en' ? 'Days' : 'ڕۆژ'}</span>
                            </div>
                            <small>{lang === 'en' ? 'If user does not watch any movies during this period, reminder and penalty activate.' : 'ئەگەر بەکارهێنەر بۆ ئەم ماوەیە هیچ فیلمێک سەیر نەکات، سزاکەی دەکەوێتە کار.'}</small>
                        </div>

                        <div className="form-group-notif">
                            <label>
                                <ShieldAlert size={16} color="#ef4444" />
                                {lang === 'en' ? 'Daily XP penalty deduction (Daily XP Penalty):' : 'ڕۆژانە چەند خاڵی XP کەم بکرێتەوە؟ (Daily XP Penalty)'}
                            </label>
                            <div className="input-with-unit">
                                <input
                                    type="number"
                                    min="0"
                                    max="500"
                                    step="5"
                                    value={settings.inactivityPenaltyXP}
                                    onChange={e => setSettings({ ...settings, inactivityPenaltyXP: Math.max(0, parseInt(e.target.value) || 0) })}
                                />
                                <span className="unit-tag">XP</span>
                            </div>
                            <small>{lang === 'en' ? 'Amount of XP deducted daily from inactive users until they return.' : 'بڕی ئەو خاڵەی ڕۆژانە لە بەکارهێنەری تەمبەڵ لێ دەبڕدرێت تا دەگەڕێتەوە.'}</small>
                        </div>

                        <div className="form-group-notif">
                            <label>
                                <RefreshCw size={16} color="#0284c7" />
                                {lang === 'en' ? 'Reminder repetition frequency (Frequency):' : 'ناردنی ئاگاداری چەند ڕۆژ جارێک دووبارە ببێتەوە؟ (Frequency)'}
                            </label>
                            <div className="input-with-unit">
                                <input
                                    type="number"
                                    min="1"
                                    max="14"
                                    value={settings.reminderFrequencyDays}
                                    onChange={e => setSettings({ ...settings, reminderFrequencyDays: Math.max(1, parseInt(e.target.value) || 1) })}
                                />
                                <span className="unit-tag">{lang === 'en' ? 'Days interval' : 'ڕۆژ جارێک'}</span>
                            </div>
                            <small>{lang === 'en' ? 'To prevent spamming, reminders will be sent once every specified days.' : 'بۆ ئەوەی سپام نەبێت، هەر چەند ڕۆژ جارێک یەک نۆتفیکەیشنی هۆشداری پێ دەگات.'}</small>
                        </div>
                    </div>

                    <div className="notif-toggles-section">
                        <label className="notif-toggle-row">
                            <input
                                type="checkbox"
                                checked={settings.autoNewContentPush}
                                onChange={e => setSettings({ ...settings, autoNewContentPush: e.target.checked })}
                            />
                            <div className="toggle-label-wrap">
                                <strong>{lang === 'en' ? '🎬 Automatic Push on New Movies & Shows' : '🎬 ئاگاداری ئۆتۆماتیکی بۆ فیلم و درامای نوێ'}</strong>
                                <span>{lang === 'en' ? 'Automatically sends a push notification to devices when a new title or episode is published.' : 'لە کاتی بڵاوکردنەوەی فیلم یان ئەڵقەی نوێ، ئاگاداری ڕاستەوخۆ دەچێتە سەر مۆبایلەکان.'}</span>
                            </div>
                        </label>

                        <label className="notif-toggle-row">
                            <input
                                type="checkbox"
                                checked={settings.autoCreditStatusPush}
                                onChange={e => setSettings({ ...settings, autoCreditStatusPush: e.target.checked })}
                            />
                            <div className="toggle-label-wrap">
                                <strong>{lang === 'en' ? '💳 Automatic Notification on Receipt Approval / Rejection' : '💳 ئاگاداری پەسەندکردن یان ڕەتکردنەوەی وەسڵی پارەدان'}</strong>
                                <span>{lang === 'en' ? 'Users receive instant notifications when their payment receipt is approved.' : 'کاتێک وەسڵی بەکارهێنەر پەسەند دەکرێت، دەستبەجێ نۆتفیکەیشنی پێ دەگات.'}</span>
                            </div>
                        </label>

                        <label className="notif-toggle-row">
                            <input
                                type="checkbox"
                                checked={settings.quietHoursEnabled}
                                onChange={e => setSettings({ ...settings, quietHoursEnabled: e.target.checked })}
                            />
                            <div className="toggle-label-wrap">
                                <strong><Moon size={15} /> {lang === 'en' ? 'Quiet Hours Mode (Do Not Disturb)' : 'دۆخی بێدەنگی شەوانە (Quiet Hours)'}</strong>
                                <span>{lang === 'en' ? 'Silences automated notifications during nighttime hours.' : 'لە کاتی دیاریکراودا هیچ نۆتفیکەیشنێکی شەوانە نانێردرێت تا بەکارهێنەر بێزار نەبێت.'}</span>
                            </div>
                        </label>

                        {settings.quietHoursEnabled && (
                            <div className="quiet-hours-inputs">
                                <div>
                                    <label>{lang === 'en' ? 'Quiet Hours Start:' : 'دەستپێکی بێدەنگی:'}</label>
                                    <input
                                        type="time"
                                        value={settings.quietHoursStart}
                                        onChange={e => setSettings({ ...settings, quietHoursStart: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label>{lang === 'en' ? 'Quiet Hours End:' : 'کۆتایی بێدەنگی:'}</label>
                                    <input
                                        type="time"
                                        value={settings.quietHoursEnd}
                                        onChange={e => setSettings({ ...settings, quietHoursEnd: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="card-box-footer">
                        {settings.lastUpdatedAt && (
                            <span className="last-edit-hint">
                                {lang === 'en' ? 'Last modified by:' : 'دوا دەستکاری لەلایەن:'} <strong>{settings.lastUpdatedBy || 'Super Admin'}</strong>
                            </span>
                        )}
                        <button type="submit" disabled={saving} className="btn-save-notif-settings">
                            {saving ? <RefreshCw className="spin-icon" size={16} /> : <Check size={16} />}
                            <span>{lang === 'en' ? 'Save Schedule Settings' : 'پاشەکەوتکردنی کاتەکان'}</span>
                        </button>
                    </div>
                </form>

                {/* 2. Direct Announcement Broadcast Tool */}
                <form onSubmit={handleSendBroadcast} className="notif-card-box broadcast-card">
                    <div className="card-box-header">
                        <Send size={20} color="#8b5cf6" />
                        <h3>{lang === 'en' ? 'Direct Announcement Broadcast to All Users' : 'ناردنی ئاگاداری ڕاستەوخۆ بۆ سەرجەم بەکارهێنەران'}</h3>
                    </div>

                    <div className="broadcast-form-body">
                        <div className="form-group-notif">
                            <label>{lang === 'en' ? 'Notification Title (Title):' : 'ناونیشانی نۆتفیکەیشن (Title):'}</label>
                            <input
                                type="text"
                                placeholder={lang === 'en' ? "e.g. 🎬 A new blockbuster movie with Kurdish subtitles is now live!" : "بۆ نموونە: 🎬 فیلمێکی نوێی جیهانی بە ژێرنووسی کوردی زیادکرا!"}
                                value={broadcastTitle}
                                onChange={e => setBroadcastTitle(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group-notif">
                            <label>{lang === 'en' ? 'Notification Message Body (Message):' : 'دەقی پەیام (Message):'}</label>
                            <textarea
                                rows={3}
                                placeholder={lang === 'en' ? "Type your announcement message here for all registered subscribers..." : "دەقی پەیامەکە لێرە بنووسە بۆ هەموو موشتەرییەکانت..."}
                                value={broadcastMessage}
                                onChange={e => setBroadcastMessage(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group-notif">
                            <label>📍 {lang === 'en' ? 'Target Click Destination:' : 'ئاراستەکردنی بەکارهێنەر بۆ کام پەڕە؟ (Target Destination):'}</label>
                            <select
                                value={selectedPageType}
                                onChange={e => handlePageTypeChange(e.target.value)}
                            >
                                <option value="home">🏠 {lang === 'en' ? 'Home Page' : 'پەڕەی سەرەکی (Home Page)'}</option>
                                <option value="buy_credits">💳 {lang === 'en' ? 'Buy Credits & Plans' : 'پەڕەی کڕینی کرێدیت و پلانەکان (Buy Credits)'}</option>
                                <option value="assessment">🧠 {lang === 'en' ? 'Language Assessment Exam' : 'تاقیکردنەوەی ئاستی زمان (Language Assessment)'}</option>
                                <option value="profile">👤 {lang === 'en' ? 'User Profile & Flashcards' : 'پڕۆفایلی بەکارهێنەر و فلاشکارتەکان (Profile & Flashcards)'}</option>
                                <option value="specific_movie">🎬 {lang === 'en' ? 'Specific Movie or Series' : 'فیلم یان زنجیرەیەکی دیاریکراو (Specific Movie / Show)'}</option>
                                <option value="custom">✍️ {lang === 'en' ? 'Custom URL Path' : 'نووسینی لینکی تایبەت بە دەست (Custom URL)'}</option>
                            </select>
                        </div>

                        {/* If Specific Movie selected */}
                        {selectedPageType === 'specific_movie' && (
                            <div className="form-group-notif animate-fade">
                                <label>🎬 {lang === 'en' ? 'Select Movie or Series:' : 'فیلم یان زنجیرەکە هەڵبژێرە:'}</label>
                                <select
                                    value={selectedMovieId}
                                    onChange={e => handleMovieSelect(e.target.value)}
                                >
                                    {moviesList.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.type === 'series' ? (lang === 'en' ? '📺 [Series]' : '📺 [زنجیرە]') : (lang === 'en' ? '🎬 [Movie]' : '🎬 [فیلم]')} {m.title} {m.year ? `(${m.year})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* If Custom Link selected */}
                        {selectedPageType === 'custom' && (
                            <div className="form-group-notif animate-fade">
                                <label>{lang === 'en' ? 'Enter Custom URL Path:' : 'لینکی تایبەت بنووسە:'}</label>
                                <input
                                    type="text"
                                    placeholder="/movie/123"
                                    value={broadcastUrl}
                                    onChange={e => setBroadcastUrl(e.target.value)}
                                />
                            </div>
                        )}

                        <div className="broadcast-inline-fields">
                            <div className="form-group-notif">
                                <label>{lang === 'en' ? 'Computed Target URL:' : 'لینکی کۆتایی (Computed Link):'}</label>
                                <div className="computed-url-badge">
                                    <code>{broadcastUrl}</code>
                                </div>
                            </div>

                            <div className="form-group-notif">
                                <label>{lang === 'en' ? 'Notification Type:' : 'جۆری ئاگاداری:'}</label>
                                <select
                                    value={broadcastType}
                                    onChange={e => setBroadcastType(e.target.value as any)}
                                >
                                    <option value="info">ℹ️ {lang === 'en' ? 'Normal / Info' : 'ئاسایی (Info)'}</option>
                                    <option value="success">🎉 {lang === 'en' ? 'Celebration / Offer (Success)' : 'پیرۆزبایی و ئۆفەر (Success)'}</option>
                                    <option value="warning">⚠️ {lang === 'en' ? 'Important / Warning' : 'گرنگ و هۆشداری (Warning)'}</option>
                                </select>
                            </div>
                        </div>

                        {broadcastResult && (
                            <div className="broadcast-result-box">
                                {broadcastResult}
                            </div>
                        )}

                        <button type="submit" disabled={sendingBroadcast} className="btn-send-broadcast">
                            {sendingBroadcast ? <RefreshCw className="spin-icon" size={18} /> : <Send size={18} />}
                            <span>{lang === 'en' ? 'Send Broadcast Now 🚀' : 'ناردنی دەستبەجێ بۆ سەرجەم بەکارهێنەران 🚀'}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
