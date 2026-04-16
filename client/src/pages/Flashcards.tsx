import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, X, Trash2, Edit2, Play, CreditCard, Save, RotateCcw, Frown, Smile, CheckSquare, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Flashcards.css';

interface Card {
    id: string;
    front: string; // English
    back: string;  // Kurdish
    ease?: number;
    interval?: number;
    nextReview?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function Flashcards() {
    const [cards, setCards] = useState<Card[]>([]);
    const [view, setView] = useState<'manage' | 'practice'>('manage');
    const { user, syncProgress } = useAuth();
    
    // Manage state
    const [frontText, setFrontText] = useState('');
    const [backText, setBackText] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    // AI Variations State
    const [aiVarModalOpen, setAiVarModalOpen] = useState(false);
    const [aiVarTarget, setAiVarTarget] = useState<Card | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiVariations, setAiVariations] = useState<{front: string, back: string}[]>([]);

    const generateVariations = async (card: Card) => {
        setAiVarTarget(card);
        setAiVarModalOpen(true);
        setIsAiLoading(true);
        setAiVariations([]);

        try {
            const res = await axios.post('/api/ai/generate', {
                contents: [{ parts: [{ text: `Create 3 simple and practical English sentences that use the word/phrase "${card.front}". Provide the Kurdish Sorani translation for each. WARNING: You MUST use the Arabic alphabet for the Kurdish translation. Do NOT use Latin letters for Kurdish. Return strictly a JSON array of objects in this exact format, nothing else: [{"front": "English Sentence", "back": "Kurdish Translation"}]` }] }]
            });
            let rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(rawText);
            
            if (Array.isArray(parsed) && parsed.length > 0) {
                setAiVariations(parsed);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsAiLoading(false);
        }
    };

    const addVariationsToDeck = () => {
        const now = Date.now();
        const newCards = aiVariations.map((v, idx) => ({
            id: (now + idx).toString(),
            front: v.front,
            back: v.back,
            ease: 2.5,
            interval: 0,
            nextReview: now
        }));
        saveCards([...newCards, ...cards]);
        setAiVarModalOpen(false);
        setAiVarTarget(null);
    };
    
    // Practice state
    const [isFlipped, setIsFlipped] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('kurdish_stream_flashcards');
        if (saved) {
            try {
                // Ensure legacy cards get default tracking fields on first practice or map them
                const parsed: Card[] = JSON.parse(saved);
                const validated = parsed.map(c => ({
                    ...c,
                    ease: c.ease || 2.5,
                    interval: c.interval || 0,
                    nextReview: c.nextReview || Date.now()
                }));
                // Only save if there was a modification (backwards compatibility)
                if (JSON.stringify(parsed) !== JSON.stringify(validated)) {
                     localStorage.setItem('kurdish_stream_flashcards', JSON.stringify(validated));
                }
                setCards(validated);
            } catch (e) { }
        }
    }, []);

    const saveCards = (newCards: Card[]) => {
        setCards(newCards);
        localStorage.setItem('kurdish_stream_flashcards', JSON.stringify(newCards));
        if (user) {
            syncProgress({ flashcards: newCards });
        }
    };

    const handleSave = () => {
        if (!frontText.trim() || !backText.trim()) return;
        
        if (editingId) {
            saveCards(cards.map(c => c.id === editingId ? { ...c, front: frontText, back: backText } : c));
            setEditingId(null);
        } else {
            const now = Date.now();
            const newCard: Card = { 
                id: now.toString(), 
                front: frontText, 
                back: backText, 
                ease: 2.5, 
                interval: 0, 
                nextReview: now 
            };
            saveCards([newCard, ...cards]);
        }
        setFrontText('');
        setBackText('');
    };

    const handleEdit = (c: Card) => {
        setFrontText(c.front);
        setBackText(c.back);
        setEditingId(c.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = (id: string) => {
        if (!confirm('ئایا دڵنیایت لە سڕینەوەی ئەم کارتە؟')) return;
        saveCards(cards.filter(c => c.id !== id));
    };

    const startPractice = () => {
        if (cards.length === 0) return;
        setIsFlipped(false);
        setView('practice');
    };

    // Calculate due cards (cards where nextReview is in the past)
    const dueCards = cards.filter(c => !c.nextReview || c.nextReview <= Date.now());
    // Sort so cards that are most overdue come first
    dueCards.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));

    const currentCard = dueCards.length > 0 ? dueCards[0] : null;

    const rateCard = (rating: 'again' | 'hard' | 'good' | 'easy') => {
        if (!currentCard) return;

        let ease = currentCard.ease || 2.5;
        let interval = currentCard.interval || 0;

        if (rating === 'again') {
            ease = Math.max(1.3, ease - 0.2); // drop ease
            interval = 0; // Show again today/soon
        } else if (rating === 'hard') {
            ease = Math.max(1.3, ease - 0.15); // drop ease a bit
            interval = interval === 0 ? 1 : interval * 1.2;
        } else if (rating === 'good') {
            interval = interval === 0 ? 1 : interval === 1 ? 3 : interval * ease;
        } else if (rating === 'easy') {
            ease += 0.15; // boost ease
            interval = interval === 0 ? 4 : interval * ease * 1.3;
        }

        // Convert interval (in days) to timestamp
        // If 'again', show it again in 1 minute. Otherwise, full days.
        const nextReviewMs = Date.now() + (rating === 'again' || interval === 0 ? 60000 : interval * 24 * 60 * 60 * 1000);

        const updated = cards.map(c => 
            c.id === currentCard.id 
                ? { ...c, ease, interval, nextReview: nextReviewMs }
                : c
        );

        setIsFlipped(false);
        setTimeout(() => {
            saveCards(updated);
        }, 150);
    };

    return (
        <div className="flashcards-container">
            <div className="fc-header">
                <div>
                    <h1 className="fc-title">
                        <CreditCard size={28} /> 
                        <span className="fc-title-main">فلاش کارتەکان</span>
                        <span className="fc-title-sub">(Spaced Repetition)</span>
                    </h1>
                    <p className="fc-subtitle">بە شێوازێکی زیرەکانە کارتەکانت بەپێی کات بۆ ڕیز دەکات تا لە بیرت نەچێت</p>
                </div>
                
                <div className="fc-view-toggles">
                    <button className={`fc-view-btn ${view === 'manage' ? 'active' : ''}`} onClick={() => setView('manage')}>
                        <CreditCard size={18} /> ڕێکخستنی کارتەکان
                    </button>
                    <button className={`fc-view-btn ${view === 'practice' ? 'active' : ''}`} onClick={startPractice} disabled={cards.length === 0}>
                        <Play size={18} /> تاقیکردنەوە &nbsp; {dueCards.length > 0 && <span className="fc-badge">{dueCards.length}</span>}
                    </button>
                </div>
            </div>

            {view === 'manage' && (
                <div className="fc-manage-view">
                    <div className="fc-form-card">
                        <h2>{editingId ? 'دەستکاریکردنی کارت' : 'کارتی نوێ زیاد بکە'}</h2>
                        <div className="fc-input-group">
                            <label>ڕووی پێشەوە (وشە یان ڕستەی ئینگلیزی)</label>
                            <input 
                                type="text" 
                                value={frontText} 
                                onChange={e => setFrontText(e.target.value)} 
                                placeholder="نموونە: Actually..." 
                                dir="ltr"
                            />
                        </div>
                        <div className="fc-input-group">
                            <label>ڕووی پشتەوە (وەرگێڕانی کوردی)</label>
                            <input 
                                type="text" 
                                value={backText} 
                                onChange={e => setBackText(e.target.value)} 
                                placeholder="نموونە: لە ڕاستیدا..." 
                                dir="rtl"
                            />
                        </div>
                        <div className="fc-form-actions">
                            {editingId && (
                                <button className="fc-btn-cancel" onClick={() => { setEditingId(null); setFrontText(''); setBackText(''); }}>
                                    <X size={18} /> پاشگەز
                                </button>
                            )}
                            <button className="fc-btn-save" onClick={handleSave} disabled={!frontText.trim() || !backText.trim()}>
                                {editingId ? <><Save size={18} /> پاشەکەوت</> : <><Plus size={18} /> زیاد بکە</>}
                            </button>
                        </div>
                    </div>

                    <div className="fc-list">
                        <h3 className="fc-list-title">هەموو کارتەکانت ({cards.length}) - ئامادەیە بۆ پێداچوونەوە: {dueCards.length}</h3>
                        {cards.length === 0 ? (
                            <div className="fc-empty">هیچ کارتێک نییە. یەکەم کارتت زیاد بکە!</div>
                        ) : (
                            <div className="fc-grid">
                                {cards.map(card => {
                                    const isDue = !card.nextReview || card.nextReview <= Date.now();
                                    return (
                                        <div key={card.id} className={`fc-list-item ${isDue ? 'item-due' : ''}`}>
                                            <div className="fc-item-content">
                                                <div className="fc-item-front">{card.front}</div>
                                                <div className="fc-item-back">{card.back}</div>
                                                <div className="fc-item-meta">
                                                    {isDue ? 'دەبێت ئێستا بیخوێنیتەوە 🔴' : 'خوێنراوەتەوە ✅'}
                                                </div>
                                            </div>
                                            <div className="fc-item-actions">
                                                <button onClick={() => generateVariations(card)} title="نموونەی AI"><Sparkles size={16} /></button>
                                                <button onClick={() => handleEdit(card)} title="دەستکاری"><Edit2 size={16} /></button>
                                                <button onClick={() => handleDelete(card.id)} title="سڕینەوە" className="fc-item-del"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {aiVarModalOpen && (
                        <div className="fc-modal-overlay">
                            <div className="fc-modal-content">
                                <button className="fc-modal-close" onClick={() => setAiVarModalOpen(false)}><X size={18} /></button>
                                <h3 className="fc-modal-title"><Sparkles size={20} color="#a855f7" /> نموونەی زیاتر بە AI</h3>
                                <p className="fc-modal-desc">ژیری دەستکرد ٣ ڕستەی جیاواز دروست دەکات بۆ وشەی <strong>"{aiVarTarget?.front}"</strong></p>

                                {isAiLoading ? (
                                    <div className="fc-ai-loader">
                                        <Loader2 size={32} className="spinning" />
                                        <p>چاوەڕێ بە...</p>
                                    </div>
                                ) : (
                                    <div className="fc-ai-results">
                                        {aiVariations.length > 0 ? (
                                            <div className="fc-ai-list">
                                                {aiVariations.map((v, i) => (
                                                    <div key={i} className="fc-ai-card">
                                                        <div dir="ltr" style={{ fontWeight: 'bold' }}>{v.front}</div>
                                                        <div dir="rtl" style={{ color: '#aaa' }}>{v.back}</div>
                                                    </div>
                                                ))}
                                                <button className="fc-btn-save" onClick={addVariationsToDeck} style={{ marginTop: '15px', width: '100%', justifyContent: 'center' }}>
                                                    هەرسێکیان زیاد بکە 🃏
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="fc-error">نەتوانرا نموونە دروست بکرێت. دووبارە تاقیبکەرەوە.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {view === 'practice' && (
                <div className="fc-practice-view">
                    {!currentCard ? (
                        <div className="fc-done-msg">
                            <CheckSquare size={64} color="#4ade80" />
                            <h2>زۆر باشە! 🎉</h2>
                            <p>تۆ پێداچوونەوەت بۆ هەموو کارتەکانی ئەمڕۆت کرد.</p>
                            <p>دواتر دووبارە سەردان بکەرەوە بۆ ئەوەی وشەی زیاترت بێتەوە بیر.</p>
                            <button className="fc-btn-save" onClick={() => setView('manage')} style={{ marginTop: '20px' }}>
                                گەڕانەوە بۆ کارتەکان
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="fc-practice-counter">
                                ماوە بۆ پێداچوونەوە: {dueCards.length} کارت
                            </div>
                            
                            <div className="fc-scene">
                                <div className={`fc-card-3d ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
                                    <div className="fc-card-face fc-card-front">
                                        <span className="fc-hint">بیرى لێبکەرەوە و کلیک بکە بۆ بینینی وەڵام</span>
                                        <div className="fc-card-text" dir="ltr">{currentCard.front}</div>
                                    </div>
                                    <div className="fc-card-face fc-card-back">
                                        <span className="fc-hint">وەرگێڕان</span>
                                        <div className="fc-card-text" dir="rtl">{currentCard.back}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="fc-practice-controls">
                                {!isFlipped ? (
                                    <button className="fc-flip-btn" onClick={() => setIsFlipped(true)}>
                                        وەڵامم پێشان بدە
                                    </button>
                                ) : (
                                    <div className="fc-rating-buttons">
                                        <button className="fc-rate-btn rate-again" onClick={() => rateCard('again')}>
                                            <RotateCcw size={16} /> بیرم نەبوو
                                            <small>&lt; 1 خولەک</small>
                                        </button>
                                        <button className="fc-rate-btn rate-hard" onClick={() => rateCard('hard')}>
                                            <Frown size={16} /> سەخت بوو
                                            <small>{currentCard.interval === 0 ? 'سبەینێ' : `${Math.round(currentCard.interval || 1)} ڕۆژ`}</small>
                                        </button>
                                        <button className="fc-rate-btn rate-good" onClick={() => rateCard('good')}>
                                            <Smile size={16} /> باش بوو
                                            <small>{Math.round((currentCard.interval === 0 ? 1 : currentCard.interval === 1 ? 3 : (currentCard.interval||1) * (currentCard.ease||2.5)))} ڕۆژ</small>
                                        </button>
                                        <button className="fc-rate-btn rate-easy" onClick={() => rateCard('easy')}>
                                            <CheckSquare size={16} /> زۆر ئاسان
                                            <small>{Math.round(currentCard.interval === 0 ? 4 : (currentCard.interval||1) * (currentCard.ease||2.5) * 1.3)} ڕۆژ</small>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
