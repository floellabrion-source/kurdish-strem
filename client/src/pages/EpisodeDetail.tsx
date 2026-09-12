import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Play, ArrowLeft, Globe, Clock, Star, Eye, CheckCircle, BarChart2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Movie, Episode, LanguageMetrics, getCefrDisplayLevel } from '../types';
import './EpisodeDetail.css';

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

function buildLanguageMetrics(text: string, level?: string): LanguageMetrics {
    const words = (text.toLowerCase().match(/[\p{L}']+/gu) || []).filter(Boolean);
    const totalWords = Math.max(1, words.length);
    const uniqueWords = new Set(words).size;
    const lexicalDensity = Math.min(85, Math.max(22, Math.round((uniqueWords / totalWords) * 100 + 10)));
    const vocabDiversity = Math.min(80, Math.max(18, Math.round((uniqueWords / totalWords) * 100 - 4)));
    const score = lexicalDensity * 0.5 + vocabDiversity * 0.35 + 6;
    const autoLevel = score < 40 ? 'A2' : score < 48 ? 'B1' : score < 60 ? 'B2' : 'C1';
    const mapped = getCefrDisplayLevel(level);
    const cefrLevel = (mapped && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(mapped)) ? mapped : autoLevel;

    const distribution = CEFR_PRESETS[cefrLevel] || CEFR_PRESETS['B1'];

    return { totalWords, lexicalDensity, vocabDiversity, cefrLevel: cefrLevel as any, distribution };
}

export default function EpisodeDetail() {
    const { id, seasonNum, episodeNum } = useParams<{ id: string, seasonNum: string, episodeNum: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { lang, t } = useLanguage();
    
    const [movie, setMovie] = useState<Movie | null>(null);
    const [episode, setEpisode] = useState<Episode | null>(null);
    const [loading, setLoading] = useState(true);

    // Language Metrics word expansion toggles
    const [showAllDifficult, setShowAllDifficult] = useState(false);
    const [showAllRepeated, setShowAllRepeated] = useState(false);

    useEffect(() => {
        axios.get(`/api/movies/${id}`)
            .then(res => {
                const movieData = res.data;
                setMovie(movieData);
                
                const season = movieData.seasons?.find((s: any) => s.number === Number(seasonNum));
                const ep = season?.episodes?.find((e: any) => e.number === Number(episodeNum));
                
                if (ep) {
                    setEpisode(ep);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [id, seasonNum, episodeNum]);

    if (loading) return <div className="loading-state">{t('loading')}</div>;
    if (!movie || !episode) return <div className="error-state">{lang === 'en' ? 'Episode not found.' : 'ئەڵقەکە نەدۆزرایەوە.'}</div>;

    const poster = movie.posterCloudUrl || movie.posterUrl;
    const isWatched = user?.history?.[`${movie.id}_s${seasonNum}_e${episodeNum}`] || false;

    const manualMetrics = normalizeLanguageMetrics(episode.languageMetrics);
    const metrics = manualMetrics || buildLanguageMetrics(episode.description || episode.title, movie.level);

    return (
        <div className="episode-detail-container">
            <div className="detail-hero" style={{ backgroundImage: `url(${poster})` }}>
                <div className="detail-hero-overlay"></div>
                <div className="detail-hero-content">
                    <button type="button" className="back-btn" onClick={() => navigate(`/series/${id}`)}>
                        <ArrowLeft size={16} />
                        {lang === 'en' ? 'Back to Series' : 'گەڕانەوە بۆ زنجیرە'}
                    </button>
                    <div className="ep-breadcrumb">
                        <span>{movie.title}</span>
                        <span className="separator">/</span>
                        <span>{t('season')} {seasonNum}</span>
                    </div>
                    <h1 className="detail-title">{lang === 'en' ? `Episode ${episodeNum}: ${episode.title}` : `ئەڵقەی ${episodeNum}: ${episode.title}`}</h1>
                    <div className="detail-meta">
                        <span>{movie.genre || (lang === 'en' ? 'Unknown' : 'نەزانراو')}</span>
                        <span>{episode.duration} {t('minutes')}</span>
                        {isWatched && <span className="watched-badge"><CheckCircle size={13} fill="currentColor" /> {t('watched_status')}</span>}
                    </div>

                    <div className="detail-actions">
                        <Link to={`/watch/${id}?s=${seasonNum}&e=${episodeNum}`} className="action-btn watch-btn">
                            <Play size={19} fill="currentColor" />
                            {lang === 'en' ? 'Watch Episode' : 'سەیرکردنی ئەڵقە'}
                        </Link>
                    </div>
                </div>
            </div>

            <div className="detail-content">
                <div className="detail-poster">
                    <img src={poster} alt={episode.title} />
                </div>
                <div className="detail-info">
                    <div className="detail-pills">
                        <span><Globe size={14} /> {movie.language?.split(',')[0] || 'N/A'}</span>
                        <span><Clock size={14} /> {episode.duration}</span>
                        <span><BarChart2 size={14} /> {metrics.cefrLevel}</span>
                    </div>
                    <h3 className="section-heading">{lang === 'en' ? 'Episode Synopsis' : 'چیرۆکی ئەڵقە'}</h3>
                    <p className="detail-desc">{episode.description || (lang === 'en' ? 'No description available for this episode.' : 'بۆ ئەم ئەڵقەیە هیچ باسکردنێک نییە.')}</p>
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
                    {Object.entries(metrics.distribution).map(([level, value]) => (
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
        </div>
    );
}
