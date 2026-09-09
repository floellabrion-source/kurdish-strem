const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

const DATA_FILES = [
    'users.json',
    'movies.json',
    'plans.json',
    'requests.json',
    'activity_log.json',
    'analytics.json',
    'glossary.json',
    'internal_notes.json',
    'subtitle_history.json'
];

/**
 * Creates a comprehensive snapshot of all database files
 */
function createBackup(triggerType = 'auto', reason = '') {
    try {
        const timestamp = new Date();
        const dateStr = timestamp.toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const backupId = `backup_${dateStr}`;
        const targetFilename = `${backupId}.json.gz`;
        const targetPath = path.join(BACKUPS_DIR, targetFilename);

        const snapshotData = {
            id: backupId,
            filename: targetFilename,
            createdAt: timestamp.toISOString(),
            triggerType, // 'auto' | 'manual'
            reason: reason || (triggerType === 'auto' ? 'باکئەپی ئۆتۆماتیکی ڕۆژانەی سیستەم' : 'باکئەپی دەستی لەلایەن بەڕێوەبەرەوە'),
            files: {},
            stats: {
                usersCount: 0,
                moviesCount: 0,
                plansCount: 0,
                requestsCount: 0
            }
        };

        DATA_FILES.forEach(filename => {
            const filePath = path.join(DATA_DIR, filename);
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const parsed = JSON.parse(content);
                    snapshotData.files[filename] = parsed;

                    if (filename === 'users.json' && Array.isArray(parsed)) snapshotData.stats.usersCount = parsed.length;
                    if (filename === 'movies.json' && Array.isArray(parsed)) snapshotData.stats.moviesCount = parsed.length;
                    if (filename === 'plans.json' && Array.isArray(parsed)) snapshotData.stats.plansCount = parsed.length;
                    if (filename === 'requests.json' && Array.isArray(parsed)) snapshotData.stats.requestsCount = parsed.length;
                } catch (err) {
                    console.error(`Error reading ${filename} for backup:`, err);
                }
            }
        });

        // Compress snapshot
        const jsonString = JSON.stringify(snapshotData);
        const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));
        fs.writeFileSync(targetPath, compressed);

        // Clean older backups (keep last 20)
        pruneOldBackups();

        const stats = fs.statSync(targetPath);

        const backupResult = {
            id: backupId,
            filename: targetFilename,
            createdAt: timestamp.toISOString(),
            triggerType,
            reason: snapshotData.reason,
            sizeBytes: stats.size,
            sizeFormatted: (stats.size / 1024).toFixed(1) + ' KB',
            stats: snapshotData.stats
        };

        // Dispatch copy to Telegram in background
        const telegramCaption = `📦 *باکئەپی پارێزراوی Kurdish Stream*\n\n` +
            `🗓️ بەروار: \`${new Date().toLocaleString('ckb-IQ')}\`\n` +
            `📂 فایل: \`${targetFilename}\`\n` +
            `💾 قەبارە: *${backupResult.sizeFormatted}*\n` +
            `👥 بەکارهێنەران: *${snapshotData.stats.usersCount}*\n` +
            `🎬 فیلم و دراما: *${snapshotData.stats.moviesCount}*\n` +
            `💳 پلانەکان: *${snapshotData.stats.plansCount}*\n` +
            `⚙️ شێواز: *${triggerType === 'auto' ? 'ئۆتۆماتیکی ڕۆژانە 🤖' : 'دەستی بەڕێوەبەر 👤'}*\n\n` +
            `🔒 _داتاکانت لە تێلیگرام بە تەواوی پارێزراون._`;

        sendBackupToTelegram(targetPath, targetFilename, telegramCaption).catch(err => {
            console.error('Background telegram backup failed:', err);
        });

        return {
            success: true,
            backup: backupResult
        };
    } catch (error) {
        console.error('Failed to create backup:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sends a backup archive file to Telegram Chat
 */
async function sendBackupToTelegram(filePath, filename, caption) {
    const token = process.env.TELEGRAM_BOT_TOKEN || '8888836091:AAG3EqdiVnuMApik7QEo8WJl6TeavBFcprY';
    const chatId = process.env.TELEGRAM_CHAT_ID || '1838030544';

    if (!token || !chatId || !fs.existsSync(filePath)) {
        return { success: false, error: 'Telegram credentials or file missing' };
    }

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: 'application/gzip' });

        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', caption || '📦 باکئەپی پارێزراوی Kurdish Stream');
        form.append('parse_mode', 'Markdown');
        form.append('document', blob, filename);

        const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: form
        });

        const data = await res.json();
        return { success: data.ok, result: data };
    } catch (e) {
        console.error('Telegram backup dispatch failed:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Prunes old backups keeping the most recent 20
 */
function pruneOldBackups(keepCount = 20) {
    try {
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('backup_') && f.endsWith('.json.gz'))
            .map(f => ({
                filename: f,
                path: path.join(BACKUPS_DIR, f),
                mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length > keepCount) {
            const toDelete = files.slice(keepCount);
            toDelete.forEach(f => {
                try {
                    fs.unlinkSync(f.path);
                } catch (e) {}
            });
        }
    } catch (e) {
        console.error('Error pruning backups:', e);
    }
}

/**
 * Lists all existing backups
 */
function listBackups() {
    try {
        if (!fs.existsSync(BACKUPS_DIR)) return [];

        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('backup_') && (f.endsWith('.json.gz') || f.endsWith('.json')))
            .map(f => {
                const filePath = path.join(BACKUPS_DIR, f);
                const stat = fs.statSync(filePath);

                // Quick metadata extraction
                let meta = {
                    id: f.replace('.json.gz', '').replace('.json', ''),
                    filename: f,
                    createdAt: stat.mtime.toISOString(),
                    sizeBytes: stat.size,
                    sizeFormatted: (stat.size / 1024).toFixed(1) + ' KB',
                    triggerType: f.includes('manual') ? 'manual' : 'auto',
                    reason: 'باکئەپی سیستەم'
                };

                try {
                    if (f.endsWith('.json.gz')) {
                        const gzBuffer = fs.readFileSync(filePath);
                        const decompressed = zlib.gunzipSync(gzBuffer).toString('utf-8');
                        const data = JSON.parse(decompressed);
                        meta.createdAt = data.createdAt || meta.createdAt;
                        meta.triggerType = data.triggerType || meta.triggerType;
                        meta.reason = data.reason || meta.reason;
                        meta.stats = data.stats || {};
                    }
                } catch (e) {}

                return meta;
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return files;
    } catch (error) {
        console.error('Error listing backups:', error);
        return [];
    }
}

/**
 * Restores all database files from a given backup
 */
function restoreBackup(filename) {
    try {
        const targetPath = path.join(BACKUPS_DIR, filename);
        if (!fs.existsSync(targetPath)) {
            return { success: false, error: 'فایلی باکئەپ نەدۆزرایەوە' };
        }

        let snapshotData = null;
        if (filename.endsWith('.json.gz')) {
            const gzBuffer = fs.readFileSync(targetPath);
            const decompressed = zlib.gunzipSync(gzBuffer).toString('utf-8');
            snapshotData = JSON.parse(decompressed);
        } else {
            const content = fs.readFileSync(targetPath, 'utf-8');
            snapshotData = JSON.parse(content);
        }

        if (!snapshotData || !snapshotData.files) {
            return { success: false, error: 'پێکهاتەی فایلی باکئەپ تەندروست نییە' };
        }

        // Before restoring, create a safety restore checkpoint!
        createBackup('manual', 'باکئەپی فریاگوزاری پێش گەڕاندنەوەی داتا');

        // Restore each file
        Object.entries(snapshotData.files).forEach(([fileKey, fileContent]) => {
            const destPath = path.join(DATA_DIR, fileKey);
            fs.writeFileSync(destPath, JSON.stringify(fileContent, null, 2), 'utf-8');
        });

        return {
            success: true,
            restoredFrom: filename,
            createdAt: snapshotData.createdAt,
            stats: snapshotData.stats
        };
    } catch (error) {
        console.error('Failed to restore backup:', error);
        return { success: false, error: error.message };
    }
}

let lastMidnightBackupDate = '';

/**
 * Initializes automatic daily backup scheduler
 * Strictly triggers at 12:00 AM (00:00) midnight every night
 */
function initAutoBackupSchedule() {
    console.log('[BackupService] 🌙 Midnight auto-backup scheduler active. Will send to Telegram strictly at 12:00 AM (00:00).');

    const checkMidnight = () => {
        try {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            // Trigger strictly at 00:00 (12:00 AM midnight)
            if (hours === 0 && minutes === 0) {
                if (lastMidnightBackupDate !== todayStr) {
                    lastMidnightBackupDate = todayStr;
                    console.log(`[BackupService] ⏰ 12:00 AM reached! Sending daily backup to Telegram for ${todayStr}...`);
                    createBackup('auto', 'باکئەپی ئۆتۆماتیکی ڕۆژانەی کاتژمێر ١٢ی شەو');
                }
            }
        } catch (e) {
            console.error('[BackupService] Scheduled backup check error:', e);
        }
    };

    // Check every 30 seconds
    setInterval(checkMidnight, 30 * 1000);
}

module.exports = {
    createBackup,
    listBackups,
    restoreBackup,
    sendBackupToTelegram,
    initAutoBackupSchedule,
    BACKUPS_DIR
};
