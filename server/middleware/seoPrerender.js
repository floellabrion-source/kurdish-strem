const path = require('path');
const fs = require('fs');

const BOT_USER_AGENTS = [
    'googlebot',
    'google-inspectiontool',
    'bingbot',
    'yandex',
    'baiduspider',
    'twitterbot',
    'facebookexternalhit',
    'rogerbot',
    'linkedinbot',
    'embedly',
    'quora link preview',
    'showyoubot',
    'outbrain',
    'pinterest',
    'slackbot',
    'vkshare',
    'w3c_validator',
    'whatsapp',
    'telegrambot',
    'discordbot',
    'applebot',
    'duckduckbot'
];

function isSearchBot(userAgent = '') {
    if (!userAgent) return false;
    const ua = userAgent.toLowerCase();
    return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

function escapeHtml(str = '') {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const seoPrerender = (db) => {
    return (req, res, next) => {
        const userAgent = req.headers['user-agent'] || '';
        if (!isSearchBot(userAgent)) {
            return next();
        }

        const url = req.path;
        const movieMatch = url.match(/^\/(?:movie|series|watch)\/([a-zA-Z0-9_-]+)/);

        if (!movieMatch) {
            return next();
        }

        const movieId = movieMatch[1];
        try {
            const movies = db.getMovies() || [];
            const movie = movies.find(m => String(m.id) === String(movieId));

            if (!movie) {
                return next();
            }

            const isSeries = movie.type === 'series';
            const typeLabel = isSeries ? 'زنجیرەی' : 'فیلمی';
            const pageTitle = `${movie.title} ${movie.kurdishTitle ? '(' + movie.kurdishTitle + ')' : ''} بە ژێرنووسی کوردی | KST Film`;
            const metaDescription = `سەیرکردنی ${typeLabel} ${movie.title} (${movie.year || ''}) بە ژێرنووسی کوردی و ئینگلیزی دووانە بە بەرزترین کوالیتی لە کەی ئێس تی فیلم (kstfilm.com). ${movie.description || movie.kurdishDescription || 'بینینی بێبەرامبەر بە باشترین سێرڤەر و کوالیتی بەرز.'}`;
            const canonicalUrl = `https://kstfilm.com/${isSeries ? 'series' : 'movie'}/${movie.id}`;
            const posterUrl = movie.posterCloudUrl || (movie.posterUrl ? (movie.posterUrl.startsWith('http') ? movie.posterUrl : `https://kstfilm.com${movie.posterUrl}`) : 'https://kstfilm.com/kst-logo.png');

            const schemaData = {
                "@context": "https://schema.org",
                "@type": isSeries ? "TVSeries" : "Movie",
                "name": movie.title,
                "alternateName": movie.kurdishTitle || movie.title,
                "url": canonicalUrl,
                "image": posterUrl,
                "description": movie.description || metaDescription,
                "datePublished": String(movie.year || '2024'),
                "genre": movie.genre || 'Action',
                "inLanguage": ["ckb", "en"],
                "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": String(movie.imdbRating || '7.8'),
                    "bestRating": "10",
                    "ratingCount": "250"
                }
            };

            const html = `<!DOCTYPE html>
<html lang="ckb" dir="rtl">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(metaDescription)}" />
    <meta name="keywords" content="${escapeHtml(movie.title)}, ${escapeHtml(movie.kurdishTitle || '')}, ژێرنووسی کوردی, فیلمی کوردی, kstfilm, kst film, ${escapeHtml(movie.genre || '')}" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

    <!-- OpenGraph -->
    <meta property="og:type" content="video.movie" />
    <meta property="og:site_name" content="KST Film (کەی ئێس تی فیلم)" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(metaDescription)}" />
    <meta property="og:image" content="${escapeHtml(posterUrl)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(metaDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(posterUrl)}" />

    <!-- Google Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    ${JSON.stringify(schemaData, null, 2)}
    </script>
</head>
<body style="font-family: system-ui, sans-serif; background: #09090b; color: #ffffff; padding: 20px;">
    <h1>${escapeHtml(movie.title)} ${movie.kurdishTitle ? ' - ' + escapeHtml(movie.kurdishTitle) : ''}</h1>
    <p><strong>جۆر:</strong> ${escapeHtml(movie.type === 'series' ? 'زنجیرە' : 'فیلم')}</p>
    <p><strong>ساڵ:</strong> ${escapeHtml(movie.year || '')} | <strong>کاتی خایاندن:</strong> ${escapeHtml(movie.duration || '')} | <strong>ڕەیتینگی IMDb:</strong> ⭐ ${escapeHtml(movie.imdbRating || '')}</p>
    <p><strong>چیرۆک:</strong> ${escapeHtml(movie.description || metaDescription)}</p>
    <p><strong>بەستەری سەیرکردن:</strong> <a href="${escapeHtml(canonicalUrl)}" style="color: #22d3ee;">${escapeHtml(canonicalUrl)}</a></p>
    <img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(movie.title)}" style="max-width: 300px; border-radius: 8px;" />
</body>
</html>`;

            res.header('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        } catch (e) {
            return next();
        }
    };
};

module.exports = { seoPrerender };
