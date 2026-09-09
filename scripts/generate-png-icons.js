const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, r, g, b) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR Chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8); // 8-bit depth
    ihdr.writeUInt8(2, 9); // Truecolor RGB
    ihdr.writeUInt8(0, 10);
    ihdr.writeUInt8(0, 11);
    ihdr.writeUInt8(0, 12);

    const ihdrChunk = createChunk('IHDR', ihdr);

    // IDAT Chunk
    const rowSize = 1 + width * 3;
    const rawData = Buffer.alloc(height * rowSize);

    for (let y = 0; y < height; y++) {
        const offset = y * rowSize;
        rawData[offset] = 0; // Filter type 0
        for (let x = 0; x < width; x++) {
            const pxOffset = offset + 1 + x * 3;
            // Draw gradient + play symbol
            const cx = width / 2;
            const cy = height / 2;
            const dx = x - cx;
            const dy = y - cy;
            
            let pr = r;
            let pg = g;
            let pb = b;

            // Simple Play Triangle check
            if (x >= width * 0.38 && x <= width * 0.68) {
                const relativeX = (x - width * 0.38) / (width * 0.3);
                const halfH = relativeX * height * 0.25;
                if (Math.abs(dy) <= halfH) {
                    pr = 255;
                    pg = 255;
                    pb = 255;
                }
            }

            rawData[pxOffset] = pr;
            rawData[pxOffset + 1] = pg;
            rawData[pxOffset + 2] = pb;
        }
    }

    const compressed = zlib.deflateSync(rawData);
    const idatChunk = createChunk('IDAT', compressed);

    // IEND Chunk
    const iendChunk = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
}

// CRC32 implementation
function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
        let byte = buf[i];
        for (let j = 0; j < 8; j++) {
            const bit = (crc ^ byte) & 1;
            crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
            byte >>>= 1;
        }
    }
    return (crc ^ -1) >>> 0;
}

const publicDir = path.join(__dirname, '..', 'client', 'public');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, 139, 92, 246));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, 139, 92, 246));
console.log('[PWA Icon] Successfully generated pwa-192x192.png and pwa-512x512.png using pure Node.js!');
