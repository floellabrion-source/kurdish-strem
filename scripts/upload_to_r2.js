const fs = require('fs');
const path = require('path');
const dotenv = require('../server/node_modules/dotenv');
const { S3Client, PutObjectCommand } = require('../server/node_modules/@aws-sdk/client-s3');

// 1. Load R2 Config from server/.env
const envPath = path.join(__dirname, '..', 'server', '.env');
if (!fs.existsSync(envPath)) {
    console.error('[R2 Error] server/.env not found!');
    process.exit(1);
}
const env = dotenv.parse(fs.readFileSync(envPath));

if (!env.R2_BUCKET || !env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    console.error('[R2 Error] Missing R2 credentials in server/.env!');
    process.exit(1);
}

const client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY
    }
});

// Recursively get all files
function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    }
    return arrayOfFiles;
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.m3u8') return 'application/vnd.apple.mpegurl';
    if (ext === '.ts') return 'video/mp2t';
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.vtt') return 'text/vtt';
    return 'application/octet-stream';
}

async function uploadHlsFolder(hlsDir, customPrefix = '') {
    if (!fs.existsSync(hlsDir)) {
        throw new Error(`Directory does not exist: ${hlsDir}`);
    }

    const folderName = path.basename(hlsDir);
    const targetFolder = customPrefix || folderName;
    const r2BasePrefix = `videos/${targetFolder}`;

    const files = getAllFiles(hlsDir);
    const totalFiles = files.length;
    if (totalFiles === 0) {
        throw new Error('No files found to upload in ' + hlsDir);
    }

    console.log(`[INFO] Starting upload of ${totalFiles} files to R2: ${r2BasePrefix}/`);

    let uploadedCount = 0;
    const concurrency = 10;
    let queueIndex = 0;

    async function worker() {
        while (queueIndex < totalFiles) {
            const currentIdx = queueIndex++;
            const filePath = files[currentIdx];
            const relativePath = path.relative(hlsDir, filePath).replace(/\\/g, '/');
            const r2Key = `${r2BasePrefix}/${relativePath}`;
            const fileStream = fs.createReadStream(filePath);
            const contentType = getContentType(filePath);

            try {
                await client.send(new PutObjectCommand({
                    Bucket: env.R2_BUCKET,
                    Key: r2Key,
                    Body: fileStream,
                    ContentType: contentType,
                    CacheControl: relativePath.endsWith('.m3u8') ? 'no-cache' : 'public, max-age=31536000'
                }));

                uploadedCount++;
                const pct = Math.round((uploadedCount / totalFiles) * 100);
                console.log(`[PROGRESS] ${uploadedCount}/${totalFiles} (${pct}%) - ${relativePath}`);
            } catch (err) {
                console.error(`[ERROR] Failed to upload ${relativePath}:`, err.message);
                throw err;
            }
        }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    const publicBase = (env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
    const masterUrl = `${publicBase}/${r2BasePrefix}/master.m3u8`;
    console.log(`[SUCCESS] All ${totalFiles} files uploaded successfully!`);
    console.log(`[MASTER_URL] ${masterUrl}`);

    // Auto-link to movie in movies.json if title matches
    try {
        const cleanTitle = folderName.replace(/_HLS$/i, '').replace(/_/g, ' ').toLowerCase();
        const moviesPath = path.join(__dirname, '..', 'server', 'data', 'movies.json');
        if (fs.existsSync(moviesPath)) {
            const movies = JSON.parse(fs.readFileSync(moviesPath, 'utf8'));
            const matchedMovie = movies.find(m => {
                const mTitle = (m.title || '').toLowerCase();
                return cleanTitle.includes(mTitle) || mTitle.includes(cleanTitle);
            });

            if (matchedMovie) {
                matchedMovie.videoUrl = masterUrl;
                matchedMovie.videoUpdatedAt = Date.now();
                fs.writeFileSync(moviesPath, JSON.stringify(movies, null, 2), 'utf8');
                console.log(`[AUTO_LINK] Automatically linked to local movie: "${matchedMovie.title}"`);

                // Also update VPS if SSH is reachable
                try {
                    const { Client } = require('../server/node_modules/ssh2');
                    const conn = new Client();
                    conn.on('ready', () => {
                        const vpsCmd = `node -e "const fs = require('fs'); const ms = JSON.parse(fs.readFileSync('/var/www/kurdish-stream/server/data/movies.json')); const m = ms.find(x => x.id === '${matchedMovie.id}'); if (m) { m.videoUrl = '${masterUrl}'; fs.writeFileSync('/var/www/kurdish-stream/server/data/movies.json', JSON.stringify(ms, null, 2)); console.log('VPS_LINK_OK'); }" && pm2 restart kurdish-stream-api`;
                        conn.exec(vpsCmd, (err, stream) => {
                            if (!err) {
                                stream.on('close', () => conn.end());
                            } else {
                                conn.end();
                            }
                        });
                    }).connect({ host: '77.42.22.139', port: 2222, username: 'root', password: '3sAubnu7EXsW' });
                } catch (e) {}
            }
        }
    } catch (e) {
        console.error('[WARN] Auto-link warning:', e.message);
    }

    return masterUrl;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log('Usage: node scripts/upload_to_r2.js <hlsDirectory> [customPrefix]');
        process.exit(1);
    }
    uploadHlsFolder(args[0], args[1] || '')
        .then(() => process.exit(0))
        .catch(err => {
            console.error('[FATAL]', err);
            process.exit(1);
        });
}

module.exports = { uploadHlsFolder };
