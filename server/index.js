const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MOVIES_DIR = path.join(__dirname, '..', 'uploads', 'movies');
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

if (!fs.existsSync(MOVIES_DIR)) fs.mkdirSync(MOVIES_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

app.use(cors());
app.use(express.json({ limit: '20mb' }));

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
        role: u.role || (!hasAdmin && users[0]?.id === u.id ? 'admin' : 'user'),
        points: u.points || 0,
        history: u.history || {},
        flashcards: Array.isArray(u.flashcards) ? u.flashcards : []
    }));
};

const writeUsers = (data) => fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));

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
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 } // 1GB
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

    const { points, history, flashcards } = req.body;
    if (points !== undefined) users[idx].points = (users[idx].points || 0) + Number(points || 0);
    if (history && typeof history === 'object') users[idx].history = { ...users[idx].history, ...history };
    if (Array.isArray(flashcards)) users[idx].flashcards = flashcards;

    writeUsers(users);
    res.json({ success: true, points: users[idx].points, user: sanitizeUser(users[idx]) });
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

// ======= ADMIN Routes =======
app.post('/api/admin/movies', requireAuth, requireAdmin, (req, res) => {
    const { title, description, genre, year, duration, type } = req.body;
    const id = uuidv4();
    fs.mkdirSync(path.join(MOVIES_DIR, id), { recursive: true });

    const movies = readMovies();
    const newItem = {
        id,
        title: title || 'بێ ناو',
        description: description || '',
        genre: genre || '',
        year: +year || new Date().getFullYear(),
        duration: duration || '',
        posterUrl: '',
        posterCloudUrl: null,
        videoFile: null,
        videoUrl: null,
        originalSrt: null,
        translatedSrt: null,
        type: type || 'movie',
        seasons: type === 'series' ? [] : undefined,
        createdAt: Date.now()
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
    const newSeason = {
        id: uuidv4(),
        number: seasons.length + 1,
        title: req.body.title || `سیزنی ${seasons.length + 1}`,
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
    const newEp = {
        id: uuidv4(),
        number: eps.length + 1,
        title: req.body.title || `ئالقەی ${eps.length + 1}`,
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
    for (let i = 0; i < count; i++) {
        const eps = movies[idx].seasons[sIdx].episodes;
        const num = eps.length + 1;
        const newEp = {
            id: uuidv4(),
            number: num,
            title: `ئالقەی ${num}`,
            description: '',
            duration: '',
            videoFile: null,
            videoUrl: null,
            originalSrt: null,
            translatedSrt: null
        };
        movies[idx].seasons[sIdx].episodes.push(newEp);
        created.push(newEp);
        const epDir = path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${num}`);
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
        return res.status(503).json({ error: 'R2 config missing on server (.env)' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { movieId, target, season, episodeId } = req.body;
    if (!movieId || !target) return res.status(400).json({ error: 'movieId/target required' });
    if (!['video', 'poster'].includes(target)) return res.status(400).json({ error: 'invalid target' });

    const timestamp = Date.now();
    const cleanName = safeCloudName(req.file.originalname);
    const r2Path = `${target}s/${movieId}_${timestamp}_${cleanName}`;

    try {
        const client = getR2Client();
        await client.send(new PutObjectCommand({
            Bucket: R2_CONFIG.bucket,
            Key: r2Path,
            Body: req.file.buffer,
            ContentType: req.file.mimetype || 'application/octet-stream'
        }));

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
        res.status(500).json({ error: 'R2 upload failed' });
    }
});

app.listen(PORT, () => {
    console.log(`\nKurdish Stream Server: http://localhost:${PORT}`);
    console.log(`Movies: ${MOVIES_DIR}\n`);
});
