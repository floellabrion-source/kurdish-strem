import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'ku' | 'en' | 'ar';

interface Translations {
    [key: string]: {
        ku: string;
        en: string;
        ar: string;
    };
}

export const translations: Translations = {
    "menu": { ku: "مینیو", en: "Menu", ar: "القائمة" },
    "home": { ku: "سەرەکی", en: "Home", ar: "الرئيسية" },
    "movies": { ku: "فیلمەکان", en: "Movies", ar: "أفلام" },
    "series": { ku: "زنجیرەکان", en: "Series", ar: "مسلسلات" },
    "animation": { ku: "ئەنیمێشن", en: "Animation", ar: "رسوم متحركة" },
    "account": { ku: "هەژمار", en: "Account", ar: "حساب" },
    "flashcards": { ku: "فلاش کارت", en: "Flashcards", ar: "بطاقات تعليمية" },
    "admin": { ku: "ئەدمین", en: "Admin", ar: "المسؤول" },
    "continue_watching_menu": { ku: "بینینەوە", en: "Continue", ar: "متابعة" },
    "continue_watching": { ku: "بەردەوامبە لە سەیرکردن", en: "Continue Watching", ar: "متابعة المشاهدة" },
    "popular_movies": { ku: "فیلمە بەناوبانگەکان", en: "Popular Movies", ar: "أفلام شهيرة" },
    "search_placeholder": { ku: "بگەڕێ بۆ فیلم، زنجیرە، ئەکتەر...", en: "Search for movies, series, actors...", ar: "ابحث عن أفلام، مسلسلات، ممثلين..." },
    "no_movies": { ku: "هیچ فیلمێک بارنەکراوە هێشتا. بڕۆ بۆ بەشی ئەدمین.", en: "No movies uploaded yet. Go to Admin.", ar: "لم يتم رفع أي أفلام بعد. انتقل للمسؤول." },
    "not_found": { ku: "هیچ فیلمێک نەدۆزرایەوە", en: "No movies found", ar: "لم يتم العثور على أفلام" },
    "time": { ku: "کات:", en: "Time:", ar: "الوقت:" },
    "kurdish_stream": { ku: "بینەما", en: "Binema", ar: "بينما" },
    "login": { ku: "چوونەژوورەوە", en: "Login", ar: "تسجيل الدخول" }
};

interface LanguageContextType {
    lang: Language;
    setLang: (l: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLang] = useState<Language>((localStorage.getItem('ks_lang') as Language) || 'ku');

    useEffect(() => {
        localStorage.setItem('ks_lang', lang);
        document.body.dir = lang === 'en' ? 'ltr' : 'rtl';
    }, [lang]);

    const t = (key: string): string => {
        if (!translations[key]) return key;
        return translations[key][lang] || translations[key]['ku'];
    };

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLanguage = () => useContext(LanguageContext);
