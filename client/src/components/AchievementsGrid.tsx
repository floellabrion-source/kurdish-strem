import { useState } from 'react';
import { 
    Trophy, Flame, Zap, Crown, BookOpen, Sparkles, Film, Tv, 
    Award, Brain, MessageSquare, ShieldCheck, Lock, CheckCircle2, Star,
    TrendingUp, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { calculateAchievements, calculateUserXP, getUserRank, AchievementBadge } from '../utils/achievements';
import './AchievementsGrid.css';

const ICON_MAP: Record<string, any> = {
    Flame,
    Zap,
    Crown,
    BookOpen,
    Library: BookOpen,
    Sparkles,
    Film,
    Tv,
    Award,
    Brain,
    MessageSquare,
    ShieldCheck
};

export default function AchievementsGrid({ streakDays = 0 }: { streakDays?: number }) {
    const { user } = useAuth();
    const { lang } = useLanguage();
    const [selectedBadge, setSelectedBadge] = useState<AchievementBadge | null>(null);

    const xp = calculateUserXP(user);
    const rank = getUserRank(xp);
    const badges = calculateAchievements(user, streakDays);

    const unlockedCount = badges.filter(b => b.isUnlocked).length;
    const totalCount = badges.length;

    return (
        <div className="achievements-section">
            {/* Rank & XP Hero Card */}
            <div className="rank-hero-card">
                <div className="rank-header">
                    <div className="rank-badge-circle">
                        <Trophy size={32} className="trophy-icon-glow" />
                        <span className="rank-level-number">Lvl {rank.level}</span>
                    </div>
                    <div className="rank-details">
                        <span className="rank-subtitle">
                            {lang === 'en' ? 'Polyglot Rank' : 'پلەی فێربوون'}
                        </span>
                        <h3 className="rank-title">{lang === 'en' ? rank.titleEn : rank.titleKu}</h3>
                    </div>
                    <div className="xp-badge-box">
                        <Sparkles size={16} color="#fbbf24" />
                        <span className="xp-value">{rank.currentXP} XP</span>
                    </div>
                </div>

                <div className="rank-progress-area">
                    <div className="rank-progress-meta">
                        <span>{lang === 'en' ? `Next Rank: Lvl ${Math.min(5, rank.level + 1)}` : `پلەی دواتر: ئاستی ${Math.min(5, rank.level + 1)}`}</span>
                        <span>{rank.currentXP} / {rank.nextLevelXP} XP</span>
                    </div>
                    <div className="rank-progress-bar-bg">
                        <div 
                            className="rank-progress-bar-fill"
                            style={{ width: `${rank.progressPercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Badges Count Header */}
            <div className="badges-filter-bar">
                <div className="badges-count-pill">
                    <Award size={16} />
                    <span>{unlockedCount} / {totalCount} {lang === 'en' ? 'Unlocked' : 'بەدەستهاتوو'}</span>
                </div>
            </div>

            {/* Badges Grid */}
            <div className="badges-grid">
                {badges.map(badge => {
                    const IconComponent = ICON_MAP[badge.iconName] || Trophy;
                    const progressPercent = Math.min(100, Math.round((badge.currentValue / badge.targetValue) * 100));

                    return (
                        <div 
                            key={badge.id} 
                            className={`badge-card tier-${badge.tier} ${badge.isUnlocked ? 'unlocked' : 'locked'}`}
                            onClick={() => setSelectedBadge(badge)}
                        >
                            <div className="badge-icon-box">
                                <IconComponent size={28} className="badge-main-icon" />
                                {badge.isUnlocked ? (
                                    <div className="badge-check-dot">
                                        <CheckCircle2 size={12} fill="#10b981" color="#fff" />
                                    </div>
                                ) : (
                                    <div className="badge-lock-dot">
                                        <Lock size={12} />
                                    </div>
                                )}
                            </div>

                            <div className="badge-info">
                                <h4 className="badge-title">{lang === 'en' ? badge.titleEn : badge.titleKu}</h4>
                                <p className="badge-desc">{lang === 'en' ? badge.descEn : badge.descKu}</p>

                                <div className="badge-progress-wrap">
                                    <div className="badge-progress-meta">
                                        <span>{badge.currentValue} / {badge.targetValue}</span>
                                        <span className="badge-xp-tag">+{badge.xpReward} XP</span>
                                    </div>
                                    <div className="badge-progress-track">
                                        <div 
                                            className="badge-progress-fill" 
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Badge Detail Modal */}
            {selectedBadge && (
                <div className="badge-modal-overlay" onClick={() => setSelectedBadge(null)}>
                    <div className="badge-modal-content glass" onClick={e => e.stopPropagation()}>
                        <div className={`modal-badge-glow tier-${selectedBadge.tier}`} />
                        
                        <div className="modal-icon-wrapper">
                            {(() => {
                                const ModalIcon = ICON_MAP[selectedBadge.iconName] || Trophy;
                                return <ModalIcon size={44} className="modal-icon" />;
                            })()}
                        </div>

                        <span className={`modal-tier-pill ${selectedBadge.tier}`}>
                            {selectedBadge.tier.toUpperCase()}
                        </span>

                        <h3 className="modal-title">
                            {lang === 'en' ? selectedBadge.titleEn : selectedBadge.titleKu}
                        </h3>

                        <p className="modal-desc">
                            {lang === 'en' ? selectedBadge.descEn : selectedBadge.descKu}
                        </p>

                        <div className="modal-stats-box">
                            <div className="modal-stat-row">
                                <span>{lang === 'en' ? 'Current Progress:' : 'بەرەوپێشچوونی ئێستا:'}</span>
                                <strong>{selectedBadge.currentValue} / {selectedBadge.targetValue}</strong>
                            </div>
                            <div className="modal-stat-row">
                                <span>{lang === 'en' ? 'Reward XP:' : 'پاداشتی خاڵی XP:'}</span>
                                <strong style={{ color: '#fbbf24' }}>+{selectedBadge.xpReward} XP</strong>
                            </div>
                            <div className="modal-stat-row">
                                <span>{lang === 'en' ? 'Status:' : 'دۆخ:'}</span>
                                <strong style={{ color: selectedBadge.isUnlocked ? '#10b981' : '#f59e0b' }}>
                                    {selectedBadge.isUnlocked 
                                        ? (lang === 'en' ? '✓ Unlocked' : '✓ بەدەستهاتوو') 
                                        : (lang === 'en' ? '🔒 In Progress' : '🔒 لە پڕۆسەدایە')}
                                </strong>
                            </div>
                        </div>

                        <button className="btn-close-badge-modal" onClick={() => setSelectedBadge(null)}>
                            {lang === 'en' ? 'Close' : 'داخستن'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
