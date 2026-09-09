const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MOVIES_DIR = path.join(__dirname, '..', '..', 'uploads', 'movies');

/**
 * Optimizes an image to WebP with high compression efficiency
 * @param {string|Buffer} input - File path or buffer
 * @param {string} outputPath - Destination file path
 * @param {number} quality - WebP quality (default: 82)
 */
async function optimizeImageToWebP(input, outputPath, quality = 82) {
    try {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        await sharp(input)
            .webp({ quality, effort: 4 })
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('[ImageService] Failed to optimize image to WebP:', error.message);
        return false;
    }
}

/**
 * Generates a lightweight WebP thumbnail
 * @param {string|Buffer} input - File path or buffer
 * @param {string} outputPath - Destination file path
 * @param {number} width - Target width in pixels (default: 360px for portrait cards)
 */
async function generateThumbnailWebP(input, outputPath, width = 360) {
    try {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        await sharp(input)
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: 80, effort: 4 })
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('[ImageService] Failed to generate thumbnail:', error.message);
        return false;
    }
}

/**
 * Scans all movie folders and optimizes all posters to WebP + Thumbnails
 */
async function convertAllExistingPosters() {
    const results = {
        totalFound: 0,
        optimizedCount: 0,
        bytesSaved: 0,
        errors: 0
    };

    if (!fs.existsSync(MOVIES_DIR)) return results;

    const movieDirs = fs.readdirSync(MOVIES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(MOVIES_DIR, d.name));

    for (const dir of movieDirs) {
        const files = fs.readdirSync(dir);
        // Find existing poster image (.jpg, .jpeg, .png, .webp)
        const posterFile = files.find(f => 
            f.toLowerCase().startsWith('poster') && 
            !f.includes('_thumb') &&
            /\.(jpe?g|png|webp)$/i.test(f)
        );

        if (posterFile) {
            results.totalFound++;
            const inputPath = path.join(dir, posterFile);
            const webpPath = path.join(dir, 'poster.webp');
            const thumbPath = path.join(dir, 'poster_thumb.webp');

            try {
                const originalSize = fs.statSync(inputPath).size;

                // 1. Generate full WebP
                await optimizeImageToWebP(inputPath, webpPath, 84);
                // 2. Generate Thumb WebP
                await generateThumbnailWebP(inputPath, thumbPath, 360);

                const newSize = fs.statSync(webpPath).size;
                if (originalSize > newSize) {
                    results.bytesSaved += (originalSize - newSize);
                }

                results.optimizedCount++;
            } catch (err) {
                console.error(`[ImageService] Error optimizing ${dir}:`, err.message);
                results.errors++;
            }
        }
    }

    return results;
}

module.exports = {
    optimizeImageToWebP,
    generateThumbnailWebP,
    convertAllExistingPosters,
    MOVIES_DIR
};
