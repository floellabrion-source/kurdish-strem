import { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, ShieldBan, ShieldCheck, CreditCard, Search, X, Clock, MessageSquare } from 'lucide-react';
import './AdminUsers.css';

interface User {
    id: string;
    username: string;
    role: string;
    credits: number;
    flashcardsCount: number;
    flashcards?: { id: string, front: string, back: string }[];
    suspendedUntil: string | null;
    suspensionReason: string | null;
    dailyStats?: Record<string, { watchMinutes: number; sentencesSeen: number }>;
}

// Helper to calculate stats
const getStats = (dailyStats: Record<string, { watchMinutes: number; sentencesSeen: number }> | undefined, period: 'day' | 'week' | 'month') => {
    if (!dailyStats) return { watchMinutes: 0, sentencesSeen: 0 };
    
    // We use the same UTC date string format as the backend to match exact days
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
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    
    const [suspendModal, setSuspendModal] = useState<User | null>(null);
    const [suspendDuration, setSuspendDuration] = useState('week');
    const [suspendReason, setSuspendReason] = useState('');

    const [creditModal, setCreditModal] = useState<User | null>(null);
    const [creditAmount, setCreditAmount] = useState('');

    const [flashcardsModal, setFlashcardsModal] = useState<User | null>(null);

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

    const handleSuspend = async () => {
        if (!suspendModal) return;
        try {
            await axios.post(`/api/admin/users/${suspendModal.id}/suspend`, {
                duration: suspendDuration,
                reason: suspendReason
            });
            setSuspendModal(null);
            setSuspendReason('');
            loadUsers();
        } catch (error) {
            alert('سەرکەوتوو نەبوو');
        }
    };

    const handleUnsuspend = async (userId: string) => {
        if (!confirm('ئایا دڵنیایت لە لابردنی سزای ئەم بەکارهێنەرە؟')) return;
        try {
            await axios.post(`/api/admin/users/${userId}/unsuspend`);
            loadUsers();
        } catch (error) {
            alert('سەرکەوتوو نەبوو');
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
            loadUsers();
        } catch (error) {
            alert('سەرکەوتوو نەبوو');
        }
    };

    const filteredUsers = users.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return <div className="admin-loading"><Loader2 size={32} className="spinning" /></div>;
    }

    if (errorMsg) {
        return <div style={{ textAlign: 'center', padding: '40px', color: '#f87171' }}>{errorMsg}</div>;
    }

    return (
        <div className="admin-users-container">
            <div className="admin-search-bar" style={{ marginBottom: '20px' }}>
                <div className="admin-search-input-wrap" style={{ flex: 1 }}>
                    <Search size={18} className="admin-search-icon" />
                    <input 
                        type="text" 
                        placeholder="گەڕان بۆ بەکارهێنەر..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="admin-search-input"
                    />
                </div>
            </div>

            <div className="users-grid">
                {filteredUsers.map(user => {
                    const isSuspended = user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now();
                    const weeklyStats = getStats(user.dailyStats, 'week');
                    const monthlyStats = getStats(user.dailyStats, 'month');

                    return (
                        <div key={user.id} className={`user-card ${isSuspended ? 'suspended' : ''}`}>
                            <div className="user-header">
                                <h3>{user.username}</h3>
                                <span className={`role-badge ${user.role}`}>{user.role === 'admin' ? 'ئەدمین' : 'بەکارهێنەر'}</span>
                            </div>
                            
                            <div className="user-stats">
                                <div className="stat-item">
                                    <span>کرێدیت</span>
                                    <strong>{user.credits || 0}</strong>
                                </div>
                                <div className="stat-item">
                                    <span>فلاش کارت</span>
                                    <strong>{user.flashcardsCount}</strong>
                                </div>
                            </div>

                            <div className="user-watch-stats">
                                <div className="u-watch-stat">
                                    <span className="u-ws-label">سەیرکردنی ئەم هەفتەیە:</span>
                                    <span className="u-ws-val"><Clock size={12}/> {weeklyStats.watchMinutes} خولەک</span>
                                    <span className="u-ws-val"><MessageSquare size={12}/> {weeklyStats.sentencesSeen} ڕستە</span>
                                </div>
                                <div className="u-watch-stat">
                                    <span className="u-ws-label">سەیرکردنی ئەم مانگە:</span>
                                    <span className="u-ws-val"><Clock size={12}/> {monthlyStats.watchMinutes} خولەک</span>
                                    <span className="u-ws-val"><MessageSquare size={12}/> {monthlyStats.sentencesSeen} ڕستە</span>
                                </div>
                            </div>

                            {user.flashcardsCount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                                    <button 
                                        className="btn-action" 
                                        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
                                        onClick={() => setFlashcardsModal(user)}
                                    >
                                        بینینی فلاش کارتەکان ({user.flashcardsCount})
                                    </button>
                                </div>
                            )}

                            {isSuspended && (
                                <div className="suspension-info">
                                    <ShieldBan size={14} />
                                    <span>ڕاگیراوە تا: {new Date(user.suspendedUntil!).toLocaleDateString('ku-IQ')}</span>
                                </div>
                            )}

                            <div className="user-actions">
                                <button className="btn-action credit-btn" onClick={() => setCreditModal(user)}>
                                    <CreditCard size={14} /> پێدانی کرێدیت
                                </button>
                                
                                {isSuspended ? (
                                    <button className="btn-action unsuspend-btn" onClick={() => handleUnsuspend(user.id)}>
                                        <ShieldCheck size={14} /> لابردنی سزا
                                    </button>
                                ) : (
                                    <button className="btn-action suspend-btn" onClick={() => setSuspendModal(user)}>
                                        <ShieldBan size={14} /> ڕاگرتن
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {suspendModal && (
                <div className="form-overlay" onClick={() => setSuspendModal(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>ڕاگرتنی ئەکاونت: {suspendModal.username}</h2>
                            <button onClick={() => setSuspendModal(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <div className="form-group">
                                <label>ماوەی ڕاگرتن</label>
                                <select className="form-input" value={suspendDuration} onChange={e => setSuspendDuration(e.target.value)}>
                                    <option value="week">هەفتەیەک</option>
                                    <option value="month">مانگێک</option>
                                    <option value="year">ساڵێک</option>
                                    <option value="permanent">هەمیشەیی</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>هۆکاری ڕاگرتن (دەچێت بۆ بەکارهێنەر)</label>
                                <textarea 
                                    className="form-input form-textarea" 
                                    value={suspendReason} 
                                    onChange={e => setSuspendReason(e.target.value)}
                                    placeholder="هۆکار بنووسە..."
                                />
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setSuspendModal(null)} className="btn-cancel">پاشگەز</button>
                            <button onClick={handleSuspend} className="btn-save" style={{ background: '#ef4444' }}>سزادان</button>
                        </div>
                    </div>
                </div>
            )}

            {creditModal && (
                <div className="form-overlay" onClick={() => setCreditModal(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>پێدانی کرێدیت: {creditModal.username}</h2>
                            <button onClick={() => setCreditModal(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <div className="form-group">
                                <label>بڕی کرێدیت</label>
                                <input 
                                    type="number" 
                                    className="form-input" 
                                    value={creditAmount} 
                                    onChange={e => setCreditAmount(e.target.value)}
                                    placeholder="نموونە: 100"
                                />
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setCreditModal(null)} className="btn-cancel">پاشگەز</button>
                            <button onClick={handleAddCredits} className="btn-save">زیادکردن</button>
                        </div>
                    </div>
                </div>
            )}

            {flashcardsModal && (
                <div className="form-overlay" onClick={() => setFlashcardsModal(null)}>
                    <div className="form-modal" style={{ maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>فلاش کارتەکانی: {flashcardsModal.username}</h2>
                            <button onClick={() => setFlashcardsModal(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body" style={{ overflowY: 'auto', padding: '10px 0' }}>
                            {flashcardsModal.flashcards && flashcardsModal.flashcards.length > 0 ? (
                                <div className="admin-flashcards-list">
                                    {flashcardsModal.flashcards.map((card, idx) => (
                                        <div key={card.id || idx} className="admin-flashcard-item">
                                            <div className="admin-fc-front"><strong>ئینگلیزی:</strong> {card.front}</div>
                                            <div className="admin-fc-back"><strong>کوردی:</strong> {card.back}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>ئەم بەکارهێنەرە هیچ فلاش کارتێکی نییە.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
