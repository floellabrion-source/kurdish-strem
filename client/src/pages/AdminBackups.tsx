import React, { useState, useEffect, useRef } from 'react';
import axios from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
    HardDrive, Download, RotateCcw, Plus, RefreshCw, CheckCircle2,
    AlertCircle, ShieldCheck, FileArchive, Clock, Users, Film, Layers,
    Loader2, AlertTriangle, ShieldAlert, Upload
} from 'lucide-react';
import './AdminBackups.css';

interface BackupItem {
    id: string;
    filename: string;
    createdAt: string;
    sizeBytes: number;
    sizeFormatted: string;
    triggerType: 'auto' | 'manual';
    reason: string;
    stats?: {
        usersCount?: number;
        moviesCount?: number;
        plansCount?: number;
        requestsCount?: number;
    };
}

export default function AdminBackups() {
    const { lang } = useLanguage();
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'super_admin' || user?.username === 'maher2' || user?.username?.toLowerCase() === 'admin';

    const [backups, setBackups] = useState<BackupItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Modal state for restore confirmation
    const [restoreModalBackup, setRestoreModalBackup] = useState<BackupItem | null>(null);

    const fetchBackups = async () => {
        try {
            setLoading(true);
            setErrorMsg(null);
            const res = await axios.get('/api/admin/backups');
            if (res.data.success) {
                setBackups(res.data.backups || []);
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || (lang === 'en' ? 'Failed to load backups' : 'هەڵە لە بارکردنی لیستەکە'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isSuperAdmin) {
            fetchBackups();
        }
    }, [isSuperAdmin]);

    const handleCreateBackup = async () => {
        try {
            setActionLoading(true);
            setErrorMsg(null);
            setSuccessMsg(null);
            const res = await axios.post('/api/admin/backups/create', { reason: 'باکئەپی دەستی بە کلیکی ئەدمین' });
            if (res.data.success) {
                setSuccessMsg(lang === 'en' ? 'Backup created successfully!' : 'باکئەپ بە سەرکەوتوویی دروستکرا و پاشەکەوتکرا ✓');
                await fetchBackups();
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || (lang === 'en' ? 'Failed to create backup' : 'هەڵە لە دروستکردنی باکئەپ'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleConfirmRestore = async () => {
        if (!restoreModalBackup) return;
        try {
            setActionLoading(true);
            setErrorMsg(null);
            setSuccessMsg(null);
            const res = await axios.post(`/api/admin/backups/restore/${restoreModalBackup.filename}`);
            if (res.data.success) {
                setSuccessMsg(lang === 'en' ? 'Database restored successfully!' : 'داتاکان بە سەرکەوتوویی گەڕێنرانەوە لەم باکئەپە ✓');
                setRestoreModalBackup(null);
                await fetchBackups();
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || (lang === 'en' ? 'Failed to restore database' : 'هەڵە لە گەڕاندنەوەی داتاکان'));
        } finally {
            setActionLoading(false);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setActionLoading(true);
            setErrorMsg(null);
            setSuccessMsg(null);

            const formData = new FormData();
            formData.append('backupFile', file);

            const res = await axios.post('/api/admin/backups/upload-restore', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setSuccessMsg(lang === 'en' ? 'Backup file uploaded and database restored successfully!' : 'فایلی باکئەپ بارکرا و داتاکان بە سەرکەوتوویی گەڕێنرانەوە ✓');
                await fetchBackups();
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || (lang === 'en' ? 'Failed to upload and restore backup' : 'هەڵە لە گەڕاندنەوەی فایلی باکئەپ'));
        } finally {
            setActionLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDownload = (filename: string) => {
        window.open(`/api/admin/backups/download/${filename}`, '_blank');
    };

    if (!isSuperAdmin) {
        return (
            <div className="admin-backups-container" style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px', padding: '30px', maxWidth: '600px', margin: '0 auto', color: '#fca5a5' }}>
                    <ShieldAlert size={48} color="#ef4444" style={{ marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
                        {lang === 'en' ? 'Access Restricted' : 'دەسەڵاتی سنووردارکراو'}
                    </h3>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6' }}>
                        {lang === 'en'
                            ? 'Only the Website Owner (Super Admin) is authorized to manage and restore system backups.'
                            : 'تەنها بەڕێوەبەری سەرەکی وێبسایت (Super Admin) دەسەڵاتی بەڕێوەبردن و گەڕاندنەوەی باکئەپەکانی سیستەمی هەیە.'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={`admin-backups-container ${lang === 'en' ? 'ltr-mode' : 'rtl-mode'}`} dir={lang === 'en' ? 'ltr' : 'rtl'}>
            {/* Hidden file input */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".gz,.json"
                onChange={handleUploadRestore}
            />

            {/* Header */}
            <div className="admin-backups-header">
                <div>
                    <h2>
                        <HardDrive size={24} color="#10b981" />
                        {lang === 'en' ? 'Auto Daily Backups & Disaster Recovery' : 'باکئەپی ئۆتۆماتیکی ڕۆژانە و پاراستنی داتاکان'}
                    </h2>
                    <p>
                        {lang === 'en'
                            ? 'Automated daily snapshots of all system database files (Users, Movies, Plans, Receipts, Logs).'
                            : 'پاراستنی ئۆتۆماتیکی ڕۆژانەی هەموو فایلەکانی داتابەیس (بەکارهێنەران، فیلمەکان، پلانەکان، وەسڵەکان، لۆگەکان).'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button className="btn-action-refresh" onClick={fetchBackups} title="Refresh">
                        <RefreshCw size={16} />
                    </button>
                    <button
                        className="btn-upload-backup-header"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={actionLoading}
                        title="Upload file from Telegram or PC"
                    >
                        <Upload size={16} />
                        <span>{lang === 'en' ? 'Upload Backup File' : 'بارکردنی فایلی تێلیگرام'}</span>
                    </button>
                    <button
                        className="btn-create-backup"
                        onClick={handleCreateBackup}
                        disabled={actionLoading}
                    >
                        {actionLoading ? <Loader2 size={16} className="spinning" /> : <Plus size={16} />}
                        <span>{lang === 'en' ? 'Create Backup Now' : 'دروستکردنی باکئەپی دەستبەجێ'}</span>
                    </button>
                </div>
            </div>

            {/* Alert Messages */}
            {successMsg && (
                <div className="backups-alert success">
                    <CheckCircle2 size={18} />
                    <span>{successMsg}</span>
                </div>
            )}

            {errorMsg && (
                <div className="backups-alert error">
                    <AlertCircle size={18} />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Safety Banner */}
            <div className="backup-security-banner">
                <ShieldCheck size={28} color="#10b981" />
                <div className="banner-text">
                    <h4>{lang === 'en' ? 'Automatic 24/7 Redundancy Active' : 'سیستەمی باکئەپی ٢٤ کاتژمێری چالاکە'}</h4>
                    <p>
                        {lang === 'en'
                            ? 'The server automatically compresses and archives the full database every 24 hours at midnight. The 20 most recent snapshots are securely kept.'
                            : 'سێرڤەر ڕۆژانە بە شێوەی ئۆتۆماتیکی هەموو داتاکان بە قەبارەی پەستێنراوی (Gzip) کۆپی دەکات و تا ٢٠ باکئەپی کۆتایی هەڵدەگرێت تا زانیارییەکانت هەرگیز لەدەست نەچن.'}
                    </p>
                </div>
            </div>

            {/* Backups List */}
            {loading ? (
                <div className="backups-loading">
                    <Loader2 size={36} className="spinning" />
                    <span>{lang === 'en' ? 'Loading backups...' : 'خەریکە باکئەپەکان دەپشکنرێن...'}</span>
                </div>
            ) : backups.length === 0 ? (
                <div className="backups-empty">
                    <FileArchive size={48} color="#64748b" />
                    <h3>{lang === 'en' ? 'No backups found' : 'هیچ باکئەپێک نەدۆزرایەوە'}</h3>
                    <p>{lang === 'en' ? 'Click Create Backup Now to generate your first snapshot.' : 'کلیک لەسەر دوگمەی سەرەوە بکە بۆ دروستکردنی یەکەمین باکئەپ.'}</p>
                    <button className="btn-create-backup" onClick={handleCreateBackup}>
                        <Plus size={16} />
                        <span>{lang === 'en' ? 'Create Backup' : 'دروستکردنی باکئەپ'}</span>
                    </button>
                </div>
            ) : (
                <div className="backups-grid">
                    {backups.map((item, idx) => {
                        const dateObj = new Date(item.createdAt);
                        const formattedDate = dateObj.toLocaleDateString(lang === 'en' ? 'en-US' : 'ckb-IQ', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });

                        return (
                            <div key={item.id} className="backup-card">
                                <div className="backup-card-top">
                                    <div className="backup-icon-badge">
                                        <FileArchive size={20} color="#10b981" />
                                    </div>
                                    <div className="backup-meta-info">
                                        <div className="backup-title-row">
                                            <h4>{item.filename}</h4>
                                            <span className={`trigger-pill ${item.triggerType}`}>
                                                {item.triggerType === 'auto' ? (lang === 'en' ? 'Auto 🤖' : 'ئۆتۆماتیک 🤖') : (lang === 'en' ? 'Manual 👤' : 'دەستی 👤')}
                                            </span>
                                        </div>
                                        <div className="backup-time-row">
                                            <Clock size={12} color="#94a3b8" />
                                            <span>{formattedDate}</span>
                                            <span className="backup-size-pill">{item.sizeFormatted}</span>
                                        </div>
                                    </div>
                                </div>

                                <p className="backup-reason-text">{item.reason}</p>

                                {/* Snapshot Stats Badges */}
                                {item.stats && (
                                    <div className="backup-stats-chips">
                                        <span className="b-stat-chip">
                                            <Users size={12} /> {item.stats.usersCount ?? 0} {lang === 'en' ? 'Users' : 'بەکارهێنەر'}
                                        </span>
                                        <span className="b-stat-chip">
                                            <Film size={12} /> {item.stats.moviesCount ?? 0} {lang === 'en' ? 'Media' : 'بەرهەم'}
                                        </span>
                                        <span className="b-stat-chip">
                                            <Layers size={12} /> {item.stats.plansCount ?? 0} {lang === 'en' ? 'Plans' : 'پلان'}
                                        </span>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="backup-actions">
                                    <button
                                        className="btn-backup-download"
                                        onClick={() => handleDownload(item.filename)}
                                        title="Download snapshot archive"
                                    >
                                        <Download size={14} />
                                        <span>{lang === 'en' ? 'Download' : 'دابەزاندن'}</span>
                                    </button>

                                    <button
                                        className="btn-backup-restore"
                                        onClick={() => setRestoreModalBackup(item)}
                                        title="Restore database to this point"
                                    >
                                        <RotateCcw size={14} />
                                        <span>{lang === 'en' ? 'Restore' : 'گەڕاندنەوە'}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* RESTORE CONFIRMATION MODAL */}
            {restoreModalBackup && (
                <div className="backup-modal-overlay">
                    <div className="backup-modal-card">
                        <div className="modal-danger-icon">
                            <AlertTriangle size={36} color="#ef4444" />
                        </div>
                        <h3>{lang === 'en' ? 'Restore Database Backup?' : 'دڵنیایت لە گەڕاندنەوەی ئەم باکئەپە؟'}</h3>
                        <p>
                            {lang === 'en'
                                ? `All current users, movies, and plans will be restored to the state of this snapshot (${restoreModalBackup.filename}). A safety emergency backup will also be taken automatically.`
                                : `هەموو زانیارییەکانی بەکارهێنەران، فیلم، و پلانەکان دەگەڕێنرێنەوە بۆ دۆخی ئەم بەروارە (${restoreModalBackup.filename}). سیستەم خۆی پێش گەڕاندنەوە کۆپییەکی فریاگوزاری هەڵدەگرێت.`}
                        </p>

                        <div className="modal-actions">
                            <button
                                className="btn-modal-cancel"
                                onClick={() => setRestoreModalBackup(null)}
                                disabled={actionLoading}
                            >
                                {lang === 'en' ? 'Cancel' : 'پەشیمانبوونەوە'}
                            </button>
                            <button
                                className="btn-modal-confirm"
                                onClick={handleConfirmRestore}
                                disabled={actionLoading}
                            >
                                {actionLoading ? <Loader2 size={16} className="spinning" /> : <RotateCcw size={16} />}
                                <span>{lang === 'en' ? 'Confirm & Restore' : 'بەڵێ، بیگەڕێنەوە'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
