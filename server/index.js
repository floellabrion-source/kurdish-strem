const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const app = express();
const PORT = 3001;

const MOVIES_DIR = path.join(__dirname, '..', 'uploads', 'movies');
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

if (!fs.existsSync(MOVIES_DIR)) fs.mkdirSync(MOVIES_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

app.use(cors());
app.use(express.json());

const readMovies = () => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return data.map(m => ({ ...m, type: m.type || 'movie' }));
};
const writeMovies = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
const writeUsers = (data) => fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));

const getUser = (req) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;
    return readUsers().find(u => u.token === token);
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

// ======= AUTH Endpoints =======
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بەتاڵە' });

    let users = readUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'ئەم ناوە گیراوە' });

    const newUser = {
        id: uuidv4(),
        username,
        password, // Usually hashed, but fine for local
        token: uuidv4() + uuidv4(),
        points: 0,
        history: {},
        flashcards: []
    };
    users.push(newUser);
    writeUsers(users);
    
    // Safety: exclude password
    const { password: _, ...userSafe } = newUser;
    res.json({ token: newUser.token, user: userSafe });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    let users = readUsers();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) return res.status(401).json({ error: 'ناو یان وشەی نهێنی هەڵەیە' });
    
    user.token = uuidv4() + uuidv4(); // Reset token on login
    writeUsers(users);

    const { password: _, ...userSafe } = user;
    res.json({ token: user.token, user: userSafe });
});

app.get('/api/auth/me', (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { password: _, ...userSafe } = user;
    res.json({ user: userSafe });
});

app.post('/api/user/sync', (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let users = readUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const { points, history, flashcards } = req.body;
    if (points !== undefined) users[idx].points = (users[idx].points || 0) + points;
    if (history) users[idx].history = { ...users[idx].history, ...history };
    if (flashcards) users[idx].flashcards = flashcards;

    writeUsers(users);
    res.json({ success: true, points: users[idx].points });
});

// ======= GET all movies =======
app.get('/api/movies', (req, res) => res.json(readMovies()));

// ======= GET single movie =======
app.get('/api/movies/:id', (req, res) => {
    const m = readMovies().find(m => m.id === req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.json(m);
});

// ======= STREAM video =======
app.get('/api/stream/:id', (req, res) => {
    const movies = readMovies();
    const movie = movies.find(m => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });

    let videoPath;
    const { s, e } = req.query;

    if (s && e && movie.seasons) {
        // Series episode
        const season = movie.seasons.find(se => se.number === parseInt(s));
        const episode = season?.episodes.find(ep => ep.number === parseInt(e));
        if (!episode?.videoFile) return res.status(404).json({ error: 'Episode video not found' });
        videoPath = path.join(MOVIES_DIR, movie.id, 'seasons', `s${s}`, `e${e}`, episode.videoFile);
    } else {
        // Movie
        if (!movie.videoFile) return res.status(404).json({ error: 'No video' });
        videoPath = path.join(MOVIES_DIR, movie.id, movie.videoFile);
    }

    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Video file missing on disk' });

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
        const chunkSize = end - start + 1;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
        });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
        fs.createReadStream(videoPath).pipe(res);
    }
});

// ======= GET subtitle =======
app.get('/api/subtitle/:id/:type', (req, res) => {
    const movie = readMovies().find(m => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });

    const srtFile = req.params.type === 'original' ? movie.originalSrt : movie.translatedSrt;
    if (!srtFile) return res.status(404).json({ error: 'No subtitle' });

    const srtPath = path.join(MOVIES_DIR, movie.id, srtFile);
    if (!fs.existsSync(srtPath)) return res.status(404).json({ error: 'File missing' });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(srtPath);
});

// ======= GET episode subtitle =======
app.get('/api/subtitle/:id', (req, res) => {
    const movie = readMovies().find(m => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });

    const { s, e, type } = req.query;
    if (!s || !e) return res.status(400).json({ error: 'Missing season/episode' });

    const season = movie.seasons?.find(se => se.number === parseInt(s));
    const episode = season?.episodes.find(ep => ep.number === parseInt(e));
    if (!episode) return res.status(404).json({ error: 'Episode not found' });

    const srtFile = type === 'original' ? episode.originalSrt : episode.translatedSrt;
    if (!srtFile) return res.status(404).json({ error: 'No subtitle' });

    const srtPath = path.join(MOVIES_DIR, movie.id, 'seasons', `s${s}`, `e${e}`, srtFile);
    if (!fs.existsSync(srtPath)) return res.status(404).json({ error: 'File missing' });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(srtPath);
});

// ======= POSTER =======
app.get('/api/poster/:id', (req, res) => {
    const dir = path.join(MOVIES_DIR, req.params.id);
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
        const p = path.join(dir, 'poster' + ext);
        if (fs.existsSync(p)) return res.sendFile(p);
    }
    res.status(404).json({ error: 'No poster' });
});

// ======= CREATE movie/series =======
app.post('/api/admin/movies', (req, res) => {
    const { title, description, genre, year, duration, type } = req.body;
    const id = uuidv4();
    fs.mkdirSync(path.join(MOVIES_DIR, id), { recursive: true });

    const movies = readMovies();
    const newItem = {
        id, title: title || 'بێ ناو', description: description || '',
        genre: genre || '', year: +year || new Date().getFullYear(),
        duration: duration || '', posterUrl: '', videoFile: null,
        originalSrt: null, translatedSrt: null,
        type: type || 'movie',
        seasons: type === 'series' ? [] : undefined,
        createdAt: Date.now()
    };
    movies.push(newItem);
    writeMovies(movies);
    res.json(newItem);
});

// ======= UPDATE movie =======
app.put('/api/admin/movies/:id', (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    movies[idx] = { ...movies[idx], ...req.body };
    writeMovies(movies);
    res.json(movies[idx]);
});

// ======= DELETE movie =======
app.delete('/api/admin/movies/:id', (req, res) => {
    let movies = readMovies();
    const dir = path.join(MOVIES_DIR, req.params.id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    movies = movies.filter(m => m.id !== req.params.id);
    writeMovies(movies);
    res.json({ success: true });
});

// ======= UPLOAD video (movie) =======
const videoUpload = makeStorage(
    req => path.join(MOVIES_DIR, req.params.id),
    (req, file) => 'video' + path.extname(file.originalname)
);
app.post('/api/admin/movies/:id/video', videoUpload.single('video'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    movies[idx].videoFile = req.file.filename;
    writeMovies(movies);
    res.json({ success: true });
});

// ======= UPLOAD poster =======
const posterUpload = makeStorage(
    req => path.join(MOVIES_DIR, req.params.id),
    (req, file) => 'poster' + path.extname(file.originalname)
);
app.post('/api/admin/movies/:id/poster', posterUpload.single('poster'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    movies[idx].posterUrl = `/api/poster/${req.params.id}`;
    writeMovies(movies);
    res.json({ success: true });
});

// ======= UPLOAD SRT (movie) =======
const srtMovieUpload = makeStorage(
    req => path.join(MOVIES_DIR, req.params.id),
    (req, file) => `${req.params.type}.srt`
);
app.post('/api/admin/movies/:id/srt/:type', srtMovieUpload.single('srt'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    if (req.params.type === 'original') movies[idx].originalSrt = 'original.srt';
    else movies[idx].translatedSrt = 'translated.srt';
    writeMovies(movies);
    res.json({ success: true });
});

// ======= ADD season =======
app.post('/api/admin/movies/:id/seasons', (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
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

// ======= ADD episode =======
app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes', (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const sIdx = movies[idx].seasons.findIndex(s => s.number === parseInt(req.params.seasonNum));
    if (sIdx === -1) return res.status(404).json({ error: 'Season not found' });

    const eps = movies[idx].seasons[sIdx].episodes;
    const newEp = {
        id: uuidv4(),
        number: eps.length + 1,
        title: req.body.title || `ئالقەی ${eps.length + 1}`,
        description: req.body.description || '',
        duration: req.body.duration || '',
        videoFile: null, originalSrt: null, translatedSrt: null
    };
    movies[idx].seasons[sIdx].episodes.push(newEp);
    writeMovies(movies);

    const epDir = path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${newEp.number}`);
    fs.mkdirSync(epDir, { recursive: true });

    res.json(newEp);
});

// ======= BULK ADD episodes =======
app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes/bulk', (req, res) => {
    const count = parseInt(req.body.count) || 1;
    if (count < 1 || count > 200) return res.status(400).json({ error: 'Count must be 1-200' });

    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const sIdx = movies[idx].seasons.findIndex(s => s.number === parseInt(req.params.seasonNum));
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
            videoFile: null, originalSrt: null, translatedSrt: null
        };
        movies[idx].seasons[sIdx].episodes.push(newEp);
        created.push(newEp);
        // Create directory
        const epDir = path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${num}`);
        fs.mkdirSync(epDir, { recursive: true });
    }

    writeMovies(movies);
    res.json({ created: created.length, episodes: created });
});

// ======= UPLOAD episode video =======
const epVideoUpload = makeStorage(
    req => path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${req.params.episodeNum}`),
    (req, file) => 'video' + path.extname(file.originalname)
);
app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes/:episodeNum/video', epVideoUpload.single('video'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const sIdx = movies[idx].seasons.findIndex(s => s.number === parseInt(req.params.seasonNum));
    const eIdx = movies[idx].seasons[sIdx].episodes.findIndex(e => e.number === parseInt(req.params.episodeNum));
    movies[idx].seasons[sIdx].episodes[eIdx].videoFile = req.file.filename;
    writeMovies(movies);
    res.json({ success: true });
});

// ======= UPLOAD episode SRT =======
const epSrtUpload = makeStorage(
    req => path.join(MOVIES_DIR, req.params.id, 'seasons', `s${req.params.seasonNum}`, `e${req.params.episodeNum}`),
    (req, file) => `${req.params.type}.srt`
);
app.post('/api/admin/movies/:id/seasons/:seasonNum/episodes/:episodeNum/srt/:type', epSrtUpload.single('srt'), (req, res) => {
    const movies = readMovies();
    const idx = movies.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const sIdx = movies[idx].seasons.findIndex(s => s.number === parseInt(req.params.seasonNum));
    const eIdx = movies[idx].seasons[sIdx].episodes.findIndex(e => e.number === parseInt(req.params.episodeNum));
    if (req.params.type === 'original') movies[idx].seasons[sIdx].episodes[eIdx].originalSrt = 'original.srt';
    else movies[idx].seasons[sIdx].episodes[eIdx].translatedSrt = 'translated.srt';
    writeMovies(movies);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`\n🎬 Kurdish Stream Server: http://localhost:${PORT}`);
    console.log(`📁 Movies: ${MOVIES_DIR}\n`);
});
