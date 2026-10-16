import React, { useState, useRef } from 'react';
import {
    X, Download, Copy, Check, Sparkles, Star, Calendar,
    Film, Smartphone, Palette, ShieldCheck, Share2, Globe, Loader2
} from 'lucide-react';
import { Movie, getCefrDisplayLevel } from '../types';
import './SocialMediaPostModal.css';

interface SocialMediaPostModalProps {
    movie: Movie;
    onClose: () => void;
}

export const SocialMediaPostModal: React.FC<SocialMediaPostModalProps> = ({ movie, onClose }) => {
    const [ratio, setRatio] = useState<'post' | 'story'>('post');
    const [theme, setTheme] = useState<'emerald' | 'cyan' | 'amber' | 'crimson'>('emerald');
    
    // Editable state pre-filled from movie
    const [enTitle, setEnTitle] = useState(movie.title || 'Kingdom of the Planet of the Apes');
    const [kuTitle, setKuTitle] = useState(movie.kurdishTitle || (movie.title === 'Kingdom of the Planet of the Apes' ? 'شانشینی هەسارەی مەيموونەکان' : movie.title));
    const [year, setYear] = useState(String(movie.year || '2024'));
    const [imdb, setImdb] = useState(String(movie.imdbRating || '7.0'));
    const [cefr, setCefr] = useState(movie.level || movie.languageMetrics?.cefrLevel || 'B1');
    const [genre, setGenre] = useState(movie.genre || 'ئاکشن - زانستی خەیاڵی');
    const [duration, setDuration] = useState(movie.duration || '2h 25m');
    const [synopsis, setSynopsis] = useState(
        movie.description ||
        'ساڵانێکی زۆر دوای سەردەمی قەیسەر، مەيموونێکی گەنج دەچێتە گەشتێکەوە کە دەبێتە هۆی ئەوەی هەموو ئەو شتانەی کە فێری کراون دەربارەی ڕابردوو بخاتە ژێر پرسیارەوە و هەڵبژاردنێک بکات کە داهاتوویەک بۆ مەيموون و مرۆڤەکان دیاری بکات.'
    );

    const [hasDualSrt, setHasDualSrt] = useState(true);
    const [hasDict, setHasDict] = useState(true);
    const [hasCefr, setHasCefr] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [copiedCaption, setCopiedCaption] = useState(false);

    const posterUrl = movie.posterCloudUrl || movie.posterUrl || '/posters/kingdom_apes.jpg';
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Theme definitions
    const themeStyles = {
        emerald: {
            name: 'شێوازی ئاوێنە (Emerald)',
            primary: '#10b981',
            secondary: '#059669',
            darkTop: '#064e3b',
            darkBottom: '#02140e',
            bgGradient: 'radial-gradient(circle at 80% 20%, rgba(16, 185, 129, 0.22) 0%, rgba(6, 78, 59, 0.45) 45%, #03140e 100%)',
            dot: '#10b981'
        },
        cyan: {
            name: 'کەی ئێس تی (Neon Cyan)',
            primary: '#06b6d4',
            secondary: '#0284c7',
            darkTop: '#0e7490',
            darkBottom: '#03121e',
            bgGradient: 'radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.22) 0%, rgba(14, 116, 144, 0.4) 45%, #030d1a 100%)',
            dot: '#06b6d4'
        },
        amber: {
            name: 'کوردسەبتایتڵ (Amber)',
            primary: '#f59e0b',
            secondary: '#d97706',
            darkTop: '#92400e',
            darkBottom: '#1c0a02',
            bgGradient: 'radial-gradient(circle at 80% 20%, rgba(245, 158, 11, 0.25) 0%, rgba(180, 83, 9, 0.45) 45%, #150903 100%)',
            dot: '#f59e0b'
        },
        crimson: {
            name: 'کوردسینەما (Crimson)',
            primary: '#ef4444',
            secondary: '#dc2626',
            darkTop: '#991b1b',
            darkBottom: '#180404',
            bgGradient: 'radial-gradient(circle at 80% 20%, rgba(239, 68, 68, 0.25) 0%, rgba(153, 27, 27, 0.45) 45%, #130404 100%)',
            dot: '#ef4444'
        }
    };

    const currentThemeData = themeStyles[theme];

    const copyPostCaption = () => {
        const caption = `🔥 فیلمی نوێ بە سەبتایتڵی کوردی و فێربوونی ئینگلیزی لە کوردیش ستریم:

🎬 ناوی فیلم: ${kuTitle} (${enTitle})
📅 ساڵی دەرچوون: ${year}
⭐ نمرەی IMDb: ${imdb}/10
🎓 ئاستی زمانی ئینگلیزی: ${cefr}
🔤 خاوەنی سەبتایتڵی دووانەی هاوکات (ئینگلیزی + کوردی)
📖 کلیک لەسەر وشەکان بکە لە کاتی سەیرکردندا بۆ فەرهەنگ و مانای وشەکان!

📝 کورتەی چیرۆک:
${synopsis}

🍿 ئێستا بینەری بە بە کوالیتی بەرز و بێ ڕیکلام لە ڕێگەی ماڵپەڕی فەرمی:
🌐 https://kstfilm.com

#فیلمی_کوردی #ژێرنووسی_کوردی #فێربوونی_ئینگلیزی #KSTFilm #KurdishStream #${enTitle.replace(/\\s+/g, '_')}`;

        navigator.clipboard.writeText(caption).then(() => {
            setCopiedCaption(true);
            setTimeout(() => setCopiedCaption(false), 2500);
        });
    };

    const handleDownload = () => {
        setIsExporting(true);
        const canvas = canvasRef.current;
        if (!canvas) {
            setIsExporting(false);
            return;
        }

        const width = 1080;
        const height = ratio === 'post' ? 1350 : 1920;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setIsExporting(false);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';

        // Proxy external image to prevent CORS taint
        const safePosterSrc = posterUrl.startsWith('http')
            ? `/api/proxy-image?url=${encodeURIComponent(posterUrl)}`
            : posterUrl;

        img.onload = () => {
            renderCanvas(ctx, img, width, height);
            setTimeout(() => {
                const link = document.createElement('a');
                const cleanName = enTitle.replace(/[^a-zA-Z0-9]/g, '_');
                link.download = `KSTFilm_${cleanName}_${ratio}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                setIsExporting(false);
            }, 300);
        };

        img.onerror = () => {
            // Draw without image fallback
            renderCanvas(ctx, null, width, height);
            setTimeout(() => {
                const link = document.createElement('a');
                const cleanName = enTitle.replace(/[^a-zA-Z0-9]/g, '_');
                link.download = `KSTFilm_${cleanName}_${ratio}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                setIsExporting(false);
            }, 300);
        };

        img.src = safePosterSrc;
    };

    const renderCanvas = (
        ctx: CanvasRenderingContext2D,
        posterImg: HTMLImageElement | null,
        width: number,
        height: number
    ) => {
        const { primary, darkTop, darkBottom } = currentThemeData;

        // 1. Radial Background
        const bgGrad = ctx.createRadialGradient(width * 0.8, height * 0.2, 50, width * 0.5, height * 0.5, width);
        bgGrad.addColorStop(0, darkTop);
        bgGrad.addColorStop(0.5, darkBottom);
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Backdrop blurred poster overlay
        if (posterImg) {
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.drawImage(posterImg, 0, 0, width, height);
            ctx.restore();
        }

        // Vignette Overlay
        const vigGrad = ctx.createLinearGradient(0, 0, 0, height);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
        vigGrad.addColorStop(0.3, 'rgba(0,0,0,0.2)');
        vigGrad.addColorStop(0.8, 'rgba(0,0,0,0.7)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, width, height);

        // 2. Header Bar
        ctx.save();
        ctx.fillStyle = primary;
        roundRect(ctx, 60, 50, 60, 60, 16);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', 90, 92);

        ctx.textAlign = 'right';
        ctx.font = '900 30px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('KST FILM', 420, 80);

        ctx.font = 'bold 20px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = primary;
        ctx.fillText('ئێستا بەردەستە لە وێبسایت بە کوالیتی بەرز', 420, 110);

        // Website Pill
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        roundRect(ctx, width - 340, 55, 280, 50, 25);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('🌐 kstfilm.com', width - 200, 88);
        ctx.restore();

        // Divider
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(60, 140);
        ctx.lineTo(width - 60, 140);
        ctx.stroke();

        // 3. Poster Card (Right side in RTL)
        const posterX = 60;
        const posterY = 180;
        const posterW = 380;
        const posterH = 560;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 20;

        roundRect(ctx, posterX, posterY, posterW, posterH, 24);
        ctx.clip();
        if (posterImg) {
            ctx.drawImage(posterImg, posterX, posterY, posterW, posterH);
        } else {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(posterX, posterY, posterW, posterH);
        }
        ctx.restore();

        // Poster Border
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 3;
        roundRect(ctx, posterX, posterY, posterW, posterH, 24);
        ctx.stroke();
        ctx.restore();

        // 4K Badge
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        roundRect(ctx, posterX + posterW - 100, posterY + 16, 84, 34, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('4K UHD', posterX + posterW - 58, posterY + 39);
        ctx.restore();

        // Level Badge bottom of poster
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        roundRect(ctx, posterX + 16, posterY + posterH - 56, posterW - 32, 42, 12);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = '900 18px "Noto Sans Arabic", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`ئاستی زمانی ئینگلیزی: ${cefr}`, posterX + (posterW / 2), posterY + posterH - 28);
        ctx.restore();

        // 4. Details Section (Left side in RTL)
        const detailX = width - 60;
        let curY = 220;

        ctx.save();
        ctx.textAlign = 'right';

        // English Title
        ctx.font = '900 42px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        wrapText(ctx, enTitle, detailX, curY, 520, 50);

        curY += 105;

        // Kurdish Title
        ctx.font = '900 36px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = primary;
        wrapText(ctx, kuTitle, detailX, curY, 520, 48);

        curY += 80;

        // Metadata Pills
        ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
        roundRect(ctx, detailX - 160, curY, 160, 48, 12);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = '900 22px sans-serif';
        ctx.fillText(`★ ${imdb}`, detailX - 45, curY + 32);
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('IMDb', detailX - 120, curY + 32);

        // Year Pill
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        roundRect(ctx, detailX - 300, curY, 120, 48, 12);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(year, detailX - 225, curY + 32);

        // Duration Pill
        roundRect(ctx, detailX - 440, curY, 120, 48, 12);
        ctx.fill();
        ctx.font = '800 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(duration, detailX - 365, curY + 32);

        curY += 85;

        // Genre Line
        ctx.font = 'bold 22px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`ژانەر: ${genre}`, detailX, curY);

        curY += 45;

        // Feature Superpower Badges
        const features = [];
        if (hasCefr) features.push({ icon: '🎓', text: `ئاستی زمان: ${cefr} (شیکاری وردی وشەسازی)` });
        if (hasDualSrt) features.push({ icon: '🔤', text: 'سەبتایتڵی دووانەی هاوکات (ئینگلیزی + کوردی)' });
        if (hasDict) features.push({ icon: '📖', text: 'فەرهەنگی زیرەک بە یەک کلیک لەسەر وشە' });

        features.forEach(f => {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
            roundRect(ctx, detailX - 520, curY, 520, 46, 12);
            ctx.fill();
            ctx.fillStyle = primary;
            roundRect(ctx, detailX - 6, curY, 6, 46, 3);
            ctx.fill();

            ctx.fillStyle = '#f1f5f9';
            ctx.font = 'bold 18px "Noto Sans Arabic", sans-serif';
            ctx.fillText(`${f.icon}  ${f.text}`, detailX - 25, curY + 30);
            curY += 56;
        });

        ctx.restore();

        // 5. Synopsis Box at bottom
        const synBoxY = posterY + posterH + 30;
        const synBoxH = (height - synBoxY) - 130;

        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        roundRect(ctx, 60, synBoxY, width - 120, synBoxH, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.font = '900 22px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = primary;
        ctx.fillText('🎬  کورتەی چیرۆک:', width - 90, synBoxY + 45);

        ctx.font = '500 20px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = '#e2e8f0';
        wrapText(ctx, synopsis, width - 90, synBoxY + 90, width - 180, 36);
        ctx.restore();

        // 6. Bottom Brand & Social Media Bar
        const footY = height - 85;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        roundRect(ctx, 60, footY, width - 120, 60, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.font = '900 24px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🌐 kstfilm.com', width - 90, footY + 40);

        ctx.textAlign = 'center';
        ctx.font = 'bold 18px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('سەیری باشترین فیلمەکان بکە و ئینگلیزیەکەت بەهێز بکە', width / 2, footY + 38);

        ctx.textAlign = 'left';
        ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = primary;
        ctx.fillText('@kstfilm  📱 ✈️ 📷', 90, footY + 40);
        ctx.restore();
    };

    function roundRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number
    ) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    function wrapText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number
    ) {
        const words = text.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
    }

    return (
        <div className="social-modal-backdrop" onClick={onClose}>
            <div className="social-modal-card" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="social-modal-header">
                    <div className="social-modal-header-left">
                        <div className="social-icon-bubble">
                            <Share2 size={22} />
                        </div>
                        <div>
                            <h3 className="social-modal-title">
                                دیزاینەری پۆست و ستۆری سۆشیال میدیا 📱
                                <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: '999px', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                                    KST Edition
                                </span>
                            </h3>
                            <p className="social-modal-subtitle">
                                دروستکردنی پۆست و گرافیکی تایبەت بە پەیجەکانی ئینستاگرام، فەیسبووک و تیلیگرام بە یەک کلیک
                            </p>
                        </div>
                    </div>
                    <button type="button" className="social-modal-close-btn" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Body: Controls (Right in RTL) & Preview (Left in RTL) */}
                <div className="social-modal-body">
                    {/* Controls Column */}
                    <div className="social-controls-col">
                        {/* Aspect Ratio */}
                        <div>
                            <div className="social-section-title">قەبارەی وێنە (Aspect Ratio):</div>
                            <div className="social-ratio-toggle">
                                <button
                                    type="button"
                                    className={`social-ratio-btn ${ratio === 'post' ? 'active' : ''}`}
                                    onClick={() => setRatio('post')}
                                >
                                    <Film size={15} />
                                    <span>پۆستی فید (4:5)</span>
                                </button>
                                <button
                                    type="button"
                                    className={`social-ratio-btn ${ratio === 'story' ? 'active' : ''}`}
                                    onClick={() => setRatio('story')}
                                >
                                    <Smartphone size={15} />
                                    <span>ستۆری و ڕیڵز (9:16)</span>
                                </button>
                            </div>
                        </div>

                        {/* Theme Picker */}
                        <div>
                            <div className="social-section-title">تیمی ڕەنگەکان (Theme Preset):</div>
                            <div className="social-theme-grid">
                                {(Object.keys(themeStyles) as Array<keyof typeof themeStyles>).map(k => (
                                    <button
                                        key={k}
                                        type="button"
                                        className={`social-theme-btn ${theme === k ? 'active' : ''}`}
                                        onClick={() => setTheme(k)}
                                    >
                                        <span className="social-theme-dot" style={{ background: themeStyles[k].dot }} />
                                        <span>{themeStyles[k].name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <hr style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }} />

                        {/* Editable Fields */}
                        <div className="social-input-group">
                            <label>ناوی ئینگلیزی:</label>
                            <input type="text" value={enTitle} onChange={e => setEnTitle(e.target.value)} dir="ltr" />
                        </div>

                        <div className="social-input-group">
                            <label>ناوی کوردی:</label>
                            <input type="text" value={kuTitle} onChange={e => setKuTitle(e.target.value)} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                            <div className="social-input-group">
                                <label>ساڵ:</label>
                                <input type="text" value={year} onChange={e => setYear(e.target.value)} style={{ textAlign: 'center' }} />
                            </div>
                            <div className="social-input-group">
                                <label>نمرەی IMDb:</label>
                                <input type="text" value={imdb} onChange={e => setImdb(e.target.value)} style={{ textAlign: 'center', color: '#fbbf24', fontWeight: 'bold' }} />
                            </div>
                            <div className="social-input-group">
                                <label>ئاستی CEFR:</label>
                                <select value={cefr} onChange={e => setCefr(e.target.value)} style={{ textAlign: 'center', color: '#38bdf8', fontWeight: 'bold' }}>
                                    <option value="A1">A1</option>
                                    <option value="A2">A2</option>
                                    <option value="B1">B1</option>
                                    <option value="B2">B2</option>
                                    <option value="C1">C1</option>
                                    <option value="C2">C2</option>
                                </select>
                            </div>
                        </div>

                        <div className="social-input-group">
                            <label>ژانەر:</label>
                            <input type="text" value={genre} onChange={e => setGenre(e.target.value)} />
                        </div>

                        {/* Special features checkboxes */}
                        <div style={{ background: 'rgba(2, 6, 23, 0.5)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '2px' }}>تایبەتمەندییەکانی ماڵپەڕ لەسەر پۆست:</div>
                            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e2e8f0' }}>
                                <input type="checkbox" checked={hasDualSrt} onChange={e => setHasDualSrt(e.target.checked)} />
                                <span>سەبتایتڵی دووانەی هاوکات (ئینگلیزی + کوردی)</span>
                            </label>
                            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e2e8f0' }}>
                                <input type="checkbox" checked={hasDict} onChange={e => setHasDict(e.target.checked)} />
                                <span>فەرهەنگی دەستبەجێ بە یەک کلیک</span>
                            </label>
                            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e2e8f0' }}>
                                <input type="checkbox" checked={hasCefr} onChange={e => setHasCefr(e.target.checked)} />
                                <span>ئاستی زمانی ئینگلیزی (CEFR {cefr})</span>
                            </label>
                        </div>

                        <div className="social-input-group">
                            <label>کورتەی چیرۆک:</label>
                            <textarea rows={3} value={synopsis} onChange={e => setSynopsis(e.target.value)} />
                        </div>
                    </div>

                    {/* Preview Column */}
                    <div className="social-preview-col">
                        <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: currentThemeData.primary }} />
                            <span>پێشبینینی ڕاستەوخۆ ({ratio === 'post' ? '1080 × 1350' : '1080 × 1920'}):</span>
                        </div>

                        {/* Interactive Preview Container */}
                        <div
                            className={`social-preview-wrapper ${ratio === 'post' ? 'aspect-post' : 'aspect-story'}`}
                            style={{
                                background: currentThemeData.bgGradient
                            }}
                        >
                            {/* Ambient background */}
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    backgroundImage: `url(${posterUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    filter: 'blur(16px)',
                                    opacity: 0.25,
                                    transform: 'scale(1.1)',
                                    pointerEvents: 'none'
                                }}
                            />

                            {/* Content */}
                            <div style={{ position: 'relative', zIndex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                                {/* Top Header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.12)', paddingBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: currentThemeData.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: '900', fontSize: '14px' }}>
                                            ⚡
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: '900', color: '#ffffff', letterSpacing: '0.5px' }}>KST FILM</div>
                                            <div style={{ fontSize: '9.5px', color: currentThemeData.primary, fontWeight: '700' }}>ئێستا بەردەستە بە کوالیتی بەرز</div>
                                        </div>
                                    </div>
                                    <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 'bold', color: '#e2e8f0' }}>
                                        kstfilm.com
                                    </div>
                                </div>

                                {/* Main Row: Poster + Info */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px', alignItems: 'center', margin: '10px 0' }}>
                                    {/* Poster Card */}
                                    <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', border: '1.5px solid rgba(255, 255, 255, 0.25)', boxShadow: '0 10px 25px rgba(0,0,0,0.8)' }}>
                                        <img src={posterUrl} alt="Poster" style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
                                        <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.8)', fontSize: '8.5px', color: '#ffffff', padding: '2px 5px', borderRadius: '4px', fontWeight: '900' }}>
                                            4K UHD
                                        </div>
                                        <div style={{ position: 'absolute', bottom: '6px', left: '6px', right: '6px', background: '#f59e0b', color: '#0f172a', fontSize: '9px', fontWeight: '900', textAlign: 'center', padding: '2px 0', borderRadius: '6px' }}>
                                            ئاستی زمان: {cefr}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'right' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '900', color: '#ffffff', lineHeight: '1.2' }}>{enTitle}</div>
                                        <div style={{ fontSize: '12px', fontWeight: '900', color: currentThemeData.primary }}>{kuTitle}</div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginTop: '2px' }}>
                                            <span style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#fbbf24', fontSize: '9.5px', padding: '1px 6px', borderRadius: '6px', fontWeight: 'bold' }}>
                                                ★ {imdb}
                                            </span>
                                            <span style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', fontSize: '9.5px', padding: '1px 6px', borderRadius: '6px', fontWeight: 'bold' }}>
                                                {year}
                                            </span>
                                            <span style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', fontSize: '9.5px', padding: '1px 6px', borderRadius: '6px', fontWeight: 'bold' }}>
                                                {duration}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>
                                            ژانەر: {genre}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                            {hasCefr && (
                                                <div style={{ background: 'rgba(245, 158, 11, 0.15)', borderRight: '2px solid #f59e0b', padding: '2px 6px', borderRadius: '4px', fontSize: '9.5px', color: '#fbbf24', fontWeight: 'bold' }}>
                                                    🎓 ئاستی زمان: {cefr}
                                                </div>
                                            )}
                                            {hasDualSrt && (
                                                <div style={{ background: 'rgba(16, 185, 129, 0.15)', borderRight: '2px solid #10b981', padding: '2px 6px', borderRadius: '4px', fontSize: '9.5px', color: '#34d399', fontWeight: 'bold' }}>
                                                    🔤 سەبتایتڵی دووانەی هاوکات
                                                </div>
                                            )}
                                            {hasDict && (
                                                <div style={{ background: 'rgba(6, 182, 212, 0.15)', borderRight: '2px solid #06b6d4', padding: '2px 6px', borderRadius: '4px', fontSize: '9.5px', color: '#22d3ee', fontWeight: 'bold' }}>
                                                    📖 فەرهەنگی زیرەکی وشەکان
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Synopsis Card */}
                                <div style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: '8px 12px', fontSize: '10px', color: '#e2e8f0', lineHeight: '1.4' }}>
                                    <div style={{ color: currentThemeData.primary, fontWeight: 'bold', marginBottom: '2px', fontSize: '10px' }}>
                                        🎬 کورتەی چیرۆک:
                                    </div>
                                    <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                        {synopsis}
                                    </div>
                                </div>

                                {/* Footer Bar */}
                                <div style={{ background: 'rgba(0, 0, 0, 0.7)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', marginTop: '6px' }}>
                                    <span style={{ color: '#ffffff', fontWeight: 'bold' }}>🌐 kstfilm.com</span>
                                    <span style={{ color: currentThemeData.primary, fontWeight: 'bold' }}>@kstfilm 📱 ✈️ 📷</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="social-modal-footer">
                    <button type="button" className="social-btn-caption" onClick={copyPostCaption}>
                        {copiedCaption ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
                        <span>{copiedCaption ? 'کەپشن کۆپی کرا! ✓' : 'کۆپیکردنی دەقی پۆست (Caption)'}</span>
                    </button>

                    <button type="button" className="social-btn-download" onClick={handleDownload} disabled={isExporting}>
                        {isExporting ? <Loader2 size={16} className="spinning" /> : <Download size={16} />}
                        <span>{isExporting ? 'وێنەکە ئامادە دەکرێت...' : 'داگرتنی وێنەی HD (PNG)'}</span>
                    </button>
                </div>
            </div>

            {/* Hidden canvas for PNG export */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
};

export default SocialMediaPostModal;
