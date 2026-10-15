const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

const db = require('../db');

const DATA_FILES = [
    'users.json',
    'movies.json',
    'plans.json',
    'requests.json',
    'activity_log.json',
    'analytics.json',
    'glossary.json',
    'internal_notes.json',
    'subtitle_history.json',
    'translator_payroll.json',
    'system_settings.json'
];

/**
 * Creates a comprehensive snapshot of all database files and sends to Telegram
 */
function createBackup(triggerType = 'auto', reason = '') {
    try {
        const timestamp = new Date();
        const dateStr = timestamp.toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const backupId = `backup_${dateStr}`;
        const targetFilename = `${backupId}.json.gz`;
        const targetPath = path.join(BACKUPS_DIR, targetFilename);

        const users = db.getUsers();
        const movies = db.getMovies();
        const plans = db.getPlans();
        const requests = db.getRequests();

        const snapshotData = {
            id: backupId,
            filename: targetFilename,
            createdAt: timestamp.toISOString(),
            triggerType, // 'auto' | 'manual'
            reason: reason || (triggerType === 'auto' ? 'باکئەپی ئۆتۆماتیکی ڕۆژانەی سیستەم' : 'باکئەپی دەستی لەلایەن بەڕێوەبەرەوە'),
            files: {
                'users.json': users,
                'movies.json': movies,
                'plans.json': plans,
                'requests.json': requests,
                'activity_log.json': db.getActivityLogs(2000),
                'analytics.json': db.getAnalytics(),
                'glossary.json': db.getGlossary(),
                'internal_notes.json': db.getInternalNotes(),
                'subtitle_history.json': db.getSubtitleHistory(),
                'translator_payroll.json': db.getTranslatorPayroll(),
                'system_settings.json': db.getSystemSettings()
            },
            stats: {
                usersCount: users.length,
                moviesCount: movies.length,
                plansCount: plans.length,
                requestsCount: requests.length
            }
        };

        // Also sync local json files in background
        Object.entries(snapshotData.files).forEach(([fName, content]) => {
            try {
                fs.writeFileSync(path.join(DATA_DIR, fName), JSON.stringify(content, null, 2), 'utf-8');
            } catch (e) {}
        });

        // Compress snapshot
        const jsonString = JSON.stringify(snapshotData);
        const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));
        fs.writeFileSync(targetPath, compressed);

        // Also trigger SQLite native DB snapshot
        db.backupDatabase();

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
        const dateKurdStr = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Baghdad',
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date());

        const telegramCaption = `📦 <b>باکئەپی پارێزراوی Kurdish Stream</b>\n\n` +
            `🗓️ بەروار: <code>${dateKurdStr}</code> (کاتی کوردستان)\n` +
            `📂 فایل: <code>${targetFilename}</code>\n` +
            `💾 قەبارە: <b>${backupResult.sizeFormatted}</b>\n` +
            `👥 بەکارهێنەران: <b>${snapshotData.stats.usersCount}</b>\n` +
            `🎬 فیلم و دراما: <b>${snapshotData.stats.moviesCount}</b>\n` +
            `💳 پلانەکان: <b>${snapshotData.stats.plansCount}</b>\n` +
            `⚙️ شێواز: <b>${triggerType === 'auto' ? 'ئۆتۆماتیکی ڕۆژانەی کاتژمێر ١٢ی شەو 🤖' : 'دەستی بەڕێوەبەر 👤'}</b>\n\n` +
            `🔒 <i>داتاکانت لە تێلیگرام بە تەواوی پارێزراون.</i>`;

        sendBackupToTelegram(targetPath, targetFilename, telegramCaption).catch(err => {
            console.error('[BackupService] Background telegram backup failed:', err);
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
async function sendBackupToTelegram(filePath, filename, caption, specificChatId = null) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = specificChatId || process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId || !fs.existsSync(filePath)) {
        console.warn('[Telegram Backup] Missing credentials or file:', { hasToken: !!token, hasChatId: !!chatId, fileExists: fs.existsSync(filePath) });
        return { success: false, error: 'Telegram credentials or file missing' };
    }

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: 'application/gzip' });

        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', caption || '📦 باکئەپی پارێزراوی Kurdish Stream');
        form.append('parse_mode', 'HTML');
        form.append('document', blob, filename);

        let res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: form
        });

        let data = await res.json();
        if (data.ok) {
            console.log(`[Telegram Backup] ✅ Backup successfully delivered to Telegram chat ${chatId}: ${filename}`);
            return { success: true, result: data };
        }

        console.error('[Telegram Backup] First dispatch failed:', data);

        // Fallback retry with simple plain caption without formatting in case HTML was rejected
        const fallbackForm = new FormData();
        fallbackForm.append('chat_id', chatId);
        fallbackForm.append('caption', `📦 باکئەپی Kurdish Stream: ${filename}`);
        fallbackForm.append('document', blob, filename);

        res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: fallbackForm
        });
        data = await res.json();
        if (data.ok) {
            console.log(`[Telegram Backup] ✅ Backup delivered via fallback to Telegram chat ${chatId}`);
            return { success: true, result: data };
        }

        console.error('[Telegram Backup] Fallback dispatch also failed:', data);
        return { success: false, error: data.description || 'Telegram API error' };
    } catch (e) {
        console.error('[Telegram Backup] Dispatch exception:', e);
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

        // Restore to Database and JSON files
        if (snapshotData.files['movies.json']) db.saveAllMovies(snapshotData.files['movies.json']);
        if (snapshotData.files['users.json']) db.saveAllUsers(snapshotData.files['users.json']);
        if (snapshotData.files['plans.json']) db.saveAllPlans(snapshotData.files['plans.json']);
        if (snapshotData.files['requests.json']) db.saveAllRequests(snapshotData.files['requests.json']);
        if (snapshotData.files['activity_log.json']) db.saveAllActivityLogs(snapshotData.files['activity_log.json']);
        if (snapshotData.files['analytics.json']) db.saveAnalytics(snapshotData.files['analytics.json']);
        if (snapshotData.files['glossary.json']) db.saveAllGlossary(snapshotData.files['glossary.json']);
        if (snapshotData.files['internal_notes.json']) db.saveAllInternalNotes(snapshotData.files['internal_notes.json']);
        if (snapshotData.files['subtitle_history.json']) db.saveAllSubtitleHistory(snapshotData.files['subtitle_history.json']);
        if (snapshotData.files['translator_payroll.json']) db.saveTranslatorPayroll(snapshotData.files['translator_payroll.json']);
        if (snapshotData.files['system_settings.json']) db.saveSystemSettings(snapshotData.files['system_settings.json']);

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
let isTelegramPollingActive = false;

/**
 * Starts interactive Telegram bot polling so users can talk to the bot,
 * send /start or /backup, and get instant database backups directly on their phone!
 */
function startTelegramBotListener() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || isTelegramPollingActive) return;
    isTelegramPollingActive = true;

    console.log('[Telegram Bot] 🤖 Telegram bot interactive listener started...');
    let offset = 0;

    const poll = async () => {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 35000);

            const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=25`, {
                signal: controller.signal
            });
            clearTimeout(timer);

            const data = await res.json();
            if (data.ok && Array.isArray(data.result)) {
                for (const update of data.result) {
                    offset = update.update_id + 1;
                    const msg = update.message;
                    if (!msg || !msg.text) continue;

                    const chatId = msg.chat.id;
                    const text = msg.text.trim();
                    const fromName = msg.from?.first_name || 'بەڕێز';

                    // Dynamically update process.env.TELEGRAM_CHAT_ID to this user
                    process.env.TELEGRAM_CHAT_ID = String(chatId);

                    if (text === '/start') {
                        const welcomeMsg = `🌸 <b>سڵاو ${fromName}!</b>\n\n` +
                            `🤖 <b>بۆتی فەرمیی باکئەپی پارێزراوی Kurdish Stream</b> بە سەرکەوتوویی بەسترایەوە.\n\n` +
                            `⏰ <b>کاتی ناردنی باکئەپ:</b> هەموو شەوێک ڕێک کاتژمێر <b>١٢:٠٠ی شەو</b> (بە کاتی کوردستان) نوێترین کۆپیی داتابەیس بە ئۆتۆماتیکی دەنێردرێتە ئەم چاتە.\n\n` +
                            `⚡ <b>بۆ داواکردنی باکئەپ هەر ئێستا:</b>\n` +
                            `دەتوانیت کلیک لە /backup بکەیت یان بنووسیت: <code>/backup</code>`;

                        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: welcomeMsg,
                                parse_mode: 'HTML'
                            })
                        }).catch(e => console.error('[Telegram Bot] Send welcome error:', e));
                    } else if (text === '/backup' || text.toLowerCase() === 'backup' || text === 'باکئەپ') {
                        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: '⏳ خەریکی ئامادەکردن و کۆمپرێسکردنی داتابەیسی Kurdish Streamم... کەمێکی تر فایلەکە دەگات!',
                                parse_mode: 'HTML'
                            })
                        }).catch(() => {});

                        // Create snapshot and send to Telegram chat
                        createBackup('manual', `داواکرا لە ڕێگەی تێلیگرامەوە (${fromName})`);
                    } else {
                        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `سڵاو ${fromName}! 🎬\nئەم بۆتە تایبەتە بە باکئەپی پارێزراوی Kurdish Stream.\n\n👉 بۆ داگرتنی نوێترین فایلی باکئەپ بنووسە: /backup\n\nوە هەموو شەوێک کاتژمێر ١٢:٠٠ی شەو (کاتی کوردستان) ئۆتۆماتیکی باکئەپ دەنێرێت.`,
                                parse_mode: 'HTML'
                            })
                        }).catch(() => {});
                    }
                }
            }
        } catch (err) {
            // Temporary timeout or network glitch - backoff 5 seconds
            await new Promise(r => setTimeout(r, 5000));
        }

        setTimeout(poll, 1500);
    };

    poll();
}

/**
 * Initializes automatic daily backup scheduler
 * Strictly triggers at 12:00 AM (00:00) midnight Kurdistan Time every night
 */
function initAutoBackupSchedule() {
    console.log('[BackupService] 🌙 Midnight auto-backup scheduler active. Will send to Telegram strictly at 12:00 AM (00:00) Kurdistan Time.');

    // Start interactive Telegram bot listener
    startTelegramBotListener();

    const checkMidnight = () => {
        try {
            const now = new Date();
            // Get current time in Kurdistan Timezone (Asia/Baghdad, UTC+3)
            const kurdTimeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Baghdad',
                hour: 'numeric',
                minute: 'numeric',
                hour12: false
            }).format(now);
            const [hours, minutes] = kurdTimeStr.split(':').map(Number);
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(now); // YYYY-MM-DD

            // Trigger at 00:00 (12:00 AM midnight Kurdistan time)
            if (hours === 0 && (minutes === 0 || minutes === 1)) {
                if (lastMidnightBackupDate !== todayStr) {
                    lastMidnightBackupDate = todayStr;
                    console.log(`[BackupService] ⏰ 12:00 AM Kurdistan Time reached! Sending daily backup to Telegram for ${todayStr}...`);
                    createBackup('auto', 'باکئەپی ئۆتۆماتیکی ڕۆژانەی کاتژمێر ١٢ی شەو (کاتی کوردستان)');
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
