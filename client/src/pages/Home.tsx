import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Play, Clock, Calendar, Star, Film, Search, Layers, User } from 'lucide-react';
import { Movie } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './Home.css';

export default function Home({ filter }: { filter?: 'movie' | 'series' }) {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [featured, setFeatured] = useState<Movie | null>(null);
    const [secondary, setSecondary] = useState<Movie | null>(null);
    const { user } = useAuth();
    const { t } = useLanguage();

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

    const filtered = movies.filter(m =>
        m.title?.toLowerCase().includes(search.toLowerCase()) ||
        m.genre?.toLowerCase().includes(search.toLowerCase())
    );

    const getLink = (movie: Movie) =>
        movie.type === 'series' ? `/series/${movie.id}` : `/watch/${movie.id}`;

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
            </div>

            {featured && !loading && (
                <div className="hero-carousel">
                    <div className="hero" style={{ backgroundImage: featured.posterUrl ? `url(${featured.posterUrl})` : 'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)' }}>
                        <div className="hero-overlay" />
                        <div className="hero-content animate-fade">
                            <h1 className="hero-title">{featured.title}</h1>
                            <div className="hero-meta">
                                {featured.type === 'series' ? 
                                    <span className="hero-badge"><Layers size={12} /> {t('series')}</span> : 
                                    <span className="hero-badge"><Film size={12} /> {t('movies')}</span>
                                }
                                {featured.year && <span><Calendar size={14} />{featured.year}</span>}
                                {featured.duration && <span><Clock size={14} />{featured.duration}</span>}
                                {featured.genre && <span>{featured.genre}</span>}
                                <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                    <Star size={14} fill="currentColor" /> 7.3
                                </span>
                            </div>
                            <Link to={getLink(featured)} className="btn-play">
                                <Play size={20} fill="currentColor" /> سەیرکردن
                            </Link>
                        </div>
                    </div>
                    {secondary && (
                        <Link to={getLink(secondary)} className="hero-secondary" style={{ backgroundImage: secondary.posterUrl ? `url(${secondary.posterUrl})` : 'none' }}>
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
                                            {m && m.posterUrl && <div className="history-bg" style={{ backgroundImage: `url(${m.posterUrl})`}}></div>}
                                            <div className="history-card-inner">
                                                {m && m.posterUrl ? (
                                                    <img src={m.posterUrl} alt="" style={{width: '100px', height: '65px', borderRadius: '8px', objectFit: 'cover'}} />
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

                <div className="section-header">
                    <h2 className="section-title">
                        {filter === 'movie' ? t('movies') : filter === 'series' ? t('series') : t('popular_movies')}
                    </h2>
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
                                {movie.posterUrl ? (
                                    <img src={movie.posterUrl} alt={movie.title} className="card-poster" loading="lazy" />
                                ) : (
                                    <div className="card-poster" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a24' }}>
                                        <Film size={32} color="#475569" />
                                    </div>
                                )}
                                <div className="movie-card-badges">
                                    <div className="card-badge"><Star size={10} fill="#fbbf24" color="#fbbf24" /> 7.5</div>
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
