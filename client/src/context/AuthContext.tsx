import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { User, AdminPermissions } from '../types';

export type { User, AdminPermissions };

interface AuthContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    login: (username: string, pass: string) => Promise<User>;
    register: (username: string, pass: string) => Promise<void>;
    logout: () => void;
    syncProgress: (data: { points?: number; history?: any; flashcards?: any[]; watchMinutes?: number; sentencesSeen?: number; dailyGoal?: number; level?: string; assessmentResult?: any; dualSubWatchSeconds?: number; dualSubCycleStartTime?: number | null }) => Promise<void>;
    toggleList: (listName: 'favorites' | 'watchLater' | 'watched', movieId: string) => Promise<void>;
    updateCredits: (credits: number) => void;
    refreshUser: () => Promise<void>;
    setAuthSession: (token: string, user: User) => void;
}

const TOKEN_KEY = 'kurdish_stream_token';

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY) || localStorage.getItem('ks_token'));
    const [loading, setLoading] = useState(true);

    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('ks_token');
        localStorage.removeItem('kurdish_stream_user');
    }, []);

    useEffect(() => {
        const handleTokenExpired = () => {
            console.warn('[AuthContext] Token expired event received, logging out.');
            logout();
        };

        window.addEventListener('auth_token_expired', handleTokenExpired);
        return () => {
            window.removeEventListener('auth_token_expired', handleTokenExpired);
        };
    }, [logout]);

    useEffect(() => {
        if (token) {
            apiClient.get('/api/auth/me')
                .then(res => {
                    setUser(res.data.user);
                    localStorage.setItem('kurdish_stream_user', JSON.stringify(res.data.user));
                })
                .catch((err) => {
                    if (err.response?.status === 401) {
                        setToken(null);
                        setUser(null);
                        localStorage.removeItem(TOKEN_KEY);
                        localStorage.removeItem('ks_token');
                        localStorage.removeItem('kurdish_stream_user');
                    }
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = async (u: string, p: string) => {
        const res = await apiClient.post('/api/auth/login', { username: u, password: p });
        const newToken = res.data.token;
        const newUser = res.data.user;

        setToken(newToken);
        setUser(newUser);
        localStorage.setItem(TOKEN_KEY, newToken);
        localStorage.setItem('ks_token', newToken);
        return newUser;
    };

    const register = async (u: string, p: string) => {
        const res = await apiClient.post('/api/auth/register', { username: u, password: p });
        const newToken = res.data.token;
        const newUser = res.data.user;

        setToken(newToken);
        setUser(newUser);
        localStorage.setItem(TOKEN_KEY, newToken);
        localStorage.setItem('ks_token', newToken);
    };

    const setAuthSession = useCallback((newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem(TOKEN_KEY, newToken);
        localStorage.setItem('ks_token', newToken);
    }, []);

    const syncProgress = async (data: { points?: number; history?: any; flashcards?: any[]; watchMinutes?: number; sentencesSeen?: number; dailyGoal?: number; level?: string; assessmentResult?: any }) => {
        if (!user) return; // Silent fail if not logged in

        if (data.dailyGoal !== undefined) {
            setUser(prev => prev ? { ...prev, dailyGoal: data.dailyGoal } : prev);
        }

        try {
            const res = await apiClient.post('/api/user/sync', data);
            if (res.data.user) {
                setUser(prev => {
                    if (!prev) return res.data.user;
                    return {
                        ...prev,
                        ...res.data.user,
                        dailyGoal: res.data.user.dailyGoal ?? prev.dailyGoal
                    };
                });
            } else if (res.data.points !== undefined || data.dailyGoal !== undefined || data.level !== undefined || data.assessmentResult !== undefined) {
                setUser(prev => {
                    if (!prev) return null;
                    const updated = { ...prev };
                    if (res.data.points !== undefined) updated.points = res.data.points;
                    if (data.dailyGoal !== undefined) updated.dailyGoal = data.dailyGoal;
                    return updated;
                });
            }
        } catch (e) {
            console.error('Failed to sync progress', e);
        }
    };

    const toggleList = async (listName: 'favorites' | 'watchLater' | 'watched', movieId: string) => {
        if (!user) return;
        try {
            const res = await apiClient.post('/api/user/toggle-list', { listName, movieId });
            if (res.data.user) {
                setUser(res.data.user);
            }
        } catch (e) {
            console.error(`Failed to toggle ${listName}`, e);
        }
    };

    const updateCredits = (credits: number) => {
        setUser(prev => prev ? { ...prev, credits } : prev);
    };

    const refreshUser = async () => {
        if (!token) return;
        try {
            const res = await apiClient.get('/api/auth/me');
            setUser(res.data.user);
        } catch (e) {
            console.error('Failed to refresh user', e);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, register, logout, syncProgress, toggleList, updateCredits, refreshUser, setAuthSession }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
