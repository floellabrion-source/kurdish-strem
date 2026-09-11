import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { 
    Play, Home as HomeIcon, Film, Tv, User, Search, Shield, 
    Moon, Sun, Monitor, Menu, BookOpen, Sparkles, Heart, Clock, Brain, CreditCard, Download, Smartphone,
    ArrowRight, X, ChevronLeft, Star, LogOut, LogIn
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePwa } from '../context/PwaContext';
import { Movie } from '../types';
import './Navbar.css';

export default function Navbar() {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user, logout } = useAuth();
    const { t, lang, setLang } = useLanguage();
    const { isInstalled, promptInstall } = usePwa();
    const isWatch = location.pathname.startsWith('/watch/');

    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
        return (localStorage.getItem('theme') as any) || 'dark';
    });
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [movies, setMovies] = useState<Movie[]>([]);
    
    // Live Search Modal State
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setSearchModalOpen(prev => !prev);
            } else if (e.key === 'Escape') {
                setSearchModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (searchModalOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [searchModalOpen]);

    const liveSearchResults = searchQuery.trim() ? movies.filter(m => {
        const q = searchQuery.trim().toLowerCase();
        const titleMatch = m.title?.toLowerCase().includes(q);
        const titleKuMatch = (m as any).titleKu?.toLowerCase().includes(q);
        const genreMatch = m.genre?.toLowerCase().includes(q);
        const actorsMatch = Array.isArray((m as any).actors) && (m as any).actors.some((a: string) => typeof a === 'string' && a.toLowerCase().includes(q));
        return titleMatch || titleKuMatch || genreMatch || actorsMatch;
    }).slice(0, 12) : [];

    const handleSelectMovie = (movieId: string) => {
        setSearchModalOpen(false);
        setSearchQuery('');
        navigate(`/movie/${movieId}`);
    };

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.setAttribute('data-theme', systemTheme);
        } else {
            root.setAttribute('data-theme', theme);
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Close menu on route change
    useEffect(() => {
        setMobileMenuOpen(false);
        setSearchModalOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        axios.get('/api/movies')
            .then(res => setMovies(res.data))
            .catch(err => console.error(err));
    }, []);

    if (isWatch || location.pathname.startsWith('/auth')) return null;

    // Process history
    let recentHistory: { key: string, hist: any, m: Movie | undefined, link: string, epText: string }[] = [];
    if (user?.history) {
        recentHistory = Object.entries(user.history)
            .sort((a, b) => new Date(b[1].date || 0).getTime() - new Date(a[1].date || 0).getTime())
            .slice(0, 2)
            .map(([key, hist]) => {
                const match = key.match(/^(.+?)_s(\d+)_e(\d+)$/);
                let link = `#`;
                let epText = t('movies');
                if (match) {
                    const mId = match[1];
                    const eNum = parseInt(match[3]);
                    link = eNum > 0 ? `/watch/${mId}?s=${match[2]}&e=${eNum}` : `/watch/${mId}`;
                    epText = `${t('season')} ${match[2]} • ${t('episode')} ${match[3]}`;
                } else {
                    link = `/watch/${key}`;
                }
                const m = movies.find(x => x.id === (match ? match[1] : key));
                return { key, hist, m, link, epText };
            });
    }

    return (
        <>
            {/* MOBILE TOP HEADER */}
            <div className="mobile-top-header">
                <div className="m-left">
                    <button className="m-icon-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                        <Menu size={22} />
                    </button>
                    <button className="m-icon-btn search-trigger-btn" onClick={() => setSearchModalOpen(true)} title={t('search_placeholder') || 'گەڕان'}>
                        <Search size={22} color="#a855f7" />
                    </button>
                </div>
                <div className="m-center">
                    <Link to="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src="/kst-logo.png" alt="KST" className="mobile-kst-logo-img" />
                    </Link>
                </div>
                <div className="m-right">
                    {user ? (
                        <Link to="/profile" className="m-avatar">
                            {(user.avatar || user.avatarUrl) ? (
                                <img 
                                    src={user.avatar || user.avatarUrl} 
                                    alt="avatar" 
                                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                                    onError={(e) => {
                                        (e.currentTarget as HTMLElement).style.display = 'none';
                                        if (e.currentTarget.parentElement) {
                                            e.currentTarget.parentElement.innerText = (user.username || 'U').charAt(0).toUpperCase();
                                        }
                                    }}
                                />
                            ) : (
                                <User size={16} />
                            )}
                        </Link>
                    ) : (
                        <Link to="/auth" className="m-avatar-login"><User size={16} /></Link>
                    )}
                </div>
            </div>

            {/* LIVE SEARCH MODAL / POPUP (Like MovieBox & HDToday) */}
            {searchModalOpen && (
                <div className="search-modal-overlay" onClick={() => setSearchModalOpen(false)}>
                    <div className="search-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="search-modal-header">
                            <div className="search-modal-title-row">
                                <span className="modal-title-text">
                                    <Search size={18} color="#a855f7" /> {lang === 'en' ? 'Search' : 'گەڕان'}
                                </span>
                                <button className="search-modal-close" onClick={() => setSearchModalOpen(false)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="search-modal-input-wrap">
                                <Search size={18} className="modal-search-icon" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder={lang === 'en' ? 'Type a movie, series, actor...' : 'ناوی فیلم، زنجیرە، یان ئەکتەر بنووسە...'}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="search-modal-input"
                                    autoFocus
                                />
                                {searchQuery && (
                                    <button className="search-modal-clear" onClick={() => setSearchQuery('')}>
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="search-modal-body">
                            {searchQuery.trim() === '' ? (
                                <div className="search-modal-empty-hint">
                                    <p className="search-hint-title">{lang === 'en' ? '🔥 Suggested Titles' : '🔥 فیلم و زنجیرە پێشنیارکراوەکان'}</p>
                                    <div className="search-quick-tags">
                                        {movies.slice(0, 6).map(m => (
                                            <button key={m.id} className="search-tag-chip" onClick={() => setSearchQuery(m.title)}>
                                                {m.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : liveSearchResults.length > 0 ? (
                                <div className="search-results-list">
                                    {liveSearchResults.map(movie => (
                                        <div
                                            key={movie.id}
                                            className="search-result-item"
                                            onClick={() => handleSelectMovie(movie.id)}
                                        >
                                            <div className="search-result-thumb">
                                                {movie.posterCloudUrl || movie.posterUrl ? (
                                                    <img src={movie.posterCloudUrl || movie.posterUrl} alt={movie.title} />
                                                ) : (
                                                    <Film size={20} />
                                                )}
                                            </div>
                                            <div className="search-result-info">
                                                <h4 className="search-result-title">{movie.title}</h4>
                                                <div className="search-result-meta">
                                                    <span className="result-type-badge">
                                                        {movie.type === 'series' ? (lang === 'en' ? 'TV Series' : 'زنجیرە') : 
                                                         movie.type === 'animation' ? (lang === 'en' ? 'Animation' : 'ئەنیمەیشن') : 
                                                         (lang === 'en' ? 'Movie' : 'فیلم')}
                                                    </span>
                                                    {movie.year && <span>• {movie.year}</span>}
                                                    {movie.imdbRating && (
                                                        <span className="result-imdb">
                                                            <Star size={11} fill="#fbbf24" color="#fbbf24" style={{ marginLeft: '2px' }} /> {movie.imdbRating}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronLeft size={18} className="result-chevron" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="search-no-results">
                                    <Search size={36} className="no-res-icon" />
                                    <p>{lang === 'en' ? `No results found for "${searchQuery}"` : `هیچ ئەنجامێک بۆ «${searchQuery}» نەدۆزرایەوە`}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MOBILE DRAWER MENU */}
            {mobileMenuOpen && (
                <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
                    <div className="mobile-drawer" onClick={e => e.stopPropagation()}>
                        <div className="mobile-drawer-header">
                            <Link to="/" className="mobile-drawer-brand-link" onClick={() => setMobileMenuOpen(false)}>
                                <img src="/kst-logo.png" alt="KST" className="mobile-drawer-kst-logo" />
                            </Link>
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
                            <Link to="/assessment" className={`mobile-drawer-item ${location.pathname === '/assessment' ? 'active' : ''}`}>
                                <Brain size={20} /><span>{lang === 'en' ? 'Level Test' : 'ئاستی زمان'}</span>
                            </Link>
                            {user && (
                                <>
                                    <Link to="/favorites" className={`mobile-drawer-item ${location.pathname === '/favorites' ? 'active' : ''}`}>
                                        <Heart size={20} /><span>{t('favorites')}</span>
                                    </Link>
                                    <Link to="/watch-later" className={`mobile-drawer-item ${location.pathname === '/watch-later' ? 'active' : ''}`}>
                                        <Clock size={20} /><span>{t('watch_later')}</span>
                                    </Link>
                                </>
                            )}
                            <Link to="/buy-credits" className={`mobile-drawer-item ${location.pathname === '/buy-credits' ? 'active' : ''}`}>
                                <CreditCard size={20} /><span>{lang === 'en' ? 'Billing & Credits' : 'بەشداریکردن و دارایی'}</span>
                            </Link>
                            <Link to="/profile" className={`mobile-drawer-item ${location.pathname === '/profile' ? 'active' : ''}`}>
                                <User size={20} /><span>{t('account')}</span>
                            </Link>
                            {(user?.role === 'admin' || user?.role === 'super_admin') && (
                                <Link to="/admin" className={`mobile-drawer-item ${location.pathname === '/admin' ? 'active' : ''}`}>
                                    <Shield size={20} /><span>{t('admin')}</span>
                                </Link>
                            )}
                            {!isInstalled && (
                                <button 
                                    className="mobile-drawer-item pwa-drawer-btn" 
                                    onClick={() => { setMobileMenuOpen(false); promptInstall(); }}
                                >
                                    <Smartphone size={20} color="#c084fc" />
                                    <span>{lang === 'en' ? 'Install Mobile App 📲' : 'داگرتنی ئەپڵیکەیشن 📲'}</span>
                                </button>
                            )}
                        </nav>
                        <div className="mobile-drawer-footer">
                            <div className="settings-group">
                                <p className="settings-label">{lang === 'en' ? 'Theme' : 'شێواز'}</p>
                                <div className="theme-toggles">
                                    <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title={lang === 'en' ? 'Light' : 'ڕووناک'}>
                                        <Sun size={18} />
                                    </button>
                                    <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title={lang === 'en' ? 'Dark' : 'تاریک'}>
                                        <Moon size={18} />
                                    </button>
                                    <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')} title={lang === 'en' ? 'System' : 'سیستەم'}>
                                        <Monitor size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="settings-group">
                                <p className="settings-label">{lang === 'en' ? 'Language' : 'زمان'}</p>
                                <div className="lang-toggles">
                                    <button className={lang === 'ku' ? 'active' : ''} onClick={() => setLang('ku')}>کوردی</button>
                                    <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
                                </div>
                            </div>
                            {user ? (
                                <button className="mobile-drawer-logout" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                                    <LogOut size={18} />
                                    <span>{lang === 'en' ? `Log Out (${user.username})` : `چوونەدەرەوە (${user.username})`}</span>
                                </button>
                            ) : (
                                <Link to="/auth" className="login-btn-sidebar mobile-login-btn" onClick={() => setMobileMenuOpen(false)}>
                                    <LogIn size={18} />
                                    <span>{t('login')}</span>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* DESKTOP SIDEBAR */}
            <aside 
                className="sidebar" 
                onMouseEnter={() => document.querySelector('.main-content')?.classList.remove('collapsed')} 
                onMouseLeave={() => document.querySelector('.main-content')?.classList.add('collapsed')}
            >
                <div className="sidebar-header">
                    <Link to="/" className="brand-logo" title="KST">
                        <img src="/kst-logo.png" alt="KST" className="sidebar-kst-logo-img" />
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
                        <Link to="/assessment" className={`nav-item ${location.pathname === '/assessment' ? 'active' : ''}`} data-tooltip={lang === 'en' ? 'Level Test' : 'ئاستی زمان'}>
                            <Brain size={18} />
                            <span className="nav-text">{lang === 'en' ? 'Level Test' : 'ئاستی زمان'}</span>
                        </Link>
                        {user && (
                            <>
                                <Link to="/favorites" className={`nav-item ${location.pathname === '/favorites' ? 'active' : ''}`} data-tooltip={t('favorites')}>
                                    <Heart size={18} />
                                    <span className="nav-text">{t('favorites')}</span>
                                </Link>
                                <Link to="/watch-later" className={`nav-item ${location.pathname === '/watch-later' ? 'active' : ''}`} data-tooltip={t('watch_later')}>
                                    <Clock size={18} />
                                    <span className="nav-text">{t('watch_later')}</span>
                                </Link>
                            </>
                        )}
                        <Link to="/buy-credits" className={`nav-item ${location.pathname === '/buy-credits' ? 'active' : ''}`} data-tooltip={lang === 'en' ? 'Billing & Credits' : 'بەشداریکردن و دارایی'}>
                            <CreditCard size={18} />
                            <span className="nav-text">{lang === 'en' ? 'Billing & Credits' : 'بەشداریکردن و دارایی'}</span>
                        </Link>
                        <Link to="/profile" className={`nav-item ${location.pathname === '/profile' ? 'active' : ''}`} data-tooltip={t('account')}>
                            <User size={18} />
                            <span className="nav-text">{t('account')}</span>
                        </Link>
                        {(user?.role === 'admin' || user?.role === 'super_admin') && (
                            <Link to="/admin" className={`nav-item ${location.pathname === '/admin' ? 'active' : ''}`} data-tooltip={t('admin')}>
                                <Shield size={18} />
                                <span className="nav-text">{t('admin')}</span>
                            </Link>
                        )}
                        {user && (
                            <button 
                                className="nav-item nav-logout-item" 
                                onClick={logout} 
                                data-tooltip={lang === 'en' ? 'Log Out' : 'چوونەدەرەوە'}
                            >
                                <LogOut size={18} />
                                <span className="nav-text">{lang === 'en' ? 'Log Out' : 'چوونەدەرەوە'}</span>
                            </button>
                        )}
                        {!isInstalled && (
                            <button 
                                className="nav-item pwa-nav-btn" 
                                onClick={() => promptInstall()} 
                                data-tooltip={lang === 'en' ? 'Install App 📲' : 'داگرتنی ئەپڵیکەیشن 📲'}
                            >
                                <Download size={18} color="#c084fc" />
                                <span className="nav-text" style={{ color: '#c084fc', fontWeight: 'bold' }}>
                                    {lang === 'en' ? 'Install App' : 'داگرتنی ئەپ'}
                                </span>
                            </button>
                        )}
                    </nav>
                </div>

                <div className="sidebar-section desktop-only">
                    <p className="sidebar-label">{lang === 'en' ? 'Credits Balance' : 'ژمارەی کرێدیت'}</p>
                    <Link to="/buy-credits" className="nav-item credit-display" title={lang === 'en' ? 'Click to Buy Credits' : 'کلیک بکە بۆ کڕینی کرێدیت'}>
                        <Sparkles size={18} />
                        <span className="nav-text" style={{ color: '#eab308', fontWeight: 'bold' }}>{user?.credits || 0} {lang === 'en' ? 'Credits' : 'کرێدیت'}</span>
                    </Link>
                </div>

                <div className="sidebar-section desktop-only">
                    <p className="sidebar-label">{t('continue_watching_menu')}</p>
                    <div className="continue-mini-list">
                        {recentHistory.length > 0 ? (
                            recentHistory.map(({ key, hist, m, link, epText }) => (
                                <Link to={link} className="mini-item" key={key}>
                                    <div className="mini-info">
                                        <h4>{hist.title}</h4>
                                        <p>{epText} {m?.year ? `• ${m.year}` : ''}</p>
                                    </div>
                                    <div 
                                        className="mini-thumb" 
                                        style={{ 
                                             backgroundImage: m?.posterCloudUrl || m?.posterUrl ? `url(${m.posterCloudUrl || m.posterUrl})` : 'linear-gradient(135deg, #1f2937, #0f172a)' 
                                        }}
                                    ></div>
                                </Link>
                            ))
                        ) : (
                            <div className="mini-item" style={{ opacity: 0.5, cursor: 'default' }}>
                                <div className="mini-info">
                                    <p>{lang === 'en' ? 'No recent movies' : 'هیچ فیلمێک نییە'}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="sidebar-footer">
                    <div className="sidebar-footer-content">
                        <div className="settings-group">
                            <div className="theme-toggles-modern">
                                <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title={lang === 'en' ? 'Light' : 'ڕووناک'}>
                                    <Sun size={15} />
                                </button>
                                <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title={lang === 'en' ? 'Dark' : 'تاریک'}>
                                    <Moon size={15} />
                                </button>
                                <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')} title={lang === 'en' ? 'System' : 'سیستەم'}>
                                    <Monitor size={15} />
                                </button>
                            </div>
                        </div>
                        <div className="settings-group">
                            <div className="lang-toggles-modern">
                                <button className={lang === 'ku' ? 'active' : ''} onClick={() => setLang('ku')}>کوردی</button>
                                <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
                            </div>
                        </div>
                    </div>
                    {user ? (
                        <div className="user-profile-mini">
                            <Link to="/profile" className="user-profile-link" title={lang === 'en' ? 'View Profile' : 'بینینی پڕۆفایل'}>
                                <div className="user-avatar">
                                    {(user.avatar || user.avatarUrl) ? (
                                        <img 
                                            src={user.avatar || user.avatarUrl} 
                                            alt="avatar" 
                                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                                            onError={(e) => {
                                                (e.currentTarget as HTMLElement).style.display = 'none';
                                                if (e.currentTarget.parentElement) {
                                                    e.currentTarget.parentElement.innerText = (user.username || 'U').charAt(0).toUpperCase();
                                                }
                                            }}
                                        />
                                    ) : (
                                        <User size={18} />
                                    )}
                                </div>
                                <div className="user-info">
                                    <h4>{user.username}</h4>
                                    <p>@{user.username.toLowerCase()}</p>
                                </div>
                            </Link>
                            <button 
                                className="btn-sidebar-logout" 
                                onClick={logout} 
                                title={lang === 'en' ? 'Log Out' : 'چوونەدەرەوە'}
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    ) : (
                        <Link 
                            to="/auth" 
                            className="login-btn-sidebar" 
                            title={t('login')}
                            data-tooltip={t('login')}
                        >
                            <LogIn size={18} className="login-icon" />
                            <span className="login-text">{t('login')}</span>
                        </Link>
                    )}
                </div>
            </aside>

            {/* MOBILE BOTTOM NAVIGATION (OUTSIDE ASIDE) */}
            <nav className="mobile-bottom-nav">
                <Link to="/" className={`mob-item ${location.pathname === '/' ? 'active' : ''}`}>
                    <div className="mob-icon-wrap"><HomeIcon size={20} /></div>
                    <span>{t('home')}</span>
                </Link>
                <Link to="/movies" className={`mob-item ${location.pathname === '/movies' ? 'active' : ''}`}>
                    <div className="mob-icon-wrap"><Film size={20} /></div>
                    <span>{t('movies')}</span>
                </Link>
                <Link to="/series" className={`mob-item ${location.pathname === '/series' ? 'active' : ''}`}>
                    <div className="mob-icon-wrap"><Tv size={20} /></div>
                    <span>{t('series')}</span>
                </Link>
                <Link to="/flashcards" className={`mob-item ${location.pathname === '/flashcards' ? 'active' : ''}`}>
                    <div className="mob-icon-wrap"><BookOpen size={20} /></div>
                    <span>{t('flashcards')}</span>
                </Link>
                <Link to="/profile" className={`mob-item ${location.pathname === '/profile' ? 'active' : ''}`}>
                    <div className="mob-icon-wrap"><User size={20} /></div>
                    <span>{t('account')}</span>
                </Link>
            </nav>
        </>
    );
}
