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

export interface Movie {
    id: string;
    title: string;
    level?: string; // Difficulty level ('A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'ئاسان' | 'مامناوەند' | 'قورس')
    languageMetrics?: LanguageMetrics;
    description: string;
    descriptionKu?: string;
    descriptionEn?: string;
    descriptionAr?: string;
    language?: string;
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
    createdAt: number;
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
    dailyStats?: Record<string, { watchMinutes: number; sentencesSeen: number }>;
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
