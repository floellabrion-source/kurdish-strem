import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Settings, Edit2, Play, Bookmark, List, Film, CreditCard, ShoppingCart, Clock, MessageSquare, CalendarDays, Calendar } from 'lucide-react';
import './Profile.css';

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

export default function Profile() {
    const { user } = useAuth();
    
    if (!user) return <div style={{ padding: '50px', textAlign: 'center' }}>تکایە خۆت تۆمار بکە...</div>;

    const dummyAvatar = "https://i.pravatar.cc/300"; // Dummy avatar if no image
    const avatarUrl = user.avatarUrl || dummyAvatar;

    const dailyStats = getStats(user.dailyStats, 'day');
    const weeklyStats = getStats(user.dailyStats, 'week');
    const monthlyStats = getStats(user.dailyStats, 'month');

    return (
        <div className="profile-page">
            <div className="profile-hero">
                <div 
                    className="profile-blur-bg" 
                    style={{ backgroundImage: `url(${avatarUrl})` }}
                ></div>
                <div className="profile-hero-content">
                    <img src={avatarUrl} alt={user.username} className="profile-avatar" />
                    
                    <h1 className="profile-name">{user.username}</h1>
                    <p className="profile-handle">@{user.username.toLowerCase()}</p>
                    
                    <div className="profile-actions">
                        <button className="btn-edit">
                            دەستکاری <Edit2 size={16} />
                        </button>
                        <button className="btn-settings">
                            <Settings size={20} />
                        </button>
                    </div>

                    <div className="profile-stats">
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <CreditCard size={14} color="#3b82f6" />
                            کرێدیت: <strong>{user.credits || 0}</strong>
                        </span>
                        <span className="dot">•</span>
                        <span>فۆڵۆوینگ <strong>0</strong></span>
                        <span className="dot">•</span>
                        <span>فۆڵۆوەر <strong>0</strong></span>
                    </div>

                    {/* Watch Stats Section */}
                    <div className="profile-watch-stats">
                        <div className="p-stat-box">
                            <div className="p-stat-header"><Clock size={14} /> ئەمڕۆ</div>
                            <div className="p-stat-body">
                                <div><Play size={12} /> {dailyStats.watchMinutes} خولەک</div>
                                <div><MessageSquare size={12} /> {dailyStats.sentencesSeen} ڕستە</div>
                            </div>
                        </div>
                        <div className="p-stat-box">
                            <div className="p-stat-header"><CalendarDays size={14} /> ئەم هەفتەیە</div>
                            <div className="p-stat-body">
                                <div><Play size={12} /> {weeklyStats.watchMinutes} خولەک</div>
                                <div><MessageSquare size={12} /> {weeklyStats.sentencesSeen} ڕستە</div>
                            </div>
                        </div>
                        <div className="p-stat-box">
                            <div className="p-stat-header"><Calendar size={14} /> ئەم مانگە</div>
                            <div className="p-stat-body">
                                <div><Play size={12} /> {monthlyStats.watchMinutes} خولەک</div>
                                <div><MessageSquare size={12} /> {monthlyStats.sentencesSeen} ڕستە</div>
                            </div>
                        </div>
                    </div>

                    {/* Credit Purchase UI Design */}
                    <div className="credit-purchase-section">
                        <div className="credit-banner">
                            <div className="credit-info">
                                <h3>کڕینی کرێدیت</h3>
                                <p>بە کرێدیت دەتوانیت تایبەتمەندییە زیرەکەکانی وێبسایتەکە بەکاربهێنیت وەکو فلاش کارت و AI.</p>
                            </div>
                            <button className="btn-buy-credit" onClick={() => alert('لەم کاتەدا بەردەست نییە. دواتر نرخەکان ڕێک دەخرێن.')}>
                                <ShoppingCart size={18} /> کڕین
                            </button>
                        </div>
                    </div>

                    <div className="profile-favorites-grid">
                        <div className="fav-card">
                            <Film size={20} className="fav-icon" />
                            <div className="fav-text">
                                <h5>فیلمی دڵخواز</h5>
                                <p>زیادکردن +</p>
                            </div>
                        </div>
                        <div className="fav-card">
                            <Play size={20} className="fav-icon" />
                            <div className="fav-text">
                                <h5>زنجیرەی دڵخواز</h5>
                                <p>زیادکردن +</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="profile-tabs">
                <button className="tab-btn active">لیستی سەیرکردن</button>
                <button className="tab-btn">لیستەکان</button>
                <button className="tab-btn">کۆکراوەکان</button>
            </div>
            
            <div className="profile-tab-content">
                <div style={{ textAlign: 'center', padding: '40px', color: '#666', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', margin: '20px' }}>
                    <Bookmark size={48} style={{ opacity: 0.5, marginBottom: '10px' }} />
                    <p>هیچ فیلمێک لێرە نییە خاش.</p>
                </div>
            </div>
        </div>
    );
}
