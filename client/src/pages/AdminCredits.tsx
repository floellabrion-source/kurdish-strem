import { useState, useEffect } from 'react';
import axios from '../api/client';
import { 
    Search, CreditCard, UserPlus, ShieldCheck, Zap, X, Coins, Clock, 
    CheckCircle2, AlertCircle, Eye, Download, ZoomIn, ZoomOut, RotateCw, 
    Filter, ArrowUpRight, ArrowDownRight, RefreshCw, Sparkles, Check, MessageSquare, ChevronDown, Plus, Minus
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import './AdminCredits.css';

interface User {
    id: string;
    username: string;
    email?: string;
    avatar?: string;
    avatarUrl?: string;
    role: string;
    credits: number;
    points: number;
}

interface PurchaseRequest {
    id: string;
    userId: string;
    username: string;
    amount: number;
    planName: string;
    receiptUrl: string;
    status: 'pending' | 'approved' | 'rejected';
    autoApproved?: boolean;
    viewed?: boolean;
    isViewed?: boolean;
    aiData?: {
        isReceipt?: boolean;
        isValidSuccessful?: boolean;
        provider?: string;
        amount?: number;
        currency?: string;
        transactionId?: string;
        sender?: string;
        recipient?: string;
        recipientName?: string;
        recipientPhone?: string;
        recipientAccount?: string;
        recipientIban?: string;
        isOfficialRecipient?: boolean;
        dateStr?: string;
        timeStr?: string;
        isoDateTime?: string;
        confidence?: string;
        reason?: string;
        pendingReason?: string;
    } | null;
    rejectReason?: string;
    createdAt: number;
    processedAt?: number;
}

const PRESET_REJECT_REASONS = [
    { id: 'blurry', ku: 'وێنەی وەسڵەکە ڕوون نییە و ناخوێنرێتەوە', en: 'Receipt image is blurry or unreadable' },
    { id: 'not_received', ku: 'پارەکە تا ئێستا نەگەیشتووەتە هەژمارەکەمان', en: 'Payment has not been received in our account' },
    { id: 'wrong_amount', ku: 'بڕی پارەی نێردراو لەگەڵ ئەم پلانە یەکناگرێتەوە', en: 'Transferred amount does not match plan price' },
    { id: 'duplicate', ku: 'ئەم وەسڵە پێشتر بەکارهاتووە و دووبارەیە', en: 'This receipt was already processed or duplicate' }
];

export default function AdminCredits() {
    const { user: currentUser } = useAuth();
    const { lang, t } = useLanguage();
    const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'maher2' || currentUser?.username?.toLowerCase() === 'admin';

    const [users, setUsers] = useState<User[]>([]);
    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'requests' | 'users'>(() => {
        try {
            const saved = localStorage.getItem('admin_credits_subtab');
            if (saved === 'requests' || saved === 'users') return saved;
        } catch {}
        return 'requests';
    });

    useEffect(() => {
        try {
            localStorage.setItem('admin_credits_subtab', activeTab);
        } catch {}
    }, [activeTab]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleCount, setVisibleCount] = useState(6);
    const [visibleUsersCount, setVisibleUsersCount] = useState(6);
    
    // Direct Credit Modal (Super Admin only)
    const [creditModal, setCreditModal] = useState<User | null>(null);
    const [creditAmount, setCreditAmount] = useState<string>('100');
    const [creditActionType, setCreditActionType] = useState<'add' | 'deduct'>('add');
    
    // Request Modal
    const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [receiptZoom, setReceiptZoom] = useState(1);
    const [receiptRotation, setReceiptRotation] = useState(0);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toastMessage, setToastMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    // Initial Welcome Credits Setting (Super Admin)
    const [initialRegistrationCredits, setInitialRegistrationCredits] = useState<number>(75);
    const [initialCreditsInput, setInitialCreditsInput] = useState<string>('75');
    const [savingInitialCredits, setSavingInitialCredits] = useState<boolean>(false);

    const [viewedRequests, setViewedRequests] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('kurdish_stream_viewed_requests');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const handleInspectRequest = (req: PurchaseRequest) => {
        setSelectedRequest(req);
        setReceiptZoom(1);
        setReceiptRotation(0);
        setRejectReason('');

        // Mark as viewed in local state & localStorage
        if (!viewedRequests.includes(req.id)) {
            const updated = [...viewedRequests, req.id];
            setViewedRequests(updated);
            try {
                localStorage.setItem('kurdish_stream_viewed_requests', JSON.stringify(updated));
            } catch {}
        }

        // Notify server
        axios.post(`/api/admin/credit-requests/${req.id}/view`).catch(() => {});

        // Optimistically update requests list
        setRequests(prev => prev.map(r => r.id === req.id ? { ...r, viewed: true, isViewed: true } : r));
    };

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 4500);
    };

    const handleSaveInitialCredits = async (amountToSave?: number) => {
        const val = amountToSave !== undefined ? amountToSave : parseInt(initialCreditsInput, 10);
        if (isNaN(val) || val < 0) {
            showToast(lang === 'en' ? 'Please enter a valid credit number' : 'تکایە ژمارەیەکی دروست بنووسە', 'error');
            return;
        }

        setSavingInitialCredits(true);
        try {
            const res = await axios.post('/api/admin/settings/initial-credits', { credits: val });
            const savedVal = res.data?.initialRegistrationCredits ?? val;
            setInitialRegistrationCredits(savedVal);
            setInitialCreditsInput(String(savedVal));
            showToast(
                lang === 'en'
                    ? `Saved! New users will now receive ${savedVal} welcome credits upon registration ✓`
                    : `پاشەکەوت کرا! لەم کاتەوە هەر کەسێک خۆی تۆمار بکات ${savedVal} کرێدیت بە دیاری وەردەگرێت ✓`,
                'success'
            );
        } catch (err: any) {
            showToast(err?.response?.data?.error || (lang === 'en' ? 'Failed to update settings' : 'هەڵەیەک ڕووی دا لە پاشەکەوتکردن'), 'error');
        } finally {
            setSavingInitialCredits(false);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersRes, requestsRes, settingsRes] = await Promise.allSettled([
                axios.get('/api/admin/users'),
                axios.get('/api/admin/credit-requests'),
                axios.get('/api/admin/system-settings')
            ]);
            if (usersRes.status === 'fulfilled' && Array.isArray(usersRes.value.data)) {
                setUsers(usersRes.value.data);
            }
            if (requestsRes.status === 'fulfilled' && Array.isArray(requestsRes.value.data)) {
                setRequests(requestsRes.value.data.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)));
            }
            if (settingsRes.status === 'fulfilled' && settingsRes.value?.data?.settings) {
                const s = settingsRes.value.data.settings;
                if (s.initialRegistrationCredits !== undefined) {
                    setInitialRegistrationCredits(s.initialRegistrationCredits);
                    setInitialCreditsInput(String(s.initialRegistrationCredits));
                }
            }
        } catch (error) {
            console.error('Failed to load credits admin data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdjustCredits = async () => {
        if (!creditModal || !creditAmount || isNaN(parseInt(creditAmount, 10))) return;
        const amountNum = parseInt(creditAmount, 10);
        if (amountNum <= 0) return;
        
        setIsSubmitting(true);
        const finalAmount = creditActionType === 'add' ? amountNum : -amountNum;
        const targetUserId = creditModal.id;
        const targetUsername = creditModal.username;
        
        try {
            const res = await axios.post(`/api/admin/users/${targetUserId}/credits`, {
                amount: finalAmount
            });
            
            const newCredits = res.data?.credits ?? Math.max(0, (creditModal.credits || 0) + finalAmount);
            
            // Instantly update the users list in local state
            setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, credits: newCredits } : u));
            
            if (finalAmount > 0) {
                showToast(
                    lang === 'en' 
                        ? `Successfully added +${finalAmount} credits to ${targetUsername}! ✓` 
                        : `سەرکەوتوو بوو! +${finalAmount} کرێدیت بۆ ${targetUsername} زیادکرا ✓`,
                    'success'
                );
            } else {
                showToast(
                    lang === 'en' 
                        ? `Successfully deducted ${Math.abs(finalAmount)} credits from ${targetUsername}! ✗` 
                        : `سەرکەوتوو بوو! ${Math.abs(finalAmount)} کرێدیت لە ${targetUsername} کەمکرایەوە ✗`,
                    'error'
                );
            }
            setCreditModal(null);
            setCreditAmount('100');
            loadData();
        } catch (error: any) {
            showToast(error?.response?.data?.error || (lang === 'en' ? 'Error adjusting user credits' : 'کێشەیەک ڕووی دا لە دەستکاریکردنی کرێدیت'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleProcessRequest = async (requestId: string, action: 'approve' | 'reject') => {
        setIsSubmitting(true);
        try {
            await axios.post('/api/admin/process-credit-request', {
                requestId,
                action,
                message: action === 'reject' ? (rejectReason || (lang === 'en' ? 'Receipt could not be verified.' : 'وێنەی وەسڵەکە پشتڕاست نەکرایەوە')) : undefined
            });
            showToast(
                action === 'approve' 
                    ? (lang === 'en' ? 'Request approved and credits credited to user! ✓' : 'داواکارییەکە پەسەند کرا و کرێدیت بۆ بەکارهێنەر زیاد کرا ✓') 
                    : (lang === 'en' ? 'Request rejected and notification sent! ✗' : 'داواکارییەکە ڕەتکرایەوە و ئاگاداری بۆ بەکارهێنەر نێردرا ✗')
            );
            setSelectedRequest(null);
            setRejectReason('');
            setReceiptZoom(1);
            setReceiptRotation(0);
            loadData();
        } catch (error) {
            showToast(lang === 'en' ? 'Error processing credit request' : 'کێشەیەک ڕووی دا لە پڕۆسێسکردنی داواکارییەکە', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const filteredUsers = users.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const pendingRequests = requests.filter(r => r.status === 'pending');
    const approvedRequests = requests.filter(r => r.status === 'approved');
    const rejectedRequests = requests.filter(r => r.status === 'rejected');

    const filteredRequests = requests.filter(r => {
        const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
        const matchesSearch = !searchTerm || 
            r.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (r.planName && r.planName.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesStatus && matchesSearch;
    });

    return (
        <div className="admin-credits-container">
            {toastMessage && (
                <div className={`success-toast ${toastMessage.type}`}>
                    {toastMessage.type === 'success' ? <Zap size={20} /> : <AlertCircle size={20} />}
                    {toastMessage.text}
                </div>
            )}

            {/* Subtabs for Super Admin Only */}
            {isSuperAdmin && (
                <div className="credits-tabs">
                    <button 
                        className={activeTab === 'requests' ? 'active' : ''} 
                        onClick={() => setActiveTab('requests')}
                    >
                        <Clock size={18} /> {lang === 'en' ? 'Payment Requests' : 'داواکارییەکانی پارەدان'} 
                        {pendingRequests.length > 0 && <span className="count-badge pulse">{pendingRequests.length}</span>}
                    </button>
                    <button 
                        className={activeTab === 'users' ? 'active' : ''} 
                        onClick={() => setActiveTab('users')}
                    >
                        <UserPlus size={18} /> {lang === 'en' ? 'User Balances & Give Credits' : 'باڵانسی بەکارهێنەران و بەخشین'}
                    </button>
                </div>
            )}

            <div className="credits-header">
                {isSuperAdmin && (
                    <div className="welcome-credits-card">
                        <div className="welcome-credits-info">
                            <div className="welcome-credits-icon">
                                <Sparkles size={24} color="#38bdf8" />
                            </div>
                            <div className="welcome-credits-texts">
                                <h4>
                                    {lang === 'en' ? '🎁 Welcome Registration Credits Setting' : '🎁 دیاریکردنی بڕی کرێدیتی دیاری بۆ بەکارهێنەری نوێ'}
                                    <span className="current-badge">{initialRegistrationCredits} {lang === 'en' ? 'Credits' : 'کرێدیت'}</span>
                                </h4>
                                <p>
                                    {lang === 'en' 
                                        ? 'New users registering via email, phone, or Google will automatically receive this amount of free credits.' 
                                        : 'هەر بەکارهێنەرێکی نوێ کە لەم ساتەوە خۆی تۆمار دەکات یان بە گووگڵ دێتە ژوورەوە، دەستبەجێ ئەم بڕە کرێدیتە بە دیاری وەردەگرێت.'}
                                </p>
                            </div>
                        </div>
                        <div className="welcome-credits-controls">
                            <div className="quick-credit-chips">
                                {[0, 25, 50, 75, 100, 150, 200].map(val => (
                                    <button
                                        key={val}
                                        type="button"
                                        className={`chip-btn ${parseInt(initialCreditsInput, 10) === val ? 'active' : ''}`}
                                        onClick={() => {
                                            setInitialCreditsInput(String(val));
                                            handleSaveInitialCredits(val);
                                        }}
                                    >
                                        {val === 0 ? (lang === 'en' ? '0 (Off)' : '٠ (ناچالاک)') : `${val}`}
                                    </button>
                                ))}
                            </div>
                            <div className="custom-credit-input-group">
                                <input
                                    type="number"
                                    min="0"
                                    max="10000"
                                    value={initialCreditsInput}
                                    onChange={e => setInitialCreditsInput(e.target.value)}
                                    placeholder="75"
                                />
                                <button
                                    type="button"
                                    disabled={savingInitialCredits}
                                    onClick={() => handleSaveInitialCredits()}
                                    className="save-credits-btn"
                                >
                                    {savingInitialCredits ? (
                                        <RefreshCw size={16} className="spinning" />
                                    ) : (
                                        <Check size={16} />
                                    )}
                                    {lang === 'en' ? 'Save' : 'پاشەکەوتکردن'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="credits-stats-cards">
                    <div className="stat-card">
                        <div className="stat-icon-wrapper blue">
                            <Coins size={24} />
                        </div>
                        <div className="stat-details">
                            <h3>{lang === 'en' ? 'Total Requests' : 'کۆی داواکارییەکان'}</h3>
                            <p>{requests.length} {lang === 'en' ? 'requests' : 'داواکاری'}</p>
                        </div>
                    </div>
                    <div className="stat-card" style={{ borderLeft: '4px solid #fbbf24' }}>
                        <div className="stat-icon-wrapper amber">
                            <Clock size={24} color="#fbbf24" />
                        </div>
                        <div className="stat-details">
                            <h3>{lang === 'en' ? 'Pending Approval' : 'چاوەڕوانی پەسەندکردن'}</h3>
                            <p>{pendingRequests.length} {lang === 'en' ? 'pending' : 'دانە'}</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon-wrapper green">
                            <CheckCircle2 size={24} color="#10b981" />
                        </div>
                        <div className="stat-details">
                            <h3>{lang === 'en' ? 'Approved Requests' : 'پەسەندکراوەکان'}</h3>
                            <p>{approvedRequests.length} {lang === 'en' ? 'approved' : 'دانە'}</p>
                        </div>
                    </div>
                </div>

                <div className="credits-filter-row">
                    {activeTab === 'requests' && (
                        <div className="status-filter-pills">
                            <button className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
                                {lang === 'en' ? 'All' : 'هەمووی'} ({requests.length})
                            </button>
                            <button className={`filter-pill ${statusFilter === 'pending' ? 'active' : ''}`} onClick={() => setStatusFilter('pending')}>
                                {lang === 'en' ? 'Pending' : 'چاوەڕوانە'} ({pendingRequests.length})
                            </button>
                            <button className={`filter-pill ${statusFilter === 'approved' ? 'active' : ''}`} onClick={() => setStatusFilter('approved')}>
                                {lang === 'en' ? 'Approved' : 'پەسەندکراو'} ({approvedRequests.length})
                            </button>
                            <button className={`filter-pill ${statusFilter === 'rejected' ? 'active' : ''}`} onClick={() => setStatusFilter('rejected')}>
                                {lang === 'en' ? 'Rejected' : 'ڕەتکراوە'} ({rejectedRequests.length})
                            </button>
                        </div>
                    )}

                    <div className="search-wrapper">
                        <Search size={18} className="search-icon" />
                        <input 
                            type="text" 
                            placeholder={isSuperAdmin && activeTab === 'users' ? (lang === 'en' ? "Search username or email..." : "گەڕان بۆ بەکارهێنەر یان ئیمەیڵ...") : (lang === 'en' ? "Search requests..." : "گەڕان لە داواکارییەکان...")} 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>{t('loading')}</p>
                </div>
            ) : isSuperAdmin && activeTab === 'users' ? (
                <div className="credits-grid">
                    {filteredUsers.slice(0, visibleUsersCount).map(user => {
                        const userAvatar = user.avatar || user.avatarUrl;
                        return (
                            <div key={user.id} className={`credit-user-card ${user.role === 'super_admin' ? 'is-super' : user.role === 'admin' ? 'is-admin' : ''}`}>
                                <div className="credit-user-profile-left">
                                    <div className="credit-user-avatar">
                                        {userAvatar ? (
                                            <img 
                                                src={userAvatar} 
                                                alt={user.username} 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '14px' }} 
                                            />
                                        ) : (
                                            user.username.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="credit-user-details">
                                        <div className="user-name-role-row">
                                            <h4>{user.username}</h4>
                                            {user.role === 'super_admin' || user.username === 'maher2' ? (
                                                <span className="user-role-pill super">👑 {lang === 'en' ? 'Super Admin' : 'سەرۆک'}</span>
                                            ) : user.role === 'admin' ? (
                                                <span className="user-role-pill admin">🛡️ {lang === 'en' ? 'Admin' : 'ئەدمین'}</span>
                                            ) : (
                                                <span className="user-role-pill user">👤 {lang === 'en' ? 'User' : 'بەکارهێنەر'}</span>
                                            )}
                                        </div>
                                        <span className="user-email-sub">{user.email || (lang === 'en' ? 'No email' : 'بێ ئیمەیڵ')}</span>
                                        <div className="current-credits">
                                            <Zap size={13} fill="#fbbf24" color="#fbbf24" /> 
                                            <strong>{(user.credits || 0).toLocaleString()}</strong> {lang === 'en' ? 'credits' : 'کرێدیت'}
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    className="give-credit-btn"
                                    onClick={() => {
                                        setCreditModal(user);
                                        setCreditAmount('100');
                                        setCreditActionType('add');
                                    }}
                                >
                                    <Zap size={14} /> {lang === 'en' ? 'Adjust' : 'دەستکاری'}
                                </button>
                            </div>
                        );
                    })}
                    {filteredUsers.length === 0 && (
                        <div className="no-data" style={{ gridColumn: '1/-1' }}>
                            <p>{lang === 'en' ? 'No users found matching search' : 'هیچ بەکارهێنەرێک نەدۆزرایەوە'}</p>
                        </div>
                    )}
                    {filteredUsers.length > visibleUsersCount && (
                        <div className="load-more-requests-wrap" style={{ gridColumn: '1 / -1' }}>
                            <button 
                                type="button" 
                                className="btn-load-more-custom"
                                onClick={() => setVisibleUsersCount(prev => prev + 6)}
                            >
                                <ChevronDown size={18} />
                                <span>{lang === 'en' ? `Show 6 More Users (${filteredUsers.length - visibleUsersCount} remaining)` : `بینینی ٦ بەکارهێنەری تر (${filteredUsers.length - visibleUsersCount} دانە ماوە)`}</span>
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="requests-list">
                    {filteredRequests.slice(0, visibleCount).map(req => {
                        const isUnviewed = !req.viewed && !req.isViewed && !viewedRequests.includes(req.id);
                        return (
                            <div key={req.id} className={`request-item ${req.status} ${isUnviewed ? 'unviewed-glow' : 'is-viewed'}`}>
                                <div className="req-user">
                                    <div className="req-avatar-wrap">
                                        <div className="req-avatar">{req.username.charAt(0).toUpperCase()}</div>
                                        {isUnviewed && (
                                            <span className="unviewed-lamp-badge" title={lang === 'en' ? 'New / Not inspected' : 'نەبینراوە / نوێیە'}>
                                                <span className="lamp-glow-dot"></span>
                                            </span>
                                        )}
                                    </div>
                                    <div className="req-info">
                                        <h4>
                                            {req.username}
                                            {isUnviewed && <span className="new-tag-pill">{lang === 'en' ? 'NEW' : 'نوێ'}</span>}
                                        </h4>
                                        <span>{new Date(req.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'ku-IQ')}</span>
                                    </div>
                                </div>
                                
                                <div className="req-plan">
                                    <span className="plan-label">{lang === 'en' ? 'Plan:' : 'پلان:'}</span>
                                    <span className="plan-value">{req.planName}</span>
                                </div>

                                <div className="req-amount">
                                    <span className="amount-value">+{req.amount} {lang === 'en' ? 'credits' : 'کرێدیت'}</span>
                                </div>

                                <div className="req-status">
                                    {req.autoApproved && (
                                        <span className="status-badge" style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', border: '1px solid rgba(139, 92, 246, 0.4)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Sparkles size={12} color="#fbbf24" /> AI Auto
                                        </span>
                                    )}
                                    {req.status === 'pending' && <span className="status-badge pending">⏳ {lang === 'en' ? 'Pending' : 'چاوەڕوانە'}</span>}
                                    {req.status === 'approved' && <span className="status-badge approved">✓ {lang === 'en' ? 'Approved' : 'پەسەندکرا'}</span>}
                                    {req.status === 'rejected' && (
                                        <span className="status-badge rejected" title={req.rejectReason}>
                                            ✕ {lang === 'en' ? 'Rejected' : 'ڕەتکراوە'}
                                        </span>
                                    )}
                                </div>

                                <div className="req-actions">
                                    <button 
                                        className={`view-receipt-btn ${isUnviewed ? 'glow-btn' : ''}`}
                                        onClick={() => handleInspectRequest(req)}
                                    >
                                        <Eye size={16} /> {lang === 'en' ? 'Inspect' : 'پشکنین'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {filteredRequests.length === 0 && (
                        <div className="no-data">
                            <Coins size={48} />
                            <h3>{lang === 'en' ? 'No payment requests found' : 'هیچ داواکارییەکی پارەدان نەدۆزرایەوە'}</h3>
                            <p>{lang === 'en' ? 'User receipts and top-up requests will appear here.' : 'وەسڵەکانی بەکارهێنەران لێرە دەردەکەون بۆ پەسەندکردن.'}</p>
                        </div>
                    )}

                    {filteredRequests.length > visibleCount && (
                        <div className="load-more-requests-wrap">
                            <button 
                                type="button"
                                className="btn-load-more-custom"
                                onClick={() => setVisibleCount(prev => prev + 6)}
                            >
                                <ChevronDown size={18} />
                                <span>{lang === 'en' ? `Show 6 More Requests (${filteredRequests.length - visibleCount} remaining)` : `بینینی ٦ داواکاری تر (${filteredRequests.length - visibleCount} دانە ماوە)`}</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Request Inspection Modal */}
            {selectedRequest && (
                <div className="modal-overlay" onClick={() => setSelectedRequest(null)}>
                    <div className="modal-content glass request-modal" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={() => setSelectedRequest(null)}>
                            <X size={20} />
                        </button>
                        
                        <div className="request-modal-body">
                            <div className="receipt-preview-panel">
                                <div className="panel-header">
                                    <h4>{lang === 'en' ? 'Attached Receipt' : 'وێنەی وەسڵ'}</h4>
                                    <div className="img-controls">
                                        <button onClick={() => setReceiptZoom(z => Math.min(2.5, z + 0.25))} title="Zoom In"><ZoomIn size={16} /></button>
                                        <button onClick={() => setReceiptZoom(z => Math.max(0.5, z - 0.25))} title="Zoom Out"><ZoomOut size={16} /></button>
                                        <button onClick={() => setReceiptRotation(r => (r + 90) % 360)} title="Rotate"><RotateCw size={16} /></button>
                                        <a href={selectedRequest.receiptUrl} download={`receipt_${selectedRequest.username}.jpg`} target="_blank" rel="noreferrer" title="Open Full Size">
                                            <Download size={16} />
                                        </a>
                                    </div>
                                </div>
                                <div className="receipt-img-container">
                                    <img 
                                        src={selectedRequest.receiptUrl} 
                                        alt="Receipt" 
                                        style={{ 
                                            transform: `scale(${receiptZoom}) rotate(${receiptRotation}deg)`,
                                            transition: 'transform 0.2s ease'
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="request-details-panel">
                                <h3>{lang === 'en' ? 'Request Details' : 'زانیاری داواکاری'}</h3>
                                <div className="detail-row">
                                    <span>{lang === 'en' ? 'User:' : 'بەکارهێنەر:'}</span>
                                    <strong>{selectedRequest.username}</strong>
                                </div>
                                <div className="detail-row">
                                    <span>{lang === 'en' ? 'Selected Plan:' : 'پلان:'}</span>
                                    <strong className="text-accent">{selectedRequest.planName}</strong>
                                </div>

                                {selectedRequest.aiData && (
                                    <div className="ai-inspection-box">
                                        <div className="ai-box-header">
                                            <span className="ai-title-wrap"><Sparkles size={15} color="#fbbf24" /> {lang === 'en' ? 'AI OCR Receipt Analysis' : 'شیکاریی زیرەکی دەستکرد (AI OCR)'}</span>
                                            {selectedRequest.autoApproved ? (
                                                <span className="ai-badge approved">Auto-Approved ✓</span>
                                            ) : (
                                                <span className="ai-badge scanned">Scanned</span>
                                            )}
                                        </div>
                                        <div className="ai-field-row">
                                            <span>{lang === 'en' ? 'Provider / Bank:' : 'دابینکەر / بانک:'}</span>
                                            <strong>{selectedRequest.aiData.provider || (lang === 'en' ? 'Unknown' : 'نەزانراو')}</strong>
                                        </div>
                                        <div className="ai-field-row">
                                            <span>{lang === 'en' ? 'Receipt Amount:' : 'بڕی پارەی وەسڵ:'}</span>
                                            <strong className="ai-amount-val">{selectedRequest.aiData.amount?.toLocaleString()} {selectedRequest.aiData.currency || 'IQD'}</strong>
                                        </div>
                                        {selectedRequest.aiData.reason && <p className="ai-reason-text">💡 {selectedRequest.aiData.reason}</p>}
                                    </div>
                                )}
                                
                                <div className="detail-row">
                                    <span>{lang === 'en' ? 'Credits to Add:' : 'بڕی کرێدیت:'}</span>
                                    <strong>+{selectedRequest.amount} {lang === 'en' ? 'credits' : 'کرێدیت'}</strong>
                                </div>
                                <div className="detail-row">
                                    <span>{lang === 'en' ? 'Submission Date:' : 'کاتی ناردن:'}</span>
                                    <strong>{new Date(selectedRequest.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'ku-IQ')}</strong>
                                </div>

                                {selectedRequest.status === 'pending' ? (
                                    <div className="action-panel">
                                        <div className="reject-presets">
                                            <label className="presets-title"><MessageSquare size={13} /> {lang === 'en' ? 'Quick Reject Reasons:' : 'هۆکارە ئامادەکراوەکانی ڕەتکردنەوە:'}</label>
                                            <div className="presets-list">
                                                {PRESET_REJECT_REASONS.map(preset => {
                                                    const presetText = lang === 'en' ? preset.en : preset.ku;
                                                    const isSelected = rejectReason === presetText;
                                                    return (
                                                        <button 
                                                            key={preset.id}
                                                            type="button"
                                                            className={`preset-btn ${isSelected ? 'selected' : ''}`}
                                                            onClick={() => setRejectReason(prev => prev === presetText ? '' : presetText)}
                                                        >
                                                            {presetText}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="reject-reason-box">
                                            <textarea 
                                                placeholder={lang === 'en' ? "Optional: Add or customize note to user if rejecting..." : "ئارەزوومەندانە: هۆکاری ڕەتکردنەوە بنووسە بۆ بەکارهێنەر..."}
                                                value={rejectReason}
                                                onChange={(e) => setRejectReason(e.target.value)}
                                                rows={2}
                                            />
                                        </div>

                                        <div className="action-buttons">
                                            <button 
                                                className="btn-reject"
                                                onClick={() => handleProcessRequest(selectedRequest.id, 'reject')}
                                                disabled={isSubmitting}
                                            >
                                                <AlertCircle size={18} /> {lang === 'en' ? 'Reject' : 'ڕەتکردنەوە'}
                                            </button>
                                            <button 
                                                className="btn-approve"
                                                onClick={() => handleProcessRequest(selectedRequest.id, 'approve')}
                                                disabled={isSubmitting}
                                            >
                                                {isSubmitting ? <RefreshCw size={18} className="spinning" /> : <Check size={18} />}
                                                {lang === 'en' ? 'Approve & Credit User' : 'پەسەندکردن و بەخشینی کرێدیت'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`final-status ${selectedRequest.status}`}>
                                        {selectedRequest.status === 'approved' ? (
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <CheckCircle2 size={20} color="#10b981" /> 
                                                    <strong style={{ color: '#10b981', fontSize: '14px' }}>
                                                        {lang === 'en' ? 'This request was approved and credits credited.' : 'ئەم داواکارییە پەسەند کراوە و کرێدیت بۆ هەژمارەکە زیاد کرا.'}
                                                    </strong>
                                                </div>
                                                {selectedRequest.autoApproved && (
                                                    <div style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', padding: '6px 10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Sparkles size={14} color="#fbbf24" /> 
                                                        <small style={{ color: '#c4b5fd', fontWeight: 600 }}>
                                                            {lang === 'en' ? 'Auto-approved by AI OCR system' : 'بە ئۆتۆماتیکی لەلایەن سیستەمی زیرەکی دەستکردەوە (AI) پەسەندکراوە'}
                                                        </small>
                                                    </div>
                                                )}

                                                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#f87171', marginBottom: '8px' }}>
                                                        🛑 {lang === 'en' ? 'Revoke & Deduct Credits from User:' : 'ڕەتکردنەوە و وەرگرتنەوەی کرێدیت لە بەکارهێنەر:'}
                                                    </label>
                                                    <textarea 
                                                        placeholder={lang === 'en' ? "Enter reason for revoking credits..." : "هۆکاری ڕەتکردنەوە و وەرگرتنەوەی کرێدیت بنووسە..."}
                                                        value={rejectReason}
                                                        onChange={(e) => setRejectReason(e.target.value)}
                                                        rows={2}
                                                        style={{ width: '100%', marginBottom: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '13px' }}
                                                    />
                                                    <button 
                                                        className="btn-reject"
                                                        style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 800, background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)' }}
                                                        onClick={() => handleProcessRequest(selectedRequest.id, 'reject')}
                                                        disabled={isSubmitting}
                                                    >
                                                        <AlertCircle size={18} /> 
                                                        {lang === 'en' ? `Revoke Request & Deduct (-${selectedRequest.amount} Credits)` : `ڕەتکردنەوە و وەرگرتنەوەی (-${selectedRequest.amount}) کرێدیت`}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <p><AlertCircle size={20} color="#ef4444" /> {lang === 'en' ? 'This request was rejected.' : 'ئەم داواکارییە ڕەتکراوەتەوە.'}</p>
                                                <small>{lang === 'en' ? 'Reason:' : 'هۆکار:'} {selectedRequest.rejectReason}</small>
                                                
                                                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                                    <button 
                                                        className="btn-approve"
                                                        style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 800, background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)' }}
                                                        onClick={() => handleProcessRequest(selectedRequest.id, 'approve')}
                                                        disabled={isSubmitting}
                                                    >
                                                        <Check size={18} /> 
                                                        {lang === 'en' ? `Re-Approve & Grant (+${selectedRequest.amount} Credits)` : `پەسەندکردنەوە و بەخشینی (+${selectedRequest.amount}) کرێدیت`}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Direct Credit Adjustment Modal (Super Admin only) */}
            {isSuperAdmin && creditModal && (
                <div className="modal-overlay" onClick={() => setCreditModal(null)}>
                    <div className="credit-modal-content glass" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={() => setCreditModal(null)}>
                            <X size={20} />
                        </button>
                        <div className="modal-header-avatar-wrap">
                            {(creditModal.avatar || creditModal.avatarUrl) ? (
                                <img 
                                    src={creditModal.avatar || creditModal.avatarUrl} 
                                    alt={creditModal.username} 
                                    className="modal-header-avatar-img"
                                />
                            ) : (
                                <div className="modal-header-avatar-letter">
                                    {creditModal.username.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <h2>{lang === 'en' ? `Manage Credits for ${creditModal.username}` : `دەستکاری کرێدیت بۆ ${creditModal.username}`}</h2>
                        <p>{lang === 'en' ? `Current Balance: ${creditModal.credits || 0} credits` : `باڵانسی ئێستای بەکارهێنەر: ${creditModal.credits || 0} کرێدیت`}</p>
                        
                        <div className="action-type-toggle">
                            <button 
                                className={`type-btn ${creditActionType === 'add' ? 'active-add' : ''}`}
                                onClick={() => setCreditActionType('add')}
                            >
                                <ArrowUpRight size={16} /> {lang === 'en' ? 'Add Credits (+)' : 'زیادکردنی کرێدیت (+)'}
                            </button>
                            <button 
                                className={`type-btn ${creditActionType === 'deduct' ? 'active-deduct' : ''}`}
                                onClick={() => setCreditActionType('deduct')}
                            >
                                <ArrowDownRight size={16} /> {lang === 'en' ? 'Deduct Credits (-)' : 'کەمکردنەوەی کرێدیت (-)'}
                            </button>
                        </div>

                        <div className="modern-credit-stepper">
                            <button 
                                type="button" 
                                className="credit-step-btn minus"
                                onClick={() => setCreditAmount(prev => String(Math.max(1, (parseInt(prev, 10) || 0) - 1)))}
                                title="-1"
                            >
                                <Minus size={18} />
                            </button>
                            <div className="credit-stepper-input-box">
                                <CreditCard size={18} className="stepper-card-icon" />
                                <input 
                                    type="number" 
                                    placeholder="0" 
                                    value={creditAmount}
                                    onChange={(e) => setCreditAmount(e.target.value)}
                                    autoFocus
                                    min="1"
                                />
                                <span className="stepper-unit-label">{lang === 'en' ? 'Credits' : 'کرێدیت'}</span>
                            </div>
                            <button 
                                type="button" 
                                className="credit-step-btn plus"
                                onClick={() => setCreditAmount(prev => String((parseInt(prev, 10) || 0) + 1))}
                                title="+1"
                            >
                                <Plus size={18} />
                            </button>
                        </div>

                        <div className="quick-amounts">
                            {['50', '100', '500', '1500'].map(amt => (
                                <button 
                                    key={amt} 
                                    type="button"
                                    className={creditAmount === amt ? 'active-quick-amt' : ''}
                                    onClick={() => setCreditAmount(amt)}
                                >
                                    +{amt}
                                </button>
                            ))}
                        </div>

                        <button 
                            className={`submit-credit-btn ${creditActionType === 'deduct' ? 'deduct-mode' : ''}`}
                            onClick={handleAdjustCredits}
                            disabled={!creditAmount || isNaN(parseInt(creditAmount, 10)) || isSubmitting}
                        >
                            {isSubmitting ? <RefreshCw size={18} className="spinning" /> : <Check size={18} />}
                            {isSubmitting 
                                ? (lang === 'en' ? 'Saving changes...' : 'خەریکە پاشەکەوت دەکرێت...') 
                                : (creditActionType === 'add' 
                                    ? (lang === 'en' ? `Add ${creditAmount || 0} Credits` : `زیادکردنی ${creditAmount || 0} کرێدیت`) 
                                    : (lang === 'en' ? `Deduct ${creditAmount || 0} Credits` : `کەمکردنەوەی ${creditAmount || 0} کرێدیت`))}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}