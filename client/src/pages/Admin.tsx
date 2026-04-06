import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    Plus, Film, Trash2, Edit3, Save, X,
    CheckCircle, AlertCircle, Loader2, FileText,
    Image, Video, Layers, ChevronDown, ChevronUp,
    PlusCircle, ListVideo, Upload, Languages, Shield
} from 'lucide-react';
import { Movie, Season, Episode } from '../types';
import SrtTranslator from './SrtTranslator';
import './Admin.css';

interface Toast { id: number; msg: string; type: 'success' | 'error'; }

export default function Admin() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editMovie, setEditMovie] = useState<Movie | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});

    const [sensitiveTarget, setSensitiveTarget] = useState<{ movieId: string, seasonNum?: number, episodeId?: string } | null>(null);
    const [sensitiveScenes, setSensitiveScenes] = useState<{ start: number, end: number }[]>([]);

    const [form, setForm] = useState({
        title: '', description: '', genre: '',
        year: new Date().getFullYear().toString(),
        duration: '', type: 'movie' as 'movie' | 'series'
    });

    const refs = {
        video: useRef<Record<string, HTMLInputElement | null>>({}),
        poster: useRef<Record<string, HTMLInputElement | null>>({}),
        origSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        transSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        epVideo: useRef<Record<string, HTMLInputElement | null>>({}),
        epOrigSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        epTransSrt: useRef<Record<string, HTMLInputElement | null>>({}),
    };

    const toast = (msg: string, type: 'success' | 'error' = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, msg, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
    };

    const load = () => {
        setLoading(true);
        axios.get('/api/movies').then(r => { setMovies(r.data); setLoading(false); });
    };

    useEffect(() => { load(); }, []);

    const handleCreate = async () => {
        if (!form.title.trim()) { toast('ناوی بەرهەمەکە داخڵ بکە', 'error'); return; }
        try {
            await axios.post('/api/admin/movies', { ...form, year: parseInt(form.year) });
            toast('بە سەرکەوتوویی زیاد کرا ✓');
            setShowForm(false);
            setForm({ title: '', description: '', genre: '', year: new Date().getFullYear().toString(), duration: '', type: 'movie' });
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const handleSaveEdit = async () => {
        if (!editMovie) return;
        try {
            await axios.put(`/api/admin/movies/${editMovie.id}`, editMovie);
            toast('پاشەکەوت کرا ✓');
            setEditMovie(null);
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const handleDelete = async (movie: Movie) => {
        if (!confirm(`ئایا دڵنیایت لە سڕینەوەی "${movie.title}"؟`)) return;
        try {
            await axios.delete(`/api/admin/movies/${movie.id}`);
            toast('سڕایەوە ✓');
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const handleSaveSensitive = async () => {
        if (!sensitiveTarget) return;
        const movieIdx = movies.findIndex(m => m.id === sensitiveTarget.movieId);
        if (movieIdx === -1) return;

        const updatedMovie = JSON.parse(JSON.stringify(movies[movieIdx])); // Deep copy

        if (sensitiveTarget.episodeId !== undefined && sensitiveTarget.seasonNum !== undefined) {
            const season = updatedMovie.seasons.find((s: Season) => s.number === sensitiveTarget.seasonNum);
            if (season) {
                const ep = season.episodes.find((e: Episode) => e.id === sensitiveTarget.episodeId);
                if (ep) {
                    ep.sensitiveScenes = sensitiveScenes;
                }
            }
        } else {
            updatedMovie.sensitiveScenes = sensitiveScenes;
        }

        try {
            await axios.put(`/api/admin/movies/${updatedMovie.id}`, updatedMovie);
            toast('کاتی نەشیاو دیاری کرا ✓');
            setSensitiveTarget(null);
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const openSensitiveModal = (movieId: string, seasonNum?: number, episodeId?: string) => {
        setSensitiveTarget({ movieId, seasonNum, episodeId });
        const m = movies.find(x => x.id === movieId);
        if (episodeId && seasonNum && m?.seasons) {
            const ep = m.seasons.find(s => s.number === seasonNum)?.episodes.find(e => e.id === episodeId);
            setSensitiveScenes(ep?.sensitiveScenes || []);
        } else if (m) {
            setSensitiveScenes(m.sensitiveScenes || []);
        }
    };

    const doUpload = async (movieId: string, file: File, type: string, extra?: { season?: number; episode?: number; srtType?: string }) => {
        const key = `${movieId}-${type}-${extra?.season || 0}-${extra?.episode || 0}`;
        setUploading(u => ({ ...u, [key]: true }));
        const fd = new FormData();
        try {
            if (type === 'video') { fd.append('video', file); await axios.post(`/api/admin/movies/${movieId}/video`, fd); toast('ڤیدیۆکە بارکرا ✓'); }
            else if (type === 'poster') { fd.append('poster', file); await axios.post(`/api/admin/movies/${movieId}/poster`, fd); toast('وێنەی پۆستەر بارکرا ✓'); }
            else if (type === 'srt') { fd.append('srt', file); await axios.post(`/api/admin/movies/${movieId}/srt/${extra?.srtType}`, fd); toast(`SRT ${extra?.srtType === 'original' ? 'ئەسڵی' : 'وەرگێڕدراو'} بارکرا ✓`); }
            else if (type === 'ep-video') { fd.append('video', file); await axios.post(`/api/admin/movies/${movieId}/seasons/${extra!.season}/episodes/${extra!.episode}/video`, fd); toast(`ڤیدیۆی ئالقەی ${extra!.episode} بارکرا ✓`); }
            else if (type === 'ep-srt') { fd.append('srt', file); await axios.post(`/api/admin/movies/${movieId}/seasons/${extra!.season}/episodes/${extra!.episode}/srt/${extra!.srtType}`, fd); toast(`SRT ئالقەی ${extra!.episode} بارکرا ✓`); }
            load();
        } catch { toast('بارکردن سەرکەوتوو نەبوو', 'error'); }
        finally { setUploading(u => ({ ...u, [key]: false })); }
    };

    const addBulkEpisodes = async (movieId: string, seasonNum: number, count: number) => {
        try {
            await axios.post(`/api/admin/movies/${movieId}/seasons/${seasonNum}/episodes/bulk`, { count });
            toast(`${count} ئالقە زیاد کران ✓`);
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const addSeason = async (movieId: string) => {
        const m = movies.find(x => x.id === movieId);
        const n = (m?.seasons?.length || 0) + 1;
        try { await axios.post(`/api/admin/movies/${movieId}/seasons`, { title: `سیزنی ${n}` }); toast(`سیزنی ${n} زیاد کرا ✓`); load(); }
        catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const addEpisode = async (movieId: string, seasonNum: number) => {
        const m = movies.find(x => x.id === movieId);
        const s = m?.seasons?.find(s => s.number === seasonNum);
        const n = (s?.episodes.length || 0) + 1;
        try { await axios.post(`/api/admin/movies/${movieId}/seasons/${seasonNum}/episodes`, { title: `ئالقەی ${n}` }); toast(`ئالقەی ${n} زیاد کرا ✓`); load(); }
        catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    return (
        <div className="admin-page">
            {/* Toasts */}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`}>
                        {t.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                        {t.msg}
                    </div>
                ))}
            </div>

            <div className="admin-header">
                <div>
                    <h1 className="admin-title">پانێلی ئەدمین</h1>
                    <p className="admin-sub">{movies.length} بەرهەم تۆمارکراوە</p>
                </div>
                <button className="btn-add" onClick={() => setShowForm(true)}>
                    <Plus size={18} /> بەرهەمی نوێ
                </button>
            </div>

            <SrtTranslator />

            {/* CREATE FORM */}
            {showForm && (
                <div className="form-overlay" onClick={() => setShowForm(false)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>بەرهەمی نوێ</h2>
                            <button onClick={() => setShowForm(false)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <div className="type-selector">
                                <button className={`type-btn ${form.type === 'movie' ? 'active-movie' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'movie' }))}>
                                    <Film size={18} /> فیلم
                                </button>
                                <button className={`type-btn ${form.type === 'series' ? 'active-series' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'series' }))}>
                                    <Layers size={18} /> زنجیرە
                                </button>
                            </div>
                            <div className="form-group">
                                <label>ناو *</label>
                                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="ناوی بەرهەمەکە..." className="form-input" />
                            </div>
                            <div className="form-group">
                                <label>باس</label>
                                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="کورتەباسێک..." className="form-input form-textarea" rows={3} />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>ژانڕ</label>
                                    <input type="text" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} placeholder="ئاکشن، دراما..." className="form-input" />
                                </div>
                                <div className="form-group">
                                    <label>ساڵ</label>
                                    <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="form-input" />
                                </div>
                                {form.type === 'movie' && (
                                    <div className="form-group">
                                        <label>کات</label>
                                        <input type="text" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="١:٣٠" className="form-input" />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setShowForm(false)} className="btn-cancel">پاشگەز</button>
                            <button onClick={handleCreate} className="btn-save"><Save size={16} /> زیادکردن</button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT FORM */}
            {editMovie && (
                <div className="form-overlay" onClick={() => setEditMovie(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>دەستکاریکردن: {editMovie.title}</h2>
                            <button onClick={() => setEditMovie(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <div className="form-group"><label>ناو</label><input type="text" value={editMovie.title} onChange={e => setEditMovie(m => m ? { ...m, title: e.target.value } : null)} className="form-input" /></div>
                            <div className="form-group"><label>باس</label><textarea value={editMovie.description} onChange={e => setEditMovie(m => m ? { ...m, description: e.target.value } : null)} className="form-input form-textarea" rows={3} /></div>
                            <div className="form-row">
                                <div className="form-group"><label>ژانڕ</label><input type="text" value={editMovie.genre} onChange={e => setEditMovie(m => m ? { ...m, genre: e.target.value } : null)} className="form-input" /></div>
                                <div className="form-group"><label>ساڵ</label><input type="number" value={editMovie.year} onChange={e => setEditMovie(m => m ? { ...m, year: +e.target.value } : null)} className="form-input" /></div>
                                <div className="form-group"><label>کات</label><input type="text" value={editMovie.duration} onChange={e => setEditMovie(m => m ? { ...m, duration: e.target.value } : null)} className="form-input" /></div>
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setEditMovie(null)} className="btn-cancel">پاشگەز</button>
                            <button onClick={handleSaveEdit} className="btn-save"><Save size={16} /> پاشەکەوتکردن</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SENSITIVE SCENES FORM */}
            {sensitiveTarget && (
                <div className="form-overlay" onClick={() => setSensitiveTarget(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2><Shield size={20} color="#f87171" style={{marginRight: '8px', verticalAlign: 'middle'}}/> کاتە نەشیاوەکان (Family Mode)</h2>
                            <button onClick={() => setSensitiveTarget(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            <p style={{fontSize: '14px', color: '#94a3b8', marginBottom: '15px', lineHeight: '1.6'}}>کاتی دەستپێکردن و کۆتایی هاتنی دیمەنە نەشیاوەکان بە دەقە (خولەک) و چرکە دیاری بکە. بۆ نموونە: 1 دەقە و 30 چرکە.</p>
                            
                            {sensitiveScenes.length === 0 ? (
                                <div style={{textAlign: 'center', padding: '20px', color: '#64748b'}}>هیچ دیمەنێکی نەشیاو دیاری نەکراوە بۆ ئەم ڤیدیۆیە.</div>
                            ) : (
                                <div style={{display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '15px'}}>
                                    {sensitiveScenes.map((s, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{fontSize: '12px', color: '#cbd5e1'}}>دەستپێک</label>
                                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                    <input type="number" min="0" placeholder="خولەک" value={Math.floor((s.start || 0) / 60) || ''} onChange={e => {
                                                        const newS = [...sensitiveScenes];
                                                        newS[i].start = (Number(e.target.value) * 60) + ((s.start || 0) % 60);
                                                        setSensitiveScenes(newS);
                                                    }} className="form-input" style={{padding: '8px', textAlign: 'center', margin: 0}} />
                                                    <span style={{color: '#94a3b8'}}>:</span>
                                                    <input type="number" min="0" max="59" placeholder="چرکە" value={(s.start || 0) % 60 || ''} onChange={e => {
                                                        const newS = [...sensitiveScenes];
                                                        newS[i].start = (Math.floor((s.start || 0) / 60) * 60) + Number(e.target.value);
                                                        setSensitiveScenes(newS);
                                                    }} className="form-input" style={{padding: '8px', textAlign: 'center', margin: 0}} />
                                                </div>
                                            </div>
                                            <div style={{color: '#475569', alignSelf: 'flex-end', paddingBottom: '10px'}}>-</div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{fontSize: '12px', color: '#cbd5e1'}}>کۆتایی</label>
                                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                    <input type="number" min="0" placeholder="خولەک" value={Math.floor((s.end || 0) / 60) || ''} onChange={e => {
                                                        const newS = [...sensitiveScenes];
                                                        newS[i].end = (Number(e.target.value) * 60) + ((s.end || 0) % 60);
                                                        setSensitiveScenes(newS);
                                                    }} className="form-input" style={{padding: '8px', textAlign: 'center', margin: 0}} />
                                                    <span style={{color: '#94a3b8'}}>:</span>
                                                    <input type="number" min="0" max="59" placeholder="چرکە" value={(s.end || 0) % 60 || ''} onChange={e => {
                                                        const newS = [...sensitiveScenes];
                                                        newS[i].end = (Math.floor((s.end || 0) / 60) * 60) + Number(e.target.value);
                                                        setSensitiveScenes(newS);
                                                    }} className="form-input" style={{padding: '8px', textAlign: 'center', margin: 0}} />
                                                </div>
                                            </div>
                                            <button className="btn-cancel" style={{padding: '0 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', alignSelf: 'flex-end', height: '39px'}} onClick={() => {
                                                setSensitiveScenes(sensitiveScenes.filter((_, idx) => idx !== i));
                                            }}><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button className="btn-add" style={{width: '100%', justifyContent: 'center'}} onClick={() => setSensitiveScenes([...sensitiveScenes, { start: 0, end: 0 }])}>
                                <Plus size={16}/> کاتی زیاتر
                            </button>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setSensitiveTarget(null)} className="btn-cancel">پاشگەز</button>
                            <button onClick={handleSaveSensitive} className="btn-save"><Save size={16} /> پاشەکەوتکردن</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MOVIE LIST */}
            {loading ? (
                <div className="admin-loading"><Loader2 size={32} className="spinning" /></div>
            ) : movies.length === 0 ? (
                <div className="admin-empty"><Film size={48} /><p>هیچ بەرهەمێک نییە.</p></div>
            ) : (
                <div className="movies-admin-list">
                    {movies.map(movie => (
                        <div key={movie.id} className="admin-card">

                            {/* TOP: Poster + Info + Actions */}
                            <div className="ac-top">
                                {/* Poster */}
                                <div className="ac-poster" onClick={() => refs.poster.current[movie.id]?.click()}>
                                    {movie.posterUrl ? (
                                        <img src={`${movie.posterUrl}?t=${Date.now()}`} alt={movie.title} className="ac-poster-img" />
                                    ) : (
                                        <div className="ac-poster-placeholder">
                                            <Upload size={22} className="ac-upload-icon" />
                                            <span>وێنە</span>
                                        </div>
                                    )}
                                    <div className="ac-poster-hover"><Upload size={18} /> گۆڕانەوە</div>
                                    <input type="file" accept="image/*" className="hidden-input" ref={el => { refs.poster.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'poster')} />
                                </div>

                                {/* Info */}
                                <div className="ac-info">
                                    <div className="ac-title-row">
                                        <h3 className="ac-title">{movie.title}</h3>
                                        <span className={`type-badge ${movie.type === 'series' ? 'badge-series' : 'badge-movie'}`}>
                                            {movie.type === 'series' ? <><Layers size={10} /> زنجیرە</> : <><Film size={10} /> فیلم</>}
                                        </span>
                                    </div>
                                    <div className="ac-meta">
                                        {movie.year && <span>{movie.year}</span>}
                                        {movie.genre && <span>{movie.genre}</span>}
                                        {movie.duration && <span>{movie.duration}</span>}
                                        {movie.type === 'series' && movie.seasons && (
                                            <span>{movie.seasons.length} سیزن • {movie.seasons.reduce((a, s) => a + s.episodes.length, 0)} ئالقە</span>
                                        )}
                                    </div>
                                    {movie.description && <p className="ac-desc">{movie.description}</p>}
                                </div>

                                {/* Actions */}
                                <div className="ac-actions">
                                    {movie.type === 'movie' && (
                                        <button className="ac-btn tooltip" style={movie.sensitiveScenes?.length ? {color: '#ef4444'} : {}} data-tip="کاتی نەشیاو" onClick={(e) => { e.stopPropagation(); openSensitiveModal(movie.id); }} title="کاتە نەشیاوەکان">
                                            <Shield size={16} />
                                        </button>
                                    )}
                                    <button className="ac-btn ac-edit" onClick={() => setEditMovie(movie)} title="دەستکاریکردن"><Edit3 size={16} /></button>
                                    <button className="ac-btn ac-delete" onClick={() => handleDelete(movie)} title="سڕینەوە"><Trash2 size={16} /></button>
                                    {movie.type === 'series' && (
                                        <button
                                            className={`ac-btn ac-expand ${expandedSeries[movie.id] ? 'active' : ''}`}
                                            onClick={() => setExpandedSeries(e => ({ ...e, [movie.id]: !e[movie.id] }))}
                                            title="سیزن و ئالقەکان"
                                        >
                                            <ListVideo size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* UPLOAD SECTION (movie only) */}
                            {movie.type !== 'series' && (
                                <div className="ac-uploads">
                                    {/* Video */}
                                    <div className={`ac-upload-card ${movie.videoFile ? 'done' : ''}`} onClick={() => refs.video.current[movie.id]?.click()}>
                                        <input type="file" accept="video/*" className="hidden-input" ref={el => { refs.video.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'video')} />
                                        <div className="ac-upload-icon-wrap">
                                            {uploading[`${movie.id}-video-0-0`] ? <Loader2 size={22} className="spinning" /> : <Video size={22} />}
                                        </div>
                                        <div className="ac-upload-label">ڤیدیۆ</div>
                                        <div className="ac-upload-status">{movie.videoFile ? '✓ بارکراوە' : 'کلیک بکە'}</div>
                                    </div>

                                    {/* Original SRT */}
                                    <div className={`ac-upload-card ${movie.originalSrt ? 'done' : ''}`} onClick={() => refs.origSrt.current[movie.id]?.click()}>
                                        <input type="file" accept=".srt" className="hidden-input" ref={el => { refs.origSrt.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'srt', { srtType: 'original' })} />
                                        <div className="ac-upload-icon-wrap">
                                            {uploading[`${movie.id}-srt-0-0`] ? <Loader2 size={22} className="spinning" /> : <FileText size={22} />}
                                        </div>
                                        <div className="ac-upload-label">SRT ئەسڵی</div>
                                        <div className="ac-upload-status">{movie.originalSrt ? '✓ بارکراوە' : 'کلیک بکە'}</div>
                                    </div>

                                    {/* Translated SRT */}
                                    <div className={`ac-upload-card ${movie.translatedSrt ? 'done' : ''}`} onClick={() => refs.transSrt.current[movie.id]?.click()}>
                                        <input type="file" accept=".srt" className="hidden-input" ref={el => { refs.transSrt.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'srt', { srtType: 'translated' })} />
                                        <div className="ac-upload-icon-wrap">
                                            {uploading[`${movie.id}-srt-0-0`] ? <Loader2 size={22} className="spinning" /> : <FileText size={22} />}
                                        </div>
                                        <div className="ac-upload-label">SRT وەرگێڕدراو</div>
                                        <div className="ac-upload-status">{movie.translatedSrt ? '✓ بارکراوە' : 'کلیک بکە'}</div>
                                    </div>
                                </div>
                            )}

                            {/* SERIES MANAGER */}
                            {movie.type === 'series' && expandedSeries[movie.id] && (
                                <div className="series-manager">
                                    <div className="series-manager-header">
                                        <h4><Layers size={15} /> سیزن و ئالقەکان</h4>
                                        <button className="btn-add-season" onClick={() => addSeason(movie.id)}>
                                            <PlusCircle size={14} /> سیزنی نوێ
                                        </button>
                                    </div>
                                    {(!movie.seasons || movie.seasons.length === 0) ? (
                                        <div className="no-seasons">هیچ سیزنێک نییە. "سیزنی نوێ" بکلیک بکە.</div>
                                    ) : movie.seasons.map(season => (
                                            <SeasonPanel
                                                key={season.id}
                                                season={season}
                                                movieId={movie.id}
                                                onAddEpisode={() => addEpisode(movie.id, season.number)}
                                                onBulkAdd={(count) => addBulkEpisodes(movie.id, season.number, count)}
                                                onEpVideo={(n, f) => doUpload(movie.id, f, 'ep-video', { season: season.number, episode: n })}
                                                onEpSrt={(n, f, t) => doUpload(movie.id, f, 'ep-srt', { season: season.number, episode: n, srtType: t })}
                                                onSensitive={(epId) => openSensitiveModal(movie.id, season.number, epId)}
                                                uploading={uploading}
                                                epVideoRef={refs.epVideo}
                                                epOrigSrtRef={refs.epOrigSrt}
                                                epTransSrtRef={refs.epTransSrt}
                                            />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SeasonPanel({ season, movieId, onAddEpisode, onBulkAdd, onEpVideo, onEpSrt, onSensitive, uploading, epVideoRef, epOrigSrtRef, epTransSrtRef }: {
    season: Season; movieId: string;
    onAddEpisode: () => void;
    onBulkAdd: (count: number) => void;
    onEpVideo: (n: number, f: File) => void;
    onEpSrt: (n: number, f: File, t: string) => void;
    onSensitive: (epId: string) => void;
    uploading: Record<string, boolean>;
    epVideoRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
    epOrigSrtRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
    epTransSrtRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
}) {
    const [open, setOpen] = useState(true);
    const [bulkCount, setBulkCount] = useState('');
    const [bulkLoading, setBulkLoading] = useState(false);

    const handleBulk = async () => {
        const n = parseInt(bulkCount);
        if (!n || n < 1) return;
        setBulkLoading(true);
        await onBulkAdd(n);
        setBulkCount('');
        setBulkLoading(false);
    };

    return (
        <div className="season-block">
            <div className="season-block-header" onClick={() => setOpen(!open)}>
                <span className="season-block-title">
                    سیزنی {season.number}: {season.title}
                    <span className="ep-count-badge">{season.episodes.length} ئالقە</span>
                </span>
                <div className="season-header-actions" onClick={e => e.stopPropagation()}>
                    {/* Bulk add */}
                    <div className="bulk-add-row">
                        <input
                            type="number"
                            min={1} max={200}
                            value={bulkCount}
                            onChange={e => setBulkCount(e.target.value)}
                            placeholder="٢٠"
                            className="bulk-count-input"
                            onKeyDown={e => e.key === 'Enter' && handleBulk()}
                        />
                        <button className="btn-bulk-add" onClick={handleBulk} disabled={bulkLoading || !bulkCount}>
                            {bulkLoading ? <Loader2 size={12} className="spinning" /> : <Plus size={12} />}
                            زیاد بکە
                        </button>
                    </div>
                    {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </div>
            </div>
            {open && (
                <div className="episodes-list">
                    {season.episodes.length === 0 ? (
                        <div className="no-episodes">هیچ ئالقەیەک نییە — ژمارەیەک داخڵ بکە و "زیاد بکە" بکلیک بکە.</div>
                    ) : (
                        <>
                            {/* Episode grid */}
                            <div className="ep-grid">
                                {season.episodes.map(ep => {
                                    const k = `${movieId}-${season.number}-${ep.number}`;
                                    const hasVideo = !!ep.videoFile;
                                    const hasSrt = !!ep.translatedSrt;
                                    return (
                                        <div key={ep.id} className="ep-grid-card">
                                            <div className="ep-grid-header">
                                                <div className="ep-grid-num">{ep.number}</div>
                                                <div className="ep-grid-status">
                                                    {hasVideo && <span className="ep-dot ep-dot-video" title="ڤیدیۆ هەیە">V</span>}
                                                    {hasSrt && <span className="ep-dot ep-dot-srt" title="SRT هەیە">S</span>}
                                                </div>
                                            </div>
                                            <div className="ep-grid-title">{ep.title}</div>
                                            <div className="ep-grid-btns">
                                                <input type="file" accept="video/*" className="hidden-input" ref={el => { epVideoRef.current[`${k}-v`] = el; }} onChange={e => e.target.files?.[0] && onEpVideo(ep.number, e.target.files[0])} />
                                                <button className={`ep-mini-btn ${hasVideo ? 'done' : ''}`} onClick={() => epVideoRef.current[`${k}-v`]?.click()} title="ڤیدیۆ بار بکە">
                                                    <Video size={11} />
                                                </button>

                                                <input type="file" accept=".srt" className="hidden-input" ref={el => { epOrigSrtRef.current[`${k}-o`] = el; }} onChange={e => e.target.files?.[0] && onEpSrt(ep.number, e.target.files[0], 'original')} />
                                                <button className={`ep-mini-btn ${ep.originalSrt ? 'done' : ''}`} onClick={() => epOrigSrtRef.current[`${k}-o`]?.click()} title="SRT ئەسڵی">
                                                    <FileText size={11} />
                                                </button>

                                                <input type="file" accept=".srt" className="hidden-input" ref={el => { epTransSrtRef.current[`${k}-t`] = el; }} onChange={e => e.target.files?.[0] && onEpSrt(ep.number, e.target.files[0], 'translated')} />
                                                <button className={`ep-mini-btn ${hasSrt ? 'done' : ''}`} onClick={() => epTransSrtRef.current[`${k}-t`]?.click()} title="SRT کوردی">
                                                    <Languages size={11} />
                                                </button>

                                                <button className={`ep-mini-btn ${ep.sensitiveScenes?.length ? 'done-alert' : ''}`} style={ep.sensitiveScenes?.length ? {background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: '#ef4444'} : {}} onClick={() => onSensitive(ep.id)} title="کاتە نەشیاوەکان">
                                                    <Shield size={11} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="ep-legend">
                                <span className="ep-dot ep-dot-video">V</span> = ڤیدیۆ هەیە &nbsp;
                                <span className="ep-dot ep-dot-srt">S</span> = SRT کوردی هەیە
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
