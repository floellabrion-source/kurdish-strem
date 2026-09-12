const fs = require('fs');
const path = require('path');

function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') return 'file_';
    const base = path.basename(filename).replace(/[\0\x00-\x1f\x7f/\\]/g, '');
    const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    return clean || 'file_';
}

function isValidImageBuffer(buffer) {
    if (!buffer || buffer.length < 4) return false;
    
    // JPEG / JPG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
    
    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
    
    // WEBP: RIFF ... WEBP
    if (buffer.length >= 12) {
        const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
        const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
        if (isRiff && isWebp) return true;
    }
    
    return false;
}

function isValidImageFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const buffer = Buffer.alloc(16);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, 16, 0);
        fs.closeSync(fd);
        return isValidImageBuffer(buffer);
    } catch (e) {
        return false;
    }
}

module.exports = {
    sanitizeFilename,
    isValidImageBuffer,
    isValidImageFile
};
