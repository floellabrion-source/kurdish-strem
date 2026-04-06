import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Settings, Edit2, Play, Bookmark, List, Film } from 'lucide-react';
import './Profile.css';

export default function Profile() {
    const { user } = useAuth();
    
    if (!user) return <div style={{ padding: '50px', textAlign: 'center' }}>تکایە خۆت تۆمار بکە...</div>;

    const dummyAvatar = "https://i.pravatar.cc/300"; // Dummy avatar if no image
    const avatarUrl = user.avatarUrl || dummyAvatar;

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
                        <span>فۆڵۆوینگ <strong>0</strong></span>
                        <span className="dot">•</span>
                        <span>فۆڵۆوەر <strong>0</strong></span>
                        <span className="dot">•</span>
                        <span>لیستەکان <strong>0</strong></span>
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
