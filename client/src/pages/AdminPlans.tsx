import React, { useState, useEffect } from 'react';
import axios from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
    Plus, Edit3, Trash2, Check, X, Sparkles, Star, Eye, EyeOff,
    ChevronUp, ChevronDown, CheckCircle2, AlertCircle, RefreshCw,
    Layers, DollarSign, Palette, Award, HelpCircle, ShieldAlert,
    Clock, Zap, Sliders
} from 'lucide-react';
import './AdminPlans.css';

export interface CreditPlan {
    id: string;
    name: string;
    credits: number;
    price: string;
    originalPrice?: string;
    discountPercent?: string;
    currency: string;
    color: string;
    badge?: string;
    descriptionEn?: string;
    descriptionKu?: string;
    featuresEn?: string[];
    featuresKu?: string[];
    featured?: boolean;
    active?: boolean;
    order?: number;
}

const PRESET_COLORS = [
    { name: 'Purple', value: '#8b5cf6' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Slate', value: '#64748b' },
    { name: 'Rose', value: '#f43f5e' }
];

export default function AdminPlans() {
    const { lang } = useLanguage();
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'super_admin' || user?.username === 'maher2' || user?.username?.toLowerCase() === 'admin';
    const [plans, setPlans] = useState<CreditPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Dual Subtitle Quota State
    const [quotaMinutes, setQuotaMinutes] = useState<number>(60);
    const [quotaResetHours, setQuotaResetHours] = useState<number>(24);
    const [quotaActive, setQuotaActive] = useState<boolean>(true);
    const [quotaExpiredAction, setQuotaExpiredAction] = useState<'block_all' | 'kurdish_only' | 'english_only'>('block_all');
    const [isSavingQuota, setIsSavingQuota] = useState(false);
    const [quotaSuccess, setQuotaSuccess] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<CreditPlan | null>(null);
    const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState<{
        name: string;
        credits: number;
        price: string;
        originalPrice: string;
        discountPercent: string;
        currency: string;
        color: string;
        badge: string;
        descriptionEn: string;
        descriptionKu: string;
        featuresEn: string[];
        featuresKu: string[];
        featured: boolean;
        active: boolean;
    }>({
        name: '',
        credits: 500,
        price: '20,000',
        originalPrice: '',
        discountPercent: '',
        currency: 'IQD',
        color: '#8b5cf6',
        badge: '',
        descriptionEn: '',
        descriptionKu: '',
        featuresEn: ['Full platform access', '500 Credits balance', 'Instant System Verification'],
        featuresKu: ['دەستگەیشتن بە تەواوی وێبسایت', '٥٠٠ کرێدیتی هەژمار', 'پشتڕاستکردنەوەی خێرای سیستەم'],
        featured: false,
        active: true
    });

    const [newFeatureKu, setNewFeatureKu] = useState('');
    const [newFeatureEn, setNewFeatureEn] = useState('');

    const fetchPlans = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/admin/plans');
            setPlans(res.data || []);
        } catch (err: any) {
            console.error('Failed to load plans:', err);
            setError(lang === 'en' ? 'Failed to load credit plans' : 'بارکردنی پلانەکان سەرکەوتوو نەبوو');
        } finally {
            setLoading(false);
        }
    };

    const fetchQuotaSettings = async () => {
        try {
            const res = await axios.get('/api/settings/dual-sub-quota');
            if (res.data) {
                setQuotaMinutes(typeof res.data.trialMinutes === 'number' ? res.data.trialMinutes : 60);
                setQuotaResetHours(typeof res.data.resetHours === 'number' ? res.data.resetHours : 24);
                setQuotaActive(res.data.active !== false);
                setQuotaExpiredAction(res.data.expiredAction || 'block_all');
            }
        } catch (err) {
            console.error('Failed to fetch quota settings:', err);
        }
    };

    const handleSaveQuota = async () => {
        setIsSavingQuota(true);
        setQuotaSuccess(null);
        try {
            await axios.post('/api/admin/settings/dual-sub-quota', {
                trialMinutes: quotaMinutes,
                resetHours: quotaResetHours,
                active: quotaActive,
                expiredAction: quotaExpiredAction
            });
            setQuotaSuccess(lang === 'en' ? 'Dual subtitle trial settings saved successfully! ✓' : 'ڕێکخستنەکانی تاقیکردنەوەی سەبتایتڵ بە سەرکەوتوویی پاشەکەوت کران ✓');
            setTimeout(() => setQuotaSuccess(null), 4000);
        } catch (err) {
            console.error('Failed to save quota settings:', err);
            setError(lang === 'en' ? 'Failed to save trial quota settings' : 'هەڵە لە پاشەکەوتکردنی ڕێکخستنی کاتی سەبتایتڵ');
        } finally {
            setIsSavingQuota(false);
        }
    };

    useEffect(() => {
        fetchPlans();
        fetchQuotaSettings();
    }, []);

    const showNotification = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 4000);
    };

    const handleOpenCreateModal = () => {
        setEditingPlan(null);
        setFormData({
            name: '',
            credits: 500,
            price: '20,000',
            originalPrice: '',
            discountPercent: '',
            currency: 'IQD',
            color: '#8b5cf6',
            badge: '',
            descriptionEn: '',
            descriptionKu: '',
            featuresEn: ['Full platform access', '500 Credits balance', 'Instant System Verification'],
            featuresKu: ['دەستگەیشتن بە تەواوی وێبسایت', '٥٠٠ کرێدیتی هەژمار', 'پشتڕاستکردنەوەی خێرای سیستەم'],
            featured: false,
            active: true
        });
        setNewFeatureKu('');
        setNewFeatureEn('');
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (plan: CreditPlan) => {
        setEditingPlan(plan);
        setFormData({
            name: plan.name,
            credits: plan.credits,
            price: plan.price,
            originalPrice: plan.originalPrice || '',
            discountPercent: plan.discountPercent || '',
            currency: plan.currency || 'IQD',
            color: plan.color || '#8b5cf6',
            badge: plan.badge || '',
            descriptionEn: plan.descriptionEn || '',
            descriptionKu: plan.descriptionKu || '',
            featuresEn: plan.featuresEn && plan.featuresEn.length > 0 ? [...plan.featuresEn] : ['Full platform access'],
            featuresKu: plan.featuresKu && plan.featuresKu.length > 0 ? [...plan.featuresKu] : ['دەستگەیشتن بە تەواوی وێبسایت'],
            featured: Boolean(plan.featured),
            active: plan.active !== false
        });
        setNewFeatureKu('');
        setNewFeatureEn('');
        setIsModalOpen(true);
    };

    const handleSavePlan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            alert(lang === 'en' ? 'Please enter a plan name' : 'تکایە ناوی پلان بنووسە');
            return;
        }

        setIsSaving(true);
        try {
            if (editingPlan) {
                await axios.put(`/api/admin/plans/${editingPlan.id}`, formData);
                showNotification(lang === 'en' ? 'Plan updated successfully!' : 'پلانەکە بە سەرکەوتوویی نوێکرایەوە!');
            } else {
                await axios.post('/api/admin/plans', formData);
                showNotification(lang === 'en' ? 'Plan created successfully!' : 'پلانی نوێ بە سەرکەوتوویی دروستکرا!');
            }
            setIsModalOpen(false);
            fetchPlans();
        } catch (err: any) {
            alert(err.response?.data?.error || (lang === 'en' ? 'Failed to save plan' : 'پاشەکەوتکردنی پلان سەرکەوتوو نەبوو'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePlan = async () => {
        if (!deletePlanId) return;
        try {
            await axios.delete(`/api/admin/plans/${deletePlanId}`);
            showNotification(lang === 'en' ? 'Plan deleted' : 'پلانەکە سڕایەوە');
            setDeletePlanId(null);
            fetchPlans();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete');
        }
    };

    const handleToggleActive = async (plan: CreditPlan) => {
        try {
            await axios.put(`/api/admin/plans/${plan.id}`, {
                active: !plan.active
            });
            fetchPlans();
        } catch (err) {
            console.error('Failed to toggle active', err);
        }
    };

    const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
        const newPlans = [...plans];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newPlans.length) return;

        const temp = newPlans[index];
        newPlans[index] = newPlans[targetIndex];
        newPlans[targetIndex] = temp;

        setPlans(newPlans);

        try {
            await axios.put('/api/admin/plans-reorder', {
                planIds: newPlans.map(p => p.id)
            });
        } catch (err) {
            console.error('Failed to reorder plans', err);
            fetchPlans();
        }
    };

    const addFeatureKu = () => {
        if (!newFeatureKu.trim()) return;
        setFormData(prev => ({
            ...prev,
            featuresKu: [...prev.featuresKu, newFeatureKu.trim()]
        }));
        setNewFeatureKu('');
    };

    const removeFeatureKu = (idx: number) => {
        setFormData(prev => ({
            ...prev,
            featuresKu: prev.featuresKu.filter((_, i) => i !== idx)
        }));
    };

    const addFeatureEn = () => {
        if (!newFeatureEn.trim()) return;
        setFormData(prev => ({
            ...prev,
            featuresEn: [...prev.featuresEn, newFeatureEn.trim()]
        }));
        setNewFeatureEn('');
    };

    const removeFeatureEn = (idx: number) => {
        setFormData(prev => ({
            ...prev,
            featuresEn: prev.featuresEn.filter((_, i) => i !== idx)
        }));
    };

    if (!isSuperAdmin) {
        return (
            <div className="admin-plans-container" style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px', padding: '30px', maxWidth: '600px', margin: '0 auto', color: '#fca5a5' }}>
                    <ShieldAlert size={48} color="#ef4444" style={{ marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
                        {lang === 'en' ? 'Access Restricted' : 'دەسەڵاتی سنووردارکراو'}
                    </h3>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6' }}>
                        {lang === 'en'
                            ? 'Only the Website Owner (Super Admin) is authorized to manage and modify credit pricing plans.'
                            : 'تەنها بەڕێوەبەری سەرەکی وێبسایت (Super Admin) دەسەڵاتی دیاریکردن و دەستکاریکردنی نرخ و پلانەکانی کرێدیتی هەیە.'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={`admin-plans-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {/* Header */}
            <div className="admin-plans-header">
                <div>
                    <h2>
                        <Layers size={24} color="#a78bfa" />
                        {lang === 'en' ? 'Credit Plans Management' : 'بەڕێوەبردنی پلانەکانی کڕینی کرێدیت'}
                    </h2>
                    <p>
                        {lang === 'en'
                            ? 'Configure pricing plans, credits granted, and display cards for the Buy Credits page.'
                            : 'دەستکاری نرخ، بڕی کرێدیت، و دیزاینی کارتی پاکێجەکان بکە بۆ بەکارهێنەران.'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-action-refresh" onClick={fetchPlans} title="Refresh">
                        <RefreshCw size={18} />
                    </button>
                    <button className="btn-create-plan" onClick={handleOpenCreateModal}>
                        <Plus size={18} />
                        <span>{lang === 'en' ? 'Add New Plan' : 'زیادکردنی پلانی نوێ'}</span>
                    </button>
                </div>
            </div>

            {successMsg && (
                <div className="plans-alert success">
                    <CheckCircle2 size={18} />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* Dual Subtitle Free Trial Quota Configuration Card */}
            <div className="dual-sub-quota-admin-card">
                <div className="quota-card-top">
                    <div className="quota-title-row">
                        <div className="quota-icon-wrap">
                            <Clock size={24} color="#fbbf24" />
                        </div>
                        <div>
                            <h3>{lang === 'en' ? 'Dual Subtitles Free Trial Quota' : 'ماوەی تاقیکردنەوەی بێبەرامبەری سەبتایتڵی جووت'}</h3>
                            <p>{lang === 'en' ? 'Limit how long free and non-subscribed users can watch movies with dual subtitles before requiring a paid plan.' : 'دیاریکردنی کاتی سەیرکردنی سەبتایتڵی جووت (کوردی + ئینگلیزی) بۆ بەکارهێنەرانی بێ پلان پێش ئەوەی داوای کڕینی پلان بکات.'}</p>
                        </div>
                    </div>
                    <div className="quota-active-toggle-wrap">
                        <label className="toggle-switch-label">
                            <span className="toggle-status-text">{quotaActive ? (lang === 'en' ? 'Active 🟢' : 'چالاکە 🟢') : (lang === 'en' ? 'Inactive ⚪' : 'ناچالاکە ⚪')}</span>
                            <input 
                                type="checkbox" 
                                checked={quotaActive} 
                                onChange={e => setQuotaActive(e.target.checked)} 
                            />
                            <span className="toggle-slider" />
                        </label>
                    </div>
                </div>

                {quotaSuccess && (
                    <div className="plans-alert success" style={{ margin: '14px 0 6px 0' }}>
                        <CheckCircle2 size={18} />
                        <span>{quotaSuccess}</span>
                    </div>
                )}

                <div className="quota-presets-row">
                    <span className="presets-label">{lang === 'en' ? 'Quick Presets:' : 'هەڵبژاردنی خێرا:'}</span>
                    {[
                        { label: lang === 'en' ? '30 Mins' : '٣٠ خولەک', val: 30 },
                        { label: lang === 'en' ? '1 Hour' : '١ کاتژمێر (٦٠ خولەک)', val: 60 },
                        { label: lang === 'en' ? '2 Hours' : '٢ کاتژمێر (١٢٠ خولەک)', val: 120 },
                        { label: lang === 'en' ? '3 Hours' : '٣ کاتژمێر (١٨٠ خولەک)', val: 180 },
                        { label: lang === 'en' ? 'Unlimited (0)' : 'بێسنوور (٠)', val: 0 },
                    ].map(preset => (
                        <button
                            key={preset.val}
                            type="button"
                            className={`btn-quota-preset ${quotaMinutes === preset.val ? 'active' : ''}`}
                            onClick={() => setQuotaMinutes(preset.val)}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>

                {/* Expiration Behavior Option Selection */}
                <div className="quota-action-selection-block">
                    <label className="quota-action-main-label">
                        {lang === 'en' ? 'Behavior when trial time expires:' : 'هەڵسوکەوتی سیستەم دوای تەواوبوونی کاتی تاقیکردنەوە:'}
                    </label>
                    <div className="quota-actions-grid">
                        <div 
                            className={`quota-action-card block_all ${quotaExpiredAction === 'block_all' ? 'active' : ''}`}
                            onClick={() => setQuotaExpiredAction('block_all')}
                        >
                            <div className="quota-action-card-header">
                                <span className="quota-action-card-icon">🚫</span>
                                <strong className="quota-action-card-title">
                                    {lang === 'en' ? 'Disable All Subtitles' : 'داخستنی هەردوو سەبتایتڵەکە (هیچ نەبینێت)'}
                                </strong>
                            </div>
                            <p className="quota-action-card-desc">
                                {lang === 'en' ? 'Both Kurdish and English subtitles are fully hidden until a plan is purchased.' : 'هەردوو سەبتایتڵی کوردی و ئینگلیزی بە تەواوی دادەخرێن تا کڕینی پلان.'}
                            </p>
                        </div>

                        <div 
                            className={`quota-action-card kurdish_only ${quotaExpiredAction === 'kurdish_only' ? 'active' : ''}`}
                            onClick={() => setQuotaExpiredAction('kurdish_only')}
                        >
                            <div className="quota-action-card-header">
                                <span className="quota-action-card-icon">🔤</span>
                                <strong className="quota-action-card-title">
                                    {lang === 'en' ? 'Kurdish Only (Single Sub)' : 'تەنها سەبتایتڵی کوردی (ئینگلیزی دابخرێت)'}
                                </strong>
                            </div>
                            <p className="quota-action-card-desc">
                                {lang === 'en' ? 'Only Kurdish subtitle remains active; second English subtitle is disabled.' : 'تەنها سەبتایتڵی کوردی بەردەست دەبێت و سەبتایتڵی دووەم دەوەستێنرێت.'}
                            </p>
                        </div>

                        <div 
                            className={`quota-action-card english_only ${quotaExpiredAction === 'english_only' ? 'active' : ''}`}
                            onClick={() => setQuotaExpiredAction('english_only')}
                        >
                            <div className="quota-action-card-header">
                                <span className="quota-action-card-icon">🌐</span>
                                <strong className="quota-action-card-title">
                                    {lang === 'en' ? 'English Only (No Kurdish)' : 'تەنها سەبتایتڵی ئینگلیزی (بەبێ کوردی)'}
                                </strong>
                            </div>
                            <p className="quota-action-card-desc">
                                {lang === 'en' ? 'Only English subtitle remains active; Kurdish translation is disabled.' : 'تەنها سەبتایتڵی ئینگلیزی کار دەکات و سەبتایتڵی کوردی دادەخرێت.'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="quota-input-action-row" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', flex: 1 }}>
                        <div className="quota-input-group">
                            <label>{lang === 'en' ? 'Trial Duration (Minutes):' : 'ماوەی تاقیکردنەوە بە خولەک:'}</label>
                            <div className="quota-input-with-unit">
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="1440" 
                                    value={quotaMinutes} 
                                    onChange={e => setQuotaMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="quota-custom-input"
                                    placeholder="30"
                                />
                                <span className="quota-input-unit">{lang === 'en' ? 'Minutes' : 'خولەک'}</span>
                            </div>
                            <span className="quota-helper-text">
                                {quotaMinutes === 0 
                                    ? (lang === 'en' ? '0 = Unlimited free dual subtitles for all users' : '٠ = سەبتایتڵی جووت بۆ هەمووان بێسنوور دەبێت بە خۆڕایی') 
                                    : (lang === 'en' ? `Allowed ${quotaMinutes} mins of dual subs.` : `بۆ ماوەی ${quotaMinutes} خولەک ڕێگە بە سەبتایتڵی جووت دەدرێت.`)}
                            </span>
                        </div>

                        <div className="quota-input-group">
                            <label>{lang === 'en' ? 'Reset Cycle (Hours):' : 'ماوەی نوێبوونەوە (کاتژمێر):'}</label>
                            <div className="quota-input-with-unit">
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="720" 
                                    value={quotaResetHours} 
                                    onChange={e => setQuotaResetHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="quota-custom-input"
                                    placeholder="24"
                                />
                                <span className="quota-input-unit">{lang === 'en' ? 'Hours' : 'کاتژمێر'}</span>
                            </div>
                            <span className="quota-helper-text">
                                {quotaResetHours === 0 
                                    ? (lang === 'en' ? '0 = Permanent trial (never resets)' : '٠ = یەکجارەکی (هەرگیز نوێ نابێتەوە)') 
                                    : (lang === 'en' ? `Resets every ${quotaResetHours} hours (${quotaResetHours === 24 ? 'Daily Allowance' : `${quotaResetHours}h`}).` : `هەموو ${quotaResetHours} کاتژمێر جارێک خولەکەکانی تاقیکردنەوە نوێ دەبنەوە و بەکارهێنەر دەتوانێت دووبارە بەکاریبهێنێتەوە.`)}
                            </span>
                        </div>
                    </div>

                    <button 
                        type="button" 
                        className="btn-save-quota-settings" 
                        onClick={handleSaveQuota}
                        disabled={isSavingQuota}
                    >
                        {isSavingQuota ? (
                            <RefreshCw size={16} className="spinning-icon" />
                        ) : (
                            <Check size={16} />
                        )}
                        <span>{lang === 'en' ? 'Save Settings' : 'پاشەکەوتکردنی ڕێکخستن'}</span>
                    </button>
                </div>
            </div>

            {/* Plans Grid */}
            {loading ? (
                <div className="plans-loading">
                    <div className="spinning-loader"></div>
                    <p>{lang === 'en' ? 'Loading plans...' : 'خەریکە باردەکرێت...'}</p>
                </div>
            ) : plans.length === 0 ? (
                <div className="plans-empty">
                    <Layers size={48} color="#64748b" />
                    <h3>{lang === 'en' ? 'No plans found' : 'هیچ پلانێک نییە'}</h3>
                    <p>{lang === 'en' ? 'Click the button above to add your first credit plan.' : 'کلیک لەسەر دوگمەی سەرەوە بکە بۆ دروستکردنی یەکەمین پلان.'}</p>
                    <button className="btn-create-plan" onClick={handleOpenCreateModal}>
                        <Plus size={18} />
                        <span>{lang === 'en' ? 'Add Plan' : 'زیادکردنی پلان'}</span>
                    </button>
                </div>
            ) : (
                <div className="plans-admin-grid">
                    {plans.map((plan, index) => (
                        <div
                            key={plan.id}
                            className={`admin-plan-card ${plan.featured ? 'is-featured' : ''} ${plan.active === false ? 'is-inactive' : ''}`}
                            style={{ '--plan-color': plan.color } as any}
                        >
                            {/* Card Top Badges */}
                            <div className="admin-plan-top-bar">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span
                                        className={`status-pill ${plan.active !== false ? 'active' : 'inactive'}`}
                                        onClick={() => handleToggleActive(plan)}
                                        title={lang === 'en' ? 'Click to toggle active' : 'کلیک بکە بۆ چالاک/ناچالاککردن'}
                                    >
                                        {plan.active !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                                        {plan.active !== false ? (lang === 'en' ? 'Active' : 'چالاک') : (lang === 'en' ? 'Inactive' : 'ناچالاک')}
                                    </span>
                                    {plan.featured && (
                                        <span className="featured-pill">
                                            <Star size={12} fill="#fbbf24" color="#fbbf24" />
                                            {lang === 'en' ? 'Featured' : 'تایبەت'}
                                        </span>
                                    )}
                                </div>

                                {/* Order buttons */}
                                <div className="order-controls">
                                    <button
                                        disabled={index === 0}
                                        onClick={() => handleMoveOrder(index, 'up')}
                                        title={lang === 'en' ? 'Move Left / Up' : 'بەرەو پێشەوە'}
                                    >
                                        <ChevronUp size={16} />
                                    </button>
                                    <button
                                        disabled={index === plans.length - 1}
                                        onClick={() => handleMoveOrder(index, 'down')}
                                        title={lang === 'en' ? 'Move Right / Down' : 'بەرەو دواوە'}
                                    >
                                        <ChevronDown size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Plan Color Bar */}
                            <div className="plan-color-accent" style={{ background: plan.color }}></div>

                            {/* Plan Body */}
                            <div className="admin-plan-body">
                                {plan.badge && <div className="plan-badge-preview">{plan.badge}</div>}

                                <h3 className="plan-name-preview">{plan.name}</h3>

                                <div className="plan-price-wrap-admin">
                                    {plan.originalPrice && (
                                        <div className="plan-discount-header-row">
                                            <del className="plan-old-price-del">{plan.originalPrice} {plan.currency}</del>
                                            {plan.discountPercent && (
                                                <span className="plan-discount-badge-pill">🔥 {plan.discountPercent}</span>
                                            )}
                                        </div>
                                    )}
                                    <div className="plan-price-preview">
                                        <span className="price-amount">{plan.price}</span>
                                        <span className="price-currency"> {plan.currency}</span>
                                    </div>
                                </div>

                                <div className="plan-credits-badge" style={{ borderColor: plan.color, color: plan.color }}>
                                    <Sparkles size={14} />
                                    <strong>+{plan.credits}</strong> {lang === 'en' ? 'Credits' : 'کرێدیت'}
                                </div>

                                <p className="plan-desc-preview">
                                    {lang === 'en'
                                        ? (plan.descriptionEn || plan.descriptionKu || 'No description')
                                        : (plan.descriptionKu || plan.descriptionEn || 'هیچ کورتەیەکی نییە')}
                                </p>

                                {/* Features preview */}
                                <div className="plan-features-preview">
                                    <h4>{lang === 'en' ? 'Included Features:' : 'تایبەتمەندییەکان:'}</h4>
                                    <ul>
                                        {((lang === 'en' ? plan.featuresEn : plan.featuresKu) || plan.featuresKu || []).map((f, i) => (
                                            <li key={i}>
                                                <Check size={14} color="#10b981" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Card Footer Actions */}
                            <div className="admin-plan-actions">
                                <button className="btn-plan-edit" onClick={() => handleOpenEditModal(plan)}>
                                    <Edit3 size={15} />
                                    <span>{lang === 'en' ? 'Edit Plan' : 'دەستکاری'}</span>
                                </button>
                                <button className="btn-plan-delete" onClick={() => setDeletePlanId(plan.id)}>
                                    <Trash2 size={15} />
                                    <span>{lang === 'en' ? 'Delete' : 'سڕینەوە'}</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* CREATE / EDIT MODAL */}
            {isModalOpen && (
                <div className="modal-backdrop-custom" onClick={() => setIsModalOpen(false)}>
                    <div 
                        className={`modal-card-custom ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} 
                        dir={lang === 'en' ? 'ltr' : 'rtl'}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="modal-header-custom">
                            <h3>
                                {editingPlan
                                    ? (lang === 'en' ? 'Edit Credit Plan' : 'دەستکاریی پلانی کرێدیت')
                                    : (lang === 'en' ? 'Create New Plan' : 'دروستکردنی پلانی نوێ')}
                            </h3>
                            <button className="close-modal-btn" onClick={() => setIsModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSavePlan} className="modal-form-content">
                            <div className="form-grid-2col">
                                {/* Plan Name */}
                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Plan Name *' : 'ناوی پلان *'}</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Pro, VIP, Starter"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>

                                {/* Credits Amount */}
                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Credits Amount *' : 'بڕی کرێدیت *'}</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        step="50"
                                        placeholder="e.g. 500"
                                        value={formData.credits}
                                        onChange={e => setFormData({ ...formData, credits: parseInt(e.target.value, 10) || 0 })}
                                    />
                                </div>

                                {/* Price */}
                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Selling Price (After Discount) *' : 'نرخی فرۆشتن (دوای داشکاندن) *'}</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. 20,000 or 2,500"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                    />
                                </div>

                                {/* Currency */}
                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Currency' : 'دراو'}</label>
                                    <select
                                        value={formData.currency}
                                        onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                    >
                                        <option value="IQD">IQD (دیناری عێراقی)</option>
                                        <option value="USD">$ (دۆلاری ئەمریکی)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Discount & Original Price */}
                            <div className="form-grid-2col">
                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Original Price (Before Discount)' : 'نرخی پێشوو / پێش داشکاندن (ئارەزوومەندانە)'}</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 25,000 or 5,000"
                                        value={formData.originalPrice}
                                        onChange={e => setFormData({ ...formData, originalPrice: e.target.value })}
                                    />
                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                        {lang === 'en' ? 'Will be shown with a strikethrough (e.g. ~~5,000~~)' : 'بە هێڵێکی بەسەردا کێشراو نیشان دەدرێت (وەک ~~٥,٠٠٠~~)'}
                                    </span>
                                </div>

                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Discount Badge' : 'تاگی ڕێژەی داشکاندن (ئارەزوومەندانە)'}</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 50% OFF یان داشکاندنی ٥٠٪"
                                        value={formData.discountPercent}
                                        onChange={e => setFormData({ ...formData, discountPercent: e.target.value })}
                                    />
                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                        {lang === 'en' ? 'Appears as a glowing discount badge' : 'وەک باجێکی ئاگرین و درەوشاوە دەردەکەوێت'}
                                    </span>
                                </div>
                            </div>

                            {/* Badge & Color Picker */}
                            <div className="form-grid-2col">
                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Badge (Optional)' : 'نیشانەی سەرەوە (ئارەزوومەندانە)'}</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. MOST POPULAR, DISCOUNT"
                                        value={formData.badge}
                                        onChange={e => setFormData({ ...formData, badge: e.target.value })}
                                    />
                                </div>

                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Theme Color' : 'ڕەنگی پلان'}</label>
                                    <div className="color-presets-row">
                                        {PRESET_COLORS.map(c => (
                                            <button
                                                type="button"
                                                key={c.value}
                                                className={`color-dot ${formData.color === c.value ? 'selected' : ''}`}
                                                style={{ background: c.value }}
                                                onClick={() => setFormData({ ...formData, color: c.value })}
                                                title={c.name}
                                            />
                                        ))}
                                        <input
                                            type="color"
                                            value={formData.color}
                                            onChange={e => setFormData({ ...formData, color: e.target.value })}
                                            className="custom-color-input"
                                            title="Custom Color"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Descriptions */}
                            <div className="form-grid-2col">
                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'Kurdish Description' : 'کورتەی کوردی'}</label>
                                    <input
                                        type="text"
                                        placeholder="باشترین هەڵبژاردن بۆ فێربوون..."
                                        value={formData.descriptionKu}
                                        onChange={e => setFormData({ ...formData, descriptionKu: e.target.value })}
                                    />
                                </div>

                                <div className="form-group-custom">
                                    <label>{lang === 'en' ? 'English Description' : 'کورتەی ئینگلیزی'}</label>
                                    <input
                                        type="text"
                                        placeholder="Ideal for enthusiastic learners..."
                                        value={formData.descriptionEn}
                                        onChange={e => setFormData({ ...formData, descriptionEn: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Features list (Kurdish) */}
                            <div className="form-group-custom">
                                <label>{lang === 'en' ? 'Features List (Kurdish)' : 'خاڵەکانی تایبەتمەندی بە کوردی'}</label>
                                <div className="feature-input-row">
                                    <input
                                        type="text"
                                        placeholder="خاڵێکی نوێ بنووسە..."
                                        value={newFeatureKu}
                                        onChange={e => setNewFeatureKu(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeatureKu(); } }}
                                    />
                                    <button type="button" className="btn-add-feature" onClick={addFeatureKu}>
                                        <Plus size={16} /> {lang === 'en' ? 'Add' : 'زیادکردن'}
                                    </button>
                                </div>
                                <div className="features-tags-list">
                                    {formData.featuresKu.map((f, i) => (
                                        <span key={i} className="feature-tag">
                                            <span>{f}</span>
                                            <button type="button" onClick={() => removeFeatureKu(i)}><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Features list (English) */}
                            <div className="form-group-custom">
                                <label>{lang === 'en' ? 'Features List (English)' : 'خاڵەکانی تایبەتمەندی بە ئینگلیزی'}</label>
                                <div className="feature-input-row">
                                    <input
                                        type="text"
                                        placeholder="Add a new feature..."
                                        value={newFeatureEn}
                                        onChange={e => setNewFeatureEn(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeatureEn(); } }}
                                    />
                                    <button type="button" className="btn-add-feature" onClick={addFeatureEn}>
                                        <Plus size={16} /> {lang === 'en' ? 'Add' : 'زیادکردن'}
                                    </button>
                                </div>
                                <div className="features-tags-list">
                                    {formData.featuresEn.map((f, i) => (
                                        <span key={i} className="feature-tag">
                                            <span>{f}</span>
                                            <button type="button" onClick={() => removeFeatureEn(i)}><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Checkboxes: Featured & Active */}
                            <div className="form-checkboxes-row">
                                <label className="custom-checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.featured}
                                        onChange={e => setFormData({ ...formData, featured: e.target.checked })}
                                    />
                                    <Star size={16} color="#fbbf24" />
                                    <span>{lang === 'en' ? 'Highlight as Featured (Most Popular)' : 'پلانی تایبەت بێت (دیار و گەورەتر دەردەکەوێت)'}</span>
                                </label>

                                <label className="custom-checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={e => setFormData({ ...formData, active: e.target.checked })}
                                    />
                                    <Check size={16} color="#10b981" />
                                    <span>{lang === 'en' ? 'Active (Visible to users)' : 'چالاکە (بۆ بەکارهێنەران پیشان دەدرێت)'}</span>
                                </label>
                            </div>

                            {/* Modal Footer */}
                            <div className="modal-footer-custom">
                                <button type="button" className="btn-cancel-modal" onClick={() => setIsModalOpen(false)}>
                                    {lang === 'en' ? 'Cancel' : 'پەشیمانبوونەوە'}
                                </button>
                                <button type="submit" className="btn-submit-modal" disabled={isSaving}>
                                    {isSaving ? <div className="spinning-loader-small"></div> : <Check size={18} />}
                                    <span>{lang === 'en' ? 'Save Plan' : 'پاشەکەوتکردنی پلان'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {deletePlanId && (
                <div className="modal-backdrop-custom" onClick={() => setDeletePlanId(null)}>
                    <div className="modal-card-custom delete-confirm" onClick={e => e.stopPropagation()}>
                        <div className="delete-icon-wrap">
                            <AlertCircle size={36} color="#ef4444" />
                        </div>
                        <h3>{lang === 'en' ? 'Delete Plan?' : 'سڕینەوەی پلان؟'}</h3>
                        <p>{lang === 'en' ? 'Are you sure you want to permanently delete this credit plan?' : 'دڵنیایت دەتەوێت ئەم پلانە بە تەواوی بسڕیتەوە؟'}</p>
                        <div className="delete-modal-actions">
                            <button className="btn-cancel-modal" onClick={() => setDeletePlanId(null)}>
                                {lang === 'en' ? 'Cancel' : 'پەشیمانبوونەوە'}
                            </button>
                            <button className="btn-confirm-delete" onClick={handleDeletePlan}>
                                <Trash2 size={16} />
                                {lang === 'en' ? 'Delete Permanently' : 'سڕینەوەی یەکجارەکی'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
