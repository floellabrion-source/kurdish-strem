const http = require('http');
const https = require('https');
const { URL } = require('url');

const TARGET_URL = process.env.TEST_URL || process.argv[2] || 'http://77.42.22.139/api/movies';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || process.argv[3] || '50', 10);
const DURATION_SEC = parseInt(process.env.DURATION || process.argv[4] || '10', 10);

console.log('===========================================================');
console.log('       KURDISH STREAM SERVER LOAD & STRESS TESTER          ');
console.log('===========================================================');
console.log('Target URL:       ' + TARGET_URL);
console.log('Concurrent Users: ' + CONCURRENCY);
console.log('Test Duration:    ' + DURATION_SEC + ' seconds');
console.log('-----------------------------------------------------------');
console.log('Running test... Please wait...\n');

const parsedUrl = new URL(TARGET_URL);
const isHttps = parsedUrl.protocol === 'https:';
const client = isHttps ? https : http;

const agent = new client.Agent({
    keepAlive: true,
    maxSockets: CONCURRENCY * 2,
    timeout: 10000
});

let totalRequests = 0;
let successRequests = 0;
let failedRequests = 0;
let statusCodes = {};
let responseTimes = [];
let totalBytes = 0;
let isRunning = true;

const startTime = Date.now();
const endTime = startTime + (DURATION_SEC * 1000);

function sendRequest(workerId = 0) {
    if (!isRunning || Date.now() >= endTime) return;

    const reqStart = Date.now();
    const simulatedIp = `185.100.${(workerId % 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
    const options = {
        agent,
        headers: {
            'X-Forwarded-For': simulatedIp,
            'User-Agent': 'KurdishStream-StressTester/2.0'
        }
    };

    const req = client.get(TARGET_URL, options, (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
            bytes += chunk.length;
        });
        res.on('end', () => {
            const reqDuration = Date.now() - reqStart;
            totalRequests++;
            totalBytes += bytes;
            responseTimes.push(reqDuration);
            statusCodes[res.statusCode] = (statusCodes[res.statusCode] || 0) + 1;

            if (res.statusCode >= 200 && res.statusCode < 400) {
                successRequests++;
            } else {
                failedRequests++;
            }

            if (isRunning) sendRequest(workerId);
        });
    });

    req.on('error', (err) => {
        totalRequests++;
        failedRequests++;
        statusCodes['ERR_' + err.code] = (statusCodes['ERR_' + err.code] || 0) + 1;
        if (isRunning) sendRequest(workerId);
    });

    req.setTimeout(8000, () => {
        req.destroy();
    });
}

for (let i = 0; i < CONCURRENCY; i++) {
    sendRequest(i);
}

const timer = setInterval(() => {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const rps = (totalRequests / (elapsedSec || 1)).toFixed(0);
    process.stdout.write('\rTime: ' + elapsedSec + 's / ' + DURATION_SEC + 's | Requests: ' + totalRequests + ' | Current RPS: ' + rps + ' req/sec | Errors: ' + failedRequests);

    if (Date.now() >= endTime) {
        isRunning = false;
        clearInterval(timer);
        setTimeout(printResults, 500);
    }
}, 250);

function printResults() {
    const actualDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    const rps = (totalRequests / actualDuration).toFixed(1);
    const mbTransferred = (totalBytes / (1024 * 1024)).toFixed(2);
    
    responseTimes.sort((a, b) => a - b);
    const min = responseTimes[0] || 0;
    const max = responseTimes[responseTimes.length - 1] || 0;
    const avg = responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1) : 0;
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
    const p90 = responseTimes[Math.floor(responseTimes.length * 0.9)] || 0;
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;
    const errorRate = totalRequests > 0 ? ((failedRequests / totalRequests) * 100).toFixed(2) : 0;

    let grade = 'A+ (ناایاب)';
    if (avg > 250 || errorRate > 5) { grade = 'B (مامناوەند)'; }
    if (avg > 600 || errorRate > 15) { grade = 'C (کەمێک هێواش)'; }
    if (errorRate > 40) { grade = 'F (داڕماو)'; }

    console.log('\n\n===========================================================');
    console.log('              📊 ئەنجامی تێستی لۆدی سێرڤەر               ');
    console.log('===========================================================');
    console.log('⏱️ کۆی کات:              ' + actualDuration + ' چرکە');
    console.log('📦 کۆی داواکارییەکان:    ' + totalRequests.toLocaleString());
    console.log('⚡ خێرایی (RPS):          ' + rps + ' داواکاری لە چرکەیەکدا');
    console.log('💾 قەبارەی گواستراوە:    ' + mbTransferred + ' MB');
    console.log('✅ داواکاری سەرکەوتوو:    ' + successRequests.toLocaleString());
    console.log('❌ هەڵە و لەدەستچوون:    ' + failedRequests.toLocaleString() + ' (' + errorRate + '%)');
    console.log('-----------------------------------------------------------');
    console.log('📈 کاتی وەڵامدانەوەی سێرڤەر (Latency):');
    console.log('  • کەمترین (Min):        ' + min + ' ms');
    console.log('  • تێکڕا (Average):      ' + avg + ' ms');
    console.log('  • 50% بەکارهێنەران:     ' + p50 + ' ms');
    console.log('  • 90% بەکارهێنەران:     ' + p90 + ' ms');
    console.log('  • 99% بەکارهێنەران:     ' + p99 + ' ms');
    console.log('  • زۆرترین (Max):        ' + max + ' ms');
    console.log('-----------------------------------------------------------');
    console.log('📡 کۆدی وەڵامەکان (HTTP Statuses):');
    for (const [code, count] of Object.entries(statusCodes)) {
        console.log('  [HTTP ' + code + ']: ' + count + ' جار');
    }
    console.log('-----------------------------------------------------------');
    console.log('🏆 پلەی خێرایی و بەرگەگرتن: ' + grade);
    console.log('===========================================================\n');
    process.exit(0);
}
