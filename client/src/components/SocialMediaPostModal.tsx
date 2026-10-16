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
    const [kuTitle, setKuTitle] = useState(movie.kurdishTitle || (movie.title === 'Kingdom of the Planet of the Apes' ? 'شانشینی هەسارەی مەیموونەکان' : movie.title));
    const [year, setYear] = useState(String(movie.year || '2024'));
    const [imdb, setImdb] = useState(String(movie.imdbRating || '7.0'));
    const [cefr, setCefr] = useState(movie.level || movie.languageMetrics?.cefrLevel || 'B1');
    const [genre, setGenre] = useState(movie.genre || 'ئاکشن، سەرکێشی، دراما');
    const [duration, setDuration] = useState(movie.duration || 'min 145');
    const [synopsis, setSynopsis] = useState(
        movie.description ||
        'ساڵانێکی زۆر دوای سەردەمی قەیسەر، مەیموونێکی گەنج دەچێتە گەشتێکەوە کە دەبێتە هۆی ئەوەی هەموو ئەو شتانەی کە فێری کراون دەربارەی ڕابردوو بخاتە ژێر پرسیارەوە و هەڵبژاردنێک بکات کە داهاتوویەک بۆ مەیموون و مرۆڤەکان دیاری بکات.'
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

#فیلمی_کوردی #ژێرنووسی_کوردی #فێربوونی_ئینگلیزی #KSTFilm #KurdishStream #${enTitle.replace(/\s+/g, '_')}`;

        navigator.clipboard.writeText(caption).then(() => {
            setCopiedCaption(true);
            setTimeout(() => setCopiedCaption(false), 2500);
        });
    };

    const handleDownload = async () => {
        setIsExporting(true);
        const canvas = canvasRef.current;
        if (!canvas) {
            setIsExporting(false);
            return;
        }

        // Wait for Arabic fonts to be ready
        try {
            await document.fonts.ready;
        } catch (e) {
            // ignore
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
        const isStory = ratio === 'story';

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
        vigGrad.addColorStop(0, 'rgba(0,0,0,0.65)');
        vigGrad.addColorStop(0.3, 'rgba(0,0,0,0.25)');
        vigGrad.addColorStop(0.8, 'rgba(0,0,0,0.75)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.96)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, width, height);

        // 2. Header Bar (RTL Balanced Layout)
        ctx.save();

        // Right side: Logo + Platform Name
        const logoBoxX = width - 120;
        const logoBoxY = isStory ? 60 : 50;
        ctx.fillStyle = primary;
        roundRect(ctx, logoBoxX, logoBoxY, 60, 60, 16);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', logoBoxX + 30, logoBoxY + 42);

        // Platform Name & Subtitle right next to the logo
        ctx.textAlign = 'right';
        ctx.font = '900 30px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('KST FILM', logoBoxX - 16, logoBoxY + 30);

        ctx.font = 'bold 18px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = primary;
        ctx.fillText('ئێستا بەردەستە لە وێبسایت بە کوالیتی بەرز', logoBoxX - 16, logoBoxY + 54);

        // Left side: Website Pill
        const pillX = 60;
        const pillY = isStory ? 65 : 55;
        const pillW = 230;
        const pillH = 50;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        roundRect(ctx, pillX, pillY, pillW, pillH, 25);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('🌐 kstfilm.com', pillX + (pillW / 2), pillY + 32);
        ctx.restore();

        // Header Divider
        const dividerY = isStory ? 145 : 135;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(60, dividerY);
        ctx.lineTo(width - 60, dividerY);
        ctx.stroke();

        // 3. Poster Card (Left side, matching Awena Film style)
        const posterX = 60;
        const posterY = isStory ? 190 : 170;
        const posterW = isStory ? 430 : 390;
        const posterH = isStory ? 645 : 585;

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

        // Gradient at the bottom of the poster for clean badge contrast
        const posterGrad = ctx.createLinearGradient(0, posterY + posterH - 120, 0, posterY + posterH);
        posterGrad.addColorStop(0, 'rgba(0,0,0,0)');
        posterGrad.addColorStop(1, 'rgba(0,0,0,0.88)');
        ctx.fillStyle = posterGrad;
        ctx.fillRect(posterX, posterY + posterH - 120, posterW, 120);

        ctx.restore();

        // Poster Border
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 3;
        roundRect(ctx, posterX, posterY, posterW, posterH, 24);
        ctx.stroke();
        ctx.restore();

        // 4K Badge (top right of poster)
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        roundRect(ctx, posterX + posterW - 96, posterY + 16, 80, 32, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('4K UHD', posterX + posterW - 56, posterY + 38);
        ctx.restore();

        // CEFR Level Badge bottom of poster
        if (hasCefr) {
            ctx.save();
            ctx.fillStyle = '#f59e0b';
            roundRect(ctx, posterX + 16, posterY + posterH - 52, posterW - 32, 40, 10);
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.font = '900 17px "Noto Sans Arabic", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`ئاستی زمانی ئینگلیزی: ${cefr}`, posterX + (posterW / 2), posterY + posterH - 26);
            ctx.restore();
        }

        // 4. Details Section (Right side in RTL)
        const detailX = width - 60;
        const detailW = (width - posterX - posterW - 90);
        let curY = isStory ? 220 : 195;

        ctx.save();
        ctx.textAlign = 'right';

        // English Title
        ctx.font = isStory ? '900 44px "Plus Jakarta Sans", sans-serif' : '900 38px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        const enLines = wrapText(ctx, enTitle, detailX, curY, detailW, isStory ? 52 : 46);
        curY += (enLines * (isStory ? 52 : 46)) + 12;

        // Kurdish Title
        ctx.font = isStory ? '900 36px "Noto Sans Arabic", sans-serif' : '900 32px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = primary;
        const kuLines = wrapText(ctx, kuTitle, detailX, curY, detailW, isStory ? 48 : 44);
        curY += (kuLines * (isStory ? 48 : 44)) + 20;

        // Metadata Pills Row (IMDb, Year, Duration) - ALL FIXED!
        const imdbW = 150;
        const imdbX = detailX - imdbW;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
        roundRect(ctx, imdbX, curY, imdbW, 46, 12);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#f59e0b';
        ctx.font = '900 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`★ ${imdb}`, imdbX + 48, curY + 30);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('IMDb', imdbX + 115, curY + 30);

        // Year Pill
        const yearW = 110;
        const yearX = imdbX - 14 - yearW;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        roundRect(ctx, yearX, curY, yearW, 46, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 19px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(year, yearX + (yearW / 2), curY + 30);

        // Duration Pill (FIXED: Solid white box removed, styled properly)
        const durW = 120;
        const durX = yearX - 14 - durW;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; // explicit fillStyle!
        roundRect(ctx, durX, curY, durW, 46, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(duration, durX + (durW / 2), curY + 30);

        curY += 72;

        // Genre Line
        ctx.textAlign = 'right';
        ctx.font = 'bold 20px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`ژانەر: ${genre}`, detailX, curY);

        curY += 36;

        // Feature Superpower Badges (Clean RTL alignment without emoji collision)
        const features = [];
        if (hasCefr) features.push({ icon: '🎓', text: `ئاستی زمان: ${cefr} (شیکاری وردی وشەسازی)` });
        if (hasDualSrt) features.push({ icon: '🔤', text: 'سەبتایتڵی دووانەی هاوکات (ئینگلیزی + کوردی)' });
        if (hasDict) features.push({ icon: '📖', text: 'فەرهەنگی زیرەک بە یەک کلیک لەسەر وشە' });

        const badgeH = isStory ? 50 : 44;
        features.forEach(f => {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            roundRect(ctx, detailX - detailW, curY, detailW, badgeH, 12);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Right accent strip
            ctx.fillStyle = primary;
            roundRect(ctx, detailX - 6, curY, 6, badgeH, 3);
            ctx.fill();

            // Icon
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(f.icon, detailX - 28, curY + (badgeH / 2) + 7);

            // Kurdish Text
            ctx.fillStyle = '#f1f5f9';
            ctx.font = 'bold 17px "Noto Sans Arabic", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(f.text, detailX - 54, curY + (badgeH / 2) + 6);

            curY += badgeH + 10;
        });

        ctx.restore();

        // 5. Synopsis Box (Dynamically sized, no massive void)
        const synBoxY = posterY + posterH + 25;
        const synBoxW = width - 120;
        
        ctx.save();
        ctx.font = '500 20px "Noto Sans Arabic", sans-serif';
        // Measure synopsis height
        const synLines = getWrappedLines(ctx, synopsis, synBoxW - 60);
        const maxSynLines = isStory ? 5 : 4;
        const visibleLines = synLines.slice(0, maxSynLines);
        const synBoxH = 65 + (visibleLines.length * 36) + 20;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        roundRect(ctx, 60, synBoxY, synBoxW, synBoxH, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.font = '900 22px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = primary;
        ctx.fillText('🎬  کورتەی چیرۆک:', width - 90, synBoxY + 42);

        ctx.font = '500 20px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = '#e2e8f0';
        let lineY = synBoxY + 82;
        visibleLines.forEach(l => {
            ctx.fillText(l, width - 90, lineY);
            lineY += 36;
        });
        ctx.restore();

        // 6. Format-Specific Middle Content (Story gets Feature Showcase, Post gets Feature Ribbon)
        if (isStory) {
            // Story (9:16) gets an elite Feature Showcase card filling the tall space gracefully
            const featCardY = synBoxY + synBoxH + 25;
            const featCardH = (height - 110) - featCardY - 20;

            if (featCardH > 180) {
                ctx.save();
                ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
                roundRect(ctx, 60, featCardY, synBoxW, featCardH, 22);
                ctx.fill();
                ctx.strokeStyle = `${primary}55`;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.textAlign = 'right';
                ctx.font = '900 22px "Noto Sans Arabic", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('⭐  تایبەتمەندییە ناوازەکانی ماڵپەڕی KST FILM:', width - 95, featCardY + 45);

                const storyPills = [
                    { icon: '🚀', title: 'بینینی بەرزترین کوالیتی (4K UHD & 1080p)', sub: 'پەخشی خێرا و بەبێ پچڕان بە سێرڤەری تایبەت' },
                    { icon: '🔤', title: 'سەبتایتڵی دووانەی هاوکات لەگەڵ فەرهەنگ', sub: 'فێربوونی ئینگلیزی بە کلیک لەسەر هەر وشەیەک' },
                    { icon: '📱', title: 'گونجاو بۆ مۆبایل، کۆمپیوتەر و تەلەفزیۆن', sub: 'بە بێ هیچ ڕیکلامێکی بێزارکەر بە خۆڕایی' },
                ];

                let pillTop = featCardY + 75;
                const pillItemH = Math.min(68, (featCardH - 145) / 3);

                storyPills.forEach(p => {
                    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
                    roundRect(ctx, 80, pillTop, synBoxW - 40, pillItemH, 14);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.stroke();

                    // Icon
                    ctx.font = '22px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.icon, width - 115, pillTop + (pillItemH / 2) + 8);

                    // Text
                    ctx.textAlign = 'right';
                    ctx.font = 'bold 17px "Noto Sans Arabic", sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(p.title, width - 150, pillTop + 26);

                    ctx.font = '500 14px "Noto Sans Arabic", sans-serif';
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillText(p.sub, width - 150, pillTop + 48);

                    pillTop += pillItemH + 10;
                });

                // Bottom CTA inside card
                ctx.textAlign = 'center';
                ctx.font = 'bold 18px "Noto Sans Arabic", sans-serif';
                ctx.fillStyle = primary;
                ctx.fillText('👉 بۆ بینینی ئەم فیلمە سەردانی ماڵپەڕی kstfilm.com بکەن', width / 2, featCardY + featCardH - 22);

                ctx.restore();
            }
        } else {
            // Post (4:5) format gets a sleek platform ribbon if space permits
            const ribbonY = synBoxY + synBoxH + 20;
            const ribbonH = (height - 95) - ribbonY;
            if (ribbonH >= 60) {
                ctx.save();
                ctx.fillStyle = 'rgba(2, 6, 23, 0.6)';
                roundRect(ctx, 60, ribbonY, synBoxW, Math.min(75, ribbonH), 16);
                ctx.fill();
                ctx.strokeStyle = `${primary}44`;
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.textAlign = 'center';
                ctx.font = 'bold 18px "Noto Sans Arabic", sans-serif';
                ctx.fillStyle = '#cbd5e1';
                ctx.fillText('🔥 تەواوی ئەم فیلمە بە کوالیتی بەرز و بێ ڕیکلام لە ماڵپەڕی کوردیش ستریم بەردەستە', width / 2, ribbonY + (Math.min(75, ribbonH) / 2) + 6);
                ctx.restore();
            }
        }

        // 7. Bottom Brand & Social Media Bar
        const footY = height - (isStory ? 80 : 75);
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        roundRect(ctx, 60, footY, width - 120, 54, 18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.font = '900 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🌐 kstfilm.com', width - 90, footY + 35);

        ctx.textAlign = 'center';
        ctx.font = 'bold 17px "Noto Sans Arabic", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('سەیری باشترین فیلمەکان بکە و ئینگلیزیەکەت بەهێز بکە', width / 2, footY + 34);

        ctx.textAlign = 'left';
        ctx.font = 'bold 19px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = primary;
        ctx.fillText('@kstfilm  📱 ✈️ 📷', 90, footY + 35);
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
        ctx.quadraticCurveTo(x, y + radius, x + radius, y);
        ctx.closePath();
    }

    function wrapText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number
    ): number {
        const words = text.split(' ');
        let line = '';
        let lineCount = 1;
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
                lineCount++;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
        return lineCount;
    }

    function getWrappedLines(
        ctx: CanvasRenderingContext2D,
        text: string,
        maxWidth: number
    ): string[] {
        const words = text.split(' ');
        const lines: string[] = [];
        let line = '';
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const testWidth = ctx.measureText(testLine).width;
            if (testWidth > maxWidth && n > 0) {
                lines.push(line.trim());
                line = words[n] + ' ';
            } else {
                line = testLine;
            }
        }
        if (line.trim()) {
            lines.push(line.trim());
        }
        return lines;
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                            <div className="social-input-group">
                                <label>ساڵ:</label>
                                <input type="text" value={year} onChange={e => setYear(e.target.value)} style={{ textAlign: 'center' }} />
                            </div>
                            <div className="social-input-group">
                                <label>نمرەی IMDb:</label>
                                <input type="text" value={imdb} onChange={e => setImdb(e.target.value)} style={{ textAlign: 'center', color: '#fbbf24', fontWeight: 'bold' }} />
                            </div>
                            <div className="social-input-group">
                                <label>ماوە (Duration):</label>
                                <input type="text" value={duration} onChange={e => setDuration(e.target.value)} style={{ textAlign: 'center' }} />
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

                        {/* Interactive Preview Container (Matching Canvas 1:1) */}
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
                            <div style={{ position: 'relative', zIndex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', gap: '8px' }}>
                                {/* Top Header: Right side logo, Left side website */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.12)', paddingBottom: '10px' }}>
                                    {/* Left: Website pill */}
                                    <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 'bold', color: '#e2e8f0' }}>
                                        🌐 kstfilm.com
                                    </div>

                                    {/* Right: Logo + Platform title */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '13px', fontWeight: '900', color: '#ffffff', letterSpacing: '0.5px' }}>KST FILM</div>
                                            <div style={{ fontSize: '9px', color: currentThemeData.primary, fontWeight: '700' }}>ئێستا بەردەستە بە کوالیتی بەرز</div>
                                        </div>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: currentThemeData.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: '900', fontSize: '14px' }}>
                                            ⚡
                                        </div>
                                    </div>
                                </div>

                                {/* Main Row: Poster on LEFT, Info on RIGHT (LTR grid container to match Canvas) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: '12px', alignItems: 'center', direction: 'ltr' }}>
                                    {/* Poster Card (Left) */}
                                    <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', border: '1.5px solid rgba(255, 255, 255, 0.25)', boxShadow: '0 10px 25px rgba(0,0,0,0.8)' }}>
                                        <img src={posterUrl} alt="Poster" style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
                                        <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.85)', fontSize: '8px', color: '#ffffff', padding: '2px 5px', borderRadius: '4px', fontWeight: '900', border: '1px solid rgba(255,255,255,0.2)' }}>
                                            4K UHD
                                        </div>
                                        {hasCefr && (
                                            <div style={{ position: 'absolute', bottom: '6px', left: '6px', right: '6px', background: '#f59e0b', color: '#0f172a', fontSize: '9px', fontWeight: '900', textAlign: 'center', padding: '2px 0', borderRadius: '6px' }}>
                                                ئاستی زمان: {cefr}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info (Right, with RTL text) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'right', direction: 'rtl' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '900', color: '#ffffff', lineHeight: '1.2' }} dir="ltr">{enTitle}</div>
                                        <div style={{ fontSize: '12px', fontWeight: '900', color: currentThemeData.primary }}>{kuTitle}</div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                                            <span style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#fbbf24', fontSize: '9px', padding: '1px 5px', borderRadius: '5px', fontWeight: 'bold' }}>
                                                ★ {imdb}
                                            </span>
                                            <span style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#ffffff', fontSize: '9px', padding: '1px 5px', borderRadius: '5px', fontWeight: 'bold' }}>
                                                {year}
                                            </span>
                                            <span style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#ffffff', fontSize: '9px', padding: '1px 5px', borderRadius: '5px', fontWeight: 'bold' }}>
                                                {duration}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: '600' }}>
                                            ژانەر: {genre}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '3px' }}>
                                            {hasCefr && (
                                                <div style={{ background: 'rgba(15, 23, 42, 0.75)', borderRight: `3px solid ${currentThemeData.primary}`, padding: '2px 6px', borderRadius: '4px', fontSize: '8.5px', color: '#f1f5f9', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>🎓</span>
                                                    <span>ئاستی زمان: {cefr}</span>
                                                </div>
                                            )}
                                            {hasDualSrt && (
                                                <div style={{ background: 'rgba(15, 23, 42, 0.75)', borderRight: `3px solid ${currentThemeData.primary}`, padding: '2px 6px', borderRadius: '4px', fontSize: '8.5px', color: '#f1f5f9', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>🔤</span>
                                                    <span>سەبتایتڵی دووانەی هاوکات</span>
                                                </div>
                                            )}
                                            {hasDict && (
                                                <div style={{ background: 'rgba(15, 23, 42, 0.75)', borderRight: `3px solid ${currentThemeData.primary}`, padding: '2px 6px', borderRadius: '4px', fontSize: '8.5px', color: '#f1f5f9', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>📖</span>
                                                    <span>فەرهەنگی زیرەک بە یەک کلیک</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Synopsis Card */}
                                <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: '8px 12px', fontSize: '10px', color: '#e2e8f0', lineHeight: '1.4' }}>
                                    <div style={{ color: currentThemeData.primary, fontWeight: 'bold', marginBottom: '2px', fontSize: '10px' }}>
                                        🎬 کورتەی چیرۆک:
                                    </div>
                                    <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: ratio === 'story' ? 4 : 3, WebkitBoxOrient: 'vertical' }}>
                                        {synopsis}
                                    </div>
                                </div>

                                {/* In Story Mode: Extra showcase box */}
                                {ratio === 'story' && (
                                    <div style={{ background: 'rgba(2, 6, 23, 0.75)', border: `1px solid ${currentThemeData.primary}55`, borderRadius: '12px', padding: '8px 10px', fontSize: '9px', color: '#cbd5e1' }}>
                                        <div style={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }}>⭐ تایبەتمەندییە ناوازەکانی ماڵپەڕ:</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <div>🚀 بینین بە کوالیتی 4K UHD بەبێ پچڕان</div>
                                            <div>🔤 سەبتایتڵی هاوکات و فێربوونی زمان</div>
                                            <div>📱 بە بێ ڕیکلام لە kstfilm.com</div>
                                        </div>
                                    </div>
                                )}

                                {/* Footer Bar */}
                                <div style={{ background: 'rgba(0, 0, 0, 0.85)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px' }}>
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
