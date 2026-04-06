import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, Play, Film, Lock } from 'lucide-react';
import { Movie, Season, Episode } from '../types';
import './SeriesPage.css';

export default function SeriesPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [movie, setMovie] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSeason, setActiveSeason] = useState(1);

    useEffect(() => {
        axios.get(`/api/movies/${id}`).then(res => {
            setMovie(res.data);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="series-loading">
            <div className="loading-spinner" />
        </div>
    );

    if (!movie || movie.type !== 'series') {
        navigate('/');
        return null;
    }

    const seasons = movie.seasons || [];
    const currentSeason = seasons.find(s => s.number === activeSeason);

    return (
        <div className="series-page">
            {/* Hero Banner */}
            <div
                className="series-hero"
                style={{
                    backgroundImage: movie.posterUrl
                        ? `url(${movie.posterUrl})`
                        : 'linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 100%)'
                }}
            >
                <div className="series-hero-overlay" />
                <div className="series-hero-content">
                    <button className="series-back" onClick={() => navigate('/')}>
                        <ArrowRight size={18} /> گەرانەوە
                    </button>
                    <div className="series-info">
                        {movie.genre && <div className="series-badge">{movie.genre}</div>}
                        <h1 className="series-title">{movie.title}</h1>
                        {movie.description && (
                            <p className="series-desc">{movie.description}</p>
                        )}
                        <div className="series-meta">
                            {movie.year && <span>{movie.year}</span>}
                            <span>{seasons.length} سیزن</span>
                            <span>{seasons.reduce((acc, s) => acc + s.episodes.length, 0)} ئالقە</span>
                        </div>
                        {/* Play first episode button */}
                        {seasons[0]?.episodes[0] && (
                            <Link
                                to={`/watch/${id}?s=${seasons[0].number}&e=${seasons[0].episodes[0].number}`}
                                className="series-play-btn"
                            >
                                <Play size={20} fill="white" /> تماشا بکە
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* Season Tabs + Episodes */}
            <div className="series-content">
                {/* Season Tabs */}
                <div className="season-tabs-wrap">
                    <div className="season-tabs">
                        {seasons.map(season => (
                            <button
                                key={season.id}
                                className={`season-tab ${activeSeason === season.number ? 'active' : ''}`}
                                onClick={() => setActiveSeason(season.number)}
                            >
                                سیزنی {season.number}
                                <span className="ep-count">{season.episodes.length} ئالقە</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Season Title */}
                {currentSeason && (
                    <div className="season-header">
                        <h2 className="season-title">{currentSeason.title || `سیزنی ${currentSeason.number}`}</h2>
                    </div>
                )}

                {/* Episodes Grid */}
                {currentSeason && (
                    <div className="episodes-grid">
                        {currentSeason.episodes.map(episode => (
                            <EpisodeCard
                                key={episode.id}
                                episode={episode}
                                seriesId={id!}
                                seasonNum={activeSeason}
                                posterUrl={movie.posterUrl}
                            />
                        ))}
                    </div>
                )}

                {seasons.length === 0 && (
                    <div className="series-empty">
                        <Film size={48} />
                        <p>هیچ سیزنێک زیاد نەکراوە. بڕۆ بۆ پانێلی ئەدمین.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function EpisodeCard({
    episode,
    seriesId,
    seasonNum,
    posterUrl
}: {
    episode: Episode;
    seriesId: string;
    seasonNum: number;
    posterUrl: string;
}) {
    const hasVideo = !!episode.videoFile || !!episode.videoUrl;

    return (
        <div className={`episode-card ${!hasVideo ? 'no-video' : ''}`}>
            <div className="ep-thumb-wrap">
                {posterUrl ? (
                    <img src={posterUrl} alt={episode.title} className="ep-thumb" />
                ) : (
                    <div className="ep-thumb-placeholder"><Film size={28} /></div>
                )}
                <div className="ep-overlay">
                    {hasVideo ? (
                        <Link
                            to={`/watch/${seriesId}?s=${seasonNum}&e=${episode.number}`}
                            className="ep-play-btn"
                        >
                            <Play size={22} fill="white" />
                        </Link>
                    ) : (
                        <div className="ep-locked"><Lock size={20} /></div>
                    )}
                </div>
                <div className="ep-number-badge">ئالقەی {episode.number}</div>
                {episode.translatedSrt && (
                    <div className="ep-sub-badge">سەبتایتڵ</div>
                )}
            </div>
            <div className="ep-info">
                <h3 className="ep-title">{episode.title || `ئالقەی ${episode.number}`}</h3>
                {episode.duration && <span className="ep-duration">{episode.duration}</span>}
                {episode.description && <p className="ep-desc">{episode.description}</p>}
            </div>
        </div>
    );
}
