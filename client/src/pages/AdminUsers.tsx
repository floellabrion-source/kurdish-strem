import { useState, useEffect } from 'react';
import axios from '../api/client';
import {
    Loader2, ShieldBan, ShieldCheck, CreditCard, Search, X, Clock, MessageSquare,
    UserPlus, Shield, Film, Languages, Check, Edit3, KeyRound, Sparkles, UserX, 
    AlertCircle, CheckCircle, Eye, EyeOff, Mail, User as UserIcon, ChevronDown, Layers,
    Trophy, Flame, RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { AdminPermissions } from '../types';
import './AdminUsers.css';

export interface LeaderboardItem {
    id: string;
    username: string;
    role: string;
    avatar: string;
    subtitlesEdited: number;
    linesTranslated: number;
    wordsAdded: number;
    moviesAdded: number;
    moviesApproved: number;
    receiptsReviewed: number;
    totalScore: number;
    rank: number;
    lastActive: string | null;
}

interface UserItem {
    id: string;
    username: string;
    email?: string;
    plainPassword?: string;
    hasPasswordHash?: boolean;
    role: string;
    permissions?: AdminPermissions;
    credits: number;
    points?: number;
    level?: string | null;
    assessmentResult?: any;
    flashcardsCount: number;
    flashcards?: { id: string, front: string, back: string }[];
    suspendedUntil: string | null;
    suspensionReason: string | null;
    dailyStats?: Record<string, { watchMinutes: number; sentencesSeen: number }>;
}

const DEFAULT_PERMISSIONS: AdminPermissions = {
    canTranslate: true,
    canAddMovies: true,
    canManageCredits: false,
    canManageComments: true,
    canPublishDirectly: false
};

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

export default function AdminUsers() {
    const { user: currentUser } = useAuth();
    const { lang, t } = useLanguage();
    const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'maher2' || currentUser?.username?.toLowerCase() === 'admin';

    const [users, setUsers] = useState<UserItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'admins' | 'users' | 'suspended'>('all');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Sub-Tabs: 'users' or 'leaderboard'
    const [activeSubTab, setActiveSubTab] = useState<'users' | 'leaderboard'>(() => {
        try {
            const saved = localStorage.getItem('admin_users_subtab');
            if (saved === 'users' || saved === 'leaderboard') return saved;
        } catch {}
        return 'users';
    });

    useEffect(() => {
        try {
            localStorage.setItem('admin_users_subtab', activeSubTab);
        } catch {}
    }, [activeSubTab]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

    const fetchLeaderboard = async () => {
        setLoadingLeaderboard(true);
        try {
            const res = await axios.get('/api/admin/leaderboard');
            setLeaderboard(res.data || []);
        } catch (err) {
            console.error('Failed to load leaderboard:', err);
        } finally {
            setLoadingLeaderboard(false);
        }
    };

    useEffect(() => {
        if (activeSubTab === 'leaderboard') {
            fetchLeaderboard();
        }
    }, [activeSubTab]);

    // Password visibility map
    const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

    // Modals
    const [suspendModal, setSuspendModal] = useState<UserItem | null>(null);
    const [suspendDuration, setSuspendDuration] = useState('week');
    const [suspendReason, setSuspendReason] = useState('');

    const [creditModal, setCreditModal] = useState<UserItem | null>(null);
    const [creditAmount, setCreditAmount] = useState('');

    const [flashcardsModal, setFlashcardsModal] = useState<UserItem | null>(null);
    const [visibleFlashcardsCount, setVisibleFlashcardsCount] = useState(6);

    const openFlashcards = (user: UserItem) => {
        setFlashcardsModal(user);
        setVisibleFlashcardsCount(6);
    };

    // Super Admin Create Admin Modal
    const [createAdminOpen, setCreateAdminOpen] = useState(false);
    const [newAdminUsername, setNewAdminUsername] = useState('');
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [newAdminPerms, setNewAdminPerms] = useState<AdminPermissions>({ ...DEFAULT_PERMISSIONS });
    const [creatingAdmin, setCreatingAdmin] = useState(false);

    // Super Admin Edit Permissions Modal
    const [editPermsUser, setEditPermsUser] = useState<UserItem | null>(null);
    const [editPermsState, setEditPermsState] = useState<AdminPermissions>({ ...DEFAULT_PERMISSIONS });
    const [savingPerms, setSavingPerms] = useState(false);

    // Super Admin Reset Password Modal
    const [resetPassUser, setResetPassUser] = useState<UserItem | null>(null);
    const [resetPassValue, setResetPassValue] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);

    // Super Admin Edit Email Modal
    const [editEmailUser, setEditEmailUser] = useState<UserItem | null>(null);
    const [editEmailValue, setEditEmailValue] = useState('');
    const [savingEmail, setSavingEmail] = useState(false);

    // Selected user for details modal
    const [selectedDetailUser, setSelectedDetailUser] = useState<UserItem | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const loadUsers = async () => {
        try {
            setLoading(true);
            setErrorMsg('');
            const res = await axios.get('/api/admin/users');
            setUsers(res.data);
        } catch (error) {
            console.error('Error loading users:', error);
            const msg = (error as any)?.response?.data?.error || 'ناتوانرێت داتای بەکارهێنەران بخوێندرێتەوە.';
            setErrorMsg(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleCreateAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAdminUsername.trim() || !newAdminPassword) {
            showToast('تکایە ناوی بەکارهێنەر و وشەی نهێنی بنووسە', 'error');
            return;
        }
        try {
            setCreatingAdmin(true);
            await axios.post('/api/admin/users/create-admin', {
                username: newAdminUsername.trim(),
                email: newAdminEmail.trim() || undefined,
                password: newAdminPassword,
                permissions: newAdminPerms
            });
            showToast(lang === 'en' ? 'New admin created successfully ✓' : 'ئەدمینی نوێ بە سەرکەوتوویی دروستکرا ✓');
            setCreateAdminOpen(false);
            setNewAdminUsername('');
            setNewAdminEmail('');
            setNewAdminPassword('');
            setNewAdminPerms({ ...DEFAULT_PERMISSIONS });
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || (lang === 'en' ? 'Failed to create admin' : 'دروستکردنی ئەدمین سەرکەوتوو نەبوو'), 'error');
        } finally {
            setCreatingAdmin(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetPassUser || !resetPassValue.trim()) return;
        try {
            setSavingPassword(true);
            await axios.put(`/api/admin/users/${resetPassUser.id}/password`, {
                newPassword: resetPassValue.trim()
            });
            showToast(lang === 'en' ? 'Password changed successfully ✓' : 'وشەی نهێنی بە سەرکەوتوویی گۆڕدرا ✓');
            setResetPassUser(null);
            setResetPassValue('');
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'سەرکەوتوو نەبوو', 'error');
        } finally {
            setSavingPassword(false);
        }
    };

    const handleUpdateEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editEmailUser) return;
        try {
            setSavingEmail(true);
            await axios.put(`/api/admin/users/${editEmailUser.id}/email`, {
                email: editEmailValue.trim()
            });
            showToast(lang === 'en' ? 'Email updated successfully ✓' : 'ئیمەیڵ بە سەرکەوتوویی نوێکرایەوە ✓');
            setEditEmailUser(null);
            setEditEmailValue('');
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'سەرکەوتوو نەبوو', 'error');
        } finally {
            setSavingEmail(false);
        }
    };

    const handleToggleRole = async (user: UserItem, targetRole: 'admin' | 'user') => {
        const confirmMsg = targetRole === 'admin' 
            ? (lang === 'en' ? `Are you sure you want to promote ${user.username} to Admin?` : `ئایا دڵنیایت لە بەرزکردنەوەی ${user.username} بۆ ئەدمین؟`)
            : (lang === 'en' ? `Are you sure you want to demote ${user.username} to regular User?` : `ئایا دڵنیایت لە داگرتنی ${user.username} بۆ بەکارهێنەری ئاسایی؟`);
        if (!confirm(confirmMsg)) return;

        try {
            await axios.put(`/api/admin/users/${user.id}/role`, {
                role: targetRole
            });
            showToast(lang === 'en' ? 'Role updated successfully ✓' : 'پلەی بەکارهێنەر گۆڕدرا ✓');
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'سەرکەوتوو نەبوو', 'error');
        }
    };

    const handleOpenEditPerms = (user: UserItem) => {
        setEditPermsUser(user);
        setEditPermsState(user.permissions || { ...DEFAULT_PERMISSIONS });
    };

    const handleSavePermissions = async () => {
        if (!editPermsUser) return;
        try {
            setSavingPerms(true);
            await axios.put(`/api/admin/users/${editPermsUser.id}/permissions`, {
                permissions: editPermsState
            });
            showToast(lang === 'en' ? 'Permissions updated successfully ✓' : 'دەسەڵاتەکان نوێکرانەوە ✓');
            setEditPermsUser(null);
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'سەرکەوتوو نەبوو', 'error');
        } finally {
            setSavingPerms(false);
        }
    };

    const handleRevokeAdmin = async (user: UserItem) => {
        if (!confirm(lang === 'en' ? `Revoke admin privileges and demote ${user.username}?` : `ئایا دڵنیایت لە هەڵوەشاندنەوەی دەسەڵاتی ئەدمینی ${user.username}؟`)) return;
        try {
            await axios.put(`/api/admin/users/${user.id}/role`, {
                role: 'user',
                permissions: {
                    canTranslate: false,
                    canAddMovies: false,
                    canManageCredits: false,
                    canManageComments: false,
                    canPublishDirectly: false
                }
            });
            showToast(lang === 'en' ? 'Admin privileges revoked ✓' : 'دەسەڵاتی ئەدمین هەڵوەشێندرایەوە ✓');
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'سەرکەوتوو نەبوو', 'error');
        }
    };

    const handleSuspend = async () => {
        if (!suspendModal) return;
        try {
            await axios.post(`/api/admin/users/${suspendModal.id}/suspend`, {
                duration: suspendDuration,
                reason: suspendReason.trim()
            });
            setSuspendModal(null);
            setSuspendReason('');
            showToast(lang === 'en' ? 'User suspended successfully ✓' : 'سزا بەسەر بەکارهێنەردا سەپێنرا ✓');
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'سەرکەوتوو نەبوو', 'error');
        }
    };

    const handleUnsuspend = async (userId: string) => {
        if (!confirm(lang === 'en' ? 'Are you sure you want to unsuspend this user?' : 'ئایا دڵنیایت لە لابردنی سزای ئەم بەکارهێنەرە؟')) return;
        try {
            await axios.post(`/api/admin/users/${userId}/unsuspend`);
            showToast(lang === 'en' ? 'User unsuspended ✓' : 'سزای بەکارهێنەر لادرا ✓');
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'سەرکەوتوو نەبوو', 'error');
        }
    };

    const handleAddCredits = async () => {
        if (!creditModal || !creditAmount) return;
        try {
            await axios.post(`/api/admin/users/${creditModal.id}/credits`, {
                amount: parseInt(creditAmount)
            });
            setCreditModal(null);
            setCreditAmount('');
            showToast(lang === 'en' ? 'Credits granted successfully ✓' : 'کرێدیت بە سەرکەوتوویی زیادکرا ✓');
            loadUsers();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'سەرکەوتوو نەبوو', 'error');
        }
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.username.toLowerCase().includes(searchTerm.toLowerCase()) || (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
        const isSuspended = u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now();
        const isAdmin = u.role === 'admin' || u.role === 'super_admin';

        if (!matchesSearch) return false;
        if (roleFilter === 'admins') return isAdmin;
        if (roleFilter === 'users') return !isAdmin;
        if (roleFilter === 'suspended') return isSuspended;
        return true;
    });

    if (loading) {
        return <div className="admin-loading"><Loader2 size={32} className="spinning" /></div>;
    }

    if (errorMsg) {
        return <div style={{ textAlign: 'center', padding: '40px', color: '#f87171' }}>{errorMsg}</div>;
    }

    return (
        <div className={`admin-users-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {toast && (
                <div className={`admin-toast-float ${toast.type}`}>
                    {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    <span>{toast.msg}</span>
                </div>
            )}

            {/* Sub-Tabs Navigation */}
            <div className="admin-users-subtabs-nav">
                <button 
                    className={`au-subtab-btn ${activeSubTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('users')}
                >
                    <UserIcon size={17} />
                    <span>{lang === 'en' ? 'Users & Admins Management' : 'بەڕێوەبردنی بەکارهێنەران و ئەدمینەکان'}</span>
                    <span className="au-tab-count">{users.length}</span>
                </button>
                {isSuperAdmin && (
                    <button 
                        className={`au-subtab-btn leaderboard ${activeSubTab === 'leaderboard' ? 'active' : ''}`}
                        onClick={() => setActiveSubTab('leaderboard')}
                    >
                        <Trophy size={17} />
                        <span>{lang === 'en' ? 'Admin Performance & Rewards' : 'خشتەی بەرهەمداری و پاداشتی ئەدمینەکان'}</span>
                        <span className="au-tab-count gold">🏆</span>
                    </button>
                )}
            </div>

            {activeSubTab === 'users' && (
                <>
                    <div className="admin-users-toolbar">
                        <div className="admin-search-input-wrap">
                            <Search size={18} className="admin-search-icon" />
                            <input 
                                type="text" 
                                placeholder={lang === 'en' ? "Search username, email, or admin..." : "گەڕان بۆ ناوی بەکارهێنەر، ئیمەیڵ یان ئەدمین..."} 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="admin-search-input"
                            />
                            {searchTerm && (
                                <button className="admin-search-clear" onClick={() => setSearchTerm('')}>
                                    <X size={15} />
                                </button>
                            )}
                        </div>

                        <div className="admin-users-filters">
                            <button className={`filter-tab-btn ${roleFilter === 'all' ? 'active' : ''}`} onClick={() => setRoleFilter('all')}>
                                {lang === 'en' ? 'All' : 'هەمووان'} ({users.length})
                            </button>
                            <button className={`filter-tab-btn ${roleFilter === 'admins' ? 'active' : ''}`} onClick={() => setRoleFilter('admins')}>
                                🛡️ {lang === 'en' ? 'Admins' : 'ئەدمینەکان'} ({users.filter(u => u.role === 'admin' || u.role === 'super_admin').length})
                            </button>
                            <button className={`filter-tab-btn ${roleFilter === 'users' ? 'active' : ''}`} onClick={() => setRoleFilter('users')}>
                                {lang === 'en' ? 'Users' : 'بەکارهێنەران'} ({users.filter(u => u.role === 'user').length})
                            </button>
                            <button className={`filter-tab-btn ${roleFilter === 'suspended' ? 'active' : ''}`} onClick={() => setRoleFilter('suspended')}>
                                {lang === 'en' ? 'Suspended' : 'ڕاگیراوەکان'} ({users.filter(u => u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now()).length})
                            </button>
                        </div>

                        {isSuperAdmin && (
                            <button className="btn-create-admin" onClick={() => setCreateAdminOpen(true)}>
                                <UserPlus size={17} /> {lang === 'en' ? 'Create New Admin' : 'زیادکردنی ئەدمینی نوێ'}
                            </button>
                        )}
                    </div>

                    <div className="users-compact-grid">
                        {filteredUsers.map(user => {
                            const isSuspended = user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now();
                            const isSuper = user.role === 'super_admin' || user.username === 'maher2';
                            const isAdmin = user.role === 'admin';

                            return (
                                <div 
                                    key={user.id} 
                                    className={`user-compact-card ${isSuspended ? 'suspended' : ''} ${isSuper ? 'super-admin-card' : isAdmin ? 'admin-card' : ''}`}
                                    onClick={() => setSelectedDetailUser(user)}
                                >
                                    <div className="compact-card-header">
                                        {isSuper ? (
                                            <span className="role-badge super_admin">👑 {lang === 'en' ? 'Super Admin' : 'سەرپەرشتیار'}</span>
                                        ) : isAdmin ? (
                                            <span className="role-badge admin">🛡️ {lang === 'en' ? 'Admin' : 'ئەدمین'}</span>
                                        ) : (
                                            <span className="role-badge user">{lang === 'en' ? 'User' : 'بەکارهێنەر'}</span>
                                        )}
                                        {isSuspended && <span className="compact-suspended-badge">🚫 {lang === 'en' ? 'Suspended' : 'ڕاگیراو'}</span>}
                                    </div>

                                    <div className="compact-avatar-wrap">
                                        <div className={`compact-avatar ${isSuper ? 'super' : isAdmin ? 'admin' : 'user'}`}>
                                            {user.username.charAt(0).toUpperCase()}
                                        </div>
                                    </div>

                                    <div className="compact-user-info">
                                        <h3 className="compact-username" title={user.username}>{user.username}</h3>
                                        <p className="compact-user-email">{user.email || (lang === 'en' ? 'No email' : 'ئیمەیڵ دیارینەکراوە')}</p>
                                    </div>

                                    <div className="compact-quick-stats">
                                        <span className="compact-stat-pill">
                                            <CreditCard size={12} color="#0284c7" /> {user.credits || 0}
                                        </span>
                                        {user.level && (
                                            <span className="compact-stat-pill level">
                                                {user.level}
                                            </span>
                                        )}
                                    </div>

                                    <button className="btn-compact-details">
                                        <Eye size={13} /> {lang === 'en' ? 'Manage & Details' : 'بینین و دەستکاری'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {activeSubTab === 'leaderboard' && (
                <div className="admin-users-leaderboard-section">
                    <div className="users-lb-header">
                        <div className="users-lb-header-info">
                            <h3>
                                <Trophy size={20} color="#f59e0b" />
                                {lang === 'en' ? 'Admin Productivity & Rewards Leaderboard' : 'خشتەی بەرهەمداری و پاداشتی ئەدمینەکان'}
                            </h3>
                            <p>
                                {lang === 'en'
                                    ? 'Automated scoring based on subtitle translations, word additions, approved contents, and reviews.'
                                    : 'هەژمارکردنی خۆکاری خاڵ و ئاستی ماندووبوونی ئەدمینەکان لە وەرگێڕانی سەبتایتڵ و بەڕێوەبردنی سیستم.'}
                            </p>
                        </div>

                        <button className="btn-refresh-lb" onClick={fetchLeaderboard} disabled={loadingLeaderboard}>
                            <RefreshCw size={14} className={loadingLeaderboard ? 'spinning' : ''} />
                            <span>{lang === 'en' ? 'Refresh' : 'نوێکردنەوە'}</span>
                        </button>
                    </div>

                    {loadingLeaderboard ? (
                        <div className="feed-loading-box" style={{ padding: '40px', textAlign: 'center' }}>
                            <Loader2 size={36} className="spinning" />
                            <p style={{ marginTop: '12px', color: '#94a3b8' }}>{lang === 'en' ? 'Preparing staff leaderboard...' : 'ئامادەکردنی خشتەی بەرهەمداری...'}</p>
                        </div>
                    ) : leaderboard.length === 0 ? (
                        <div className="feed-empty-box" style={{ padding: '40px', textAlign: 'center' }}>
                            <Trophy size={44} color="#64748b" />
                            <h3 style={{ marginTop: '12px' }}>{lang === 'en' ? 'No staff records found' : 'هیچ داتایەکی ئەدمینەکان نییە'}</h3>
                        </div>
                    ) : (
                        <div className="leaderboard-cards-grid">
                            {leaderboard.map((item) => (
                                <div key={item.id} className={`leaderboard-card rank-${item.rank}`}>
                                    <div className="leaderboard-rank-badge">
                                        {item.rank === 1 ? '🥇 ١' : item.rank === 2 ? '🥈 ٢' : item.rank === 3 ? '🥉 ٣' : `#${item.rank}`}
                                    </div>
                                    <div className="leaderboard-card-header">
                                        <div className="leaderboard-avatar">
                                            {item.avatar ? (
                                                <img src={item.avatar} alt={item.username} />
                                            ) : (
                                                <UserIcon size={28} />
                                            )}
                                        </div>
                                        <div className="leaderboard-user-meta">
                                            <h3>{item.username}</h3>
                                            <span className="leaderboard-role-badge">
                                                {item.role === 'super_admin' ? 'سەرپەرشتیاری گشتی' : 'ئەدمین'}
                                            </span>
                                        </div>
                                        <div className="leaderboard-score-pill">
                                            <Flame size={16} color="#f59e0b" />
                                            <span>{item.totalScore} خاڵ</span>
                                        </div>
                                    </div>

                                    <div className="leaderboard-stats-grid">
                                        <div className="lb-stat-box">
                                            <span className="lb-stat-num">{item.linesTranslated}</span>
                                            <span className="lb-stat-lbl">{lang === 'en' ? 'Lines Translated' : 'دێڕی وەرگێڕدراو'}</span>
                                        </div>
                                        <div className="lb-stat-box">
                                            <span className="lb-stat-num">{item.moviesApproved}</span>
                                            <span className="lb-stat-lbl">{lang === 'en' ? 'Approved' : 'پەسەندکراو'}</span>
                                        </div>
                                        <div className="lb-stat-box">
                                            <span className="lb-stat-num">{item.moviesAdded}</span>
                                            <span className="lb-stat-lbl">{lang === 'en' ? 'New Movies' : 'بەرهەمی نوێ'}</span>
                                        </div>
                                        <div className="lb-stat-box">
                                            <span className="lb-stat-num">{item.receiptsReviewed}</span>
                                            <span className="lb-stat-lbl">{lang === 'en' ? 'Receipts' : 'وەسڵی کرێدیت'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* USER FULL DETAILS & MANAGEMENT MODAL */}
            {selectedDetailUser && (() => {
                const user = users.find(u => u.id === selectedDetailUser.id) || selectedDetailUser;
                const isSuspended = user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now();
                const weeklyStats = getStats(user.dailyStats, 'week');
                const monthlyStats = getStats(user.dailyStats, 'month');
                const isSuper = user.role === 'super_admin' || user.username === 'maher2';
                const isAdmin = user.role === 'admin';

                return (
                    <div className="form-overlay" onClick={() => setSelectedDetailUser(null)}>
                        <div className="form-modal user-details-modal" onClick={e => e.stopPropagation()}>
                            <div className="form-header">
                                <div className="modal-head-title">
                                    <div className={`modal-user-avatar ${isSuper ? 'super' : isAdmin ? 'admin' : 'user'}`}>
                                        {user.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h2>{user.username}</h2>
                                            {isSuper ? (
                                                <span className="role-badge super_admin">👑 {lang === 'en' ? 'Super Admin' : 'سەرپەرشتیاری گشتی'}</span>
                                            ) : isAdmin ? (
                                                <span className="role-badge admin">🛡️ {lang === 'en' ? 'Admin' : 'ئەدمین'}</span>
                                            ) : (
                                                <span className="role-badge user">{lang === 'en' ? 'User' : 'بەکارهێنەر'}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedDetailUser(null)} className="close-btn"><X size={20} /></button>
                            </div>

                            <div className="form-body user-details-body">
                                {/* Credentials Info Box */}
                                <div className="user-credentials-box">
                                    <div className="cred-row">
                                        <span className="cred-label"><UserIcon size={13} /> {lang === 'en' ? 'Username:' : 'یوسەر نێم:'}</span>
                                        <span className="cred-val bold">{user.username}</span>
                                    </div>
                                    <div className="cred-row">
                                        <span className="cred-label"><Mail size={13} /> {lang === 'en' ? 'Email:' : 'ئیمەیڵ:'}</span>
                                        <span className="cred-val">{user.email ? user.email : <span style={{ color: '#64748b', fontStyle: 'italic' }}>{lang === 'en' ? 'Not set' : 'دیارینەکراوە'}</span>}</span>
                                        {isSuperAdmin && (
                                            <button 
                                                className="cred-edit-icon-btn" 
                                                title={lang === 'en' ? 'Edit Email' : 'دەستکاریکردنی ئیمەیڵ'} 
                                                onClick={() => { setEditEmailUser(user); setEditEmailValue(user.email || ''); }}
                                            >
                                                <Edit3 size={12} />
                                            </button>
                                        )}
                                    </div>
                                    {isSuperAdmin && (
                                        <div className="cred-row password-row">
                                            <span className="cred-label"><KeyRound size={13} /> {lang === 'en' ? 'Password:' : 'وشەی نهێنی:'}</span>
                                            <span className="cred-val password-text">
                                                {showPasswordMap[user.id] 
                                                    ? (user.plainPassword || (lang === 'en' ? 'Hashed Password' : 'وشەی نهێنی کۆدکراوە')) 
                                                    : (user.plainPassword ? '••••••••' : (lang === 'en' ? 'Hashed' : 'کۆدکراو (Hash)'))
                                                }
                                            </span>
                                            <div className="cred-actions">
                                                {user.plainPassword && (
                                                    <button 
                                                        className="cred-toggle-btn" 
                                                        title={showPasswordMap[user.id] ? (lang === 'en' ? "Hide Password" : "شاردنەوە") : (lang === 'en' ? "Show Password" : "پیشاندان")}
                                                        onClick={() => setShowPasswordMap(prev => ({ ...prev, [user.id]: !prev[user.id] }))}
                                                    >
                                                        {showPasswordMap[user.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                )}
                                                <button 
                                                    className="cred-reset-btn" 
                                                    title={lang === 'en' ? 'Change Password' : 'گۆڕینی وشەی نهێنی'}
                                                    onClick={() => { setResetPassUser(user); setResetPassValue(''); }}
                                                >
                                                    <KeyRound size={12} /> {lang === 'en' ? 'Change' : 'گۆڕین'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Permissions (Admins) */}
                                {isAdmin && (
                                    <div className="user-perms-badges">
                                        <span className="perms-title">{lang === 'en' ? 'Active Permissions:' : 'دەسەڵاتە چالاکەکان:'}</span>
                                        <div className="perms-pill-list">
                                            <span className={`perm-tag ${user.permissions?.canTranslate ? 'active' : 'disabled'}`}>
                                                <Languages size={12} /> {lang === 'en' ? 'Translation' : 'وەرگێڕان'}
                                            </span>
                                            <span className={`perm-tag ${user.permissions?.canAddMovies ? 'active' : 'disabled'}`}>
                                                <Film size={12} /> {lang === 'en' ? 'Movies & Series' : 'فیلم و زنجیرە'}
                                            </span>
                                            <span className={`perm-tag ${user.permissions?.canManageCredits ? 'active' : 'disabled'}`}>
                                                <CreditCard size={12} /> {lang === 'en' ? 'Credits & Receipts' : 'وەسڵ و کرێدیت'}
                                            </span>
                                            <span className={`perm-tag ${user.permissions?.canManageComments ? 'active' : 'disabled'}`}>
                                                <MessageSquare size={12} /> {lang === 'en' ? 'Comments' : 'کۆمێنتەکان'}
                                            </span>
                                            <span className={`perm-tag ${user.permissions?.canPublishDirectly ? 'active' : 'disabled'}`}>
                                                <Sparkles size={12} /> {lang === 'en' ? 'Direct Publish' : 'بڵاوکردنەوەی ڕاستەوخۆ'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Stats Grid */}
                                <div className="user-stats-modal-grid">
                                    <div className="stat-modal-card">
                                        <span className="stat-modal-label">{lang === 'en' ? 'CEFR Level' : 'ئاستی زمان'}</span>
                                        <strong className="stat-modal-val level" style={{ color: user.level ? '#8b5cf6' : '#64748b' }}>{user.level || '—'}</strong>
                                    </div>
                                    <div className="stat-modal-card">
                                        <span className="stat-modal-label">{lang === 'en' ? 'Points (XP)' : 'خاڵ (XP)'}</span>
                                        <strong className="stat-modal-val xp" style={{ color: '#f59e0b' }}>{(user.points || 0) * 10}</strong>
                                    </div>
                                    <div className="stat-modal-card">
                                        <span className="stat-modal-label">{lang === 'en' ? 'Credits' : 'کرێدیت'}</span>
                                        <strong className="stat-modal-val credits" style={{ color: '#0284c7' }}>{user.credits || 0}</strong>
                                    </div>
                                    <div className="stat-modal-card">
                                        <span className="stat-modal-label">{lang === 'en' ? 'Flashcards' : 'فلاش کارت'}</span>
                                        <strong className="stat-modal-val cards" style={{ color: '#10b981' }}>{user.flashcardsCount}</strong>
                                    </div>
                                </div>

                                {/* Watch Stats */}
                                <div className="user-watch-stats">
                                    <div className="u-watch-stat">
                                        <span className="u-ws-label">{lang === 'en' ? 'Watched this week:' : 'سەیرکردنی ئەم هەفتەیە:'}</span>
                                        <span className="u-ws-val"><Clock size={13}/> {weeklyStats.watchMinutes} {lang === 'en' ? 'mins' : 'خولەک'}</span>
                                        <span className="u-ws-val"><MessageSquare size={13}/> {weeklyStats.sentencesSeen} {lang === 'en' ? 'sentences' : 'ڕستە'}</span>
                                    </div>
                                    <div className="u-watch-stat">
                                        <span className="u-ws-label">{lang === 'en' ? 'Watched this month:' : 'سەیرکردنی ئەم مانگە:'}</span>
                                        <span className="u-ws-val"><Clock size={13}/> {monthlyStats.watchMinutes} {lang === 'en' ? 'mins' : 'خولەک'}</span>
                                        <span className="u-ws-val"><MessageSquare size={13}/> {monthlyStats.sentencesSeen} {lang === 'en' ? 'sentences' : 'ڕستە'}</span>
                                    </div>
                                </div>

                                {user.flashcardsCount > 0 && (
                                    <button 
                                        className="btn-action btn-fc-view" 
                                        style={{ width: '100%' }}
                                        onClick={() => openFlashcards(user)}
                                    >
                                        {lang === 'en' ? `View Flashcards (${user.flashcardsCount})` : `بینینی فلاش کارتەکان (${user.flashcardsCount})`}
                                    </button>
                                )}

                                {isSuspended && (
                                    <div className="suspension-info">
                                        <ShieldBan size={16} />
                                        <span>{lang === 'en' ? 'Suspended until:' : 'ڕاگیراوە تا:'} {new Date(user.suspendedUntil!).toLocaleDateString(lang === 'en' ? 'en-US' : 'ku-IQ')}</span>
                                    </div>
                                )}

                                {/* Super Admin Control Actions */}
                                {isSuperAdmin && !isSuper && (
                                    <div className="super-admin-user-controls">
                                        {isAdmin ? (
                                            <>
                                                <button className="btn-sub-action edit-perms-btn" onClick={() => handleOpenEditPerms(user)}>
                                                    <Edit3 size={14} /> {lang === 'en' ? 'Permissions' : 'دەسەڵاتەکان'}
                                                </button>
                                                <button className="btn-sub-action demote-btn" onClick={() => handleToggleRole(user, 'user')}>
                                                    <UserX size={14} /> {lang === 'en' ? 'Demote to User' : 'داگرتن بۆ بەکارهێنەر'}
                                                </button>
                                                <button className="btn-sub-action revoke-btn" onClick={() => handleRevokeAdmin(user)} title={lang === 'en' ? 'Revoke Admin' : 'دەرکردنی دەستبەجێ'}>
                                                    <ShieldBan size={14} /> {lang === 'en' ? 'Revoke' : 'هەڵوەشاندنەوە'}
                                                </button>
                                            </>
                                        ) : (
                                            <button className="btn-sub-action promote-btn" onClick={() => handleToggleRole(user, 'admin')}>
                                                <ShieldCheck size={14} /> {lang === 'en' ? 'Promote to Admin' : 'بەرزکردنەوە بۆ ئەدمین'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="form-footer user-details-footer">
                                {isSuperAdmin && (
                                    <button className="btn-action credit-btn" onClick={() => setCreditModal(user)}>
                                        <CreditCard size={15} /> {lang === 'en' ? 'Grant Credits' : 'پێدانی کرێدیت'}
                                    </button>
                                )}
                                
                                {!isSuper && (
                                    isSuspended ? (
                                        <button className="btn-action unsuspend-btn" onClick={() => handleUnsuspend(user.id)}>
                                            <ShieldCheck size={15} /> {lang === 'en' ? 'Unsuspend' : 'لابردنی سزا'}
                                        </button>
                                    ) : (
                                        <button className="btn-action suspend-btn" onClick={() => setSuspendModal(user)}>
                                            <ShieldBan size={15} /> {lang === 'en' ? 'Suspend' : 'ڕاگرتن'}
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* CREATE ADMIN MODAL */}
            {createAdminOpen && (
                <div className="form-overlay" onClick={() => setCreateAdminOpen(false)}>
                    <div className="form-modal create-admin-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <div className="modal-head-title">
                                <UserPlus size={20} className="modal-head-icon" />
                                <h2>{lang === 'en' ? 'Create New Admin' : 'زیادکردنی ئەدمینی نوێ'}</h2>
                            </div>
                            <button onClick={() => setCreateAdminOpen(false)} className="close-btn"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreateAdmin}>
                            <div className="form-body">
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Username *' : 'ناوی بەکارهێنەر (Username)'}</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        value={newAdminUsername} 
                                        onChange={e => setNewAdminUsername(e.target.value)}
                                        placeholder={lang === 'en' ? "Enter admin username..." : "ناوی ئەدمین بنووسە..."}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Email (Optional)' : 'ئیمەیڵ (Email - ئیختیاری)'}</label>
                                    <input 
                                        type="email" 
                                        className="form-input" 
                                        value={newAdminEmail} 
                                        onChange={e => setNewAdminEmail(e.target.value)}
                                        placeholder="example@gmail.com"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Password *' : 'وشەی نهێنی (Password)'}</label>
                                    <input 
                                        type="password" 
                                        className="form-input" 
                                        value={newAdminPassword} 
                                        onChange={e => setNewAdminPassword(e.target.value)}
                                        placeholder={lang === 'en' ? "At least 6 characters..." : "لانیکەم ٦ پیت یان ژمارە..."}
                                        required
                                    />
                                </div>

                                <div className="perms-config-section">
                                    <h4 className="perms-config-title">{lang === 'en' ? 'Configure Permissions:' : 'دیاریکردنی دەسەڵاتەکان:'}</h4>
                                    
                                    <label className="perm-toggle-row">
                                        <div className="perm-toggle-info">
                                            <strong>{lang === 'en' ? '📝 Translation & Subtitles' : '📝 وەرگێڕان و سەبتایتڵ'}</strong>
                                            <p>{lang === 'en' ? 'Edit subtitles, dictionaries, and vocabulary stats' : 'دەستکاریکردنی سەبتایتڵ، فەرهەنگ و ئامارەکانی زمان'}</p>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            className="perm-switch"
                                            checked={Boolean(newAdminPerms.canTranslate)} 
                                            onChange={e => setNewAdminPerms(p => ({ ...p, canTranslate: e.target.checked }))}
                                        />
                                    </label>

                                    <label className="perm-toggle-row">
                                        <div className="perm-toggle-info">
                                            <strong>{lang === 'en' ? '🎬 Add Movies & Series' : '🎬 زیادکردنی فیلم و زنجیرە'}</strong>
                                            <p>{lang === 'en' ? 'Upload video files, posters, and episode data' : 'ئەپلۆدکردنی ڤیدیۆ و پۆستەری فیلم و ئەڵقەکان'}</p>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            className="perm-switch"
                                            checked={Boolean(newAdminPerms.canAddMovies)} 
                                            onChange={e => setNewAdminPerms(p => ({ ...p, canAddMovies: e.target.checked }))}
                                        />
                                    </label>

                                    <label className="perm-toggle-row">
                                        <div className="perm-toggle-info">
                                            <strong>{lang === 'en' ? '💳 Credits & Receipts' : '💳 پشکنینی وەسڵ و کرێدیت'}</strong>
                                            <p>{lang === 'en' ? 'Inspect purchase receipts and grant user credits' : 'بینینی وەسڵی کڕین و زیادکردنی کرێدیت بۆ بەکارهێنەران'}</p>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            className="perm-switch"
                                            checked={Boolean(newAdminPerms.canManageCredits)} 
                                            onChange={e => setNewAdminPerms(p => ({ ...p, canManageCredits: e.target.checked }))}
                                        />
                                    </label>

                                    <label className="perm-toggle-row">
                                        <div className="perm-toggle-info">
                                            <strong>{lang === 'en' ? '💬 Comments Moderation' : '💬 بەڕێوەبردنی کۆمێنتەکان'}</strong>
                                            <p>{lang === 'en' ? 'Delete and moderate user comments' : 'سڕینەوە و چاودێریکردنی کۆمێنتی بەکارهێنەران'}</p>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            className="perm-switch"
                                            checked={Boolean(newAdminPerms.canManageComments)} 
                                            onChange={e => setNewAdminPerms(p => ({ ...p, canManageComments: e.target.checked }))}
                                        />
                                    </label>

                                    <label className="perm-toggle-row">
                                        <div className="perm-toggle-info">
                                            <strong>{lang === 'en' ? '⚡ Direct Publish' : '⚡ پەسەندکردنی ڕاستەوخۆ'}</strong>
                                            <p>{lang === 'en' ? 'Publish directly without Super Admin approval' : 'بڵاوکردنەوەی کارەکان ڕاستەوخۆ بەبێ پێویستی بە پەسەندکردنی سەرۆک'}</p>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            className="perm-switch"
                                            checked={Boolean(newAdminPerms.canPublishDirectly)} 
                                            onChange={e => setNewAdminPerms(p => ({ ...p, canPublishDirectly: e.target.checked }))}
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="form-footer">
                                <button type="button" onClick={() => setCreateAdminOpen(false)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەزبوونەوە'}</button>
                                <button type="submit" disabled={creatingAdmin} className="btn-save btn-primary-gradient">
                                    {creatingAdmin ? <Loader2 size={16} className="spinning" /> : <UserPlus size={16} />}
                                    {lang === 'en' ? 'Create Admin' : 'دروستکردنی ئەدمین'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* RESET PASSWORD MODAL */}
            {resetPassUser && (
                <div className="form-overlay" onClick={() => setResetPassUser(null)}>
                    <div className="form-modal create-admin-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <div className="modal-head-title">
                                <KeyRound size={20} className="modal-head-icon" />
                                <h2>{lang === 'en' ? `Change Password: ${resetPassUser.username}` : `گۆڕینی وشەی نهێنی: ${resetPassUser.username}`}</h2>
                            </div>
                            <button onClick={() => setResetPassUser(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleResetPassword}>
                            <div className="form-body">
                                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 14px' }}>
                                    {lang === 'en' 
                                        ? 'As Super Admin, you can directly set a new password for this account:' 
                                        : 'تۆ وەک سەرپەرشتیاری گشتی دەتوانیت راستەوخۆ وشەی نهێنی نوێ بۆ ئەم هەژمارە دابنێیت:'}
                                </p>
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'New Password' : 'وشەی نهێنی نوێ (New Password)'}</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        value={resetPassValue} 
                                        onChange={e => setResetPassValue(e.target.value)}
                                        placeholder={lang === 'en' ? "At least 6 characters..." : "لانیکەم ٦ پیت یان ژمارە..."}
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="form-footer">
                                <button type="button" onClick={() => setResetPassUser(null)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەزبوونەوە'}</button>
                                <button type="submit" disabled={savingPassword} className="btn-save btn-primary-gradient">
                                    {savingPassword ? <Loader2 size={16} className="spinning" /> : <Check size={16} />}
                                    {lang === 'en' ? 'Save Password' : 'پاشەکەوتکردنی وشەی نهێنی'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT EMAIL MODAL */}
            {editEmailUser && (
                <div className="form-overlay" onClick={() => setEditEmailUser(null)}>
                    <div className="form-modal create-admin-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <div className="modal-head-title">
                                <Mail size={20} className="modal-head-icon" />
                                <h2>{lang === 'en' ? `Edit Email: ${editEmailUser.username}` : `دەستکاریکردنی ئیمەیڵ: ${editEmailUser.username}`}</h2>
                            </div>
                            <button onClick={() => setEditEmailUser(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleUpdateEmail}>
                            <div className="form-body">
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Email Address' : 'ئیمەیڵی بەکارهێنەر (Email Address)'}</label>
                                    <input 
                                        type="email" 
                                        className="form-input" 
                                        value={editEmailValue} 
                                        onChange={e => setEditEmailValue(e.target.value)}
                                        placeholder="example@domain.com"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="form-footer">
                                <button type="button" onClick={() => setEditEmailUser(null)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەزبوونەوە'}</button>
                                <button type="submit" disabled={savingEmail} className="btn-save btn-primary-gradient">
                                    {savingEmail ? <Loader2 size={16} className="spinning" /> : <Check size={16} />}
                                    {lang === 'en' ? 'Save Email' : 'پاشەکەوتکردنی ئیمەیڵ'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT PERMISSIONS MODAL */}
            {editPermsUser && (
                <div className="form-overlay" onClick={() => setEditPermsUser(null)}>
                    <div className="form-modal create-admin-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <div className="modal-head-title">
                                <Shield size={20} className="modal-head-icon" />
                                <h2>{lang === 'en' ? `Edit Permissions: ${editPermsUser.username}` : `دەستکاریکردنی دەسەڵاتەکانی: ${editPermsUser.username}`}</h2>
                            </div>
                            <button onClick={() => setEditPermsUser(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <div className="perms-config-section" style={{ marginTop: 0 }}>
                                <label className="perm-toggle-row">
                                    <div className="perm-toggle-info">
                                        <strong>{lang === 'en' ? '📝 Translation & Subtitles' : '📝 وەرگێڕان و سەبتایتڵ'}</strong>
                                        <p>{lang === 'en' ? 'Edit subtitles, dictionaries, and vocabulary stats' : 'دەستکاریکردنی سەبتایتڵ، فەرهەنگ و ئامارەکانی زمان'}</p>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="perm-switch"
                                        checked={Boolean(editPermsState.canTranslate)} 
                                        onChange={e => setEditPermsState(p => ({ ...p, canTranslate: e.target.checked }))}
                                    />
                                </label>

                                <label className="perm-toggle-row">
                                    <div className="perm-toggle-info">
                                        <strong>{lang === 'en' ? '🎬 Add Movies & Series' : '🎬 زیادکردنی فیلم و زنجیرە'}</strong>
                                        <p>{lang === 'en' ? 'Upload video files, posters, and episode data' : 'ئەپلۆدکردنی ڤیدیۆ و پۆستەری فیلم و ئەڵقەکان'}</p>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="perm-switch"
                                        checked={Boolean(editPermsState.canAddMovies)} 
                                        onChange={e => setNewAdminPerms(p => ({ ...p, canAddMovies: e.target.checked }))}
                                    />
                                </label>

                                <label className="perm-toggle-row">
                                    <div className="perm-toggle-info">
                                        <strong>{lang === 'en' ? '💳 Credits & Receipts' : '💳 پشکنینی وەسڵ و کرێدیت'}</strong>
                                        <p>{lang === 'en' ? 'Inspect purchase receipts and grant user credits' : 'بینینی وەسڵی کڕین و زیادکردنی کرێدیت بۆ بەکارهێنەران'}</p>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="perm-switch"
                                        checked={Boolean(editPermsState.canManageCredits)} 
                                        onChange={e => setEditPermsState(p => ({ ...p, canManageCredits: e.target.checked }))}
                                    />
                                </label>

                                <label className="perm-toggle-row">
                                    <div className="perm-toggle-info">
                                        <strong>{lang === 'en' ? '💬 Comments Moderation' : '💬 بەڕێوەبردنی کۆمێنتەکان'}</strong>
                                        <p>{lang === 'en' ? 'Delete and moderate user comments' : 'سڕینەوە و چاودێریکردنی کۆمێنتی بەکارهێنەران'}</p>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="perm-switch"
                                        checked={Boolean(editPermsState.canManageComments)} 
                                        onChange={e => setEditPermsState(p => ({ ...p, canManageComments: e.target.checked }))}
                                    />
                                </label>

                                <label className="perm-toggle-row">
                                    <div className="perm-toggle-info">
                                        <strong>{lang === 'en' ? '⚡ Direct Publish' : '⚡ پەسەندکردنی ڕاستەوخۆ'}</strong>
                                        <p>{lang === 'en' ? 'Publish directly without Super Admin approval' : 'بڵاوکردنەوەی کارەکان ڕاستەوخۆ بەبێ پێویستی بە پەسەندکردنی سەرۆک'}</p>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="perm-switch"
                                        checked={Boolean(editPermsState.canPublishDirectly)} 
                                        onChange={e => setEditPermsState(p => ({ ...p, canPublishDirectly: e.target.checked }))}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setEditPermsUser(null)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەزبوونەوە'}</button>
                            <button onClick={handleSavePermissions} disabled={savingPerms} className="btn-save btn-primary-gradient">
                                {savingPerms ? <Loader2 size={16} className="spinning" /> : <Check size={16} />}
                                {lang === 'en' ? 'Save Permissions' : 'پاشەکەوتکردنی دەسەڵاتەکان'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SUSPEND MODAL */}
            {suspendModal && (
                <div className="form-overlay" onClick={() => setSuspendModal(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>{lang === 'en' ? `Suspend Account: ${suspendModal.username}` : `ڕاگرتنی ئەکاونت: ${suspendModal.username}`}</h2>
                            <button onClick={() => setSuspendModal(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Suspension Duration' : 'ماوەی ڕاگرتن'}</label>
                                <select className="form-input" value={suspendDuration} onChange={e => setSuspendDuration(e.target.value)}>
                                    <option value="week">{lang === 'en' ? '1 Week' : 'هەفتەیەک'}</option>
                                    <option value="month">{lang === 'en' ? '1 Month' : 'مانگێک'}</option>
                                    <option value="year">{lang === 'en' ? '1 Year' : 'ساڵێک'}</option>
                                    <option value="permanent">{lang === 'en' ? 'Permanent' : 'هەمیشەیی'}</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Suspension Reason (Visible to user)' : 'هۆکاری ڕاگرتن (دەچێت بۆ بەکارهێنەر)'}</label>
                                <textarea 
                                    className="form-input form-textarea" 
                                    value={suspendReason} 
                                    onChange={e => setSuspendReason(e.target.value)}
                                    placeholder={lang === 'en' ? "Write reason..." : "هۆکار بنووسە..."}
                                />
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setSuspendModal(null)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەز'}</button>
                            <button onClick={handleSuspend} className="btn-save" style={{ background: '#ef4444' }}>{lang === 'en' ? 'Suspend' : 'سزادان'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* CREDIT MODAL */}
            {creditModal && (
                <div className="form-overlay" onClick={() => setCreditModal(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>{lang === 'en' ? `Grant Credits: ${creditModal.username}` : `پێدانی کرێدیت: ${creditModal.username}`}</h2>
                            <button onClick={() => setCreditModal(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Credit Amount' : 'بڕی کرێدیت'}</label>
                                <input 
                                    type="number" 
                                    className="form-input" 
                                    value={creditAmount} 
                                    onChange={e => setCreditAmount(e.target.value)}
                                    placeholder={lang === 'en' ? "e.g. 100" : "نموونە: 100"}
                                />
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setCreditModal(null)} className="btn-cancel">{lang === 'en' ? 'Cancel' : 'پاشگەز'}</button>
                            <button onClick={handleAddCredits} className="btn-save">{lang === 'en' ? 'Add Credits' : 'زیادکردن'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* FLASHCARDS MODAL */}
            {flashcardsModal && (() => {
                const totalCards = flashcardsModal.flashcards ? flashcardsModal.flashcards.length : 0;
                const displayedCards = flashcardsModal.flashcards ? flashcardsModal.flashcards.slice(0, visibleFlashcardsCount) : [];
                const hasMore = visibleFlashcardsCount < totalCards;

                return (
                    <div className="form-overlay" onClick={() => setFlashcardsModal(null)}>
                        <div className="form-modal admin-fc-modal" onClick={e => e.stopPropagation()}>
                            <div className="form-header fc-modal-header">
                                <div className="modal-head-title">
                                    <div className="fc-modal-icon-wrap">
                                        <Layers size={20} color="#8b5cf6" />
                                    </div>
                                    <div>
                                        <h2>{lang === 'en' ? `Flashcards: ${flashcardsModal.username}` : `فلاش کارتەکانی: ${flashcardsModal.username}`}</h2>
                                        <span className="fc-modal-count-badge">
                                            {totalCards > 0 
                                                ? (lang === 'en' ? `Showing ${displayedCards.length} of ${totalCards} cards` : `پیشاندانی ${displayedCards.length} لە ${totalCards} کارت`)
                                                : (lang === 'en' ? '0 cards' : '٠ کارت')
                                            }
                                        </span>
                                    </div>
                                </div>
                                <button onClick={() => setFlashcardsModal(null)} className="close-btn"><X size={20} /></button>
                            </div>

                            <div className="form-body fc-modal-body">
                                {displayedCards.length > 0 ? (
                                    <div className="admin-flashcards-list">
                                        {displayedCards.map((card, idx) => (
                                            <div key={card.id || idx} className="admin-flashcard-item">
                                                <div className="admin-fc-index-badge">
                                                    #{idx + 1}
                                                </div>
                                                <div className="admin-fc-content">
                                                    <div className="admin-fc-row front">
                                                        <span className="fc-lang-badge en">EN</span>
                                                        <span className="fc-text en-text" dir="ltr">{card.front}</span>
                                                    </div>
                                                    <div className="admin-fc-row back">
                                                        <span className="fc-lang-badge ku">KU</span>
                                                        <span className="fc-text ku-text" dir="rtl">{card.back}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Load More (+6) Button */}
                                        {hasMore && (
                                            <div className="fc-load-more-wrap">
                                                <button 
                                                    className="btn-fc-load-more"
                                                    onClick={() => setVisibleFlashcardsCount(prev => prev + 6)}
                                                >
                                                    <ChevronDown size={16} />
                                                    <span>{lang === 'en' ? `Load More (+6 Cards)` : `پیشاندانی زیاتر (+٦ فلاش کارت)`}</span>
                                                </button>
                                                <span className="fc-remaining-count">
                                                    {lang === 'en' ? `(${totalCards - displayedCards.length} cards remaining)` : `(${totalCards - displayedCards.length} فلاش کارتی تر ماوە)`}
                                                </span>
                                            </div>
                                        )}

                                        {!hasMore && totalCards > 6 && (
                                            <div className="fc-all-loaded-msg">
                                                <Check size={15} color="#10b981" />
                                                <span>{lang === 'en' ? 'All flashcards loaded ✓' : 'تەواوی فلاش کارتەکان پیشان دران ✓'}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="fc-empty-state">
                                        <Layers size={36} color="#64748b" />
                                        <p>{lang === 'en' ? 'This user has no flashcards.' : 'ئەم بەکارهێنەرە هیچ فلاش کارتێکی نییە.'}</p>
                                    </div>
                                )}
                            </div>

                            <div className="form-footer fc-modal-footer">
                                <button onClick={() => setFlashcardsModal(null)} className="btn-cancel" style={{ width: '100%' }}>
                                    {lang === 'en' ? 'Close' : 'داخستن'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
