export interface SubtitleReservation {
    userId: string;
    username: string;
    reservedAt: number;
    expiresAt: number;
    days: number;
    note?: string;
}

export interface Episode {
    id: string;
    number: number;
    title: string;
    description: string;
    videoFile: string | null;
    videoUrl: string | null;
    videoUpdatedAt?: number;
    originalSrt: string | null;
    translatedSrt: string | null;
    duration: string;
    sensitiveScenes?: { start: number, end: number }[];
    languageMetrics?: LanguageMetrics;
    status?: 'published' | 'draft';
    reservation?: SubtitleReservation | null;
}

export interface Season {
    id: string;
    number: number;
    title: string;
    episodes: Episode[];
}

export interface DifficultWord {
    word: string;
    type: string;
    definition: string;
}

export interface RepeatedWord {
    word: string;
    count: number;
    meaning?: string;
}

export interface LanguageMetrics {
    totalWords: number;
    lexicalDensity: number;
    vocabDiversity: number;
    cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    distribution: Record<'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Unknown', number>;
    difficultWords?: DifficultWord[];
    repeatedWords?: RepeatedWord[];
}

export interface Subtitle {
    file: string;
    language: string;
    label: string;
}

export const getCefrDisplayLevel = (level?: string, cefrLevel?: string): string => {
    const cefr = cefrLevel?.toUpperCase().trim();
    if (cefr && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(cefr)) return cefr;
    if (!level) return '';
    const upper = level.toUpperCase().trim();
    if (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(upper)) return upper;
    if (level === 'ئاسان' || upper === 'EASY' || upper === 'SEHL') return 'A2';
    if (level === 'مامناوەند' || upper === 'MEDIUM' || upper === 'MODERATE') return 'B1';
    if (level === 'قورس' || upper === 'HARD' || upper === 'DIFFICULT') return 'C1';
    return upper;
};

export const getCefrColor = (level: string): { bg: string; text: string } => {
    const l = level.toUpperCase();
    if (l.startsWith('A')) return { bg: 'rgba(34, 197, 94, 0.9)', text: '#ffffff' };
    if (l.startsWith('B')) return { bg: 'rgba(245, 158, 11, 0.9)', text: '#ffffff' };
    if (l.startsWith('C')) return { bg: 'rgba(239, 68, 68, 0.9)', text: '#ffffff' };
    return { bg: 'rgba(99, 102, 241, 0.9)', text: '#ffffff' };
};

export const ACCENT_OPTIONS = [
    { code: 'US', flag: '🇺🇸', accent: 'american', nameKu: 'ئەمریکا', nameEn: 'USA', labelKu: 'ئەمریکی', labelEn: 'American' },
    { code: 'GB', flag: '🇬🇧', accent: 'british', nameKu: 'بەریتانیا', nameEn: 'UK', labelKu: 'بەریتانی', labelEn: 'British' },
    { code: 'CA', flag: '🇨🇦', accent: 'canadian', nameKu: 'کەنەدا', nameEn: 'Canada', labelKu: 'کەنەدی', labelEn: 'Canadian' },
    { code: 'AU', flag: '🇦🇺', accent: 'australian', nameKu: 'ئوستوڕاڵیا', nameEn: 'Australia', labelKu: 'ئوستوڕاڵی', labelEn: 'Australian' },
    { code: 'IE', flag: '🇮🇪', accent: 'irish', nameKu: 'ئێرلەندا', nameEn: 'Ireland', labelKu: 'ئێرلەندی', labelEn: 'Irish' },
    { code: 'NZ', flag: '🇳🇿', accent: 'new_zealand', nameKu: 'نیوزلەندا', nameEn: 'New Zealand', labelKu: 'نیوزلەندی', labelEn: 'New Zealand' },
    { code: 'ES', flag: '🇪🇸', accent: 'spanish', nameKu: 'ئیسپانیا', nameEn: 'Spain', labelKu: 'ئیسپانی', labelEn: 'Spanish' },
    { code: 'FR', flag: '🇫🇷', accent: 'french', nameKu: 'فەڕەنسا', nameEn: 'France', labelKu: 'فەڕەنسی', labelEn: 'French' },
    { code: 'DE', flag: '🇩🇪', accent: 'german', nameKu: 'ئەڵمانیا', nameEn: 'Germany', labelKu: 'ئەڵمانی', labelEn: 'German' },
    { code: 'TR', flag: '🇹🇷', accent: 'turkish', nameKu: 'تورکیا', nameEn: 'Turkey', labelKu: 'تورکی', labelEn: 'Turkish' },
    { code: 'JP', flag: '🇯🇵', accent: 'japanese', nameKu: 'ژاپۆن', nameEn: 'Japan', labelKu: 'ژاپۆنی', labelEn: 'Japanese' },
    { code: 'KR', flag: '🇰🇷', accent: 'korean', nameKu: 'کۆریای باشوور', nameEn: 'South Korea', labelKu: 'کۆری', labelEn: 'Korean' },
    { code: 'IN', flag: '🇮🇳', accent: 'indian', nameKu: 'هیندستان', nameEn: 'India', labelKu: 'هیندی', labelEn: 'Hindi' },
    { code: 'IT', flag: '🇮🇹', accent: 'italian', nameKu: 'ئیتاڵیا', nameEn: 'Italy', labelKu: 'ئیتاڵی', labelEn: 'Italian' },
    { code: 'RU', flag: '🇷🇺', accent: 'russian', nameKu: 'ڕووسیا', nameEn: 'Russia', labelKu: 'ڕووسی', labelEn: 'Russian' },
    { code: 'CN', flag: '🇨🇳', accent: 'chinese', nameKu: 'چین', nameEn: 'China', labelKu: 'چینی', labelEn: 'Chinese' },
    { code: 'SE', flag: '🇸🇪', accent: 'swedish', nameKu: 'سوید', nameEn: 'Sweden', labelKu: 'سویدی', labelEn: 'Swedish' },
    { code: 'NO', flag: '🇳🇴', accent: 'norwegian', nameKu: 'نەرویج', nameEn: 'Norway', labelKu: 'نەرویجی', labelEn: 'Norwegian' },
    { code: 'DK', flag: '🇩🇰', accent: 'danish', nameKu: 'دانیمارک', nameEn: 'Denmark', labelKu: 'دانیمارکی', labelEn: 'Danish' },
    { code: 'IQ', flag: '🇮🇶', accent: 'kurdish', nameKu: 'کوردستان', nameEn: 'Kurdistan', labelKu: 'کوردی', labelEn: 'Kurdish' }
];

export interface Movie {
    id: string;
    title: string;
    kurdishTitle?: string;
    level?: string; // Difficulty level ('A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'ئاسان' | 'مامناوەند' | 'قورس')
    languageMetrics?: LanguageMetrics;
    description: string;
    descriptionKu?: string;
    descriptionEn?: string;
    descriptionAr?: string;
    language?: string;
    country?: string;
    countryFlag?: string;
    accent?: string;
    accentLabel?: string;
    countries?: string[];
    genre: string;
    year: number;
    endYear?: number | null;
    duration: string;
    posterUrl: string;
    posterCloudUrl: string | null;
    videoFile: string | null;
    videoUrl: string | null;
    videoUpdatedAt?: number;
    originalSrt: string | null;
    translatedSrt: string | null;
    createdAt: number | string;
    updatedAt?: number | string;
    type: 'movie' | 'series' | 'animation';
    imdbRating?: string | number;
    sensitiveScenes?: { start: number, end: number }[];
    seasons?: Season[];
    fakeViews?: number;
    realViews?: number;
    views?: number;
    retention?: {
        full: number;
        partial75: number;
        partial50: number;
        partial25: number;
    };
    isFeatured?: boolean;
    status?: 'draft' | 'pending_approval' | 'published';
    submittedBy?: { id: string; username: string; at: string };
    approvedBy?: string;
    approvedAt?: string;
    rejectReason?: string;
    lastEditedBy?: { id: string; username: string; at: string; action?: string };
    reservation?: SubtitleReservation | null;
}

export interface AdminPermissions {
    canTranslate?: boolean;       // دەستکاریکردنی سەبتایتڵ، وشەکان و ئاماری زمان
    canAddMovies?: boolean;       // زیادکردن و ئەپلۆدکردنی فیلم و زنجیرە
    canManageCredits?: boolean;   // پشکنینی وەسڵ و دانی کرێدیت بە بەکارهێنەران
    canManageComments?: boolean;  // سڕینەوە و ڕێکخستنی کۆمێنتەکان
    canPublishDirectly?: boolean; // بڵاوکردنەوەی ڕاستەوخۆ بەبێ پێویستی بە پەسەندکردن
}

export interface User {
    id: string;
    username: string;
    email?: string;
    plainPassword?: string;
    role: 'super_admin' | 'admin' | 'user';
    permissions?: AdminPermissions;
    points: number;
    credits?: number;
    avatarUrl?: string;
    avatar?: string;
    history: Record<string, any>;
    flashcards: any[];
    favorites: string[];
    watchLater: string[];
    watched: string[];
    token?: string;
    dailyStats?: Record<string, { watchMinutes: number; sentencesSeen: number; watchSeconds?: number }>;
    dailyGoal?: number;
    level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | string;
    assessmentResult?: {
        level: string;
        score: number;
        total: number;
        date: number;
        feedback?: string;
    };
    notifications?: any[];
    dualSubWatchSeconds?: number;
    dualSubCycleStartTime?: number | null;
    isVip?: boolean;
    plan?: string | null;
    subscriptionExpiresAt?: number | null;
}
