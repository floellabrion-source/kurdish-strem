import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Play, Clock, Calendar, Star, Film, Search, Layers, User, Filter, Eye, ChevronDown } from 'lucide-react';
import { Movie } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './Home.css';

const GENRES_LIST = [
    'تاوانکاری', 'دراما', 'زانستی خەیاڵی', 'هەستبزوێن', 'ئاکشن', 'سەرکێشی', 'خێزانی', 'خەیاڵی',
    'موزیک', 'مێژوویی', 'ترسناک', 'دۆکیۆمێنتاری', 'کۆمێدی', 'ڕۆژئاوایی', 'وەرزشی', 'پزیشکی',
    'کورتە', 'کۆمەڵایەتی', 'تراژیدی', 'سیخوڕی', 'کلاسیک', 'سامۆرای', 'بیۆگرافی', 'جەنگ'
];

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
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [featured, setFeatured] = useState<Movie | null>(null);
    const [secondary, setSecondary] = useState<Movie | null>(null);
    
    // Filters state
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [sortByViews, setSortByViews] = useState(false);
    const [showGenreMenu, setShowGenreMenu] = useState(false);
    const [showYearMenu, setShowYearMenu] = useState(false);
    const filtersRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();
    const { lang, t } = useLanguage();

    const getDescription = (movie: Movie) => {
        if (lang === 'ku' && movie.descriptionKu) return movie.descriptionKu;
        if (lang === 'en' && movie.descriptionEn) return movie.descriptionEn;
        if (lang === 'ar' && movie.descriptionAr) return movie.descriptionAr;
        return movie.description || '';
    };

    useEffect(() => {
        axios.get('/api/movies').then(res => {
            const data: Movie[] = res.data;
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
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    let filtered = movies.filter(m =>
        m.title?.toLowerCase().includes(search.toLowerCase()) ||
        m.genre?.toLowerCase().includes(search.toLowerCase())
    );

    if (selectedGenres.length > 0) {
        filtered = filtered.filter(m => selectedGenres.some(g => m.genre?.includes(g)));
    }

    if (selectedYear) {
        filtered = filtered.filter(m => m.year?.toString() === selectedYear);
    }

    if (sortByViews) {
        // Just sort by views if we have them, else sort by ID or a dummy metric
        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    const toggleGenre = (g: string) => {
        setSelectedGenres(prev => 
            prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
        );
    };

    const getLink = (movie: Movie) =>
        movie.type === 'series' ? `/series/${movie.id}` : `/watch/${movie.id}`;
    const getPoster = (movie: Movie) => movie.posterCloudUrl || movie.posterUrl;

    return (
        <div className="home">
            {/* Top Search Bar placed at absolute top left */}
            <div className="top-search-area">
                <div className="search-box">
                    <Search size={16} className="search-icon" />
                    <input 
                        type="text" 
                        placeholder={t('search_placeholder')} 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                        className="search-input" 
                    />
                </div>
                
                {/* Filters Section */}
                <div className="filters-right" ref={filtersRef}>
                    <div className="filter-dropdown">
                        <button className="filter-btn" onClick={() => { setShowGenreMenu(!showGenreMenu); setShowYearMenu(false); }}>
                            <Filter size={16} /> چەشنەکان <ChevronDown size={14} />
                        </button>
                        {showGenreMenu && (
                            <div className="filter-menu genre-menu">
                                {GENRES_LIST.map(g => (
                                    <label key={g} className="filter-option">
                                        <input type="checkbox" checked={selectedGenres.includes(g)} onChange={() => toggleGenre(g)} />
                                        <span>{g}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="filter-dropdown">
                        <button className="filter-btn" onClick={() => { setShowYearMenu(!showYearMenu); setShowGenreMenu(false); }}>
                            <Calendar size={16} /> ساڵ <ChevronDown size={14} />
                        </button>
                        {showYearMenu && (
                            <div className="filter-menu year-menu">
                                <label className="filter-option">
                                    <input type="radio" name="year" checked={selectedYear === ''} onChange={() => setSelectedYear('')} />
                                    <span>هەموو</span>
                                </label>
                                {YEARS_LIST.map(y => (
                                    <label key={y} className="filter-option">
                                        <input type="radio" name="year" checked={selectedYear === y} onChange={() => setSelectedYear(y)} />
                                        <span>{y}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <button className={`filter-btn ${sortByViews ? 'active' : ''}`} onClick={() => setSortByViews(!sortByViews)}>
                        <Eye size={16} /> پڕبینەرترین
                    </button>
                </div>
            </div>

            {featured && !loading && (
                <div className="hero-carousel">
                    <div className="hero" style={{ backgroundImage: getPoster(featured) ? `url(${getPoster(featured)})` : 'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)' }}>
                        <div className="hero-overlay" />
                        <div className="hero-content animate-fade">
                            <h1 className="hero-title">{featured.title}</h1>
                            <div className="hero-meta">
                                {featured.type === 'series' ? 
                                    <span className="hero-badge"><Layers size={12} /> {t('series')}</span> : 
                                 featured.type === 'animation' ? 
                                    <span className="hero-badge"><Film size={12} /> {t('animation')}</span> :
                                    <span className="hero-badge"><Film size={12} /> {t('movies')}</span>
                                }
                                {featured.year && <span><Calendar size={14} />{featured.year}</span>}
                                {featured.duration && <span><Clock size={14} />{featured.duration}</span>}
                                {featured.genre && <span>{featured.genre}</span>}
                                {featured.language && <span>{featured.language.split(',')[0]}</span>}
                                {featured.imdbRating && (
                                    <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                        <Star size={14} fill="currentColor" /> {featured.imdbRating}
                                    </span>
                                )}
                            </div>
                            <Link to={getLink(featured)} className="btn-play">
                                <Play size={20} fill="currentColor" /> سەیرکردن
                            </Link>
                        </div>
                    </div>
                    {secondary && (
                        <Link to={getLink(secondary)} className="hero-secondary" style={{ backgroundImage: getPoster(secondary) ? `url(${getPoster(secondary)})` : 'none' }}>
                             <div className="hero-overlay" style={{ background: 'linear-gradient(to top, rgba(9, 9, 11, 0.9) 0%, transparent 50%)' }} />
                        </Link>
                    )}
                </div>
            )}

            {!featured && !loading && (
                <div className="hero hero-empty">
                    <div className="hero-content hero-empty-content animate-fade">
                        <Film size={64} className="empty-hero-icon" />
                        <h1>Kurdish Stream</h1>
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
                                .slice(0, 3)
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
                                            {m && getPoster(m) && <div className="history-bg" style={{ backgroundImage: `url(${getPoster(m)})`}}></div>}
                                            <div className="history-card-inner">
                                                {m && getPoster(m) ? (
                                                    <img src={getPoster(m)} alt="" style={{width: '100px', height: '65px', borderRadius: '8px', objectFit: 'cover'}} />
                                                ) : (
                                                    <div style={{width: '100px', height: '65px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                                        <Film size={20} color="#64748b" />
                                                    </div>
                                                )}
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                        <span style={{ fontSize: '11px', color: '#e2e8f0', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '100px' }}>
                                                            {match && parseInt(match[3]) > 0 ? `S${match[2]}E${match[3]}` : t('movies')}
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('time')} {Math.floor(hist.time / 60)}:{String(hist.time % 60).padStart(2, '0')}</span>
                                                    </div>
                                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{hist.title}</h4>
                                                    <div style={{ background: 'rgba(255,255,255,0.1)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                                                        <div style={{ background: '#e4e4e7', width: m?.duration && typeof m.duration === 'string' && m.duration.includes(':') ? `${(hist.time / (parseInt(m.duration.split(':')[0]) * 60 + parseInt(m.duration.split(':')[1]))) * 100}%` : '50%', height: '100%' }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                        </div>
                    </div>
                )}

                <div className="section-header-filters" ref={filtersRef}>
                    <div className="filters-left">
                        <div className="filter-dropdown">
                            <button 
                                className={`filter-btn ${selectedGenres.length > 0 ? 'active' : ''}`}
                                onClick={() => { setShowGenreMenu(!showGenreMenu); setShowYearMenu(false); }}
                            >
                                <Filter size={16} /> چەشنەکان <ChevronDown size={14} />
                            </button>
                            {showGenreMenu && (
                                <div className="filter-menu genre-menu">
                                    <div className="filter-menu-header">چەشنەکان هەڵبژێرە</div>
                                    <div className="genre-grid">
                                        {GENRES_LIST.map(g => (
                                            <label key={g} className="genre-label">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedGenres.includes(g)}
                                                    onChange={() => toggleGenre(g)}
                                                />
                                                <span className="checkbox-custom"></span>
                                                {g}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="filter-actions">
                                        <button className="clear-btn" onClick={() => setSelectedGenres([])}>سڕینەوە</button>
                                        <button className="apply-btn" onClick={() => setShowGenreMenu(false)}>جێبەجێکردن</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="filter-dropdown">
                            <button 
                                className={`filter-btn ${selectedYear ? 'active' : ''}`}
                                onClick={() => { setShowYearMenu(!showYearMenu); setShowGenreMenu(false); }}
                            >
                                <Calendar size={16} /> ساڵ <ChevronDown size={14} />
                            </button>
                            {showYearMenu && (
                                <div className="filter-menu year-menu">
                                    <div className="filter-menu-header">ساڵ هەڵبژێرە</div>
                                    <div className="year-grid">
                                        <button 
                                            className={`year-btn ${selectedYear === '' ? 'active' : ''}`}
                                            onClick={() => { setSelectedYear(''); setShowYearMenu(false); }}
                                        >
                                            هەمووی
                                        </button>
                                        {YEARS_LIST.map(y => (
                                            <button 
                                                key={y} 
                                                className={`year-btn ${selectedYear === y ? 'active' : ''}`}
                                                onClick={() => { setSelectedYear(y); setShowYearMenu(false); }}
                                            >
                                                {y}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button 
                            className={`filter-btn ${sortByViews ? 'active' : ''}`}
                            onClick={() => setSortByViews(!sortByViews)}
                        >
                            <Eye size={16} /> پڕبینەرترین
                        </button>
                    </div>

                    <div className="filters-right">
                        <span className="count-badge">{filtered.length}</span>
                        <h2 className="section-title" style={{ margin: 0 }}>
                            {filter === 'movie' ? t('movies') : filter === 'series' ? t('series') : filter === 'animation' ? t('animation') : t('popular_movies')}
                        </h2>
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
                    <div className="empty-state" style={{ textAlign: 'center', padding: '60px', opacity: 0.5 }}>
                        <Search size={48} style={{ marginBottom: '16px' }} />
                        <h3>{t('not_found')}</h3>
                    </div>
                ) : (
                    <div className="movies-grid animate-fade">
                        {filtered.map(movie => (
                            <Link to={getLink(movie)} key={movie.id} className="movie-card">
                                {getPoster(movie) ? (
                                    <img src={getPoster(movie)} alt={movie.title} className="card-poster" loading="lazy" />
                                ) : (
                                    <div className="card-poster" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a24' }}>
                                        <Film size={32} color="#475569" />
                                    </div>
                                )}
                                <div className="movie-card-badges">
                                    {movie.imdbRating && <div className="card-badge"><Star size={10} fill="#fbbf24" color="#fbbf24" /> {movie.imdbRating}</div>}
                                    <div className="card-badge">{movie.year || '2025'}</div>
                                </div>
                                <div className="card-play-btn">
                                    <Play size={24} fill="currentColor" style={{ marginLeft: '4px' }} />
                                </div>
                                {/* Clean bottom padding if needed, but modern cards often just show poster */}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
