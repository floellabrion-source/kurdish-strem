import React, { useState, useEffect, useRef } from 'react';
import { Check, X, Upload, Image as ImageIcon, AlertCircle, Sparkles, Clock, CheckCircle2, History, ChevronRight, ChevronDown, ChevronUp, Zap, Copy, CreditCard, Crown, Star } from 'lucide-react';
import axios from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './BuyCredits.css';

export interface CreditPlan {
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
}

const PAYMENT_ACCOUNTS = [
    {
        id: 'fastpay',
        nameKu: 'FastPay (فاستپەی)',
        nameEn: 'FastPay',
        holderName: 'ماهر بهجت سليمان',
        number: '07507363244',
        displayNumber: '0750 736 3244',
        color: '#d946ef',
        bg: 'rgba(217, 70, 239, 0.12)',
        border: 'rgba(217, 70, 239, 0.35)',
        badge: 'FastPay'
    },
    {
        id: 'fib',
        nameKu: 'FIB (بانکی یەکەمی عێراقی)',
        nameEn: 'First Iraqi Bank (FIB)',
        holderName: 'MOHAMMED BAHJAT SULAIMAN',
        number: '07507178696',
        displayNumber: '0750 717 8696',
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.12)',
        border: 'rgba(16, 185, 129, 0.35)',
        badge: 'FIB'
    },
    {
        id: 'qicard',
        nameKu: 'Qi Card (کی کارد)',
        nameEn: 'Qi Card',
        holderName: 'MAHER BAHJAT SULAIMAN',
        number: '2029955040',
        displayNumber: '2029955040',
        color: '#06b6d4',
        bg: 'rgba(6, 182, 212, 0.12)',
        border: 'rgba(6, 182, 212, 0.35)',
        badge: 'Qi Card'
    }
];

const DEFAULT_PLANS: CreditPlan[] = [
    { id: 'plan_starter', name: 'Starter', credits: 0, price: '0', currency: 'IQD', color: '#64748b', descriptionEn: 'Ideal for individual users and testing.', descriptionKu: 'گونجاو بۆ بەکارهێنەری تاکەکەسی و تاقیکردنەوە.' },
    { id: 'plan_popular', name: 'Pro', credits: 500, price: '20,000', currency: 'IQD', color: '#8b5cf6', badge: 'MOST POPULAR', descriptionEn: 'Ideal for enthusiastic learners and regular viewing.', descriptionKu: 'باشترین و بەناوبانگترین هەڵبژاردن بۆ فێربوونی بەردەوام.', featured: true },
    { id: 'plan_pro', name: 'Premium', credits: 1500, price: '50,000', currency: 'IQD', color: '#ec4899', descriptionEn: 'Best choice for heavy learning and unlimited practice.', descriptionKu: 'باشترین هەڵبژاردن بۆ فێربوونی بەردەوام.' },
];

const translateSystemNote = (text: string, currentLang: string) => {
    if (!text || currentLang !== 'en') return text;

    const amountRegex = /بڕی پارەی وەسڵەکە\s*\(([^)]+)\)\s*کەمترە لە نرخی پلانی\s*([^\s]+)\s*کە\s*\(([^)]+)\)/i;
    const match = text.match(amountRegex);
    if (match) {
        return `Receipt transfer amount (${match[1]}) is less than ${match[2]} plan price (${match[3]}).`;
    }

    if (text.includes('پێشتر بەکارهاتووە') || text.includes('دووبارە')) {
        return 'This receipt has already been used and is a duplicate.';
    }
    if (text.includes('ڕوون نییە') || text.includes('پارەکە کەمە')) {
        return 'Receipt image is unclear or payment amount is insufficient.';
    }
    if (text.includes('هەڵوەشێندرایەوە') || text.includes('کێشانەوە') || text.includes('سەرۆک') || text.includes('بەڕێوەبەر')) {
        return 'Order overturned and credits revoked by administrator.';
    }
    if (text.includes('ساختە')) {
        return 'Fake or duplicate receipt.';
    }
    if (text.includes('پەسەندکراوە') || text.includes('سەرکەوتوویی')) {
        return 'Receipt was successfully verified and approved.';
    }
    if (text.includes('ژمارەی هەژمار') || text.includes('هەڵەیە')) {
        return 'Payment account number or details do not match.';
    }

    return text;
};

export default function BuyCredits() {
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();
    const { lang, t } = useLanguage();
    const [plans, setPlans] = useState<CreditPlan[]>(DEFAULT_PLANS);
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<CreditPlan | null>(null);
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
    const [isBuying, setIsBuying] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
    const [isAutoApproved, setIsAutoApproved] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [userRequests, setUserRequests] = useState<any[]>([]);
    const [showAllReceipts, setShowAllReceipts] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCopyAccount = (key: string, text: string) => {
        // Universal Copy Logic for Mobile (supports HTTP, HTTPS, iOS, and Android)
        const copySuccess = () => {
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2200);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(copySuccess).catch(() => {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }

        function fallbackCopy(val: string) {
            try {
                const el = document.createElement('textarea');
                el.value = val;
                el.setAttribute('readonly', '');
                el.style.position = 'fixed';
                el.style.left = '-9999px';
                el.style.top = '-9999px';
                el.style.opacity = '0';
                document.body.appendChild(el);
                
                // Select text for both iOS and Android
                el.focus();
                el.select();
                el.setSelectionRange(0, 99999);
                
                const res = document.execCommand('copy');
                document.body.removeChild(el);
                if (res) {
                    copySuccess();
                }
            } catch (err) {
                console.error('[Copy Error]:', err);
            }
        }
    };

    const loadPlans = async () => {
        try {
            const res = await axios.get('/api/plans');
            if (Array.isArray(res.data) && res.data.length > 0) {
                setPlans(res.data);
            }
        } catch (e) {
            console.error('Failed to load dynamic plans, using fallback:', e);
        } finally {
            setLoadingPlans(false);
        }
    };

    const loadUserRequests = async () => {
        try {
            const res = await axios.get('/api/user/credit-requests');
            setUserRequests(res.data || []);
        } catch {}
    };

    useEffect(() => {
        loadPlans();
        loadUserRequests();
    }, []);

    const handleBuyCredits = (plan: CreditPlan) => {
        setSelectedPlan(plan);
        setReceiptFile(null);
        setReceiptPreview(null);
        setUploadSuccess(null);
        setUploadError(null);
        
        // Scroll to bottom smoothly
        setTimeout(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }, 100);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setReceiptFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setReceiptPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUploadReceipt = async () => {
        if (!selectedPlan || !receiptFile) return;
        setIsBuying(true);
        setUploadError(null);
        
        const formData = new FormData();
        formData.append('receipt', receiptFile);
        formData.append('amount', selectedPlan.credits.toString());
        formData.append('planName', selectedPlan.name);
        formData.append('planId', selectedPlan.id);
        formData.append('price', selectedPlan.price);
        formData.append('currency', selectedPlan.currency || 'IQD');

        const token = localStorage.getItem('kurdish_stream_token') || localStorage.getItem('ks_token');

        try {
            const res = await axios.post('/api/user/request-credits', formData, {
                headers: { 
                    'Content-Type': 'multipart/form-data',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });
            if (res.data.success) {
                setUploadSuccess(res.data.message);
                setIsAutoApproved(Boolean(res.data.autoApproved));
                setReceiptFile(null);
                setReceiptPreview(null);
                loadUserRequests();
                if (refreshUser) {
                    await refreshUser();
                }
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || (lang === 'en' ? 'An error occurred while uploading receipt' : 'کێشەیەک ڕوویدا لە کاتی ناردنی داواکارییەکە');
            setUploadError(errorMsg);
        } finally {
            setIsBuying(false);
        }
    };

    const closeUploadSection = () => {
        setSelectedPlan(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="buy-credits-page">
            <div className="page-header">
                <h2>{lang === 'en' ? 'Choose your Plan' : 'پلانەکەت هەڵبژێرە'}</h2>
                <p>{lang === 'en' ? 'Discover the perfect plan tailored just for your learning.' : 'پلانە گونجاوەکە بۆ پێداویستییەکانی فێربوونت هەڵبژێرە.'}</p>
            </div>

            {/* Active Subscription Status Banner (if user has active plan) */}
            {user && (
                <div className="active-sub-summary-card">
                    <div className="active-sub-left">
                        <div className="active-sub-icon-wrap">
                            <Crown size={22} color="#fbbf24" />
                        </div>
                        <div className="active-sub-details">
                            <div className="active-sub-title">
                                {user.plan ? (lang === 'en' ? `Active Plan: ${user.plan}` : `پلانی چالاکت: ${user.plan}`) : (lang === 'en' ? 'No Active Subscription' : 'هیچ بەشدارییەکی چالاکت نییە')}
                            </div>
                            <div className="active-sub-desc">
                                {user.subscriptionExpiresAt ? (
                                    (() => {
                                        const days = Math.max(0, Math.ceil((user.subscriptionExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
                                        return days > 0
                                            ? (lang === 'en' ? `⏳ Valid for ${days} more days (30-day cycle)` : `⏳ ${days} ڕۆژی ماوە لە خولی ٣٠ ڕۆژەی پلانەکەت`)
                                            : (lang === 'en' ? '⚠️ Plan expired. Activate a new plan below.' : '⚠️ پلانی پێشووت بەسەرچووە. لە خوارەوە پلانێکی نوێ هەڵبژێرە.');
                                    })()
                                ) : (
                                    lang === 'en' ? 'Select any 30-day plan below to unlock full benefits' : 'یەکێک لە پلانە ٣٠ ڕۆژەییەکانی خوارەوە هەڵبژێرە بۆ بەکارهێنانی تەواوی تایبەتمەندییەکان'
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="active-sub-right">
                        <div className="active-sub-credits-pill">
                            <Zap size={15} fill="#fbbf24" />
                            <span>{(user.credits || 0).toLocaleString()} {lang === 'en' ? 'Credits' : 'کرێدیت'}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="plans-grid-large">
                {plans.map(plan => {
                    const features = (lang === 'en' ? plan.featuresEn : plan.featuresKu) || plan.featuresKu || [
                        lang === 'en' ? 'Full platform access' : 'دەستگەیشتن بە تەواوی وێبسایت',
                        `${plan.credits} ${lang === 'en' ? 'credits' : 'کرێدیت'}`,
                        lang === 'en' ? 'Instant Verification' : 'پشتڕاستکردنەوەی خێرای سیستەم'
                    ];

                    const badgeText = (() => {
                        if (!plan.badge) return '';
                        if (plan.badge.includes('/')) {
                            const parts = plan.badge.split('/');
                            return lang === 'en' ? parts[0].trim() : parts[1].trim();
                        }
                        if (lang === 'en') {
                            if (plan.badge === 'بەناوبانگترین' || plan.badge === 'پڕفرۆشترین') return 'MOST POPULAR';
                            if (plan.badge === 'تایبەت' || plan.badge === 'شاهانە') return 'VIP';
                            if (plan.badge === 'پێشنیارکراو') return 'RECOMMENDED';
                        } else {
                            if (plan.badge === 'MOST POPULAR') return 'پڕفرۆشترین';
                            if (plan.badge === 'SPECIAL' || plan.badge === 'VIP') return 'شاهانە';
                            if (plan.badge === 'RECOMMENDED') return 'پێشنیارکراو';
                        }
                        return plan.badge;
                    })();

                    const isPopular = plan.featured || plan.id === 'plan_popular' || badgeText.includes('POPULAR') || badgeText.includes('پڕفرۆشترین') || badgeText.includes('بەناوبانگترین');

                    return (
                        <div 
                            key={plan.id} 
                            className={`plan-card-large ${isPopular ? 'featured' : ''} ${plan.discountPercent ? 'has-discount' : ''} ${plan.credits === 0 ? 'starter' : 'clickable-plan'}`}
                            style={{ '--plan-accent': plan.color || (isPopular ? '#10b981' : '#8b5cf6') } as any}
                            onClick={() => plan.credits > 0 && handleBuyCredits(plan)}
                        >
                            {/* Badges Bar */}
                            <div className="plan-card-top-badges">
                                {badgeText ? (
                                    <span className="plan-badge">{badgeText}</span>
                                ) : <span />}
                                {plan.discountPercent && (
                                    <span className="plan-discount-ribbon">🔥 {plan.discountPercent}</span>
                                )}
                            </div>

                            {/* Plan Header */}
                            <div className="plan-header-row">
                                <div className="plan-icon-wrap" style={{ background: `${plan.color || '#8b5cf6'}20`, color: plan.color || '#8b5cf6', borderColor: `${plan.color || '#8b5cf6'}40` }}>
                                    {plan.credits === 0 ? <Sparkles size={22} /> : isPopular ? <Zap size={22} /> : plan.credits > 500 ? <Crown size={22} /> : <Star size={22} />}
                                </div>
                                <div className="plan-title-col">
                                    <h3 className="plan-name">{plan.name}</h3>
                                    <span className="plan-billing">
                                        {plan.credits === 0 
                                            ? (lang === 'en' ? 'Free tier' : 'پلانی بێبەرامبەر') 
                                            : (lang === 'en' ? '⏱️ Valid for 30 Days' : '⏱️ ماوەی ٣٠ ڕۆژ')}
                                    </span>
                                </div>
                            </div>

                            {/* Credits Big Highlight Box */}
                            <div className="plan-credits-hero">
                                <div className="credits-hero-num">
                                    <Zap size={18} fill="#fbbf24" color="#fbbf24" />
                                    <span>{plan.credits.toLocaleString()}</span>
                                    <small>{lang === 'en' ? 'Credits' : 'کرێدیت'}</small>
                                </div>
                                <div className="credits-hero-hint">
                                    {plan.credits === 0 
                                        ? (lang === 'en' ? 'Standard free features' : 'تایبەتمەندییە بنەڕەتییەکان')
                                        : (lang === 'en' ? `~${Math.round(plan.credits / 3)} AI interactions` : `بەشی نزیکەی ${Math.round(plan.credits / 3)} شیکاری زیرەکی دەستکرد`)}
                                </div>
                            </div>
                            
                            {/* Price Display */}
                            <div className="plan-pricing-container">
                                {plan.originalPrice && (
                                    <div className="plan-original-price-wrap">
                                        <del className="plan-original-price">{plan.originalPrice} {plan.currency || 'IQD'}</del>
                                    </div>
                                )}
                                <div className="plan-price">
                                    <span className="price-digits">{plan.price}</span> 
                                    <span className="price-currency">{plan.currency || 'IQD'}</span>
                                </div>
                            </div>
                            
                            <div className="plan-description">
                                {lang === 'en' 
                                    ? (plan.descriptionEn || plan.descriptionKu) 
                                    : (plan.descriptionKu || plan.descriptionEn)}
                            </div>

                            <ul className="plan-features">
                                {features.map((feat, idx) => (
                                    <li key={idx}>
                                        <div className="feature-check-icon">
                                            <Check size={13} strokeWidth={3} />
                                        </div>
                                        <span>{feat}</span>
                                    </li>
                                ))}
                            </ul>

                            <button 
                                className="btn-select-plan"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleBuyCredits(plan);
                                }}
                                disabled={plan.credits === 0}
                            >
                                {plan.credits === 0 
                                    ? (lang === 'en' ? 'Current Plan' : 'پلانی ئێستا') 
                                    : (lang === 'en' ? 'Select Plan' : 'ئەم پلانە هەڵبژێرە')}
                            </button>
                        </div>
                    );
                })}
            </div>

            {selectedPlan && (
                <div className="upload-section-container" onClick={closeUploadSection}>
                    <div className="receipt-form-content" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={closeUploadSection} title={lang === 'en' ? 'Close' : 'داخستن'}>
                            <X size={20} />
                        </button>
                        
                        {uploadSuccess ? (
                            <div className="upload-success-view">
                                <div className="success-icon-wrapper" style={{ background: isAutoApproved ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)' }}>
                                    <Check size={40} color="#10b981" />
                                </div>
                                <h2>{isAutoApproved ? (lang === 'en' ? 'Successfully Approved! 🎉' : 'بە سەرکەوتوویی پەسەندکرا! 🎉') : (lang === 'en' ? 'Request Submitted!' : 'داواکارییەکەت نێردرا!')}</h2>
                                <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#cbd5e1', whiteSpace: 'pre-line' }}>{uploadSuccess}</p>
                                <button className="btn-confirm-upload" onClick={() => navigate('/profile')}>
                                    {lang === 'en' ? 'Back to Profile' : 'گەڕانەوە بۆ پڕۆفایل'}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="modal-header">
                                    <ImageIcon size={32} color="#a78bfa" />
                                    <h2>{lang === 'en' ? 'Upload Payment Receipt' : 'ناردنی وێنەی وەسڵ'}</h2>
                                    <p>{lang === 'en' ? `Please upload payment transfer receipt image for ${selectedPlan.name} plan` : `تکایە وێنەی وەسڵی پارە ناردنەکە لێرە دابنێ بۆ پلانی ${selectedPlan.name}`}</p>
                                </div>

                                {uploadError && (
                                    <div className="upload-error-msg">
                                        <AlertCircle size={16} />
                                        <span>{uploadError}</span>
                                    </div>
                                )}

                                {/* OFFICIAL PAYMENT ACCOUNTS LIST WITH 1-CLICK COPY */}
                                <div className="payment-accounts-box">
                                    <div className="payment-accounts-title">
                                        <CreditCard size={17} color="#c084fc" />
                                        <span>{lang === 'en' ? 'Official Transfer Accounts (Tap to Copy):' : 'ژمارەی هەژمارەکان بۆ پارە ناردن (بۆ کۆپیکردن کلیک بکە):'}</span>
                                    </div>
                                    <div className="payment-accounts-list">
                                        {PAYMENT_ACCOUNTS.map(acc => {
                                            const isCopied = copiedKey === acc.id;
                                            return (
                                                <div 
                                                    key={acc.id} 
                                                    className={`payment-account-card ${isCopied ? 'copied' : ''}`}
                                                    style={{ 
                                                        '--acc-color': acc.color, 
                                                        '--acc-bg': acc.bg, 
                                                        '--acc-border': acc.border 
                                                    } as any}
                                                    onClick={() => handleCopyAccount(acc.id, acc.number)}
                                                >
                                                    <div className="payment-account-info">
                                                        <div className="payment-account-badge-wrap">
                                                            <span className="payment-account-badge">{acc.badge}</span>
                                                            <span className="payment-account-name">{lang === 'en' ? acc.nameEn : acc.nameKu}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span className="payment-account-num">{acc.displayNumber}</span>
                                                            {acc.holderName && (
                                                                <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '4px' }}>
                                                                    ({acc.holderName})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button type="button" className={`btn-copy-num ${isCopied ? 'btn-copied' : ''}`} tabIndex={-1}>
                                                        {isCopied ? (
                                                            <>
                                                                <Check size={14} color="#10b981" />
                                                                <span>{lang === 'en' ? 'Copied' : 'کۆپیکرا ✓'}</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy size={14} />
                                                                <span>{lang === 'en' ? 'Copy' : 'کۆپیکردن'}</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileChange} 
                                        style={{ display: 'none' }} 
                                        accept="image/*"
                                    />
                                    {receiptPreview ? (
                                        <div className="receipt-preview-container">
                                            <img src={receiptPreview} alt="Receipt Preview" className="receipt-preview-img" />
                                            <div className="change-photo-overlay">{lang === 'en' ? 'Change Photo' : 'گۆڕینی وێنە'}</div>
                                        </div>
                                    ) : (
                                        <div className="upload-placeholder">
                                            <Upload size={40} />
                                            <p>{lang === 'en' ? 'Click here to upload image' : 'بۆ زیادکردنی وێنە لێرە کلیک بکە'}</p>
                                            <span>PNG, JPG or WEBP</span>
                                        </div>
                                    )}
                                </div>

                                <div className="payment-info-box">
                                    <div className="info-row">
                                        <span>{lang === 'en' ? 'Price:' : 'بڕی پارە:'}</span>
                                        <strong>{selectedPlan.price} {selectedPlan.currency}</strong>
                                    </div>
                                    <div className="info-row">
                                        <span>{lang === 'en' ? 'Credits:' : 'کرێدیت:'}</span>
                                        <strong>{selectedPlan.credits} {lang === 'en' ? 'credits' : 'کرێدیت'}</strong>
                                    </div>
                                </div>

                                <button 
                                    className="btn-confirm-upload"
                                    onClick={handleUploadReceipt}
                                    disabled={!receiptFile || isBuying}
                                >
                                    {isBuying ? <div className="spinning"><Upload size={18} /></div> : <Check size={18} />}
                                    {isBuying ? (lang === 'en' ? 'Verifying Receipt...' : 'خەریکە دەپشکنرێت...') : (lang === 'en' ? 'Submit Receipt' : 'ناردنی وەسڵ')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* User Submitted Receipts History Section */}
            {userRequests.length > 0 && (
                <div className="user-requests-history">
                    <div className="history-section-header">
                        <History size={22} color="#a78bfa" />
                        <h3>
                            {lang === 'en' ? 'Your Submitted Receipts & Verification Status' : 'مێژووی وەسڵەکانت و دۆخی پشکنین'}
                        </h3>
                    </div>

                    <div className="history-cards-list">
                        {(showAllReceipts ? userRequests : userRequests.slice(0, 2)).map((req: any) => (
                            <div key={req.id} className="receipt-history-card-item">
                                <div className="receipt-item-top">
                                    <div className="receipt-item-info">
                                        <div 
                                            className="receipt-status-icon-box"
                                            style={{
                                                background: req.status === 'approved' ? 'rgba(16, 185, 129, 0.2)' : req.status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                                color: req.status === 'approved' ? '#10b981' : req.status === 'rejected' ? '#ef4444' : '#f59e0b'
                                            }}
                                        >
                                            {req.status === 'approved' ? <CheckCircle2 size={20} /> : req.status === 'rejected' ? <X size={20} /> : <Clock size={20} />}
                                        </div>
                                        <div className="receipt-item-texts">
                                            <h4>{req.planName} (+{req.amount} {lang === 'en' ? 'Credits' : 'کرێدیت'})</h4>
                                            <span>{new Date(req.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'ckb-IQ')}</span>
                                        </div>
                                    </div>

                                    <div className="receipt-status-badges-wrap">
                                        {req.autoApproved && (
                                            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '11px', padding: '3px 8px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Zap size={12} color="#10b981" /> {lang === 'en' ? 'Auto-Verified' : 'پەسەندکراوی خێرا'}
                                            </span>
                                        )}
                                        <span className={`status-badge-pill ${req.status}`}>
                                            {req.status === 'approved' ? (lang === 'en' ? '✓ Approved' : '✓ پەسەندکرا') : req.status === 'rejected' ? (lang === 'en' ? '✕ Rejected' : '✕ ڕەتکراوە') : (lang === 'en' ? '⏳ Under Review' : '⏳ لە چاوەڕوانیدایە')}
                                        </span>
                                    </div>
                                </div>

                                {/* System Reason or Rejection Reason */}
                                {req.aiData?.reason && (
                                    <div className="receipt-system-note">
                                        <strong style={{ color: '#38bdf8' }}>💡 {lang === 'en' ? 'System Note:' : 'تێبینیی سیستەم:'}</strong> {translateSystemNote(req.aiData.reason, lang)}
                                    </div>
                                )}

                                {req.rejectReason && req.status === 'rejected' && (
                                    <div className="receipt-reject-note">
                                        <strong>⚠️ {lang === 'en' ? 'Rejection Reason:' : 'هۆکاری ڕەتکردنەوە:'}</strong> {translateSystemNote(req.rejectReason, lang)}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Show More / Show Less Button */}
                        {userRequests.length > 2 && (
                            <button 
                                className="btn-toggle-all-receipts"
                                onClick={() => setShowAllReceipts(!showAllReceipts)}
                            >
                                {showAllReceipts ? (
                                    <>
                                        <ChevronUp size={18} />
                                        <span>{lang === 'en' ? 'Show Less' : 'شاردنەوەی وەسڵەکان'}</span>
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown size={18} />
                                        <span>
                                            {lang === 'en' 
                                                ? `Show More (+${userRequests.length - 2} More Receipts)` 
                                                : `زیاتر (+${userRequests.length - 2} وەسڵی تر)`}
                                        </span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
