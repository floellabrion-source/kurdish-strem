import React from 'react';
import { Download, X, Share2, PlusSquare, Smartphone, Sparkles, CheckCircle2 } from 'lucide-react';
import { usePwa } from '../context/PwaContext';
import { useLanguage } from '../context/LanguageContext';
import './PWAInstallPrompt.css';

export const PWAInstallPrompt: React.FC = () => {
    const { 
        isInstalled, 
        isBannerVisible, 
        showInstallModal, 
        isIOS, 
        promptInstall, 
        openInstallGuide, 
        closeInstallGuide, 
        dismissBanner 
    } = usePwa();
    const { lang } = useLanguage();

    if (isInstalled) return null;

    const handleInstallClick = async () => {
        if (isIOS) {
            openInstallGuide();
        } else {
            await promptInstall();
        }
    };

    return (
        <>
            {/* FLOATING PWA INSTALL BANNER */}
            {isBannerVisible && (
                <div className="pwa-floating-banner">
                    <div className="pwa-banner-content">
                        <div className="pwa-app-icon-wrap">
                            <img src="/kst-logo.png" alt="KST" className="pwa-app-icon" />
                            <span className="pwa-badge-pulse" />
                        </div>
                        <div className="pwa-text-info">
                            <div className="pwa-title-row">
                                <h4>{lang === 'en' ? 'Install KST App' : 'ئەپڵیکەیشنی KST'}</h4>
                                <span className="pwa-fast-tag">
                                    <Sparkles size={11} /> {lang === 'en' ? 'Fast App' : 'ئەپی خێرا'}
                                </span>
                            </div>
                            <p>
                                {lang === 'en' 
                                    ? 'Install app on your phone for faster streaming & full screen' 
                                    : 'بە یەک کلیک ئەپەکە دابەزێنە بۆ پەخشی خێراتر و بەبێ براوزەر'}
                            </p>
                        </div>
                    </div>

                    <div className="pwa-banner-actions">
                        <button className="pwa-install-btn" onClick={handleInstallClick}>
                            <Download size={16} />
                            <span>{lang === 'en' ? 'Install' : 'داگرتن'}</span>
                        </button>
                        <button className="pwa-dismiss-btn" onClick={dismissBanner} title={lang === 'en' ? 'Dismiss' : 'داخستن'}>
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP-BY-STEP INSTALL GUIDE MODAL (IOS & ANDROID / DESKTOP) */}
            {showInstallModal && (
                <div className="pwa-modal-overlay" onClick={closeInstallGuide}>
                    <div className="pwa-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="pwa-modal-header">
                            <div className="pwa-modal-title-box">
                                <div className="pwa-modal-icon-wrap">
                                    <Smartphone size={22} color="#a855f7" />
                                </div>
                                <div>
                                    <h3>
                                        {isIOS 
                                            ? (lang === 'en' ? 'Install on iPhone / iPad (Safari)' : 'داگرتنی ئەپ لەسەر ئایفۆن و ئایپاد')
                                            : (lang === 'en' ? 'Install on Android / Chrome' : 'داگرتنی ئەپ لەسەر ئەندرۆید و کۆمپیوتەر')}
                                    </h3>
                                    <p>
                                        {isIOS 
                                            ? (lang === 'en' ? 'Follow these 3 easy steps in Safari' : 'لە براوزەری سەفاری ئەم ٣ هەنگاوە ئاسانە جێبەجێ بکە')
                                            : (lang === 'en' ? 'Follow these 3 simple steps in Chrome' : 'لە براوزەری مۆبایلەکەتدا ئەم ٣ هەنگاوە جێبەجێ بکە')}
                                    </p>
                                </div>
                            </div>
                            <button className="pwa-modal-close-btn" onClick={closeInstallGuide}>
                                <X size={20} />
                            </button>
                        </div>

                        {isIOS ? (
                            <div className="pwa-steps-list">
                                {/* IOS STEP 1 */}
                                <div className="pwa-step-item">
                                    <div className="pwa-step-number">١</div>
                                    <div className="pwa-step-details">
                                        <h4>{lang === 'en' ? 'Tap the Share Button' : 'دەست لە دوگمەی هاوبەشکردن (Share) بنێ'}</h4>
                                        <p>{lang === 'en' ? 'Look for the share icon at the bottom of Safari' : 'لە خوارەوەی سەفاری کلیک لە ئایکۆنی شەیر بکە'}</p>
                                    </div>
                                    <div className="pwa-step-visual">
                                        <Share2 size={22} color="#38bdf8" />
                                    </div>
                                </div>

                                {/* IOS STEP 2 */}
                                <div className="pwa-step-item">
                                    <div className="pwa-step-number">٢</div>
                                    <div className="pwa-step-details">
                                        <h4>{lang === 'en' ? 'Select "Add to Home Screen"' : 'هەڵبژاردنی "Add to Home Screen"'}</h4>
                                        <p>{lang === 'en' ? 'Scroll down the list and tap Add to Home Screen' : 'بڕۆ خوارەوە و دەست لە (زیادکردن بۆ پەڕەی سەرەکی) بنێ'}</p>
                                    </div>
                                    <div className="pwa-step-visual">
                                        <PlusSquare size={22} color="#a855f7" />
                                    </div>
                                </div>

                                {/* IOS STEP 3 */}
                                <div className="pwa-step-item">
                                    <div className="pwa-step-number">٣</div>
                                    <div className="pwa-step-details">
                                        <h4>{lang === 'en' ? 'Tap "Add" at the Top Right' : 'کلیک لە "Add" بکە لە سەرەوەی لای ڕاست'}</h4>
                                        <p>{lang === 'en' ? 'Done! KST icon will appear on your screen' : 'پیرۆزە! ئایکۆنی KST لەسەر شاشەی مۆبایلەکەت دادەنیشێت'}</p>
                                    </div>
                                    <div className="pwa-step-visual">
                                        <CheckCircle2 size={22} color="#22c55e" />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="pwa-steps-list">
                                {/* ANDROID STEP 1 */}
                                <div className="pwa-step-item">
                                    <div className="pwa-step-number">١</div>
                                    <div className="pwa-step-details">
                                        <h4>{lang === 'en' ? 'Tap the 3 Dots Menu (⋮)' : 'کلیک لە سێ خاڵەکەی سەرەوە (⋮) بکە'}</h4>
                                        <p>{lang === 'en' ? 'Open browser menu at top right corner' : 'مینیۆی براوزەرەکەت لە سەرەوەی لای ڕاست بکەرەوە'}</p>
                                    </div>
                                    <div className="pwa-step-visual">
                                        <Sparkles size={22} color="#38bdf8" />
                                    </div>
                                </div>

                                {/* ANDROID STEP 2 */}
                                <div className="pwa-step-item">
                                    <div className="pwa-step-number">٢</div>
                                    <div className="pwa-step-details">
                                        <h4>{lang === 'en' ? 'Select "Add to Home screen" / "Install app"' : 'هەڵبژاردنی "Install app" یان "Add to Home screen"'}</h4>
                                        <p>{lang === 'en' ? 'Tap Install app or Add to Home screen in the menu' : 'لە ناو لیستەکە کلیک لە (دابەزاندنی ئەپڵیکەیشن) بکە'}</p>
                                    </div>
                                    <div className="pwa-step-visual">
                                        <PlusSquare size={22} color="#a855f7" />
                                    </div>
                                </div>

                                {/* ANDROID STEP 3 */}
                                <div className="pwa-step-item">
                                    <div className="pwa-step-number">٣</div>
                                    <div className="pwa-step-details">
                                        <h4>{lang === 'en' ? 'Tap "Install" / "Add"' : 'کلیک لە "Install" یان "زیادکردن" بکە'}</h4>
                                        <p>{lang === 'en' ? 'App will be installed to your home screen' : 'پیرۆزە! ئەپڵیکەیشنی کوردی ستریم دادەبەزێتە سەر شاشەی مۆبایلەکەت'}</p>
                                    </div>
                                    <div className="pwa-step-visual">
                                        <CheckCircle2 size={22} color="#22c55e" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pwa-modal-footer">
                            <button className="pwa-modal-ok-btn" onClick={closeInstallGuide}>
                                {lang === 'en' ? 'Got It!' : 'تێگەیشتم ✓'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
