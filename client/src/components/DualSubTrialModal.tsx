import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
    Clock, Sparkles, CheckCircle2, X, Crown, Zap, ChevronLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './DualSubTrialModal.css';

interface PlanItem {
    id: string;
    name: string;
    credits: number;
    price: string;
    originalPrice?: string;
    discountPercent?: string;
    currency: string;
    color?: string;
    badge?: string;
    descriptionEn?: string;
    descriptionKu?: string;
    featuresEn?: string[];
    featuresKu?: string[];
    featured?: boolean;
    active?: boolean;
    order?: number;
}

interface DualSubTrialModalProps {
    isOpen: boolean;
    onClose: () => void;
    onContinueSingle: () => void;
    trialMinutes: number;
    resetHours?: number;
}

export const DualSubTrialModal: React.FC<DualSubTrialModalProps> = ({
    isOpen,
    onClose,
    onContinueSingle,
    trialMinutes,
    resetHours = 24
}) => {
    const { user } = useAuth();
    const { lang } = useLanguage();
    const navigate = useNavigate();
    const [plans, setPlans] = useState<PlanItem[]>([]);
    const [loadingPlans, setLoadingPlans] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setLoadingPlans(true);
        axios.get('/api/plans')
            .then(res => {
                if (Array.isArray(res.data)) {
                    // Filter active paid plans (exclude starter 0 price if any)
                    const paid = res.data.filter((p: PlanItem) => p.active !== false && p.price !== '0' && p.credits > 0);
                    setPlans(paid);
                }
            })
            .catch(err => {
                console.error('Failed to load plans for trial modal:', err);
            })
            .finally(() => setLoadingPlans(false));
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSelectPlan = (plan: PlanItem) => {
        onClose();
        if (user) {
            navigate(`/buy-credits?plan=${plan.id}`);
        } else {
            navigate(`/auth?mode=register&plan=${plan.id}`);
        }
    };

    return (
        <div className="dual-sub-modal-overlay" onClick={onClose}>
            <div className="dual-sub-modal-card" onClick={e => e.stopPropagation()}>
                {/* Header close */}
                <button className="dual-sub-modal-close-btn" onClick={onClose} title={lang === 'en' ? 'Close' : 'داخستن'}>
                    <X size={20} />
                </button>

                {/* Top Badge & Header */}
                <div className="dual-sub-modal-hero">
                    <div className="dual-sub-icon-badge">
                        <Crown size={32} className="crown-glow-icon" />
                    </div>
                    <div className="trial-limit-pill">
                        <Clock size={14} />
                        <span>
                            {lang === 'en' 
                                ? (resetHours > 0 
                                    ? `Trial Limit: ${trialMinutes} Mins Used (Resets every ${resetHours}h)` 
                                    : `Free Trial Limit: ${trialMinutes} Minutes Expired`)
                                : (resetHours > 0 
                                    ? `ماوەی ${trialMinutes} خولەکی ئەمڕۆت تەواو بوو (هەموو ${resetHours} کاتژمێر جارێک نوێ دەبێتەوە)` 
                                    : `ماوەی ${trialMinutes} خولەکی تاقیکردنەوەی سەبتایتڵی جووت تەواو بوو`)
                            }
                        </span>
                    </div>
                    <h2 className="dual-sub-modal-title">
                        {lang === 'en' ? 'Unlock Unlimited Full Watching & Subtitles 🌟' : 'سەیرکردنی بێسنوور و تایبەتمەندییەکان چالاک بکە 🌟'}
                    </h2>
                    <p className="dual-sub-modal-desc">
                        {lang === 'en'
                            ? (resetHours > 0 
                                ? `You've used your ${trialMinutes}-minute free daily watch allowance. You can wait for the ${resetHours}-hour cycle to reset, or subscribe to any plan to enjoy unlimited streaming & dual subtitles immediately!`
                                : `You've reached the ${trialMinutes}-minute free trial limit. Subscribe to any plan to unlock unlimited watching, dual subtitles, and AI learning tools!`)
                            : (resetHours > 0 
                                ? `تۆ ماوەی دیاریکراوی (${trialMinutes} خولەک)ی بێبەرامبەری ئەمڕۆت بەکارهێنا. دەتوانیت چاوەڕێ بکەیت تا دوای ${resetHours} کاتژمێر نوێ دەبێتەوە، یان بە کڕینی هەر پلانێک لە خوارەوە ڕاستەوخۆ بە بێسنووری سەیری فیلم و زنجیرەکان بکەیت!`
                                : `ماوەی (${trialMinutes} خولەک)ی تاقیکردنەوەی بێبەرامبەرت تەواو بوو. بە بەشداریکردن لە یەکێک لەم پلانانە، دەتوانیت بە بێسنووری سەیری فیلمەکان بکەیت و هەموو ئامرازەکان بەکاربهێنیت!`)
                        }
                    </p>
                </div>

                {/* Plans Grid */}
                <div className="dual-sub-plans-grid">
                    {loadingPlans ? (
                        <div className="dual-sub-loading-plans">
                            <div className="spinner-sub" />
                            <span>{lang === 'en' ? 'Loading best plans...' : 'بارکردنی باشترین پلانەکان...'}</span>
                        </div>
                    ) : plans.length > 0 ? (
                        plans.map((p) => {
                            const isFeatured = p.featured;
                            return (
                                <div 
                                    key={p.id} 
                                    className={`dual-sub-plan-card ${isFeatured ? 'featured' : ''}`}
                                    style={{ borderColor: p.color ? `${p.color}88` : undefined }}
                                >
                                    {p.badge && (
                                        <div className="plan-badge-pill" style={{ background: p.color || '#10b981' }}>
                                            <Sparkles size={11} />
                                            <span>{p.badge}</span>
                                        </div>
                                    )}

                                    <div className="plan-card-header">
                                        <h3 className="plan-name" style={{ color: p.color || '#ffffff' }}>{p.name}</h3>
                                        <div className="plan-price-row">
                                            <span className="plan-price-val">{p.price}</span>
                                            <span className="plan-currency">{p.currency || 'IQD'}</span>
                                        </div>
                                        {p.credits > 0 && (
                                            <div className="plan-credits-pill">
                                                <Zap size={13} fill="#fbbf24" color="#fbbf24" />
                                                <span>{p.credits} {lang === 'en' ? 'Credits' : 'کرێدیت'}</span>
                                            </div>
                                        )}
                                    </div>

                                    <ul className="plan-features-list">
                                        <li>
                                            <CheckCircle2 size={15} className="feat-check" />
                                            <span>{lang === 'en' ? 'Unlimited Dual Subtitles (EN + KU)' : 'سەبتایتڵی جووتی بێسنوور (کوردی + ئینگلیزی)'}</span>
                                        </li>
                                        <li>
                                            <CheckCircle2 size={15} className="feat-check" />
                                            <span>{lang === 'en' ? 'Interactive Subtitle Dictionary' : 'فەرهەنگی وشەکان لە ناو ڤیدیۆ'}</span>
                                        </li>
                                        {((lang === 'en' ? p.featuresEn : p.featuresKu) || []).slice(0, 2).map((feat, idx) => (
                                            <li key={idx}>
                                                <CheckCircle2 size={15} className="feat-check" />
                                                <span>{feat}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <button 
                                        className="btn-select-plan"
                                        style={{ 
                                            background: isFeatured 
                                                ? `linear-gradient(135deg, ${p.color || '#8b5cf6'}, #ec4899)` 
                                                : (p.color ? `linear-gradient(135deg, ${p.color}, #3b82f6)` : '#3b82f6')
                                        }}
                                        onClick={() => handleSelectPlan(p)}
                                    >
                                        <span>{lang === 'en' ? 'Choose Plan & Activate' : 'هەڵبژاردن و چالاککردن'}</span>
                                        <ChevronLeft size={16} className="btn-icon-arrow" />
                                    </button>
                                </div>
                            );
                        })
                    ) : (
                        <div className="dual-sub-empty-plans">
                            <button className="btn-go-pricing-direct" onClick={() => { onClose(); navigate('/buy-credits'); }}>
                                <Sparkles size={16} /> {lang === 'en' ? 'View All Plans & Credits' : 'بینینی تەواوی پلان و کرێدیتەکان'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="dual-sub-modal-footer">
                    <button className="btn-continue-single-sub" onClick={onContinueSingle}>
                        <span>{lang === 'en' ? 'Continue with Single Subtitle (Free)' : 'بەردەوامبوون بە یەک سەبتایتڵ (بێبەرامبەر)'}</span>
                    </button>
                    {!user && (
                        <div className="guest-login-hint">
                            <span>{lang === 'en' ? 'Already have an active plan?' : 'پێشتر بەشداریت کردووە؟'}</span>
                            <button className="btn-inline-login" onClick={() => { onClose(); navigate('/auth'); }}>
                                {lang === 'en' ? 'Login here' : 'لێرە بچۆ ژوورەوە'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
