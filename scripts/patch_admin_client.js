const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'client', 'src', 'pages', 'Admin.tsx');
let code = fs.readFileSync(filePath, 'utf8');

const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

// 1. Add statusMessage to state interface
const oldInterface = `            r2Url?: string;
            error?: string;
        } | null;`;

const newInterface = `            r2Url?: string;
            error?: string;
            statusMessage?: string;
        } | null;`;

if (code.includes(oldInterface)) {
    code = code.replace(oldInterface, newInterface);
    console.log('OK: interface patched');
} else {
    console.log('NOTE: interface pattern check');
}

// 2. Add statusMessage to polling
const oldPollJob = `                                r2Url: job.r2Url || '',
                                error: job.error || ''
                            }`;

const newPollJob = `                                r2Url: job.r2Url || '',
                                error: job.error || '',
                                statusMessage: job.statusMessage || ''
                            }`;

if (code.includes(oldPollJob)) {
    code = code.replace(oldPollJob, newPollJob);
    console.log('OK: pollJob patched');
} else {
    console.log('NOTE: pollJob pattern check');
}

// 3. UI modal text
const oldUiHeader = `{r2MovieModal.ingestJob.status === 'downloading' && 'قۆناغی ١: داگرتنی فیلم لە کلاود بۆ ناو سێرڤەر...'}
                                                {r2MovieModal.ingestJob.status === 'uploading' && 'قۆناغی ٢: بەرزکردنەوەی ڕاستەوخۆ بۆ ناو Cloudflare R2...'}
                                                {r2MovieModal.ingestJob.status === 'completed' && 'تەواو بوو! فایلی فیلم بە سەرکەوتوویی لە ناو کلاود پاشەکەوت کرا ✓'}
                                                {r2MovieModal.ingestJob.status === 'failed' && 'گواستنەوە سەرکەوتوو نەبوو!'}`;

const newUiHeader = `{r2MovieModal.ingestJob.status === 'downloading' && (r2MovieModal.ingestJob.statusMessage || 'قۆناغی ١: داگرتنی فیلم لە کلاود بۆ ناو سێرڤەر...')}
                                                {r2MovieModal.ingestJob.status === 'uploading' && 'قۆناغی ٢: بەرزکردنەوەی ڕاستەوخۆ بۆ ناو Cloudflare R2...'}
                                                {r2MovieModal.ingestJob.status === 'completed' && 'تەواو بوو! فایلی فیلم بە سەرکەوتوویی لە ناو کلاود پاشەکەوت کرا ✓'}
                                                {r2MovieModal.ingestJob.status === 'failed' && 'گواستنەوە سەرکەوتوو نەبوو!'}
                                                {r2MovieModal.ingestJob.status === 'cancelled' && 'پرۆسەکە هەڵوەشێنرایەوە'}`;

if (code.includes(oldUiHeader)) {
    code = code.replace(oldUiHeader, newUiHeader);
    console.log('OK: uiHeader patched');
} else {
    console.log('NOTE: uiHeader pattern check');
}

const oldUiSpan = `{r2MovieModal.ingestJob.status === 'downloading' && \`داگیراوە: \${r2MovieModal.ingestJob.progress}%\`}
                                                {r2MovieModal.ingestJob.status === 'uploading' && \`ئەپلۆدی R2: \${r2MovieModal.ingestJob.uploadProgress || 0}%\`}
                                                {r2MovieModal.ingestJob.status === 'completed' && '100% تەواو'}`;

const newUiSpan = `{r2MovieModal.ingestJob.status === 'downloading' && (r2MovieModal.ingestJob.statusMessage || \`داگیراوە: \${r2MovieModal.ingestJob.progress}%\`)}
                                                {r2MovieModal.ingestJob.status === 'uploading' && \`ئەپلۆدی R2: \${r2MovieModal.ingestJob.uploadProgress || 0}%\`}
                                                {r2MovieModal.ingestJob.status === 'completed' && '100% تەواو'}
                                                {r2MovieModal.ingestJob.status === 'cancelled' && 'هەڵوەشێنراوە'}`;

if (code.includes(oldUiSpan)) {
    code = code.replace(oldUiSpan, newUiSpan);
    console.log('OK: uiSpan patched');
} else {
    console.log('NOTE: uiSpan pattern check');
}

if (isCRLF) {
    code = code.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Admin.tsx updated successfully');
