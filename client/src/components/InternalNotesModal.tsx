import React, { useState, useEffect } from 'react';
import axios from '../api/client';
import {
    X, MessageSquare, Send, Trash2, User, Clock,
    Loader2, AlertCircle, ShieldAlert, Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './InternalNotesModal.css';

interface InternalNotesModalProps {
    movieId: string;
    movieTitle: string;
    seasonNum?: number;
    episodeNum?: number;
    episodeTitle?: string;
    onClose: () => void;
}

interface Note {
    id: string;
    movieId: string;
    seasonNum?: number;
    episodeNum?: number;
    author: {
        id: string;
        username: string;
        role: string;
    };
    text: string;
    createdAt: string;
}

export default function InternalNotesModal({
    movieId,
    movieTitle,
    seasonNum,
    episodeNum,
    episodeTitle,
    onClose
}: InternalNotesModalProps) {
    const { user } = useAuth();
    const { lang } = useLanguage();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [noteText, setNoteText] = useState('');

    const fetchNotes = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/admin/movies/${movieId}/notes`, {
                params: { seasonNum, episodeNum }
            });
            setNotes(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotes();
    }, [movieId, seasonNum, episodeNum]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!noteText.trim() || sending) return;

        setSending(true);
        try {
            const res = await axios.post(`/api/admin/movies/${movieId}/notes`, {
                text: noteText.trim(),
                seasonNum,
                episodeNum
            });
            setNotes(prev => [res.data, ...prev]);
            setNoteText('');
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (noteId: string) => {
        if (!window.confirm(lang === 'en' ? 'Are you sure you want to delete this note?' : 'ئایا دڵنیایت لە سڕینەوەی ئەم تێبینییە؟')) return;
        try {
            await axios.delete(`/api/admin/movies/${movieId}/notes/${noteId}`);
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="notes-modal-backdrop" onClick={onClose}>
            <div className={`notes-modal-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="notes-modal-header">
                    <div className="notes-header-info">
                        <h2>
                            <MessageSquare size={20} color="#38bdf8" />
                            {lang === 'en' ? 'Internal Team Notes' : 'تێبینییە ناوخۆییەکانی تیم (Internal Team Notes)'}
                        </h2>
                        <p>
                            {movieTitle} {seasonNum !== undefined && episodeNum !== undefined ? `(${lang === 'en' ? `Season ${seasonNum} • Episode ${episodeNum}` : `سیزنی ${seasonNum} • ئەڵقەی ${episodeNum}`}${episodeTitle ? ` - ${episodeTitle}` : ''})` : ''}
                        </p>
                    </div>

                    <button className="notes-close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Info Alert */}
                <div className="notes-banner-tip">
                    <Sparkles size={16} color="#38bdf8" />
                    <span>{lang === 'en' ? 'These notes are visible only to Admins and Super Admin for collaborative translation and subtitle reviews.' : 'ئەم تێبینییانە تەنها ئەدمینەکان و بەڕێوەبەر دەیبینن، بۆ ئاڵوگۆڕی تێبینی لەسەر وەرگێڕان و دیمەنەکان.'}</span>
                </div>

                {/* Notes List */}
                <div className="notes-list-area">
                    {loading ? (
                        <div className="notes-loading">
                            <Loader2 size={32} className="spinning" />
                            <span>{lang === 'en' ? 'Loading notes...' : 'بارکردنی تێبینییەکان...'}</span>
                        </div>
                    ) : notes.length === 0 ? (
                        <div className="notes-empty-box">
                            <MessageSquare size={36} color="#64748b" />
                            <h4>{lang === 'en' ? 'No notes posted yet' : 'هیچ تێبینییەک نەنووسراوە'}</h4>
                            <p>{lang === 'en' ? 'Write the first note below for your team or manager.' : 'یەکەم تێبینی بنووسە بۆ بەڕێوەبەر یان هاوڕێ وەرگێڕەکانت لە خوارەوە.'}</p>
                        </div>
                    ) : (
                        notes.map(n => {
                            const isMine = n.author?.id === user?.id;
                            const isSuperAdmin = user?.role === 'super_admin';
                            const dateStr = new Date(n.createdAt).toLocaleDateString('ckb-IQ', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            return (
                                <div key={n.id} className={`note-card ${isMine ? 'my-note' : ''}`}>
                                    <div className="note-card-top">
                                        <div className="note-author-box">
                                            <div className="note-avatar">
                                                <User size={13} />
                                            </div>
                                            <span className="note-author-name">{n.author?.username || (lang === 'en' ? 'Admin' : 'ئەدمین')}</span>
                                            <span className={`note-role-badge ${n.author?.role === 'super_admin' ? 'super' : 'admin'}`}>
                                                {n.author?.role === 'super_admin' ? (lang === 'en' ? 'Super Admin' : 'بەڕێوەبەری سەرەکی') : (lang === 'en' ? 'Admin' : 'ئەدمین')}
                                            </span>
                                        </div>

                                        <div className="note-top-right">
                                            <span className="note-date-text">
                                                <Clock size={11} /> {dateStr}
                                            </span>
                                            {(isMine || isSuperAdmin) && (
                                                <button
                                                    className="note-del-btn"
                                                    onClick={() => handleDelete(n.id)}
                                                    title={lang === 'en' ? "Delete note" : "سڕینەوەی تێبینی"}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="note-content-text" dir="auto">
                                        {n.text}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Input Area */}
                <form className="notes-input-form" onSubmit={handleSend}>
                    <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder={lang === 'en' ? "Write an internal note... (e.g. Lines 40-60 contain medical terms)" : "تێبینییەک بنووسە... (بۆ نموونە: دێڕی ٤٠ تا ٦٠ زاراوەی پزیشکییە و وەرگێڕانەکەی وردە)"}
                        rows={2}
                        className="notes-textarea"
                        dir="auto"
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend(e);
                            }
                        }}
                    />
                    <button
                        type="submit"
                        disabled={!noteText.trim() || sending}
                        className="notes-send-btn"
                    >
                        {sending ? <Loader2 size={16} className="spinning" /> : <Send size={16} />}
                        <span>{lang === 'en' ? 'Send' : 'ناردن'}</span>
                    </button>
                </form>
            </div>
        </div>
    );
}
