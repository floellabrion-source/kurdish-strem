export interface Episode {
    id: string;
    number: number;
    title: string;
    description: string;
    videoFile: string | null;
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
    genre: string;
    year: number;
    duration: string;
    posterUrl: string;
    videoFile: string | null;
    originalSrt: string | null;
    translatedSrt: string | null;
    createdAt: number;
    type: 'movie' | 'series';
    sensitiveScenes?: { start: number, end: number }[];
    seasons?: Season[];
}
