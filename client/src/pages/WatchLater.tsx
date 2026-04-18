import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Play, Film, Star, Clock } from 'lucide-react';
import { Movie } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import '../pages/Home.css';

export default function WatchLater() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { t } = useLanguage();

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

    if (!user) return <div style={{ padding: '50px', textAlign: 'center', color: 'white' }}>تکایە خۆت تۆمار بکە...</div>;

    return (
        <div className="home-container">
            <div className="main-content" style={{ paddingTop: '80px' }}>
                <div className="section-header">
                    <h2 className="section-title">
                        <Clock size={24} style={{ marginRight: '10px' }} />
                        بینینی دواتر
                    </h2>
                    <span className="count-badge">{movies.length}</span>
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
                    <div className="empty-state" style={{ textAlign: 'center', padding: '60px', opacity: 0.5, color: 'white' }}>
                        <h3>هیچ فیلمێک لە لیستی بینینی دواتر نییە</h3>
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