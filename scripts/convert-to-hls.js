const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * HLS Transcoder Utility
 * Converts local video files (MP4/MKV) into HLS adaptive streams (.m3u8 + .ts segments)
 */
function convertToHls(inputFile, outputDir, options = {}) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(inputFile)) {
            return reject(new Error(`Input file does not exist: ${inputFile}`));
        }

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const playlistPath = path.join(outputDir, 'master.m3u8');
        const segmentPattern = path.join(outputDir, 'segment_%03d.ts');

        console.log(`[HLS Transcoder] Starting HLS conversion: ${path.basename(inputFile)} -> ${outputDir}`);

        const args = [
            '-y',
            '-i', inputFile,
            '-profile:v', 'baseline',
            '-level', '3.0',
            '-start_number', '0',
            '-hls_time', options.segmentTime || '6',
            '-hls_list_size', '0',
            '-hls_segment_filename', segmentPattern,
            '-c:v', options.reencode ? 'libx264' : 'copy',
            '-c:a', options.reencode ? 'aac' : 'copy',
            '-f', 'hls',
            playlistPath
        ];

        const ffmpeg = spawn('ffmpeg', args, { windowsHide: true });

        ffmpeg.stderr.on('data', (chunk) => {
            const msg = chunk.toString();
            if (msg.includes('time=')) {
                process.stdout.write(`\r[HLS Transcoder] Progress: ${msg.split('time=')[1].split(' ')[0]}`);
            }
        });

        ffmpeg.on('close', (code) => {
            console.log('\n');
            if (code === 0) {
                console.log(`[HLS Transcoder] Successfully generated HLS stream: ${playlistPath}`);
                resolve(playlistPath);
            } else {
                reject(new Error(`FFmpeg HLS conversion exited with code ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            reject(err);
        });
    });
}

// CLI execution support
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: node scripts/convert-to-hls.js <inputFile> <outputDir>');
        process.exit(1);
    }
    convertToHls(args[0], args[1])
        .then(() => process.exit(0))
        .catch(err => {
            console.error('HLS Conversion error:', err.message);
            process.exit(1);
        });
}

module.exports = { convertToHls };
