import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play, Home as HomeIcon, Film, Tv, User, Search, Shield, Moon, Sun, Monitor, Menu, BookOpen, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './Navbar.css';

export default function Navbar() {
    const location = useLocation();
    const { user, logout } = useAuth();
    const { t, lang, setLang } = useLanguage();
    const isWatch = location.pathname.startsWith('/watch');

    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme === 'system' ? 'dark' : theme);
    }, [theme]);

    // Close menu on route change
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    if (isWatch || location.pathname === '/auth') return null;

    return (
        <>
            {/* MOBILE TOP HEADER */}
            <div className="mobile-top-header">
                <div className="m-left">
                    <button className="m-icon-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                        <Menu size={22} />
                    </button>
                    <Link to="/" className="m-icon-btn">
                        <Search size={22} />
                    </Link>
                </div>
                <div className="m-center">
                    <span>{t('kurdish_stream')}</span>
                    <Play size={12} fill="white" />
                </div>
                <div className="m-right">
                    {user ? (
                        <Link to="/profile" className="m-avatar">
                            <User size={16} />
                        </Link>
                    ) : (
                        <Link to="/auth" className="m-avatar-login"><User size={16} /></Link>
                    )}
                </div>
            </div>

            {/* MOBILE DRAWER MENU */}
            {mobileMenuOpen && (
                <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
                    <div className="mobile-drawer" onClick={e => e.stopPropagation()}>
                        <div className="mobile-drawer-header">
                            <span className="mobile-drawer-title">
                                <Play size={14} fill="white" style={{ marginLeft: '6px' }} />
                                {t('kurdish_stream')}
                            </span>
                            <button className="mobile-drawer-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
                        </div>
                        <nav className="mobile-drawer-nav">
                            <Link to="/" className={`mobile-drawer-item ${location.pathname === '/' ? 'active' : ''}`}>
                                <HomeIcon size={20} /><span>{t('home')}</span>
                            </Link>
                            <Link to="/movies" className={`mobile-drawer-item ${location.pathname === '/movies' ? 'active' : ''}`}>
                                <Film size={20} /><span>{t('movies')}</span>
                            </Link>
                            <Link to="/series" className={`mobile-drawer-item ${location.pathname === '/series' ? 'active' : ''}`}>
                                <Tv size={20} /><span>{t('series')}</span>
                            </Link>
                            <Link to="/animations" className={`mobile-drawer-item ${location.pathname === '/animations' ? 'active' : ''}`}>
                                <Sparkles size={20} /><span>{t('animation')}</span>
                            </Link>
                            <Link to="/flashcards" className={`mobile-drawer-item ${location.pathname === '/flashcards' ? 'active' : ''}`}>
                                <BookOpen size={20} /><span>{t('flashcards')}</span>
                            </Link>
                            <Link to="/profile" className={`mobile-drawer-item ${location.pathname === '/profile' ? 'active' : ''}`}>
                                <User size={20} /><span>{t('account')}</span>
                            </Link>
                            {user?.role === 'admin' && (
                                <Link to="/admin" className={`mobile-drawer-item ${location.pathname === '/admin' ? 'active' : ''}`}>
                                    <Shield size={20} /><span>{t('admin')}</span>
                                </Link>
                            )}
                        </nav>
                        <div className="mobile-drawer-footer">
                            <div className="theme-toggles">
                                <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={14} /></button>
                                <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={14} /></button>
                                <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')}><Monitor size={14} /></button>
                            </div>
                            <div className="lang-toggles">
                                <button className={lang === 'ku' ? 'active' : ''} onClick={() => setLang('ku')}>کوردی</button>
                                <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
                                <button className={lang === 'ar' ? 'active' : ''} onClick={() => setLang('ar')}>العربية</button>
                            </div>
                            {user ? (
                                <button className="mobile-drawer-logout" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                                    چووندەرەوە ({user.username})
                                </button>
                            ) : (
                                <Link to="/auth" className="login-btn-sidebar" onClick={() => setMobileMenuOpen(false)}>{t('login')}</Link>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <aside className={`sidebar ${location.pathname.startsWith('/admin') ? 'expanded' : ''}`} onMouseEnter={() => document.querySelector('.main-content')?.classList.remove('collapsed')} onMouseLeave={() => document.querySelector('.main-content')?.classList.add('collapsed')}>
                <div className="sidebar-header">
                    <Link to="/" className="brand-logo">
                        <span className="brand-text">{t('kurdish_stream')} <span className="version">1.0.0</span></span>
                        <div className="brand-icon-wrapper">
                            <Play size={18} fill="currentColor" style={{ marginLeft: '4px' }} />
                        </div>
                    </Link>
                </div>

                <div className="sidebar-section">
                    <p className="sidebar-label">{t('menu')}</p>
                    <nav className="nav-menu">
                        <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`} data-tooltip={t('home')}>
                            <HomeIcon size={18} />
                            <span className="nav-text">{t('home')}</span>
                        </Link>
                        <Link to="/movies" className={`nav-item ${location.pathname === '/movies' ? 'active' : ''}`} data-tooltip={t('movies')}>
                            <Film size={18} />
                            <span className="nav-text">{t('movies')}</span>
                        </Link>
                        <Link to="/series" className={`nav-item ${location.pathname === '/series' ? 'active' : ''}`} data-tooltip={t('series')}>
                            <Tv size={18} />
                            <span className="nav-text">{t('series')}</span>
                        </Link>
                        <Link to="/animations" className={`nav-item ${location.pathname === '/animations' ? 'active' : ''}`} data-tooltip={t('animation')}>
                            <Sparkles size={18} />
                            <span className="nav-text">{t('animation')}</span>
                        </Link>
                        <Link to="/flashcards" className={`nav-item ${location.pathname === '/flashcards' ? 'active' : ''}`} data-tooltip={t('flashcards')}>
                            <BookOpen size={18} />
                            <span className="nav-text">{t('flashcards')}</span>
                        </Link>
                        <Link to="/profile" className={`nav-item ${location.pathname === '/profile' ? 'active' : ''}`} data-tooltip={t('account')}>
                            <User size={18} />
                            <span className="nav-text">{t('account')}</span>
                        </Link>
                        {user?.role === 'admin' && (
                            <Link to="/admin" className={`nav-item ${location.pathname === '/admin' ? 'active' : ''}`} data-tooltip={t('admin')}>
                                <Shield size={18} />
                                <span className="nav-text">{t('admin')}</span>
                            </Link>
                        )}
                    </nav>
                </div>

                <div className="sidebar-section desktop-only">
                    <p className="sidebar-label">{t('continue_watching_menu')}</p>
                    <div className="continue-mini-list">
                        <div className="mini-item">
                            <div className="mini-thumb" style={{ background: 'linear-gradient(135deg, #1f2937, #0f172a)' }}></div>
                            <div className="mini-info"><h4>The 100</h4><p>2014 • S7 E2</p></div>
                        </div>
                        <div className="mini-item">
                            <div className="mini-thumb" style={{ background: 'linear-gradient(135deg, #312e81, #111827)' }}></div>
                            <div className="mini-info"><h4>Sneaky Pete</h4><p>2015 • S1 E1</p></div>
                        </div>
                    </div>
                </div>

                <div className="sidebar-footer">
                    <div className="theme-toggles">
                        <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={14} /></button>
                        <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={14} /></button>
                        <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')}><Monitor size={14} /></button>
                    </div>
                    <div className="lang-toggles">
                        <button className={lang === 'ku' ? 'active' : ''} onClick={() => setLang('ku')}>کوردی</button>
                        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
                        <button className={lang === 'ar' ? 'active' : ''} onClick={() => setLang('ar')}>العربية</button>
                    </div>
                    {user ? (
                        <div className="user-profile-mini">
                            <div className="user-info">
                                <h4>{user.username}</h4>
                                <p>@{user.username.toLowerCase()}</p>
                            </div>
                            <div className="user-avatar" onClick={logout} title={t('login')}>
                                <User size={20} />
                            </div>
                        </div>
                    ) : (
                        <Link to="/auth" className="login-btn-sidebar">{t('login')}</Link>
                    )}
                </div>

                {/* MOBILE BOTTOM NAVIGATION */}
                <nav className="mobile-bottom-nav">
                    <Link to="/" className={`mob-item ${location.pathname === '/' ? 'active' : ''}`}>
                        <HomeIcon size={20} /><span>{t('home')}</span>
                    </Link>
                    <Link to="/movies" className={`mob-item ${location.pathname === '/movies' ? 'active' : ''}`}>
                        <Film size={20} /><span>{t('movies')}</span>
                    </Link>
                    <Link to="/series" className={`mob-item ${location.pathname === '/series' ? 'active' : ''}`}>
                        <Tv size={20} /><span>{t('series')}</span>
                    </Link>
                    <Link to="/animations" className={`mob-item ${location.pathname === '/animations' ? 'active' : ''}`}>
                        <Sparkles size={20} /><span>{t('animation')}</span>
                    </Link>
                    <Link to="/flashcards" className={`mob-item ${location.pathname === '/flashcards' ? 'active' : ''}`}>
                        <BookOpen size={20} /><span>{t('flashcards')}</span>
                    </Link>
                    <Link to="/profile" className={`mob-item ${location.pathname === '/profile' ? 'active' : ''}`}>
                        <User size={20} /><span>{t('account')}</span>
                    </Link>
                </nav>
            </aside>
        </>/*  */);
}
