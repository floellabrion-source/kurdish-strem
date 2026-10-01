const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = path.join(__dirname, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'kurdish_stream.db');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// In-Memory L1 Cache for 0.001ms Instant Reads
const cache = {
    movies: new Map(),           // id -> movie
    users: new Map(),            // id -> user
    subtitleHistory: [],         // array of history items
    activityLogs: [],            // array of activity logs
    glossary: new Map(),         // id -> glossary item
    internalNotes: new Map(),    // id -> note item
    plans: new Map(),            // id -> plan item
    requests: new Map(),         // id -> request item
    pushSubscriptions: new Map(),// endpoint -> push sub
    kv: new Map()                // key -> object / string
};

// Synchronously populate RAM cache from JSON on require for 0ms instant startup
const bootstrapSyncFromJson = () => {
    try {
        const usersFile = path.join(DATA_DIR, 'users.json');
        if (fs.existsSync(usersFile) && cache.users.size === 0) {
            const raw = fs.readFileSync(usersFile, 'utf-8');
            const users = JSON.parse(raw);
            if (Array.isArray(users)) {
                users.forEach(u => { if (u && u.id) cache.users.set(String(u.id), u); });
            }
        }
        const moviesFile = path.join(DATA_DIR, 'movies.json');
        if (fs.existsSync(moviesFile) && cache.movies.size === 0) {
            const raw = fs.readFileSync(moviesFile, 'utf-8');
            const movies = JSON.parse(raw);
            if (Array.isArray(movies)) {
                movies.forEach(m => { if (m && m.id) cache.movies.set(String(m.id), m); });
            }
        }
        const plansFile = path.join(DATA_DIR, 'plans.json');
        if (fs.existsSync(plansFile) && cache.plans.size === 0) {
            const raw = fs.readFileSync(plansFile, 'utf-8');
            const plans = JSON.parse(raw);
            if (Array.isArray(plans)) {
                plans.forEach(p => { if (p && p.id) cache.plans.set(String(p.id), p); });
            }
        }
        const glossaryFile = path.join(DATA_DIR, 'glossary.json');
        if (fs.existsSync(glossaryFile) && cache.glossary.size === 0) {
            const raw = fs.readFileSync(glossaryFile, 'utf-8');
            const glossary = JSON.parse(raw);
            if (Array.isArray(glossary)) {
                glossary.forEach(g => { if (g && g.id) cache.glossary.set(String(g.id), g); });
            }
        }
    } catch (e) {
        console.error('❌ [Database] Synchronous bootstrap error:', e.message);
    }
};

bootstrapSyncFromJson();

let dbReady = false;
const readyCallbacks = [];

const onReady = (cb) => {
    if (dbReady) {
        cb();
    } else {
        readyCallbacks.push(cb);
    }
};

// Initialize SQLite database instance
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('❌ [Database] Failed to connect to SQLite:', err);
    } else {
        console.log('📦 [Database] Connected to SQLite database:', DB_FILE);
    }
});

// Helper for promise-based query execution
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};

const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

// ─── INITIALIZE TABLES & LOAD CACHE ───
const initDatabase = async () => {
    try {
        // High-performance PRAGMAs
        await run('PRAGMA journal_mode = WAL;');
        await run('PRAGMA synchronous = NORMAL;');
        await run('PRAGMA foreign_keys = ON;');

        // Create Tables
        await run(`
            CREATE TABLE IF NOT EXISTS movies (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                type TEXT,
                year TEXT,
                genre TEXT,
                imdbRating TEXT,
                featured INTEGER DEFAULT 0,
                views INTEGER DEFAULT 0,
                trendingScore REAL DEFAULT 0,
                createdAt TEXT,
                updatedAt TEXT,
                data TEXT NOT NULL
            );
        `);
        await run(`CREATE INDEX IF NOT EXISTS idx_movies_type ON movies(type);`);
        await run(`CREATE INDEX IF NOT EXISTS idx_movies_featured ON movies(featured);`);

        await run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT,
                role TEXT NOT NULL,
                credits INTEGER DEFAULT 0,
                createdAt TEXT,
                updatedAt TEXT,
                data TEXT NOT NULL
            );
        `);
        await run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
        await run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`);

        await run(`
            CREATE TABLE IF NOT EXISTS subtitle_history (
                id TEXT PRIMARY KEY,
                movieId TEXT NOT NULL,
                movieTitle TEXT,
                seasonNum INTEGER,
                episodeNum INTEGER,
                userId TEXT,
                username TEXT,
                role TEXT,
                note TEXT,
                isAi INTEGER DEFAULT 0,
                aiModel TEXT,
                timestamp TEXT,
                createdAt TEXT,
                diffSummary TEXT,
                data TEXT NOT NULL
            );
        `);
        await run(`CREATE INDEX IF NOT EXISTS idx_sub_hist_movie ON subtitle_history(movieId, seasonNum, episodeNum);`);
        await run(`CREATE INDEX IF NOT EXISTS idx_sub_hist_time ON subtitle_history(timestamp DESC);`);

        await run(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                userId TEXT,
                username TEXT,
                action TEXT,
                ip TEXT,
                city TEXT,
                country TEXT,
                timestamp TEXT,
                data TEXT NOT NULL
            );
        `);
        await run(`CREATE INDEX IF NOT EXISTS idx_act_logs_time ON activity_logs(timestamp DESC);`);

        await run(`
            CREATE TABLE IF NOT EXISTS glossary (
                id TEXT PRIMARY KEY,
                english TEXT NOT NULL,
                kurdish TEXT NOT NULL,
                scope TEXT DEFAULT 'global',
                movieId TEXT,
                createdAt TEXT,
                updatedAt TEXT,
                data TEXT NOT NULL
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS internal_notes (
                id TEXT PRIMARY KEY,
                movieId TEXT,
                seasonNum INTEGER,
                episodeNum INTEGER,
                createdAt TEXT,
                data TEXT NOT NULL
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY,
                title TEXT,
                status TEXT,
                createdAt TEXT,
                data TEXT NOT NULL
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS plans (
                id TEXT PRIMARY KEY,
                name TEXT,
                price INTEGER,
                data TEXT NOT NULL
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                endpoint TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                createdAt TEXT
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updatedAt TEXT
            );
        `);

        // Check if database needs initial JSON migration
        const movieRow = await get('SELECT COUNT(*) as count FROM movies');
        const userRow = await get('SELECT COUNT(*) as count FROM users');

        if ((movieRow?.count || 0) === 0 || (userRow?.count || 0) === 0) {
            await performInitialJsonMigration();
        }

        // Load all tables into in-memory L1 cache
        await loadAllToCache();

        dbReady = true;
        console.log(`🚀 [Database] L1 In-Memory Cache loaded & SQLite database fully ready!`);
        console.log(`   - Movies in RAM: ${cache.movies.size}`);
        console.log(`   - Users in RAM: ${cache.users.size}`);
        console.log(`   - Subtitle History in RAM: ${cache.subtitleHistory.length}`);
        console.log(`   - Activity Logs in RAM: ${cache.activityLogs.length}`);

        readyCallbacks.forEach(cb => cb());
        readyCallbacks.length = 0;
    } catch (err) {
        console.error('💥 [Database] Initialization error:', err);
    }
};

// ─── INITIAL ZERO-LOSS MIGRATION FROM JSON TO SQLITE ───
const performInitialJsonMigration = async () => {
    console.log('🔄 [DB Migration] Empty SQLite database detected. Starting zero-loss migration from JSON files...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const migrationBackupDir = path.join(BACKUPS_DIR, `pre_migration_backup_${timestamp}`);
    fs.mkdirSync(migrationBackupDir, { recursive: true });

    // 1. Backup all JSON files safely first
    const jsonFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    for (const f of jsonFiles) {
        fs.copyFileSync(path.join(DATA_DIR, f), path.join(migrationBackupDir, f));
    }
    console.log(`✅ [DB Migration] Created full pre-migration backup in ${migrationBackupDir}`);

    // Migrate Movies
    const moviesFile = path.join(DATA_DIR, 'movies.json');
    if (fs.existsSync(moviesFile)) {
        try {
            const movies = JSON.parse(fs.readFileSync(moviesFile, 'utf-8'));
            if (Array.isArray(movies)) {
                for (const m of movies) {
                    await run(`
                        INSERT INTO movies (id, title, type, year, genre, imdbRating, featured, views, trendingScore, createdAt, updatedAt, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET data = excluded.data
                    `, [
                        String(m.id),
                        m.title || '',
                        m.type || 'movie',
                        String(m.year || ''),
                        m.genre || '',
                        String(m.imdbRating || ''),
                        m.featured ? 1 : 0,
                        parseInt(m.views, 10) || 0,
                        parseFloat(m.trendingScore) || 0,
                        m.createdAt || new Date().toISOString(),
                        m.updatedAt || new Date().toISOString(),
                        JSON.stringify(m)
                    ]);
                }
                console.log(`✅ [DB Migration] Successfully migrated ${movies.length} movies/shows.`);
            }
        } catch (e) {
            console.error('❌ Error migrating movies:', e);
        }
    }

    // Migrate Users
    const usersFile = path.join(DATA_DIR, 'users.json');
    if (fs.existsSync(usersFile)) {
        try {
            const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
            if (Array.isArray(users)) {
                for (const u of users) {
                    await run(`
                        INSERT INTO users (id, username, email, role, credits, createdAt, updatedAt, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET data = excluded.data
                    `, [
                        String(u.id),
                        u.username || '',
                        u.email || null,
                        u.role || 'user',
                        parseInt(u.credits, 10) || 0,
                        u.createdAt || new Date().toISOString(),
                        u.updatedAt || new Date().toISOString(),
                        JSON.stringify(u)
                    ]);
                }
                console.log(`✅ [DB Migration] Successfully migrated ${users.length} users.`);
            }
        } catch (e) {
            console.error('❌ Error migrating users:', e);
        }
    }

    // Migrate Subtitle History
    const subHistFile = path.join(DATA_DIR, 'subtitle_history.json');
    if (fs.existsSync(subHistFile)) {
        try {
            const history = JSON.parse(fs.readFileSync(subHistFile, 'utf-8'));
            if (Array.isArray(history)) {
                for (const h of history) {
                    const id = String(h.id || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
                    await run(`
                        INSERT INTO subtitle_history (id, movieId, movieTitle, seasonNum, episodeNum, userId, username, role, note, isAi, aiModel, timestamp, createdAt, diffSummary, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET data = excluded.data
                    `, [
                        id,
                        String(h.movieId || ''),
                        h.movieTitle || '',
                        h.seasonNum !== undefined ? parseInt(h.seasonNum, 10) : null,
                        h.episodeNum !== undefined ? parseInt(h.episodeNum, 10) : null,
                        h.userId || null,
                        h.username || '',
                        h.role || '',
                        h.note || '',
                        h.isAi ? 1 : 0,
                        h.aiModel || null,
                        h.timestamp || h.createdAt || new Date().toISOString(),
                        h.createdAt || new Date().toISOString(),
                        h.diffSummary ? JSON.stringify(h.diffSummary) : null,
                        JSON.stringify(h)
                    ]);
                }
                console.log(`✅ [DB Migration] Successfully migrated ${history.length} subtitle revisions.`);
            }
        } catch (e) {
            console.error('❌ Error migrating subtitle history:', e);
        }
    }

    // Migrate Activity Logs
    const actFile = path.join(DATA_DIR, 'activity_log.json');
    if (fs.existsSync(actFile)) {
        try {
            const logs = JSON.parse(fs.readFileSync(actFile, 'utf-8'));
            if (Array.isArray(logs)) {
                for (const l of logs) {
                    await run(`
                        INSERT INTO activity_logs (type, userId, username, action, ip, city, country, timestamp, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        l.type || 'info',
                        l.userId || null,
                        l.username || '',
                        l.action || '',
                        l.ip || '',
                        l.city || '',
                        l.country || '',
                        l.timestamp || new Date().toISOString(),
                        JSON.stringify(l)
                    ]);
                }
                console.log(`✅ [DB Migration] Successfully migrated ${logs.length} activity logs.`);
            }
        } catch (e) {
            console.error('❌ Error migrating activity logs:', e);
        }
    }

    // Migrate Glossary
    const glossaryFile = path.join(DATA_DIR, 'glossary.json');
    if (fs.existsSync(glossaryFile)) {
        try {
            const glossary = JSON.parse(fs.readFileSync(glossaryFile, 'utf-8'));
            if (Array.isArray(glossary)) {
                for (const g of glossary) {
                    const id = String(g.id || `gl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
                    await run(`
                        INSERT INTO glossary (id, english, kurdish, scope, movieId, createdAt, updatedAt, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET data = excluded.data
                    `, [
                        id,
                        g.english || '',
                        g.kurdish || '',
                        g.scope || 'global',
                        g.movieId ? String(g.movieId) : null,
                        g.createdAt || new Date().toISOString(),
                        g.updatedAt || new Date().toISOString(),
                        JSON.stringify(g)
                    ]);
                }
                console.log(`✅ [DB Migration] Successfully migrated ${glossary.length} glossary terms.`);
            }
        } catch (e) {
            console.error('❌ Error migrating glossary:', e);
        }
    }

    // Migrate Internal Notes
    const notesFile = path.join(DATA_DIR, 'internal_notes.json');
    if (fs.existsSync(notesFile)) {
        try {
            const notes = JSON.parse(fs.readFileSync(notesFile, 'utf-8'));
            if (Array.isArray(notes)) {
                for (const n of notes) {
                    const id = String(n.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
                    await run(`
                        INSERT INTO internal_notes (id, movieId, seasonNum, episodeNum, createdAt, data)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET data = excluded.data
                    `, [
                        id,
                        n.movieId ? String(n.movieId) : null,
                        n.seasonNum !== undefined ? parseInt(n.seasonNum, 10) : null,
                        n.episodeNum !== undefined ? parseInt(n.episodeNum, 10) : null,
                        n.createdAt || new Date().toISOString(),
                        JSON.stringify(n)
                    ]);
                }
                console.log(`✅ [DB Migration] Successfully migrated ${notes.length} internal notes.`);
            }
        } catch (e) {
            console.error('❌ Error migrating internal notes:', e);
        }
    }

    // Migrate Plans
    const plansFile = path.join(DATA_DIR, 'plans.json');
    if (fs.existsSync(plansFile)) {
        try {
            const plans = JSON.parse(fs.readFileSync(plansFile, 'utf-8'));
            if (Array.isArray(plans)) {
                for (const p of plans) {
                    await run(`
                        INSERT INTO plans (id, name, price, data)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET data = excluded.data
                    `, [
                        String(p.id),
                        p.name || '',
                        parseInt(p.price, 10) || 0,
                        JSON.stringify(p)
                    ]);
                }
            }
        } catch (e) {}
    }

    // Migrate Requests
    const reqFile = path.join(DATA_DIR, 'requests.json');
    if (fs.existsSync(reqFile)) {
        try {
            const reqs = JSON.parse(fs.readFileSync(reqFile, 'utf-8'));
            if (Array.isArray(reqs)) {
                for (const r of reqs) {
                    await run(`
                        INSERT INTO requests (id, title, status, createdAt, data)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET data = excluded.data
                    `, [
                        String(r.id),
                        r.title || '',
                        r.status || 'pending',
                        r.createdAt || new Date().toISOString(),
                        JSON.stringify(r)
                    ]);
                }
            }
        } catch (e) {}
    }

    // Migrate KV Store Objects
    const kvFiles = [
        { file: 'analytics.json', key: 'analytics' },
        { file: 'translator_payroll.json', key: 'translator_payroll' },
        { file: 'system_settings.json', key: 'system_settings' },
        { file: 'notificationSettings.json', key: 'notification_settings' },
        { file: 'vapidKeys.json', key: 'vapid_keys' }
    ];

    for (const item of kvFiles) {
        const filePath = path.join(DATA_DIR, item.file);
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                await run(`
                    INSERT INTO kv_store (key, value, updatedAt)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
                `, [item.key, content, new Date().toISOString()]);
            } catch (e) {}
        }
    }
};

// Load all database tables into RAM L1 cache
const loadAllToCache = async () => {
    // 1. Movies
    const movieRows = await all('SELECT data FROM movies ORDER BY updatedAt DESC');
    cache.movies.clear();
    for (const r of movieRows) {
        try {
            const m = JSON.parse(r.data);
            cache.movies.set(String(m.id), m);
        } catch (e) {}
    }

    // 2. Users
    const userRows = await all('SELECT data FROM users ORDER BY createdAt DESC');
    cache.users.clear();
    for (const r of userRows) {
        try {
            const u = JSON.parse(r.data);
            cache.users.set(String(u.id), u);
        } catch (e) {}
    }

    // 3. Subtitle History
    const subRows = await all('SELECT data FROM subtitle_history ORDER BY timestamp DESC');
    cache.subtitleHistory = subRows.map(r => {
        try { return JSON.parse(r.data); } catch (e) { return null; }
    }).filter(Boolean);

    // 4. Activity Logs
    const logRows = await all('SELECT data FROM activity_logs ORDER BY timestamp DESC LIMIT 500');
    cache.activityLogs = logRows.map(r => {
        try { return JSON.parse(r.data); } catch (e) { return null; }
    }).filter(Boolean);

    // 5. Glossary
    const glRows = await all('SELECT data FROM glossary ORDER BY english ASC');
    cache.glossary.clear();
    for (const r of glRows) {
        try {
            const g = JSON.parse(r.data);
            cache.glossary.set(String(g.id), g);
        } catch (e) {}
    }

    // 6. Internal Notes
    const noteRows = await all('SELECT data FROM internal_notes ORDER BY createdAt DESC');
    cache.internalNotes.clear();
    for (const r of noteRows) {
        try {
            const n = JSON.parse(r.data);
            cache.internalNotes.set(String(n.id), n);
        } catch (e) {}
    }

    // 7. Plans
    const planRows = await all('SELECT data FROM plans');
    cache.plans.clear();
    for (const r of planRows) {
        try {
            const p = JSON.parse(r.data);
            cache.plans.set(String(p.id), p);
        } catch (e) {}
    }

    // 8. Requests
    const reqRows = await all('SELECT data FROM requests ORDER BY createdAt DESC');
    cache.requests.clear();
    for (const r of reqRows) {
        try {
            const req = JSON.parse(r.data);
            cache.requests.set(String(req.id), req);
        } catch (e) {}
    }

    // 9. Push Subscriptions
    const pushRows = await all('SELECT data FROM push_subscriptions');
    cache.pushSubscriptions.clear();
    for (const r of pushRows) {
        try {
            const s = JSON.parse(r.data);
            if (s.endpoint) cache.pushSubscriptions.set(s.endpoint, s);
        } catch (e) {}
    }

    // 10. KV Store
    const kvRows = await all('SELECT key, value FROM kv_store');
    cache.kv.clear();
    for (const r of kvRows) {
        try {
            cache.kv.set(r.key, JSON.parse(r.value));
        } catch (e) {
            cache.kv.set(r.key, r.value);
        }
    }
};

// Start initial loading
initDatabase();

// ─── HIGH-SPEED SYNCHRONOUS IN-MEMORY API WITH MULTI-WORKER DISK SYNC & SQLITE PERSISTENCE ───

let lastLoadedMtimes = {
    movies: 0,
    users: 0,
    plans: 0,
    requests: 0,
    glossary: 0
};

const syncMoviesFromDiskIfNeeded = () => {
    try {
        const filePath = path.join(DATA_DIR, 'movies.json');
        if (!fs.existsSync(filePath)) return;
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs > lastLoadedMtimes.movies) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                const newMap = new Map();
                for (const m of arr) {
                    if (m && m.id) {
                        newMap.set(String(m.id), m);
                    }
                }
                cache.movies = newMap;
                lastLoadedMtimes.movies = stats.mtimeMs;
            }
        }
    } catch (e) {}
};

const syncUsersFromDiskIfNeeded = () => {
    try {
        const filePath = path.join(DATA_DIR, 'users.json');
        if (!fs.existsSync(filePath)) return;
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs > lastLoadedMtimes.users) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                const newMap = new Map();
                for (const u of arr) {
                    if (u && u.id) {
                        newMap.set(String(u.id), u);
                    }
                }
                cache.users = newMap;
                lastLoadedMtimes.users = stats.mtimeMs;
            }
        }
    } catch (e) {}
};

// Movies
const getMovies = () => {
    syncMoviesFromDiskIfNeeded();
    return Array.from(cache.movies.values());
};

const getMovieById = (id) => {
    if (!id) return null;
    syncMoviesFromDiskIfNeeded();
    return cache.movies.get(String(id)) || null;
};

const saveMovie = (movie) => {
    if (!movie || !movie.id) return false;
    const now = new Date().toISOString();
    movie.updatedAt = now;
    if (!movie.createdAt) movie.createdAt = now;

    // 1. Instant L1 RAM Update
    cache.movies.set(String(movie.id), movie);

    // 2. Non-blocking SQLite persistence
    run(`
        INSERT INTO movies (id, title, type, year, genre, imdbRating, featured, views, trendingScore, createdAt, updatedAt, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            type = excluded.type,
            year = excluded.year,
            genre = excluded.genre,
            imdbRating = excluded.imdbRating,
            featured = excluded.featured,
            views = excluded.views,
            trendingScore = excluded.trendingScore,
            updatedAt = excluded.updatedAt,
            data = excluded.data
    `, [
        String(movie.id),
        movie.title || '',
        movie.type || 'movie',
        String(movie.year || ''),
        movie.genre || '',
        String(movie.imdbRating || ''),
        movie.featured ? 1 : 0,
        parseInt(movie.views, 10) || 0,
        parseFloat(movie.trendingScore) || 0,
        movie.createdAt,
        movie.updatedAt,
        JSON.stringify(movie)
    ]).catch(err => console.error(`❌ [DB] Error saving movie #${movie.id}:`, err));

    return true;
};

const deleteMovie = (id) => {
    if (!id) return false;
    const strId = String(id);
    const existed = cache.movies.delete(strId);

    run('DELETE FROM movies WHERE id = ?', [strId])
        .catch(err => console.error(`❌ [DB] Error deleting movie #${id}:`, err));

    // Update movies.json on disk immediately to broadcast to all PM2 cluster workers
    try {
        const remaining = Array.from(cache.movies.values());
        const filePath = path.join(DATA_DIR, 'movies.json');
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(remaining, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
        lastLoadedMtimes.movies = fs.statSync(filePath).mtimeMs;
    } catch (e) {}

    return existed;
};

const writeDebounceTimers = new Map();
const debounceWriteJson = (filename, data) => {
    if (writeDebounceTimers.has(filename)) {
        clearTimeout(writeDebounceTimers.get(filename));
    }
    writeDebounceTimers.set(filename, setTimeout(() => {
        try {
            const filePath = path.join(DATA_DIR, filename);
            const tempPath = `${filePath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
            fs.renameSync(tempPath, filePath);
            if (filename === 'movies.json') lastLoadedMtimes.movies = fs.statSync(filePath).mtimeMs;
            if (filename === 'users.json') lastLoadedMtimes.users = fs.statSync(filePath).mtimeMs;
        } catch (e) {
            console.error(`❌ [DB] Error writing ${filename}:`, e.message);
        }
        writeDebounceTimers.delete(filename);
    }, 1000));
};

const saveAllMovies = (moviesArray) => {
    if (!Array.isArray(moviesArray)) return false;
    const incomingIds = new Set(moviesArray.map(m => String(m.id).trim()));

    // 1. Reconcile and delete removed movies from RAM and SQLite
    for (const [id] of cache.movies) {
        if (!incomingIds.has(id)) {
            cache.movies.delete(id);
            run('DELETE FROM movies WHERE id = ?', [id]).catch(() => {});
        }
    }

    // 2. Save and update incoming movies
    for (const m of moviesArray) {
        if (m && m.id) {
            saveMovie(m);
        }
    }

    // 3. Write instantly to movies.json so all workers stay 100% in sync
    try {
        const filePath = path.join(DATA_DIR, 'movies.json');
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(moviesArray, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
        lastLoadedMtimes.movies = fs.statSync(filePath).mtimeMs;
    } catch (e) {
        console.error(`❌ [DB] Error writing movies.json:`, e.message);
    }

    return true;
};

// Users
const getUsers = () => {
    return Array.from(cache.users.values());
};

const getUserById = (id) => {
    if (!id) return null;
    return cache.users.get(String(id)) || null;
};

const getUserByUsername = (username) => {
    if (!username) return null;
    const clean = String(username).trim().toLowerCase();
    for (const u of cache.users.values()) {
        if (String(u.username || '').trim().toLowerCase() === clean) {
            return u;
        }
    }
    return null;
};

const getUserByEmail = (email) => {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    for (const u of cache.users.values()) {
        if (String(u.email || '').trim().toLowerCase() === clean) {
            return u;
        }
    }
    return null;
};

const getUserByToken = (token) => {
    if (!token) return null;
    // 1. Instant check in L1 RAM cache
    for (const u of cache.users.values()) {
        if (u && u.token === token) return u;
    }
    // 2. Cross-worker PM2 cluster synchronization fallback
    try {
        const usersFile = path.join(DATA_DIR, 'users.json');
        if (fs.existsSync(usersFile)) {
            const raw = fs.readFileSync(usersFile, 'utf-8');
            const users = JSON.parse(raw);
            if (Array.isArray(users)) {
                for (const u of users) {
                    if (u && u.id) cache.users.set(String(u.id), u);
                    if (u && u.token === token) return u;
                }
            }
        }
    } catch (e) {}
    return null;
};

const saveUser = (user) => {
    if (!user || !user.id) return false;
    const now = new Date().toISOString();
    user.updatedAt = now;
    if (!user.createdAt) user.createdAt = now;

    // 1. Instant L1 RAM Update
    cache.users.set(String(user.id), user);

    // 2. Cross-cluster sync to users.json
    try {
        const usersArray = Array.from(cache.users.values());
        debounceWriteJson('users.json', usersArray);
    } catch (e) {}

    // 3. Non-blocking SQLite persistence
    run(`
        INSERT INTO users (id, username, email, role, credits, createdAt, updatedAt, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            email = excluded.email,
            role = excluded.role,
            credits = excluded.credits,
            updatedAt = excluded.updatedAt,
            data = excluded.data
    `, [
        String(user.id),
        user.username || '',
        user.email || null,
        user.role || 'user',
        parseInt(user.credits, 10) || 0,
        user.createdAt,
        user.updatedAt,
        JSON.stringify(user)
    ]).catch(err => console.error(`❌ [DB] Error saving user #${user.id}:`, err));

    return true;
};

const deleteUser = (id) => {
    if (!id) return false;
    const strId = String(id);
    const existed = cache.users.delete(strId);

    run('DELETE FROM users WHERE id = ?', [strId])
        .catch(err => console.error(`❌ [DB] Error deleting user #${id}:`, err));

    return existed;
};

const saveAllUsers = (usersArray) => {
    if (!Array.isArray(usersArray)) return false;
    for (const u of usersArray) {
        saveUser(u);
    }
    debounceWriteJson('users.json', usersArray);
    return true;
};

// Subtitle History
const getSubtitleHistory = (movieId, seasonNum, episodeNum) => {
    if (!movieId) {
        return cache.subtitleHistory;
    }
    const strMovieId = String(movieId);
    const sNum = seasonNum !== undefined && seasonNum !== null ? parseInt(seasonNum, 10) : undefined;
    const eNum = episodeNum !== undefined && episodeNum !== null ? parseInt(episodeNum, 10) : undefined;

    return cache.subtitleHistory.filter(h => {
        if (String(h.movieId) !== strMovieId) return false;
        if (sNum !== undefined && h.seasonNum !== sNum) return false;
        if (eNum !== undefined && h.episodeNum !== eNum) return false;
        return true;
    });
};

const addSubtitleHistoryEntry = (entry) => {
    if (!entry) return false;
    const id = entry.id || `subhist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    entry.id = id;
    const now = new Date().toISOString();
    if (!entry.timestamp) entry.timestamp = now;
    if (!entry.createdAt) entry.createdAt = now;

    // 1. Instant RAM prepend
    cache.subtitleHistory.unshift(entry);
    if (cache.subtitleHistory.length > 2000) {
        cache.subtitleHistory = cache.subtitleHistory.slice(0, 2000);
    }

    // 2. Non-blocking SQLite persistence
    run(`
        INSERT INTO subtitle_history (id, movieId, movieTitle, seasonNum, episodeNum, userId, username, role, note, isAi, aiModel, timestamp, createdAt, diffSummary, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `, [
        String(id),
        String(entry.movieId || ''),
        entry.movieTitle || '',
        entry.seasonNum !== undefined ? parseInt(entry.seasonNum, 10) : null,
        entry.episodeNum !== undefined ? parseInt(entry.episodeNum, 10) : null,
        entry.userId || null,
        entry.username || '',
        entry.role || '',
        entry.note || '',
        entry.isAi ? 1 : 0,
        entry.aiModel || null,
        entry.timestamp,
        entry.createdAt,
        entry.diffSummary ? JSON.stringify(entry.diffSummary) : null,
        JSON.stringify(entry)
    ]).catch(err => console.error(`❌ [DB] Error saving subtitle history:`, err));

    return true;
};

const saveAllSubtitleHistory = (historyArray) => {
    if (!Array.isArray(historyArray)) return false;
    cache.subtitleHistory = [...historyArray];
    return true;
};

// Activity Logs
const getActivityLogs = (limit = 200) => {
    return cache.activityLogs.slice(0, limit);
};

const addActivityLog = (log) => {
    if (!log) return false;
    const now = new Date().toISOString();
    if (!log.timestamp) log.timestamp = now;

    // 1. Instant RAM prepend
    cache.activityLogs.unshift(log);
    if (cache.activityLogs.length > 1000) {
        cache.activityLogs = cache.activityLogs.slice(0, 1000);
    }

    // 2. Non-blocking SQLite persistence
    run(`
        INSERT INTO activity_logs (type, userId, username, action, ip, city, country, timestamp, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        log.type || 'info',
        log.userId || null,
        log.username || '',
        log.action || '',
        log.ip || '',
        log.city || '',
        log.country || '',
        log.timestamp,
        JSON.stringify(log)
    ]).catch(err => console.error(`❌ [DB] Error logging activity:`, err));

    return true;
};

const saveAllActivityLogs = (logsArray) => {
    if (!Array.isArray(logsArray)) return false;
    cache.activityLogs = [...logsArray];
    return true;
};

// Glossary
const getGlossary = () => {
    return Array.from(cache.glossary.values());
};

const saveGlossaryItem = (item) => {
    if (!item || !item.id) return false;
    const now = new Date().toISOString();
    item.updatedAt = now;
    if (!item.createdAt) item.createdAt = now;

    cache.glossary.set(String(item.id), item);

    run(`
        INSERT INTO glossary (id, english, kurdish, scope, movieId, createdAt, updatedAt, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            english = excluded.english,
            kurdish = excluded.kurdish,
            scope = excluded.scope,
            movieId = excluded.movieId,
            updatedAt = excluded.updatedAt,
            data = excluded.data
    `, [
        String(item.id),
        item.english || '',
        item.kurdish || '',
        item.scope || 'global',
        item.movieId ? String(item.movieId) : null,
        item.createdAt,
        item.updatedAt,
        JSON.stringify(item)
    ]).catch(err => console.error(`❌ [DB] Error saving glossary:`, err));

    return true;
};

const deleteGlossaryItem = (id) => {
    if (!id) return false;
    const strId = String(id);
    const existed = cache.glossary.delete(strId);

    run('DELETE FROM glossary WHERE id = ?', [strId])
        .catch(err => console.error(`❌ [DB] Error deleting glossary #${id}:`, err));

    return existed;
};

const saveAllGlossary = (glossaryArray) => {
    if (!Array.isArray(glossaryArray)) return false;
    for (const g of glossaryArray) {
        saveGlossaryItem(g);
    }
    return true;
};

// Internal Notes
const getInternalNotes = () => {
    return Array.from(cache.internalNotes.values());
};

const saveInternalNote = (note) => {
    if (!note || !note.id) return false;
    if (!note.createdAt) note.createdAt = new Date().toISOString();

    cache.internalNotes.set(String(note.id), note);

    run(`
        INSERT INTO internal_notes (id, movieId, seasonNum, episodeNum, createdAt, data)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `, [
        String(note.id),
        note.movieId ? String(note.movieId) : null,
        note.seasonNum !== undefined ? parseInt(note.seasonNum, 10) : null,
        note.episodeNum !== undefined ? parseInt(note.episodeNum, 10) : null,
        note.createdAt,
        JSON.stringify(note)
    ]).catch(err => console.error(`❌ [DB] Error saving note:`, err));

    return true;
};

const deleteInternalNote = (id) => {
    if (!id) return false;
    const strId = String(id);
    const existed = cache.internalNotes.delete(strId);

    run('DELETE FROM internal_notes WHERE id = ?', [strId])
        .catch(err => console.error(`❌ [DB] Error deleting note #${id}:`, err));

    return existed;
};

const saveAllInternalNotes = (notesArray) => {
    if (!Array.isArray(notesArray)) return false;
    for (const n of notesArray) {
        saveInternalNote(n);
    }
    return true;
};

// Requests
const getRequests = () => {
    return Array.from(cache.requests.values());
};

const saveRequest = (req) => {
    if (!req || !req.id) return false;
    if (!req.createdAt) req.createdAt = new Date().toISOString();

    cache.requests.set(String(req.id), req);

    run(`
        INSERT INTO requests (id, title, status, createdAt, data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            status = excluded.status,
            data = excluded.data
    `, [
        String(req.id),
        req.title || '',
        req.status || 'pending',
        req.createdAt,
        JSON.stringify(req)
    ]).catch(err => console.error(`❌ [DB] Error saving request:`, err));

    return true;
};

const deleteRequest = (id) => {
    if (!id) return false;
    const strId = String(id);
    const existed = cache.requests.delete(strId);

    run('DELETE FROM requests WHERE id = ?', [strId])
        .catch(err => console.error(`❌ [DB] Error deleting request #${id}:`, err));

    return existed;
};

const saveAllRequests = (reqsArray) => {
    if (!Array.isArray(reqsArray)) return false;
    for (const r of reqsArray) {
        saveRequest(r);
    }
    return true;
};

// Plans
const getPlans = () => {
    return Array.from(cache.plans.values());
};

const savePlan = (plan) => {
    if (!plan || !plan.id) return false;
    cache.plans.set(String(plan.id), plan);

    run(`
        INSERT INTO plans (id, name, price, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            price = excluded.price,
            data = excluded.data
    `, [
        String(plan.id),
        plan.name || '',
        parseInt(plan.price, 10) || 0,
        JSON.stringify(plan)
    ]).catch(err => console.error(`❌ [DB] Error saving plan:`, err));

    return true;
};

const saveAllPlans = (plansArray) => {
    if (!Array.isArray(plansArray)) return false;
    for (const p of plansArray) {
        savePlan(p);
    }
    return true;
};

// Push Subscriptions
const getPushSubscriptions = () => {
    return Array.from(cache.pushSubscriptions.values());
};

const addPushSubscription = (sub) => {
    if (!sub || !sub.endpoint) return false;
    cache.pushSubscriptions.set(sub.endpoint, sub);

    run(`
        INSERT OR IGNORE INTO push_subscriptions (endpoint, data, createdAt)
        VALUES (?, ?, ?)
    `, [
        sub.endpoint,
        JSON.stringify(sub),
        new Date().toISOString()
    ]).catch(err => console.error(`❌ [DB] Error saving push sub:`, err));

    return true;
};

const deletePushSubscription = (endpoint) => {
    if (!endpoint) return false;
    const existed = cache.pushSubscriptions.delete(endpoint);

    run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint])
        .catch(err => console.error(`❌ [DB] Error deleting push sub:`, err));

    return existed;
};

const saveAllPushSubscriptions = (subsArray) => {
    if (!Array.isArray(subsArray)) return false;
    cache.pushSubscriptions.clear();
    run('DELETE FROM push_subscriptions').catch(() => {});
    for (const s of subsArray) {
        addPushSubscription(s);
    }
    return true;
};

// Key-Value API Helpers
const getKV = (key, defaultVal = null) => {
    const val = cache.kv.get(key);
    return val !== undefined ? val : defaultVal;
};

const setKV = (key, value) => {
    cache.kv.set(key, value);

    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    run(`
        INSERT INTO kv_store (key, value, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updatedAt = excluded.updatedAt
    `, [key, strVal, new Date().toISOString()])
        .catch(err => console.error(`❌ [DB] Error saving KV [${key}]:`, err));

    return true;
};

// Translator Payroll
const getTranslatorPayroll = () => {
    return getKV('translator_payroll', {
        settings: { defaultRate: { lines: 600, priceIqd: 1500 } },
        translators: {},
        editedLineEntries: []
    });
};

const saveTranslatorPayroll = (payrollData) => {
    return setKV('translator_payroll', payrollData);
};

// Analytics
const getAnalytics = () => {
    return getKV('analytics', { visits: [] });
};

const saveAnalytics = (analyticsData) => {
    return setKV('analytics', analyticsData);
};

// System Settings
const getSystemSettings = () => {
    return getKV('system_settings', {
        dualSubTrialMinutes: 60,
        dualSubResetHours: 24,
        dualSubTrialActive: true,
        dualSubExpiredAction: 'block_all',
        initialRegistrationCredits: 75
    });
};

const saveSystemSettings = (settings) => {
    return setKV('system_settings', settings);
};

// Notification Settings
const getNotificationSettings = () => {
    return getKV('notification_settings', {
        notifyNewMovie: true,
        notifyNewEpisode: true,
        notifyLiveStream: true,
        notifyAppUpdate: true
    });
};

const saveNotificationSettings = (settings) => {
    return setKV('notification_settings', settings);
};

// VAPID Keys
const getVapidKeys = () => {
    return getKV('vapid_keys', null);
};

const saveVapidKeys = (keys) => {
    return setKV('vapid_keys', keys);
};

// ─── AUTOMATED DAILY DATABASE BACKUP UTILITY ───
const backupDatabase = () => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupTarget = path.join(BACKUPS_DIR, `kurdish_stream_backup_${timestamp}.db`);

        // Check if database file exists
        if (fs.existsSync(DB_FILE)) {
            fs.copyFileSync(DB_FILE, backupTarget);
            console.log(`🛡️ [DB Backup] Successfully created hot database snapshot: ${backupTarget}`);
            cleanOldBackups();
        }
    } catch (e) {
        console.error('❌ [DB Backup] Exception triggering backup:', e);
    }
};

const cleanOldBackups = () => {
    try {
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('kurdish_stream_backup_') && f.endsWith('.db'))
            .map(f => ({ name: f, time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);

        // Keep last 30 daily database snapshots, delete older ones
        if (files.length > 30) {
            for (let i = 30; i < files.length; i++) {
                fs.unlinkSync(path.join(BACKUPS_DIR, files[i].name));
            }
        }
    } catch (e) {}
};

// Trigger automatic daily backup every 24 hours
setInterval(backupDatabase, 24 * 60 * 60 * 1000);

module.exports = {
    db,
    onReady,
    getMovies,
    getMovieById,
    saveMovie,
    deleteMovie,
    saveAllMovies,
    getUsers,
    getUserById,
    getUserByUsername,
    getUserByEmail,
    getUserByToken,
    saveUser,
    deleteUser,
    saveAllUsers,
    getSubtitleHistory,
    addSubtitleHistoryEntry,
    saveAllSubtitleHistory,
    getActivityLogs,
    addActivityLog,
    saveAllActivityLogs,
    getGlossary,
    saveGlossaryItem,
    deleteGlossaryItem,
    saveAllGlossary,
    getInternalNotes,
    saveInternalNote,
    deleteInternalNote,
    saveAllInternalNotes,
    getRequests,
    saveRequest,
    deleteRequest,
    saveAllRequests,
    getPlans,
    savePlan,
    saveAllPlans,
    getPushSubscriptions,
    addPushSubscription,
    deletePushSubscription,
    saveAllPushSubscriptions,
    getKV,
    setKV,
    getTranslatorPayroll,
    saveTranslatorPayroll,
    getAnalytics,
    saveAnalytics,
    getSystemSettings,
    saveSystemSettings,
    getNotificationSettings,
    saveNotificationSettings,
    getVapidKeys,
    saveVapidKeys,
    backupDatabase
};
