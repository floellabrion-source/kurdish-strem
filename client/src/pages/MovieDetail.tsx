import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Play, Heart, Clock, CheckCircle, Eye, Globe, Bookmark, Star, ArrowLeft, ArrowRight, MessageSquare, Send, Share2, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Movie, LanguageMetrics, getCefrDisplayLevel, getCefrColor } from '../types';
import './MovieDetail.css';

const CEFR_PRESETS: Record<string, LanguageMetrics['distribution']> = {
    A1: { A1: 55, A2: 25, B1: 10, B2: 5, C1: 3, C2: 1, Unknown: 1 },
    A2: { A1: 43, A2: 30, B1: 13, B2: 6, C1: 3, C2: 2, Unknown: 3 },
    B1: { A1: 27, A2: 29, B1: 21, B2: 11, C1: 5, C2: 3, Unknown: 4 },
    B2: { A1: 16, A2: 23, B1: 24, B2: 18, C1: 10, C2: 5, Unknown: 4 },
    C1: { A1: 9, A2: 15, B1: 21, B2: 23, C1: 17, C2: 9, Unknown: 6 },
    C2: { A1: 5, A2: 10, B1: 15, B2: 25, C1: 25, C2: 15, Unknown: 5 }
};

function normalizeLanguageMetrics(input: any): LanguageMetrics | null {
    if (!input) return null;

    const dist: any = input.distribution || {};
    const distribution = {
        A1: Number(dist.A1 ?? 0),
        A2: Number(dist.A2 ?? 0),
        B1: Number(dist.B1 ?? 0),
        B2: Number(dist.B2 ?? 0),
        C1: Number(dist.C1 ?? 0),
        C2: Number(dist.C2 ?? 0),
        Unknown: Number(dist.Unknown ?? 0)
    };

    const rawCefr = String(input.cefrLevel || '').toUpperCase().trim();
    const allowed = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const cefr = allowed.includes(rawCefr) ? rawCefr : 'B1';

    const totalWords = Number(input.totalWords ?? input.vocabularyCount ?? 0) || 1200;
    const lexicalDensity = Number(input.lexicalDensity ?? input.readabilityScore ?? 0) || 45;
    const vocabDiversity = Number(input.vocabDiversity ?? input.readabilityScore ?? 0) || 40;

    return {
        totalWords,
        lexicalDensity,
        vocabDiversity,
        cefrLevel: cefr as any,
        distribution: (distribution.A1 || distribution.A2 || distribution.B1 || distribution.B2 || distribution.C1 || distribution.C2) 
            ? distribution 
            : (CEFR_PRESETS[cefr] || CEFR_PRESETS['B1']),
        difficultWords: Array.isArray(input.difficultWords) ? input.difficultWords : [],
        repeatedWords: Array.isArray(input.repeatedWords) ? input.repeatedWords : []
    };
}

function buildLanguageMetrics(text: string, isSeries: boolean, level?: string): LanguageMetrics {
    const words = (text.toLowerCase().match(/[\p{L}']+/gu) || []).filter(Boolean);
    const totalWords = Math.max(1, words.length);
    const uniqueWords = new Set(words).size;

    const lexicalDensity = Math.min(85, Math.max(22, Math.round((uniqueWords / totalWords) * 100 + 10)));
    const vocabDiversity = Math.min(80, Math.max(18, Math.round((uniqueWords / totalWords) * 100 - 4)));
    const score = lexicalDensity * 0.5 + vocabDiversity * 0.35 + (isSeries ? 6 : 10);
    const autoLevel = score < 40 ? 'A2' : score < 48 ? 'B1' : score < 60 ? 'B2' : 'C1';
    const mapped = getCefrDisplayLevel(level);
    const cefrLevel = (mapped && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(mapped)) ? mapped : autoLevel;

    const distribution = CEFR_PRESETS[cefrLevel] || CEFR_PRESETS['B1'];

    return { totalWords, lexicalDensity, vocabDiversity, cefrLevel: cefrLevel as any, distribution };
}

export default function MovieDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, toggleList } = useAuth();
    const { lang, t } = useLanguage();
    const [movie, setMovie] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);

    const [activeSeason, setActiveSeason] = useState<number>(1);
    
    // Comments state
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState('');
    const [commentRating, setCommentRating] = useState(5);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    // Language Metrics word expansion toggles
    const [showAllDifficult, setShowAllDifficult] = useState(false);
    const [showAllRepeated, setShowAllRepeated] = useState(false);

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

        axios.get(`/api/movies/${id}/comments`)
            .then(res => setComments(res.data || []))
            .catch(() => {});
    }, [id]);

    const submitComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            navigate('/auth');
            return;
        }
        if (!newComment.trim()) return;
        
        setIsSubmittingComment(true);
        try {
            const res = await axios.post(`/api/movies/${id}/comments`, {
                text: newComment,
                rating: commentRating
            });
            setComments(res.data.comments);
            setNewComment('');
            setCommentRating(5);
        } catch (err) {
            console.error('Failed to submit comment', err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    if (loading) return <div className="loading-state">{t('loading')}</div>;
    if (!movie) return <div className="error-state">{t('movie_not_found')}</div>;

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
    // Function to calculate aggregate language metrics for a series
    const getAggregateMetrics = () => {
        const manualMetrics = normalizeLanguageMetrics(movie.languageMetrics);
        const fallbackMetrics = manualMetrics || buildLanguageMetrics(getDescription(), isSeries, movie.level);

        if (!isSeries || seasons.length === 0) {
            return fallbackMetrics;
        }

        const allEpisodes = seasons.flatMap(s => s.episodes || []);
        const epsWithMetrics = allEpisodes.filter(ep => {
            if (!ep.languageMetrics) return false;
            const m = ep.languageMetrics;
            // Be more lenient in checking if metrics exist
            const words = typeof m.totalWords === 'string' 
                ? parseInt((m.totalWords as string).replace(/[^\d]/g, '')) 
                : Number(m.totalWords);
            return words > 0 || (m.distribution && Object.values(m.distribution).some(v => Number(v) > 0));
        });
        
        if (epsWithMetrics.length === 0) {
            return fallbackMetrics;
        }

        let totalWords = 0;
        let totalLexical = 0;
        let totalDiversity = 0;
        let dist = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, Unknown: 0 };
        
        const wordFrequencies: Record<string, number> = {};
        const wordMeanings: Record<string, string> = {};
        const difficultWordsMap = new Map();

        let count = 0;

        epsWithMetrics.forEach(ep => {
            const m = ep.languageMetrics;
            if (!m) return;
            count++;
            
            const epWords = typeof m.totalWords === 'string' 
                ? parseInt((m.totalWords as string).replace(/[^\d]/g, '')) 
                : Number(m.totalWords);
            
            totalWords += (epWords || 0);
            totalLexical += (Number(m.lexicalDensity) || 0);
            totalDiversity += (Number(m.vocabDiversity) || 0);
            
            dist.A1 += (Number(m.distribution?.A1) || 0);
            dist.A2 += (Number(m.distribution?.A2) || 0);
            dist.B1 += (Number(m.distribution?.B1) || 0);
            dist.B2 += (Number(m.distribution?.B2) || 0);
            dist.C1 += (Number(m.distribution?.C1) || 0);
            dist.C2 += (Number(m.distribution?.C2) || 0);
            dist.Unknown += (Number(m.distribution?.Unknown) || 0);

            if (m.repeatedWords && Array.isArray(m.repeatedWords)) {
                m.repeatedWords.forEach((rw: any) => {
                    if (rw.word) {
                        const rwCount = typeof rw.count === 'string' ? parseInt(rw.count.replace(/[^\d]/g, '')) : Number(rw.count);
                        wordFrequencies[rw.word] = (wordFrequencies[rw.word] || 0) + (rwCount || 0);
                        if (rw.meaning) wordMeanings[rw.word] = rw.meaning;
                    }
                });
            }

            if (m.difficultWords && Array.isArray(m.difficultWords)) {
                m.difficultWords.forEach((dw: any) => {
                    if (dw.word && !difficultWordsMap.has(dw.word)) {
                        difficultWordsMap.set(dw.word, dw);
                    }
                });
            }
        });

        if (count === 0) return fallbackMetrics;
        
        const aggregatedRepeatedWords = Object.keys(wordFrequencies).map(word => ({
            word,
            count: wordFrequencies[word],
            meaning: wordMeanings[word] || ''
        })).sort((a, b) => b.count - a.count).slice(0, 20); // Keep top 20 for series

        const avgDist = {
            A1: Number((dist.A1 / count).toFixed(1)),
            A2: Number((dist.A2 / count).toFixed(1)),
            B1: Number((dist.B1 / count).toFixed(1)),
            B2: Number((dist.B2 / count).toFixed(1)),
            C1: Number((dist.C1 / count).toFixed(1)),
            C2: Number((dist.C2 / count).toFixed(1)),
            Unknown: Number((dist.Unknown / count).toFixed(1))
        };

        // Re-normalize avgDist to sum to ~100% if possible, but simple average is usually fine
        
        let calculatedLevel = 'A1';
        if (avgDist.C2 > 0.5) calculatedLevel = 'C2';
        else if (avgDist.C1 > 1) calculatedLevel = 'C1';
        else if (avgDist.B2 > 3) calculatedLevel = 'B2';
        else if (avgDist.B1 > 7) calculatedLevel = 'B1';
        else if (avgDist.A2 > 12) calculatedLevel = 'A2';

        return {
            totalWords,
            lexicalDensity: Math.round(totalLexical / count),
            vocabDiversity: Math.round(totalDiversity / count),
            cefrLevel: calculatedLevel as any,
            distribution: avgDist,
            repeatedWords: aggregatedRepeatedWords,
            difficultWords: Array.from(difficultWordsMap.values()).slice(0, 15) // Top 15 diff words
        };
    };

    const metrics = getAggregateMetrics();

    const isEpisodeWatched = (seasonNum: number, epNum: number) => {
        if (!user || !user?.history) return false;
        const key = `${movie.id}_s${seasonNum}_e${epNum}`;
        return !!user.history[key];
    };

    const [copied, setCopied] = useState(false);

    const handleShare = async () => {
        const canonicalUrl = `https://kstfilm.com/${isSeries ? 'series' : 'movie'}/${movie.id}`;
        const shareData = {
            title: movie.title,
            text: `بینەری ${isSeries ? 'زنجیرەی' : 'فیلمی'} (${movie.title}) بە بە ژێرنووسی فێرکاری لە کورد ستریم (kstfilm)`,
            url: canonicalUrl
        };
        if (navigator.share) {
            try {
                await navigator.share(shareData);
                return;
            } catch (e) {}
        }
        navigator.clipboard.writeText(canonicalUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
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
            {/* Cinematic Hero with Ambient Backdrop Blur and Sharp Portrait Poster Card */}
            <div className="detail-hero">
                {/* Floating Top Back Button */}
                <button className="detail-back-btn" onClick={goBackSafely} title={t('back')} aria-label={t('back')}>
                    <ArrowRight size={20} />
                </button>

                {(movie.posterCloudUrl || movie.posterUrl) && (
                    <div 
                        className="detail-hero-bg-blur"
                        style={{ backgroundImage: `url(${movie.posterCloudUrl || movie.posterUrl})` }}
                    />
                )}
                <div className="detail-hero-overlay"></div>
                
                <div className="detail-hero-container">
                    <div className="detail-hero-layout">
                        {/* Right: Info, Story & Actions */}
                        <div className="detail-hero-main">
                            <div className="detail-badge-row">
                                {movie.genre && <span className="detail-badge">{movie.genre}</span>}
                                {movie.imdbRating && (
                                    <span className="detail-imdb-badge">
                                        <Star size={13} fill="#fbbf24" color="#fbbf24" />
                                        <strong>IMDb</strong> {movie.imdbRating}
                                    </span>
                                )}
                                {(() => {
                                    const lvl = getCefrDisplayLevel(movie.level, movie.languageMetrics?.cefrLevel);
                                    if (!lvl) return null;
                                    const colorInfo = getCefrColor(lvl);
                                    return (
                                        <span 
                                            className="detail-level-badge" 
                                            style={{ 
                                                background: colorInfo.bg, 
                                                color: colorInfo.text, 
                                                fontWeight: 800,
                                                letterSpacing: '0.5px' 
                                            }}
                                        >
                                            {lvl}
                                        </span>
                                    );
                                })()}
                                {movie.language && (
                                    <span className="detail-lang-badge">
                                        <Globe size={12} /> {movie.language.split(',')[0]}
                                    </span>
                                )}
                            </div>

                            <h1 className="detail-title">{movie.title}</h1>

                            <div className="detail-meta-pills">
                                {movie.year && <span>{movie.year}</span>}
                                {movie.duration && (
                                    <>
                                        <span className="meta-dot">•</span>
                                        <span><Clock size={13} /> {movie.duration}</span>
                                    </>
                                )}
                                {isSeries && (
                                    <>
                                        <span className="meta-dot">•</span>
                                        <span>{seasons.length} {t('seasons')}</span>
                                        <span className="meta-dot">•</span>
                                        <span>{totalEpisodes} {t('episodes')}</span>
                                    </>
                                )}
                            </div>

                            <div className="detail-story-box">
                                <h3 className="story-heading">{t('story')}</h3>
                                <p className="detail-desc">{getDescription()}</p>
                            </div>

                            <div className="detail-actions-row">
                                {isSeries && seasons[0]?.episodes[0] ? (
                                    <Link to={`/watch/${movie.id}?s=${seasons[0].number}&e=${seasons[0].episodes[0].number}`} className="action-btn watch-btn">
                                        <Play size={18} fill="currentColor" />
                                        {t('watch_series')}
                                    </Link>
                                ) : (
                                    <Link to={`/watch/${movie.id}`} className="action-btn watch-btn">
                                        <Play size={18} fill="currentColor" />
                                        {t('watch_movie')}
                                    </Link>
                                )}

                                <div className="quick-actions">
                                    <button className={`quick-btn ${isFavorite ? 'active' : ''}`} onClick={() => handleAction('favorites', '/favorites')}>
                                        <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} /> {t('favorites')}
                                    </button>
                                    <button className={`quick-btn ${isWatchLater ? 'active' : ''}`} onClick={() => handleAction('watchLater', '/watch-later')}>
                                        <Bookmark size={15} fill={isWatchLater ? 'currentColor' : 'none'} /> {t('watch_later')}
                                    </button>
                                    <button className={`quick-btn ${isWatched ? 'active' : ''}`} onClick={() => handleAction('watched')}>
                                        <CheckCircle size={15} fill={isWatched ? 'currentColor' : 'none'} /> {t('watched')}
                                    </button>
                                    <button className={`quick-btn ${copied ? 'active' : ''}`} onClick={handleShare} title="هاوبەشکردن و کۆپیکردنی بەستەری فیلم">
                                        {copied ? <Check size={15} color="#22d3ee" /> : <Share2 size={15} />}
                                        {copied ? (lang === 'en' ? 'Copied ✓' : 'کۆپیکرا ✓') : (lang === 'en' ? 'Share' : 'هاوبەشکردن')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Left: Sharp Portrait Poster Card */}
                        {(movie.posterCloudUrl || movie.posterUrl) && (
                            <div className="detail-poster-frame">
                                <img src={movie.posterCloudUrl || movie.posterUrl} alt={movie.title} className="detail-poster-img" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <section className="lm-section">
                <h3 className="lm-title">{t('language_metrics')}</h3>
                <div className="lm-cards">
                    <div className="lm-card"><strong>{metrics.totalWords.toLocaleString()}</strong><span>{t('total_words')}</span></div>
                    <div className="lm-card"><strong>{metrics.lexicalDensity}%</strong><span>{t('lexical_density')}</span></div>
                    <div className="lm-card"><strong>{metrics.vocabDiversity}%</strong><span>{t('vocab_diversity')}</span></div>
                    <div className="lm-card"><strong>{metrics.cefrLevel}</strong><span>{t('cefr_level')}</span></div>
                </div>
                <div className="lm-bars">
                    {metrics?.distribution && Object.entries(metrics.distribution).map(([level, value]) => (
                        <div className="lm-row" key={level}>
                            <span className="lm-label">{level}</span>
                            <div className="lm-track"><div className="lm-fill" style={{ width: `${value}%` }} /></div>
                            <span className="lm-value">{value}%</span>
                        </div>
                    ))}
                </div>

                {metrics.difficultWords && metrics.difficultWords.length > 0 && (
                    <div className="lm-difficult-words">
                        <h4 className="lm-sub-title">{t('advanced_words')}</h4>
                        <div className="dw-grid">
                            {(showAllDifficult ? metrics.difficultWords : metrics.difficultWords.slice(0, 4)).map((dw, i) => (
                                <div key={i} className="dw-card">
                                    <div className="dw-header">
                                        <span className="dw-word">{dw.word}</span>
                                        <span className="dw-type">{dw.type}</span>
                                    </div>
                                    <p className="dw-def">{dw.definition}</p>
                                </div>
                            ))}
                        </div>
                        {metrics.difficultWords.length > 4 && (
                            <div className="lm-more-btn-wrap">
                                <button
                                    type="button"
                                    className="btn-show-more-words"
                                    onClick={() => setShowAllDifficult(!showAllDifficult)}
                                >
                                    {showAllDifficult ? t('show_less') : t('show_more')}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {metrics.repeatedWords && metrics.repeatedWords.length > 0 && (
                    <div className="lm-repeated-words">
                        <h4 className="lm-sub-title">{t('repeated_words')}</h4>
                        <div className="rw-flex">
                            {(showAllRepeated ? metrics.repeatedWords : metrics.repeatedWords.slice(0, 8)).map((rw, i) => (
                                <div key={i} className="rw-pill" title={rw.meaning}>
                                    <div className="rw-main">
                                        <span className="rw-word">{rw.word}</span>
                                        <span className="rw-count">{rw.count}</span>
                                    </div>
                                    {rw.meaning && <span className="rw-meaning">{rw.meaning}</span>}
                                </div>
                            ))}
                        </div>
                        {metrics.repeatedWords.length > 8 && (
                            <div className="lm-more-btn-wrap">
                                <button
                                    type="button"
                                    className="btn-show-more-words"
                                    onClick={() => setShowAllRepeated(!showAllRepeated)}
                                >
                                    {showAllRepeated ? t('show_less') : t('show_more')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </section>

            {isSeries && seasons.length > 0 && (
                <div className="series-episodes-section">
                    <div className="season-tabs">
                        {seasons.map(season => (
                            <button 
                                key={season.id} 
                                className={`season-tab ${activeSeason === season.number ? 'active' : ''}`}
                                onClick={() => setActiveSeason(season.number)}
                            >
                                {t('season')} {season.number}
                            </button>
                        ))}
                    </div>
                    
                    <div className="episodes-list">
                        {[...(activeSeasonData?.episodes || [])].sort((a, b) => a.number - b.number).map(ep => {
                            const watched = isEpisodeWatched(activeSeason, ep.number);
                            const metrics = normalizeLanguageMetrics(ep.languageMetrics);
                            return (
                                <Link to={`/series/${movie.id}/season/${activeSeason}/episode/${ep.number}`} key={ep.id} className={`episode-card ${watched ? 'watched' : ''}`}>
                                    <div className="episode-thumb">
                                        <img src={movie.posterCloudUrl || movie.posterUrl} alt={ep.title} />
                                        <div className="episode-number">{ep.number}</div>
                                        {watched && (
                                            <div className="episode-watched-badge">
                                                <CheckCircle size={14} fill="currentColor" /> {t('watched_status')}
                                            </div>
                                        )}
                                        {metrics?.cefrLevel && (
                                            <div className="ep-level-badge">{metrics.cefrLevel}</div>
                                        )}
                                        <div className="play-overlay"><Play size={24} fill="currentColor" /></div>
                                    </div>
                                    <div className="episode-info">
                                        <h4>{ep.title}</h4>
                                        <p>{ep.duration} {t('minutes')}</p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="comments-section">
                <div className="comments-section-header">
                    <h3 className="section-heading">
                        <MessageSquare size={22} color="#8b5cf6" />
                        <span>{t('comments_ratings')}</span>
                        {comments.length > 0 && <span className="comments-count-pill">{comments.length}</span>}
                    </h3>
                </div>
                
                <form className="comment-form" onSubmit={submitComment}>
                    <div className="rating-select">
                        <span className="rating-label">{t('your_rating')}</span>
                        <div className="stars-input">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button 
                                    type="button" 
                                    key={star} 
                                    className={`star-btn ${star <= commentRating ? 'active' : ''}`}
                                    onClick={() => setCommentRating(star)}
                                    title={`${star} ${t('stars') || 'ئەستێرە'}`}
                                >
                                    <Star size={20} fill={star <= commentRating ? "#fbbf24" : "none"} color={star <= commentRating ? "#fbbf24" : "#94a3b8"} />
                                </button>
                            ))}
                        </div>
                    </div>
                    <textarea 
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={t('comment_placeholder')}
                        rows={3}
                        required
                    />
                    <div className="comment-form-footer">
                        <button type="submit" className="submit-comment-btn" disabled={isSubmittingComment || !newComment.trim()}>
                            <Send size={15} />
                            <span>{isSubmittingComment ? t('submitting') : t('send_comment')}</span>
                        </button>
                    </div>
                </form>

                <div className="comments-list">
                    {comments.length === 0 ? (
                        <div className="no-comments">
                            <MessageSquare size={32} color="#8b5cf6" style={{ opacity: 0.7, marginBottom: '8px' }} />
                            <p>{t('no_comments_yet')}</p>
                        </div>
                    ) : (
                        [...comments].reverse().map(comment => (
                            <div key={comment.id} className="comment-card">
                                <div className="comment-header">
                                    <div className="comment-user">
                                        <div className="comment-avatar">{comment.username.charAt(0).toUpperCase()}</div>
                                        <span className="comment-username">{comment.username}</span>
                                    </div>
                                    <div className="comment-meta">
                                        <div className="comment-rating">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} size={13} fill={i < comment.rating ? "#fbbf24" : "none"} color={i < comment.rating ? "#fbbf24" : "#475569"} />
                                            ))}
                                        </div>
                                        <span className="comment-date">{new Date(comment.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'ku-IQ')}</span>
                                    </div>
                                </div>
                                <p className="comment-text">{comment.text}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
