import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    Plus, Film, Trash2, Edit3, Save, X,
    CheckCircle, AlertCircle, Loader2, FileText,
    Image, Video, Layers, ChevronDown, ChevronUp,
    PlusCircle, ListVideo, Upload, Languages, Shield, Link as LinkIcon, Star, Play
} from 'lucide-react';
import { Movie, Season, Episode } from '../types';
import SrtTranslator from './SrtTranslator';
import './Admin.css';

interface Toast { id: number; msg: string; type: 'success' | 'error'; }

const GENRES_LIST = [
    'تاوانکاری', 'دراما', 'زانستی خەیاڵی', 'هەستبزوێن', 'ئاکشن', 'سەرکێشی', 'خێزانی', 'خەیاڵی',
    'موزیک', 'مێژوویی', 'ترسناک', 'دۆکیۆمێنتاری', 'کۆمێدی', 'ڕۆژئاوایی', 'وەرزشی', 'پزیشکی',
    'کورتە', 'کۆمەڵایەتی', 'تراژیدی', 'سیخوڕی', 'کلاسیک', 'سامۆرای', 'بیۆگرافی', 'جەنگ'
];

const genreMap: Record<string, string> = {
    'Crime': 'تاوانکاری', 'Drama': 'دراما', 'Sci-Fi': 'زانستی خەیاڵی', 'Thriller': 'هەستبزوێن',
    'Action': 'ئاکشن', 'Adventure': 'سەرکێشی', 'Family': 'خێزانی', 'Fantasy': 'خەیاڵی',
    'Music': 'موزیک', 'History': 'مێژوویی', 'Horror': 'ترسناک', 'Documentary': 'دۆکیۆمێنتاری',
    'Comedy': 'کۆمێدی', 'Western': 'ڕۆژئاوایی', 'Sport': 'وەرزشی', 'Short': 'کورتە',
    'Romance': 'ڕۆمانسی', 'War': 'جەنگ', 'Biography': 'بیۆگرافی', 'Mystery': 'نهێنی ئامێز',
    'Animation': 'ئەنیمێشن'
};

export default function Admin() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editMovie, setEditMovie] = useState<Movie | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});

    const [sensitiveTarget, setSensitiveTarget] = useState<{ movieId: string, seasonNum?: number, episodeId?: string } | null>(null);
    const [sensitiveScenes, setSensitiveScenes] = useState<{ start: number, end: number }[]>([]);

    const [fetchingImdbRating, setFetchingImdbRating] = useState(false);

    const [form, setForm] = useState({
        title: '', description: '', descriptionKu: '', descriptionEn: '', descriptionAr: '', language: '', genre: '', year: new Date().getFullYear().toString(),
        duration: '', type: 'movie' as 'movie' | 'series' | 'animation', imdbRating: '',
        posterUrl: '', seasons: [] as Season[]
    });

    const refs = {
        video: useRef<Record<string, HTMLInputElement | null>>({}),
        poster: useRef<Record<string, HTMLInputElement | null>>({}),
        origSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        transSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        epVideo: useRef<Record<string, HTMLInputElement | null>>({}),
        epOrigSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        epTransSrt: useRef<Record<string, HTMLInputElement | null>>({}),
        r2Video: useRef<Record<string, HTMLInputElement | null>>({}),
        r2EpVideo: useRef<Record<string, HTMLInputElement | null>>({}),
    };

    const toast = (msg: string, type: 'success' | 'error' = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, msg, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
    };

    const load = () => {
        setLoading(true);
        axios.get('/api/movies')
            .then(r => { setMovies(r.data); })
            .catch(() => toast('نەتوانرا داتا بهێندرێت', 'error'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const handleCreate = async () => {
        if (!form.title.trim()) { toast('ناوی بەرهەمەکە داخڵ بکە', 'error'); return; }
        try {
            await axios.post('/api/admin/movies', { ...form, year: parseInt(form.year) });
            toast('بە سەرکەوتوویی زیاد کرا ✓');
            setShowForm(false);
            setForm({ title: '', description: '', descriptionKu: '', descriptionEn: '', descriptionAr: '', language: '', genre: '', year: new Date().getFullYear().toString(), duration: '', type: 'movie' as 'movie' | 'series' | 'animation', imdbRating: '', posterUrl: '', seasons: [] });
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

        const updatedMovie = JSON.parse(JSON.stringify(movies[movieIdx]));

        if (sensitiveTarget.episodeId !== undefined && sensitiveTarget.seasonNum !== undefined) {
            const season = updatedMovie.seasons.find((s: Season) => s.number === sensitiveTarget.seasonNum);
            if (season) {
                const ep = season.episodes.find((e: Episode) => e.id === sensitiveTarget.episodeId);
                if (ep) ep.sensitiveScenes = sensitiveScenes;
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
        setUploadProgress(p => ({ ...p, [key]: 0 }));
        
        const fd = new FormData();
        const config = {
            onUploadProgress: (progressEvent: any) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(p => ({ ...p, [key]: percentCompleted }));
            }
        };

        try {
            if (type === 'video') { fd.append('video', file); await axios.post(`/api/admin/movies/${movieId}/video`, fd, config); toast('ڤیدیۆکە بارکرا ✓'); }
            else if (type === 'poster') { fd.append('poster', file); await axios.post(`/api/admin/movies/${movieId}/poster`, fd, config); toast('وێنەی پۆستەر بارکرا ✓'); }
            else if (type === 'srt') { fd.append('srt', file); await axios.post(`/api/admin/movies/${movieId}/srt/${extra?.srtType}`, fd, config); toast(`SRT ${extra?.srtType === 'original' ? 'ئەسڵی' : 'وەرگێڕدراو'} بارکرا ✓`); }
            else if (type === 'ep-video') { fd.append('video', file); await axios.post(`/api/admin/movies/${movieId}/seasons/${extra!.season}/episodes/${extra!.episode}/video`, fd, config); toast(`ڤیدیۆی ئالقەی ${extra!.episode} بارکرا ✓`); }
            else if (type === 'ep-srt') { fd.append('srt', file); await axios.post(`/api/admin/movies/${movieId}/seasons/${extra!.season}/episodes/${extra!.episode}/srt/${extra!.srtType}`, fd, config); toast(`SRT ئالقەی ${extra!.episode} بارکرا ✓`); }
            load();
        } catch { toast('بارکردن سەرکەوتوو نەبوو', 'error'); }
        finally { 
            setUploading(u => ({ ...u, [key]: false }));
            setUploadProgress(p => ({ ...p, [key]: 0 }));
        }
    };

    const doR2Upload = async (movieId: string, file: File, target: 'video' | 'poster', extra?: { season?: number; episodeId?: string; episodeNum?: number }) => {
        const key = `${movieId}-${target}-${extra?.episodeId || 'main'}`;
        setUploading(u => ({ ...u, [key]: true }));
        setUploadProgress(p => ({ ...p, [key]: 0 }));

        const config = {
            onUploadProgress: (progressEvent: any) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(p => ({ ...p, [key]: percentCompleted }));
            }
        };

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('movieId', movieId);
            fd.append('target', target);
            if (extra?.season !== undefined) fd.append('season', String(extra.season));
            if (extra?.episodeId) fd.append('episodeId', extra.episodeId);

            await axios.post('/api/admin/r2/upload', fd, config);
            toast(`فایلەکە بە سەرکەوتوویی بارکرا ☁️`);
            load();
        } catch (err: any) {
            console.error("R2 Error:", err);
            const errMsg = err?.response?.data?.error || err.message || "هەڵەیەک لە کاتی ئەپلۆد ڕوویدا";
            toast(`هەڵە: ${errMsg}`, 'error');
        } finally {
            setUploading(u => ({ ...u, [key]: false }));
            setUploadProgress(p => ({ ...p, [key]: 0 }));
        }
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

    const saveMovieVideoUrl = async (movieId: string, url: string) => {
        const m = movies.find(x => x.id === movieId);
        if (!m) return;
        const updated = JSON.parse(JSON.stringify(m));
        updated.videoUrl = url;
        try {
            await axios.put(`/api/admin/movies/${movieId}`, updated);
            toast('لینکی ڤیدیۆ پاشەکەوت کرا ✓');
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const saveEpVideoUrl = async (movieId: string, seasonNum: number, epId: string, url: string) => {
        const m = movies.find(x => x.id === movieId);
        if (!m) return;
        const updated = JSON.parse(JSON.stringify(m));
        const season = updated.seasons?.find((s: Season) => s.number === seasonNum);
        const ep = season?.episodes.find((e: Episode) => e.id === epId);
        if (ep) { ep.videoUrl = url; }
        try {
            await axios.put(`/api/admin/movies/${movieId}`, updated);
            toast('لینکی ڤیدیۆ پاشەکەوت کرا ✓');
            load();
        } catch { toast('کێشەیەک ڕووی دا', 'error'); }
    };

    const fetchImdbRating = async (title: string, isEditForm: boolean = false) => {
        if (!title) {
            toast('تکایە ناوی فیلمەکە داخڵ بکە بۆ هێنانی زانیارییەکان', 'error');
            return;
        }
        setFetchingImdbRating(true);
        try {
            const response = await axios.get(`/api/omdb-rating?title=${encodeURIComponent(title)}`);
            const { imdbRating, plotEn, plotKu, plotAr, genre, year, runtime, poster, type, seasons, language } = response.data;
            
            // Translate genres
            let kurdishGenres = '';
            if (genre) {
                const englishGenres = genre.split(',').map((g: string) => g.trim());
                const translated = englishGenres.map((g: string) => genreMap[g] || g);
                kurdishGenres = translated.join('، ');
            }

            if (isEditForm) {
                setEditMovie(m => m ? { 
                    ...m, 
                    imdbRating: imdbRating !== null ? imdbRating.toString() : '',
                    description: m.description || plotKu || '',
                    descriptionKu: m.descriptionKu || plotKu || '',
                    descriptionEn: m.descriptionEn || plotEn || '',
                    descriptionAr: m.descriptionAr || plotAr || '',
                    language: m.language || language || '',
                    genre: m.genre || kurdishGenres || '',
                    year: m.year || year || m.year,
                    duration: m.duration || runtime || '',
                    type: type || m.type,
                    posterUrl: m.posterUrl || poster || '',
                    seasons: seasons && seasons.length > 0 && (!m.seasons || m.seasons.length === 0) ? seasons : m.seasons
                } : null);
            } else {
                setForm(f => ({ 
                    ...f, 
                    imdbRating: imdbRating !== null ? imdbRating.toString() : '',
                    description: f.description || plotKu || '',
                    descriptionKu: f.descriptionKu || plotKu || '',
                    descriptionEn: f.descriptionEn || plotEn || '',
                    descriptionAr: f.descriptionAr || plotAr || '',
                    language: f.language || language || '',
                    genre: f.genre || kurdishGenres || '',
                    year: f.year === new Date().getFullYear().toString() ? (year?.toString() || f.year) : f.year,
                    duration: f.duration || runtime || '',
                    type: type || f.type,
                    posterUrl: f.posterUrl || poster || '',
                    seasons: seasons && seasons.length > 0 ? seasons : f.seasons
                }));
            }
            toast(`زانیارییەکانی ${title} دۆزرانەوە بە سەرکەوتوویی`);
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || 'کێشەیەک لە هێنانی زانیارییەکان ڕوویدا';
            toast(errorMessage, 'error');
        } finally {
            setFetchingImdbRating(false);
        }
    };

    return (
        <div className="admin-page">
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

            {showForm && (
                <div className="form-overlay" onClick={() => setShowForm(false)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>بەرهەمی نوێ</h2>
                            <button onClick={() => setShowForm(false)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            {form.posterUrl && (
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
                                    <img src={form.posterUrl} alt="Poster" style={{ width: '120px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />
                                </div>
                            )}
                            <div className="type-selector">
                                <button className={`type-btn ${form.type === 'movie' ? 'active-movie' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'movie' }))}>
                                    <Film size={18} /> فیلم
                                </button>
                                <button className={`type-btn ${form.type === 'series' ? 'active-series' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'series' }))}>
                                    <Layers size={18} /> زنجیرە
                                </button>
                                <button className={`type-btn ${form.type === 'animation' ? 'active-animation' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'animation' }))}>
                                    <Play size={18} /> ئەنیمێشن
                                </button>
                            </div>
                            <div className="form-group"><label>ناو *</label><input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="form-input" /></div>
                            
                            <div className="form-group"><label>زمانی قسەکردن</label><input type="text" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} className="form-input" placeholder="بۆ نموونە: English, Spanish" /></div>

                            <div className="form-group"><label>باس (کوردی)</label><textarea value={form.descriptionKu || form.description} onChange={e => setForm(f => ({ ...f, descriptionKu: e.target.value, description: e.target.value }))} className="form-input form-textarea" rows={3} /></div>
                            <div className="form-group"><label>باس (English)</label><textarea value={form.descriptionEn} onChange={e => setForm(f => ({ ...f, descriptionEn: e.target.value }))} className="form-input form-textarea" rows={2} /></div>
                            <div className="form-group"><label>باس (عربي)</label><textarea value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} className="form-input form-textarea" rows={2} /></div>
                            
                            <div className="form-group">
                                <label>ژانڕ</label>
                                <div className="genre-admin-grid">
                                    {GENRES_LIST.map(g => {
                                        const isSelected = form.genre.split(',').map(x => x.trim()).includes(g);
                                        return (
                                            <label key={g} className="genre-admin-label">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        const current = form.genre.split(',').map(x => x.trim()).filter(Boolean);
                                                        if (isSelected) {
                                                            setForm(f => ({ ...f, genre: current.filter(x => x !== g).join(', ') }));
                                                        } else {
                                                            setForm(f => ({ ...f, genre: [...current, g].join(', ') }));
                                                        }
                                                    }}
                                                />
                                                <span className="checkbox-custom-admin"></span>
                                                {g}
                                            </label>
                                        );
                                    })}
                                </div>
                                <input type="text" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} className="form-input" style={{ marginTop: '8px' }} placeholder="یان لێرە بینوسە..." />
                            </div>

                            <div className="form-row">
                                <div className="form-group"><label>ساڵ</label><input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="form-input" /></div>
                                {(form.type === 'movie' || form.type === 'animation') && <div className="form-group"><label>کات</label><input type="text" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} className="form-input" /></div>}
                            </div>
                            <div className="form-group">
                                <label>ڕەیتینگی IMDb</label>
                                <div className="imdb-rating-input-group">
                                    <input type="text" value={form.imdbRating} onChange={e => setForm(f => ({ ...f, imdbRating: e.target.value }))} className="form-input" placeholder="بۆ نموونە: 7.5" />
                                    <button onClick={() => fetchImdbRating(form.title)} className="btn-fetch-imdb" disabled={fetchingImdbRating}>
                                        {fetchingImdbRating ? <Loader2 size={16} className="spinning" /> : <Star size={16} />}
                                        هێنان
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setShowForm(false)} className="btn-cancel">پاشگەز</button>
                            <button onClick={handleCreate} className="btn-save"><Save size={16} /> زیادکردن</button>
                        </div>
                    </div>
                </div>
            )}

            {editMovie && (
                <div className="form-overlay" onClick={() => setEditMovie(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2>دەستکاریکردن: {editMovie.title}</h2>
                            <button onClick={() => setEditMovie(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            {editMovie.posterUrl && (
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
                                    <img src={editMovie.posterUrl} alt="Poster" style={{ width: '120px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />
                                </div>
                            )}
                            <div className="form-group"><label>ناو *</label><input type="text" value={editMovie.title} onChange={e => setEditMovie(m => m ? { ...m, title: e.target.value } : null)} className="form-input" /></div>
                            
                            <div className="form-group"><label>زمانی قسەکردن</label><input type="text" value={editMovie.language || ''} onChange={e => setEditMovie(m => m ? { ...m, language: e.target.value } : null)} className="form-input" placeholder="بۆ نموونە: English, Spanish" /></div>

                            <div className="form-group"><label>باس (کوردی)</label><textarea value={editMovie.descriptionKu || editMovie.description} onChange={e => setEditMovie(m => m ? { ...m, descriptionKu: e.target.value, description: e.target.value } : null)} className="form-input form-textarea" rows={3} /></div>
                            <div className="form-group"><label>باس (English)</label><textarea value={editMovie.descriptionEn || ''} onChange={e => setEditMovie(m => m ? { ...m, descriptionEn: e.target.value } : null)} className="form-input form-textarea" rows={2} /></div>
                            <div className="form-group"><label>باس (عربي)</label><textarea value={editMovie.descriptionAr || ''} onChange={e => setEditMovie(m => m ? { ...m, descriptionAr: e.target.value } : null)} className="form-input form-textarea" rows={2} /></div>
                            
                            <div className="form-group">
                                <label>ژانڕ</label>
                                <div className="genre-admin-grid">
                                    {GENRES_LIST.map(g => {
                                        const isSelected = editMovie.genre?.split(',').map(x => x.trim()).includes(g);
                                        return (
                                            <label key={g} className="genre-admin-label">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        const current = editMovie.genre?.split(',').map(x => x.trim()).filter(Boolean) || [];
                                                        let newGenre = '';
                                                        if (isSelected) {
                                                            newGenre = current.filter(x => x !== g).join(', ');
                                                        } else {
                                                            newGenre = [...current, g].join(', ');
                                                        }
                                                        setEditMovie(m => m ? { ...m, genre: newGenre } : null);
                                                    }}
                                                />
                                                <span className="checkbox-custom-admin"></span>
                                                {g}
                                            </label>
                                        );
                                    })}
                                </div>
                                <input type="text" value={editMovie.genre} onChange={e => setEditMovie(m => m ? { ...m, genre: e.target.value } : null)} className="form-input" style={{ marginTop: '8px' }} placeholder="یان لێرە بینوسە..." />
                            </div>

                            <div className="form-row">
                                <div className="form-group"><label>ساڵ</label><input type="number" value={editMovie.year} onChange={e => setEditMovie(m => m ? { ...m, year: +e.target.value } : null)} className="form-input" /></div>
                                <div className="form-group"><label>کات</label><input type="text" value={editMovie.duration} onChange={e => setEditMovie(m => m ? { ...m, duration: e.target.value } : null)} className="form-input" /></div>
                            </div>
                            <div className="form-group">
                                <label>ڕەیتینگی IMDb</label>
                                <div className="imdb-rating-input-group">
                                    <input type="text" value={editMovie.imdbRating || ''} onChange={e => setEditMovie(m => m ? { ...m, imdbRating: e.target.value } : null)} className="form-input" placeholder="بۆ نموونە: 7.5" />
                                    <button onClick={() => fetchImdbRating(editMovie.title, true)} className="btn-fetch-imdb" disabled={fetchingImdbRating}>
                                        {fetchingImdbRating ? <Loader2 size={16} className="spinning" /> : <Star size={16} />}
                                        هێنان
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setEditMovie(null)} className="btn-cancel">پاشگەز</button>
                            <button onClick={handleSaveEdit} className="btn-save"><Save size={16} /> پاشەکەوتکردن</button>
                        </div>
                    </div>
                </div>
            )}

            {sensitiveTarget && (
                <div className="form-overlay" onClick={() => setSensitiveTarget(null)}>
                    <div className="form-modal" onClick={e => e.stopPropagation()}>
                        <div className="form-header">
                            <h2><Shield size={20} color="#f87171" style={{marginLeft: '8px', verticalAlign: 'middle'}}/> کاتە نەشیاوەکان</h2>
                            <button onClick={() => setSensitiveTarget(null)} className="close-btn"><X size={20} /></button>
                        </div>
                        <div className="form-body">
                            {sensitiveScenes.length === 0 ? (
                                <div style={{textAlign: 'center', padding: '20px', color: '#64748b'}}>هیچ دیمەنێکی نەشیاو نییە.</div>
                            ) : (
                                <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                                    {sensitiveScenes.map((s, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{fontSize: '12px', color: '#cbd5e1'}}>دەستپێک</label>
                                                <input type="number" value={s.start} onChange={e => {
                                                    const newS = [...sensitiveScenes];
                                                    newS[i].start = Number(e.target.value);
                                                    setSensitiveScenes(newS);
                                                }} className="form-input" />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{fontSize: '12px', color: '#cbd5e1'}}>کۆتایی</label>
                                                <input type="number" value={s.end} onChange={e => {
                                                    const newS = [...sensitiveScenes];
                                                    newS[i].end = Number(e.target.value);
                                                    setSensitiveScenes(newS);
                                                }} className="form-input" />
                                            </div>
                                            <button className="btn-cancel" onClick={() => setSensitiveScenes(sensitiveScenes.filter((_, idx) => idx !== i))}><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button className="btn-add" style={{width: '100%', marginTop: '10px'}} onClick={() => setSensitiveScenes([...sensitiveScenes, { start: 0, end: 0 }])}><Plus size={16}/> کاتی نوێ</button>
                        </div>
                        <div className="form-footer">
                            <button onClick={() => setSensitiveTarget(null)} className="btn-cancel">پاشگەز</button>
                            <button onClick={handleSaveSensitive} className="btn-save"><Save size={16} /> پاشەکەوت</button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="admin-loading"><Loader2 size={32} className="spinning" /></div>
            ) : (
                <div className="movies-admin-list">
                    {movies.map(movie => (
                        <div key={movie.id} className="admin-card">
                            <div className="ac-top">
                                <div className="ac-poster" onClick={() => refs.poster.current[movie.id]?.click()}>
                                    {(movie.posterCloudUrl || movie.posterUrl) ? <img src={movie.posterCloudUrl || movie.posterUrl} className="ac-poster-img" alt="" /> : <div className="ac-poster-placeholder"><Upload size={22} /></div>}
                                    <input type="file" className="hidden-input" ref={el => { refs.poster.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'poster')} />
                                </div>
                                <div className="ac-info">
                                    <h3 className="ac-title">{movie.title}</h3>
                                    <div className="ac-meta">
                                        <span>{movie.year}</span>
                                        <span className={`type-badge ${movie.type}`}>{movie.type === 'movie' ? 'فیلم' : movie.type === 'animation' ? 'ئەنیمێشن' : 'زنجیرە'}</span>
                                    </div>
                                    <p className="ac-desc">{movie.description}</p>
                                </div>
                                <div className="ac-actions">
                                    {(movie.type === 'movie' || movie.type === 'animation') && <button className="ac-btn" onClick={() => openSensitiveModal(movie.id)}><Shield size={16} /></button>}
                                    <button className="ac-btn" onClick={() => setEditMovie(movie)}><Edit3 size={16} /></button>
                                    <button className="ac-btn" onClick={() => handleDelete(movie)}><Trash2 size={16} /></button>
                                    {movie.type === 'series' && (
                                        <button className="ac-btn" onClick={() => setExpandedSeries(e => ({ ...e, [movie.id]: !e[movie.id] }))}><ListVideo size={16} /></button>
                                    )}
                                </div>
                            </div>

                            {movie.type !== 'series' && (
                                <div className="ac-uploads">
                                    <div className={`ac-upload-card ${movie.videoFile ? 'done' : ''}`} onClick={() => refs.video.current[movie.id]?.click()}>
                                        <input type="file" className="hidden-input" ref={el => { refs.video.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'video')} />
                                        <div className="ac-upload-icon-wrap">
                                            {uploading[`${movie.id}-video-0-0`] ? 
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                                                    <Loader2 className="spinning" />
                                                    <span style={{ fontSize: '12px' }}>{uploadProgress[`${movie.id}-video-0-0`] || 0}%</span>
                                                </div> 
                                                : <Video size={22} />}
                                        </div>
                                        <div className="ac-upload-label">Server</div>
                                    </div>
                                    <div className={`ac-upload-card cloud-upload ${movie.videoUrl && movie.videoUrl.includes('r2') ? 'done' : ''}`} onClick={() => refs.r2Video.current[movie.id]?.click()}>
                                        <input type="file" className="hidden-input" ref={el => { refs.r2Video.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doR2Upload(movie.id, e.target.files[0], 'video')} />
                                        <div className="ac-upload-icon-wrap">
                                            {uploading[`${movie.id}-video-main`] ? 
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                                                    <Loader2 className="spinning" />
                                                    <span style={{ fontSize: '12px' }}>{uploadProgress[`${movie.id}-video-main`] || 0}%</span>
                                                </div>
                                                : <Upload size={22} />}
                                        </div>
                                        <div className="ac-upload-label">Cloud R2</div>
                                    </div>

                                    <div className={`ac-upload-card ${movie.videoUrl ? 'done' : ''}`} onClick={() => { const u = window.prompt('URL:', movie.videoUrl || ''); if(u) saveMovieVideoUrl(movie.id, u); }}>
                                        <div className="ac-upload-icon-wrap">
                                            <LinkIcon size={22} />
                                        </div>
                                        <div className="ac-upload-label">Link 🔗</div>
                                    </div>
                                    
                                    <div className={`ac-upload-card ${movie.originalSrt ? 'done' : ''}`} onClick={() => refs.origSrt.current[movie.id]?.click()}>
                                        <input type="file" className="hidden-input" ref={el => { refs.origSrt.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'srt', { srtType: 'original' })} />
                                        <div className="ac-upload-icon-wrap">
                                            {uploading[`${movie.id}-srt-0-0`] ? <Loader2 className="spinning" /> : <FileText size={22} />}
                                        </div>
                                        <div className="ac-upload-label">SRT ئەسڵی</div>
                                    </div>
                                    
                                    <div className={`ac-upload-card ${movie.translatedSrt ? 'done' : ''}`} onClick={() => refs.transSrt.current[movie.id]?.click()}>
                                        <input type="file" className="hidden-input" ref={el => { refs.transSrt.current[movie.id] = el; }} onChange={e => e.target.files?.[0] && doUpload(movie.id, e.target.files[0], 'srt', { srtType: 'translated' })} />
                                        <div className="ac-upload-icon-wrap">
                                            {uploading[`${movie.id}-srt-0-0`] ? <Loader2 className="spinning" /> : <Languages size={22} />}
                                        </div>
                                        <div className="ac-upload-label">SRT کوردی</div>
                                    </div>
                                </div>
                            )}

                            {movie.type === 'series' && expandedSeries[movie.id] && (
                                <div className="series-manager">
                                    <div className="series-manager-header">
                                        <h4>سیزن و ئالقەکان</h4>
                                        <button className="btn-add-season" onClick={() => addSeason(movie.id)}>سیزنی نوێ</button>
                                    </div>
                                    {movie.seasons?.map(season => (
                                        <SeasonPanel
                                            key={season.id}
                                            season={season}
                                            movieId={movie.id}
                                            onAddEpisode={() => addEpisode(movie.id, season.number)}
                                            onBulkAdd={(count: number) => addBulkEpisodes(movie.id, season.number, count)}
                                            onEpVideo={(n: number, f: File) => doUpload(movie.id, f, 'ep-video', { season: season.number, episode: n })}
                                            onEpSrt={(n: number, f: File, t: string) => doUpload(movie.id, f, 'ep-srt', { season: season.number, episode: n, srtType: t })}
                                            onSensitive={(epId: string) => openSensitiveModal(movie.id, season.number, epId)}
                                            onEpVideoUrl={(epId: string, url: string) => saveEpVideoUrl(movie.id, season.number, epId, url)}
                                            onR2Upload={(n: number, f: File, id: string) => doR2Upload(movie.id, f, 'video', { season: season.number, episodeId: id })}
                                            uploading={uploading}
                                            uploadProgress={uploadProgress}
                                            epVideoRef={refs.epVideo}
                                            epOrigSrtRef={refs.epOrigSrt}
                                            epTransSrtRef={refs.epTransSrt}
                                            r2EpVideoRef={refs.r2EpVideo}
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

function SeasonPanel({ season, movieId, onAddEpisode, onBulkAdd, onEpVideo, onEpSrt, onSensitive, onEpVideoUrl, onR2Upload, uploading, uploadProgress, epVideoRef, epOrigSrtRef, epTransSrtRef, r2EpVideoRef }: any) {
    const [open, setOpen] = useState(true);
    const [bulkCount, setBulkCount] = useState('');

    return (
        <div className="season-block">
            <div className="season-block-header" onClick={() => setOpen(!open)}>
                <span>سیزنی {season.number} ({season.episodes.length} ئالقە)</span>
                <div>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
            </div>
            {open && (
                <div className="episodes-list">
                    <div className="bulk-add-row" onClick={e => e.stopPropagation()}>
                        <input type="number" value={bulkCount} onChange={e => setBulkCount(e.target.value)} placeholder="ژمارە" />
                        <button onClick={() => onBulkAdd(Number(bulkCount))}>زیادکردن</button>
                    </div>
                    <div className="ep-grid">
                        {season.episodes.map((ep: Episode) => (
                            <div key={ep.id} className="ep-grid-card">
                                <div className="ep-grid-title">{ep.number}. {ep.title}</div>
                                <div className="ep-grid-btns">
                                    <input type="file" className="hidden-input" ref={el => { epVideoRef.current[ep.id] = el; }} onChange={e => e.target.files?.[0] && onEpVideo(ep.number, e.target.files[0])} />
                                    <button className={`ep-mini-btn ${ep.videoFile ? 'done' : ''}`} onClick={() => epVideoRef.current[ep.id]?.click()}>
                                        {uploading[`${movieId}-ep-video-${season.number}-${ep.number}`] ? (
                                            <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
                                                <Loader2 size={11} className="spinning" />
                                                <span style={{fontSize: '9px'}}>{uploadProgress[`${movieId}-ep-video-${season.number}-${ep.number}`] || 0}%</span>
                                            </div>
                                        ) : <Video size={11} />}
                                    </button>

                                    <input type="file" className="hidden-input" ref={el => { r2EpVideoRef.current[ep.id] = el; }} onChange={e => e.target.files?.[0] && onR2Upload(ep.number, e.target.files[0], ep.id)} />
                                    <button className={`ep-mini-btn cloud-upload-btn ${ep.videoUrl && ep.videoUrl.includes('r2') ? 'done' : ''}`} onClick={() => r2EpVideoRef.current[ep.id]?.click()}>
                                        {uploading[`${movieId}-video-${ep.id}`] ? (
                                            <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
                                                <Loader2 size={11} className="spinning" />
                                                <span style={{fontSize: '9px'}}>{uploadProgress[`${movieId}-video-${ep.id}`] || 0}%</span>
                                            </div>
                                        ) : <Upload size={11} />}
                                    </button>

                                    <button className="ep-mini-btn" onClick={() => { const u = window.prompt('URL:', ep.videoUrl || ''); if(u) onEpVideoUrl(ep.id, u); }}><LinkIcon size={11} /></button>

                                    <input type="file" className="hidden-input" ref={el => { epOrigSrtRef.current[ep.id] = el; }} onChange={e => e.target.files?.[0] && onEpSrt(ep.number, e.target.files[0], 'original')} />
                                    <button className={`ep-mini-btn ${ep.originalSrt ? 'done' : ''}`} onClick={() => epOrigSrtRef.current[ep.id]?.click()}><FileText size={11} /></button>

                                    <input type="file" className="hidden-input" ref={el => { epTransSrtRef.current[ep.id] = el; }} onChange={e => e.target.files?.[0] && onEpSrt(ep.number, e.target.files[0], 'translated')} />
                                    <button className={`ep-mini-btn ${ep.translatedSrt ? 'done' : ''}`} onClick={() => epTransSrtRef.current[ep.id]?.click()}><Languages size={11} /></button>
                                    
                                    <button className={`ep-mini-btn ${ep.sensitiveScenes?.length ? 'done-alert' : ''}`} onClick={() => onSensitive(ep.id)}><Shield size={11} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
