const fs = require('fs');
const path = require('path');

/**
 * SRT to WebVTT Subtitle Converter
 */
function srtToVtt(srtContent) {
    if (!srtContent) return 'WEBVTT\n\n';

    // Normalize line endings
    let content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Replace comma in timestamps (00:01:20,500 -> 00:01:20.500)
    content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

    return `WEBVTT\n\n${content.trim()}\n`;
}

function convertSrtFileToVtt(inputPath, outputPath) {
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input SRT file not found: ${inputPath}`);
    }
    const srtData = fs.readFileSync(inputPath, 'utf-8');
    const vttData = srtToVtt(srtData);
    fs.writeFileSync(outputPath || inputPath.replace(/\.srt$/i, '.vtt'), vttData, 'utf-8');
    console.log(`[VTT Converter] Converted: ${path.basename(inputPath)} -> ${path.basename(outputPath || inputPath.replace(/\.srt$/i, '.vtt'))}`);
}

// CLI execution support
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log('Usage: node scripts/convert-srt-to-vtt.js <inputSrtPath> [outputVttPath]');
        process.exit(1);
    }
    try {
        convertSrtFileToVtt(args[0], args[1]);
        process.exit(0);
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}

module.exports = { srtToVtt, convertSrtFileToVtt };
