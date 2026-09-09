import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Play, Film, Star, Clock, ArrowRight } from 'lucide-react';
import { Movie } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import '../pages/Home.css';

export default function WatchLater() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { t, lang } = useLanguage();
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        
        axios.get('/api/movies').then(res => {
            const data: Movie[] = res.data;
            const watchLaterIds = user.watchLater || [];
            setMovies(data.filter(m => watchLaterIds.includes(m.id)));
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [user]);

    if (!user) return <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text)' }}>{lang === 'en' ? 'Please log in...' : 'تکایە خۆت تۆمار بکە...'}</div>;

    const isRtl = lang === 'ku' || lang === 'ar';
    const BackIcon = ArrowRight;

    return (
        <div className="home-container" style={{ minHeight: '100vh', paddingBottom: '50px' }}>
            {/* Custom Header with Back Button */}
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '16px', 
                padding: '30px 40px 10px',
                position: 'relative',
                zIndex: 10
            }}>
                <button 
                    onClick={() => navigate(-1)}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                    <BackIcon size={20} style={{ transform: isRtl ? 'none' : 'rotate(180deg)' }} />
                </button>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text)' }}>
                    <Clock size={28} color="#3b82f6" />
                    {t('watch_later')}
                </h1>
            </div>

            <div className="home-content" style={{ paddingTop: '20px' }}>
                <div className="section-header">
                    <span style={{ color: 'var(--text3)', fontSize: '14px' }}>
                        {lang === 'en' ? `${movies.length} titles in your list` : `${movies.length} فیلم لە لیستەکەتدا هەیە`}
                    </span>
                </div>

                {loading ? (
                    <div className="movies-grid">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="movie-card skeleton-card">
                                <div className="skeleton card-poster" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                            </div>
                        ))}
                    </div>
                ) : movies.length === 0 ? (
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '80px 20px', 
                        background: 'rgba(255,255,255,0.03)', 
                        borderRadius: '24px',
                        border: '1px dashed var(--border)'
                    }}>
                        <Clock size={64} color="#3b82f6" style={{ marginBottom: '20px', opacity: 0.6 }} />
                        <h3 style={{ fontSize: '20px', color: 'var(--text)', marginBottom: '10px' }}>{t('no_watch_later')}</h3>
                        <p style={{ color: 'var(--text3)', marginBottom: '20px' }}>{lang === 'en' ? 'You can add movies and series to this list to watch them later.' : 'دەتوانیت فیلمەکان زیاد بکەیت بۆ ئەم لیستە بۆ ئەوەی دواتر سەیریان بکەیت.'}</p>
                        <button 
                            onClick={() => navigate('/')}
                            style={{
                                background: 'var(--accent)',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '12px',
                                fontSize: '15px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            {lang === 'en' ? 'Browse Titles' : 'گەڕان بەدوای فیلمدا'}
                        </button>
                    </div>
                ) : (
                    <div className="movies-grid animate-fade">
                        {movies.map(movie => (
                            <Link to={`/movie/${movie.id}`} key={movie.id} className="movie-card">
                                {movie.posterCloudUrl || movie.posterUrl ? (
                                    <img src={movie.posterCloudUrl || movie.posterUrl} alt={movie.title} className="card-poster" loading="lazy" />
                                ) : (
                                    <div className="card-poster" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a24' }}>
                                        <Film size={32} color="#475569" />
                                    </div>
                                )}
                                <div className="movie-card-overlay">
                                    {movie.imdbRating && (
                                        <div className="overlay-rating">
                                            <Star size={16} fill="#fbbf24" color="#fbbf24" />
                                            <span>{movie.imdbRating}</span>
                                        </div>
                                    )}
                                    <p className="overlay-plot">
                                        {(movie.descriptionKu || movie.description || '').split('.')[0]}...
                                    </p>
                                </div>
                                <div className="movie-card-badges">
                                    {movie.imdbRating && <div className="card-badge"><Star size={10} fill="#fbbf24" color="#fbbf24" /> {movie.imdbRating}</div>}
                                    <div className="card-badge">{movie.year || '2025'}</div>
                                </div>
                                <div className="card-play-btn">
                                    <Play size={24} fill="currentColor" style={{ marginLeft: '4px' }} />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
