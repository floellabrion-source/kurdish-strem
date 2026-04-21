import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Play, Heart, Clock, CheckCircle, Eye, Globe, Bookmark, Star, ArrowLeft } from 'lucide-react';
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

    const [activeSeason, setActiveSeason] = useState<number>(1);

    useEffect(() => {
        axios.get(`/api/movies`)
            .then(res => {
                const found = res.data.find((m: Movie) => m.id === id);
                if (found) {
                    setMovie(found);
                    if (found.type === 'series' && found.seasons && found.seasons.length > 0) {
                        setActiveSeason(found.seasons[0].number);
                    }
                }
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

    const getSmartTagline = () => {
        const raw = (getDescription() || '').replace(/\s+/g, ' ').trim();
        if (!raw) return 'هیچ باسێکی کورت نییە.';

        const firstSentence = raw.split(/[.!؟]/)[0]?.trim() || raw;
        const candidate = firstSentence || raw;
        const maxChars = 95;

        if (candidate.length <= maxChars) return candidate;

        const sliced = candidate.slice(0, maxChars);
        const lastSpace = sliced.lastIndexOf(' ');
        const clean = lastSpace > 85 ? sliced.slice(0, lastSpace) : sliced;
        return `${clean}...`;
    };

    const isSeries = movie.type === 'series';
    const seasons = movie.seasons || [];
    const totalEpisodes = seasons.reduce((acc, s) => acc + s.episodes.length, 0);
    const activeSeasonData = seasons.find(s => s.number === activeSeason);

    const isEpisodeWatched = (seasonNum: number, epNum: number) => {
        if (!user || !user?.history) return false;
        const key = `${movie.id}_s${seasonNum}_e${epNum}`;
        return !!user.history[key];
    };

    const goBackSafely = () => {
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate('/');
    };

    return (
        <div className="movie-detail-container">
            <div className="detail-hero" style={{ backgroundImage: `url(${movie.posterCloudUrl || movie.posterUrl})` }}>
                <div className="detail-hero-overlay"></div>
                <div className="detail-hero-content">
                    <button type="button" className="back-btn" onClick={goBackSafely}>
                        <ArrowLeft size={16} />
                        گەڕانەوە
                    </button>
                    <h1 className="detail-title">{movie.title}</h1>
                    <div className="detail-meta">
                        <span>{movie.genre || 'نەزانراو'}</span>
                        {movie.year && <span>{movie.year}</span>}
                        {movie.duration && <span>{movie.duration}</span>}
                        {movie.imdbRating && <span className="rating"><Star size={13} fill="currentColor" /> {movie.imdbRating}</span>}
                    </div>
                    <p className="detail-tagline">{getSmartTagline()}</p>

                    <div className="detail-actions">
                        {isSeries && seasons[0]?.episodes[0] ? (
                            <Link to={`/watch/${movie.id}?s=${seasons[0].number}&e=${seasons[0].episodes[0].number}`} className="action-btn watch-btn">
                                <Play size={19} fill="currentColor" />
                                سەیرکردن
                            </Link>
                        ) : (
                            <Link to={`/watch/${movie.id}`} className="action-btn watch-btn">
                                <Play size={19} fill="currentColor" />
                                سەیرکردن
                            </Link>
                        )}
                    </div>

                    <div className="quick-actions">
                        <button className={`quick-btn ${isFavorite ? 'active' : ''}`} onClick={() => handleAction('favorites', '/favorites')}>
                            <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} /> لیستی دڵخواز
                        </button>
                        <button className={`quick-btn ${isWatchLater ? 'active' : ''}`} onClick={() => handleAction('watchLater', '/watch-later')}>
                            <Bookmark size={16} fill={isWatchLater ? 'currentColor' : 'none'} /> بینینی دواتر
                        </button>
                        <button className={`quick-btn ${isWatched ? 'active' : ''}`} onClick={() => handleAction('watched')}>
                            <CheckCircle size={16} fill={isWatched ? 'currentColor' : 'none'} /> بینراو
                        </button>
                    </div>
                </div>
            </div>

            <div className="detail-content">
                <div className="detail-poster">
                    <img src={movie.posterCloudUrl || movie.posterUrl} alt={movie.title} />
                </div>
                <div className="detail-info">
                    <div className="detail-pills">
                        <span><Globe size={14} /> {movie.language?.split(',')[0] || 'N/A'}</span>
                        {movie.imdbRating && <span><Star size={14} fill="currentColor" /> IMDb {movie.imdbRating}</span>}
                        <span><Eye size={14} /> {user?.history && Object.keys(user.history).length ? Object.keys(user.history).length : 0}</span>
                        <span><Clock size={14} /> {movie.duration || 'N/A'}</span>
                    </div>
                    {isSeries && (
                        <div className="series-stats">
                            <div className="stat-box">
                                <span className="stat-value">{movie.endYear ? 'تەواو بووە' : 'بەردەوامە'}</span>
                                <span className="stat-label">باری</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{totalEpisodes}</span>
                                <span className="stat-label">ئەڵقە</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{seasons.length}</span>
                                <span className="stat-label">وەرز</span>
                            </div>
                        </div>
                    )}
                    <h3 className="section-heading">چیرۆک</h3>
                    <p className="detail-desc">{getDescription()}</p>
                </div>
            </div>

            {isSeries && seasons.length > 0 && (
                <div className="series-episodes-section">
                    <div className="season-tabs">
                        {seasons.map(season => (
                            <button 
                                key={season.id} 
                                className={`season-tab ${activeSeason === season.number ? 'active' : ''}`}
                                onClick={() => setActiveSeason(season.number)}
                            >
                                وەرز {season.number}
                            </button>
                        ))}
                    </div>
                    
                    <div className="episodes-list">
                        {activeSeasonData?.episodes.map(ep => {
                            const watched = isEpisodeWatched(activeSeason, ep.number);
                            return (
                                <Link to={`/watch/${movie.id}?s=${activeSeason}&e=${ep.number}`} key={ep.id} className={`episode-card ${watched ? 'watched' : ''}`}>
                                    <div className="episode-thumb">
                                        <img src={movie.posterCloudUrl || movie.posterUrl} alt={ep.title} />
                                        <div className="episode-number">{ep.number}</div>
                                        {watched && (
                                            <div className="episode-watched-badge">
                                                <CheckCircle size={14} fill="currentColor" /> بینراوە
                                            </div>
                                        )}
                                        <div className="play-overlay"><Play size={24} fill="currentColor" /></div>
                                    </div>
                                    <div className="episode-info">
                                        <h4>{ep.title}</h4>
                                        <p>{ep.duration} خولەک</p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
