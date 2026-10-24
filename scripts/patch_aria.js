const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'index.js');
let code = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF first for reliable regex/string replacement, then keep LF or CRLF
const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

// 1. Ingest job statusMessage
const oldJob = `        downloadSpeed: '',
        eta: '',
        uploadProgress: 0,`;

const newJob = `        downloadSpeed: '',
        eta: '',
        statusMessage: magnetUrl ? 'پەیوەندیکردن بە سیدەرەکان و دەرهێنانی زانیاری...' : 'ئامادەکردنی داگرتن...',
        uploadProgress: 0,`;

if (!code.includes(oldJob)) {
    console.error('FAIL: oldJob not found');
} else {
    code = code.replace(oldJob, newJob);
    console.log('OK: oldJob replaced');
}

// 2. Aria arguments
const oldAria = `                const ariaArgs = [
                    '--seed-time=0',
                    '--max-upload-limit=1K',
                    '--enable-dht=false',
                    '--enable-peer-exchange=false',
                    '--bt-stop-timeout=180',
                    '--summary-interval=1',
                    '--file-allocation=none',
                    '--dir=' + tempDir,
                    magnetUrl
                ];`;

const newAria = `                const ariaArgs = [
                    '--seed-time=0',
                    '--max-upload-limit=1K',
                    '--listen-port=6881-6889',
                    '--dht-listen-port=6881-6889',
                    '--enable-dht=true',
                    '--enable-dht6=false',
                    '--dht-entry-point=router.bittorrent.com:6881',
                    '--dht-entry-point=dht.transmissionbt.com:6881',
                    '--dht-entry-point=router.utorrent.com:6881',
                    '--enable-peer-exchange=true',
                    '--bt-enable-lpd=true',
                    '--bt-max-peers=60',
                    '--bt-tracker-timeout=15',
                    '--bt-tracker-connect-timeout=10',
                    '--bt-stop-timeout=300',
                    '--summary-interval=1',
                    '--file-allocation=none',
                    '--dir=' + tempDir,
                    magnetUrl
                ];`;

if (!code.includes(oldAria)) {
    console.error('FAIL: oldAria not found');
} else {
    code = code.replace(oldAria, newAria);
    console.log('OK: oldAria replaced');
}

// 3. Aria stdout & close handler
const oldStdout = `                proc.stdout.on('data', (chunk) => {
                    const text = chunk.toString();
                    const match = text.match(/\\[#\\w+\\s+([\\d\\.]+\\w+)\\/([\\d\\.]+\\w+)\\((\\d+)%\\)\\s+CN:\\d+\\s+DL:([\\d\\.]+\\w+)(?:\\s+ETA:([\\w\\d]+))?/);
                    if (match) {
                        job.progress = parseInt(match[3], 10);
                        job.downloadSpeed = match[4] + '/s';
                        if (match[5]) job.eta = match[5];
                        job.updatedAt = Date.now();
                    }
                });

                proc.stderr.on('data', (chunk) => {
                    console.error('[aria2c err]', chunk.toString().slice(0, 150));
                });

                await new Promise((resolve, reject) => {
                    proc.on('close', (code) => {
                        if (code === 0) {
                            downloadCompleted = true;
                            resolve();
                        } else {
                            reject(new Error(\`داگرتن وەستا بە کۆدی: \${code}\`));
                        }
                    });
                    proc.on('error', reject);
                });`;

const newStdout = `                proc.stdout.on('data', (chunk) => {
                    const text = chunk.toString();
                    const match = text.match(/\\[#\\w+\\s+([\\d\\.]+\\w+)\\/([\\d\\.]+\\w+)\\((\\d+)%\\)\\s+CN:(\\d+)\\s+DL:([\\d\\.]+\\w+)(?:\\s+ETA:([\\w\\d]+))?/);
                    if (match) {
                        job.progress = parseInt(match[3], 10);
                        job.downloadSpeed = match[5] + '/s';
                        if (match[6]) job.eta = match[6];
                        job.statusMessage = \`داگیراوە: \${job.progress}% (\${match[1]}/\${match[2]}) - \${match[4]} سیدەر\`;
                        job.updatedAt = Date.now();
                    } else {
                        const cnMatch = text.match(/CN:(\\d+)/);
                        const peers = cnMatch ? cnMatch[1] : '0';
                        if (job.progress === 0) {
                            if (text.includes('METADATA')) {
                                job.statusMessage = \`وەرگرتنی زانیاری پەڕگە (\${peers} هاوبەش)...\`;
                            } else if (parseInt(peers, 10) > 0) {
                                job.statusMessage = \`پەیوەست بوو بە \${peers} سیدەر، دەستپێکردنی داگرتن...\`;
                            } else {
                                job.statusMessage = 'پەیوەندیکردن بە سیدەرەکان لە ڕێگەی تۆڕی خێرا...';
                            }
                            job.updatedAt = Date.now();
                        }
                    }
                });

                proc.stderr.on('data', (chunk) => {
                    console.error('[aria2c err]', chunk.toString().slice(0, 150));
                });

                await new Promise((resolve, reject) => {
                    proc.on('close', (code) => {
                        if (job.status === 'cancelled') {
                            resolve();
                            return;
                        }
                        if (code === 0) {
                            downloadCompleted = true;
                            resolve();
                        } else if (code === 7) {
                            reject(new Error('داگرتن پچڕا یان لەلایەن بەکارهێنەرەوە وەستێنرا (کۆدی 7).'));
                        } else {
                            reject(new Error(\`داگرتن وەستا بە کۆدی: \${code}\`));
                        }
                    });
                    proc.on('error', reject);
                });`;

if (!code.includes(oldStdout)) {
    console.error('FAIL: oldStdout not found');
} else {
    code = code.replace(oldStdout, newStdout);
    console.log('OK: oldStdout replaced');
}

// 4. Ingest status endpoint
const oldStatusEp = `        downloadSpeed: job.downloadSpeed,
        eta: job.eta,
        uploadProgress: job.uploadProgress,`;

const newStatusEp = `        downloadSpeed: job.downloadSpeed,
        eta: job.eta,
        statusMessage: job.statusMessage || '',
        uploadProgress: job.uploadProgress,`;

if (!code.includes(oldStatusEp)) {
    console.error('FAIL: oldStatusEp not found');
} else {
    code = code.replace(oldStatusEp, newStatusEp);
    console.log('OK: oldStatusEp replaced');
}

// 5. Ingest catch block
const oldCatch = `        } catch (err) {
            console.error('[Ingest Worker Err]', err);`;

const newCatch = `        } catch (err) {
            if (job.status === 'cancelled') {
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
                return;
            }
            console.error('[Ingest Worker Err]', err);`;

if (!code.includes(oldCatch)) {
    console.error('FAIL: oldCatch not found');
} else {
    code = code.replace(oldCatch, newCatch);
    console.log('OK: oldCatch replaced');
}

if (isCRLF) {
    code = code.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('All patches applied successfully to server/index.js');
