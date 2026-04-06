import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface User {
    id: string;
    username: string;
    avatarUrl?: string;
    points: number;
    history?: Record<string, { time: number; title: string; date?: string }>;
    flashcards?: any[];
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    login: (username: string, pass: string) => Promise<void>;
    register: (username: string, pass: string) => Promise<void>;
    logout: () => void;
    syncProgress: (data: { points?: number, history?: any, flashcards?: any[] }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Global axios interceptor for token
axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('ks_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('ks_token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            axios.get('/api/auth/me')
                .then(res => setUser(res.data.user))
                .catch(() => {
                    setToken(null);
                    setUser(null);
                    localStorage.removeItem('ks_token');
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = async (u: string, p: string) => {
        const res = await axios.post('/api/auth/login', { username: u, password: p });
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('ks_token', res.data.token);
    };

    const register = async (u: string, p: string) => {
        const res = await axios.post('/api/auth/register', { username: u, password: p });
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('ks_token', res.data.token);
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('ks_token');
    };

    const syncProgress = async (data: { points?: number, history?: any, flashcards?: any[] }) => {
        if (!user) return; // Silent fail if not logged in
        try {
            const res = await axios.post('/api/user/sync', data);
            if (res.data.points !== undefined) {
                setUser(prev => prev ? { ...prev, points: res.data.points } : null);
            }
        } catch (e) {
            console.error('Failed to sync progress', e);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, register, logout, syncProgress }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
