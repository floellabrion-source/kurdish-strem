// client/src/components/CookieConsent.tsx
import React, { useState, useEffect } from 'react';
import './CookieConsent.css';

interface CookieConsentProps {
  onAccept: (preferences: { necessary: boolean; analytics: boolean; performance: boolean; marketing: boolean }) => void;
}

const CookieConsent: React.FC<CookieConsentProps> = ({ onAccept }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [necessary, setNecessary] = useState(true); // Always true
  const [performance, setPerformance] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const preferences = { necessary: true, performance: true, analytics: true, marketing: true };
    localStorage.setItem('cookieConsent', JSON.stringify(preferences));
    onAccept(preferences);
    setIsVisible(false);
  };

  const handleSavePreferences = () => {
    const preferences = { necessary, performance, analytics, marketing };
    localStorage.setItem('cookieConsent', JSON.stringify(preferences));
    onAccept(preferences);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="cookie-consent-overlay">
      <div className="cookie-consent-modal">
        <div className="cookie-consent-header">
          <h2>ڕێکخستنەکانی کوکی</h2>
          <p>
            ئێمە کوکی و تەکنەلۆژیای هاوشێوە بەکاردەهێنین بۆ باشترکردنی ئەزموونی گەڕانەکەت،
            بەکەسیکردنی ناوەڕۆک، شیکردنەوەی هاتووچۆی ماڵپەڕ، و پێشکەشکردنی خزمەتگوزارییە پارێزراوەکان.
            تایبەتمەندێتی تۆ بۆ ئێمە گرنگە. بە کرتەکردن لەسەر "پەسەندکردنی هەموو"، تۆ ڕازی دەبیت بە بەکارهێنانی کوکییەکان
            وەک لە <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">ڕامیاری تایبەتمان</a> باسکراوە.
          </p>
        </div>

        <div className="cookie-consent-body">
          <button className="toggle-details-btn" onClick={() => setShowDetails(!showDetails)}>
            وردەکارییەکانی کوکی <span className="arrow">{showDetails ? '▲' : '▼'}</span>
          </button>

          {showDetails && (
            <div className="cookie-details">
              <div className="cookie-category">
                <div className="category-info">
                  <h3>کوکییە پێویستەکان</h3>
                  <span className="badge necessary">پێویستە</span>
                  <p>ئەم کوکییانە زۆر گرنگن بۆ کارکردنی دروستی ماڵپەڕەکە و ناکرێت مۆڵەتیان پێنەدرێت.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={necessary} disabled />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="cookie-category">
                <div className="category-info">
                  <h3>کوکییە کاراییەکان</h3>
                  <span className="badge optional">ئارەزوومەندانە</span>
                  <p>ئەم کوکییانە تایبەتمەندییە کەسییەکان و کاراییەکان چالاک دەکەن.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={performance} onChange={() => setPerformance(!performance)} />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="cookie-category">
                <div className="category-info">
                  <h3>کوکییە شیکارییەکان</h3>
                  <span className="badge optional">ئارەزوومەندانە</span>
                  <p>ئەم کوکییانە یارمەتیمان دەدەن تێبگەین چۆن سەردانکەران مامەڵە لەگەڵ ماڵپەڕەکەمان دەکەن، کە یارمەتیمان دەدات خزمەتگوزارییەکانمان باشتر بکەین.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={analytics} onChange={() => setAnalytics(!analytics)} />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="cookie-category">
                <div className="category-info">
                  <h3>کوکییە بازاڕگەرییەکان</h3>
                  <span className="badge optional">ئارەزوومەندانە</span>
                  <p>ئەم کوکییانە بەکاردەهێنرێن بۆ پیشاندانی ڕیکلامی گونجاوتر بەپێی حەزەکانت.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={marketing} onChange={() => setMarketing(!marketing)} />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="cookie-consent-actions">
          <button className="btn-save-preferences" onClick={handleSavePreferences}>
            خەزنکردنی هەڵبژاردنەکان
          </button>
          <button className="btn-accept-all" onClick={handleAcceptAll}>
            پەسەندکردنی هەموو
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;