import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, Play, Film, Lock, X, Languages, Star, Share2, Check } from 'lucide-react';
import { Movie, Season, Episode, LanguageMetrics, getCefrDisplayLevel, getCefrColor } from '../types';
import { useLanguage } from '../context/LanguageContext';
import './SeriesPage.css';

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

export default function SeriesPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { lang, t } = useLanguage();

    const [movie, setMovie] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSeason, setActiveSeason] = useState(1);

    // Word Modal State
    const [wordModalOpen, setWordModalOpen] = useState(false);
    const [wordData, setWordData] = useState({ word: '', meaning: '' });

    // Language Metrics word expansion toggles
    const [showAllDifficult, setShowAllDifficult] = useState(false);
    const [showAllRepeated, setShowAllRepeated] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        axios.get(`/api/movies/${id}`).then(res => {
            setMovie(res.data);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        if (!loading && movie && movie.type !== 'series') {
            navigate('/');
        }
    }, [loading, movie, navigate]);

    const handleWordClick = (word: string, meaning: string) => {
        setWordData({ word, meaning });
        setWordModalOpen(true);
    };

    const addToFlashcards = async (e: React.MouseEvent, word: string, meaning: string) => {
        e.stopPropagation();
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/flashcards', {
                front: word,
                back: meaning,
                type: 'word'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Show a simple success toast or alert
            alert('وشەکە زیاد کرا بۆ فلاش کارتەکان ✓');
        } catch (error) {
            console.error('Failed to add flashcard:', error);
            alert('هەڵەیەک ڕوویدا لە کاتی زیادکردن بۆ فلاش کارتەکان.');
        }
    };

    if (loading) return (
        <div className="series-loading">
            <div className="loading-spinner" />
        </div>
    );

    if (!movie || movie.type !== 'series') return null;

    const poster = movie.posterCloudUrl || movie.posterUrl;
    const seasons = movie.seasons || [];
    const currentSeason = seasons.find(s => s.number === activeSeason);

    // Function to calculate aggregate language metrics for a series
    const getAggregateMetrics = () => {
        const manualMetrics = normalizeLanguageMetrics(movie.languageMetrics);
        const fallbackMetrics = manualMetrics || buildLanguageMetrics(movie.description || '', movie.level);

        if (seasons.length === 0) {
            return fallbackMetrics;
        }

        const allEpisodes = seasons.flatMap(s => s.episodes || []);
        const epsWithMetrics = allEpisodes.filter(ep => {
            if (!ep.languageMetrics) return false;
            const m = ep.languageMetrics;
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
        })).sort((a, b) => b.count - a.count).slice(0, 20);

        const avgDist = {
            A1: Number((dist.A1 / count).toFixed(1)),
            A2: Number((dist.A2 / count).toFixed(1)),
            B1: Number((dist.B1 / count).toFixed(1)),
            B2: Number((dist.B2 / count).toFixed(1)),
            C1: Number((dist.C1 / count).toFixed(1)),
            C2: Number((dist.C2 / count).toFixed(1)),
            Unknown: Number((dist.Unknown / count).toFixed(1))
        };

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
            difficultWords: Array.from(difficultWordsMap.values()).slice(0, 15)
        };
    };

    const metrics = getAggregateMetrics();

    const handleShare = async () => {
        if (!movie) return;
        const canonicalUrl = `https://kstfilm.com/series/${movie.id}`;
        const shareData = {
            title: movie.title,
            text: `بینەری زنجیرەی (${movie.title}) بە بە ژێرنووسی فێرکاری لە کورد ستریم (kstfilm)`,
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
        <div className="series-page">
            {/* Hero Banner with Ambient Backdrop Blur and Sharp Poster Card */}
            <div className="series-hero">
                {/* Floating Top Back Button */}
                <button className="detail-back-btn" onClick={goBackSafely} title="گەڕانەوە" aria-label="گەڕانەوە">
                    <ArrowRight size={20} />
                </button>

                {poster && (
                    <div 
                        className="series-hero-bg-blur"
                        style={{ backgroundImage: `url(${poster})` }}
                    />
                )}
                <div className="series-hero-overlay" />
                
                <div className="series-hero-container">
                    <div className="series-hero-layout">
                        {/* Right: Metadata & Info */}
                        <div className="series-info">
                            <div className="series-badge-row">
                                {movie.genre && <span className="series-badge">{movie.genre}</span>}
                                {movie.imdbRating && (
                                    <span className="series-imdb-badge">
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
                                            className="series-level-badge" 
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
                            </div>

                            <h1 className="series-title">{movie.title}</h1>

                            <div className="series-meta-pills">
                                {movie.year && <span>{movie.year}</span>}
                                <span className="meta-dot">•</span>
                                <span>{seasons.length} {t('seasons')}</span>
                                <span className="meta-dot">•</span>
                                <span>{seasons.reduce((acc, s) => acc + s.episodes.length, 0)} {t('episodes')}</span>
                                {movie.language && (
                                    <>
                                        <span className="meta-dot">•</span>
                                        <span>{movie.language.split(',')[0]}</span>
                                    </>
                                )}
                            </div>

                            {movie && (
                                <p className="series-desc">
                                    {lang === 'en' ? (movie.descriptionEn || movie.description) :
                                     lang === 'ar' ? (movie.descriptionAr || movie.description) :
                                     (movie.descriptionKu || movie.description)}
                                </p>
                            )}

                            <div className="series-action-row">
                                {seasons[0]?.episodes[0] && (
                                    <Link
                                        to={`/watch/${id}?s=${seasons[0].number}&e=${seasons[0].episodes[0].number}`}
                                        className="series-play-btn"
                                    >
                                        <Play size={18} fill="white" /> {lang === 'en' ? 'Watch First Episode' : 'سەیرکردنی ئەڵقەی یەکەم'}
                                    </Link>
                                )}
                                <button 
                                    className={`series-share-btn ${copied ? 'active' : ''}`} 
                                    onClick={handleShare}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '12px 20px',
                                        borderRadius: '12px',
                                        background: copied ? 'rgba(34, 211, 238, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                                        border: copied ? '1px solid #22d3ee' : '1px solid rgba(255, 255, 255, 0.15)',
                                        color: copied ? '#22d3ee' : '#fff',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '14px',
                                        transition: 'all 0.2s ease'
                                    }}
                                    title="هاوبەشکردن و کۆپیکردنی بەستەری زنجیرە"
                                >
                                    {copied ? <Check size={16} /> : <Share2 size={16} />}
                                    {copied ? (lang === 'en' ? 'Copied ✓' : 'کۆپیکرا ✓') : (lang === 'en' ? 'Share' : 'هاوبەشکردن')}
                                </button>
                            </div>
                        </div>

                        {poster && (
                            <div className="series-poster-frame">
                                <img src={poster} alt={movie.title} className="series-poster-img" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="series-content">
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
                                <div key={i} className="dw-card" onClick={() => handleWordClick(dw.word, dw.definition)} style={{ cursor: 'pointer' }}>
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
                                <div key={i} className="rw-pill" title={rw.meaning} onClick={() => handleWordClick(rw.word, rw.meaning || '')} style={{ cursor: 'pointer' }}>
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

                <div className="season-tabs-wrap">
                    <div className="season-tabs">
                        {seasons.map(s => (
                            <button
                                key={s.id}
                                className={`season-tab ${s.number === activeSeason ? 'active' : ''}`}
                                onClick={() => setActiveSeason(s.number)}
                            >
                                {t('season')} {s.number}
                            </button>
                        ))}
                    </div>
                </div>

                {currentSeason && (
                    <div className="season-header">
                        <h2 className="season-title">{currentSeason.title || (lang === 'en' ? `Season ${currentSeason.number}` : `سیزنی ${currentSeason.number}`)}</h2>
                    </div>
                )}

                {currentSeason && (
                    <div className="episodes-grid">
                        {[...currentSeason.episodes].sort((a, b) => a.number - b.number).map(episode => (
                            <EpisodeCard
                                key={episode.id}
                                episode={episode}
                                seriesId={id!}
                                seasonNum={activeSeason}
                                posterUrl={poster}
                                lang={lang}
                                t={t}
                            />
                        ))}
                    </div>
                )}

                {seasons.length === 0 && (
                    <div className="series-empty">
                        <Film size={48} />
                        <p>{lang === 'en' ? 'No seasons uploaded yet. Go to Admin panel.' : 'هیچ سیزنێک زیاد نەکراوە. بڕۆ بۆ پانێلی ئەدمین.'}</p>
                    </div>
                )}
            </div>

            {wordModalOpen && (
                <div className="practice-overlay" onClick={() => setWordModalOpen(false)}>
                    <div className="practice-card word-lookup-card" onClick={e => e.stopPropagation()}>
                        <button className="practice-close" onClick={() => setWordModalOpen(false)}>
                            <X size={18} />
                        </button>
                        <h3 className="word-lookup-title">
                            {wordData.word} <Languages size={18} />
                        </h3>
                        <div className="word-lookup-result">
                            {wordData.meaning}
                        </div>
                        <button 
                            className="word-lookup-save"
                            onClick={(e) => {
                                addToFlashcards(e, wordData.word, wordData.meaning);
                                setWordModalOpen(false);
                            }}
                        >
                            {t('add_to_flashcards')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function EpisodeCard({
    episode,
    seriesId,
    seasonNum,
    posterUrl,
    lang,
    t
}: {
    episode: Episode;
    seriesId: string;
    seasonNum: number;
    posterUrl: string;
    lang: string;
    t: (key: string) => string;
}) {
    const hasVideo = !!episode.videoFile || !!episode.videoUrl;
    const metrics = normalizeLanguageMetrics(episode.languageMetrics);

    return (
        <div className={`episode-card ${!hasVideo ? 'no-video' : ''}`}>
            <Link to={`/series/${seriesId}/season/${seasonNum}/episode/${episode.number}`} className="ep-card-link">
                <div className="ep-thumb-wrap">
                    {posterUrl ? (
                        <img src={posterUrl} alt={episode.title} className="ep-thumb" />
                    ) : (
                        <div className="ep-thumb-placeholder"><Film size={28} /></div>
                    )}
                    <div className="ep-overlay">
                        {hasVideo ? (
                            <div className="ep-play-btn-dummy">
                                <Play size={22} fill="white" />
                            </div>
                        ) : (
                            <div className="ep-locked"><Lock size={20} /></div>
                        )}
                    </div>
                    <div className="ep-number-badge">{lang === 'en' ? `Episode ${episode.number}` : `ئەڵقەی ${episode.number}`}</div>
                    {episode.translatedSrt && (
                        <div className="ep-sub-badge">{t('subtitles')}</div>
                    )}
                    {metrics?.cefrLevel && (
                        <div className="ep-level-badge">{metrics.cefrLevel}</div>
                    )}
                </div>
                <div className="ep-info">
                    <h3 className="ep-title">{episode.title || (lang === 'en' ? `Episode ${episode.number}` : `ئەڵقەی ${episode.number}`)}</h3>
                    {episode.duration && <span className="ep-duration">{episode.duration} {t('minutes')}</span>}
                    {episode.description && <p className="ep-desc">{episode.description}</p>}
                </div>
            </Link>
        </div>
    );
}
