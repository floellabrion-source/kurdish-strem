import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Play, Heart, Clock, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Movie } from '../types';
import './MovieDetail.css';

export default function MovieDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, toggleList } = useAuth();
    const { lang } = useLanguage();
    const [movie, setMovie] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`/api/movies`)
            .then(res => {
                const found = res.data.find((m: Movie) => m.id === id);
                if (found) setMovie(found);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [id]);

    if (loading) return <div className="loading-state">چاوەڕوانبە...</div>;
    if (!movie) return <div className="error-state">فیلمەکە نەدۆزرایەوە.</div>;

    const isFavorite = user?.favorites?.includes(movie.id) || false;
    const isWatchLater = user?.watchLater?.includes(movie.id) || false;
    const isWatched = user?.watched?.includes(movie.id) || false;

    const handleAction = async (listName: 'favorites' | 'watchLater' | 'watched', redirectPath?: string) => {
        if (!user) {
            navigate('/auth');
            return;
        }
        await toggleList(listName, movie.id);
        if (redirectPath && !user[listName]?.includes(movie.id)) {
            // Only redirect if we are ADDING to the list, not removing
            navigate(redirectPath);
        }
    };

    const getDescription = () => {
        if (lang === 'en' && movie.descriptionEn) return movie.descriptionEn;
        if (lang === 'ar' && movie.descriptionAr) return movie.descriptionAr;
        if (lang === 'ku' && movie.descriptionKu) return movie.descriptionKu;
        return movie.description;
    };

    return (
        <div className="movie-detail-container">
            <div className="detail-backdrop" style={{ backgroundImage: `url(${movie.posterCloudUrl || movie.posterUrl})` }}></div>
            <div className="detail-content">
                <div className="detail-poster">
                    <img src={movie.posterCloudUrl || movie.posterUrl} alt={movie.title} />
                </div>
                <div className="detail-info">
                    <h1 className="detail-title">{movie.title}</h1>
                    <div className="detail-meta">
                        <span>{movie.year}</span>
                        <span>{movie.duration} خولەک</span>
                        <span>{movie.genre}</span>
                        {movie.imdbRating && <span className="rating">⭐ {movie.imdbRating}</span>}
                    </div>
                    <p className="detail-desc">{getDescription()}</p>

                    <div className="detail-actions">
                        <Link to={`/watch/${movie.id}`} className="action-btn watch-btn">
                            <Play size={20} fill="currentColor" />
                            سەیرکردن
                        </Link>
                        
                        <button 
                            className={`action-btn ${isFavorite ? 'active' : ''}`} 
                            onClick={() => handleAction('favorites', '/favorites')}
                        >
                            <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
                            لیستی دڵخواز
                        </button>
                        
                        <button 
                            className={`action-btn ${isWatchLater ? 'active' : ''}`} 
                            onClick={() => handleAction('watchLater', '/watch-later')}
                        >
                            <Clock size={20} fill={isWatchLater ? "currentColor" : "none"} />
                            بینینی دواتر
                        </button>

                        <button 
                            className={`action-btn ${isWatched ? 'active' : ''}`} 
                            onClick={() => handleAction('watched')}
                        >
                            <CheckCircle size={20} fill={isWatched ? "currentColor" : "none"} />
                            بینراو
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}