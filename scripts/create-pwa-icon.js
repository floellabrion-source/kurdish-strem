const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const publicDir = path.join(__dirname, '..', 'client', 'public');

function generateIcon(size, fileName) {
    try {
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');

        // Background Gradient
        const grad = ctx.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, '#8b5cf6');
        grad.addColorStop(1, '#6d28d9');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size, size * 0.22);
        ctx.fill();

        // Play Symbol
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        const pSize = size * 0.35;
        const centerX = size * 0.54;
        const centerY = size * 0.5;
        ctx.moveTo(centerX - pSize * 0.4, centerY - pSize * 0.5);
        ctx.lineTo(centerX + pSize * 0.5, centerY);
        ctx.lineTo(centerX - pSize * 0.4, centerY + pSize * 0.5);
        ctx.closePath();
        ctx.fill();

        const buffer = canvas.toBuffer('image/png');
        const outPath = path.join(publicDir, fileName);
        fs.writeFileSync(outPath, buffer);
        console.log(`[PWA Icon] Generated ${fileName} (${size}x${size})`);
    } catch (e) {
        console.warn(`[PWA Icon Generator] Canvas package not installed, skipping canvas rendering: ${e.message}`);
    }
}

generateIcon(192, 'pwa-192x192.png');
generateIcon(512, 'pwa-512x512.png');
