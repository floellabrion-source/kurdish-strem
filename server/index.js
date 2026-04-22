const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
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
const PORT = process.env.PORT || 3001;
const OMDB_API_KEY = process.env.OMDB_API_KEY || 'e027208c'; // Fallback if .env fails
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MOVIES_DIR = path.join(__dirname, '..', 'uploads', 'movies');
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const ANALYTICS_FILE = path.join(__dirname, 'data', 'analytics.json');

if (!fs.existsSync(MOVIES_DIR)) fs.mkdirSync(MOVIES_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(ANALYTICS_FILE)) fs.writeFileSync(ANALYTICS_FILE, JSON.stringify({ visits: [] }));

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Analytics middleware
app.use((req, res, next) => {
    // Only track non-API and specific API routes if desired, but here we track generic visits
    // Let's say we only track if it's not a static asset
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // We can debounce this to avoid writing to file on every request.
    // But since it's a small app, we'll do it simple. We only track distinct IPs per day.
    const analytics = readAnalytics();
    if (!analytics.visits) analytics.visits = [];
    
    const existingVisit = analytics.visits.find(v => v.ip === ip && v.date === today);
    if (!existingVisit) {
        analytics.visits.push({ ip, date: today, timestamp: Date.now() });
        writeAnalytics(analytics);
    }
    next();
});

const readMovies = () => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return data.map((m) => ({
        ...m,
        type: m.type || 'movie',
        posterCloudUrl: m.posterCloudUrl || null,
        videoUrl: m.videoUrl || null
    }));
};

const writeMovies = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

const readUsers = () => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    const hasAdmin = users.some((u) => u.role === 'admin');
    return users.map((u) => ({
        ...u,
        role: hasAdmin ? (u.role || 'user') : (users[0]?.id === u.id ? 'admin' : 'user'),
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
        dailyStats: u.dailyStats || {}
    }));
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

const sanitizeUser = (user) => {
    const { password, passwordHash, ...safe } = user;
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
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    if (user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()) {
        return res.status(403).json({ error: `ئەکاونتەکەت ڕاگیراوە بەهۆی: ${user.suspensionReason || 'سەرپێچی'} تا کاتی: ${new Date(user.suspendedUntil).toLocaleString()}` });
    }

    req.user = user;
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
    }
    next();
};

const makeStorage = (getDir, getFilename) => multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = getDir(req);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => cb(null, getFilename(req, file))
    })
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

// ======= AUTH Endpoints =======
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بەتاڵە' });
    if (String(password).length < 6) return res.status(400).json({ error: 'وشەی نهێنی دەبێت لانیکەم 6 پیت بێت' });

    const users = readUsers();
    if (users.find((u) => u.username === username)) return res.status(400).json({ error: 'ئەم ناوە گیراوە' });

    const firstUserIsAdmin = users.length === 0;
    const newUser = {
        id: uuidv4(),
        username,
        passwordHash: await bcrypt.hash(password, 10),
        role: firstUserIsAdmin ? 'admin' : 'user',
        points: 0,
        history: {},
        flashcards: []
    };
    issueToken(newUser);
    users.push(newUser);
    writeUsers(users);

    res.json({ token: newUser.token, user: sanitizeUser(newUser) });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const users = readUsers();
    const user = users.find((u) => u.username === username);
    if (!user) return res.status(401).json({ error: 'ناو یان وشەی نهێنی هەڵەیە' });

    let isValid = false;
    if (user.passwordHash) {
        isValid = await bcrypt.compare(password, user.passwordHash);
    } else if (user.password) {
        // Legacy plaintext migration path.
        isValid = user.password === password;
        if (isValid) {
            user.passwordHash = await bcrypt.hash(password, 10);
            delete user.password;
        }
    }

    if (!isValid) return res.status(401).json({ error: 'ناو یان وشەی نهێنی هەڵەیە' });

    if (user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()) {
        return res.status(403).json({ error: `ئەکاونتەکەت ڕاگیراوە بەهۆی: ${user.suspensionReason || 'سەرپێچی'} تا کاتی: ${new Date(user.suspendedUntil).toLocaleString()}` });
    }

    issueToken(user);
    writeUsers(users);
    res.json({ token: user.token, user: sanitizeUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
});

app.post('/api/user/sync', requireAuth, (req, res) => {
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const { points, history, flashcards, watchMinutes, sentencesSeen } = req.body;
    if (points !== undefined) users[idx].points = (users[idx].points || 0) + Number(points || 0);
    if (history && typeof history === 'object') users[idx].history = { ...users[idx].history, ...history };
    if (Array.isArray(flashcards)) users[idx].flashcards = flashcards;

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

// ======= OpenRouter AI =======
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

const toGeminiLikeResponse = (openRouterData) => {
    const text = openRouterData?.choices?.[0]?.message?.content || '';
    return {
        candidates: [
            {
                content: {
                    parts: [{ text }]
                }
            }
        ],
        provider: 'openrouter',
        model: OPENROUTER_MODEL
    };
};

const callOpenRouter = async (input) => {
    const prompt = extractPrompt(input);
    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3001',
            'X-Title': 'Kurdish Stream'
        },
        body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    const responseText = await response.text();
    let data;
    try {
        data = JSON.parse(responseText);
    } catch {
        data = { raw: responseText };
    }

    if (!response.ok) {
        const apiMessage = data?.error?.message || responseText || 'Unknown OpenRouter API error';
        console.error(`[OpenRouter Error] ${apiMessage}`);
        const err = new Error(apiMessage);
        err.status = response.status;
        err.data = data;
        throw err;
    }

    return toGeminiLikeResponse(data);
};

app.post('/api/ai/generate', async (req, res) => {
    console.log('AI Route Hit!');
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const hasContents = Array.isArray(req.body?.contents);
    if (!prompt && !hasContents) {
        return res.status(400).json({ error: { message: 'Send either { prompt } or { contents }' } });
    }

    if (!OPENROUTER_API_KEY) {
        return res.status(503).json({ error: { message: 'OPENROUTER_API_KEY is missing in server .env' } });
    }

    try {
        const data = await callOpenRouter(hasContents ? req.body : prompt);
        res.json(data);
    } catch (error) {
        const status = Number(error?.status) || 500;
        res.status(status).json(error?.data || { error: { message: error.message || 'AI request failed' } });
    }
});

app.get('/api/movies', (req, res) => res.json(readMovies()));

app.get('/api/movies/:id', (req, res) => {
    const movie = readMovies().find((m) => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });
    res.json(movie);
});

app.get('/api/stream/:id', (req, res) => {
    const movies = readMovies();
    const movie = movies.find((m) => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });

    let videoPath;
    const { s, e } = req.query;
    if (s && e && movie.seasons) {
        const season = movie.seasons.find((se) => se.number === parseInt(s, 10));
        const episode = season?.episodes.find((ep) => ep.number === parseInt(e, 10));
        if (!episode?.videoFile) return res.status(404).json({ error: 'Episode video not found' });
        videoPath = path.join(MOVIES_DIR, movie.id, 'seasons', `s${s}`, `e${e}`, episode.videoFile);
    } else {
        if (!movie.videoFile) return res.status(404).json({ error: 'No video' });
        videoPath = path.join(MOVIES_DIR, movie.id, movie.videoFile);
    }

    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Video file missing on disk' });

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(videoPath).toLowerCase();
    const contentType = videoMimeByExt[ext] || 'application/octet-stream';

    if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
        const chunkSize = end - start + 1;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType
        });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
        return;
    }

    res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': contentType });
    fs.createReadStream(videoPath).pipe(res);
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
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
        const p = path.join(dir, 'poster' + ext);
        if (fs.existsSync(p)) return res.sendFile(p);
    }
    res.status(404).json({ error: 'No poster' });
});

// ======= OMDb API Endpoint =======

async function translateText(text, targetLang) {
    if (!text || text === 'N/A') return '';
    try {
        const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
        if (res.data && res.data[0]) {
            return res.data[0].map(x => x[0]).join('');
        }
    } catch(e) { console.error(`Translation error to ${targetLang}:`, e.message); }
    return text;
}

app.get('/api/omdb-rating', requireAuth, requireAdmin, async (req, res) => {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: 'پێویستە ناوی فیلمەکە بنێریت' });
    
    // Remove the strict check for OMDB_API_KEY since we have a fallback key
    // if (!OMDB_API_KEY) return res.status(500).json({ error: 'OMDB_API_KEY لەسەر سێرڤەر دانەنراوە' });

    try {
        // Handle potentially missing API key
        const actualKey = OMDB_API_KEY && OMDB_API_KEY.trim() !== '' ? OMDB_API_KEY : 'e027208c';
        
        const url = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${actualKey}`;
        console.log(`[OMDb API] Fetching: ${url.replace(actualKey, '***')}`);
        
        const response = await axios.get(url);
        
        if (response.data.Response === 'True') {
            const imdbRating = parseFloat(response.data.imdbRating);
            const data = response.data;
            
            let mappedType = data.Type === 'series' ? 'series' : 'movie';
            if (data.Genre && data.Genre.includes('Animation')) mappedType = 'animation';

            let seasonsData = [];
            if (mappedType === 'series' && data.totalSeasons && !isNaN(parseInt(data.totalSeasons))) {
                const totalS = parseInt(data.totalSeasons);
                const limit = Math.min(totalS, 20); // Limit to max 20 seasons to avoid timeout
                for (let i = 1; i <= limit; i++) {
                    try {
                        const sRes = await axios.get(`http://www.omdbapi.com/?t=${encodeURIComponent(title)}&Season=${i}&apikey=${actualKey}`);
                        if (sRes.data.Response === 'True' && sRes.data.Episodes) {
                            let maxEpNum = 0;
                            sRes.data.Episodes.forEach(ep => {
                                const num = parseInt(ep.Episode) || 0;
                                if (num > maxEpNum) maxEpNum = num;
                            });

                            const episodes = [];
                            for (let eNum = 1; eNum <= maxEpNum; eNum++) {
                                const omdbEp = sRes.data.Episodes.find(ep => parseInt(ep.Episode) === eNum);
                                episodes.push({
                                    id: uuidv4(),
                                    number: eNum,
                                    title: omdbEp && omdbEp.Title !== 'N/A' ? omdbEp.Title : `ئەڵقەی ${eNum}`,
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
                                number: i,
                                title: `سیزنی ${i}`,
                                episodes: episodes
                            });
                        }
                    } catch(e) { console.error('OMDb Season Fetch Error:', e.message); }
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
                    // Ongoing series has a dash but no end year like "2008–"
                    endYearVal = null;
                } else {
                    // Just one year, might be finished or movie
                    endYearVal = mappedType === 'series' ? yearVal : null;
                }
            }

            res.json({ 
                imdbRating: isNaN(imdbRating) ? null : imdbRating,
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
                seasons: seasonsData,
                language: data.Language && data.Language !== 'N/A' ? data.Language : ''
            });
        } else {
            res.status(404).json({ error: response.data.Error || 'فیلمەکە نەدۆزرایەوە لە OMDb' });
        }
    } catch (error) {
        console.error('[OMDb API Error]:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
            console.error('Response Status:', error.response.status);
            
            if (error.response.status === 401) {
                return res.status(401).json({ error: 'کێشە لە API Key هەیە (Unauthorized). دڵنیابە کلیلەکە ڕاستە و چالاککراوە.' });
            }
        }
        res.status(500).json({ error: `کێشەیەک لە پەیوەندیکردن بە OMDb API ڕوویدا: ${error.message}` });
    }
});

// ======= ADMIN Routes =======
app.post('/api/admin/movies', requireAuth, requireAdmin, (req, res) => {
    const { title, description, descriptionKu, descriptionEn, descriptionAr, language, genre, year, endYear, duration, type, imdbRating, posterUrl, seasons } = req.body;
    const id = uuidv4();
    fs.mkdirSync(path.join(MOVIES_DIR, id), { recursive: true });

    const movies = readMovies();
    const newItem = {
        id,
        title: title || 'بێ ناو',
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
        imdbRating: imdbRating || null
    };
    movies.push(newItem);
    writeMovies(movies);
    res.json(newItem);
});

app.put('/api/admin/movies/:id', requireAuth, requireAdmin, (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    movies[idx] = { ...movies[idx], ...req.body };
    writeMovies(movies);
    res.json(movies[idx]);
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
app.post('/api/admin/movies/:id/video', requireAuth, requireAdmin, videoUpload.single('video'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    movies[idx].videoFile = req.file.filename;
    writeMovies(movies);
    res.json({ success: true });
});

const posterUpload = makeStorage(
    (req) => path.join(MOVIES_DIR, req.params.id),
    (req, file) => 'poster' + path.extname(file.originalname)
);
app.post('/api/admin/movies/:id/poster', requireAuth, requireAdmin, posterUpload.single('poster'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    movies[idx].posterUrl = `/api/poster/${req.params.id}`;
    writeMovies(movies);
    res.json({ success: true });
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
app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes/:episodeNum/video', requireAuth, requireAdmin, epVideoUpload.single('video'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const sIdx = movies[idx].seasons.findIndex((s) => s.number === parseInt(req.params.seasonNum, 10));
    if (sIdx === -1) return res.status(404).json({ error: 'Season not found' });
    const eIdx = movies[idx].seasons[sIdx].episodes.findIndex((e) => e.number === parseInt(req.params.episodeNum, 10));
    if (eIdx === -1) return res.status(404).json({ error: 'Episode not found' });
    movies[idx].seasons[sIdx].episodes[eIdx].videoFile = req.file.filename;
    writeMovies(movies);
    res.json({ success: true });
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
        } else if (target === 'video') {
            movies[mIdx].videoUrl = finalUrl;
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
    const users = readUsers().map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        credits: u.credits || 0,
        creditUsage: u.creditUsage || [],
        flashcardsCount: u.flashcards ? u.flashcards.length : 0,
        flashcards: u.flashcards || [],
        suspendedUntil: u.suspendedUntil,
        suspensionReason: u.suspensionReason,
        dailyStats: u.dailyStats || {}
    }));
    res.json(users);
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

app.post('/api/admin/users/:id/credits', requireAuth, requireAdmin, (req, res) => {
    const { amount } = req.body;
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const users = readUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].credits = (users[idx].credits || 0) + numAmount;
    writeUsers(users);
    res.json({ success: true, user: sanitizeUser(users[idx]) });
});

app.get('/api/admin/analytics', requireAuth, requireAdmin, (req, res) => {
    const analytics = readAnalytics();
    const users = readUsers();
    const movies = readMovies();

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const weekStr = startOfWeek.toISOString().split('T')[0];

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStr = startOfMonth.toISOString().split('T')[0];

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const yearStr = startOfYear.toISOString().split('T')[0];

    const visits = analytics.visits || [];

    const stats = {
        totalUsers: users.length,
        totalMovies: movies.length,
        visitors: {
            daily: visits.filter(v => v.date === todayStr).length,
            weekly: visits.filter(v => new Date(v.date) >= startOfWeek).length,
            monthly: visits.filter(v => new Date(v.date) >= startOfMonth).length,
            yearly: visits.filter(v => new Date(v.date) >= startOfYear).length,
        }
    };

    res.json(stats);
});

app.listen(PORT, () => {
    console.log(`\nKurdish Stream Server: http://localhost:${PORT}`);
    console.log(`Movies: ${MOVIES_DIR}\n`);
});
