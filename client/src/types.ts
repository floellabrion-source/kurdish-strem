export interface Episode {
    id: string;
    number: number;
    title: string;
    description: string;
    videoFile: string | null;
    videoUrl: string | null;
    originalSrt: string | null;
    translatedSrt: string | null;
    duration: string;
    sensitiveScenes?: { start: number, end: number }[];
}

export interface Season {
    id: string;
    number: number;
    title: string;
    episodes: Episode[];
}

export interface Movie {
    id: string;
    title: string;
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
    originalSrt: string | null;
    translatedSrt: string | null;
    createdAt: number;
    type: 'movie' | 'series' | 'animation';
    imdbRating?: string | number;
    sensitiveScenes?: { start: number, end: number }[];
    seasons?: Season[];
}

export interface User {
    id: string;
    username: string;
    role: 'admin' | 'user';
    points: number;
    credits?: number;
    avatarUrl?: string;
    history: Record<string, any>;
    flashcards: any[];
    favorites: string[];
    watchLater: string[];
    watched: string[];
    token?: string;
    dailyStats?: Record<string, { watchMinutes: number; sentencesSeen: number }>;
}
