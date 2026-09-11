const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { execFile, spawn } = require('child_process');
const rateLimit = require('express-rate-limit');
const { moviesCache } = require('./cache/memoryCache');
const { WebSocketServer, WebSocket } = require('ws');

// ─── Real-time WebSocket Server Manager ───
let wss = null;
const activeSockets = new Set();

const broadcastWs = (event, payload, filterFn = null) => {
    if (!wss) return;
    const message = JSON.stringify({ event, payload, timestamp: Date.now() });
    activeSockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            if (!filterFn || filterFn(ws)) {
                try {
                    ws.send(message);
                } catch (err) {
                    console.error('[WS] Send error:', err.message);
                }
            }
        }
    });
};

// FFmpeg Process Manager to prevent stuck processes
const activeFfmpegProcesses = new Map();

const killExistingFfmpeg = (clientId) => {
    const existing = activeFfmpegProcesses.get(clientId);
    if (existing) {
        console.log(`[FFmpeg Manager] Killing existing process for client: ${clientId}`);
        try {
            existing.kill('SIGKILL');
        } catch (e) {
            console.error('[FFmpeg Manager] Error killing process:', e.message);
        }
        activeFfmpegProcesses.delete(clientId);
    }
};

const registerFfmpegProcess = (clientId, process) => {
    killExistingFfmpeg(clientId);
    activeFfmpegProcesses.set(clientId, process);
    console.log(`[FFmpeg Manager] Registered new process for client: ${clientId}`);
};

const cleanupFfmpegProcess = (clientId) => {
    activeFfmpegProcesses.delete(clientId);
    console.log(`[FFmpeg Manager] Cleaned up process for client: ${clientId}`);
};
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const dotenv = require('dotenv');

// Load env from common locations so both local and server setups work.
[
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '.env')
].forEach((envPath) => {
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
});

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MOVIES_DIR = path.join(__dirname, '..', 'uploads', 'movies');
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const ANALYTICS_FILE = path.join(__dirname, 'data', 'analytics.json');
const REQUESTS_FILE = path.join(__dirname, 'data', 'requests.json');
const PLANS_FILE = path.join(__dirname, 'data', 'plans.json');
const SUBTITLE_HISTORY_FILE = path.join(__dirname, 'data', 'subtitle_history.json');

if (!fs.existsSync(MOVIES_DIR)) fs.mkdirSync(MOVIES_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(ANALYTICS_FILE)) fs.writeFileSync(ANALYTICS_FILE, JSON.stringify({ visits: [] }));
if (!fs.existsSync(REQUESTS_FILE)) fs.writeFileSync(REQUESTS_FILE, '[]');
if (!fs.existsSync(PLANS_FILE)) fs.writeFileSync(PLANS_FILE, '[]');
if (!fs.existsSync(SUBTITLE_HISTORY_FILE)) fs.writeFileSync(SUBTITLE_HISTORY_FILE, '[]');

const readSubtitleHistory = () => {
    try {
        if (!fs.existsSync(SUBTITLE_HISTORY_FILE)) return [];
        return JSON.parse(fs.readFileSync(SUBTITLE_HISTORY_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
};

const writeSubtitleHistory = (data) => {
    try {
        fs.writeFileSync(SUBTITLE_HISTORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing subtitle history:', e);
    }
};

const INTERNAL_NOTES_FILE = path.join(__dirname, 'data', 'internal_notes.json');
if (!fs.existsSync(INTERNAL_NOTES_FILE)) fs.writeFileSync(INTERNAL_NOTES_FILE, '[]');

const readInternalNotes = () => {
    try {
        if (!fs.existsSync(INTERNAL_NOTES_FILE)) return [];
        return JSON.parse(fs.readFileSync(INTERNAL_NOTES_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
};

const writeInternalNotes = (data) => {
    try {
        fs.writeFileSync(INTERNAL_NOTES_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing internal notes:', e);
    }
};

const ACTIVITY_LOG_FILE = path.join(__dirname, 'data', 'activity_log.json');
if (!fs.existsSync(ACTIVITY_LOG_FILE)) fs.writeFileSync(ACTIVITY_LOG_FILE, '[]');

const DEFAULT_SYSTEM_SETTINGS = {
    dualSubTrialMinutes: 60,
    dualSubResetHours: 24,
    dualSubTrialActive: true,
    dualSubExpiredAction: 'block_all',
    initialRegistrationCredits: 75
};

const SYSTEM_SETTINGS_FILE = path.join(__dirname, 'data', 'system_settings.json');
if (!fs.existsSync(SYSTEM_SETTINGS_FILE)) {
    fs.writeFileSync(SYSTEM_SETTINGS_FILE, JSON.stringify(DEFAULT_SYSTEM_SETTINGS, null, 2));
}

const readSystemSettings = () => {
    try {
        if (!fs.existsSync(SYSTEM_SETTINGS_FILE)) {
            return { ...DEFAULT_SYSTEM_SETTINGS };
        }
        const data = JSON.parse(fs.readFileSync(SYSTEM_SETTINGS_FILE, 'utf-8'));
        return { ...DEFAULT_SYSTEM_SETTINGS, ...data };
    } catch (e) {
        return { ...DEFAULT_SYSTEM_SETTINGS };
    }
};

const writeSystemSettings = (data) => {
    try {
        fs.writeFileSync(SYSTEM_SETTINGS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing system settings:', e);
    }
};

const GLOSSARY_FILE = path.join(__dirname, 'data', 'glossary.json');
const INITIAL_GLOSSARY = [
    { id: 'gl_1', english: 'agent', kurdish: 'بریکار', alternatives: ['مەئموور', 'نوێنەر'], category: 'سیخوڕی و ئەمنی', note: 'لە فیلمی سیخوڕیدا بریکار بەکاردێت نەک عامیل', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_2', english: 'protocol', kurdish: 'پرۆتۆکۆل', alternatives: ['ڕێکار', 'یاسا'], category: 'تەکنیکی و سەربازی', note: 'ڕێکاری فەرمی یان پرۆتۆکۆڵی ئەمنی', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_3', english: 'trailer', kurdish: 'تڕەیلەر', alternatives: ['پێشبینین', 'تەیرەلەر'], category: 'سینەما', note: 'ڤیدیۆی کورتی ناساندنی فیلم', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_4', english: 'season', kurdish: 'وەرز', alternatives: ['بەش'], category: 'سینەما', note: 'وەرز بۆ زنجیرە بەکاردێت', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_5', english: 'episode', kurdish: 'ئەڵقە', alternatives: ['بەش'], category: 'سینەما', note: 'ئەڵقەی زنجیرە', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_6', english: 'sequel', kurdish: 'بەشی دووەم', alternatives: ['تەواوکەر', 'پاشکۆ'], category: 'سینەما', note: 'تەواوکەری بەشەکانی پێشوو', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_7', english: 'undercover', kurdish: 'نهێنی / بەنهێنی', alternatives: ['سیخوڕی', 'شاردراوە'], category: 'پۆلیسی و سیخوڕی', note: 'پۆلیس یان بریکاری نهێنی', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_8', english: 'flashback', kurdish: 'گەڕانەوە بۆ ڕابردوو', alternatives: ['فلاشباک'], category: 'سینەما', note: 'دیمەنی یادەوەری و ڕابردوو', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_9', english: 'target', kurdish: 'ئامانج', alternatives: ['نیشانە'], category: 'سەربازی و کردار', note: 'ئامانجی پێکراو یان دیاریکراو', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'gl_10', english: 'suspect', kurdish: 'گومانلێکراو', alternatives: ['تۆمەتبار'], category: 'پۆلیسی و یاسایی', note: 'کەسی گومانلێکراو لە تاوانێکدا', createdBy: { username: 'سیستەم', role: 'super_admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
];

if (!fs.existsSync(GLOSSARY_FILE)) {
    fs.writeFileSync(GLOSSARY_FILE, JSON.stringify(INITIAL_GLOSSARY, null, 2));
}

const readGlossary = () => {
    try {
        if (!fs.existsSync(GLOSSARY_FILE)) return [];
        return JSON.parse(fs.readFileSync(GLOSSARY_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
};

const writeGlossary = (data) => {
    try {
        fs.writeFileSync(GLOSSARY_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing glossary:', e);
    }
};

const readActivityLogs = () => {
    try {
        if (!fs.existsSync(ACTIVITY_LOG_FILE)) return [];
        return JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
};

const writeActivityLogs = (data) => {
    try {
        fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing activity logs:', e);
    }
};

// ==========================================
// بزوێنەری شوێندۆزی ئایپی و ناسینەوەی شارە کوردییەکان (Kurdish Geo-IP Engine)
// ==========================================
const KURDISH_CITIES = [
    'erbil', 'hewler', 'hewlêr', 'hawler', 'sulaymaniyah', 'sulaimani', 'sulaimaniyah', 'slemani', 
    'duhok', 'dohuk', 'kirkuk', 'kerkuk', 'halabja', 'kalar', 'ranya', 'zakho', 'akre', 'soran', 
    'koya', 'chamchamal', 'darbandikhan', 'shaqlawa', 'amedi', 'bardarash', 'rawanduz',
    'mahabad', 'sanandaj', 'sna', 'urmia', 'mariwan', 'baneh', 'saqqez', 'piranshahr',
    'qamishli', 'afrin', 'kobani', 'hasakah', 'amuda', 'derik',
    'diyarbakir', 'amed', 'van', 'mardin', 'batman', 'dersim', 'cizre', 'urfa'
];

const CITY_KURDISH_NAMES = {
    'erbil': 'هەولێر',
    'hewler': 'هەولێر',
    'hewlêr': 'هەولێر',
    'hawler': 'هەولێر',
    'sulaymaniyah': 'سلێمانی',
    'sulaimani': 'سلێمانی',
    'sulaimaniyah': 'سلێمانی',
    'slemani': 'سلێمانی',
    'duhok': 'دهۆک',
    'dohuk': 'دهۆک',
    'kirkuk': 'کەرکووک',
    'kerkuk': 'کەرکووک',
    'halabja': 'هەڵەبجە',
    'kalar': 'کەلار',
    'ranya': 'ڕانیە',
    'zakho': 'زاخۆ',
    'akre': 'ئاکرێ',
    'soran': 'سۆران',
    'koya': 'کۆیە',
    'chamchamal': 'چەمچەماڵ',
    'baghdad': 'بەغداد',
    'basra': 'بەسرە',
    'najaf': 'نەجەف',
    'karbala': 'کەربەلا',
    'mosul': 'مووسڵ',
    'anbar': 'ئەنبار',
    'nasiriyah': 'ناسیریە',
    'amara': 'عەمارە',
    'samawah': 'سەماوە',
    'diwaniyah': 'دیوانیە',
    'hilla': 'حیلا',
    'kut': 'کووت',
    'ramadi': 'ڕەمادی',
    'fallujah': 'فەللوجە'
};

const COUNTRY_FLAGS = {
    'IQ': '🇮🇶',
    'TR': '🇹🇷',
    'IR': '🇮🇷',
    'SY': '🇸🇾',
    'DE': '🇩🇪',
    'SE': '🇸🇪',
    'GB': '🇬🇧',
    'US': '🇺🇸',
    'NL': '🇳🇱',
    'FR': '🇫🇷',
    'NO': '🇳🇴',
    'DK': '🇩🇰',
    'FI': '🇫🇮',
    'AT': '🇦🇹',
    'CH': '🇨🇭',
    'BE': '🇧🇪',
    'CA': '🇨🇦',
    'AU': '🇦🇺',
    'AE': '🇦🇪',
    'SA': '🇸🇦',
    'KW': '🇰🇼',
    'JO': '🇯🇴',
    'LB': '🇱🇧',
    'EG': '🇪🇬',
    'QA': '🇶🇦'
};

const COUNTRY_KURDISH_NAMES = {
    'IQ': 'عێراق',
    'DE': 'ئەڵمانیا',
    'SE': 'سوید',
    'GB': 'بەریتانیا',
    'US': 'ئەمریکا',
    'NL': 'هۆڵەندا',
    'FR': 'فەڕەنسا',
    'NO': 'نەرویج',
    'DK': 'دانیمارک',
    'FI': 'فینلەندا',
    'AT': 'نەمسا',
    'CH': 'سویسرا',
    'BE': 'بەلجیکا',
    'CA': 'کەنەدا',
    'AU': 'ئوسترالیا',
    'TR': 'تورکیا',
    'IR': 'ئێران',
    'SY': 'سووریا',
    'AE': 'ئیمارات',
    'SA': 'سعوودیە',
    'KW': 'کووەیت',
    'JO': 'ئوردن',
    'LB': 'لوبنان',
    'EG': 'میسر',
    'QA': 'قەتەر'
};

const ipLocationCache = new Map();

function resolveIpLocationSync(ip) {
    if (!ip) return null;
    let cleanIp = String(ip).trim();
    if (cleanIp.includes(',')) cleanIp = cleanIp.split(',')[0].trim();
    
    // Check if localhost/private
    if (cleanIp === '::1' || cleanIp === '127.0.0.1' || cleanIp === '::ffff:127.0.0.1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.16.')) {
        return {
            ip: cleanIp,
            city: 'هەولێر (خۆماڵی)',
            cityEn: 'Erbil (Local)',
            country: 'کوردستان',
            countryEn: 'Kurdistan',
            flag: '☀️',
            isKurdish: true,
            label: 'هەولێر ☀️'
        };
    }

    if (ipLocationCache.has(cleanIp)) {
        return ipLocationCache.get(cleanIp);
    }

    // Default fallback
    return {
        ip: cleanIp,
        city: 'هەولێر',
        country: 'کوردستان',
        flag: '☀️',
        isKurdish: true,
        label: 'هەولێر ☀️'
    };
}

// Background async fetch for external IPs
async function enrichIpLocation(ip) {
    if (!ip) return;
    let cleanIp = String(ip).trim();
    if (cleanIp.includes(',')) cleanIp = cleanIp.split(',')[0].trim();

    if (cleanIp === '::1' || cleanIp === '127.0.0.1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.')) return;
    if (ipLocationCache.has(cleanIp)) return;

    try {
        const response = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,message,country,countryCode,regionName,city,isp`);
        const data = await response.json();
        
        if (data && data.status === 'success') {
            const rawCity = (data.city || '').toLowerCase();
            const rawRegion = (data.regionName || '').toLowerCase();
            const isKurdishCity = KURDISH_CITIES.some(c => rawCity.includes(c) || rawRegion.includes(c));
            
            const kurdishCityName = CITY_KURDISH_NAMES[rawCity] || data.city;
            let flag = COUNTRY_FLAGS[data.countryCode] || '🌐';
            let countryName = COUNTRY_KURDISH_NAMES[data.countryCode] || data.country || 'عێراق';
            
            if (isKurdishCity) {
                flag = '☀️';
                countryName = 'کوردستان';
            }

            const result = {
                ip: cleanIp,
                city: kurdishCityName,
                cityEn: data.city,
                region: data.regionName,
                country: countryName,
                countryEn: data.country,
                countryCode: data.countryCode,
                flag: flag,
                isKurdish: isKurdishCity,
                isp: data.isp,
                label: isKurdishCity ? `${kurdishCityName} ☀️` : `${kurdishCityName} ${flag}`
            };

            ipLocationCache.set(cleanIp, result);
        }
    } catch (e) {
        // Fallback
    }
}

const logAdminActivity = (eventType, user, target = {}, details = {}, req = null) => {
    try {
        const logs = readActivityLogs();
        
        // Extract IP & User Agent
        let ip = '';
        let userAgent = '';
        if (req) {
            ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '';
            if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
            userAgent = req.headers['user-agent'] || '';
        } else if (details && details.ip) {
            ip = details.ip;
            userAgent = details.userAgent || '';
        }

        // Trigger background geo-lookup for future requests
        if (ip) enrichIpLocation(ip);

        // Resolve location
        const location = resolveIpLocationSync(ip);

        // Determine category if not explicitly provided
        let category = details.category;
        if (!category) {
            const ev = String(eventType).toLowerCase();
            if (ev.startsWith('login_') || ev.startsWith('auth_') || ev.includes('admin_') || ev.includes('user_suspend') || ev.includes('user_revoke') || ev.includes('password_') || ev.includes('security_')) {
                category = 'security';
            } else if (ev.startsWith('plan_') || ev.includes('pricing_')) {
                category = 'pricing';
            } else if (ev.startsWith('receipt_') || ev.includes('credit_')) {
                category = 'billing';
            } else if (ev.startsWith('glossary_')) {
                category = 'glossary';
            } else if (ev.includes('error') || ev.includes('crash')) {
                category = 'system';
            } else {
                category = 'content';
            }
        }

        // Determine status if not explicitly provided
        let status = details.status;
        if (!status) {
            const ev = String(eventType).toLowerCase();
            if (ev.includes('failed') || ev.includes('reject') || ev.includes('error') || ev.includes('suspend') || ev.includes('revoke')) {
                status = ev.includes('error') ? 'error' : 'warning';
            } else if (ev.includes('success') || ev.includes('approve') || ev.includes('create') || ev.includes('add')) {
                status = 'success';
            } else {
                status = 'info';
            }
        }

        const entry = {
            id: uuidv4(),
            eventType,
            category,
            status,
            admin: {
                id: user?.id || 'system',
                username: user?.username || (typeof user === 'string' ? user : (user?.email ? user.email.split('@')[0] : 'سیستەم')),
                role: user?.role || 'admin'
            },
            target: {
                id: target?.id || target?.targetId,
                title: target?.title || target?.targetTitle || '',
                type: target?.type,
                seasonNum: target?.seasonNum,
                episodeNum: target?.episodeNum
            },
            details: {
                ...details,
                ip: ip || details.ip || undefined,
                userAgent: userAgent || details.userAgent || undefined
            },
            ip,
            userAgent,
            location,
            timestamp: new Date().toISOString()
        };

        logs.unshift(entry);
        writeActivityLogs(logs.slice(0, 2000));
        return entry;
    } catch (e) {
        console.error('Error logging activity:', e);
    }
};

// In-Memory Editing Locks Map
const activeEditingLocks = new Map(); // key -> { userId, username, role, lockedAt, heartbeat }
const LOCK_TIMEOUT_MS = 45 * 1000; // 45 seconds timeout if no heartbeat

function getLockKey(movieId, seasonNum, episodeNum) {
    if (seasonNum && episodeNum) {
        return `${movieId}_s${seasonNum}_e${episodeNum}`;
    }
    return movieId;
}

// Periodically clean up stale locks
setInterval(() => {
    const now = Date.now();
    for (const [key, lock] of activeEditingLocks.entries()) {
        if (now - lock.heartbeat > LOCK_TIMEOUT_MS) {
            activeEditingLocks.delete(key);
        }
    }
}, 15000);

const RECEIPTS_DIR = path.join(__dirname, '..', 'uploads', 'receipts');
if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ======= Rate Limiters & Security =======
const { loginLimiter, registerLimiter, creditRequestLimiter, aiLimiter, apiGlobalLimiter } = require('./middleware/rateLimiter');
const { createBackup, listBackups, restoreBackup, initAutoBackupSchedule, BACKUPS_DIR } = require('./services/backupService');
const { optimizeImageToWebP, generateThumbnailWebP, convertAllExistingPosters } = require('./services/imageService');
const {
    getVapidPublicKey,
    readSettings: readNotificationSettings,
    writeSettings: writeNotificationSettings,
    readSubscriptions,
    addSubscription,
    broadcastPushToAll,
    sendPushToUser
} = require('./services/notificationService');

// Initialize automatic daily backup scheduler
initAutoBackupSchedule();

// Initialize initial WebP image optimization in background
setTimeout(() => {
    convertAllExistingPosters().then(r => {
        if (r.optimizedCount > 0) {
            console.log(`[WebP Optimization] Converted ${r.optimizedCount} posters to WebP. Saved ${(r.bytesSaved / (1024 * 1024)).toFixed(2)} MB!`);
        }
    }).catch(() => {});
}, 5000);

// ======= INACTIVITY PENALTY & STREAK DECAY SCHEDULER =======
const processInactivityPenalty = () => {
    try {
        const settings = readNotificationSettings();
        const minDays = Number(settings.inactivityReminderDays) || 3;
        const penaltyXP = Number(settings.inactivityPenaltyXP) || 20;
        const freqDays = Number(settings.reminderFrequencyDays) || 3;
        const pointsDeduct = Math.max(1, Math.round(penaltyXP / 10));

        const users = readUsers();
        let changed = false;
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        users.forEach(u => {
            if (!u.dailyStats) return;

            // Find last active date with watchMinutes > 0
            const activeDates = Object.entries(u.dailyStats)
                .filter(([_, s]) => s && s.watchMinutes > 0)
                .map(([d]) => d)
                .sort();

            const lastActiveStr = activeDates.length > 0 ? activeDates[activeDates.length - 1] : null;
            if (!lastActiveStr) return;

            const diffTime = Math.abs(new Date(todayStr).getTime() - new Date(lastActiveStr).getTime());
            const daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            // If inactive for configured minimum days
            if (daysInactive >= minDays) {
                // Deduct points based on configured penalty XP
                const oldPoints = u.points || 0;
                if (oldPoints > 0) {
                    u.points = Math.max(0, oldPoints - pointsDeduct);
                    changed = true;
                }

                // Send notification based on configured frequency
                if (daysInactive % freqDays === 0) {
                    if (!u.notifications) u.notifications = [];
                    const alreadyNotifiedToday = u.notifications.some(n => 
                        n.type === 'warning' && 
                        n.title?.includes('لێبڕینی خاڵی XP') && 
                        new Date(n.date).toISOString().split('T')[0] === todayStr
                    );

                    if (!alreadyNotifiedToday) {
                        const notifTitle = '⚠️ لێبڕینی خاڵی XP بەهۆی ناچالاکی';
                        const notifMsg = `ماوەی ${daysInactive} ڕۆژە فیلمت لە پلاتفۆرمەکە سەیر نەکردووە! ڕۆژانە ${penaltyXP} خاڵی XPت لێ کەم دەکرێتەوە. بۆ پاراستنی پلە و لێڤڵەکەت، ئێستا بگەڕێوە و دەست بە سەیرکردن بکە.`;

                        u.notifications.push({
                            id: uuidv4(),
                            title: notifTitle,
                            message: notifMsg,
                            type: 'warning',
                            date: Date.now(),
                            read: false
                        });
                        changed = true;

                        // Also send Web Push Notification to user's device!
                        sendPushToUser(u.id, {
                            title: notifTitle,
                            body: notifMsg,
                            icon: '/favicon.ico',
                            data: { url: '/profile' }
                        }).catch(() => {});
                    }
                }
            }
        });

        if (changed) {
            writeUsers(users);
        }
    } catch (err) {
        console.error('Failed to process inactivity penalties:', err);
    }
};

// Run every 12 hours and on startup
setInterval(processInactivityPenalty, 12 * 60 * 60 * 1000);
setTimeout(processInactivityPenalty, 10000);

// Apply global rate limiting to protect all API endpoints from DDoS / scraping
app.use('/api/', apiGlobalLimiter);

// Analytics middleware
app.use((req, res, next) => {
    try {
        let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '';
        if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
        const ua = req.headers['user-agent'] || '';
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        let isMobile = false;
        let isTablet = false;
        let os = 'Windows';
        let browser = 'Chrome';

        if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
            isTablet = true;
            os = /ipad/i.test(ua) ? 'iPadOS' : 'Android Tablet';
        } else if (/iphone|mobile|ipod|android/i.test(ua)) {
            isMobile = true;
            if (/iphone/i.test(ua)) os = 'iOS';
            else if (/android/i.test(ua)) os = 'Android';
        } else {
            if (/windows/i.test(ua)) os = 'Windows';
            else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
            else if (/linux/i.test(ua)) os = 'Linux';
        }

        if (/edg\//i.test(ua)) browser = 'Edge';
        else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
        else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
        else if (/safari/i.test(ua)) browser = 'Safari';
        else if (/opera|opr/i.test(ua)) browser = 'Opera';

        const deviceType = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');

        const analytics = readAnalytics();
        if (!analytics.visits) analytics.visits = [];
        
        const existingVisit = analytics.visits.find(v => v.ip === ip && v.date === today);
        if (!existingVisit) {
            analytics.visits.push({ 
                ip, 
                device: deviceType, 
                os, 
                browser, 
                date: today, 
                timestamp: Date.now() 
            });
            if (analytics.visits.length > 10000) analytics.visits = analytics.visits.slice(-10000);
            writeAnalytics(analytics);
        }
    } catch (err) {
        // Silent fail for analytics middleware
    }
    next();
});

const readMovies = () => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return data.map((m) => ({
        ...m,
        type: m.type || 'movie',
        posterCloudUrl: m.posterCloudUrl || null,
        videoUrl: m.videoUrl || null,
        fakeViews: m.fakeViews || 0,
        realViews: m.realViews || 0,
        retention: m.retention || { full: 0, partial75: 0, partial50: 0, partial25: 0 }
    }));
};

const execFileAsync = (command, args) => new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            error.stderr = stderr;
            return reject(error);
        }
        resolve({ stdout, stderr });
    });
});

const resolveVideoSource = (movie, seasonNumber, episodeNumber) => {
    if (!movie) return null;

    if (seasonNumber && episodeNumber && Array.isArray(movie.seasons)) {
        const season = movie.seasons.find((se) => se.number === parseInt(seasonNumber, 10));
        const episode = season?.episodes.find((ep) => ep.number === parseInt(episodeNumber, 10));
        if (!episode) return null;
        if (episode.videoFile) {
            return {
                mode: 'local',
                videoPath: path.join(MOVIES_DIR, movie.id, 'seasons', `s${seasonNumber}`, `e${episodeNumber}`, episode.videoFile)
            };
        }
        if (episode.videoUrl) return { mode: 'remote', videoUrl: episode.videoUrl };
        return null;
    }

    if (movie.videoFile) {
        return {
            mode: 'local',
            videoPath: path.join(MOVIES_DIR, movie.id, movie.videoFile)
        };
    }
    if (movie.videoUrl) return { mode: 'remote', videoUrl: movie.videoUrl };
    return null;
};

const extractSceneMedia = async (videoPath, timestampSeconds) => {
    const safeTimestamp = Number.isFinite(timestampSeconds) ? Math.max(0, timestampSeconds) : 0;
    const clipStart = Math.max(0, safeTimestamp - 0.35);
    const clipDuration = 1.8;
    const tempDir = path.join(os.tmpdir(), 'binama-flashcards-media');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const token = `${Date.now()}-${Math.round(safeTimestamp * 1000)}`;
    const screenshotPath = path.join(tempDir, `scene-${token}.jpg`);
    const audioPath = path.join(tempDir, `scene-${token}.mp3`);

    try {
        await execFileAsync('ffmpeg', [
            '-y',
            '-ss', safeTimestamp.toFixed(3),
            '-i', videoPath,
            '-frames:v', '1',
            '-vf', 'scale=960:-2',
            '-q:v', '3',
            screenshotPath
        ]);

        await execFileAsync('ffmpeg', [
            '-y',
            '-ss', clipStart.toFixed(3),
            '-i', videoPath,
            '-t', clipDuration.toFixed(3),
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-b:a', '64k',
            audioPath
        ]);

        const screenshotBase64 = fs.existsSync(screenshotPath)
            ? `data:image/jpeg;base64,${fs.readFileSync(screenshotPath).toString('base64')}`
            : null;
        const audioClipBase64 = fs.existsSync(audioPath)
            ? `data:audio/mpeg;base64,${fs.readFileSync(audioPath).toString('base64')}`
            : null;

        return { screenshotBase64, audioClipBase64 };
    } finally {
        [screenshotPath, audioPath].forEach((file) => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        });
    }
};

const writeMovies = (data) => {
    moviesCache.clear();
    return fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeTarget(target) {
    if (!target) return '';
    const clean = String(target).trim().toLowerCase();
    if (/^(\+|00)?[0-9\s\-]+$/.test(clean) && !clean.includes('@')) {
        return clean.replace(/[\s\-()]/g, '');
    }
    return clean;
}

const checkAndExpireSubscriptions = (users) => {
    const now = Date.now();
    let modified = false;

    users.forEach(u => {
        if (u.role === 'super_admin' || u.role === 'admin') return;

        if (u.subscriptionExpiresAt && u.subscriptionExpiresAt < now) {
            const oldPlan = u.plan || 'مانگانە';
            const unusedCredits = u.credits || 0;
            
            u.subscriptionExpiresAt = null;
            u.plan = null;
            u.isVip = false;
            u.credits = 0; // Reset unused credits upon 30-day expiration

            if (!u.creditUsage) u.creditUsage = [];
            u.creditUsage.push({
                id: uuidv4(),
                type: 'expire',
                amount: unusedCredits,
                plan: `${oldPlan} (بەسەرچوونی ٣٠ ڕۆژ)`,
                date: now,
                note: `ماوەی ٣٠ ڕۆژی پلانی ${oldPlan} کۆتایی هات و ${unusedCredits} کرێدیت پووچەڵکرایەوە.`
            });

            if (!u.notifications) u.notifications = [];
            u.notifications.push({
                id: uuidv4(),
                title: '⌛ ماوەی بەشدارییەکەت بەسەرچوو',
                message: `ماوەی ٣٠ ڕۆژەی پلانی ${oldPlan} کۆتایی هات و کرێدیتە بەکارنەهاتووەکان پووچەڵکرانەوە. دەتوانیت ئێستا پلانێکی نوێ بکڕیت و دەستبەجێ ئەکتیڤی بکەیتەوە!`,
                date: now,
                read: false,
                type: 'warning'
            });

            modified = true;
        }
    });

    return modified;
};

const checkAndExpireDualSubQuota = (users) => {
    try {
        const settings = readSystemSettings();
        const resetHours = typeof settings.dualSubResetHours === 'number' ? settings.dualSubResetHours : 24;
        if (resetHours <= 0) return false;

        const resetIntervalMs = resetHours * 3600 * 1000;
        const now = Date.now();
        let modified = false;

        users.forEach(u => {
            if (u.dualSubCycleStartTime && (now - u.dualSubCycleStartTime >= resetIntervalMs)) {
                if (u.dualSubWatchSeconds && u.dualSubWatchSeconds > 0) {
                    u.dualSubWatchSeconds = 0;
                    u.dualSubCycleStartTime = null;
                    modified = true;
                }
            }
        });

        return modified;
    } catch {
        return false;
    }
};

const readUsers = () => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    let needSave = false;
    if (checkAndExpireSubscriptions(users)) needSave = true;
    if (checkAndExpireDualSubQuota(users)) needSave = true;
    if (needSave) {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
    const hasAdmin = users.some((u) => u.role === 'admin' || u.role === 'super_admin');
    return users.map((u) => {
        let userRole = u.role || 'user';
        if (!hasAdmin && users[0]?.id === u.id) {
            userRole = 'super_admin';
        }
        if (u.username === 'maher2' || u.username?.toLowerCase() === 'admin') {
            userRole = 'super_admin';
        }
        const isPlanActive = Boolean(u.subscriptionExpiresAt && u.subscriptionExpiresAt > Date.now());
        const isVipUser = Boolean(u.isVip || userRole === 'super_admin' || userRole === 'admin' || isPlanActive);

        return {
            ...u,
            email: u.email || '',
            encryptedPassword: u.encryptedPassword || (u.plainPassword ? encryptPassword(u.plainPassword) : (u.password ? encryptPassword(u.password) : undefined)),
            role: userRole,
            permissions: u.permissions || (userRole === 'super_admin' ? {
                canTranslate: true,
                canAddMovies: true,
                canManageCredits: true,
                canManageComments: true,
                canPublishDirectly: true
            } : undefined),
            points: u.points || 0,
            credits: u.credits || 0,
            creditUsage: Array.isArray(u.creditUsage) ? u.creditUsage : [],
            suspendedUntil: u.suspendedUntil || null,
            suspensionReason: u.suspensionReason || null,
            notifications: Array.isArray(u.notifications) ? u.notifications : [],
            history: u.history || {},
            flashcards: Array.isArray(u.flashcards) ? u.flashcards : [],
            favorites: Array.isArray(u.favorites) ? u.favorites : [],
            watchLater: Array.isArray(u.watchLater) ? u.watchLater : [],
            watched: Array.isArray(u.watched) ? u.watched : [],
            dailyStats: u.dailyStats || {},
            dailyGoal: u.dailyGoal || 15,
            level: u.level || null,
            assessmentResult: u.assessmentResult || null,
            dualSubWatchSeconds: u.dualSubWatchSeconds || 0,
            dualSubCycleStartTime: u.dualSubCycleStartTime || null,
            isVip: isVipUser,
            plan: isPlanActive ? u.plan : (userRole === 'super_admin' ? 'Super Admin' : (userRole === 'admin' ? 'Admin' : null)),
            subscriptionExpiresAt: u.subscriptionExpiresAt || null
        };
    });
};

const writeUsers = (data) => fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));

const readAnalytics = () => {
    try {
        return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
    } catch {
        return { visits: [] };
    }
};

const writeAnalytics = (data) => fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));

const readRequests = () => {
    try {
        if (!fs.existsSync(REQUESTS_FILE)) fs.writeFileSync(REQUESTS_FILE, '[]');
        return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
};
const writeRequests = (data) => fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));

const readPlans = () => {
    try {
        if (!fs.existsSync(PLANS_FILE)) fs.writeFileSync(PLANS_FILE, '[]');
        const content = fs.readFileSync(PLANS_FILE, 'utf-8');
        return JSON.parse(content || '[]');
    } catch (e) {
        return [];
    }
};
const writePlans = (data) => fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2));

const crypto = require('crypto');

// Secret Key for AES-256 encryption & decryption
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'kurdish-stream-master-encryption-key-2026-secure-32chars!';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

function encryptPassword(text) {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(String(text), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (e) {
        console.error('[AES Encrypt Error]', e);
        return null;
    }
}

function decryptPassword(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string' || !encryptedText.includes(':')) return null;
    try {
        const textParts = encryptedText.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedData = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return null;
    }
}

const sanitizeUser = (user) => {
    const { password, passwordHash, plainPassword, encryptedPassword, ...safe } = user;
    safe.avatarUrl = safe.avatarUrl || safe.avatar || '';
    safe.avatar = safe.avatar || safe.avatarUrl || '';
    return safe;
};

const issueToken = (user) => {
    user.token = uuidv4() + uuidv4();
    user.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
};

const getTokenFromReq = (req) => req.headers.authorization?.split(' ')[1];

const getUser = (req) => {
    const token = getTokenFromReq(req);
    if (!token) return null;
    const user = readUsers().find((u) => u.token === token);
    if (!user) return null;
    if (!user.tokenExpiresAt || user.tokenExpiresAt < Date.now()) return null;
    return user;
};

const requireAuth = (req, res, next) => {
    const token = getTokenFromReq(req);
    const user = getUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()) {
        return res.status(403).json({ error: `ئەکاونتەکەت ڕاگیراوە بەهۆی: ${user.suspensionReason || 'سەرپێچی'} تا کاتی: ${new Date(user.suspendedUntil).toLocaleString()}` });
    }

    req.user = user;
    next();
};

const isSuperAdmin = (user) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.username === 'maher2' || user.username?.toLowerCase() === 'admin') return true;
    return false;
};

const hasPermission = (user, permKey) => {
    if (!user) return false;
    if (isSuperAdmin(user)) return true;
    if (user.role === 'admin') {
        if (!user.permissions) return true;
        return Boolean(user.permissions[permKey]);
    }
    return false;
};

const requireAdmin = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && !isSuperAdmin(req.user))) {
        return res.status(403).json({ error: 'Admin only' });
    }
    next();
};

const requireSuperAdmin = (req, res, next) => {
    if (!req.user || !isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'Super Admin only' });
    }
    next();
};

const requirePermission = (permKey) => (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && !isSuperAdmin(req.user))) {
        return res.status(403).json({ error: 'Admin only' });
    }
    if (!hasPermission(req.user, permKey)) {
        return res.status(403).json({ error: `تۆ مۆڵەتی ئەنجامدانی ئەم کارەت نییە (${permKey})` });
    }
    next();
};

const makeStorage = (getDir, getFilename) => multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            try {
                const dir = getDir(req);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                cb(null, dir);
            } catch (err) {
                console.error('[Multer Storage Error destination]:', err);
                cb(err);
            }
        },
        filename: (req, file, cb) => {
            try {
                const name = getFilename(req, file);
                cb(null, name);
            } catch (err) {
                console.error('[Multer Storage Error filename]:', err);
                cb(err);
            }
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB limit for local video/movie storage
});

const cloudUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            cb(null, tempDir);
        },
        filename: (req, file, cb) => {
            cb(null, Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
        }
    }),
    limits: { fileSize: 2000 * 1024 * 1024 } // 2GB limit to prevent massive files from failing
});

const R2_CONFIG = {
    bucket: process.env.R2_BUCKET,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT,
    publicUrl: process.env.R2_PUBLIC_URL
};

const hasR2Config = () => Object.values(R2_CONFIG).every(Boolean);

const getR2Client = () => new S3Client({
    region: 'auto',
    endpoint: R2_CONFIG.endpoint,
    forcePathStyle: true,
    credentials: {
        accessKeyId: R2_CONFIG.accessKeyId,
        secretAccessKey: R2_CONFIG.secretAccessKey
    }
});

const safeCloudName = (name) => (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');

const videoMimeByExt = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime'
};

const receiptStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, RECEIPTS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/\s/g, '_'))
});
const uploadReceipt = multer({ storage: receiptStorage });

// ======= AUTH Endpoints =======
app.post('/api/auth/register', registerLimiter, async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بەتاڵە' });
    if (String(password).length < 6) return res.status(400).json({ error: 'وشەی نهێنی دەبێت لانیکەم 6 پیت بێت' });

    const users = readUsers();
    if (users.find((u) => u.username === username)) return res.status(400).json({ error: 'ئەم ناوە گیراوە' });

    const firstUserIsAdmin = users.length === 0;
    const sysSettings = readSystemSettings();
    const initialCredits = Number(sysSettings.initialRegistrationCredits !== undefined ? sysSettings.initialRegistrationCredits : 75);
    const newUser = {
        id: uuidv4(),
        username,
        email: email ? String(email).trim() : '',
        encryptedPassword: encryptPassword(password),
        passwordHash: await bcrypt.hash(password, 10),
        role: firstUserIsAdmin ? 'admin' : 'user',
        points: 0,
        credits: initialCredits,
        history: {},
        flashcards: []
    };
    issueToken(newUser);
    users.push(newUser);
    writeUsers(users);

    logAdminActivity('user_register', newUser, { title: `تۆماربوونی هەژماری نوێ: ${newUser.username} (+${initialCredits} کرێدیت)` }, { username: newUser.username, role: newUser.role, credits: initialCredits }, req);

    res.json({ token: newUser.token, user: sanitizeUser(newUser) });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'ناو و وشەی نهێنی پێویستە' });
        }

        const normIdentifier = normalizeTarget(username);
        const users = readUsers();
        const user = users.find((u) => 
            u.username.toLowerCase() === normIdentifier ||
            (u.email && normalizeTarget(u.email) === normIdentifier) ||
            (u.phone && normalizeTarget(u.phone) === normIdentifier)
        );

        if (!user) {
            logAdminActivity('login_failed', { username: username || 'guest', role: 'guest' }, { title: 'هەوڵی چوونەژوورەوەی شکستخواردوو' }, { attemptedUsername: username, reason: 'ناوی بەکارهێنەر/ئیمەیل بوونی نییە' }, req);
            return res.status(401).json({ error: 'ناو یان وشەی نهێنی هەڵەیە' });
        }

        const passStr = String(password);
        let isValid = false;

        if (user.passwordHash) {
            isValid = await bcrypt.compare(passStr, user.passwordHash);
        } else if (user.password) {
            // Legacy plaintext migration path
            isValid = user.password === passStr;
            if (isValid) {
                user.passwordHash = await bcrypt.hash(passStr, 10);
                delete user.password;
            }
        }

        if (!isValid) {
            logAdminActivity('login_failed', { username: user.username, role: user.role }, { title: 'هەوڵی چوونەژوورەوەی شکستخواردوو' }, { attemptedUsername: username, reason: 'وشەی نهێنی هەڵەیە' }, req);
            return res.status(401).json({ error: 'ناو یان وشەی نهێنی هەڵەیە' });
        }

        // Save AES-256 encrypted password so Super Admin can decrypt it
        user.encryptedPassword = encryptPassword(passStr);

        if (user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()) {
            logAdminActivity('login_blocked', user, { title: 'هەوڵی چوونەژوورەوەی هەژماری ڕاگیراو' }, { reason: user.suspensionReason }, req);
            return res.status(403).json({ error: `ئەکاونتەکەت ڕاگیراوە بەهۆی: ${user.suspensionReason || 'سەرپێچی'} تا کاتی: ${new Date(user.suspendedUntil).toLocaleString()}` });
        }

        issueToken(user);
        writeUsers(users);

        logAdminActivity('login_success', user, { title: `چوونەژوورەوەی سەرکەوتوو: ${user.username}` }, { username: user.username, role: user.role }, req);

        res.json({ token: user.token, user: sanitizeUser(user) });
    } catch (err) {
        console.error('Login error:', err);
        logAdminActivity('server_error', { username: 'سێرڤەر', role: 'system' }, { title: 'هەڵە لە چوونەژوورەوە' }, { error: err.message }, req);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا لە سێرڤەر: ' + err.message });
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
});

// Google OAuth Login & Auto-Register Endpoint
app.post('/api/auth/google', async (req, res) => {
    try {
        const { credential, email: directEmail, name: directName, picture: directPicture, googleId: directGoogleId } = req.body;
        
        let email = directEmail;
        let name = directName || 'Google User';
        let picture = directPicture || '';
        let googleId = directGoogleId || '';

        // If Google Credential (JWT token) was passed from Google Identity Services
        if (credential && typeof credential === 'string') {
            try {
                const parts = credential.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                    if (payload.email) email = payload.email;
                    if (payload.name) name = payload.name;
                    if (payload.picture) picture = payload.picture;
                    if (payload.sub) googleId = payload.sub;
                }
            } catch (jwtErr) {
                console.error('[Google Auth JWT Decode Error]', jwtErr);
            }
        }

        if (!email) {
            return res.status(400).json({ error: 'ئیمەیلی گووگڵ نەدۆزرایەوە.' });
        }

        const normEmail = normalizeTarget(email);
        const users = readUsers();
        let user = users.find(u => 
            (u.googleId && u.googleId === googleId) || 
            (u.email && normalizeTarget(u.email) === normEmail)
        );

        if (user) {
            // Existing user -> Link Google ID & Avatar if not present
            if (!user.googleId && googleId) user.googleId = googleId;
            if (!user.avatar && picture) user.avatar = picture;
            if (user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()) {
                return res.status(403).json({ error: `ئەکاونتەکەت ڕاگیراوە بەهۆی: ${user.suspensionReason || 'سەرپێچی'}` });
            }
            issueToken(user);
            writeUsers(users);
            logAdminActivity('login_google', user, { title: `چوونەژوورەوە لەڕێگەی گووگڵ: ${user.username}` }, { email: normEmail, username: user.username }, req);
            return res.json({ success: true, token: user.token, user: sanitizeUser(user) });
        }

        // New User -> Create account automatically!
        const baseUsername = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 15) || normEmail.split('@')[0].slice(0, 15);
        let finalUsername = baseUsername;
        let counter = 1;
        while (users.some(u => u.username.toLowerCase() === finalUsername.toLowerCase())) {
            finalUsername = `${baseUsername}${counter++}`;
        }

        const firstUserIsAdmin = users.length === 0;
        const sysSettings = readSystemSettings();
        const initialCredits = Number(sysSettings.initialRegistrationCredits !== undefined ? sysSettings.initialRegistrationCredits : 75);
        const newUser = {
            id: uuidv4(),
            username: finalUsername,
            email: normEmail,
            googleId: googleId || uuidv4(),
            avatar: picture || '',
            role: firstUserIsAdmin ? 'admin' : 'user',
            points: 0,
            credits: initialCredits,
            history: {},
            flashcards: []
        };

        issueToken(newUser);
        users.push(newUser);
        writeUsers(users);

        logAdminActivity('user_register_google', newUser, { title: `تۆماربوونی هەژماری نوێ لەڕێگەی گووگڵ: ${newUser.username} (+${initialCredits} کرێدیت)` }, { email: normEmail, username: newUser.username, credits: initialCredits }, req);

        res.json({ success: true, token: newUser.token, user: sanitizeUser(newUser) });
    } catch (err) {
        console.error('Google Auth Error:', err);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا لە چوونەژوورەوەی گووگڵ: ' + err.message });
    }
});

// ======= OTP & SECURE VERIFICATION SYSTEM =======
const nodemailer = require('nodemailer');

const otpStore = new Map(); // key: normTarget, value: { code, purpose, expiresAt, attempts, lastSentAt }
const resetTokenStore = new Map(); // key: resetToken, value: { target, expiresAt }
const pendingRegistrations = new Map(); // key: normEmail, value: { username, email, phone, password, code, expiresAt, attempts, lastSentAt }

// Auto cleanup expired OTPs & registrations every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of otpStore.entries()) {
        if (now > v.expiresAt) otpStore.delete(k);
    }
    for (const [k, v] of resetTokenStore.entries()) {
        if (now > v.expiresAt) resetTokenStore.delete(k);
    }
    for (const [k, v] of pendingRegistrations.entries()) {
        if (now > v.expiresAt) pendingRegistrations.delete(k);
    }
}, 2 * 60 * 1000);

// Auto cleanup expired OTPs & reset tokens every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of otpStore.entries()) {
        if (now > v.expiresAt) otpStore.delete(k);
    }
    for (const [k, v] of resetTokenStore.entries()) {
        if (now > v.expiresAt) resetTokenStore.delete(k);
    }
}, 2 * 60 * 1000);

const sendOtpTelegram = async (target, code, purpose) => {
    const token = process.env.TELEGRAM_BOT_TOKEN || '8888836091:AAG3EqdiVnuMApik7QEo8WJl6TeavBFcprY';
    const chatId = process.env.TELEGRAM_CHAT_ID || '1838030544';
    if (!token || !chatId) return false;

    try {
        const text = `🔐 *کۆدی پشتڕاستکردنەوەی kstfilm*\n\n🎯 بۆ: \`${target}\`\n🔢 کۆد: \`${code}\`\n📌 مەبەست: ${purpose === 'reset' ? 'گۆڕینی وشەی نهێنی' : 'تۆماربوون'}\n⏳ ماوەی کارکردن: ٥ خولەک`;
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
        }, { timeout: 4000 });
        return true;
    } catch (err) {
        console.error('[Telegram OTP Error]', err.message);
        return false;
    }
};

const sendOtpEmail = async (email, code, purpose) => {
    const subject = purpose === 'reset' 
        ? 'کۆدی گۆڕینی وشەی نهێنی - kstfilm' 
        : 'کۆدی پشتڕاستکردنەوە - kstfilm';

    const html = `
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background: #0b0b14; color: #ffffff; padding: 32px; border-radius: 16px; max-width: 480px; margin: auto; border: 1px solid #2e2e48; text-align: center;">
        <h2 style="color: #a855f7; margin-bottom: 20px; font-size: 26px; font-weight: bold; letter-spacing: 1px;">kstfilm 🎬</h2>
        <p style="font-size: 16px; color: #cbd5e1; margin-bottom: 12px;">سڵاو،</p>
        <p style="font-size: 15px; color: #94a3b8; margin-bottom: 24px;">کۆدی تایبەتی پشتڕاستکردنەوەی تۆ:</p>
        <div style="margin: 25px 0;">
            <span style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); border: 2px dashed #38bdf8; padding: 14px 28px; border-radius: 14px;">${code}</span>
        </div>
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">ئەم کۆدە بۆ ماوەی ٥ خولەک کار دەکات. تکایە ئەم کۆدە بە کەسی تر مەدە.</p>
    </div>
    `;

    // 1. Resend API (Pure HTTPS - Works 100% on all VPS without SMTP blocks)
    if (process.env.RESEND_API_KEY) {
        try {
            await axios.post('https://api.resend.com/emails', {
                from: process.env.RESEND_FROM || 'kstfilm <noreply@kstfilm.com>',
                to: [email],
                subject,
                html
            }, {
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });
            console.log(`[Resend Email] Successfully sent OTP to ${email}`);
            return true;
        } catch (resendErr) {
            console.error('[Resend Error]', resendErr.response?.data || resendErr.message);
        }
    }

    // 2. Brevo API (Pure HTTPS)
    if (process.env.BREVO_API_KEY) {
        try {
            await axios.post('https://api.brevo.com/v3/smtp/email', {
                sender: { name: 'kstfilm', email: process.env.SMTP_USER || 'floellabrion@gmail.com' },
                to: [{ email }],
                subject,
                htmlContent: html
            }, {
                headers: {
                    'api-key': process.env.BREVO_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });
            console.log(`[Brevo Email] Successfully sent OTP to ${email}`);
            return true;
        } catch (brevoErr) {
            console.error('[Brevo Error]', brevoErr.response?.data || brevoErr.message);
        }
    }

    // 3. SMTP (Nodemailer fallback)
    const user = process.env.SMTP_USER;
    const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
    const host = process.env.SMTP_HOST;

    if (user && pass) {
        try {
            const transportOptions = (host === 'smtp.gmail.com' || (!host && user.includes('@gmail.com')))
                ? {
                    service: 'gmail',
                    auth: { user, pass },
                    connectionTimeout: 4000,
                    greetingTimeout: 4000,
                    socketTimeout: 5000,
                    tls: { rejectUnauthorized: false }
                }
                : {
                    host: host || 'smtp.gmail.com',
                    port: parseInt(process.env.SMTP_PORT || '587'),
                    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
                    auth: { user, pass },
                    connectionTimeout: 4000,
                    greetingTimeout: 4000,
                    socketTimeout: 5000,
                    tls: { rejectUnauthorized: false }
                };

            const transporter = nodemailer.createTransport(transportOptions);

            await transporter.sendMail({
                from: process.env.SMTP_FROM || `"kstfilm" <${user}>`,
                to: email,
                subject,
                html
            });
            console.log(`[SMTP Email] Successfully sent OTP to ${email}`);
            return true;
        } catch (mailErr) {
            console.error('[SMTP Mail Error]', mailErr.message || mailErr);
            return false;
        }
    }
    return false;
};

const sendOtpSms = async (phone, code) => {
    if (process.env.SMS_GATEWAY_URL) {
        try {
            await axios.post(process.env.SMS_GATEWAY_URL, {
                phone,
                message: `کۆدی کوردیش ستریم: ${code} (ماوە: ٥ خولەک)`
            }, {
                headers: { Authorization: `Bearer ${process.env.SMS_API_KEY || ''}` },
                timeout: 5000
            });
            return true;
        } catch (smsErr) {
            console.error('[SMS Gateway Error]', smsErr.message || smsErr);
            return false;
        }
    }
    return false;
};

// 1. Send OTP Endpoint
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        const { target, purpose = 'otp_auth' } = req.body;
        if (!target || typeof target !== 'string' || !target.trim()) {
            return res.status(400).json({ error: 'تکایە ئیمەیل یان ژمارەی مۆبایل بنووسە.' });
        }

        const normTarget = normalizeTarget(target);
        const isEmail = normTarget.includes('@');
        const isPhone = /^(\+|00)?[0-9]{8,15}$/.test(normTarget);

        if (!isEmail && !isPhone) {
            return res.status(400).json({ error: 'شێوازی ئیمەیل یان ژمارەی مۆبایل هەڵەیە.' });
        }

        // Anti-spam Cooldown: 50 seconds per target
        const existing = otpStore.get(normTarget);
        if (existing && Date.now() - existing.lastSentAt < 50 * 1000) {
            const waitSec = Math.ceil((50 * 1000 - (Date.now() - existing.lastSentAt)) / 1000);
            return res.status(429).json({ error: `تکایە ${waitSec} چرکەی تر چاوەڕێ بکە پێش داواکردنەوەی کۆد.` });
        }

        // If purpose is password reset, check if user exists
        const users = readUsers();
        if (purpose === 'reset') {
            const userExists = users.some(u => 
                (u.email && normalizeTarget(u.email) === normTarget) || 
                (u.phone && normalizeTarget(u.phone) === normTarget) ||
                (u.username && normalizeTarget(u.username) === normTarget)
            );
            if (!userExists) {
                return res.status(404).json({ error: 'هیچ هەژمارێک بەم ئیمەیل یان مۆبایلە نەدۆزرایەوە.' });
            }
        }

        // Generate 6-digit cryptographic OTP
        const code = crypto.randomInt(100000, 999999).toString();
        otpStore.set(normTarget, {
            code,
            purpose,
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            attempts: 0,
            lastSentAt: Date.now()
        });

        console.log(`\x1b[36m[OTP GENERATED]\x1b[0m Target: ${normTarget} | Code: \x1b[32m${code}\x1b[0m | Purpose: ${purpose}`);

        // Dispatch notifications concurrently without blocking UI
        const dispatches = [sendOtpTelegram(normTarget, code, purpose)];
        if (isEmail) dispatches.push(sendOtpEmail(normTarget, code, purpose));
        if (isPhone) dispatches.push(sendOtpSms(normTarget, code));
        
        Promise.allSettled(dispatches).catch(() => {});

        res.json({
            success: true,
            message: 'کۆدی پشتڕاستکردنەوە بە سەرکەوتوویی نێردرا.',
            target: normTarget
        });
    } catch (err) {
        console.error('Send OTP Error:', err);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا لە ناردنی کۆد: ' + err.message });
    }
});

// 2. Verify OTP Endpoint
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { target, code, purpose = 'otp_auth' } = req.body;
        if (!target || !code) {
            return res.status(400).json({ error: 'ئیمەیل/مۆبایل و کۆدی پشتڕاستکردنەوە پێویستە.' });
        }

        const normTarget = normalizeTarget(target);
        const record = otpStore.get(normTarget);

        if (!record) {
            return res.status(400).json({ error: 'هیچ کۆدێک بۆ ئەم هەژمارە داوا نەکراوە یان بەسەرچووە.' });
        }

        if (Date.now() > record.expiresAt) {
            otpStore.delete(normTarget);
            return res.status(400).json({ error: 'کاتی کۆدەکە بەسەرچووە. تکایە دووبارە داوای کۆد بکەوە.' });
        }

        // Brute-force protection: Max 5 failed attempts
        if (record.attempts >= 5) {
            otpStore.delete(normTarget);
            return res.status(429).json({ error: 'ژمارەی هەوڵە هەڵەکان زۆر بوو. تکایە دووبارە داوای کۆد بکەوە.' });
        }

        const inputCode = String(code).trim();
        if (record.code !== inputCode) {
            record.attempts += 1;
            return res.status(400).json({ error: `کۆدەکە هەڵەیە. ${5 - record.attempts} هەوڵت ماوە.` });
        }

        // OTP Verified successfully! Clear OTP
        otpStore.delete(normTarget);

        if (purpose === 'reset') {
            // Issue single-use reset token valid for 10 minutes
            const resetToken = crypto.randomBytes(32).toString('hex');
            resetTokenStore.set(resetToken, { target: normTarget, expiresAt: Date.now() + 10 * 60 * 1000 });
            return res.json({ success: true, resetToken, message: 'کۆدەکە پشتڕاستکرایەوە.' });
        }

        // Direct Login or Auto-Register via OTP
        const users = readUsers();
        let user = users.find(u => 
            (u.email && normalizeTarget(u.email) === normTarget) ||
            (u.phone && normalizeTarget(u.phone) === normTarget) ||
            (u.username && normalizeTarget(u.username) === normTarget)
        );

        if (!user) {
            // Auto register new user
            const baseUsername = normTarget.includes('@') ? normTarget.split('@')[0] : `user_${normTarget.slice(-4)}`;
            let uniqueUsername = baseUsername.replace(/[^a-zA-Z0-9_]/g, '');
            if (!uniqueUsername) uniqueUsername = `user_${Date.now().toString().slice(-4)}`;
            let suffix = 1;
            while (users.some(u => u.username === uniqueUsername)) {
                uniqueUsername = `${baseUsername}${suffix++}`;
            }

            const isEmail = normTarget.includes('@');
            const firstUserIsAdmin = users.length === 0;
            const tempPass = crypto.randomBytes(8).toString('hex');
            const sysSettings = readSystemSettings();
            const initialCredits = Number(sysSettings.initialRegistrationCredits !== undefined ? sysSettings.initialRegistrationCredits : 75);
            
            user = {
                id: uuidv4(),
                username: uniqueUsername,
                email: isEmail ? normTarget : '',
                phone: !isEmail ? normTarget : '',
                encryptedPassword: encryptPassword(tempPass),
                passwordHash: await bcrypt.hash(tempPass, 10),
                role: firstUserIsAdmin ? 'admin' : 'user',
                points: 0,
                credits: initialCredits,
                history: {},
                flashcards: []
            };
            users.push(user);
        }

        issueToken(user);
        writeUsers(users);

        logAdminActivity('otp_login', user, { title: `چوونەژوورەوە بە کۆدی OTP: ${user.username}` }, { target: normTarget }, req);

        res.json({ success: true, token: user.token, user: sanitizeUser(user) });
    } catch (err) {
        console.error('Verify OTP Error:', err);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا لە پشکنینی کۆد: ' + err.message });
    }
});

// 3. Reset Password with Verified Token Endpoint
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        if (!resetToken || !newPassword) {
            return res.status(400).json({ error: 'تۆکن و وشەی نهێنی نوێ پێویستە.' });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ error: 'وشەی نهێنی دەبێت لانیکەم ٦ پیت بێت.' });
        }

        const record = resetTokenStore.get(resetToken);
        if (!record || Date.now() > record.expiresAt) {
            resetTokenStore.delete(resetToken);
            return res.status(400).json({ error: 'تۆکنی گۆڕینی وشەی نهێنی بەسەرچووە یان نادروستە.' });
        }

        const users = readUsers();
        const user = users.find(u => 
            (u.email && normalizeTarget(u.email) === record.target) ||
            (u.phone && normalizeTarget(u.phone) === record.target) ||
            (u.username && normalizeTarget(u.username) === record.target)
        );

        if (!user) {
            return res.status(404).json({ error: 'بەکارهێنەر نەدۆزرایەوە.' });
        }

        const passStr = String(newPassword);
        user.passwordHash = await bcrypt.hash(passStr, 10);
        user.encryptedPassword = encryptPassword(passStr);
        delete user.password; // clean legacy plaintext

        // Clear used reset token
        resetTokenStore.delete(resetToken);

        issueToken(user);
        writeUsers(users);

        logAdminActivity('password_reset', user, { title: `گۆڕینی وشەی نهێنی لەڕێگەی OTP: ${user.username}` }, { username: user.username }, req);

        res.json({
            success: true,
            token: user.token,
            user: sanitizeUser(user),
            message: 'وشەی نهێنی بە سەرکەوتوویی نوێکرایەوە.'
        });
    } catch (err) {
        console.error('Reset Password Error:', err);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا لە نوێکردنەوەی وشەی نهێنی: ' + err.message });
    }
});

// 4. Request Registration OTP
app.post('/api/auth/register-otp-request', registerLimiter, async (req, res) => {
    try {
        const { username, email, phone, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'تکایە هەموو خانە سەرەکییەکان (ناو، ئیمەیل، وشەی نهێنی) پڕ بکەوە.' });
        }

        const cleanUsername = String(username).trim();
        const normEmail = normalizeTarget(email);
        const normPhone = phone ? normalizeTarget(phone) : '';
        const passStr = String(password);

        if (cleanUsername.length < 3) {
            return res.status(400).json({ error: 'ناوی بەکارهێنەر دەبێت لانیکەم ٣ پیت بێت.' });
        }
        if (!normEmail.includes('@') || !normEmail.includes('.')) {
            return res.status(400).json({ error: 'شێوازی ئیمەیل نادروستە.' });
        }
        if (passStr.length < 6) {
            return res.status(400).json({ error: 'وشەی نهێنی دەبێت لانیکەم ٦ پیت بێت.' });
        }

        const users = readUsers();
        if (users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
            return res.status(400).json({ error: 'ئەم ناوی بەکارهێنەرە پێشتر گیراوە.' });
        }
        if (users.some(u => u.email && normalizeTarget(u.email) === normEmail)) {
            return res.status(400).json({ error: 'ئەم ئیمەیلە پێشتر تۆمار کراوە. تکایە بچۆ ژوورەوە.' });
        }
        if (normPhone && users.some(u => u.phone && normalizeTarget(u.phone) === normPhone)) {
            return res.status(400).json({ error: 'ئەم ژمارەی مۆبایلە پێشتر تۆمار کراوە.' });
        }

        // Generate 6-digit cryptographic OTP code
        const code = crypto.randomInt(100000, 999999).toString();
        pendingRegistrations.set(normEmail, {
            username: cleanUsername,
            email: normEmail,
            phone: normPhone,
            password: passStr,
            code,
            expiresAt: Date.now() + 5 * 60 * 1000,
            attempts: 0,
            lastSentAt: Date.now()
        });

        console.log(`\x1b[36m[REGISTER OTP]\x1b[0m Email: ${normEmail} | Code: \x1b[32m${code}\x1b[0m`);

        // Send Email OTP
        await sendOtpEmail(normEmail, code, 'register');
        if (normPhone) {
            await sendOtpSms(normPhone, code);
        }

        res.json({
            success: true,
            message: 'کۆدی پشتڕاستکردنەوە بۆ ئیمەیلەکەت نێردرا.',
            email: normEmail
        });
    } catch (err) {
        console.error('Register OTP Request Error:', err);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا: ' + err.message });
    }
});

// 5. Verify Register OTP & Create User
app.post('/api/auth/register-otp-verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ error: 'ئیمەیل و کۆدی پشتڕاستکردنەوە پێویستە.' });
        }

        const normEmail = normalizeTarget(email);
        const record = pendingRegistrations.get(normEmail);

        if (!record) {
            return res.status(400).json({ error: 'هیچ داواکارییەکی تۆمارکردن بۆ ئەم ئیمەیلە نەدۆزرایەوە یان بەسەرچووە.' });
        }

        if (Date.now() > record.expiresAt) {
            pendingRegistrations.delete(normEmail);
            return res.status(400).json({ error: 'کاتی کۆدەکە بەسەرچووە. تکایە دووبارە فۆڕمەکە پڕبکەوە.' });
        }

        if (record.attempts >= 5) {
            pendingRegistrations.delete(normEmail);
            return res.status(429).json({ error: 'ژمارەی هەوڵە هەڵەکان زۆر بوو. تکایە دووبارە داوای کۆد بکەوە.' });
        }

        if (record.code !== String(code).trim()) {
            record.attempts += 1;
            return res.status(400).json({ error: `کۆدەکە هەڵەیە. ${5 - record.attempts} هەوڵت ماوە.` });
        }

        // Successfully verified -> Create user in DB!
        pendingRegistrations.delete(normEmail);
        const users = readUsers();
        const firstUserIsAdmin = users.length === 0;
        const sysSettings = readSystemSettings();
        const initialCredits = Number(sysSettings.initialRegistrationCredits !== undefined ? sysSettings.initialRegistrationCredits : 75);

        const newUser = {
            id: uuidv4(),
            username: record.username,
            email: record.email,
            phone: record.phone || '',
            encryptedPassword: encryptPassword(record.password),
            passwordHash: await bcrypt.hash(record.password, 10),
            role: firstUserIsAdmin ? 'admin' : 'user',
            points: 0,
            credits: initialCredits,
            history: {},
            flashcards: []
        };

        issueToken(newUser);
        users.push(newUser);
        writeUsers(users);

        logAdminActivity('user_register', newUser, { title: `تۆماربوونی هەژماری نوێ: ${newUser.username} (+${initialCredits} کرێدیت)` }, { username: newUser.username, role: newUser.role, email: newUser.email, credits: initialCredits }, req);

        res.json({ success: true, token: newUser.token, user: sanitizeUser(newUser) });
    } catch (err) {
        console.error('Register OTP Verify Error:', err);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا لە دروستکردنی هەژمار: ' + err.message });
    }
});

app.post('/api/user/notifications/read', requireAuth, (req, res) => {
    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].notifications) {
        users[idx].notifications.forEach(n => n.read = true);
        writeUsers(users);
    }
    
    res.json({ success: true, notifications: users[idx].notifications || [] });
});

app.post('/api/user/notifications/:id/read', requireAuth, (req, res) => {
    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].notifications) {
        const notif = users[idx].notifications.find(n => n.id === req.params.id);
        if (notif) notif.read = true;
        writeUsers(users);
    }
    
    res.json({ success: true, notifications: users[idx].notifications || [] });
});

app.post('/api/user/sync', requireAuth, (req, res) => {
    try {
        const users = readUsers();
        const idx = users.findIndex((u) => u.id === req.user.id);
        if (idx === -1) return res.status(404).json({ error: 'User not found' });

        const { points, history, flashcards, watchMinutes, sentencesSeen, dailyGoal, level, assessmentResult, dualSubWatchSeconds } = req.body;
        if (points !== undefined) users[idx].points = (users[idx].points || 0) + Number(points || 0);
        if (history && typeof history === 'object') users[idx].history = { ...users[idx].history, ...history };
        if (Array.isArray(flashcards)) users[idx].flashcards = flashcards;
        if (dailyGoal !== undefined) users[idx].dailyGoal = Number(dailyGoal);
        if (level !== undefined) users[idx].level = String(level);
        if (assessmentResult !== undefined) users[idx].assessmentResult = assessmentResult;
        if (dualSubWatchSeconds !== undefined) {
            users[idx].dualSubWatchSeconds = Number(dualSubWatchSeconds);
            if (!users[idx].dualSubCycleStartTime && Number(dualSubWatchSeconds) > 0) {
                users[idx].dualSubCycleStartTime = Date.now();
            }
        }
        if (req.body.dualSubCycleStartTime !== undefined) {
            users[idx].dualSubCycleStartTime = req.body.dualSubCycleStartTime ? Number(req.body.dualSubCycleStartTime) : null;
        }

        const today = new Date().toISOString().split('T')[0];
        if (!users[idx].dailyStats) users[idx].dailyStats = {};
        if (!users[idx].dailyStats[today]) {
            users[idx].dailyStats[today] = { watchMinutes: 0, sentencesSeen: 0 };
        }
        
        if (watchMinutes) {
            users[idx].dailyStats[today].watchMinutes += Number(watchMinutes);
        }
        if (sentencesSeen) {
            users[idx].dailyStats[today].sentencesSeen += Number(sentencesSeen);
        }

        writeUsers(users);
        res.json({ success: true, points: users[idx].points, user: sanitizeUser(users[idx]) });
    } catch (error) {
        throw error;
    }
});

app.post('/api/user/level', requireAuth, (req, res) => {
    try {
        const { level, assessmentResult } = req.body;
        if (!level) return res.status(400).json({ error: 'Level is required' });

        const users = readUsers();
        const idx = users.findIndex((u) => u.id === req.user.id);
        if (idx === -1) return res.status(404).json({ error: 'User not found' });

        users[idx].level = String(level);
        if (assessmentResult) {
            users[idx].assessmentResult = assessmentResult;
        }

        writeUsers(users);
        res.json({ success: true, level: users[idx].level, user: sanitizeUser(users[idx]) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user level' });
    }
});

app.post('/api/user/toggle-list', requireAuth, (req, res) => {
    const { listName, movieId } = req.body;
    if (!['favorites', 'watchLater', 'watched'].includes(listName) || !movieId) {
        return res.status(400).json({ error: 'Invalid list name or movie ID' });
    }

    const users = readUsers();
    const idx = users.findIndex((u) => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const user = users[idx];
    const list = user[listName] || [];
    
    if (list.includes(movieId)) {
        user[listName] = list.filter(id => id !== movieId);
    } else {
        user[listName] = [...list, movieId];
    }

    writeUsers(users);
    res.json({ success: true, list: user[listName], user: sanitizeUser(user) });
});

const AVATARS_DIR = path.join(__dirname, 'uploads', 'avatars');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
app.use('/uploads/avatars', express.static(AVATARS_DIR));

const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATARS_DIR),
    filename: (req, file, cb) => cb(null, 'avatar_' + req.user.id + '_' + Date.now() + path.extname(file.originalname))
});
const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.post('/api/user/avatar', requireAuth, uploadAvatar.single('avatar'), (req, res) => {
    try {
        const users = readUsers();
        const idx = users.findIndex(u => u.id === req.user.id);
        if (idx === -1) return res.status(404).json({ error: 'بەکارهێنەر نەدۆزرایەوە' });

        let avatarUrl = '';
        if (req.file) {
            avatarUrl = `/uploads/avatars/${req.file.filename}`;
        } else if (req.body.avatarUrl !== undefined) {
            avatarUrl = req.body.avatarUrl;
        }

        users[idx].avatar = avatarUrl;
        users[idx].avatarUrl = avatarUrl;
        writeUsers(users);

        res.json({ success: true, user: sanitizeUser(users[idx]), avatarUrl });
    } catch (err) {
        console.error('Upload avatar error:', err);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا لە بارکردنی وێنە' });
    }
});

app.post('/api/user/buy-credits', requireAuth, (req, res) => {
    const { amount, planName } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'بڕی کرێدیت هەڵەیە' });

    const users = readUsers();
    const idx = users.findIndex((u) => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'بەکارهێنەر نەدۆزرایەوە' });

    const creditAmount = parseInt(amount, 10);
    users[idx].credits = (users[idx].credits || 0) + creditAmount;
    users[idx].plan = planName || 'Pro';
    users[idx].isVip = true;
    users[idx].subscriptionExpiresAt = Date.now() + THIRTY_DAYS_MS;
    
    // Add to history or credit usage if needed
    if (!users[idx].creditUsage) users[idx].creditUsage = [];
    users[idx].creditUsage.push({
        id: uuidv4(),
        type: 'purchase',
        amount: creditAmount,
        plan: planName || 'Pro',
        date: Date.now(),
        expiresAt: users[idx].subscriptionExpiresAt
    });

    writeUsers(users);
    res.json({ success: true, credits: users[idx].credits, user: sanitizeUser(users[idx]) });
});

const isDuplicateTransaction = (aiData, existingRequests) => {
    if (!aiData) return false;
    
    // 1. Check Transaction ID across all pending and approved requests
    const txId = aiData.transactionId;
    if (txId && String(txId).trim().length >= 5) {
        const cleanId = String(txId).trim().toLowerCase();
        const found = existingRequests.some(r => {
            if (r.status !== 'approved' && r.status !== 'pending') return false;
            const existingTxId = r.aiData?.transactionId || r.transactionId;
            return existingTxId && String(existingTxId).trim().toLowerCase() === cleanId;
        });
        if (found) return true;
    }

    // 2. Check Composite Fingerprint (provider + amount + isoDateTime / dateStr + timeStr)
    const dt = aiData.isoDateTime || `${aiData.dateStr || ''}_${aiData.timeStr || ''}`;
    const amount = Number(aiData.amount) || 0;
    const provider = String(aiData.provider || '').toLowerCase();

    if (dt && amount > 0 && provider) {
        const found = existingRequests.some(r => {
            if (r.status !== 'approved' && r.status !== 'pending') return false;
            const rAi = r.aiData;
            if (!rAi) return false;
            const rDt = rAi.isoDateTime || `${rAi.dateStr || ''}_${rAi.timeStr || ''}`;
            const rAmount = Number(rAi.amount) || 0;
            const rProvider = String(rAi.provider || '').toLowerCase();
            return rProvider === provider && rAmount === amount && rDt === dt;
        });
        if (found) return true;
    }

    return false;
};

const analyzeReceiptWithAI = async (filePath, mimeType, planContext = null) => {
    try {
        if (!OPENROUTER_API_KEY) return null;
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString('base64');
        const dataUri = `data:${mimeType || 'image/jpeg'};base64,${base64Image}`;
        const now = new Date();
        const todayDate = now.toISOString().split('T')[0];

        let planGuidance = '';
        if (planContext && planContext.expectedAmount > 0) {
            planGuidance = `
IMPORTANT PLAN REQUIREMENT:
The user selected the plan "${planContext.planName}" which requires a payment of ${planContext.expectedAmount.toLocaleString()} ${planContext.currency || 'IQD'}.
When verifying this receipt:
1. Extract the actual transferred amount from the receipt.
2. If the receipt amount is LESS than ${planContext.expectedAmount.toLocaleString()} IQD:
   - Set "isValidSuccessful": false and "isAmountSufficient": false.
   - In "reason", state in Kurdish: "بڕی پارەی وەسڵەکە (${'{detectedAmount}'} دینار) کەمترە لە نرخی پلانی ${planContext.planName} کە (${planContext.expectedAmount.toLocaleString()} دینار)ە."
3. If the receipt amount is equal to or greater than ${planContext.expectedAmount.toLocaleString()}:
   - Set "isAmountSufficient": true and "isValidSuccessful": true.
   - In "reason", state in Kurdish: "وەسڵی پارەدانی دروست بە بڕی دیاریکراو بۆ پلانی ${planContext.planName}."
`;
        }

        const promptText = `You are a strict financial receipt parser and validator for Kurdish Stream platform.
CURRENT SERVER DATE: ${todayDate}
CURRENT TIME: ${now.toLocaleTimeString('en-US', { hour12: true })}

OFFICIAL PLATFORM ACCOUNTS:
1. FastPay: Phone "07507363244" / "+9647507363244", Name: "ماهر بهجت سليمان" (Maher Bahjat Sulaiman)
2. FIB (First Iraqi Bank): Phone "07507178696" / "+9647507178696", IBAN "IQ51FIQB004061801910001", Name: "MOHAMMED BAHJAT SULAIMAN" / "محمد بهجت سليمان" / "ماهر بهجت"
3. Qi Card: Account "2029955040", Name: "MAHER BAHJAT SULAIMAN" / "ماهر بهجت سليمان"

INSTRUCTIONS:
1. Check if this is a genuine money transfer invoice/receipt (FastPay, FIB, Qi Card, ZainCash).
2. Extract exact date and time of transfer (e.g. date: "August 25, 2026" or "25/08/2026" or "Aug 25", time: "11:05:12 PM" or "23:13").
3. Format the extracted date and time as ISO-like format: "YYYY-MM-DDTHH:mm:ss" in "isoDateTime".
4. Extract recipient name, recipient phone number / Qi account number / IBAN.
5. Extract the unique Transaction ID (e.g. "2026082510121420010100166554207787298" or "A1IZXFR780").
6. Extract the transferred amount (clean positive integer in IQD, e.g. 1000).

${planGuidance}

Output strictly valid JSON matching this schema:
{
    "isReceipt": true,
    "isValidSuccessful": true,
    "isAmountSufficient": true,
    "provider": "Qi Card",
    "amount": 1000,
    "currency": "IQD",
    "transactionId": "2026082510121420010100166554207787298",
    "transactionType": "گواستنەوە",
    "recipientName": "MAHER BAHJAT SULAIMAN",
    "recipientPhone": "",
    "recipientAccount": "2029955040",
    "recipientIban": "",
    "sender": "محمد بهجت",
    "dateStr": "25/08/2026",
    "timeStr": "23:13",
    "isoDateTime": "2026-08-25T23:13:00",
    "confidence": "high",
    "reason": "وەسڵی پارەدانی دروستی کی کارد (Qi Card)"
}`;

        const response = await axios.post(OPENROUTER_URL, {
            model: OPENROUTER_MODEL || 'google/gemini-2.5-flash',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: promptText },
                        { type: 'image_url', image_url: { url: dataUri } }
                    ]
                }
            ],
            temperature: 0.1
        }, {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://kurdishstream.com',
                'X-Title': 'Kurdish Stream AI Receipt Verification'
            },
            timeout: 25000
        });

        const raw = response.data?.choices?.[0]?.message?.content || '';
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
    } catch (error) {
        console.error('AI receipt analysis error:', error?.response?.data || error.message);
    }
    return null;
};

app.post('/api/user/request-credits', requireAuth, creditRequestLimiter, uploadReceipt.single('receipt'), async (req, res) => {
    try {
        const { amount, planName, planId } = req.body;
        if (!req.file) return res.status(400).json({ error: 'تکایە وێنەی وەسڵەکە دابنێ' });

        // 1. Fetch current dynamic plan details from plans.json
        const currentPlans = readPlans();
        
        // Filter and sort all active paid plans by numeric price ascending
        const paidPlans = currentPlans
            .filter(p => p.active !== false && (parseInt(String(p.price).replace(/[^\d]/g, ''), 10) || 0) > 0)
            .map(p => ({
                ...p,
                numericPrice: parseInt(String(p.price).replace(/[^\d]/g, ''), 10) || 0
            }))
            .sort((a, b) => a.numericPrice - b.numericPrice);

        const minPaidPlan = paidPlans.length > 0 ? paidPlans[0] : null;
        const minPaidPlanPrice = minPaidPlan ? minPaidPlan.numericPrice : 20000;

        let expectedPrice = 0;
        let grantedCredits = parseInt(amount, 10) || 0;
        let activePlanName = planName || 'Standard';

        const matchedPlan = currentPlans.find(p => 
            (planId && p.id === planId) || 
            (planName && p.name && p.name.toLowerCase() === String(planName).toLowerCase())
        );

        if (matchedPlan) {
            activePlanName = matchedPlan.name;
            grantedCredits = matchedPlan.credits;
            expectedPrice = parseInt(String(matchedPlan.price).replace(/[^\d]/g, ''), 10) || 0;
        }

        const requests = readRequests();
        const receiptFilePath = req.file.path;
        const mimeType = req.file.mimetype;

        // 2. Run AI Vision Analysis on receipt with exact plan context
        let aiData = null;
        try {
            aiData = await analyzeReceiptWithAI(receiptFilePath, mimeType, {
                expectedAmount: expectedPrice,
                planName: activePlanName,
                currency: matchedPlan?.currency || 'IQD'
            });
        } catch (aiErr) {
            console.error('Receipt AI analysis failed:', aiErr);
        }

        // 3. Strict Check: If AI detects this is NOT a payment receipt at all, reject immediately!
        if (aiData && aiData.isReceipt === false) {
            try {
                if (fs.existsSync(receiptFilePath)) fs.unlinkSync(receiptFilePath);
            } catch (e) {}

            return res.status(400).json({
                error: aiData.reason || '⚠️ ئەم وێنەیە وەسڵی حەواڵە یان پارەدان نییە! تکایە وێنەی ڕوونی وەسڵی فاستپەی، FIB، یان زەین کاش دابنێ.',
                notReceipt: true
            });
        }

        // 4. Check for duplicate receipt
        if (isDuplicateTransaction(aiData, requests)) {
            const rejectedRequest = {
                id: uuidv4(),
                userId: req.user.id,
                username: req.user.username,
                amount: grantedCredits,
                planName: activePlanName,
                receiptUrl: `/uploads/receipts/${req.file.filename}`,
                status: 'rejected',
                rejectReason: 'ئەم وەسڵە بەکارهاتووە',
                aiData: aiData,
                createdAt: Date.now(),
                processedAt: Date.now()
            };
            requests.push(rejectedRequest);
            writeRequests(requests);

            return res.status(400).json({ 
                error: 'ئەم وەسڵە بەکارهاتووە',
                duplicate: true
            });
        }

        // 5. Strict Recipient Validation (FastPay, FIB, Qi Card)
        const cleanRecipientPhone = String(aiData?.recipientPhone || aiData?.recipient || '').replace(/[^\d]/g, '');
        const cleanRecipientAccount = String(aiData?.recipientAccount || aiData?.recipientPhone || aiData?.recipient || '').replace(/[^\d]/g, '');
        const cleanRecipientIban = String(aiData?.recipientIban || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const recipientName = String(aiData?.recipientName || aiData?.recipient || '').toLowerCase();
        
        const isFastPayMatch = cleanRecipientPhone.includes('7507363244') || recipientName.includes('ماهر') || recipientName.includes('سليمان');
        const isFibMatch = cleanRecipientPhone.includes('7507178696') || cleanRecipientIban.includes('004061801910001') || recipientName.includes('mohammed') || recipientName.includes('bahjat') || recipientName.includes('محمد') || recipientName.includes('ماهر');
        const isQiCardMatch = cleanRecipientAccount.includes('2029955040') || ((recipientName.includes('maher') || recipientName.includes('ماهر')) && (recipientName.includes('bahjat') || recipientName.includes('بهجت')));
        const isOfficialRecipient = isFastPayMatch || isFibMatch || isQiCardMatch;

        if (aiData) {
            aiData.isOfficialRecipient = isOfficialRecipient;
        }

        // Strict Check: If receipt was sent to someone else (e.g. Kastro Tahir), reject immediately!
        if (aiData && aiData.isReceipt && !isOfficialRecipient) {
            try {
                if (fs.existsSync(receiptFilePath)) fs.unlinkSync(receiptFilePath);
            } catch (e) {}

            const foreignRecipient = aiData.recipientName || aiData.recipientPhone || aiData.recipientIban || 'کەسێکی تر';
            return res.status(400).json({
                error: `⚠️ ئەم وەسڵە بۆ هەژماری فەرمی وێبسایتەکە نەنێردراوە! پارەکە بۆ (${foreignRecipient}) نێردراوە.`,
                invalidRecipient: true
            });
        }

        // 6. Strict 5-Minute Time Window Check
        let isTimeWindowValid = true;
        let timePendingReason = '';
        
        if (aiData?.isoDateTime || (aiData?.dateStr && aiData?.timeStr)) {
            try {
                let rawDateStr = aiData.isoDateTime || `${aiData.dateStr} ${aiData.timeStr}`;
                // Support DD/MM/YYYY HH:mm format (e.g. 25/08/2026 23:13)
                const dmyMatch = String(rawDateStr).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2}:\d{1,2}(?::\d{1,2})?)/);
                if (dmyMatch) {
                    rawDateStr = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}T${dmyMatch[4]}`;
                }
                const receiptTimestamp = new Date(rawDateStr).getTime();
                const nowTimestamp = Date.now();

                if (!isNaN(receiptTimestamp)) {
                    const diffMinutes = (nowTimestamp - receiptTimestamp) / (1000 * 60);

                    // If receipt was transferred more than 5.5 minutes ago -> must go to pending
                    if (diffMinutes > 5.5) {
                        isTimeWindowValid = false;
                        timePendingReason = `کاتی ناردنی وەسڵەکە زیاتر لە ٥ خولەکی بەسەردا تێپەڕیوە (${Math.round(diffMinutes)} خولەک پێشترە)`;
                    } else if (diffMinutes < -5.5) {
                        isTimeWindowValid = false;
                        timePendingReason = 'بەرواری وەسڵەکە نادروستە (لە داهاتوودایە)';
                    }
                }
            } catch (timeErr) {
                console.error('Receipt time validation error:', timeErr);
            }
        }

        // 7. Dynamic Tier & Amount Matching:
        const detectedAmount = Number(aiData?.amount) || 0;
        let isAmountSufficient = false;
        let amountPendingReason = '';

        // Find all paid plans that this transferred amount can cover
        const eligiblePlans = paidPlans.filter(p => detectedAmount >= (p.numericPrice * 0.95));

        if (eligiblePlans.length === 0) {
            // Transferred less than minimum paid plan (e.g. sent 19,000 when min plan is 20,000)
            isAmountSufficient = false;
            amountPendingReason = `بڕی پارەی وەسڵەکە (${detectedAmount.toLocaleString()} دینار) کەمترە لە نرخی کەمترین پلانی بەردەست کە (${minPaidPlanPrice.toLocaleString()} دینار)ە`;
        } else {
            // Find highest eligible tier covered by the payment
            const bestPlan = eligiblePlans[eligiblePlans.length - 1];
            
            // If user requested a plan and the payment covers it, activate that plan, else activate bestPlan
            if (matchedPlan && detectedAmount >= (matchedPlan.numericPrice * 0.95)) {
                activePlanName = matchedPlan.name;
                grantedCredits = matchedPlan.credits;
            } else {
                activePlanName = bestPlan.name;
                grantedCredits = bestPlan.credits;
            }
            isAmountSufficient = true;
        }

        const isValidReceipt = aiData && aiData.isReceipt && aiData.isValidSuccessful && isAmountSufficient;

        // 8. Auto-Approval condition: All 3 requirements MUST be met (Amount >= Tier + Official recipient + Within 5 minutes)
        const canAutoApprove = isValidReceipt && isOfficialRecipient && isTimeWindowValid;

        if (canAutoApprove) {
            // Immediately credit the user
            const users = readUsers();
            const uIdx = users.findIndex(u => u.id === req.user.id);
            if (uIdx !== -1) {
                users[uIdx].credits = (users[uIdx].credits || 0) + grantedCredits;
                users[uIdx].plan = activePlanName;
                users[uIdx].isVip = true;
                users[uIdx].subscriptionExpiresAt = Date.now() + THIRTY_DAYS_MS;
                
                if (!users[uIdx].creditUsage) users[uIdx].creditUsage = [];
                users[uIdx].creditUsage.push({
                    id: uuidv4(),
                    type: 'purchase',
                    amount: grantedCredits,
                    plan: `${activePlanName} (${aiData.provider || 'سیستەم'})`,
                    date: Date.now(),
                    expiresAt: users[uIdx].subscriptionExpiresAt,
                    status: 'approved',
                    verifiedBy: 'SYSTEM_AUTO',
                    transactionId: aiData.transactionId || ''
                });

                if (!users[uIdx].notifications) users[uIdx].notifications = [];
                users[uIdx].notifications.push({
                    id: uuidv4(),
                    title: '🎉 وەسڵەکەت بە سەرکەوتوویی پەسەندکرا',
                    message: `وەسڵی ${aiData.provider || 'بانکی'} بە بڕی ${detectedAmount.toLocaleString()} دینار بۆ پلانی ${activePlanName} بە سەرکەوتوویی لە لایەن سیستەمەوە پشتڕاستکرایەوە و ${grantedCredits} کرێدیت خرایە سەر هەژمارەکەت. ماوەی پلانەکەت ٣٠ ڕۆژە.`,
                    type: 'success',
                    date: Date.now(),
                    read: false
                });

                writeUsers(users);
            }

            const approvedRequest = {
                id: uuidv4(),
                userId: req.user.id,
                username: req.user.username,
                amount: grantedCredits,
                planName: `${activePlanName} (${detectedAmount.toLocaleString()} IQD)`,
                receiptUrl: `/uploads/receipts/${req.file.filename}`,
                status: 'approved',
                autoApproved: true,
                aiData: aiData,
                createdAt: Date.now(),
                processedAt: Date.now()
            };

            requests.push(approvedRequest);
            writeRequests(requests);

            return res.json({
                success: true,
                autoApproved: true,
                grantedCredits: grantedCredits,
                aiData: aiData,
                message: `🎉 وەسڵەکەت بە سەرکەوتوویی پشکنرا و ${grantedCredits} کرێدیت بۆ پلانی ${activePlanName} خرایە سەر هەژمارەکەت!`
            });
        }

        // 9. Fallback: Save as pending for Admin verification
        const users = readUsers();
        const uIdx = users.findIndex(u => u.id === req.user.id);
        const explanation = amountPendingReason || timePendingReason || (!isOfficialRecipient ? 'ژمارەی وەرگر لەگەڵ هەژماری فەرمی ناگونجێت' : (aiData?.reason || 'وێنەکە پێویستی بە چاوپێخشاندنی بەڕێوەبەرە'));

        if (uIdx !== -1) {
            if (!users[uIdx].notifications) users[uIdx].notifications = [];
            users[uIdx].notifications.push({
                id: uuidv4(),
                title: '⏳ وەسڵەکەت لە چاوەڕوانی پێداچوونەوەدایە',
                message: `تێبینی: ${explanation}. داواکارییەکەت نێردراوە بۆ لای بەڕێوەبەر بۆ پشکنین.`,
                type: 'warning',
                date: Date.now(),
                read: false
            });
            writeUsers(users);
        }

        const newRequest = {
            id: uuidv4(),
            userId: req.user.id,
            username: req.user.username,
            amount: grantedCredits,
            planName: activePlanName,
            receiptUrl: `/uploads/receipts/${req.file.filename}`,
            status: 'pending',
            autoApproved: false,
            aiData: aiData ? { ...aiData, pendingReason: explanation } : null,
            createdAt: Date.now()
        };

        requests.push(newRequest);
        writeRequests(requests);

        res.json({ 
            success: true, 
            autoApproved: false,
            aiReason: explanation,
            message: `داواکارییەکەت نێردرا، بەڵام بەهۆی: (${explanation})، پێویستی بە پشکنینی بەڕێوەبەرە و لە چاوەڕوانیدایە.`
        });
    } catch (err) {
        console.error('Request credits error:', err);
        res.status(500).json({ error: 'هەڵەیەکی ناوخۆیی ڕوویدا لە سێرڤەر' });
    }
});

app.get('/api/user/credit-requests', requireAuth, (req, res) => {
    try {
        const allRequests = readRequests();
        const userRequests = allRequests
            .filter(r => r.userId === req.user.id)
            .sort((a, b) => b.createdAt - a.createdAt);
        res.json(userRequests);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get credit requests' });
    }
});

app.get('/api/admin/credit-requests', requireAuth, requireAdmin, (req, res) => {
    res.json(readRequests());
});

app.post('/api/admin/credit-requests/:id/view', requireAuth, requireAdmin, (req, res) => {
    const requests = readRequests();
    const reqIdx = requests.findIndex(r => r.id === req.params.id);
    if (reqIdx !== -1) {
        requests[reqIdx].viewed = true;
        requests[reqIdx].isViewed = true;
        writeRequests(requests);
    }
    res.json({ success: true });
});

app.post('/api/admin/process-credit-request', requireAuth, requireAdmin, (req, res) => {
    const { requestId, action, message, customAmount } = req.body; // action: 'approve' or 'reject'
    const requests = readRequests();
    const reqIdx = requests.findIndex(r => r.id === requestId);
    if (reqIdx === -1) return res.status(404).json({ error: 'داواکاری نەدۆزرایەوە' });

    if (requests[reqIdx].status === 'approved' && action === 'approve') {
        return res.status(400).json({ error: 'ئەم داواکارییە پێشتر پەسەند کراوە و کرێدیتی دراوەتێ' });
    }

    const isRevokingApproved = requests[reqIdx].status === 'approved' && action === 'reject';

    if (action === 'approve') {
        const users = readUsers();
        const userIdx = users.findIndex(u => u.id === requests[reqIdx].userId);
        const amount = customAmount ? parseInt(customAmount, 10) : (requests[reqIdx].amount || 0);

        if (userIdx !== -1 && amount > 0) {
            const planTitle = requests[reqIdx].planName || 'Pro';
            users[userIdx].credits = (users[userIdx].credits || 0) + amount;
            users[userIdx].plan = planTitle;
            users[userIdx].isVip = true;
            users[userIdx].subscriptionExpiresAt = Date.now() + THIRTY_DAYS_MS;
            
            if (!users[userIdx].creditUsage) users[userIdx].creditUsage = [];
            users[userIdx].creditUsage.push({
                id: uuidv4(),
                type: 'purchase',
                amount: amount,
                plan: `${planTitle} (ئەکتیڤکردنی دەستی لەلایەن ئەدمین)`,
                date: Date.now(),
                expiresAt: users[userIdx].subscriptionExpiresAt,
                status: 'approved',
                verifiedBy: req.user.username || 'ADMIN_MANUAL'
            });

            // Add notification
            if (!users[userIdx].notifications) users[userIdx].notifications = [];
            users[userIdx].notifications.push({
                id: uuidv4(),
                title: '🎉 داواکارییەکەت لەلایەن بەڕێوەبەرەوە پەسەند کرا',
                message: `داواکارییەکەت بۆ پلانی ${planTitle} بە دەستی لەلایەن بەڕێوەبەرەوە پێداچوونەوەی بۆ کرا و پەسەند کرا. ${amount} کرێدیت خرایە سەر هەژمارەکەت (ماوەی ٣٠ ڕۆژ)!`,
                type: 'success',
                date: Date.now(),
                read: false
            });

            writeUsers(users);
        }
        requests[reqIdx].status = 'approved';
        requests[reqIdx].amount = amount;
        requests[reqIdx].processedAt = Date.now();
        requests[reqIdx].processedBy = req.user.username || 'admin';
        delete requests[reqIdx].rejectReason;
    } else {
        const users = readUsers();
        const userIdx = users.findIndex(u => u.id === requests[reqIdx].userId);
        const amount = requests[reqIdx].amount || 0;

        if (isRevokingApproved && userIdx !== -1 && amount > 0) {
            // Deduct the credits back from the user
            users[userIdx].credits = Math.max(0, (users[userIdx].credits || 0) - amount);
            
            // Check if user has other valid approved purchases
            const otherActivePurchases = Array.isArray(users[userIdx].creditUsage) 
                ? users[userIdx].creditUsage.filter(p => p.status === 'approved' && p.type === 'purchase' && p.id !== requests[reqIdx].id)
                : [];
            if (otherActivePurchases.length === 0) {
                users[userIdx].isVip = false;
                if (users[userIdx].role !== 'super_admin' && users[userIdx].role !== 'admin') {
                    users[userIdx].plan = null;
                }
            }

            if (!users[userIdx].creditUsage) users[userIdx].creditUsage = [];
            users[userIdx].creditUsage.push({
                id: uuidv4(),
                type: 'revoke',
                amount: -amount,
                plan: `${requests[reqIdx].planName || 'Plan'} (ڕەتکردنەوە و کێشانەوەی کرێدیت لەلایەن سەرۆک)`,
                date: Date.now(),
                status: 'revoked',
                verifiedBy: req.user.username || 'ADMIN'
            });

            if (!users[userIdx].notifications) users[userIdx].notifications = [];
            users[userIdx].notifications.push({
                id: uuidv4(),
                title: '🛑 داواکاری پەسەندکراو ڕەتکرایەوە و کرێدیت وەرگیرایەوە',
                message: message || `داواکارییە پەسەندکراوەکەت بۆ (${amount} کرێدیت) دوای پێداچوونەوە لەلایەن سەرۆکەوە هەڵوەشێندرایەوە و کرێدیتەکە لە هەژمارەکەت کەمکرایەوە.`,
                date: Date.now(),
                read: false,
                type: 'error'
            });

            writeUsers(users);
        } else if (userIdx !== -1) {
            if (!users[userIdx].notifications) users[userIdx].notifications = [];
            users[userIdx].notifications.push({
                id: uuidv4(),
                title: 'داواکاری ڕەتکرایەوە',
                message: `داواکارییەکەت بۆ کڕینی کرێدیت ڕەتکرایەوە: ${message || 'وێنەی وەسڵەکە ڕوون نییە یان پارەکە کەمە'}`,
                date: Date.now(),
                read: false,
                type: 'error'
            });
            writeUsers(users);
        }

        requests[reqIdx].status = 'rejected';
        requests[reqIdx].rejectReason = message || (isRevokingApproved ? 'هەڵوەشێندرایەوە و کرێدیتەکە وەرگیرایەوە لەلایەن بەڕێوەبەرەوە' : 'وێنەی وەسڵەکە ڕوون نییە یان پارەکە کەمە');
        requests[reqIdx].processedAt = Date.now();
        requests[reqIdx].processedBy = req.user.username || 'admin';
    }

    requests[reqIdx].processedAt = Date.now();
    writeRequests(requests);
    res.json({ success: true, isRevoked: isRevokingApproved });
});

// ==========================================
// ====== DUAL SUBTITLE TRIAL QUOTA API =====
// ==========================================

// 1. Public: Get dual subtitle trial quota configuration
app.get('/api/settings/dual-sub-quota', (req, res) => {
    try {
        const settings = readSystemSettings();
        res.json({
            trialMinutes: typeof settings.dualSubTrialMinutes === 'number' ? settings.dualSubTrialMinutes : 60,
            resetHours: typeof settings.dualSubResetHours === 'number' ? settings.dualSubResetHours : 24,
            active: settings.dualSubTrialActive !== false,
            expiredAction: settings.dualSubExpiredAction || 'block_all'
        });
    } catch (e) {
        res.json({ trialMinutes: 60, resetHours: 24, active: true, expiredAction: 'block_all' });
    }
});

// 2. Super Admin: Update dual subtitle trial quota configuration
app.post('/api/admin/settings/dual-sub-quota', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const { trialMinutes, resetHours, active, expiredAction } = req.body;
        const settings = readSystemSettings();
        const oldMinutes = settings.dualSubTrialMinutes;
        
        settings.dualSubTrialMinutes = trialMinutes !== undefined ? Number(trialMinutes) : 60;
        settings.dualSubResetHours = resetHours !== undefined ? Number(resetHours) : 24;
        settings.dualSubTrialActive = active !== undefined ? Boolean(active) : true;
        settings.dualSubExpiredAction = expiredAction || 'block_all';
        settings.updatedAt = Date.now();
        settings.updatedBy = { id: req.user.id, username: req.user.username };
        
        writeSystemSettings(settings);

        logAdminActivity('update_dual_sub_quota', req.user, { id: 'dual_sub_quota', title: 'ڕێکخستنی کاتی تاقیکردنەوەی سەبتایتڵی جووت' }, {
            oldMinutes,
            newMinutes: settings.dualSubTrialMinutes,
            resetHours: settings.dualSubResetHours,
            active: settings.dualSubTrialActive,
            expiredAction: settings.dualSubExpiredAction
        }, req);

        res.json({ success: true, settings });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update quota settings' });
    }
});

// 3. Super Admin & Admin: Get all System Settings
app.get('/api/admin/system-settings', requireAuth, requireAdmin, (req, res) => {
    try {
        const settings = readSystemSettings();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read settings: ' + err.message });
    }
});

// 4. Super Admin: Update Welcome/Registration Credits Setting
app.post('/api/admin/settings/initial-credits', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const { credits } = req.body;
        if (credits === undefined || isNaN(parseInt(credits, 10))) {
            return res.status(400).json({ error: 'بڕی کرێدیت دەبێت ژمارە بێت.' });
        }

        const newCreditAmount = Math.max(0, parseInt(credits, 10));
        const settings = readSystemSettings();
        const oldCredits = settings.initialRegistrationCredits !== undefined ? settings.initialRegistrationCredits : 75;

        settings.initialRegistrationCredits = newCreditAmount;
        settings.updatedAt = Date.now();
        settings.updatedBy = { id: req.user.id, username: req.user.username };

        writeSystemSettings(settings);

        logAdminActivity('update_initial_credits', req.user, { title: `دیاریکردنی بڕی ${newCreditAmount} کرێدیتی دیاری بۆ بەکارهێنەرانی نوێ` }, {
            oldCredits,
            newCredits: newCreditAmount,
            updatedBy: req.user.username
        }, req);

        res.json({
            success: true,
            initialRegistrationCredits: newCreditAmount,
            settings,
            message: `بڕی کرێدیتی دیاری بە سەرکەوتوویی کرا بە ${newCreditAmount} کرێدیت بۆ هەموو بەکارهێنەرێکی نوێ.`
        });
    } catch (err) {
        console.error('Update initial credits error:', err);
        res.status(500).json({ error: 'هەڵەیەک ڕووی دا: ' + err.message });
    }
});

// 5. Super Admin: Generic update of system settings
app.post('/api/admin/system-settings', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const current = readSystemSettings();
        const { initialRegistrationCredits, dualSubTrialMinutes, dualSubResetHours, dualSubTrialActive, dualSubExpiredAction } = req.body;

        const updated = {
            ...current,
            initialRegistrationCredits: initialRegistrationCredits !== undefined ? Math.max(0, parseInt(initialRegistrationCredits, 10) || 0) : (current.initialRegistrationCredits ?? 75),
            dualSubTrialMinutes: dualSubTrialMinutes !== undefined ? parseInt(dualSubTrialMinutes, 10) : current.dualSubTrialMinutes,
            dualSubResetHours: dualSubResetHours !== undefined ? parseInt(dualSubResetHours, 10) : current.dualSubResetHours,
            dualSubTrialActive: dualSubTrialActive !== undefined ? Boolean(dualSubTrialActive) : current.dualSubTrialActive,
            dualSubExpiredAction: dualSubExpiredAction !== undefined ? dualSubExpiredAction : current.dualSubExpiredAction,
            updatedAt: Date.now(),
            updatedBy: { id: req.user.id, username: req.user.username }
        };

        writeSystemSettings(updated);
        logAdminActivity('settings_update', req.user, { title: `نوێکردنەوەی ڕێکخستنەکانی سیستەم` }, { newSettings: updated }, req);

        res.json({ success: true, settings: updated, message: 'ڕێکخستنەکان بە سەرکەوتوویی پاشەکەوت کران.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings: ' + err.message });
    }
});

// ==========================================
// ====== CREDIT PLANS MANAGEMENT API =======
// ==========================================

// 1. Public: Get all active plans for /buy-credits page
app.get('/api/plans', (req, res) => {
    try {
        const plans = readPlans();
        const activePlans = plans
            .filter(p => p.active !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        res.json(activePlans);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read plans' });
    }
});

// 2. Admin: Get all plans (including inactive ones)
app.get('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
    try {
        const plans = readPlans();
        const sortedPlans = plans.sort((a, b) => (a.order || 0) - (b.order || 0));
        res.json(sortedPlans);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read plans' });
    }
});

// 3. Super Admin: Create a new credit plan
app.post('/api/admin/plans', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const {
            name,
            credits,
            price,
            originalPrice,
            discountPercent,
            currency,
            color,
            badge,
            descriptionEn,
            descriptionKu,
            featuresEn,
            featuresKu,
            featured,
            active
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'ناوی پلان پێویستە' });
        }

        const plans = readPlans();
        const newPlan = {
            id: 'plan_' + Date.now(),
            name: String(name).trim(),
            credits: Number(credits) || 0,
            price: String(price || '0').trim(),
            originalPrice: String(originalPrice || '').trim(),
            discountPercent: String(discountPercent || '').trim(),
            currency: String(currency || 'IQD').trim(),
            color: String(color || '#8b5cf6').trim(),
            badge: String(badge || '').trim(),
            descriptionEn: String(descriptionEn || '').trim(),
            descriptionKu: String(descriptionKu || '').trim(),
            featuresEn: Array.isArray(featuresEn) ? featuresEn : [],
            featuresKu: Array.isArray(featuresKu) ? featuresKu : [],
            featured: Boolean(featured),
            active: active !== undefined ? Boolean(active) : true,
            order: plans.length + 1,
            createdAt: Date.now()
        };

        plans.push(newPlan);
        writePlans(plans);

        logAdminActivity('plan_create', req.user, { id: newPlan.id, title: newPlan.name }, { name: newPlan.name, price: newPlan.price, credits: newPlan.credits, currency: newPlan.currency, originalPrice: newPlan.originalPrice, discountPercent: newPlan.discountPercent }, req);

        res.json({ success: true, plan: newPlan });
    } catch (e) {
        logAdminActivity('server_error', req.user, { title: 'هەڵە لە دروستکردنی پلان' }, { error: e.message }, req);
        res.status(500).json({ error: 'Failed to create plan' });
    }
});

// 4. Super Admin: Update a plan
app.put('/api/admin/plans/:id', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const plans = readPlans();
        const idx = plans.findIndex(p => p.id === id);
        if (idx === -1) {
            return res.status(404).json({ error: 'پلان نەدۆزرایەوە' });
        }

        const existing = plans[idx];
        const {
            name,
            credits,
            price,
            originalPrice,
            discountPercent,
            currency,
            color,
            badge,
            descriptionEn,
            descriptionKu,
            featuresEn,
            featuresKu,
            featured,
            active,
            order
        } = req.body;

        plans[idx] = {
            ...existing,
            name: name !== undefined ? String(name).trim() : existing.name,
            credits: credits !== undefined ? Number(credits) : existing.credits,
            price: price !== undefined ? String(price).trim() : existing.price,
            originalPrice: originalPrice !== undefined ? String(originalPrice).trim() : (existing.originalPrice || ''),
            discountPercent: discountPercent !== undefined ? String(discountPercent).trim() : (existing.discountPercent || ''),
            currency: currency !== undefined ? String(currency).trim() : existing.currency,
            color: color !== undefined ? String(color).trim() : existing.color,
            badge: badge !== undefined ? String(badge).trim() : existing.badge,
            descriptionEn: descriptionEn !== undefined ? String(descriptionEn).trim() : existing.descriptionEn,
            descriptionKu: descriptionKu !== undefined ? String(descriptionKu).trim() : existing.descriptionKu,
            featuresEn: Array.isArray(featuresEn) ? featuresEn : existing.featuresEn,
            featuresKu: Array.isArray(featuresKu) ? featuresKu : existing.featuresKu,
            featured: featured !== undefined ? Boolean(featured) : existing.featured,
            active: active !== undefined ? Boolean(active) : existing.active,
            order: order !== undefined ? Number(order) : existing.order,
            updatedAt: Date.now()
        };

        writePlans(plans);

        logAdminActivity('plan_edit', req.user, { id: existing.id, title: plans[idx].name }, { 
            name: plans[idx].name, 
            oldPrice: existing.price, 
            newPrice: plans[idx].price, 
            oldCredits: existing.credits, 
            newCredits: plans[idx].credits, 
            oldOriginalPrice: existing.originalPrice, 
            newOriginalPrice: plans[idx].originalPrice, 
            discountPercent: plans[idx].discountPercent 
        }, req);

        res.json({ success: true, plan: plans[idx] });
    } catch (e) {
        logAdminActivity('server_error', req.user, { title: 'هەڵە لە دەستکاریکردنی پلان' }, { error: e.message }, req);
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

// 5. Super Admin: Delete a plan
app.delete('/api/admin/plans/:id', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const { id } = req.params;
        let plans = readPlans();
        const planToDelete = plans.find(p => p.id === id);
        if (!planToDelete) {
            return res.status(404).json({ error: 'پلان نەدۆزرایەوە' });
        }

        plans = plans.filter(p => p.id !== id);
        writePlans(plans);

        logAdminActivity('plan_delete', req.user, { id: id, title: planToDelete.name }, { name: planToDelete.name, price: planToDelete.price, credits: planToDelete.credits }, req);

        res.json({ success: true, message: 'پلان بە سەرکەوتوویی سڕایەوە' });
    } catch (e) {
        logAdminActivity('server_error', req.user, { title: 'هەڵە لە سڕینەوەی پلان' }, { error: e.message }, req);
        res.status(500).json({ error: 'Failed to delete plan' });
    }
});

// 6. Super Admin: Reorder plans
app.put('/api/admin/plans-reorder', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const { planIds } = req.body;
        if (!Array.isArray(planIds)) {
            return res.status(400).json({ error: 'Invalid planIds array' });
        }

        const plans = readPlans();
        planIds.forEach((id, index) => {
            const plan = plans.find(p => p.id === id);
            if (plan) plan.order = index + 1;
        });

        writePlans(plans);

        logAdminActivity('plan_reorder', req.user, { title: 'ڕێکخستنەوەی ڕیزبەندی پلانەکان' }, { count: planIds.length }, req);

        res.json({ success: true, plans: plans.sort((a, b) => (a.order || 0) - (b.order || 0)) });
    } catch (e) {
        logAdminActivity('server_error', req.user, { title: 'هەڵە لە ڕیزبەندیکردنی پلان' }, { error: e.message }, req);
        res.status(500).json({ error: 'Failed to reorder plans' });
    }
});

// Serving static files for receipts
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ======= OpenRouter AI =======
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const toGeminiLikeResponse = (openRouterData, modelUsed) => {
    const text = openRouterData?.choices?.[0]?.message?.content || '';
    return {
        candidates: [{ content: { parts: [{ text }] } }],
        provider: 'openrouter',
        model: modelUsed || OPENROUTER_MODEL
    };
};

const callOpenRouter = async (input, options = {}) => {
    const prompt = extractPrompt(input);
    const maxTokens = options.max_tokens || 150;
    let modelToUse = options.model || OPENROUTER_MODEL || 'anthropic/claude-sonnet-5';

    try {
        const payload = {
            model: modelToUse,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.2
        };

        const response = await axios.post(OPENROUTER_URL, payload, {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://kurdishstream.com',
                'X-Title': 'Kurdish Stream'
            },
            timeout: 180000
        });

        return toGeminiLikeResponse(response.data, modelToUse);
    } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'AI request failed';
        console.error('\x1b[31m[OpenRouter AI Error]\x1b[0m', errMsg, '| Model:', modelToUse);
        throw new Error(errMsg);
    }
};

const extractPrompt = (input) => {
    if (typeof input === 'string') return input;
    if (!Array.isArray(input?.contents)) return '';
    const lines = [];
    for (const content of input.contents) {
        if (!Array.isArray(content?.parts)) continue;
        for (const part of content.parts) {
            if (typeof part?.text === 'string' && part.text.trim()) {
                lines.push(part.text);
            }
        }
    }
    return lines.join('\n').trim();
};

app.post('/api/ai/generate', requireAuth, aiLimiter, async (req, res) => {
    console.log('OpenRouter AI Route Hit!');
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const hasContents = Array.isArray(req.body?.contents);
    
    if (!prompt && !hasContents) {
        return res.status(400).json({ error: { message: 'Send either { prompt } or { contents }' } });
    }

    if (!OPENROUTER_API_KEY) {
        return res.status(503).json({ error: { message: 'OPENROUTER_API_KEY is missing in server .env' } });
    }

    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    const user = users[idx];
    const isSuper = isSuperAdmin(user);

    const aiTask = req.body.aiTask || 'unknown';
    const lineCount = typeof req.body.lineCount === 'number' && req.body.lineCount > 0 ? req.body.lineCount : 1;
    let requiredCredits = 2; // Default for general AI tasks
    
    if (aiTask === 'voice_correction') requiredCredits = 3;       // 🎙️ شیکاری دەنگ و گۆکردن
    else if (aiTask === 'word_translation') requiredCredits = 2;   // 📖 وەرگێڕانی وشە
    else if (aiTask === 'sentence_translation') requiredCredits = 2; // 📖 وەرگێڕانی ڕستە
    else if (aiTask === 'grammar_explain') requiredCredits = 2;    // 📖 شیکاری ڕێزمان
    else if (aiTask === 'flashcard_generation') requiredCredits = 3; // 🃏 دروستکردنی فلاشکارت
    else if (aiTask === 'quiz_generation') requiredCredits = 5;      // 🎬 دروستکردنی کویزی فیلم
    else if (aiTask === 'synopsis') requiredCredits = 2;             // 🎬 کورتەی فیلم
    else if (aiTask === 'srt_translation' || aiTask === 'srt_batch') {
        // ⚡ وەرگێڕانی ژێرنووس: هەر ١ دێڕ = ١ کرێدیت
        requiredCredits = Math.max(1, lineCount);
    }
    else if (aiTask === 'srt_line_translation') {
        requiredCredits = 1; // ⚡ وەرگێڕانی یەک دێڕ = ١ کرێدیت
    }
    else requiredCredits = 2;

    // Super Admin has unlimited master access; all other users & admins must have enough credits
    if (!isSuper) {
        if ((user.credits || 0) < requiredCredits) {
            return res.status(402).json({ 
                error: { 
                    message: `کرێدیتی پێویستت نییە بۆ وەرگێڕانی AI. ئەم کارە پێویستی بە ${requiredCredits} کرێدیتە، بەڵام باڵانسی ئێستات ${user.credits || 0} کرێدیتە.` 
                },
                requiredCredits,
                currentCredits: user.credits || 0
            });
        }
    }

    try {
        const maxTokens = req.body?.max_tokens || ((aiTask === 'srt_translation') ? 4000 : ((aiTask === 'synopsis') ? 1000 : ((aiTask === 'quiz_generation' || aiTask === 'flashcard_generation') ? 400 : (aiTask === 'grammar_explain' ? 250 : 200))));
        const customModel = req.body?.model || null;
        const data = await callOpenRouter(hasContents ? req.body : prompt, { max_tokens: maxTokens, model: customModel });
        
        if (!isSuper && requiredCredits > 0) {
            user.credits = Math.max(0, (user.credits || 0) - requiredCredits);
            if (!user.creditUsage) user.creditUsage = [];
            user.creditUsage.push({
                id: uuidv4(),
                type: 'ai_usage',
                task: aiTask,
                amount: -requiredCredits,
                date: Date.now(),
                model: customModel || 'default',
                lineCount: lineCount,
                movieTitle: req.body?.movieTitle || 'Subtitle Translation'
            });
            writeUsers(users);
        }
        
        data.remainingCredits = user.credits || 0;
        data.creditsUsed = isSuper ? 0 : requiredCredits;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: { message: error.message || 'AI request failed' } });
    }
});

app.get('/api/movies', (req, res) => {
    const authHeader = req.headers.authorization;
    let isAdminUser = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const users = readUsers();
        const found = users.find(u => u.token === token && u.tokenExpiresAt > Date.now());
        if (found && (found.role === 'admin' || found.role === 'super_admin' || isSuperAdmin(found))) {
            isAdminUser = true;
        }
    }

    const movies = readMovies();
    if (isAdminUser) {
        return res.json(movies);
    }

    // For public users: return only published movies (or without status for backwards compatibility)
    const publicMovies = movies.filter(m => !m.status || m.status === 'published');
    res.json(publicMovies);
});

app.get('/api/movies/:id', (req, res) => {
    const movie = readMovies().find((m) => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });

    if (!movie.status || movie.status === 'published') {
        return res.json(movie);
    }

    // If draft/pending, check if user is admin
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const users = readUsers();
        const found = users.find(u => u.token === token && u.tokenExpiresAt > Date.now());
        if (found && (found.role === 'admin' || found.role === 'super_admin' || isSuperAdmin(found))) {
            return res.json(movie);
        }
    }

    return res.status(403).json({ error: 'ئەم بەرهەمە هێشتا پەسەند نەکراوە و لە قۆناغی چاوەڕوانیدایە' });
});

// Comments Endpoints
app.get('/api/movies/:id/comments', (req, res) => {
    const movies = readMovies();
    const movie = movies.find(m => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    res.json(movie.comments || []);
});

app.post('/api/movies/:id/comments', requireAuth, (req, res) => {
    const { text, rating } = req.body;
    if (!text || text.trim().length === 0) return res.status(400).json({ error: 'Comment text is required' });
    
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Movie not found' });
    
    if (!movies[idx].comments) movies[idx].comments = [];
    
    const newComment = {
        id: uuidv4(),
        userId: req.user.id,
        username: req.user.username,
        text: text.trim(),
        rating: rating || 0,
        createdAt: Date.now()
    };
    
    movies[idx].comments.push(newComment);
    writeMovies(movies);
    
    res.json({ success: true, comment: newComment, comments: movies[idx].comments });
});

// --- Live Concurrent Active Viewers Tracking ---
const liveWatchers = new Map();

function getLiveViewerCount(movieId) {
    const watchers = liveWatchers.get(movieId);
    if (!watchers) return 0;
    const now = Date.now();
    const threshold = 25000; // 25 seconds ping threshold
    for (const [clientId, lastPing] of watchers.entries()) {
        if (now - lastPing > threshold) {
            watchers.delete(clientId);
        }
    }
    return watchers.size;
}

// Endpoint: Heartbeat ping from an active watcher
app.post('/api/movies/:id/heartbeat', (req, res) => {
    const movieId = req.params.id;
    const clientId = req.body.clientId || req.ip || req.headers['x-forwarded-for'] || 'client_' + Math.random().toString(36).slice(2);
    
    if (!liveWatchers.has(movieId)) {
        liveWatchers.set(movieId, new Map());
    }
    const watchers = liveWatchers.get(movieId);
    watchers.set(clientId, Date.now());
    
    const count = getLiveViewerCount(movieId);
    res.json({ success: true, liveViewers: count });
});

// Endpoint: Watcher left the movie
app.post('/api/movies/:id/leave', (req, res) => {
    const movieId = req.params.id;
    const clientId = req.body.clientId || req.ip || req.headers['x-forwarded-for'] || 'client';
    if (liveWatchers.has(movieId)) {
        liveWatchers.get(movieId).delete(clientId);
    }
    const count = getLiveViewerCount(movieId);
    res.json({ success: true, liveViewers: count });
});

// Endpoint: Get active live viewers map for all movies
app.get('/api/movies-live-viewers', (req, res) => {
    const result = {};
    const now = Date.now();
    const threshold = 25000;
    for (const [movieId, watchers] of liveWatchers.entries()) {
        for (const [clientId, lastPing] of watchers.entries()) {
            if (now - lastPing > threshold) {
                watchers.delete(clientId);
            }
        }
        if (watchers.size > 0) {
            result[movieId] = watchers.size;
        }
    }
    res.json(result);
});

// New endpoint to fetch multiple media items by IDs for favorites
app.post('/api/media/favorites', requireAuth, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid IDs array provided' });
    }
    const allMedia = readMovies();
    const favoriteMedia = allMedia.filter(media => ids.includes(media.id));
    res.json(favoriteMedia);
});

// New endpoint to fetch multiple media items by IDs for watch later
app.post('/api/media/watchlater', requireAuth, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid IDs array provided' });
    }
    const allMedia = readMovies();
    const watchLaterMedia = allMedia.filter(media => ids.includes(media.id));
    res.json(watchLaterMedia);
});

app.get('/api/stream/:id', (req, res) => {
    const movies = readMovies();
    const movie = movies.find((m) => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });
    const { s, e, start: seekStart, quality: reqQuality, q } = req.query;
    const source = resolveVideoSource(movie, s, e);
    if (!source) return res.status(404).json({ error: 'Video source not found' });

    const qualityNum = parseInt(reqQuality || q, 10);
    const ss = parseFloat(seekStart) || 0;

    // Handle remote source (e.g. Cloudflare R2 or direct MP4 link)
    if (source.mode === 'remote') {
        // If a specific downscaled quality is requested (e.g. 720, 480, 360) and valid, transcode on-the-fly
        if (qualityNum && [1080, 720, 480, 360].includes(qualityNum)) {
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Cache-Control': 'no-store',
                'X-Content-Duration': movie.duration || 0
            });

            const ffmpegArgs = [];
            if (ss > 0) {
                ffmpegArgs.push('-ss', ss.toFixed(3));
            }
            ffmpegArgs.push(
                '-analyzeduration', '5M',
                '-probesize', '5M',
                '-i', source.videoUrl,
                '-fflags', '+nobuffer+discardcorrupt',
                '-flags', 'low_delay',
                '-vf', `scale=-2:${qualityNum}`,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-crf', '26',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', 'frag_keyframe+empty_moov+faststart+default_base_moof',
                '-avoid_negative_ts', 'make_zero',
                '-f', 'mp4',
                'pipe:1'
            );

            const clientId = `${req.ip || 'unknown'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            killExistingFfmpeg(clientId);
            const ffmpeg = spawn('ffmpeg', ffmpegArgs, { windowsHide: true });
            registerFfmpegProcess(clientId, ffmpeg);
            ffmpeg.stdout.pipe(res);
            ffmpeg.stderr.on('data', () => {});
            ffmpeg.on('error', () => { cleanupFfmpegProcess(clientId); if (!res.headersSent) res.status(500).end(); });
            ffmpeg.on('close', () => { cleanupFfmpegProcess(clientId); if (!res.writableEnded) res.end(); });
            req.on('close', () => { cleanupFfmpegProcess(clientId); if (!ffmpeg.killed) ffmpeg.kill('SIGKILL'); });
            return;
        }

        // Direct remote stream / redirect
        return res.redirect(source.videoUrl);
    }

    // Local file handling
    const { videoPath } = source;
    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Video file missing on disk' });

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(videoPath).toLowerCase();
    const contentType = videoMimeByExt[ext] || 'application/octet-stream';
    const shouldTranscodeToMp4 = req.query.transcode === 'mp4' || ext === '.mkv' || (qualityNum && [1080, 720, 480, 360].includes(qualityNum));
    
    // Browsers often fail to play raw MKV streams or require quality scaling. Transcode on-the-fly.
    if (shouldTranscodeToMp4) {
        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-store',
            'X-Content-Duration': movie.duration || 0
        });

        const ffmpegArgs = [];
        if (ss > 0) {
            ffmpegArgs.push('-ss', ss.toFixed(3));
        }

        ffmpegArgs.push(
            '-analyzeduration', '5M',
            '-probesize', '5M',
            '-i', videoPath,
            '-fflags', '+nobuffer+discardcorrupt',
            '-flags', 'low_delay'
        );

        if (qualityNum && [1080, 720, 480, 360].includes(qualityNum)) {
            ffmpegArgs.push(
                '-vf', `scale=-2:${qualityNum}`,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-crf', '26',
                '-c:a', 'aac',
                '-b:a', '128k'
            );
        } else {
            ffmpegArgs.push(
                '-c:v', 'copy',
                '-c:a', 'copy'
            );
        }

        ffmpegArgs.push(
            '-movflags', 'frag_keyframe+empty_moov+faststart+default_base_moof',
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-avoid_negative_ts', 'make_zero',
            '-f', 'mp4',
            'pipe:1'
        );

        const clientId = `${req.ip || 'unknown'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        killExistingFfmpeg(clientId);
        const ffmpeg = spawn('ffmpeg', ffmpegArgs, { windowsHide: true });
        registerFfmpegProcess(clientId, ffmpeg);
        
        ffmpeg.stdout.pipe(res);
        ffmpeg.stderr.on('data', () => {});
        ffmpeg.on('error', (err) => {
            console.error('[FFmpeg] Stream transcode failed:', err.message);
            cleanupFfmpegProcess(clientId);
            if (!res.headersSent) res.status(500).json({ error: 'Failed to transcode video' });
        });
        ffmpeg.on('close', () => {
            cleanupFfmpegProcess(clientId);
            if (!res.writableEnded) res.end();
        });
        req.on('close', () => {
            cleanupFfmpegProcess(clientId);
            if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
        });
        return;
    }

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
            res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
            return;
        }

        const chunkSize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Date': new Date().toUTCString()
        });

        file.pipe(res);
        file.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) res.status(500).send('Stream error');
            file.destroy();
        });

        req.on('close', () => {
            file.destroy();
        });
        return;
    }

    res.writeHead(200, { 
        'Content-Length': fileSize, 
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
    });
    const fullStream = fs.createReadStream(videoPath);
    fullStream.pipe(res);
    fullStream.on('error', (err) => {
        console.error('Full stream error:', err);
        fullStream.destroy();
    });
    req.on('close', () => {
        fullStream.destroy();
    });
});

app.post('/api/flashcards/media', async (req, res) => {
    try {
        const { movieId, seasonNumber, episodeNumber, timestamp } = req.body || {};
    const numericTimestamp = Number(timestamp);
    if (!movieId || !Number.isFinite(numericTimestamp)) {
            return res.status(400).json({ error: 'movieId and timestamp are required' });
        }

        const movie = readMovies().find((m) => m.id === movieId);
        if (!movie) return res.status(404).json({ error: 'Movie not found' });

        const source = resolveVideoSource(movie, seasonNumber, episodeNumber);
        if (!source) {
            return res.status(404).json({ error: 'Video source not found' });
        }

        if (source.mode === 'remote') {
            try {
                // Try to extract from URL (R2)
                const media = await extractSceneMedia(source.videoUrl, numericTimestamp);
                return res.json({
                    mode: 'local_extract',
                    ...media
                });
            } catch (err) {
                console.warn('Flashcard remote extraction failed, returning empty assets:', err.message);
                return res.json({
                    mode: 'remote_static',
                    screenshotUrl: null,
                    audioUrl: null,
                    screenshotBase64: null,
                    audioClipBase64: null
                });
            }
        }

        if (!fs.existsSync(source.videoPath)) {
            return res.status(404).json({ error: 'Video file missing on disk' });
        }

        const media = await extractSceneMedia(source.videoPath, numericTimestamp);
        return res.json({
            mode: 'local_extract',
            ...media
        });
    } catch (error) {
        console.error('Flashcard media extraction failed:', error?.stderr || error?.message || error);
        return res.status(500).json({
            error: 'Failed to extract flashcard media'
        });
    }
});

app.get('/api/subtitle/:id/:type', (req, res) => {
    const movie = readMovies().find((m) => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });

    const srtFile = req.params.type === 'original' ? movie.originalSrt : movie.translatedSrt;
    if (!srtFile) return res.status(404).json({ error: 'No subtitle' });

    const srtPath = path.join(MOVIES_DIR, movie.id, srtFile);
    if (!fs.existsSync(srtPath)) return res.status(404).json({ error: 'File missing' });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(srtPath);
});

app.get('/api/subtitle/:id', (req, res) => {
    const movie = readMovies().find((m) => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });

    const { s, e, type } = req.query;
    if (!s || !e) return res.status(400).json({ error: 'Missing season/episode' });

    const season = movie.seasons?.find((se) => se.number === parseInt(s, 10));
    const episode = season?.episodes.find((ep) => ep.number === parseInt(e, 10));
    if (!episode) return res.status(404).json({ error: 'Episode not found' });

    const srtFile = type === 'original' ? episode.originalSrt : episode.translatedSrt;
    if (!srtFile) return res.status(404).json({ error: 'No subtitle' });

    const srtPath = path.join(MOVIES_DIR, movie.id, 'seasons', `s${s}`, `e${e}`, srtFile);
    if (!fs.existsSync(srtPath)) return res.status(404).json({ error: 'File missing' });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(srtPath);
});

app.get('/api/poster/:id', (req, res) => {
    const dir = path.join(MOVIES_DIR, req.params.id);
    const isThumb = req.query.thumb === '1' || req.query.thumb === 'true';

    // 30-day aggressive client cache with immutable support
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');

    // 1. If thumbnail is requested, serve WebP thumbnail if available
    if (isThumb) {
        const thumbWebp = path.join(dir, 'poster_thumb.webp');
        if (fs.existsSync(thumbWebp)) return res.sendFile(thumbWebp);
    }

    // 2. High-performance full WebP
    const posterWebp = path.join(dir, 'poster.webp');
    if (fs.existsSync(posterWebp)) return res.sendFile(posterWebp);

    // 3. Fallback to original formats
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
        const p = path.join(dir, 'poster' + ext);
        if (fs.existsSync(p)) return res.sendFile(p);
    }
    res.status(404).json({ error: 'No poster' });
});

// ======= OMDb API & Translation Endpoints =======

async function translateText(text, targetLang) {
    if (!text || text === 'N/A') return '';
    try {
        const res = await axios.get('https://clients5.google.com/translate_a/t', {
            params: { client: 'dict-chrome-ex', sl: 'en', tl: targetLang, q: text },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 6000
        });
        if (res.data && res.data[0]) {
            return Array.isArray(res.data) ? res.data.join(' ') : res.data[0];
        }
    } catch(e) { 
        console.warn(`[Translate Warning for ${targetLang}]:`, e.message); 
        try {
            const myMemLang = targetLang === 'ckb' ? 'ku' : targetLang;
            const memRes = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${myMemLang}`, { timeout: 5000 });
            if (memRes.data && memRes.data.responseData && memRes.data.responseData.translatedText) {
                return memRes.data.responseData.translatedText;
            }
        } catch(e2) {
            console.error(`[MyMemory Translate Error for ${targetLang}]:`, e2.message);
        }
    }
    return text;
}

app.get('/api/omdb-rating', requireAuth, requireAdmin, async (req, res) => {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: 'پێویستە ناو، لینک، یان کودی IMDb فیلمەکە بنێریت' });
    
    if (!OMDB_API_KEY) {
        return res.status(500).json({ error: 'OMDB_API_KEY لەسەر سێرڤەر دانەنراوە. تکایە لە .env زیادی بکە.' });
    }

    try {
        // Detect if input is IMDb ID (e.g. tt0903747) or contains IMDb URL
        const rawInput = title.toString().trim();
        const imdbIdMatch = rawInput.match(/tt\d{7,8}/i);

        let url = '';
        if (imdbIdMatch) {
            const imdbId = imdbIdMatch[0];
            url = `http://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
            console.log(`[OMDb API] Fetching by IMDb ID (${imdbId})`);
        } else {
            url = `http://www.omdbapi.com/?t=${encodeURIComponent(rawInput)}&apikey=${OMDB_API_KEY}`;
            console.log(`[OMDb API] Fetching by Title (${rawInput})`);
        }
        
        const response = await axios.get(url);
        
        if (response.data.Response === 'True') {
            const data = response.data;
            const imdbRating = parseFloat(data.imdbRating);
            const resolvedTitle = data.Title || rawInput;
            
            let mappedType = data.Type === 'series' ? 'series' : 'movie';
            if (data.Genre && data.Genre.includes('Animation')) mappedType = 'animation';

            let seasonsData = [];
            if (mappedType === 'series' && data.totalSeasons && !isNaN(parseInt(data.totalSeasons))) {
                const totalS = parseInt(data.totalSeasons);
                console.log(`[OMDb API] Fetching all ${totalS} seasons for ${resolvedTitle}...`);
                
                // Fetch all seasons concurrently with Promise.all
                const seasonPromises = [];
                for (let i = 1; i <= totalS; i++) {
                    const seasonQueryParam = imdbIdMatch ? `i=${imdbIdMatch[0]}` : `t=${encodeURIComponent(resolvedTitle)}`;
                    seasonPromises.push(
                        axios.get(`http://www.omdbapi.com/?${seasonQueryParam}&Season=${i}&apikey=${OMDB_API_KEY}`)
                            .then(sRes => ({ seasonNum: i, data: sRes.data }))
                            .catch(err => {
                                console.error(`OMDb Season ${i} fetch error:`, err.message);
                                return { seasonNum: i, data: null };
                            })
                    );
                }

                const seasonResults = await Promise.all(seasonPromises);
                for (const sItem of seasonResults) {
                    if (sItem.data && sItem.data.Response === 'True' && sItem.data.Episodes) {
                        let maxEpNum = 0;
                        sItem.data.Episodes.forEach(ep => {
                            const num = parseInt(ep.Episode) || 0;
                            if (num > maxEpNum) maxEpNum = num;
                        });

                        const episodes = [];
                        for (let eNum = 1; eNum <= maxEpNum; eNum++) {
                            const omdbEp = sItem.data.Episodes.find(ep => parseInt(ep.Episode) === eNum);
                            episodes.push({
                                id: uuidv4(),
                                number: eNum,
                                title: omdbEp && omdbEp.Title && omdbEp.Title !== 'N/A' ? omdbEp.Title : `ئەڵقەی ${eNum}`,
                                duration: data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : '',
                                videoFile: null,
                                videoUrl: null,
                                originalSrt: null,
                                translatedSrt: null,
                                sensitiveScenes: []
                            });
                        }

                        seasonsData.push({
                            id: uuidv4(),
                            number: sItem.seasonNum,
                            title: `سیزنی ${sItem.seasonNum}`,
                            episodes: episodes
                        });
                    }
                }
            }

            const plotEn = data.Plot && data.Plot !== 'N/A' ? data.Plot : '';
            let plotKu = '';
            let plotAr = '';
            try {
                plotKu = await translateText(plotEn, 'ckb');
            } catch(e) { console.error('Kurdish translation failed', e.message); }
            
            try {
                plotAr = await translateText(plotEn, 'ar');
            } catch(e) { console.error('Arabic translation failed', e.message); }

            let yearVal = new Date().getFullYear();
            let endYearVal = null;
            if (data.Year && data.Year !== 'N/A') {
                const yearParts = data.Year.split('–');
                yearVal = parseInt(yearParts[0]);
                if (yearParts.length > 1 && yearParts[1]) {
                    endYearVal = parseInt(yearParts[1]);
                } else if (yearParts.length > 1 && !yearParts[1]) {
                    endYearVal = null;
                } else {
                    endYearVal = mappedType === 'series' ? yearVal : null;
                }
            }

            res.json({ 
                title: resolvedTitle,
                imdbID: data.imdbID || (imdbIdMatch ? imdbIdMatch[0] : ''),
                imdbRating: isNaN(imdbRating) ? null : imdbRating,
                imdbVotes: data.imdbVotes && data.imdbVotes !== 'N/A' ? data.imdbVotes : '',
                plot: plotKu,
                plotKu: plotKu,
                plotEn: plotEn,
                plotAr: plotAr,
                genre: data.Genre && data.Genre !== 'N/A' ? data.Genre : '',
                year: yearVal,
                endYear: endYearVal,
                runtime: data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : '',
                poster: data.Poster && data.Poster !== 'N/A' ? data.Poster : '',
                type: mappedType,
                actors: data.Actors && data.Actors !== 'N/A' ? data.Actors : '',
                director: data.Director && data.Director !== 'N/A' ? data.Director : '',
                awards: data.Awards && data.Awards !== 'N/A' ? data.Awards : '',
                seasons: seasonsData,
                language: data.Language && data.Language !== 'N/A' ? data.Language : ''
            });
        } else {
            res.status(404).json({ error: response.data.Error || 'فیلمەکە نەدۆزرایەوە لە IMDb/OMDb' });
        }
    } catch (error) {
        console.error('[OMDb API Error]:', error.message);
        if (error.response) {
            if (error.response.status === 401) {
                return res.status(401).json({ error: 'کێشە لە API Key هەیە (Unauthorized). دڵنیابە کلیلەکە ڕاستە و چالاککراوە.' });
            }
        }
        res.status(500).json({ error: `کێشەیەک لە پەیوەندیکردن بە OMDb API ڕوویدا: ${error.message}` });
    }
});

// ======= ADMIN Routes =======
async function resolveCleanTitle(rawTitle) {
    if (!rawTitle) return 'بێ ناو';
    let clean = rawTitle.toString().trim();
    if (clean.includes('http') || clean.includes('imdb.com') || /^tt\d{7,8}$/i.test(clean)) {
        const match = clean.match(/tt\d{7,8}/i);
        if (match && OMDB_API_KEY) {
            try {
                const omdbRes = await axios.get(`http://www.omdbapi.com/?i=${match[0]}&apikey=${OMDB_API_KEY}`, { timeout: 4000 });
                if (omdbRes.data && omdbRes.data.Response === 'True' && omdbRes.data.Title) {
                    return omdbRes.data.Title;
                }
            } catch(e) {
                console.error('[Server Auto-Resolve Title Error]:', e.message);
            }
        }
    }
    return clean;
}

app.post('/api/admin/movies', requireAuth, requirePermission('canAddMovies'), async (req, res) => {
    const { title, description, descriptionKu, descriptionEn, descriptionAr, language, genre, year, endYear, duration, type, imdbRating, posterUrl, seasons, level, languageMetrics, status } = req.body;
    const id = uuidv4();
    fs.mkdirSync(path.join(MOVIES_DIR, id), { recursive: true });

    const isSuper = isSuperAdmin(req.user);
    const canDirectPublish = hasPermission(req.user, 'canPublishDirectly');
    const initialStatus = (isSuper || canDirectPublish) ? (status || 'published') : (status === 'draft' ? 'draft' : 'pending_approval');

    const cleanTitle = await resolveCleanTitle(title);
    const movies = readMovies();
    const newItem = {
        id,
        title: cleanTitle,
        description: description || descriptionKu || '',
        descriptionKu: descriptionKu || '',
        descriptionEn: descriptionEn || '',
        descriptionAr: descriptionAr || '',
        language: language || '',
        genre: genre || '',
        year: +year || new Date().getFullYear(),
        endYear: endYear || null,
        duration: duration || '',
        posterUrl: posterUrl || '',
        posterCloudUrl: null,
        videoFile: null,
        videoUrl: null,
        originalSrt: null,
        translatedSrt: null,
        type: type || 'movie',
        seasons: seasons && seasons.length > 0 ? seasons : (type === 'series' ? [] : undefined),
        createdAt: Date.now(),
        imdbRating: imdbRating || null,
        level: level || undefined,
        languageMetrics: languageMetrics || undefined,
        status: initialStatus,
        submittedBy: {
            id: req.user.id,
            username: req.user.username,
            at: new Date().toISOString()
        },
        approvedBy: initialStatus === 'published' ? req.user.username : undefined,
        approvedAt: initialStatus === 'published' ? new Date().toISOString() : undefined
    };
    movies.unshift(newItem);
    writeMovies(movies);
    res.json(newItem);
});

app.put('/api/admin/movies/:id', requireAuth, requireAdmin, async (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const isSuper = isSuperAdmin(req.user);
    const canDirectPublish = hasPermission(req.user, 'canPublishDirectly');
    const { level, languageMetrics, status, title, ...rest } = req.body;

    let targetStatus = movies[idx].status || 'published';
    if (status) {
        targetStatus = (isSuper || canDirectPublish) ? status : (status === 'draft' ? 'draft' : 'pending_approval');
    } else if (!isSuper && !canDirectPublish) {
        // Any edit by an editor without direct publish permission sends it to pending approval
        targetStatus = 'pending_approval';
    }

    const cleanTitle = title ? await resolveCleanTitle(title) : movies[idx].title;

    movies[idx] = { 
        ...movies[idx], 
        ...rest,
        title: cleanTitle,
        level: level || undefined,
        languageMetrics: languageMetrics || undefined,
        status: targetStatus,
        lastEditedBy: {
            id: req.user.id,
            username: req.user.username,
            at: new Date().toISOString()
        }
    };
    writeMovies(movies);
    res.json(movies[idx]);
});

// ======= APPROVAL WORKFLOW ROUTES =======
app.get('/api/admin/pending-approvals', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const pending = movies.filter(m => m.status === 'pending_approval');
    res.json(pending);
});

app.post('/api/admin/movies/:id/approve', requireAuth, (req, res) => {
    const isSuper = isSuperAdmin(req.user);
    const canPublish = hasPermission(req.user, 'canPublishDirectly');
    if (!isSuper && !canPublish) {
        return res.status(403).json({ error: 'مۆڵەتی پەسەندکردن و بڵاوکردنەوەت نییە' });
    }

    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Movie not found' });

    const movie = movies[idx];
    movie.status = 'published';
    movie.approvedBy = req.user.username;
    movie.approvedAt = new Date().toISOString();
    movie.rejectReason = null;

    // Send notification to submitter if someone else submitted it
    if (movie.submittedBy?.id && movie.submittedBy.id !== req.user.id) {
        const users = readUsers();
        const submitterIdx = users.findIndex(u => u.id === movie.submittedBy.id);
        if (submitterIdx !== -1) {
            users[submitterIdx].notifications = users[submitterIdx].notifications || [];
            users[submitterIdx].notifications.push({
                id: uuidv4(),
                message: `کاری فیلم/زنجیرەی (${movie.title}) لەلایەن ${req.user.username} پەسەندکرا و بڵاوکرایەوە ✓`,
                date: new Date().toISOString(),
                read: false
            });
            writeUsers(users);
        }
    }

    writeMovies(movies);
    logAdminActivity('movie_approve', req.user, { id: movie.id, title: movie.title, type: movie.type }, { status: 'published' });

    // Broadcast live approval event to all connected admins
    broadcastWs('MOVIE_APPROVED', {
        movieId: movie.id,
        movieTitle: movie.title,
        approvedBy: req.user.username,
        message: `بەرهەمی (${movie.title}) لەلایەن @${req.user.username} پەسەندکرا و بڵاوکرایەوە ✓`
    });

    // Automatic Web Push to all devices if enabled in Super Admin settings
    try {
        const notifSettings = readNotificationSettings();
        if (notifSettings.autoNewContentPush) {
            broadcastPushToAll({
                title: `🎬 ${movie.type === 'series' ? 'زنجیرەی' : 'فیلمی'} نوێ بڵاوکرایەوە!`,
                body: `بینەری (${movie.title}) بە بە ژێرنووسی کوردی و ئینگلیزی تایبەت بە فێربوونی زمان.`,
                icon: '/favicon.ico',
                data: { url: movie.type === 'series' ? `/series/${movie.id}` : `/movie/${movie.id}` }
            }).catch(() => {});
        }
    } catch (pushErr) {}

    res.json({ success: true, message: `(${movie.title}) بە سەرکەوتوویی پەسەندکرا و بڵاوکرایەوە ✓`, movie });
});

app.post('/api/admin/movies/:id/reject', requireAuth, (req, res) => {
    const isSuper = isSuperAdmin(req.user);
    const canPublish = hasPermission(req.user, 'canPublishDirectly');
    if (!isSuper && !canPublish) {
        return res.status(403).json({ error: 'مۆڵەتی ڕەتکردنەوەت نییە' });
    }

    const { reason } = req.body;
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Movie not found' });

    const movie = movies[idx];
    movie.status = 'draft';
    movie.rejectReason = reason || 'پێویستی بە پێداچوونەوەیە';

    // Send notification to submitter
    if (movie.submittedBy?.id) {
        const users = readUsers();
        const submitterIdx = users.findIndex(u => u.id === movie.submittedBy.id);
        if (submitterIdx !== -1) {
            users[submitterIdx].notifications = users[submitterIdx].notifications || [];
            users[submitterIdx].notifications.push({
                id: uuidv4(),
                message: `کاری فیلم/زنجیرەی (${movie.title}) پەسەند نەکرا. هۆکار: ${movie.rejectReason}`,
                date: new Date().toISOString(),
                read: false
            });
            writeUsers(users);
        }
    }

    writeMovies(movies);
    logAdminActivity('movie_reject', req.user, { id: movie.id, title: movie.title, type: movie.type }, { reason: movie.rejectReason });

    // Broadcast live reject event
    broadcastWs('MOVIE_REJECTED', {
        movieId: movie.id,
        movieTitle: movie.title,
        reason: movie.rejectReason,
        rejectedBy: req.user.username,
        submitterId: movie.submittedBy?.id,
        message: `داواکاریی (${movie.title}) پەسەند نەکرا. هۆکار: ${movie.rejectReason}`
    });

    res.json({ success: true, message: `داواکارییەکە ڕەتکرایەوە و گەڕایەوە دۆخی ڕەشنووس`, movie });
});

app.post('/api/admin/movies/:id/submit-approval', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Movie not found' });

    movies[idx].status = 'pending_approval';
    movies[idx].submittedBy = {
        id: req.user.id,
        username: req.user.username,
        at: new Date().toISOString()
    };

    writeMovies(movies);
    logAdminActivity('movie_submit_approval', req.user, { id: movies[idx].id, title: movies[idx].title, type: movies[idx].type }, { status: 'pending_approval' });

    // Broadcast live submission event to Super Admins & Reviewers
    broadcastWs('MOVIE_APPROVAL_SUBMITTED', {
        movieId: movies[idx].id,
        movieTitle: movies[idx].title,
        submittedBy: req.user.username,
        message: `📥 @${req.user.username} سەبتایتڵی (${movies[idx].title})ی نارد بۆ پەسەندکردن!`
    });

    res.json({ success: true, message: 'بۆ سەرپەرشتیار نێردرا بۆ پەسەندکردن ⏳', movie: movies[idx] });
});

app.patch('/api/admin/movies/:id/toggle-featured', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    movies[idx].isFeatured = !movies[idx].isFeatured;
    writeMovies(movies);
    res.json({ success: true, isFeatured: movies[idx].isFeatured });
});

app.delete('/api/admin/movies/:id', requireAuth, requireAdmin, (req, res) => {
    let movies = readMovies();
    const dir = path.join(MOVIES_DIR, req.params.id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    movies = movies.filter((m) => m.id !== req.params.id);
    writeMovies(movies);
    res.json({ success: true });
});

const videoUpload = makeStorage(
    (req) => path.join(MOVIES_DIR, req.params.id),
    (req, file) => 'video' + path.extname(file.originalname)
);
app.post('/api/admin/movies/:id/video', requireAuth, requireAdmin, (req, res, next) => {
    req.setTimeout(0); // Disable timeout for large video uploads
    videoUpload.single('video')(req, res, (err) => {
        if (err) {
            console.error('[Movie Video Upload Multer Error]:', err);
            return res.status(400).json({ error: `هەڵەی بارکردنی ڤیدیۆ: ${err.message}` });
        }
        next();
    });
}, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'فیلمەکە نەدۆزرایەوە' });
    if (!req.file) {
        console.warn('[Video Upload] No file received. Body:', req.body);
        return res.status(400).json({ error: 'هیچ فایلی ڤیدیۆیەک وەرنەگیراوە یان پچڕان لە هێڵ ڕوویدا' });
    }
    movies[idx].videoFile = req.file.filename;
    movies[idx].videoUrl = null;
    movies[idx].videoUpdatedAt = Date.now();
    writeMovies(movies);
    console.log(`[Video Upload Success] Movie: ${movies[idx].title} (${req.params.id}) File: ${req.file.filename} Size: ${(req.file.size / (1024*1024)).toFixed(2)}MB`);
    res.json({ success: true, filename: req.file.filename });
});

const posterUpload = makeStorage(
    (req) => path.join(MOVIES_DIR, req.params.id),
    (req, file) => 'poster' + path.extname(file.originalname)
);
app.post('/api/admin/movies/:id/poster', requireAuth, requireAdmin, posterUpload.single('poster'), async (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    if (req.file) {
        try {
            const dir = path.join(MOVIES_DIR, req.params.id);
            const uploadedPath = req.file.path;
            const webpPath = path.join(dir, 'poster.webp');
            const thumbPath = path.join(dir, 'poster_thumb.webp');

            // Automatically optimize to WebP full + thumbnail
            await optimizeImageToWebP(uploadedPath, webpPath, 84);
            await generateThumbnailWebP(uploadedPath, thumbPath, 360);
        } catch (err) {
            console.error('[Poster WebP Error]:', err.message);
        }
    }

    movies[idx].posterUrl = `/api/poster/${req.params.id}`;
    writeMovies(movies);
    res.json({ success: true });
});

// Admin batch poster optimization endpoint
app.post('/api/admin/optimize-images', requireAuth, requireAdmin, async (req, res) => {
    try {
        const stats = await convertAllExistingPosters();
        res.json({
            success: true,
            message: `پشکنین و ئۆپتیمایز بە سەرکەوتوویی تەواو بوو! ${stats.optimizedCount} پۆستەر گۆڕدرا بۆ WebP. بڕی ${(stats.bytesSaved / (1024*1024)).toFixed(2)} مێگابایت قەبارە کەمکرایەوە!`,
            stats
        });
    } catch (err) {
        console.error('[Batch Optimize Error]:', err);
        res.status(500).json({ error: 'Failed to optimize images' });
    }
});

const srtMovieUpload = makeStorage(
    (req) => path.join(MOVIES_DIR, req.params.id),
    (req) => `${req.params.type}.srt`
);
app.post('/api/admin/movies/:id/srt/:type', requireAuth, requireAdmin, srtMovieUpload.single('srt'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    if (req.params.type === 'original') movies[idx].originalSrt = 'original.srt';
    else movies[idx].translatedSrt = 'translated.srt';
    writeMovies(movies);
    res.json({ success: true });
});

// Delete Movie Video (Local File & URL)
app.delete('/api/admin/movies/:id/video', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'فیلمەکە نەدۆزرایەوە' });

    if (movies[idx].videoFile) {
        const filePath = path.join(MOVIES_DIR, req.params.id, movies[idx].videoFile);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch(e) { console.error('Error deleting video file:', e.message); }
        }
    }

    movies[idx].videoFile = null;
    movies[idx].videoUrl = null;
    movies[idx].videoUpdatedAt = Date.now();
    writeMovies(movies);
    res.json({ success: true, movie: movies[idx] });
});

// Delete Movie Subtitle
app.delete('/api/admin/movies/:id/srt/:type', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'فیلمەکە نەدۆزرایەوە' });

    const srtPath = path.join(MOVIES_DIR, req.params.id, `${req.params.type}.srt`);
    if (fs.existsSync(srtPath)) {
        try { fs.unlinkSync(srtPath); } catch(e) { console.error('Error deleting srt file:', e.message); }
    }

    if (req.params.type === 'original') movies[idx].originalSrt = null;
    else movies[idx].translatedSrt = null;
    
    writeMovies(movies);
    res.json({ success: true, movie: movies[idx] });
});

app.get('/api/admin/movies/:id/srt-content', requireAuth, requireAdmin, (req, res) => {
    const { seasonNum, episodeNum } = req.query;
    const movieId = req.params.id;
    let targetDir = path.join(MOVIES_DIR, movieId);
    if (seasonNum && episodeNum) {
        targetDir = path.join(MOVIES_DIR, movieId, 'seasons', `s${seasonNum}`, `e${episodeNum}`);
    }

    let originalSrtText = '';
    let translatedSrtText = '';

    const origPath = path.join(targetDir, 'original.srt');
    const transPath = path.join(targetDir, 'translated.srt');

    if (fs.existsSync(origPath)) {
        try { originalSrtText = fs.readFileSync(origPath, 'utf8'); } catch (e) {}
    }
    if (fs.existsSync(transPath)) {
        try { translatedSrtText = fs.readFileSync(transPath, 'utf8'); } catch (e) {}
    }

    res.json({ originalSrtText, translatedSrtText });
});

app.post('/api/admin/movies/:id/srt-content', requireAuth, requireAdmin, (req, res) => {
    const { seasonNum, episodeNum, originalSrtText, translatedSrtText } = req.body;
    const movieId = req.params.id;
    let targetDir = path.join(MOVIES_DIR, movieId);
    if (seasonNum && episodeNum) {
        targetDir = path.join(MOVIES_DIR, movieId, 'seasons', `s${seasonNum}`, `e${episodeNum}`);
    }

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === movieId);
    if (idx === -1) return res.status(404).json({ error: 'Movie not found' });

    let previousTranslatedSrtText = '';
    const transPath = path.join(targetDir, 'translated.srt');
    if (fs.existsSync(transPath)) {
        try { previousTranslatedSrtText = fs.readFileSync(transPath, 'utf8'); } catch (e) {}
    }

    if (originalSrtText !== undefined) {
        const origPath = path.join(targetDir, 'original.srt');
        fs.writeFileSync(origPath, originalSrtText, 'utf8');
        if (seasonNum && episodeNum) {
            const sIdx = movies[idx].seasons?.findIndex((s) => s.number === parseInt(seasonNum, 10));
            if (sIdx !== -1 && sIdx !== undefined) {
                const eIdx = movies[idx].seasons[sIdx].episodes?.findIndex((e) => e.number === parseInt(episodeNum, 10));
                if (eIdx !== -1 && eIdx !== undefined) {
                    movies[idx].seasons[sIdx].episodes[eIdx].originalSrt = 'original.srt';
                }
            }
        } else {
            movies[idx].originalSrt = 'original.srt';
        }
    }

    if (translatedSrtText !== undefined) {
        // Smart merge: preserve lines translated by other admins while writing new lines
        const finalTransText = req.body.smartMerge !== false && previousTranslatedSrtText
            ? smartMergeKurdishSrt(previousTranslatedSrtText, translatedSrtText)
            : translatedSrtText;

        fs.writeFileSync(transPath, finalTransText, 'utf8');
        if (seasonNum && episodeNum) {
            const sIdx = movies[idx].seasons?.findIndex((s) => s.number === parseInt(seasonNum, 10));
            if (sIdx !== -1 && sIdx !== undefined) {
                const eIdx = movies[idx].seasons[sIdx].episodes?.findIndex((e) => e.number === parseInt(episodeNum, 10));
                if (eIdx !== -1 && eIdx !== undefined) {
                    movies[idx].seasons[sIdx].episodes[eIdx].translatedSrt = 'translated.srt';
                }
            }
        } else {
            movies[idx].translatedSrt = 'translated.srt';
        }

        // Record Revision Entry in Subtitle History if changed
        if (previousTranslatedSrtText !== finalTransText) {
            const diffCalc = calculateDiffStatsAndLines(previousTranslatedSrtText, finalTransText);
            const history = readSubtitleHistory();
            const isAi = Boolean(req.body.isAi || req.body.aiModel || req.body.note?.includes('AI') || req.body.note?.includes('زیرەکی'));
            const historyEntry = {
                id: uuidv4(),
                movieId,
                seasonNum: seasonNum ? parseInt(seasonNum, 10) : undefined,
                episodeNum: episodeNum ? parseInt(episodeNum, 10) : undefined,
                savedAt: new Date().toISOString(),
                savedBy: {
                    id: req.user.id,
                    username: req.user.username,
                    role: req.user.role
                },
                isAi,
                aiModel: req.body.aiModel || (isAi ? 'AI Model' : undefined),
                aiTone: req.body.aiTone,
                linesChanged: diffCalc.linesChanged,
                wordsAdded: diffCalc.wordsAdded,
                wordsRemoved: diffCalc.wordsRemoved,
                totalLines: diffCalc.totalLines,
                oldSrtText: previousTranslatedSrtText,
                newSrtText: finalTransText,
                note: req.body.note || (isAi ? `وەرگێڕانی زیرەکی دەستکرد (${req.body.aiModel || 'AI'})` : 'دەستکاریکردنی سەبتایتڵ')
            };
            history.unshift(historyEntry);
            // Limit to last 200 entries
            writeSubtitleHistory(history.slice(0, 200));

            logAdminActivity('subtitle_edit', req.user, {
                id: movieId,
                title: movies[idx].title,
                seasonNum: seasonNum ? parseInt(seasonNum, 10) : undefined,
                episodeNum: episodeNum ? parseInt(episodeNum, 10) : undefined
            }, {
                linesChanged: diffCalc.linesChanged,
                wordsAdded: diffCalc.wordsAdded,
                wordsRemoved: diffCalc.wordsRemoved
            });
        }
    }

    const isSuper = isSuperAdmin(req.user);
    const canDirectPublish = hasPermission(req.user, 'canPublishDirectly');
    let pendingApproval = false;

    if (!isSuper && !canDirectPublish) {
        movies[idx].status = 'pending_approval';
        movies[idx].submittedBy = {
            id: req.user.id,
            username: req.user.username,
            at: new Date().toISOString()
        };
        movies[idx].approvedBy = undefined;
        movies[idx].approvedAt = undefined;
        pendingApproval = true;
    }

    writeMovies(movies);
    res.json({
        success: true,
        pendingApproval,
        message: pendingApproval
            ? 'سەبتایتڵەکان پاشەکەوت کران و نێردران بۆ پەسەندکردنی بەڕێوەبەر 🚀'
            : 'سەبتایتڵەکان بە سەرکەوتوویی پاشەکەوت کران ✓'
    });
});

// Subtitle Diff Helpers
function parseSrtToBlocks(srtText) {
    if (!srtText) return [];
    const clean = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const rawBlocks = clean.split(/\n\s*\n/);
    const blocks = [];

    rawBlocks.forEach((b, idx) => {
        const lines = b.trim().split('\n');
        if (lines.length < 2) return;
        const timeMatch = (lines[1] || '').match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
        if (!timeMatch) return;
        const startTime = timeMatch[1];
        const endTime = timeMatch[2];
        const text = lines.slice(2).join('\n').trim();
        blocks.push({
            id: parseInt(lines[0], 10) || (idx + 1),
            startTime,
            endTime,
            text
        });
    });
    return blocks;
}

function computeWordDiff(oldStr, newStr) {
    const oldWords = (oldStr || '').trim().split(/\s+/).filter(Boolean);
    const newWords = (newStr || '').trim().split(/\s+/).filter(Boolean);

    if (oldWords.length === 0 && newWords.length === 0) return [];
    if (oldWords.length === 0) return [{ type: 'added', text: newStr.trim() }];
    if (newWords.length === 0) return [{ type: 'removed', text: oldStr.trim() }];

    const n = oldWords.length;
    const m = newWords.length;
    const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (oldWords[i - 1] === newWords[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    let i = n, j = m;
    const rawDiff = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
            rawDiff.unshift({ type: 'unchanged', text: oldWords[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            rawDiff.unshift({ type: 'added', text: newWords[j - 1] });
            j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
            rawDiff.unshift({ type: 'removed', text: oldWords[i - 1] });
            i--;
        }
    }

    // Merge consecutive tokens of same type for smooth, natural sentence reading
    const merged = [];
    rawDiff.forEach(token => {
        const last = merged[merged.length - 1];
        if (last && last.type === token.type) {
            last.text += ' ' + token.text;
        } else {
            merged.push({ type: token.type, text: token.text });
        }
    });

    return merged;
}

function calculateDiffStatsAndLines(oldSrt, newSrt) {
    const oldBlocks = parseSrtToBlocks(oldSrt);
    const newBlocks = parseSrtToBlocks(newSrt);

    const oldMap = new Map(oldBlocks.map(b => [b.id, b]));
    const allIds = Array.from(new Set([...oldBlocks.map(b => b.id), ...newBlocks.map(b => b.id)])).sort((a, b) => a - b);

    let linesChanged = 0;
    let wordsAdded = 0;
    let wordsRemoved = 0;
    const diffLines = [];

    allIds.forEach(id => {
        const oldB = oldMap.get(id);
        const newB = newBlocks.find(b => b.id === id);

        const oldText = (oldB ? oldB.text : '').trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const newText = (newB ? newB.text : '').trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const startTime = (newB || oldB).startTime;
        const endTime = (newB || oldB).endTime;

        if (!oldText && !newText) {
            diffLines.push({
                id,
                startTime,
                endTime,
                oldText: '',
                newText: '',
                status: 'unchanged',
                wordDiff: []
            });
            return;
        }

        if (!oldText && newText) {
            linesChanged++;
            const wCount = newText.split(/\s+/).filter(Boolean).length;
            wordsAdded += wCount;
            diffLines.push({
                id,
                startTime,
                endTime,
                oldText: '',
                newText,
                status: 'added',
                wordDiff: [{ type: 'added', text: newText }]
            });
        } else if (oldText && !newText) {
            linesChanged++;
            const wCount = oldText.split(/\s+/).filter(Boolean).length;
            wordsRemoved += wCount;
            diffLines.push({
                id,
                startTime,
                endTime,
                oldText,
                newText: '',
                status: 'deleted',
                wordDiff: [{ type: 'removed', text: oldText }]
            });
        } else if (oldText !== newText) {
            linesChanged++;
            const wordDiff = computeWordDiff(oldText, newText);
            wordDiff.forEach(t => {
                if (t.type === 'added' && t.text.trim()) wordsAdded += t.text.split(/\s+/).filter(Boolean).length;
                if (t.type === 'removed' && t.text.trim()) wordsRemoved += t.text.split(/\s+/).filter(Boolean).length;
            });
            diffLines.push({
                id,
                startTime,
                endTime,
                oldText,
                newText,
                status: 'modified',
                wordDiff
            });
        } else {
            diffLines.push({
                id,
                startTime,
                endTime,
                oldText,
                newText,
                status: 'unchanged',
                wordDiff: [{ type: 'unchanged', text: newText }]
            });
        }
    });

    return {
        linesChanged,
        wordsAdded,
        wordsRemoved,
        totalLines: allIds.length,
        diffLines
    };
}

// ─── SUBTITLE HISTORY & DIFF ENDPOINTS ───

// GET /api/admin/movies/:id/subtitle-history
app.get('/api/admin/movies/:id/subtitle-history', requireAuth, requireAdmin, (req, res) => {
    const movieId = req.params.id;
    const seasonNum = req.query.seasonNum ? parseInt(req.query.seasonNum, 10) : undefined;
    const episodeNum = req.query.episodeNum ? parseInt(req.query.episodeNum, 10) : undefined;
    const isSuper = isSuperAdmin(req.user);

    const history = readSubtitleHistory().filter(h => {
        if (h.movieId !== movieId) return false;
        if (seasonNum !== undefined && h.seasonNum !== seasonNum) return false;
        if (episodeNum !== undefined && h.episodeNum !== episodeNum) return false;
        // Non-super admins can ONLY see their own subtitle revision history
        if (!isSuper) {
            const isSelf = (h.savedBy?.id && String(h.savedBy.id) === String(req.user.id)) ||
                           (h.savedBy?.username && h.savedBy.username.toLowerCase() === req.user.username.toLowerCase());
            if (!isSelf) return false;
        }
        return true;
    });

    // Return lightweight summary list without full heavy texts
    const summaries = history.map(h => ({
        id: h.id,
        movieId: h.movieId,
        seasonNum: h.seasonNum,
        episodeNum: h.episodeNum,
        savedAt: h.savedAt,
        savedBy: h.savedBy,
        isAi: h.isAi,
        aiModel: h.aiModel,
        aiTone: h.aiTone,
        linesChanged: h.linesChanged,
        wordsAdded: h.wordsAdded,
        wordsRemoved: h.wordsRemoved,
        totalLines: h.totalLines,
        note: h.note
    }));

    res.json(summaries);
});

// GET /api/admin/ai-translation-history (Super Admin only: global AI translation history across all content)
app.get('/api/admin/ai-translation-history', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const history = readSubtitleHistory();
        const movies = readMovies();
        const moviesMap = new Map(movies.map(m => [m.id, m]));

        const aiEntries = history
            .filter(h => h.isAi || h.aiModel || h.note?.includes('AI') || h.note?.includes('زیرەکی'))
            .map(h => {
                const movie = moviesMap.get(h.movieId);
                let title = movie ? movie.title : (h.movieTitle || 'فیلم');
                if (h.seasonNum && h.episodeNum) {
                    title += ` (وەرزی ${h.seasonNum} • ئەڵقەی ${h.episodeNum})`;
                }
                return {
                    id: h.id,
                    movieId: h.movieId,
                    movieTitle: title,
                    posterUrl: movie ? (movie.posterCloudUrl || movie.posterUrl) : '',
                    seasonNum: h.seasonNum,
                    episodeNum: h.episodeNum,
                    savedAt: h.savedAt,
                    savedBy: h.savedBy,
                    isAi: true,
                    aiModel: h.aiModel || 'AI Master',
                    aiTone: h.aiTone,
                    linesChanged: h.linesChanged || 0,
                    wordsAdded: h.wordsAdded || 0,
                    wordsRemoved: h.wordsRemoved || 0,
                    totalLines: h.totalLines || 0,
                    note: h.note
                };
            });

        res.json(aiEntries);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch AI translation history' });
    }
});

// GET /api/admin/movies/:id/subtitle-diff
app.get('/api/admin/movies/:id/subtitle-diff', requireAuth, requireAdmin, (req, res) => {
    const movieId = req.params.id;
    const { historyId, seasonNum, episodeNum } = req.query;
    const isSuper = isSuperAdmin(req.user);

    const sNum = seasonNum ? parseInt(seasonNum, 10) : undefined;
    const epNum = episodeNum ? parseInt(episodeNum, 10) : undefined;

    // Fetch current translated.srt from disk
    let targetDir = path.join(MOVIES_DIR, movieId);
    if (sNum && epNum) {
        targetDir = path.join(MOVIES_DIR, movieId, 'seasons', `s${sNum}`, `e${epNum}`);
    }
    let currentTransText = '';
    const transPath = path.join(targetDir, 'translated.srt');
    if (fs.existsSync(transPath)) {
        try { currentTransText = fs.readFileSync(transPath, 'utf8'); } catch (e) {}
    }

    if (historyId) {
        const history = readSubtitleHistory();
        const entry = history.find(h => h.id === historyId);
        if (!entry) return res.status(404).json({ error: 'Revision not found' });

        // Non-super admins can only view diff of their own history entry
        if (!isSuper) {
            const isSelf = (entry.savedBy?.id && String(entry.savedBy.id) === String(req.user.id)) ||
                           (entry.savedBy?.username && entry.savedBy.username.toLowerCase() === req.user.username.toLowerCase());
            if (!isSelf) {
                return res.status(403).json({ error: 'تەنها سەرۆک دەتوانێت سەیری مێژووی وەرگێڕانی ئەدمینەکانی تر بکات.' });
            }
        }

        const diffResult = calculateDiffStatsAndLines(entry.oldSrtText || '', entry.newSrtText || '');
        return res.json({
            historyEntry: {
                id: entry.id,
                savedAt: entry.savedAt,
                savedBy: entry.savedBy,
                note: entry.note
            },
            stats: {
                linesChanged: diffResult.linesChanged,
                wordsAdded: diffResult.wordsAdded,
                wordsRemoved: diffResult.wordsRemoved,
                totalLines: diffResult.totalLines
            },
            diffLines: diffResult.diffLines
        });
    }

    // Default: compare most recent history entry with current or show last diff
    const movieHistories = readSubtitleHistory().filter(h => {
        if (h.movieId !== movieId) return false;
        if (sNum !== undefined && h.seasonNum !== sNum) return false;
        if (epNum !== undefined && h.episodeNum !== epNum) return false;
        if (!isSuper) {
            const isSelf = (h.savedBy?.id && String(h.savedBy.id) === String(req.user.id)) ||
                           (h.savedBy?.username && h.savedBy.username.toLowerCase() === req.user.username.toLowerCase());
            if (!isSelf) return false;
        }
        return true;
    });

    if (movieHistories.length === 0) {
        return res.json({
            historyEntry: null,
            stats: { linesChanged: 0, wordsAdded: 0, wordsRemoved: 0, totalLines: 0 },
            diffLines: []
        });
    }

    const latest = movieHistories[0];
    const diffResult = calculateDiffStatsAndLines(latest.oldSrtText || '', currentTransText || latest.newSrtText || '');
    res.json({
        historyEntry: {
            id: latest.id,
            savedAt: latest.savedAt,
            savedBy: latest.savedBy,
            note: latest.note
        },
        stats: {
            linesChanged: diffResult.linesChanged,
            wordsAdded: diffResult.wordsAdded,
            wordsRemoved: diffResult.wordsRemoved,
            totalLines: diffResult.totalLines
        },
        diffLines: diffResult.diffLines
    });
});

// POST /api/admin/movies/:id/subtitle-restore
app.post('/api/admin/movies/:id/subtitle-restore', requireAuth, requireAdmin, (req, res) => {
    if (!isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'تەنها سەرۆک (بەڕێوەبەری سەرەکی) دەسەڵاتی گەڕاندنەوەی نوسخەی پێشووی هەیە.' });
    }

    const movieId = req.params.id;
    const { historyId, targetVersion = 'old', seasonNum, episodeNum } = req.body;

    const history = readSubtitleHistory();
    const entry = history.find(h => h.id === historyId);
    if (!entry) return res.status(404).json({ error: 'Revision not found' });

    const textToRestore = targetVersion === 'old' ? entry.oldSrtText : entry.newSrtText;
    if (textToRestore === undefined || textToRestore === null) {
        return res.status(400).json({ error: 'No text found to restore' });
    }

    let targetDir = path.join(MOVIES_DIR, movieId);
    const sNum = seasonNum ? parseInt(seasonNum, 10) : entry.seasonNum;
    const epNum = episodeNum ? parseInt(episodeNum, 10) : entry.episodeNum;
    if (sNum && epNum) {
        targetDir = path.join(MOVIES_DIR, movieId, 'seasons', `s${sNum}`, `e${epNum}`);
    }

    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // Save previous for safety before restoring
    let currentBeforeRestore = '';
    const transPath = path.join(targetDir, 'translated.srt');
    if (fs.existsSync(transPath)) {
        try { currentBeforeRestore = fs.readFileSync(transPath, 'utf8'); } catch (e) {}
    }

    fs.writeFileSync(transPath, textToRestore, 'utf8');

    // Record restore in history
    const diffCalc = calculateDiffStatsAndLines(currentBeforeRestore, textToRestore);
    const newEntry = {
        id: uuidv4(),
        movieId,
        seasonNum: sNum,
        episodeNum: epNum,
        savedAt: new Date().toISOString(),
        savedBy: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        },
        linesChanged: diffCalc.linesChanged,
        wordsAdded: diffCalc.wordsAdded,
        wordsRemoved: diffCalc.wordsRemoved,
        totalLines: diffCalc.totalLines,
        oldSrtText: currentBeforeRestore,
        newSrtText: textToRestore,
        note: `گەڕانەوە بۆ نوسخەی (${new Date(entry.savedAt).toLocaleString('ckb')})`
    };
    history.unshift(newEntry);
    writeSubtitleHistory(history.slice(0, 100));

    res.json({ success: true, restoredText: textToRestore });
});

// Smart Merge Helper: merges newly translated lines into existing SRT without overwriting other translated lines
function smartMergeKurdishSrt(existingSrtText, incomingSrtText) {
    if (!existingSrtText || !existingSrtText.trim()) return incomingSrtText || '';
    if (!incomingSrtText || !incomingSrtText.trim()) return existingSrtText || '';

    const existingBlocks = parseSrtToBlocks(existingSrtText);
    const incomingBlocks = parseSrtToBlocks(incomingSrtText);

    const blockMap = new Map();
    existingBlocks.forEach(b => blockMap.set(b.id, b));

    // For any incoming block that has non-empty text, update blockMap
    incomingBlocks.forEach(b => {
        if (b.text && b.text.trim()) {
            blockMap.set(b.id, b);
        }
    });

    const sortedBlocks = Array.from(blockMap.values()).sort((a, b) => a.id - b.id);
    return sortedBlocks.map(b => `${b.id}\n${b.startTime} --> ${b.endTime}\n${b.text}`).join('\n\n') + '\n';
}

// ─── EDITING LOCK ENDPOINTS ───

// POST /api/admin/movies/:id/lock
app.post('/api/admin/movies/:id/lock', requireAuth, requireAdmin, (req, res) => {
    const movieId = req.params.id;
    const { seasonNum, episodeNum, action = 'acquire' } = req.body;
    const lockKey = getLockKey(movieId, seasonNum, episodeNum);
    const now = Date.now();

    const existing = activeEditingLocks.get(lockKey);

    if (action === 'release') {
        if (existing && (existing.userId === req.user.id || req.user.role === 'super_admin')) {
            activeEditingLocks.delete(lockKey);
        }
        return res.json({ success: true, released: true });
    }

    if (action === 'force_unlock') {
        if (req.user.role === 'super_admin') {
            activeEditingLocks.delete(lockKey);
            return res.json({ success: true, unlocked: true });
        }
        return res.status(403).json({ error: 'Only Super Admin can force unlock' });
    }

    // Check if active lock held by someone else
    if (existing && existing.userId !== req.user.id && (now - existing.heartbeat < LOCK_TIMEOUT_MS)) {
        return res.json({
            locked: true,
            isSelf: false,
            lockedBy: {
                id: existing.userId,
                username: existing.username,
                role: existing.role,
                lockedAt: existing.lockedAt
            }
        });
    }

    // Acquire or refresh heartbeat
    activeEditingLocks.set(lockKey, {
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        lockedAt: existing && existing.userId === req.user.id ? existing.lockedAt : now,
        heartbeat: now
    });

    // Broadcast lock acquisition in real-time
    broadcastWs('SUBTITLE_LOCK_UPDATE', {
        movieId,
        seasonNum,
        episodeNum,
        lockKey,
        action: 'acquire',
        lockedBy: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role,
            lockedAt: now
        }
    });

    res.json({
        locked: false,
        isSelf: true,
        acquired: true,
        expiresInSec: Math.round(LOCK_TIMEOUT_MS / 1000)
    });
});

// GET /api/admin/movies/:id/lock-status
app.get('/api/admin/movies/:id/lock-status', requireAuth, requireAdmin, (req, res) => {
    const movieId = req.params.id;
    const { seasonNum, episodeNum } = req.query;
    const lockKey = getLockKey(movieId, seasonNum, episodeNum);
    const now = Date.now();

    const existing = activeEditingLocks.get(lockKey);
    if (existing && (now - existing.heartbeat < LOCK_TIMEOUT_MS)) {
        return res.json({
            locked: existing.userId !== req.user.id,
            isSelf: existing.userId === req.user.id,
            lockedBy: {
                id: existing.userId,
                username: existing.username,
                role: existing.role,
                lockedAt: existing.lockedAt
            }
        });
    }

    res.json({ locked: false, isSelf: false });
});

// ─── INTERNAL TEAM NOTES ENDPOINTS ───

// GET /api/admin/movies/:id/notes
app.get('/api/admin/movies/:id/notes', requireAuth, requireAdmin, (req, res) => {
    const movieId = req.params.id;
    const seasonNum = req.query.seasonNum ? parseInt(req.query.seasonNum, 10) : undefined;
    const episodeNum = req.query.episodeNum ? parseInt(req.query.episodeNum, 10) : undefined;

    const allNotes = readInternalNotes();
    const movieNotes = allNotes.filter(n => {
        if (n.movieId !== movieId) return false;
        if (seasonNum !== undefined && n.seasonNum !== seasonNum) return false;
        if (episodeNum !== undefined && n.episodeNum !== episodeNum) return false;
        return true;
    });

    res.json(movieNotes);
});

// POST /api/admin/movies/:id/notes
app.post('/api/admin/movies/:id/notes', requireAuth, requireAdmin, (req, res) => {
    const movieId = req.params.id;
    const { text, seasonNum, episodeNum } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

    const allNotes = readInternalNotes();
    const newNote = {
        id: uuidv4(),
        movieId,
        seasonNum: seasonNum ? parseInt(seasonNum, 10) : undefined,
        episodeNum: episodeNum ? parseInt(episodeNum, 10) : undefined,
        author: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        },
        text: text.trim(),
        createdAt: new Date().toISOString()
    };

    allNotes.unshift(newNote);
    writeInternalNotes(allNotes.slice(0, 500));

    // Broadcast internal note in real-time
    broadcastWs('INTERNAL_NOTE_ADDED', {
        movieId,
        seasonNum: seasonNum ? parseInt(seasonNum, 10) : undefined,
        episodeNum: episodeNum ? parseInt(episodeNum, 10) : undefined,
        note: newNote
    });

    res.json(newNote);
});

// DELETE /api/admin/movies/:id/notes/:noteId
app.delete('/api/admin/movies/:id/notes/:noteId', requireAuth, requireAdmin, (req, res) => {
    const { noteId } = req.params;
    let allNotes = readInternalNotes();
    const targetNote = allNotes.find(n => n.id === noteId);
    if (!targetNote) return res.status(404).json({ error: 'Note not found' });

    if (targetNote.author?.id !== req.user.id && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized to delete this note' });
    }

    allNotes = allNotes.filter(n => n.id !== noteId);
    writeInternalNotes(allNotes);
    res.json({ success: true });
});

// POST /api/admin/movies/:id/feedback
// Allows Super Admin to send targeted feedback to an editor on specific lines
app.post('/api/admin/movies/:id/feedback', requireAuth, requireAdmin, (req, res) => {
    if (!isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'تەنها سەرۆک (Super Admin) دەسەڵاتی ناردنی تێبینی و ڕەخنەی هەیە بۆ ئەدمینەکانی تر.' });
    }

    const movieId = req.params.id;
    const { seasonNum, episodeNum, historyId, targetAdminUsername, targetAdminId, lineIds = [], reason, customNote, action = 'notify' } = req.body;

    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === movieId);
    if (idx === -1) return res.status(404).json({ error: 'Movie not found' });

    const movie = movies[idx];
    const users = readUsers();
    const history = readSubtitleHistory();

    // 1. Prioritize target admin by history revision or explicit selection
    let targetUserId = null;
    let targetUsername = targetAdminUsername || null;

    if (historyId) {
        const rev = history.find(h => h.id === historyId);
        if (rev && rev.savedBy) {
            targetUserId = rev.savedBy.id;
            targetUsername = rev.savedBy.username;
        }
    } else if (targetAdminId) {
        const u = users.find(x => x.id === targetAdminId);
        if (u) {
            targetUserId = u.id;
            targetUsername = u.username;
        }
    }

    // 2. Fallback to movie submitter or last editor
    if (!targetUserId) {
        targetUserId = movie.submittedBy?.id || movie.lastEditedBy?.id;
        targetUsername = movie.submittedBy?.username || movie.lastEditedBy?.username || 'ئەدمینی وەرگێڕ';
    }

    const formattedLines = lineIds.length > 0 ? `دێڕەکانی (${lineIds.join('، ')})` : 'سەبتایتڵ';
    const reasonText = reason ? `[${reason}]` : '';
    const noteText = customNote ? ` - ${customNote}` : '';
    const fullMessage = `تێبینی لەسەر ${formattedLines}: ${reasonText}${noteText}`;

    // 1. Add to Internal Notes for tracking
    const allNotes = readInternalNotes();
    const newNote = {
        id: uuidv4(),
        movieId,
        seasonNum: seasonNum ? parseInt(seasonNum, 10) : undefined,
        episodeNum: episodeNum ? parseInt(episodeNum, 10) : undefined,
        author: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        },
        text: `📌 تێبینی سەرۆک بۆ @${targetUsername}: ${fullMessage}`,
        flaggedLines: lineIds,
        createdAt: new Date().toISOString()
    };
    allNotes.unshift(newNote);
    writeInternalNotes(allNotes.slice(0, 500));

    // 2. Send notification to the editor admin
    if (targetUserId) {
        const uIdx = users.findIndex(u => u.id === targetUserId);
        if (uIdx !== -1) {
            users[uIdx].notifications = users[uIdx].notifications || [];
            users[uIdx].notifications.push({
                id: uuidv4(),
                message: `سەرۆک (${req.user.username}) لە (${movie.title}) ${fullMessage}`,
                movieId,
                seasonNum,
                episodeNum,
                flaggedLines: lineIds,
                date: new Date().toISOString(),
                read: false
            });
            writeUsers(users);
        }
    }

    // 3. If action is 'reject', return movie to draft status
    if (action === 'reject') {
        movie.status = 'draft';
        movie.rejectReason = fullMessage;
        movie.approvedBy = undefined;
        movie.approvedAt = undefined;
        writeMovies(movies);
        logAdminActivity('movie_reject', req.user, { id: movie.id, title: movie.title, type: movie.type }, { reason: fullMessage });
    }

    // 4. Broadcast live feedback event across WebSockets
    broadcastWs('TRANSLATOR_FEEDBACK', {
        movieId,
        movieTitle: movie.title,
        seasonNum,
        episodeNum,
        targetUserId,
        targetUsername,
        feedbackText: fullMessage,
        flaggedLines: lineIds,
        action,
        fromAdmin: req.user.username
    });

    res.json({
        success: true,
        message: action === 'reject' 
            ? `کارەکە ڕەتکرایەوە و تێبینی بۆ (${targetUsername}) لەسەر ${formattedLines} نێردرا ❌`
            : `تێبینی بۆ (${targetUsername}) لەسەر ${formattedLines} بە سەرکەوتوویی نێردرا ✓`,
        note: newNote,
        targetUsername
    });
});

// ─── ACTIVITY LOG & LEADERBOARD ENDPOINTS ───

function computeAdminLeaderboard() {
    const users = readUsers();
    const adminUsers = users.filter(u => u.role === 'admin' || u.role === 'super_admin');
    const logs = readActivityLogs();
    const history = readSubtitleHistory();

    const statsMap = new Map();

    adminUsers.forEach(u => {
        statsMap.set(u.id, {
            id: u.id,
            username: u.username,
            role: u.role,
            avatar: u.avatar || '',
            subtitlesEdited: 0,
            linesTranslated: 0,
            wordsAdded: 0,
            moviesAdded: 0,
            moviesApproved: 0,
            receiptsReviewed: 0,
            totalScore: 0,
            lastActive: null
        });
    });

    // Aggregate from subtitle history
    history.forEach(h => {
        if (h.savedBy?.id && statsMap.has(h.savedBy.id)) {
            const st = statsMap.get(h.savedBy.id);
            st.subtitlesEdited += 1;
            st.linesTranslated += (h.linesChanged || 0);
            st.wordsAdded += (h.wordsAdded || 0);
            if (!st.lastActive || new Date(h.savedAt) > new Date(st.lastActive)) {
                st.lastActive = h.savedAt;
            }
        }
    });

    // Aggregate from logs
    logs.forEach(l => {
        if (l.admin?.id && statsMap.has(l.admin.id)) {
            const st = statsMap.get(l.admin.id);
            if (!st.lastActive || new Date(l.timestamp) > new Date(st.lastActive)) {
                st.lastActive = l.timestamp;
            }
            if (l.eventType === 'movie_add' || l.eventType === 'episode_add') {
                st.moviesAdded += 1;
            } else if (l.eventType === 'movie_approve') {
                st.moviesApproved += 1;
            } else if (l.eventType === 'receipt_approve' || l.eventType === 'receipt_reject') {
                st.receiptsReviewed += 1;
            }
        }
    });

    // Compute gamification Score
    const leaderboard = Array.from(statsMap.values()).map(st => {
        const score = Math.round(
            (st.linesTranslated * 2) +
            (st.wordsAdded * 0.5) +
            (st.moviesAdded * 50) +
            (st.receiptsReviewed * 20) +
            (st.subtitlesEdited * 15)
        );
        st.totalScore = score;
        return st;
    });

    // Sort descending by totalScore
    leaderboard.sort((a, b) => b.totalScore - a.totalScore);

    // Assign ranks
    leaderboard.forEach((st, idx) => {
        st.rank = idx + 1;
    });

    return leaderboard;
}

// GET /api/admin/activity-logs
app.get('/api/admin/activity-logs', requireAuth, requireSuperAdmin, (req, res) => {
    const { eventType, category, status, search, limit = 100, offset = 0 } = req.query;
    let logs = readActivityLogs();

    if (category && category !== 'all') {
        logs = logs.filter(l => (l.category || '').toLowerCase() === category.toLowerCase());
    }

    if (status && status !== 'all') {
        logs = logs.filter(l => (l.status || '').toLowerCase() === status.toLowerCase());
    }

    if (eventType && eventType !== 'all') {
        logs = logs.filter(l => l.eventType === eventType);
    }

    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        logs = logs.filter(l =>
            (l.admin?.username || '').toLowerCase().includes(q) ||
            (l.target?.title || '').toLowerCase().includes(q) ||
            (l.details?.reason || '').toLowerCase().includes(q) ||
            (l.details?.note || '').toLowerCase().includes(q) ||
            (l.details?.error || '').toLowerCase().includes(q) ||
            (l.details?.name || '').toLowerCase().includes(q) ||
            (l.details?.attemptedUsername || '').toLowerCase().includes(q) ||
            (l.ip || '').toLowerCase().includes(q) ||
            (l.eventType || '').toLowerCase().includes(q)
        );
    }

    const total = logs.length;
    const paginated = logs.slice(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10));

    res.json({
        logs: paginated,
        total
    });
});

// DELETE /api/admin/activity-logs/clear
app.delete('/api/admin/activity-logs/clear', requireAuth, requireSuperAdmin, (req, res) => {
    writeActivityLogs([]);
    res.json({ success: true, message: 'تەواوی تۆماری چالاکییەکان پاککرانەوە' });
});

// GET /api/admin/leaderboard
app.get('/api/admin/leaderboard', requireAuth, requireSuperAdmin, (req, res) => {
    const leaderboard = computeAdminLeaderboard();
    res.json(leaderboard);
});

app.post('/api/admin/movies/:id/seasons', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const seasons = movies[idx].seasons || [];
    const maxNum = seasons.reduce((max, s) => Math.max(max, s.number), 0);
    const newSeason = {
        id: uuidv4(),
        number: maxNum + 1,
        title: req.body.title || `سیزنی ${maxNum + 1}`,
        episodes: []
    };
    movies[idx].seasons = [...seasons, newSeason];
    writeMovies(movies);
    res.json(newSeason);
});

app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const sIdx = movies[idx].seasons.findIndex((s) => s.number === parseInt(req.params.seasonNum, 10));
    if (sIdx === -1) return res.status(404).json({ error: 'Season not found' });

    const eps = movies[idx].seasons[sIdx].episodes;
    const existingNumbers = new Set(eps.map(ep => ep.number));
    let newNum = 1;
    while (existingNumbers.has(newNum)) {
        newNum++;
    }
    const newEp = {
        id: uuidv4(),
        number: newNum,
        title: req.body.title || `ئالقەی ${newNum}`,
        description: req.body.description || '',
        duration: req.body.duration || '',
        videoFile: null,
        videoUrl: null,
        originalSrt: null,
        translatedSrt: null
    };
    movies[idx].seasons[sIdx].episodes.push(newEp);
    writeMovies(movies);

    const epDir = path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${newEp.number}`);
    fs.mkdirSync(epDir, { recursive: true });

    res.json(newEp);
});

app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes/bulk', requireAuth, requireAdmin, (req, res) => {
    const count = parseInt(req.body.count, 10) || 1;
    if (count < 1 || count > 200) return res.status(400).json({ error: 'Count must be 1-200' });

    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const sIdx = movies[idx].seasons.findIndex((s) => s.number === parseInt(req.params.seasonNum, 10));
    if (sIdx === -1) return res.status(404).json({ error: 'Season not found' });

    const created = [];
    const existingNumbers = new Set(movies[idx].seasons[sIdx].episodes.map(ep => ep.number));
    
    for (let i = 0; i < count; i++) {
        let numToUse = 1;
        while (existingNumbers.has(numToUse)) {
            numToUse++;
        }
        existingNumbers.add(numToUse);
        
        const newEp = {
            id: uuidv4(),
            number: numToUse,
            title: `ئالقەی ${numToUse}`,
            description: '',
            duration: '',
            videoFile: null,
            videoUrl: null,
            originalSrt: null,
            translatedSrt: null
        };
        movies[idx].seasons[sIdx].episodes.push(newEp);
        created.push(newEp);
        const epDir = path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${numToUse}`);
        fs.mkdirSync(epDir, { recursive: true });
    }

    writeMovies(movies);
    res.json({ created: created.length, episodes: created });
});

const epVideoUpload = makeStorage(
    (req) => path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${req.params.episodeNum}`),
    (req, file) => 'video' + path.extname(file.originalname)
);
app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes/:episodeNum/video', requireAuth, requireAdmin, (req, res, next) => {
    req.setTimeout(0); // Disable timeout for large video uploads
    epVideoUpload.single('video')(req, res, (err) => {
        if (err) {
            console.error('[Episode Video Upload Multer Error]:', err);
            return res.status(400).json({ error: `هەڵەی بارکردنی ڤیدیۆی ئەڵقە: ${err.message}` });
        }
        next();
    });
}, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'فیلمەکە نەدۆزرایەوە' });
    const sIdx = movies[idx].seasons?.findIndex((s) => s.number === parseInt(req.params.seasonNum, 10)) ?? -1;
    if (sIdx === -1) return res.status(404).json({ error: 'سیزن نەدۆزرایەوە' });
    const eIdx = movies[idx].seasons[sIdx].episodes?.findIndex((e) => e.number === parseInt(req.params.episodeNum, 10)) ?? -1;
    if (eIdx === -1) return res.status(404).json({ error: 'ئەڵقە نەدۆزرایەوە' });
    if (!req.file) {
        return res.status(400).json({ error: 'هیچ فایلی ڤیدیۆیەک وەرنەگیراوە یان پچڕان لە هێڵ ڕوویدا' });
    }
    movies[idx].seasons[sIdx].episodes[eIdx].videoFile = req.file.filename;
    movies[idx].seasons[sIdx].episodes[eIdx].videoUrl = null;
    movies[idx].seasons[sIdx].episodes[eIdx].videoUpdatedAt = Date.now();
    writeMovies(movies);
    res.json({ success: true, filename: req.file.filename });
});

const epSrtUpload = makeStorage(
    (req) => path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${req.params.episodeNum}`),
    (req) => `${req.params.type}.srt`
);
app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes/:episodeNum/srt/:type', requireAuth, requireAdmin, epSrtUpload.single('srt'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const sIdx = movies[idx].seasons.findIndex((s) => s.number === parseInt(req.params.seasonNum, 10));
    if (sIdx === -1) return res.status(404).json({ error: 'Season not found' });
    const eIdx = movies[idx].seasons[sIdx].episodes.findIndex((e) => e.number === parseInt(req.params.episodeNum, 10));
    if (eIdx === -1) return res.status(404).json({ error: 'Episode not found' });
    if (req.params.type === 'original') movies[idx].seasons[sIdx].episodes[eIdx].originalSrt = 'original.srt';
    else movies[idx].seasons[sIdx].episodes[eIdx].translatedSrt = 'translated.srt';
    writeMovies(movies);
    res.json({ success: true });
});

// Delete Episode Video (Local file & URL)
app.delete('/api/admin/movies/:id/seasons/:seasonNum/episodes/:episodeNum/video', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'فیلمەکە نەدۆزرایەوە' });
    const sIdx = movies[idx].seasons?.findIndex((s) => s.number === parseInt(req.params.seasonNum, 10)) ?? -1;
    if (sIdx === -1) return res.status(404).json({ error: 'سیزن نەدۆزرایەوە' });
    const eIdx = movies[idx].seasons[sIdx].episodes?.findIndex((e) => e.number === parseInt(req.params.episodeNum, 10)) ?? -1;
    if (eIdx === -1) return res.status(404).json({ error: 'ئەڵقە نەدۆزرایەوە' });

    const ep = movies[idx].seasons[sIdx].episodes[eIdx];
    const epDir = path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${req.params.episodeNum}`);
    
    if (ep.videoFile) {
        const filePath = path.join(epDir, ep.videoFile);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch(e) { console.error('Error deleting ep video:', e.message); }
        }
    }

    ep.videoFile = null;
    ep.videoUrl = null;
    ep.videoUpdatedAt = Date.now();
    writeMovies(movies);
    res.json({ success: true, episode: ep });
});

// Delete Episode Subtitle
app.delete('/api/admin/movies/:id/seasons/:seasonNum/episodes/:episodeNum/srt/:type', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'فیلمەکە نەدۆزرایەوە' });
    const sIdx = movies[idx].seasons?.findIndex((s) => s.number === parseInt(req.params.seasonNum, 10)) ?? -1;
    if (sIdx === -1) return res.status(404).json({ error: 'سیزن نەدۆزرایەوە' });
    const eIdx = movies[idx].seasons[sIdx].episodes?.findIndex((e) => e.number === parseInt(req.params.episodeNum, 10)) ?? -1;
    if (eIdx === -1) return res.status(404).json({ error: 'ئەڵقە نەدۆزرایەوە' });

    const ep = movies[idx].seasons[sIdx].episodes[eIdx];
    const epDir = path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${req.params.episodeNum}`);
    const srtPath = path.join(epDir, `${req.params.type}.srt`);
    
    if (fs.existsSync(srtPath)) {
        try { fs.unlinkSync(srtPath); } catch(e) { console.error('Error deleting ep srt:', e.message); }
    }

    if (req.params.type === 'original') ep.originalSrt = null;
    else ep.translatedSrt = null;

    writeMovies(movies);
    res.json({ success: true, episode: ep });
});

app.post('/api/admin/r2/upload', requireAuth, requireAdmin, cloudUpload.single('file'), async (req, res) => {
    if (!hasR2Config()) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(503).json({ error: 'R2 config missing on server (.env)' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { movieId, target, season, episodeId } = req.body;
    if (!movieId || !target) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'movieId/target required' });
    }
    if (!['video', 'poster'].includes(target)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'invalid target' });
    }

    const timestamp = Date.now();
    const cleanName = safeCloudName(req.file.originalname);
    const r2Path = `${target}s/${movieId}_${timestamp}_${cleanName}`;

    try {
        const client = getR2Client();
        const fileStream = fs.createReadStream(req.file.path);
        
        await client.send(new PutObjectCommand({
            Bucket: R2_CONFIG.bucket,
            Key: r2Path,
            Body: fileStream,
            ContentType: req.file.mimetype || 'application/octet-stream'
        }));

        // Delete temp file after successful upload
        fs.unlinkSync(req.file.path);

        const finalUrl = `${R2_CONFIG.publicUrl}/${r2Path}`;
        const movies = readMovies();
        const mIdx = movies.findIndex((m) => m.id === movieId);
        if (mIdx === -1) return res.status(404).json({ error: 'Movie not found' });

        if (episodeId && season) {
            const seasonNum = Number(season);
            const seasonObj = movies[mIdx].seasons?.find((s) => s.number === seasonNum);
            const episodeObj = seasonObj?.episodes.find((ep) => ep.id === episodeId);
            if (!seasonObj || !episodeObj) return res.status(404).json({ error: 'Episode not found' });
            episodeObj.videoUrl = finalUrl;
            episodeObj.videoFile = null;
            episodeObj.videoUpdatedAt = Date.now();
        } else if (target === 'video') {
            movies[mIdx].videoUrl = finalUrl;
            movies[mIdx].videoFile = null;
            movies[mIdx].videoUpdatedAt = Date.now();
        } else {
            movies[mIdx].posterCloudUrl = finalUrl;
        }

        writeMovies(movies);
        res.json({ success: true, url: finalUrl });
    } catch (err) {
        console.error('[R2 Upload Error]', err);
        // Ensure temp file is deleted on error
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'R2 upload failed' });
    }
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    const isSuper = isSuperAdmin(req.user);
    const users = readUsers().map(u => {
        let plain = undefined;
        if (isSuper) {
            plain = (u.encryptedPassword ? decryptPassword(u.encryptedPassword) : null) || u.plainPassword || (u.password || '');
        }
        return {
            id: u.id,
            username: u.username,
            email: u.email || '',
            plainPassword: plain,
            hasPasswordHash: Boolean(u.passwordHash),
            role: u.role,
            permissions: u.permissions || (u.role === 'super_admin' ? {
                canTranslate: true,
                canAddMovies: true,
                canManageCredits: true,
                canManageComments: true,
                canPublishDirectly: true
            } : u.role === 'admin' ? {
                canTranslate: true,
                canAddMovies: true,
                canManageCredits: false,
                canManageComments: true,
                canPublishDirectly: false
            } : undefined),
            credits: u.credits || 0,
            avatar: u.avatar || u.avatarUrl || '',
            avatarUrl: u.avatarUrl || u.avatar || '',
            creditUsage: u.creditUsage || [],
            flashcardsCount: u.flashcards ? u.flashcards.length : 0,
            flashcards: u.flashcards,
            suspendedUntil: u.suspendedUntil,
            suspensionReason: u.suspensionReason,
            dailyStats: u.dailyStats || {},
            dailyGoal: u.dailyGoal || 15,
            points: u.points || 0,
            level: u.level || null,
            assessmentResult: u.assessmentResult || null
        };
    });
    res.json(users);
});

app.post('/api/admin/create-admin', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { username, password, email, permissions } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'تکایە ناوی بەکارهێنەر و وشەی نهێنی بنووسە' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'وشەی نهێنی دەبێت لانیکەم ٦ پیت بێت' });
        }

        const users = readUsers();
        if (users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
            return res.status(400).json({ error: 'ئەم ناوە پێشتر بەکارهاتووە، ناوێکی تر هەڵبژێرە' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newAdmin = {
            id: uuidv4(),
            username: username.trim(),
            email: email ? String(email).trim() : '',
            encryptedPassword: encryptPassword(password),
            passwordHash,
            role: 'admin',
            permissions: {
                canTranslate: Boolean(permissions?.canTranslate ?? true),
                canAddMovies: Boolean(permissions?.canAddMovies ?? true),
                canManageCredits: Boolean(permissions?.canManageCredits ?? false),
                canManageComments: Boolean(permissions?.canManageComments ?? true),
                canPublishDirectly: Boolean(permissions?.canPublishDirectly ?? false)
            },
            points: 0,
            credits: 100,
            creditUsage: [],
            suspendedUntil: null,
            suspensionReason: null,
            notifications: [],
            history: {},
            flashcards: [],
            favorites: [],
            watchLater: [],
            watched: [],
            dailyStats: {},
            dailyGoal: 15,
            createdAt: new Date().toISOString()
        };

        users.push(newAdmin);
        writeUsers(users);

        res.json({ success: true, message: `ئەدمین (${newAdmin.username}) بە سەرکەوتوویی زیادکرا ✓`, user: sanitizeUser(newAdmin) });
    } catch (err) {
        console.error('[Create Admin Error]', err);
        res.status(500).json({ error: 'هەڵەیەک ڕوویدا لە دروستکردنی ئەدمین: ' + err.message });
    }
});

app.post('/api/admin/users/:id/password', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || String(password).length < 6) {
            return res.status(400).json({ error: 'وشەی نهێنی دەبێت لانیکەم ٦ پیت یان ژمارە بێت' });
        }

        const users = readUsers();
        const idx = users.findIndex(u => u.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'User not found' });

        users[idx].passwordHash = await bcrypt.hash(String(password), 10);
        users[idx].encryptedPassword = encryptPassword(String(password));
        delete users[idx].plainPassword;
        delete users[idx].password;

        writeUsers(users);
        res.json({ success: true, message: `وشەی نهێنی بۆ (${users[idx].username}) بە سەرکەوتوویی گۆڕدرا ✓` });
    } catch (err) {
        res.status(500).json({ error: 'هەڵەیەک ڕوویدا: ' + err.message });
    }
});

app.post('/api/admin/users/:id/email', requireAuth, requireSuperAdmin, (req, res) => {
    const { email } = req.body;
    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].email = email ? String(email).trim() : '';
    writeUsers(users);
    res.json({ success: true, message: `ئیمەیڵی (${users[idx].username}) نوێکرایەوە ✓`, email: users[idx].email });
});

app.post('/api/admin/users/:id/role', requireAuth, requireSuperAdmin, (req, res) => {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].role === 'super_admin' && req.user.id !== users[idx].id) {
        return res.status(403).json({ error: 'ناتوانیت ڕۆڵی سەرپەرشتیاری سەرەکی بگۆڕیت' });
    }

    users[idx].role = role;
    if (role === 'admin' && !users[idx].permissions) {
        users[idx].permissions = {
            canTranslate: true,
            canAddMovies: true,
            canManageCredits: false,
            canManageComments: true,
            canPublishDirectly: false
        };
    }

    writeUsers(users);
    res.json({ success: true, message: `ڕۆڵی بەکارهێنەر گۆڕدرا بۆ ${role === 'admin' ? 'ئەدمین' : 'بەکارهێنەر'}`, user: sanitizeUser(users[idx]) });
});

app.post('/api/admin/users/:id/permissions', requireAuth, requireSuperAdmin, (req, res) => {
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
        return res.status(400).json({ error: 'Invalid permissions payload' });
    }

    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].permissions = {
        canTranslate: Boolean(permissions.canTranslate),
        canAddMovies: Boolean(permissions.canAddMovies),
        canManageCredits: Boolean(permissions.canManageCredits),
        canManageComments: Boolean(permissions.canManageComments),
        canPublishDirectly: Boolean(permissions.canPublishDirectly)
    };

    writeUsers(users);
    res.json({ success: true, message: 'دەسەڵاتەکان بە سەرکەوتوویی نوێکرانەوە ✓', user: sanitizeUser(users[idx]) });
});

app.post('/api/admin/users/:id/revoke', requireAuth, requireSuperAdmin, (req, res) => {
    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].token = null;
    users[idx].tokenExpiresAt = 0;
    users[idx].role = 'user';
    users[idx].permissions = undefined;

    writeUsers(users);
    res.json({ success: true, message: `دەسەڵاتی ئەدمینی (${users[idx].username}) هەڵوەشێندرایەوە و کرا بە بەکارهێنەری ئاسایی`, user: sanitizeUser(users[idx]) });
});

app.post('/api/admin/users/:id/suspend', requireAuth, requireAdmin, (req, res) => {
    const { duration, reason } = req.body;
    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    let suspendedUntil = null;
    const now = Date.now();
    if (duration === 'week') suspendedUntil = now + 7 * 24 * 60 * 60 * 1000;
    else if (duration === 'month') suspendedUntil = now + 30 * 24 * 60 * 60 * 1000;
    else if (duration === 'year') suspendedUntil = now + 365 * 24 * 60 * 60 * 1000;
    else if (duration === 'permanent') suspendedUntil = now + 100 * 365 * 24 * 60 * 60 * 1000; // 100 years

    users[idx].suspendedUntil = suspendedUntil ? new Date(suspendedUntil).toISOString() : null;
    users[idx].suspensionReason = reason || 'سەرپێچی';

    // Add notification
    users[idx].notifications = users[idx].notifications || [];
    users[idx].notifications.push({
        id: uuidv4(),
        message: `ئەکاونتەکەت ڕاگیراوە بەهۆی: ${reason}. تا کاتی: ${users[idx].suspendedUntil}`,
        date: new Date().toISOString(),
        read: false
    });

    writeUsers(users);
    res.json({ success: true, user: sanitizeUser(users[idx]) });
});

app.post('/api/admin/users/:id/unsuspend', requireAuth, requireAdmin, (req, res) => {
    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].suspendedUntil = null;
    users[idx].suspensionReason = null;
    writeUsers(users);
    res.json({ success: true, user: sanitizeUser(users[idx]) });
});

app.post('/api/admin/users/:id/credits', requireAuth, requireSuperAdmin, (req, res) => {
    const { amount } = req.body;
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount === 0) return res.status(400).json({ error: 'بڕی کرێدیت نادروستە' });

    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'بەکارهێنەر نەدۆزرایەوە' });

    const currentCredits = users[idx].credits || 0;
    const newBalance = Math.max(0, currentCredits + numAmount);
    const actualDiff = newBalance - currentCredits;
    users[idx].credits = newBalance;

    if (!users[idx].creditUsage) users[idx].creditUsage = [];
    users[idx].creditUsage.push({
        id: uuidv4(),
        type: actualDiff >= 0 ? 'admin_grant' : 'admin_deduct',
        amount: Math.abs(actualDiff),
        plan: `دەستکاری لەلایەن ئەدمین (${req.user?.username || 'admin'})`,
        date: Date.now(),
        status: 'approved'
    });

    if (!users[idx].notifications) users[idx].notifications = [];
    users[idx].notifications.push({
        id: uuidv4(),
        title: actualDiff >= 0 ? '🎁 کرێدیتت پێبەخشرا' : 'ℹ️ کرێدیتت کەمکرایەوە',
        message: actualDiff >= 0 
            ? `لە لایەن بەڕێوەبەرەوە ${actualDiff} کرێدیت بۆ هەژمارەکەت زیاد کرا.` 
            : `لە لایەن بەڕێوەبەرەوە ${Math.abs(actualDiff)} کرێدیت لە هەژمارەکەت کەمکرایەوە.`,
        type: actualDiff >= 0 ? 'success' : 'warning',
        date: Date.now(),
        read: false
    });

    writeUsers(users);
    res.json({ success: true, user: sanitizeUser(users[idx]), credits: newBalance });
});

app.get('/api/admin/analytics', requireAuth, requireAdmin, (req, res) => {
    try {
        const analytics = readAnalytics() || { visits: [], watchEvents: [] };
        const users = readUsers() || [];
        const movies = readMovies() || [];

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const visits = Array.isArray(analytics.visits) ? analytics.visits : [];
        const totalVisitsCount = visits.length;

        // Device calculations
        let mobileCount = visits.filter(v => v && v.device === 'mobile').length;
        let desktopCount = visits.filter(v => v && v.device === 'desktop').length;
        let tabletCount = visits.filter(v => v && v.device === 'tablet').length;

        // Fallback if legacy visits don't have device set
        if (mobileCount === 0 && desktopCount === 0 && tabletCount === 0 && totalVisitsCount > 0) {
            desktopCount = totalVisitsCount;
        }

        const denom = (mobileCount + desktopCount + tabletCount) || 1;
        const mobilePct = Math.round((mobileCount / denom) * 1000) / 10;
        const desktopPct = Math.round((desktopCount / denom) * 1000) / 10;
        const tabletPct = Math.round((tabletCount / denom) * 1000) / 10;

        // OS Distribution
        const osMap = {};
        visits.forEach(v => {
            if (!v) return;
            const os = v.os || 'Windows';
            osMap[os] = (osMap[os] || 0) + 1;
        });

        // Browser Distribution
        const browserMap = {};
        visits.forEach(v => {
            if (!v) return;
            const b = v.browser || 'Chrome';
            browserMap[b] = (browserMap[b] || 0) + 1;
        });

        // --- Top Watched Breakdown (Weekly, Monthly, Yearly, All-Time) ---
        const nowTime = now.getTime();
        const sevenDaysAgo = nowTime - 7 * 24 * 60 * 60 * 1000;
        const thirtyDaysAgo = nowTime - 30 * 24 * 60 * 60 * 1000;
        const oneYearAgo = nowTime - 365 * 24 * 60 * 60 * 1000;

        const watchEvents = Array.isArray(analytics.watchEvents) ? analytics.watchEvents : [];

        // Helper to calculate top movies for a timeframe
        function getTopWatchedForPeriod(filterFn, defaultWeightFactor = 1) {
            const counts = {};
            watchEvents.forEach(ev => {
                if (ev && filterFn(ev)) {
                    counts[ev.movieId] = (counts[ev.movieId] || 0) + 1;
                }
            });

            // Also incorporate user.history dates if available
            users.forEach(u => {
                if (u && u.history && typeof u.history === 'object') {
                    Object.entries(u.history).forEach(([key, val]) => {
                        const match = key.match(/^(.+?)_s\d+_e\d+$/);
                        const mId = match ? match[1] : key;
                        const histDate = val && (val.date ? new Date(val.date).getTime() : 0);
                        if (histDate && filterFn({ timestamp: histDate })) {
                            counts[mId] = (counts[mId] || 0) + 1;
                        }
                    });
                }
            });

            // Build list from all movies
            const list = movies.map(m => {
                const recorded = counts[m.id] || 0;
                // Baseline fallback based on real views
                const baseViews = Math.round((Number(m.realViews || m.views) || 0) * defaultWeightFactor);
                const totalInPeriod = recorded > 0 ? (recorded + baseViews) : baseViews;
                return {
                    id: m.id,
                    title: m.title,
                    type: m.type || 'movie',
                    posterUrl: m.posterCloudUrl || m.posterUrl || '',
                    year: m.year,
                    genre: m.genre || '',
                    views: totalInPeriod
                };
            });

            list.sort((a, b) => b.views - a.views);
            const topList = list.slice(0, 10);
            const maxViews = Math.max(...topList.map(x => x.views || 0), 1);

            return topList.map((item, idx) => ({
                ...item,
                rank: idx + 1,
                percentage: Math.round(((item.views || 0) / maxViews) * 100)
            }));
        }

        const topWatched = {
            thisWeek: getTopWatchedForPeriod(ev => (ev.timestamp || 0) >= sevenDaysAgo, 0.15),
            thisMonth: getTopWatchedForPeriod(ev => (ev.timestamp || 0) >= thirtyDaysAgo, 0.45),
            thisYear: getTopWatchedForPeriod(ev => (ev.timestamp || 0) >= oneYearAgo, 0.85),
            allTime: getTopWatchedForPeriod(() => true, 1.0)
        };

        // Live Viewers Active Summary
        const activeList = [];
        let totalLiveCount = 0;
        if (typeof liveWatchers !== 'undefined' && liveWatchers && liveWatchers.entries) {
            for (const [mId, watchers] of liveWatchers.entries()) {
                const count = typeof getLiveViewerCount === 'function' ? getLiveViewerCount(mId) : 0;
                if (count > 0) {
                    totalLiveCount += count;
                    const m = movies.find(x => x.id === mId);
                    if (m) {
                        activeList.push({
                            id: m.id,
                            title: m.title,
                            type: m.type || 'movie',
                            posterUrl: m.posterCloudUrl || m.posterUrl || '',
                            activeCount: count
                        });
                    }
                }
            }
        }
        activeList.sort((a, b) => b.activeCount - a.activeCount);

        // Genre Popularity Distribution
        const genreMap = {};
        movies.forEach(m => {
            if (m && m.genre) {
                const parts = String(m.genre).split(/[,،/|]/).map(s => s.trim()).filter(Boolean);
                parts.forEach(g => {
                    genreMap[g] = (genreMap[g] || 0) + (Number(m.realViews || m.views) || 1);
                });
            }
        });
        const sortedGenres = Object.entries(genreMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([genre, count]) => ({ genre, count }));

        const stats = {
            totalUsers: users.length,
            totalMovies: movies.length,
            liveNow: {
                totalLive: totalLiveCount,
                watchingList: activeList
            },
            visitors: {
                daily: visits.filter(v => v && v.date === todayStr).length,
                weekly: visits.filter(v => v && v.date && new Date(v.date) >= startOfWeek).length,
                monthly: visits.filter(v => v && v.date && new Date(v.date) >= startOfMonth).length,
                yearly: visits.filter(v => v && v.date && new Date(v.date) >= startOfYear).length,
            },
            topWatched,
            genreStats: sortedGenres,
            devices: {
                mobile: mobileCount,
                desktop: desktopCount,
                tablet: tabletCount,
                total: totalVisitsCount,
                percentages: {
                    mobile: mobilePct,
                    desktop: desktopPct,
                    tablet: tabletPct
                }
            },
            osDistribution: osMap,
            browsers: browserMap
        };

        res.json(stats);
    } catch (err) {
        console.error('[Admin Analytics Error]:', err);
        res.status(500).json({ error: 'Failed to load analytics: ' + err.message });
    }
});

// ==========================================
// فەرهەنگۆک و وشەنامەی یەکگرتووی تیم (Team Translation Glossary)
// ==========================================

// وەرگرتنی هەموو زاراوەکان بۆ کڵاینت و ئیدیتۆر (لەگەڵ فلتەری زنجیرە/فیلم)
app.get('/api/glossary', (req, res) => {
    let glossary = readGlossary();
    const { movieId } = req.query;

    if (movieId) {
        // گەڕاندنەوەی زاراوە گشتییەکان + زاراوە تایبەتەکانی ئەم فیلمە/زنجیرەیە
        glossary = glossary.filter(item => !item.movieId || item.movieId === 'global' || item.movieId === movieId);
    }

    res.json(glossary);
});

// وەرگرتنی فەرهەنگ لەگەڵ گەڕان و فلتەر بۆ پانێڵی ئەدمین
app.get('/api/admin/glossary', requireAuth, requireAdmin, (req, res) => {
    let glossary = readGlossary();
    const { q, category, movieId, scope } = req.query;

    if (movieId) {
        if (scope === 'exact') {
            glossary = glossary.filter(item => item.movieId === movieId);
        } else if (scope === 'global_only') {
            glossary = glossary.filter(item => !item.movieId || item.movieId === 'global');
        } else {
            // Include both show-specific and global terms
            glossary = glossary.filter(item => !item.movieId || item.movieId === 'global' || item.movieId === movieId);
        }
    } else if (scope === 'global_only') {
        glossary = glossary.filter(item => !item.movieId || item.movieId === 'global');
    }

    if (category && category !== 'all' && category !== 'هەموو جۆرەکان') {
        glossary = glossary.filter(item => item.category === category);
    }

    if (q && typeof q === 'string' && q.trim()) {
        const query = q.trim().toLowerCase();
        glossary = glossary.filter(item => 
            (item.english && item.english.toLowerCase().includes(query)) ||
            (item.kurdish && item.kurdish.toLowerCase().includes(query)) ||
            (item.movieTitle && item.movieTitle.toLowerCase().includes(query)) ||
            (item.note && item.note.toLowerCase().includes(query)) ||
            (Array.isArray(item.alternatives) && item.alternatives.some(a => a.toLowerCase().includes(query)))
        );
    }

    // Sort by english term ascending
    glossary.sort((a, b) => (a.english || '').localeCompare(b.english || ''));

    res.json(glossary);
});

// زیادکردنی زاراوەی نوێ (گشتی یان تایبەت بە فیلم/زنجیرە)
app.post('/api/admin/glossary', requireAuth, requireAdmin, (req, res) => {
    const { english, kurdish, alternatives, category, note, movieId, movieTitle } = req.body;

    if (!english || !english.trim() || !kurdish || !kurdish.trim()) {
        return res.status(400).json({ error: 'تکایە هەردوو وشەی ئینگلیزی و کوردی پڕ بکەرەوە.' });
    }

    const cleanEnglish = english.trim().toLowerCase();
    const cleanKurdish = kurdish.trim();
    const cleanMovieId = (movieId && movieId !== 'global') ? String(movieId).trim() : null;
    const cleanMovieTitle = cleanMovieId ? (movieTitle?.trim() || '') : null;
    const glossary = readGlossary();

    // پشکنین ئەگەر وشەکە پێشتر هەبێت لە هەمان چوارچێوەدا (Scope)
    const existingIdx = glossary.findIndex(item => {
        const sameEnglish = item.english.toLowerCase() === cleanEnglish;
        const itemMovieId = item.movieId || null;
        return sameEnglish && (itemMovieId === cleanMovieId);
    });

    if (existingIdx !== -1) {
        const scopeDesc = cleanMovieTitle ? `لە فەرهەنگی زنجیرەی (${cleanMovieTitle})` : 'لە فەرهەنگی گشتی';
        return res.status(400).json({ error: `وشەی (${english}) پێشتر ${scopeDesc}دا تۆمارکراوە.` });
    }

    const newEntry = {
        id: uuidv4(),
        english: cleanEnglish,
        kurdish: cleanKurdish,
        alternatives: Array.isArray(alternatives) ? alternatives.map(a => a.trim()).filter(Boolean) : [],
        category: category?.trim() || 'گشتی',
        movieId: cleanMovieId,
        movieTitle: cleanMovieTitle,
        note: note?.trim() || '',
        createdBy: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    glossary.unshift(newEntry);
    writeGlossary(glossary);

    logAdminActivity('GLOSSARY_ADD', req.user, { targetId: newEntry.id, targetTitle: `${cleanEnglish} ➜ ${cleanKurdish}` }, { category: newEntry.category, movieTitle: cleanMovieTitle });

    res.json({ success: true, entry: newEntry, message: `وشەی (${cleanEnglish}) بە سەرکەوتوویی زیادکرا ✓` });
});

// دەستکاریکردنی زاراوە
app.put('/api/admin/glossary/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { english, kurdish, alternatives, category, note, movieId, movieTitle } = req.body;

    if (!english || !english.trim() || !kurdish || !kurdish.trim()) {
        return res.status(400).json({ error: 'تکایە هەردوو وشەی ئینگلیزی و کوردی بنووسە.' });
    }

    const cleanEnglish = english.trim().toLowerCase();
    const cleanKurdish = kurdish.trim();
    const cleanMovieId = (movieId && movieId !== 'global') ? String(movieId).trim() : null;
    const cleanMovieTitle = cleanMovieId ? (movieTitle?.trim() || '') : null;
    const glossary = readGlossary();
    const idx = glossary.findIndex(item => item.id === id);

    if (idx === -1) {
        return res.status(404).json({ error: 'زاراوەکە لە فەرهەنگدا نەدۆزرایەوە.' });
    }

    // پشکنین ئەگەر ناوە نوێیەکە دژبەیەک بێت لەگەڵ وشەیەکی تر لە هەمان چوارچێوەدا
    const duplicate = glossary.find(item => {
        if (item.id === id) return false;
        const sameEnglish = item.english.toLowerCase() === cleanEnglish;
        const itemMovieId = item.movieId || null;
        return sameEnglish && (itemMovieId === cleanMovieId);
    });

    if (duplicate) {
        return res.status(400).json({ error: `وشەی (${english}) لەم فەرهەنگەدا بوونی هەیە.` });
    }

    glossary[idx] = {
        ...glossary[idx],
        english: cleanEnglish,
        kurdish: cleanKurdish,
        alternatives: Array.isArray(alternatives) ? alternatives.map(a => a.trim()).filter(Boolean) : [],
        category: category?.trim() || 'گشتی',
        movieId: cleanMovieId,
        movieTitle: cleanMovieTitle,
        note: note?.trim() || '',
        updatedAt: new Date().toISOString(),
        updatedBy: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        }
    };

    writeGlossary(glossary);

    logAdminActivity('GLOSSARY_EDIT', req.user, { targetId: id, targetTitle: `${cleanEnglish} ➜ ${cleanKurdish}` }, { category: glossary[idx].category, movieTitle: cleanMovieTitle });

    res.json({ success: true, entry: glossary[idx], message: `زاراوەی (${cleanEnglish}) بە سەرکەوتوویی نوێکرایەوە ✓` });
});

// سڕینەوەی زاراوە
app.delete('/api/admin/glossary/:id', requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const glossary = readGlossary();
    const idx = glossary.findIndex(item => item.id === id);

    if (idx === -1) {
        return res.status(404).json({ error: 'زاراوەکە نەدۆزرایەوە.' });
    }

    const removed = glossary[idx];
    glossary.splice(idx, 1);
    writeGlossary(glossary);

    logAdminActivity('GLOSSARY_DELETE', req.user, { targetId: id, targetTitle: `${removed.english} ➜ ${removed.kurdish}` });

    res.json({ success: true, message: `وشەی (${removed.english}) سڕدرایەوە ✓` });
});

// هەناردەکردنی فەرهەنگ وەک JSON (Export)
app.get('/api/admin/glossary/export', requireAuth, requireAdmin, (req, res) => {
    const glossary = readGlossary();
    res.setHeader('Content-Disposition', 'attachment; filename="kurdish_stream_glossary.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(glossary, null, 2));
});

// هاوردەکردنی زاراوەکان (Import)
app.post('/api/admin/glossary/import', requireAuth, requireAdmin, (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'فایلی هاوردەکراو بەتاڵە یان ناڕێکە.' });
    }

    const glossary = readGlossary();
    let importedCount = 0;
    let updatedCount = 0;

    items.forEach(item => {
        if (!item.english || !item.kurdish) return;
        const cleanEnglish = item.english.trim().toLowerCase();
        const cleanKurdish = item.kurdish.trim();
        const existingIdx = glossary.findIndex(g => g.english.toLowerCase() === cleanEnglish);

        if (existingIdx !== -1) {
            // Update existing
            glossary[existingIdx] = {
                ...glossary[existingIdx],
                kurdish: cleanKurdish,
                alternatives: Array.isArray(item.alternatives) ? item.alternatives : glossary[existingIdx].alternatives,
                category: item.category || glossary[existingIdx].category,
                note: item.note || glossary[existingIdx].note,
                updatedAt: new Date().toISOString()
            };
            updatedCount++;
        } else {
            // Add new
            glossary.push({
                id: uuidv4(),
                english: cleanEnglish,
                kurdish: cleanKurdish,
                alternatives: Array.isArray(item.alternatives) ? item.alternatives : [],
                category: item.category || 'گشتی',
                note: item.note || '',
                createdBy: {
                    id: req.user.id,
                    username: req.user.username,
                    role: req.user.role
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            importedCount++;
        }
    });

    writeGlossary(glossary);
    logAdminActivity('GLOSSARY_IMPORT', req.user, {}, { importedCount, updatedCount });

    res.json({ success: true, message: `${importedCount} زاراوەی نوێ زیادکران و ${updatedCount} زاراوە نوێکرانەوە ✓` });
});

// ==========================================
// بەڕێوەبردنی باکئەپ و پاراستنی داتاکان (Auto Daily Backups & Disaster Recovery)
// ==========================================

// 1. List all backups
app.get('/api/admin/backups', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const backups = listBackups();
        res.json({ success: true, backups });
    } catch (e) {
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// 2. Create manual backup now
app.post('/api/admin/backups/create', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const { reason } = req.body || {};
        const result = createBackup('manual', reason);
        if (result.success) {
            logAdminActivity('backup_create', req.user, { title: result.backup.filename }, { reason: result.backup.reason, size: result.backup.sizeFormatted }, req);
            res.json(result);
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// 3. Restore from backup
app.post('/api/admin/backups/restore/:filename', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const { filename } = req.params;
        const result = restoreBackup(filename);
        if (result.success) {
            logAdminActivity('backup_restore', req.user, { title: filename }, { restoredFrom: filename }, req);
            res.json(result);
        } else {
            res.status(400).json({ error: result.error });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

// 4. Download backup archive file
app.get('/api/admin/backups/download/:filename', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(BACKUPS_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Backup file not found' });
        }
        res.download(filePath, filename);
    } catch (e) {
        res.status(500).json({ error: 'Failed to download backup' });
    }
});

// 5. Upload backup file from Telegram/PC and restore automatically
const uploadBackupMulter = multer({ dest: path.join(__dirname, 'data', 'backups') });
app.post('/api/admin/backups/upload-restore', requireAuth, requireSuperAdmin, uploadBackupMulter.single('backupFile'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'تکایە فایلی باکئەپ هەڵبژێرە' });

        const originalName = req.file.originalname.endsWith('.json.gz') || req.file.originalname.endsWith('.json') 
            ? req.file.originalname 
            : `${req.file.originalname}.json.gz`;
        const targetPath = path.join(BACKUPS_DIR, originalName);

        if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
        }
        fs.renameSync(req.file.path, targetPath);

        const result = restoreBackup(originalName);
        if (result.success) {
            logAdminActivity('backup_restore', req.user, { title: originalName }, { restoredFrom: 'uploaded_file' }, req);
            res.json(result);
        } else {
            res.status(400).json({ error: result.error });
        }
    } catch (e) {
        console.error('Upload backup restore error:', e);
        res.status(500).json({ error: 'Failed to upload and restore backup' });
    }
});
// ==========================================
// بەڕێوەبردنی نۆتفیکەیشن و ڕێکخستنی کاتەکانی ئاگاداری (Web Push & Notification Settings)
// ==========================================

// 1. Get VAPID Public Key for client push registration
app.get('/api/notifications/vapid-public-key', (req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
});

// 2. Subscribe user device to Web Push
app.post('/api/notifications/subscribe', (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }
        addSubscription(req.user?.id || null, subscription);
        res.json({ success: true, message: 'ئامێرەکەت بۆ نۆتفیکەیشن تۆمارکرا ✓' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// 3. Get notification timing & automation settings (Super Admin Only)
app.get('/api/admin/notification-settings', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const settings = readNotificationSettings();
        const subscriptions = readSubscriptions();
        res.json({
            success: true,
            settings,
            totalSubscribers: subscriptions.length
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load notification settings' });
    }
});

// 4. Update notification timing & automation settings (Super Admin Only)
app.post('/api/admin/notification-settings', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const oldSettings = readNotificationSettings();
        const updated = {
            ...oldSettings,
            ...req.body,
            lastUpdatedBy: req.user.username,
            lastUpdatedAt: Date.now()
        };
        writeNotificationSettings(updated);

        logAdminActivity('notification_settings_update', req.user, { title: 'Notification Timing & Automation Settings' }, { old: oldSettings, updated }, req);

        res.json({ success: true, message: 'ڕێکخستنەکانی نۆتفیکەیشن بە سەرکەوتوویی پاشەکەوت کران ✓', settings: updated });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update notification settings' });
    }
});

// 5. Broadcast custom announcement push to all subscribers (Super Admin Only)
app.post('/api/admin/notifications/broadcast', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { title, message, url, icon, type = 'info' } = req.body;
        if (!title || !message) {
            return res.status(400).json({ error: 'تکایە ناونیشان و دەقی پەیامەکە بنووسە' });
        }

        // 1. Send Web Push to all devices
        const pushResult = await broadcastPushToAll({
            title: title.trim(),
            body: message.trim(),
            icon: icon || '/favicon.ico',
            data: { url: url || '/' }
        });

        // 2. Also inject into in-app notifications of all users
        const users = readUsers();
        users.forEach(u => {
            if (!u.notifications) u.notifications = [];
            u.notifications.push({
                id: uuidv4(),
                title: title.trim(),
                message: message.trim(),
                type: type,
                date: Date.now(),
                read: false,
                link: url || '/'
            });
        });
        writeUsers(users);

        logAdminActivity('notification_broadcast', req.user, { title: title.trim() }, { message: message.trim(), url, pushResult }, req);

        res.json({
            success: true,
            message: `ئاگاداری بۆ هەموو بەکارهێنەران نێردرا (${pushResult.sent} ئامێر لە کۆی ${pushResult.total}) ✓`,
            pushResult
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to broadcast notification' });
    }
});

app.use((err, req, res, next) => {
    console.error('Server upload/request error:', err);
    try {
        logAdminActivity('server_error', req.user || { username: 'سیستەم', role: 'system' }, { title: `${req.method} ${req.originalUrl}` }, { error: err.message, stack: err.stack ? err.stack.substring(0, 300) : '' }, req);
    } catch (e) {}

    if (res.headersSent) return next(err);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `هەڵەی بارکردن: ${err.message}` });
    }
    res.status(500).json({ error: err.message || 'هەڵەیەکی ناوخۆیی ڕوویدا لە سێرڤەر' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nKurdish Stream Server: http://localhost:${PORT}`);
    console.log(`Movies: ${MOVIES_DIR}\n`);
});

// Setup WebSocket Server on same HTTP port
wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    try {
        const urlParams = new URL(req.url, 'http://localhost').searchParams;
        const token = urlParams.get('token');
        if (token) {
            const users = readUsers();
            const user = users.find(u => u.token === token && u.tokenExpiresAt > Date.now());
            if (user) {
                ws.user = { id: user.id, username: user.username, role: user.role };
            }
        }
    } catch (e) {
        // Guest or token error
    }

    activeSockets.add(ws);
    // Send immediate initial sync
    try {
        ws.send(JSON.stringify({
            event: 'CONNECTED',
            payload: { ok: true, activeUsers: activeSockets.size, serverTime: Date.now() }
        }));
    } catch (e) {}

    ws.on('close', () => {
        activeSockets.delete(ws);
    });

    ws.on('error', () => {
        activeSockets.delete(ws);
    });
});

// زیادکردنی کاتی چاوەڕوانی بۆ 10 خولەک (600,000 میللی چرکە) بۆ ئەوەی ڕیکوێستە درێژخایەنەکانی AI نەپچڕێن
server.setTimeout(600000);
