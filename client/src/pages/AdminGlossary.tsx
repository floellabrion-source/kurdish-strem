import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { 
    BookOpen, Search, Plus, Edit2, Trash2, Download, Upload, 
    Sparkles, X, Check, Filter, AlertCircle, RefreshCw, Layers, 
    Tag, FileText, ChevronDown, CheckCircle2, Copy
} from 'lucide-react';
import './AdminGlossary.css';

export interface GlossaryItem {
    id: string;
    english: string;
    kurdish: string;
    alternatives: string[];
    category: string;
    movieId?: string | null;
    movieTitle?: string | null;
    note: string;
    createdBy?: {
        id?: string;
        username?: string;
        role?: string;
    };
    createdAt?: string;
    updatedAt?: string;
}

export const CATEGORY_MAP: Record<string, { en: string; ku: string }> = {
    'هەموو جۆرەکان': { en: 'All Categories', ku: 'هەموو جۆرەکان' },
    'گشتی': { en: 'General', ku: 'گشتی' },
    'سینەما': { en: 'Cinema & Film', ku: 'سینەما' },
    'سیخوڕی و ئەمنی': { en: 'Spy & Security', ku: 'سیخوڕی و ئەمنی' },
    'سەربازی و کردار': { en: 'Military & Action', ku: 'سەربازی و کردار' },
    'پۆلیسی و یاسایی': { en: 'Police & Legal', ku: 'پۆلیسی و یاسایی' },
    'پزیشکی و زانستی': { en: 'Medical & Science', ku: 'پزیشکی و زانستی' },
    'تەکنیکی و تەکنەلۆژیا': { en: 'Tech & IT', ku: 'تەکنیکی و تەکنەلۆژیا' },
    'مێژوویی و ئەدەبی': { en: 'History & Literature', ku: 'مێژوویی و ئەدەبی' }
};

const CATEGORIES = [
    'هەموو جۆرەکان',
    'گشتی',
    'سینەما',
    'سیخوڕی و ئەمنی',
    'سەربازی و کردار',
    'پۆلیسی و یاسایی',
    'پزیشکی و زانستی',
    'تەکنیکی و تەکنەلۆژیا',
    'مێژوویی و ئەدەبی'
];

export default function AdminGlossary() {
    const { user } = useAuth();
    const { lang } = useLanguage();
    const isSuperAdmin = user?.role === 'super_admin';

    const [glossary, setGlossary] = useState<GlossaryItem[]>([]);
    const [moviesList, setMoviesList] = useState<{ id: string; title: string; type?: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('هەموو جۆرەکان');
    const [selectedMovieScope, setSelectedMovieScope] = useState<string>('all'); // 'all' | 'global' | movieId
    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Searchable Combobox dropdown state (Toolbar)
    const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
    const [scopeSearchQuery, setScopeSearchQuery] = useState('');
    const scopeDropdownRef = useRef<HTMLDivElement>(null);

    // Searchable Combobox dropdown state (Modal)
    const [modalScopeDropdownOpen, setModalScopeDropdownOpen] = useState(false);
    const [modalScopeSearchQuery, setModalScopeSearchQuery] = useState('');
    const modalScopeDropdownRef = useRef<HTMLDivElement>(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<GlossaryItem | null>(null);
    const [formData, setFormData] = useState({
        english: '',
        kurdish: '',
        alternatives: '',
        category: 'گشتی',
        movieId: 'global',
        movieTitle: '',
        note: ''
    });
    const [saving, setSaving] = useState(false);

    // Import state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);

    // Load glossary and movies
    const fetchGlossary = async () => {
        setLoading(true);
        try {
            const [glossaryRes, moviesRes] = await Promise.all([
                axios.get('/api/admin/glossary'),
                axios.get('/api/movies').catch(() => ({ data: [] }))
            ]);
            setGlossary(glossaryRes.data);
            if (Array.isArray(moviesRes.data)) {
                setMoviesList(moviesRes.data.map((m: any) => ({
                    id: String(m.id),
                    title: (m.title || m.originalTitle || 'بێ ناونیشان').trim(),
                    type: m.type
                })));
            }
        } catch (err) {
            console.error('Failed to load glossary:', err);
            showToast('کێشەیەک ڕوویدا لە بارکردنی فەرهەنگدا', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGlossary();
    }, []);

    // Close dropdowns on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (scopeDropdownRef.current && !scopeDropdownRef.current.contains(e.target as Node)) {
                setScopeDropdownOpen(false);
            }
            if (modalScopeDropdownRef.current && !modalScopeDropdownRef.current.contains(e.target as Node)) {
                setModalScopeDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 3500);
    };

    // Deduplicated and sorted movie options with term counts
    const movieOptions = useMemo(() => {
        const map = new Map<string, { id: string; title: string; type?: string; count: number }>();
        
        moviesList.forEach(m => {
            const cleanTitle = m.title.trim();
            if (!cleanTitle) return;
            const lowerKey = cleanTitle.toLowerCase();
            if (!map.has(lowerKey)) {
                const count = glossary.filter(g => g.movieId === m.id || (g.movieTitle && g.movieTitle.toLowerCase() === lowerKey)).length;
                map.set(lowerKey, {
                    id: m.id,
                    title: cleanTitle,
                    type: m.type,
                    count
                });
            }
        });

        return Array.from(map.values()).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count; // shows with terms on top
            return a.title.localeCompare(b.title);
        });
    }, [moviesList, glossary]);

    // Live search filtered options for toolbar
    const filteredToolbarMovieOptions = useMemo(() => {
        if (!scopeSearchQuery.trim()) return movieOptions;
        const q = scopeSearchQuery.toLowerCase().trim();
        return movieOptions.filter(m => m.title.toLowerCase().includes(q));
    }, [movieOptions, scopeSearchQuery]);

    // Live search filtered options for modal
    const filteredModalMovieOptions = useMemo(() => {
        if (!modalScopeSearchQuery.trim()) return movieOptions;
        const q = modalScopeSearchQuery.toLowerCase().trim();
        return movieOptions.filter(m => m.title.toLowerCase().includes(q));
    }, [movieOptions, modalScopeSearchQuery]);

    // Label for currently selected scope
    const selectedScopeLabel = useMemo(() => {
        if (selectedMovieScope === 'all') {
            return lang === 'en' 
                ? '🎬 All Glossaries (Global + 500+ Titles)' 
                : '🎬 هەموو فەرهەنگەکان (گشتی + ٥٠٠+ زنجیرە و فیلم)';
        }
        if (selectedMovieScope === 'global') {
            return lang === 'en' 
                ? '🌐 Global Glossary Only (Platform-wide)' 
                : '🌐 تەنها فەرهەنگی گشتی (تەواوی پلاتفۆرم)';
        }
        const found = movieOptions.find(m => m.id === selectedMovieScope);
        return found 
            ? `🎬 ${found.title} (${found.count} ${lang === 'en' ? 'terms' : 'وشە'})` 
            : (lang === 'en' ? '🎬 Selected Title' : '🎬 زنجیرەی دیاریکراو');
    }, [selectedMovieScope, movieOptions, lang]);

    // Filtered items
    const filteredGlossary = useMemo(() => {
        return glossary.filter(item => {
            // Scope Filter (Show-Specific vs Global)
            if (selectedMovieScope === 'global') {
                if (item.movieId && item.movieId !== 'global') return false;
            } else if (selectedMovieScope !== 'all') {
                const targetMovie = movieOptions.find(m => m.id === selectedMovieScope);
                const targetTitle = targetMovie ? targetMovie.title.toLowerCase() : '';
                const itemTitle = (item.movieTitle || '').toLowerCase();
                const matchesId = item.movieId === selectedMovieScope;
                const matchesTitle = targetTitle && itemTitle === targetTitle;
                if (!matchesId && !matchesTitle) return false;
            }

            // Category Filter
            const matchesCat = selectedCategory === 'هەموو جۆرەکان' || item.category === selectedCategory;
            if (!matchesCat) return false;

            if (!searchTerm.trim()) return true;
            const q = searchTerm.toLowerCase().trim();
            return (
                item.english.toLowerCase().includes(q) ||
                item.kurdish.toLowerCase().includes(q) ||
                (item.movieTitle && item.movieTitle.toLowerCase().includes(q)) ||
                (item.note && item.note.toLowerCase().includes(q)) ||
                item.alternatives.some(a => a.toLowerCase().includes(q))
            );
        });
    }, [glossary, selectedCategory, selectedMovieScope, searchTerm, movieOptions]);

    // Open Modal
    const handleOpenModal = (item?: GlossaryItem) => {
        if (item) {
            setEditingItem(item);
            setFormData({
                english: item.english,
                kurdish: item.kurdish,
                alternatives: item.alternatives.join('، '),
                category: item.category || 'گشتی',
                movieId: item.movieId || 'global',
                movieTitle: item.movieTitle || '',
                note: item.note || ''
            });
        } else {
            setEditingItem(null);
            setFormData({
                english: '',
                kurdish: '',
                alternatives: '',
                category: 'گشتی',
                movieId: selectedMovieScope !== 'all' ? selectedMovieScope : 'global',
                movieTitle: selectedMovieScope !== 'all' && selectedMovieScope !== 'global' 
                    ? (moviesList.find(m => m.id === selectedMovieScope)?.title || '') 
                    : '',
                note: ''
            });
        }
        setShowModal(true);
    };

    // Save Term
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.english.trim() || !formData.kurdish.trim()) {
            showToast(lang === 'en' ? 'Please enter both English and Kurdish terms' : 'تکایە هەردوو وشەی ئینگلیزی و کوردی بنووسە', 'error');
            return;
        }

        setSaving(true);
        try {
            const cleanMovieId = (formData.movieId && formData.movieId !== 'global') ? formData.movieId : null;
            const targetMovie = cleanMovieId ? moviesList.find(m => m.id === cleanMovieId) : null;
            const cleanMovieTitle = targetMovie ? targetMovie.title : (formData.movieTitle || null);

            const payload = {
                english: formData.english.trim(),
                kurdish: formData.kurdish.trim(),
                alternatives: formData.alternatives.split(/[,،]+/).map(a => a.trim()).filter(Boolean),
                category: formData.category,
                movieId: cleanMovieId,
                movieTitle: cleanMovieTitle,
                note: formData.note.trim()
            };

            if (editingItem) {
                const res = await axios.put(`/api/admin/glossary/${editingItem.id}`, payload);
                showToast(res.data.message || (lang === 'en' ? 'Term updated successfully ✓' : 'زاراوەکە نوێکرایەوە ✓'));
            } else {
                const res = await axios.post('/api/admin/glossary', payload);
                showToast(res.data.message || (lang === 'en' ? 'New term added ✓' : 'وشەی نوێ زیادکرا ✓'));
            }

            setShowModal(false);
            fetchGlossary();
        } catch (err: any) {
            console.error('Save glossary error:', err);
            showToast(err.response?.data?.error || (lang === 'en' ? 'Error saving term' : 'کێشەیەک ڕوویدا لە پاشەکەوتکردندا'), 'error');
        } finally {
            setSaving(false);
        }
    };

    // Delete Term
    const handleDelete = async (item: GlossaryItem) => {
        const confirmMsg = lang === 'en'
            ? `Are you sure you want to delete the term (${item.english} ➜ ${item.kurdish})?`
            : `ئایا دڵنیایت لە سڕینەوەی وشەی (${item.english} ➜ ${item.kurdish})؟`;
        if (!window.confirm(confirmMsg)) {
            return;
        }

        try {
            const res = await axios.delete(`/api/admin/glossary/${item.id}`);
            showToast(res.data.message || (lang === 'en' ? 'Term deleted ✓' : 'وشەکە سڕدرایەوە ✓'));
            setGlossary(prev => prev.filter(g => g.id !== item.id));
        } catch (err: any) {
            console.error('Delete error:', err);
            showToast(err.response?.data?.error || (lang === 'en' ? 'Failed to delete term' : 'نەتوانرا وشەکە بسڕدرێتەوە'), 'error');
        }
    };

    // Export Glossary JSON
    const handleExport = async () => {
        try {
            const res = await axios.get('/api/admin/glossary/export', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `kurdish_stream_glossary_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast(lang === 'en' ? 'Glossary downloaded ✓' : 'فەرهەنگەکە دابەزێندرا ✓');
        } catch (err) {
            showToast(lang === 'en' ? 'Download failed' : 'کێشەیەک لە دابەزاندندا ڕوویدا', 'error');
        }
    };

    // Import Glossary JSON
    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const content = event.target?.result as string;
                const json = JSON.parse(content);
                const items = Array.isArray(json) ? json : json.glossary || [];

                if (!Array.isArray(items) || items.length === 0) {
                    showToast(lang === 'en' ? 'File is empty or invalid' : 'فایلەکە بەتاڵە یان ناڕێکە', 'error');
                    setImporting(false);
                    return;
                }

                const res = await axios.post('/api/admin/glossary/import', { items });
                showToast(res.data.message || (lang === 'en' ? 'Glossary imported successfully ✓' : 'فەرهەنگ بە سەرکەوتوویی هاوردە کرا ✓'));
                fetchGlossary();
            } catch (err: any) {
                console.error('Import error:', err);
                showToast(err.response?.data?.error || (lang === 'en' ? 'Error reading JSON file' : 'کێشەیەک لە خوێندنەوەی فایلەکەدا هەیە'), 'error');
            } finally {
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className={`admin-glossary-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {toastMessage && (
                <div className={`glossary-toast ${toastMessage.type}`}>
                    {toastMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* Top Header */}
            <div className="glossary-header">
                <div className="glossary-header-title">
                    <div className="glossary-icon-wrap">
                        <BookOpen size={24} color="#0284c7" />
                    </div>
                    <div>
                        <h2>{lang === 'en' ? 'Team Unified Translation Glossary' : 'فەرهەنگۆک و وشەنامەی یەکگرتووی تیم'}</h2>
                        <p>{lang === 'en' ? 'Standardize sensitive terminology and character vocabulary across all movies & series.' : 'یەکخستنی وەرگێڕانی زاراوە هەستیار و سینەماییەکان بۆ تەواوی پلاتفۆرم و زنجیرەکان'}</p>
                    </div>
                </div>

                <div className="glossary-header-actions">
                    <button className="btn-glossary-action btn-add-term" onClick={() => handleOpenModal()}>
                        <Plus size={16} /> {lang === 'en' ? 'Add New Term' : 'زیادکردنی وشەی نوێ'}
                    </button>
                    <button className="btn-glossary-action btn-export" onClick={handleExport} title={lang === 'en' ? 'Download Glossary JSON' : 'داگرتنی فەرهەنگ'}>
                        <Download size={16} /> {lang === 'en' ? 'Export' : 'هەناردەکردن'}
                    </button>
                    <button className="btn-glossary-action btn-import" onClick={handleImportClick} disabled={importing} title={lang === 'en' ? 'Import Glossary JSON' : 'هاوردەکردنی فەرهەنگ'}>
                        <Upload size={16} /> {importing ? (lang === 'en' ? 'Importing...' : 'هاوردەکردن...') : (lang === 'en' ? 'Import' : 'هاوردەکردن')}
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept=".json" 
                        onChange={handleFileChange} 
                    />
                </div>
            </div>

            {/* Stats & Search Toolbar */}
            <div className="glossary-toolbar">
                <div className="glossary-search-wrap">
                    <Search size={18} className="glossary-search-icon" />
                    <input 
                        type="text"
                        placeholder={lang === 'en' ? "Search English, Kurdish, series name, or note..." : "گەڕان بەپێی وشەی ئینگلیزی، کوردی، زنجیرە، یان تێبینی..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="glossary-search-input"
                    />
                    {searchTerm && (
                        <button className="btn-clear-search" onClick={() => setSearchTerm('')}>
                            <X size={15} />
                        </button>
                    )}
                </div>

                {/* Show/Movie Scope Selector Searchable Combobox */}
                <div className="glossary-scope-combobox-wrap" ref={scopeDropdownRef}>
                    <button
                        type="button"
                        className={`glossary-scope-trigger-btn ${selectedMovieScope !== 'all' ? 'has-selection' : ''}`}
                        onClick={() => {
                            setScopeDropdownOpen(!scopeDropdownOpen);
                            setScopeSearchQuery('');
                        }}
                    >
                        <div className="scope-trigger-content">
                            <span className="scope-trigger-label">{selectedScopeLabel}</span>
                        </div>
                        <ChevronDown size={16} className={`scope-chevron ${scopeDropdownOpen ? 'open' : ''}`} />
                    </button>

                    {scopeDropdownOpen && (
                        <div className="glossary-scope-dropdown-menu">
                            {/* Search Input */}
                            <div className="scope-dropdown-search-wrap">
                                <Search size={15} className="scope-search-icon" />
                                <input
                                    type="text"
                                    placeholder={lang === 'en' ? `Search 500+ series & movies... (${movieOptions.length})` : `گەڕان لەناو ٥٠٠+ زنجیرە و فیلم... (${movieOptions.length})`}
                                    value={scopeSearchQuery}
                                    onChange={e => setScopeSearchQuery(e.target.value)}
                                    autoFocus
                                    className="scope-dropdown-search-input"
                                />
                                {scopeSearchQuery && (
                                    <button type="button" className="btn-scope-clear" onClick={() => setScopeSearchQuery('')}>
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Default & Filtered Options */}
                            <div className="scope-dropdown-list">
                                {!scopeSearchQuery && (
                                    <>
                                        <button
                                            type="button"
                                            className={`scope-option-item ${selectedMovieScope === 'all' ? 'active' : ''}`}
                                            onClick={() => {
                                                setSelectedMovieScope('all');
                                                setScopeDropdownOpen(false);
                                            }}
                                        >
                                            <span className="scope-item-title">{lang === 'en' ? '🎬 All Glossaries (Global + 500+ Titles)' : '🎬 هەموو فەرهەنگەکان (گشتی + ٥٠٠+ بەرهەم)'}</span>
                                            <span className="scope-item-count">{glossary.length} {lang === 'en' ? 'terms' : 'وشە'}</span>
                                        </button>

                                        <button
                                            type="button"
                                            className={`scope-option-item ${selectedMovieScope === 'global' ? 'active' : ''}`}
                                            onClick={() => {
                                                setSelectedMovieScope('global');
                                                setScopeDropdownOpen(false);
                                            }}
                                        >
                                            <span className="scope-item-title">{lang === 'en' ? '🌐 Global Platform Glossary Only' : '🌐 تەنها فەرهەنگی گشتی (تەواوی پلاتفۆرم)'}</span>
                                            <span className="scope-item-count">{glossary.filter(g => !g.movieId || g.movieId === 'global').length} {lang === 'en' ? 'terms' : 'وشە'}</span>
                                        </button>
                                        <div className="scope-dropdown-divider">{lang === 'en' ? `Series & Movies (${movieOptions.length})` : `زنجیرەکان و فیلمەکان (${movieOptions.length})`}</div>
                                    </>
                                )}

                                {/* Filtered Movie Items */}
                                {filteredToolbarMovieOptions.length === 0 ? (
                                    <div className="scope-no-results">
                                        {lang === 'en' ? `No title found matching "${scopeSearchQuery}"` : `هیچ بەرهەمێک بە ناوی "${scopeSearchQuery}" نەدۆزرایەوە!`}
                                    </div>
                                ) : (
                                    filteredToolbarMovieOptions.map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            className={`scope-option-item ${selectedMovieScope === m.id ? 'active' : ''}`}
                                            onClick={() => {
                                                setSelectedMovieScope(m.id);
                                                setScopeDropdownOpen(false);
                                            }}
                                        >
                                            <div className="scope-item-left">
                                                <span className="scope-item-type">{m.type === 'series' ? (lang === 'en' ? 'Series' : 'زنجیرە') : (lang === 'en' ? 'Movie' : 'فیلم')}</span>
                                                <span className="scope-item-title">{m.title}</span>
                                            </div>
                                            {m.count > 0 ? (
                                                <span className="scope-item-count has-terms">🎬 {m.count} {lang === 'en' ? 'terms' : 'وشە'}</span>
                                            ) : (
                                                <span className="scope-item-count empty">{lang === 'en' ? '0 terms' : 'بێ زاراوە'}</span>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Category Pills */}
                <div className="glossary-categories-pills">
                    {CATEGORIES.map(cat => {
                        const label = CATEGORY_MAP[cat] ? (lang === 'en' ? CATEGORY_MAP[cat].en : CATEGORY_MAP[cat].ku) : cat;
                        return (
                            <button
                                key={cat}
                                className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                                onClick={() => setSelectedCategory(cat)}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Total Count Bar */}
            <div className="glossary-count-bar">
                <span>
                    {lang === 'en' 
                        ? <>Showing <strong>{filteredGlossary.length}</strong> of <strong>{glossary.length}</strong> terms</>
                        : <>پیشاندانی <strong>{filteredGlossary.length}</strong> لە کۆی <strong>{glossary.length}</strong> وشە</>
                    }
                </span>
                {loading && <span className="glossary-loading-text"><RefreshCw size={14} className="spin" /> {lang === 'en' ? 'Loading...' : 'چاوەڕوانبە...'}</span>}
            </div>

            {/* Terms Grid */}
            {filteredGlossary.length === 0 ? (
                <div className="glossary-empty-state">
                    <BookOpen size={48} />
                    <h3>{lang === 'en' ? 'No terms found!' : 'هیچ وشەیەک نەدۆزرایەوە!'}</h3>
                    <p>{lang === 'en' ? 'No terminology matches your search filter, or add a new term.' : 'هیچ وشەیەک لەگەڵ فلتەر یان گەڕانەکەتدا یەکناگرێتەوە، یان وشەی نوێ زیاد بکە.'}</p>
                    <button className="btn-empty-add" onClick={() => handleOpenModal()}>
                        <Plus size={16} /> {lang === 'en' ? 'Add First Term' : 'زیادکردنی یەکەم وشە'}
                    </button>
                </div>
            ) : (
                <div className="glossary-cards-grid">
                    {filteredGlossary.map((item) => {
                        const categoryLabel = CATEGORY_MAP[item.category] 
                            ? (lang === 'en' ? CATEGORY_MAP[item.category].en : CATEGORY_MAP[item.category].ku)
                            : (item.category || (lang === 'en' ? 'General' : 'گشتی'));

                        return (
                            <div key={item.id} className="glossary-card">
                                <div className="glossary-card-top">
                                    <div className="glossary-card-badges">
                                        <span className="glossary-card-category">{categoryLabel}</span>
                                        {item.movieTitle ? (
                                            <span className="glossary-card-movie-badge">🎬 {item.movieTitle}</span>
                                        ) : (
                                            <span className="glossary-card-global-badge">🌐 {lang === 'en' ? 'Global' : 'گشتی'}</span>
                                        )}
                                    </div>
                                    <div className="glossary-card-actions">
                                        <button 
                                            className="btn-card-action btn-edit-term" 
                                            onClick={() => handleOpenModal(item)}
                                            title={lang === 'en' ? 'Edit Term' : 'دەستکاریکردن'}
                                        >
                                            <Edit2 size={15} />
                                        </button>
                                        {isSuperAdmin && (
                                            <button 
                                                className="btn-card-action btn-delete-term" 
                                                onClick={() => handleDelete(item)}
                                                title={lang === 'en' ? 'Delete Term' : 'سڕینەوە'}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="glossary-card-main">
                                    <div className="term-english-wrap">
                                        <span className="term-lang-tag">EN</span>
                                        <h4 className="term-english" dir="ltr">{item.english}</h4>
                                    </div>

                                    <div className="term-arrow-down">➜</div>

                                    <div className="term-kurdish-wrap">
                                        <span className="term-lang-tag ku">KU</span>
                                        <h4 className="term-kurdish" dir="rtl">{item.kurdish}</h4>
                                    </div>
                                </div>

                                {/* Alternatives */}
                                {item.alternatives && item.alternatives.length > 0 && (
                                    <div className="glossary-card-alternatives">
                                        <span className="alt-label">{lang === 'en' ? 'Synonyms:' : 'هاوواتاکان:'}</span>
                                        <div className="alt-tags">
                                            {item.alternatives.map((alt, idx) => (
                                                <span key={idx} className="alt-tag">{alt}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Note */}
                                {item.note && (
                                    <div className="glossary-card-note">
                                        <FileText size={13} />
                                        <span>{item.note}</span>
                                    </div>
                                )}

                                <div className="glossary-card-footer">
                                    <span>{lang === 'en' ? 'Author:' : 'نووسەر:'} <strong>{item.createdBy?.username || (lang === 'en' ? 'System' : 'سیستەم')}</strong></span>
                                    {item.updatedAt && (
                                        <span>{new Date(item.updatedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'ku-IQ')}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add / Edit Modal */}
            {showModal && (
                <div className="glossary-modal-backdrop" onClick={() => setShowModal(false)}>
                    <div className="glossary-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="glossary-modal-header">
                            <div className="modal-title-wrap">
                                <BookOpen size={20} color="#0284c7" />
                                <h3>{editingItem ? (lang === 'en' ? 'Edit Term' : 'دەستکاریکردنی زاراوە') : (lang === 'en' ? 'Add New Term to Glossary' : 'زیادکردنی وشەی نوێ بۆ فەرهەنگ')}</h3>
                            </div>
                            <button className="btn-modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="glossary-form">
                            {/* Searchable Scope Selector in Modal */}
                            <div className="form-group" ref={modalScopeDropdownRef}>
                                <label>{lang === 'en' ? 'Which show or movie scope? (Scope) *' : 'سەر بە چ بەرهەمێکە؟ (Scope) *'}</label>
                                <div className="modal-scope-combobox-wrap">
                                    <button
                                        type="button"
                                        className="modal-scope-trigger-btn"
                                        onClick={() => {
                                            setModalScopeDropdownOpen(!modalScopeDropdownOpen);
                                            setModalScopeSearchQuery('');
                                        }}
                                    >
                                        <span>
                                            {formData.movieId === 'global' 
                                                ? (lang === 'en' ? '🌐 Global Platform (All Movies & Series)' : '🌐 فەرهەنگی گشتی (بۆ تەواوی فیلم و زنجیرەکان)') 
                                                : `🎬 ${lang === 'en' ? 'Specific to:' : 'تایبەت بە:'} ${formData.movieTitle || (lang === 'en' ? 'Selected Title' : 'بەرهەمی دیاریکراو')}`}
                                        </span>
                                        <ChevronDown size={16} className={`scope-chevron ${modalScopeDropdownOpen ? 'open' : ''}`} />
                                    </button>

                                    {modalScopeDropdownOpen && (
                                        <div className="modal-scope-dropdown-menu">
                                            <div className="scope-dropdown-search-wrap">
                                                <Search size={14} className="scope-search-icon" />
                                                <input
                                                    type="text"
                                                    placeholder={lang === 'en' ? "Search title name..." : "گەڕان بەپێی ناوی فیلم..."}
                                                    value={modalScopeSearchQuery}
                                                    onChange={e => setModalScopeSearchQuery(e.target.value)}
                                                    autoFocus
                                                    className="scope-dropdown-search-input"
                                                />
                                            </div>

                                            <div className="scope-dropdown-list">
                                                <button
                                                    type="button"
                                                    className={`scope-option-item ${formData.movieId === 'global' ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setFormData({ ...formData, movieId: 'global', movieTitle: '' });
                                                        setModalScopeDropdownOpen(false);
                                                    }}
                                                >
                                                    <span className="scope-item-title">{lang === 'en' ? '🌐 Global Platform (All Movies & Series)' : '🌐 فەرهەنگی گشتی (تەواوی فیلم و زنجیرەکان)'}</span>
                                                </button>

                                                <div className="scope-dropdown-divider">{lang === 'en' ? `Series & Movies (${movieOptions.length})` : `زنجیرە و فیلمەکان (${movieOptions.length})`}</div>

                                                {filteredModalMovieOptions.map(m => (
                                                    <button
                                                        key={m.id}
                                                        type="button"
                                                        className={`scope-option-item ${formData.movieId === m.id ? 'active' : ''}`}
                                                        onClick={() => {
                                                            setFormData({ ...formData, movieId: m.id, movieTitle: m.title });
                                                            setModalScopeDropdownOpen(false);
                                                        }}
                                                    >
                                                        <div className="scope-item-left">
                                                            <span className="scope-item-type">{m.type === 'series' ? (lang === 'en' ? 'Series' : 'زنجیرە') : (lang === 'en' ? 'Movie' : 'فیلم')}</span>
                                                            <span className="scope-item-title">{m.title}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="form-row-dual">
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'English Term (English) *' : 'وشەی ئینگلیزی (English Term) *'}</label>
                                    <input 
                                        type="text"
                                        placeholder={lang === 'en' ? "e.g. walkers, barn, protocol..." : "بۆ نموونە: walkers, barn, protocol..."}
                                        value={formData.english}
                                        onChange={e => setFormData({ ...formData, english: e.target.value })}
                                        dir="ltr"
                                        autoFocus
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Primary Kurdish Translation (Kurdish) *' : 'وەرگێڕانی کوردی سەرەکی (Kurdish) *'}</label>
                                    <input 
                                        type="text"
                                        placeholder={lang === 'en' ? "e.g. زۆمبی، تەویلە، پرۆتۆکۆل..." : "بۆ نموونە: زۆمبی، تەویلە، پرۆتۆکۆل..."}
                                        value={formData.kurdish}
                                        onChange={e => setFormData({ ...formData, kurdish: e.target.value })}
                                        dir="rtl"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-row-dual">
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Category / Domain (Category)' : 'جۆری زاراوە / پۆلێن (Category)'}</label>
                                    <select 
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    >
                                        {CATEGORIES.filter(c => c !== 'هەموو جۆرەکان').map(c => {
                                            const label = CATEGORY_MAP[c] ? (lang === 'en' ? CATEGORY_MAP[c].en : CATEGORY_MAP[c].ku) : c;
                                            return (
                                                <option key={c} value={c}>{label}</option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Synonyms & Alternatives (comma separated)' : 'هاوواتا و بەکارهێنانەکانی تر (بە فاریزە جیای بکەرەوە)'}</label>
                                    <input 
                                        type="text"
                                        placeholder={lang === 'en' ? "e.g. مردووی ڕۆیشتوو, گەوڕ..." : "مردووی ڕۆیشتوو، گەوڕ..."}
                                        value={formData.alternatives}
                                        onChange={e => setFormData({ ...formData, alternatives: e.target.value })}
                                        dir="rtl"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>{lang === 'en' ? 'Usage Note & Guidelines for Translators' : 'تێبینی و ڕێنمایی بۆ وەرگێڕان (ڕوونکردنەوە)'}</label>
                                <textarea 
                                    placeholder={lang === 'en' ? "Explain why this translation was chosen or in which context it should be used..." : "ڕوونکردنەوە بدە کە بۆچی ئەم وەرگێڕانە گونجاوە یان لە چ کۆنتێکستێکدا بەکاردێت..."}
                                    value={formData.note}
                                    onChange={e => setFormData({ ...formData, note: e.target.value })}
                                    rows={3}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-modal-cancel" onClick={() => setShowModal(false)}>
                                    {lang === 'en' ? 'Cancel' : 'پەشیمانبوونەوە'}
                                </button>
                                <button type="submit" className="btn-modal-submit" disabled={saving}>
                                    {saving ? (lang === 'en' ? 'Saving...' : 'پاشەکەوتکردن...') : (editingItem ? (lang === 'en' ? 'Update Term ✓' : 'نوێکردنەوە ✓') : (lang === 'en' ? 'Add Term +' : 'زیادکردنی وشە +'))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
