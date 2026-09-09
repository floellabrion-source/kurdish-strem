const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'server', 'data');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const OUTPUT_SQL = path.join(__dirname, '..', 'server', 'db', 'seed.sql');

function escapeSql(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    const str = String(val).replace(/'/g, "''");
    return `'${str}'`;
}

function runExport() {
    console.log('[Seed Exporter] Exporting local JSON files to SQL seed file...');
    
    let sqlOutput = `-- ====================================================\n`;
    sqlOutput += `-- Kurdish Stream - Automated Database Seed Script\n`;
    sqlOutput += `-- ====================================================\n\n`;

    // 1. Export Users
    if (fs.existsSync(USERS_FILE)) {
        try {
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
            sqlOutput += `-- Seed Users (${users.length})\n`;
            users.forEach(u => {
                const id = escapeSql(u.id);
                const username = escapeSql(u.username);
                const passwordHash = escapeSql(u.passwordHash || '$2a$10$wN1G1i1j7G2g...dummy');
                const role = escapeSql(u.role || 'user');
                const points = Number(u.points || 0);
                const credits = Number(u.credits || 100);

                sqlOutput += `INSERT INTO users (id, username, password_hash, role, points, credits) VALUES (${id}, ${username}, ${passwordHash}, ${role}, ${points}, ${credits}) ON CONFLICT (username) DO NOTHING;\n`;
            });
            sqlOutput += '\n';
        } catch (e) {
            console.error('Error parsing users.json:', e.message);
        }
    }

    // 2. Export Movies & Episodes
    if (fs.existsSync(MOVIES_FILE)) {
        try {
            const movies = JSON.parse(fs.readFileSync(MOVIES_FILE, 'utf-8'));
            sqlOutput += `-- Seed Movies & Series (${movies.length})\n`;
            movies.forEach(m => {
                const id = escapeSql(m.id);
                const title = escapeSql(m.title);
                const origTitle = escapeSql(m.originalTitle || null);
                const duration = escapeSql(m.duration || null);
                const posterUrl = escapeSql(m.posterUrl || m.posterCloudUrl || null);
                const backdropUrl = escapeSql(m.backdropUrl || null);
                const releaseYear = m.year ? Number(m.year) : 'NULL';
                const imdbRating = m.imdbRating ? Number(m.imdbRating) : 'NULL';
                const type = escapeSql(m.type || 'movie');
                const language = escapeSql(m.language || 'English');
                const description = escapeSql(m.description || null);
                const videoFile = escapeSql(m.videoFile || null);
                const videoUrl = escapeSql(m.videoUrl || null);
                const originalSrt = escapeSql(m.originalSrt || null);
                const translatedSrt = escapeSql(m.translatedSrt || null);
                const views = Number(m.views || 0);

                sqlOutput += `INSERT INTO movies (id, title, original_title, duration, poster_url, backdrop_url, release_year, imdb_rating, type, language, description, video_file, video_url, original_srt, translated_srt, views) VALUES (${id}, ${title}, ${origTitle}, ${duration}, ${posterUrl}, ${backdropUrl}, ${releaseYear}, ${imdbRating}, ${type}, ${language}, ${description}, ${videoFile}, ${videoUrl}, ${originalSrt}, ${translatedSrt}, ${views}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;\n`;

                // Episodes for series
                if (m.type === 'series' && Array.isArray(m.seasons)) {
                    m.seasons.forEach(s => {
                        if (Array.isArray(s.episodes)) {
                            s.episodes.forEach(ep => {
                                const epTitle = escapeSql(ep.title || null);
                                const epDuration = escapeSql(ep.duration || null);
                                const epVideoFile = escapeSql(ep.videoFile || null);
                                const epVideoUrl = escapeSql(ep.videoUrl || null);
                                const epOrigSrt = escapeSql(ep.originalSrt || null);
                                const epTransSrt = escapeSql(ep.translatedSrt || null);

                                sqlOutput += `INSERT INTO episodes (movie_id, season_number, episode_number, title, duration, video_file, video_url, original_srt, translated_srt) VALUES (${id}, ${s.number}, ${ep.number}, ${epTitle}, ${epDuration}, ${epVideoFile}, ${epVideoUrl}, ${epOrigSrt}, ${epTransSrt}) ON CONFLICT (movie_id, season_number, episode_number) DO NOTHING;\n`;
                            });
                        }
                    });
                }
            });
            sqlOutput += '\n';
        } catch (e) {
            console.error('Error parsing movies.json:', e.message);
        }
    }

    fs.writeFileSync(OUTPUT_SQL, sqlOutput, 'utf-8');
    console.log(`[Seed Exporter] Generated seed SQL script successfully: ${OUTPUT_SQL}`);
}

runExport();
