import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import { Play, Clock, Calendar, Star, Film, Search, Layers, User, Filter, Eye, ChevronDown, ChevronLeft, ChevronRight, Brain, Sparkles, Flame } from 'lucide-react';
import { Movie, getCefrDisplayLevel, getCefrColor } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { OptimizedImage } from '../components/OptimizedImage';
import './Home.css';

export interface GenreItem {
    id: string;
    ku: string;
    en: string;
}

export const GENRES: GenreItem[] = [
    { id: 'crime', ku: 'تاوانکاری', en: 'Crime' },
    { id: 'drama', ku: 'دراما', en: 'Drama' },
    { id: 'scifi', ku: 'زانستی خەیاڵی', en: 'Sci-Fi' },
    { id: 'thriller', ku: 'هەستبزوێن', en: 'Thriller' },
    { id: 'action', ku: 'ئاکشن', en: 'Action' },
    { id: 'adventure', ku: 'سەرکێشی', en: 'Adventure' },
    { id: 'family', ku: 'خێزانی', en: 'Family' },
    { id: 'fantasy', ku: 'خەیاڵی', en: 'Fantasy' },
    { id: 'music', ku: 'موزیک', en: 'Music' },
    { id: 'history', ku: 'مێژوویی', en: 'History' },
    { id: 'horror', ku: 'ترسناک', en: 'Horror' },
    { id: 'documentary', ku: 'دۆکیۆمێنتاری', en: 'Documentary' },
    { id: 'comedy', ku: 'کۆمێدی', en: 'Comedy' },
    { id: 'western', ku: 'ڕۆژئاوایی', en: 'Western' },
    { id: 'sport', ku: 'وەرزشی', en: 'Sport' },
    { id: 'medical', ku: 'پزیشکی', en: 'Medical' },
    { id: 'short', ku: 'کورتە', en: 'Short' },
    { id: 'social', ku: 'کۆمەڵایەتی', en: 'Social' },
    { id: 'tragedy', ku: 'تراژیدی', en: 'Tragedy' },
    { id: 'mystery', ku: 'سیخوڕی', en: 'Mystery' },
    { id: 'classic', ku: 'کلاسیک', en: 'Classic' },
    { id: 'samurai', ku: 'سامۆرای', en: 'Samurai' },
    { id: 'biography', ku: 'بیۆگرافی', en: 'Biography' },
    { id: 'war', ku: 'جەنگ', en: 'War' }
];

export const translateGenre = (genreStr: string | undefined, lang: string) => {
    if (!genreStr) return '';
    const parts = genreStr.split(/[,،/|]/).map(s => s.trim()).filter(Boolean);
    const translated = parts.map(p => {
        const match = GENRES.find(g => 
            g.ku.toLowerCase() === p.toLowerCase() || 
            g.en.toLowerCase() === p.toLowerCase() || 
            g.id.toLowerCase() === p.toLowerCase()
        );
        if (match) {
            return lang === 'en' ? match.en : match.ku;
        }
        return p;
    });
    return translated.join(', ');
};

const YEARS_LIST = [
    '1950', '1951', '1952', '1953', '1954', '1955', '1956', '1957', '1958', '1959',
    '1960', '1961', '1962', '1963', '1964', '1965', '1966', '1967', '1968', '1969',
    '1970', '1971', '1972', '1973', '1974', '1975', '1976', '1977', '1978', '1979',
    '1980', '1981', '1982', '1983', '1984', '1985', '1986', '1987', '1988', '1989',
    '1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999',
    '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009',
    '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
    '2020', '2021', '2022', '2023', '2024', '2025'
].reverse();

export default function Home({ filter }: { filter?: 'movie' | 'series' | 'animation' }) {
    const [searchParams] = useSearchParams();
    const [movies, setMovies] = useState<Movie[]>(() => {
        try {
            const cached = localStorage.getItem('ks_cached_movies');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [loading, setLoading] = useState(() => !Boolean(localStorage.getItem('ks_cached_movies')));
    const [search, setSearch] = useState(() => searchParams.get('q') || '');
    const [featured, setFeatured] = useState<Movie | null>(null);
    const [secondary, setSecondary] = useState<Movie | null>(null);
    
    // Filters state
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [selectedLevel, setSelectedLevel] = useState<string>(() => searchParams.get('level') || '');
    const [sortBy, setSortBy] = useState<'latest' | 'views'>('latest');
    const [liveViewers, setLiveViewers] = useState<Record<string, number>>({});
    const [showGenreMenu, setShowGenreMenu] = useState(false);
    const [showYearMenu, setShowYearMenu] = useState(false);
    const [showLevelMenu, setShowLevelMenu] = useState(false);
    const filtersRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();
    const { lang, t } = useLanguage();

    const [heroIndex, setHeroIndex] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 18; // 9 rows of 2 items on mobile

    useEffect(() => {
        if (user?.role === 'admin' || user?.role === 'super_admin') {
            const fetchLive = () => {
                apiClient.get('/api/movies-live-viewers').then(res => {
                    setLiveViewers(res.data || {});
                }).catch(() => {});
            };
            fetchLive();
            const timer = setInterval(fetchLive, 5000);
            return () => clearInterval(timer);
        }
    }, [user?.role]);

    useEffect(() => {
        const lvl = searchParams.get('level');
        setSelectedLevel(lvl || '');
        const q = searchParams.get('q');
        if (q !== null) {
            setSearch(q);
        }
    }, [searchParams]);

    const getDescription = (movie: Movie) => {
        if (lang === 'ku' && movie.descriptionKu) return movie.descriptionKu;
        if (lang === 'en' && movie.descriptionEn) return movie.descriptionEn;
        if (lang === 'ar' && movie.descriptionAr) return movie.descriptionAr;
        return movie.description || '';
    };

    useEffect(() => {
        apiClient.get('/api/movies').then(res => {
            const data: Movie[] = res.data;
            if (Array.isArray(data)) {
                try {
                    localStorage.setItem('ks_cached_movies', JSON.stringify(data));
                } catch {}
            }
            const filteredData = filter ? data.filter(m => m.type === filter) : data;
            
            setMovies(filteredData);
            if (filteredData.length > 0) {
                setFeatured(filteredData[0]);
                if (filteredData.length > 1) {
                    setSecondary(filteredData[filteredData.length - 1]);
                } else {
                    setSecondary(null);
                }
            } else {
                setFeatured(null);
                setSecondary(null);
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [filter]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
                setShowGenreMenu(false);
                setShowYearMenu(false);
                setShowLevelMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Live filtering
    let filtered = movies.filter(m => {
        if (!search.trim()) return true;
        const query = search.trim().toLowerCase();
        const titleMatch = m.title?.toLowerCase().includes(query);
        const titleKuMatch = (m as any).titleKu?.toLowerCase().includes(query);
        const genreMatch = m.genre?.toLowerCase().includes(query);
        const actorsMatch = Array.isArray((m as any).actors) && (m as any).actors.some((a: string) => typeof a === 'string' && a.toLowerCase().includes(query));
        const directorMatch = typeof (m as any).director === 'string' && (m as any).director.toLowerCase().includes(query);
        return titleMatch || titleKuMatch || genreMatch || actorsMatch || directorMatch;
    });

    if (selectedGenres.length > 0) {
        filtered = filtered.filter(m => {
            if (!m.genre) return false;
            const lowerGenre = m.genre.toLowerCase();
            return selectedGenres.some(gId => {
                const item = GENRES.find(x => x.id === gId || x.ku === gId || x.en === gId);
                if (!item) return lowerGenre.includes(gId.toLowerCase());
                return lowerGenre.includes(item.ku.toLowerCase()) || lowerGenre.includes(item.en.toLowerCase());
            });
        });
    }

    if (selectedYear) {
        filtered = filtered.filter(m => m.year?.toString() === selectedYear);
    }

    if (selectedLevel) {
        const lvl = selectedLevel.trim();
        const lvlUpper = lvl.toUpperCase();
        const cefrMap: Record<string, string[]> = {
            'A1': ['A1', 'ئاسان'],
            'A2': ['A2', 'ئاسان'],
            'B1': ['B1', 'مامناوەند'],
            'B2': ['B2', 'مامناوەند'],
            'C1': ['C1', 'قورس'],
            'C2': ['C2', 'قورس'],
            'ئاسان': ['A1', 'A2', 'ئاسان'],
            'مامناوەند': ['B1', 'B2', 'مامناوەند'],
            'قورس': ['C1', 'C2', 'قورس']
        };
        const acceptable = (cefrMap[lvl] || cefrMap[lvlUpper] || [lvl, lvlUpper]).map(x => x.toUpperCase());
        filtered = filtered.filter(m => {
            const mCefr = m.languageMetrics?.cefrLevel?.toUpperCase();
            const mLevel = (m as any).level?.toString().toUpperCase();
            const mDirectCefr = (m as any).cefrLevel?.toString().toUpperCase();
            return (
                (mCefr && acceptable.includes(mCefr)) ||
                (mLevel && acceptable.includes(mLevel)) ||
                (mDirectCefr && acceptable.includes(mDirectCefr))
            );
        });
    }

    // Sort by live viewers or latest
    if (sortBy === 'views') {
        filtered.sort((a, b) => ((liveViewers[b.id] || 0) - (liveViewers[a.id] || 0) || (b.realViews ?? b.views ?? 0) - (a.realViews ?? a.views ?? 0) || (b.createdAt || 0) - (a.createdAt || 0)));
    } else {
        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    // Move watched movies to the bottom
    if (user?.watched && user.watched.length > 0) {
        const unwatched = filtered.filter(m => !user.watched?.includes(m.id));
        const watched = filtered.filter(m => user.watched?.includes(m.id));
        filtered = [...unwatched, ...watched];
    }

    const explicitFeatured = movies.filter(m => m.isFeatured && (m.posterCloudUrl || m.posterUrl));
    const heroMovies = explicitFeatured.length > 0
        ? explicitFeatured.slice(0, 10)
        : movies.filter(m => m.posterCloudUrl || m.posterUrl).length > 0
            ? movies.filter(m => m.posterCloudUrl || m.posterUrl).slice(0, 5)
            : movies.slice(0, 5);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, selectedGenres, selectedYear, selectedLevel, sortBy, filter]);

    useEffect(() => {
        if (heroMovies.length <= 1) return;
        const timer = setInterval(() => {
            setHeroIndex(prev => (prev + 1) % heroMovies.length);
        }, 6000);
        return () => clearInterval(timer);
    }, [heroMovies.length]);

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
    const paginatedMovies = filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        setCurrentPage(newPage);
        const section = document.querySelector('.section-header');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);
            
            for (let i = start; i <= end; i++) {
                if (!pages.includes(i)) pages.push(i);
            }
            
            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages;
    };

    const toggleGenre = (g: string) => {
        setSelectedGenres(prev => 
            prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
        );
    };

    const getLink = (movie: Movie) => `/movie/${movie.id}`;
    const getPoster = (movie: Movie) => movie.posterCloudUrl || movie.posterUrl;

    const currentHero = heroMovies[heroIndex] || featured;

    return (
        <div className={`home ${lang === 'en' ? 'ltr' : ''}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {/* Mobile Menu Overlay */}
            {(showGenreMenu || showLevelMenu) && (
                <div 
                    className="menu-overlay-mobile" 
                    onClick={() => {
                        setShowGenreMenu(false);
                        setShowLevelMenu(false);
                    }}
                />
            )}


            {currentHero && !loading && (
                <div className="hero-carousel">
                    <div className="hero">
                        <div className="hero-blur-bg" style={{ backgroundImage: getPoster(currentHero) ? `url(${getPoster(currentHero)})` : 'none' }} />
                        <div className="hero-overlay" />
                        
                        <div className="hero-container">
                            {/* Desktop Poster Card */}
                            {getPoster(currentHero) && (
                                <div className="hero-poster-desktop">
                                    <img src={getPoster(currentHero)} alt={currentHero.title} className="hero-poster-img" />
                                </div>
                            )}

                            {/* Content Side */}
                            <div className="hero-content animate-fade">
                                <h1 className="hero-title">{currentHero.title}</h1>
                                <div className="hero-meta">
                                    {currentHero.imdbRating && (
                                        <span className="hero-imdb-badge">
                                            <span className="imdb-label">IMDb</span> {currentHero.imdbRating} <Star size={14} fill="#fbbf24" color="#fbbf24" />
                                        </span>
                                    )}
                                    {currentHero.type === 'series' ? 
                                        <span className="hero-badge"><Layers size={12} /> {t('series')}</span> : 
                                     currentHero.type === 'animation' ? 
                                        <span className="hero-badge"><Film size={12} /> {t('animation')}</span> :
                                        <span className="hero-badge"><Film size={12} /> {t('movies')}</span>
                                    }
                                    {currentHero.year && <><span className="hero-separator">|</span><span>{currentHero.year}</span></>}
                                    {currentHero.duration && <><span className="hero-separator">|</span><span>{currentHero.duration}</span></>}
                                    {currentHero.genre && <><span className="hero-separator">|</span><span>{translateGenre(currentHero.genre, lang)}</span></>}
                                </div>
                                <Link to={getLink(currentHero)} className="btn-play">
                                    <Play size={20} fill="currentColor" /> {t('watch_now')}
                                </Link>
                            </div>
                        </div>
                        {heroMovies.length > 1 && (
                            <>
                                <button 
                                    className="hero-nav-btn hero-nav-prev" 
                                    onClick={() => setHeroIndex(prev => (prev - 1 + heroMovies.length) % heroMovies.length)} 
                                    aria-label="Previous"
                                    title={lang === 'en' ? 'Previous' : 'پێشوو'}
                                >
                                    <ChevronRight size={26} />
                                </button>
                                <button 
                                    className="hero-nav-btn hero-nav-next" 
                                    onClick={() => setHeroIndex(prev => (prev + 1) % heroMovies.length)} 
                                    aria-label="Next"
                                    title={lang === 'en' ? 'Next' : 'داهاتوو'}
                                >
                                    <ChevronLeft size={26} />
                                </button>
                            </>
                        )}
                        {heroMovies.length > 1 && (
                            <div className="hero-dots">
                                {heroMovies.map((_, i) => (
                                    <button
                                        key={i}
                                        className={`hero-dot ${i === heroIndex ? 'active' : ''}`}
                                        onClick={() => setHeroIndex(i)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!currentHero && !loading && (
                <div className="hero hero-empty">
                    <div className="hero-content hero-empty-content animate-fade">
                        <Film size={64} className="empty-hero-icon" />
                        <h1>KST</h1>
                        <p>{t('no_movies')}</p>
                    </div>
                </div>
            )}

            <div className="home-content">
                {user && user.history && Object.keys(user.history).length > 0 && (
                    <div style={{ marginBottom: '50px' }}>
                        <h2 className="section-title" style={{ marginBottom: '20px' }}>
                            {t('continue_watching')}
                        </h2>
                        <div className="continue-grid">
                            {Object.entries(user.history as Record<string, { time: number; title: string; date?: string }>)
                                .sort((a, b) => new Date(b[1].date || 0).getTime() - new Date(a[1].date || 0).getTime())
                                .slice(0, 4)
                                .map(([key, hist]) => {
                                    const match = key.match(/^(.+?)_s(\d+)_e(\d+)$/);
                                    let link = `#`;
                                    if (match) {
                                        const mId = match[1];
                                        const eNum = parseInt(match[3]);
                                        link = eNum > 0 ? `/watch/${mId}?s=${match[2]}&e=${eNum}` : `/watch/${mId}`;
                                    }
                                    
                                    const m = match ? movies.find(x => x.id === match[1]) : null;
                                    
                                    return (
                                        <Link to={link || "#"} key={key} className="history-card">
                                            <div className="history-poster-wrap">
                                                <OptimizedImage
                                                    src={m ? getPoster(m) : null}
                                                    alt={hist.title}
                                                    isThumbnail={true}
                                                    aspectRatio="16/9"
                                                    className="history-poster-img"
                                                />
                                                <div className="history-play-btn">
                                                    <Play size={22} fill="white" color="white" />
                                                </div>
                                                <div className="history-card-gradient" />
                                                <div className="history-card-info">
                                                    <h4 className="history-title">{hist.title}</h4>
                                                    <div className="history-sub-info">
                                                        <span>{match && parseInt(match[3]) > 0 ? `وەرز ${match[2]} - ئەڵقەی ${match[3]}` : t('movies')}</span>
                                                        {hist.time > 0 && <span className="history-time">له‌ خوله‌كی {Math.floor(hist.time / 60)}</span>}
                                                    </div>
                                                </div>
                                                <div className="history-progress-bar">
                                                    <div 
                                                        className="history-progress-fill" 
                                                        style={{ width: m?.duration && typeof m.duration === 'string' && m.duration.includes(':') ? `${Math.min(100, Math.max(5, (hist.time / (parseInt(m.duration.split(':')[0]) * 60 + parseInt(m.duration.split(':')[1]))) * 100))}%` : '50%' }} 
                                                    />
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* Level Assessment CTA Banner (Shown only if not taken or if 7 days passed) */}
                {(() => {
                    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
                    const lastAssessmentDate = user?.assessmentResult?.date || Number(localStorage.getItem('kurdish_stream_assessment_date') || 0);
                    const hasValidLevel = Boolean(user?.level || localStorage.getItem('kurdish_stream_user_level'));
                    const isRecentAssessment = hasValidLevel && (lastAssessmentDate > 0 ? (Date.now() - lastAssessmentDate < SEVEN_DAYS_MS) : true);

                    if (isRecentAssessment) return null;

                    return (
                        <div className="home-level-banner">
                            <div className="hlb-main">
                                <div className="hlb-icon">
                                    <Brain size={20} />
                                </div>
                                <div className="hlb-text">
                                    <h3 className="hlb-title">
                                        {lang === 'en' ? '🎯 Discover Your English Level' : '🎯 ئاستی زمانی ئینگلیزیت دیاری بکە'}
                                    </h3>
                                    <p className="hlb-desc">
                                        {lang === 'en' ? 'Take our 3-minute quiz for personalized movie recommendations.' : 'بە تاقیکردنەوەیەکی ٣ خولەکی فیلم و زنجیرەی گونجاو بە ئاستەکەت بدۆزەرەوە.'}
                                    </p>
                                </div>
                            </div>
                            <Link to="/assessment" className="hlb-btn">
                                <Sparkles size={14} />
                                <span>{lang === 'en' ? 'Start' : 'دەستپێکردن'}</span>
                            </Link>
                        </div>
                    );
                })()}

                <div className="section-header">
                    <div className="section-title-wrap">
                        <h2 className="section-title">
                            {filter === 'movie' ? t('movies') : filter === 'series' ? t('series') : filter === 'animation' ? t('animation') : t('movies')}
                        </h2>
                        {(user?.role === 'admin' || user?.role === 'super_admin') && (
                            <span className="count-badge">{filtered.length}</span>
                        )}
                    </div>

                    {/* Integrated Modern Filter Controls */}
                    <div className="section-filters-group" ref={filtersRef}>
                        <div className={`filter-dropdown ${showGenreMenu ? 'active' : ''}`}>
                            <button className={`filter-btn ${selectedGenres.length > 0 ? 'active' : ''}`} onClick={() => { setShowGenreMenu(!showGenreMenu); setShowLevelMenu(false); }} title={t('genres')}>
                                <Filter size={16} /> 
                                <span className="filter-btn-text">{t('genres')}</span> 
                                {selectedGenres.length > 0 && <span className="filter-badge">{selectedGenres.length}</span>} 
                                <ChevronDown size={14} className={`chevron ${showGenreMenu ? 'open' : ''}`} />
                            </button>
                            {showGenreMenu && (
                                <div className="filter-menu genre-menu modern-menu">
                                    <div className="menu-header">
                                        <span>{t('select_genre')}</span>
                                        {selectedGenres.length > 0 && <button className="clear-btn-small" onClick={() => setSelectedGenres([])}>{t('clear')}</button>}
                                    </div>
                                    <div className="genre-grid-modern">
                                        {GENRES.map(g => {
                                            const label = lang === 'en' ? g.en : g.ku;
                                            const isSelected = selectedGenres.includes(g.id);
                                            return (
                                                <label key={g.id} className={`filter-option modern-option ${isSelected ? 'selected' : ''}`}>
                                                    <input type="checkbox" checked={isSelected} onChange={() => toggleGenre(g.id)} />
                                                    <span>{label}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={`filter-dropdown ${showLevelMenu ? 'active' : ''}`}>
                            <button className={`filter-btn ${selectedLevel ? 'active' : ''}`} onClick={() => { setShowLevelMenu(!showLevelMenu); setShowGenreMenu(false); }} title={t('language_level')}>
                                <Layers size={16} /> 
                                <span className="filter-btn-text">{selectedLevel || t('language_level')}</span> 
                                {selectedLevel && <span className="filter-badge level-badge-dot">{selectedLevel}</span>}
                                <ChevronDown size={14} className={`chevron ${showLevelMenu ? 'open' : ''}`} />
                            </button>
                            {showLevelMenu && (
                                <div className="filter-menu year-menu modern-menu">
                                    <div className="menu-header">
                                        <span>{t('language_level')}</span>
                                        {selectedLevel && <button className="clear-btn-small" onClick={() => setSelectedLevel('')}>{t('clear')}</button>}
                                    </div>
                                    <div className="year-grid-modern">
                                        <label className={`year-btn-modern ${selectedLevel === '' ? 'active' : ''}`}>
                                            <input type="radio" name="level" checked={selectedLevel === ''} onChange={() => setSelectedLevel('')} style={{ display: 'none' }} />
                                            {t('all_filter')}
                                        </label>
                                        {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => (
                                            <label key={l} className={`year-btn-modern ${selectedLevel === l ? 'active' : ''}`}>
                                                <input type="radio" name="level" checked={selectedLevel === l} onChange={() => setSelectedLevel(l)} style={{ display: 'none' }} />
                                                {l}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Most Watched Button - Super Admin Only */}
                        {user?.role === 'super_admin' && (
                            <button 
                                type="button"
                                className={`filter-btn most-watched-btn ${sortBy === 'views' ? 'active' : ''}`}
                                onClick={() => setSortBy(prev => prev === 'views' ? 'latest' : 'views')}
                                title={lang === 'en' ? 'Sort by Most Watched (Super Admin Only)' : 'ڕیزبەندی بەپێی پڕبینەرترین (تەنها سەرۆک)'}
                            >
                                <Flame size={16} color={sortBy === 'views' ? '#f59e0b' : 'currentColor'} /> 
                                <span className="filter-btn-text">{lang === 'en' ? 'Most Watched' : 'پڕبینەرترین'}</span>
                            </button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="movies-grid">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="movie-card skeleton-card">
                                <div className="skeleton card-poster" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state" style={{ textAlign: 'center', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <Search size={48} style={{ opacity: 0.4 }} />
                        <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{t('not_found')}</h3>
                        {(search || selectedGenres.length > 0 || selectedYear || selectedLevel) && (
                            <button 
                                type="button"
                                onClick={() => {
                                    setSearch('');
                                    setSelectedGenres([]);
                                    setSelectedYear('');
                                    setSelectedLevel('');
                                }}
                                style={{
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    fontWeight: 700,
                                    fontSize: '13.5px',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(139, 92, 246, 0.35)'
                                }}
                            >
                                {lang === 'en' ? 'Reset All Filters & Show All' : 'پاککردنەوەی فلتەرەکان و پیشاندانی هەموو فیلمەکان 🔄'}
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="movies-grid animate-fade">
                            {paginatedMovies.map(movie => (
                                <Link to={getLink(movie)} key={movie.id} className="movie-card">
                                    <OptimizedImage
                                        src={getPoster(movie)}
                                        alt={movie.title}
                                        isThumbnail={true}
                                        className="card-poster"
                                    />
                                    <div className="movie-card-overlay">
                                        <div className="overlay-header">
                                            {movie.imdbRating ? (
                                                <div className="overlay-rating">
                                                    <Star size={13} fill="#fbbf24" color="#fbbf24" />
                                                    <span>{movie.imdbRating}</span>
                                                </div>
                                            ) : <div />}
                                            {(() => {
                                                const lvl = getCefrDisplayLevel(movie.level, movie.languageMetrics?.cefrLevel);
                                                if (!lvl) return null;
                                                const colorInfo = getCefrColor(lvl);
                                                return (
                                                    <div 
                                                        className="overlay-level-badge" 
                                                        style={{
                                                            background: colorInfo.bg,
                                                            color: colorInfo.text
                                                        }}
                                                    >
                                                        {lvl}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <p className="overlay-plot">
                                            {getDescription(movie).split('.')[0]}...
                                        </p>
                                    </div>
                                    <div className="movie-card-badges">
                                        {movie.imdbRating && <div className="card-badge"><Star size={10} fill="#fbbf24" color="#fbbf24" /> {movie.imdbRating}</div>}
                                    </div>
                                    {movie.year && <div className="card-badge-right">{movie.year}</div>}
                                    {user?.role === 'super_admin' && (
                                        <div className={`card-admin-views ${(liveViewers[movie.id] || 0) > 0 ? 'has-live' : 'is-zero'}`} title={lang === 'en' ? 'Live Viewers Right Now (Super Admin Only)' : 'بینەری ڕاستەوخۆ لەم چرکەیەدا (تەنها سەرۆک دەیبینێت)'}>
                                            <span className={`live-dot ${(liveViewers[movie.id] || 0) > 0 ? 'active-pulse' : 'idle'}`} />
                                            <span>{lang === 'en' ? 'Viewers ' : 'بینەر '}{liveViewers[movie.id] || 0}</span>
                                        </div>
                                    )}
                                </Link>
                            ))}
                        </div>

                        {/* Pagination Control Bar */}
                        {totalPages > 1 && (
                            <div className="pagination-container">
                                <button 
                                    className="pagination-btn pagination-nav" 
                                    disabled={currentPage === 1}
                                    onClick={() => handlePageChange(currentPage - 1)}
                                >
                                    {t('previous')}
                                </button>

                                <div className="pagination-numbers">
                                    {getPageNumbers().map((p, idx) => 
                                        typeof p === 'number' ? (
                                            <button
                                                key={idx}
                                                className={`pagination-btn pagination-num ${p === currentPage ? 'active' : ''}`}
                                                onClick={() => handlePageChange(p)}
                                            >
                                                {p}
                                            </button>
                                        ) : (
                                            <span key={idx} className="pagination-ellipsis">...</span>
                                        )
                                    )}
                                </div>

                                <button 
                                    className="pagination-btn pagination-nav" 
                                    disabled={currentPage === totalPages}
                                    onClick={() => handlePageChange(currentPage + 1)}
                                >
                                    {t('next')}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
