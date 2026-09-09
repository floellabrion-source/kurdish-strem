import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

export interface LiveNotification {
    id: string;
    type: 'approval_submit' | 'approved' | 'rejected' | 'feedback' | 'note' | 'lock' | 'info';
    title: string;
    message: string;
    timestamp: number;
    data?: any;
}

interface WebSocketContextType {
    isConnected: boolean;
    lastEvent: { event: string; payload: any; timestamp: number } | null;
    notifications: LiveNotification[];
    activeLocks: Record<string, any>;
    dismissNotification: (id: string) => void;
    clearAllNotifications: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

// Web Audio API helper for soft, pleasant notification sound (no external mp3 file needed)
const playChimeSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
        // AudioContext autoplay restrictions or disabled
    }
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token, user } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const [lastEvent, setLastEvent] = useState<{ event: string; payload: any; timestamp: number } | null>(null);
    const [notifications, setNotifications] = useState<LiveNotification[]>([]);
    const [activeLocks, setActiveLocks] = useState<Record<string, any>>({});
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<any>(null);

    const dismissNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const clearAllNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    const addNotification = useCallback((n: Omit<LiveNotification, 'id' | 'timestamp'>) => {
        const newNotif: LiveNotification = {
            ...n,
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: Date.now()
        };
        setNotifications(prev => [newNotif, ...prev.slice(0, 5)]); // Keep up to 6 latest
        playChimeSound();
    }, []);

    useEffect(() => {
        let isUnmounted = false;

        const connect = () => {
            if (isUnmounted) return;

            // Determine WS URL (ws:// for http, wss:// for https)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // In development Vite proxies or connects directly to port 3001
            const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
            const wsUrl = `${protocol}//${host}/ws?token=${token || ''}`;

            try {
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    if (isUnmounted) return;
                    setIsConnected(true);
                };

                ws.onmessage = (event) => {
                    if (isUnmounted) return;
                    try {
                        const data = JSON.parse(event.data);
                        setLastEvent(data);

                        // Handle specific real-time events
                        switch (data.event) {
                            case 'SUBTITLE_LOCK_UPDATE': {
                                const { lockKey, action, lockedBy } = data.payload || {};
                                setActiveLocks(prev => {
                                    const next = { ...prev };
                                    if (action === 'release' || action === 'force_unlock') {
                                        delete next[lockKey];
                                    } else {
                                        next[lockKey] = lockedBy;
                                    }
                                    return next;
                                });
                                break;
                            }

                            case 'MOVIE_APPROVAL_SUBMITTED': {
                                // Show live toast for Super Admin & Reviewers
                                if (user?.role === 'super_admin' || user?.role === 'admin') {
                                    addNotification({
                                        type: 'approval_submit',
                                        title: 'داواکاری نوێ بۆ پەسەندکردن 📥',
                                        message: data.payload?.message || `سەبتایتڵی (${data.payload?.movieTitle}) نێردرا بۆ پەسەندکردن`,
                                        data: data.payload
                                    });
                                }
                                break;
                            }

                            case 'MOVIE_APPROVED': {
                                addNotification({
                                    type: 'approved',
                                    title: 'پەسەندکرا و بڵاوکرایەوە ✓',
                                    message: data.payload?.message || `بەرهەمی (${data.payload?.movieTitle}) پەسەندکرا!`,
                                    data: data.payload
                                });
                                break;
                            }

                            case 'MOVIE_REJECTED': {
                                addNotification({
                                    type: 'rejected',
                                    title: 'ڕەتکرایەوە بۆ پێداچوونەوە ⚠️',
                                    message: data.payload?.message || `داواکاریی (${data.payload?.movieTitle}) پێویستی بە چاکسازییە`,
                                    data: data.payload
                                });
                                break;
                            }

                            case 'TRANSLATOR_FEEDBACK': {
                                if (data.payload?.targetUserId === user?.id || user?.role === 'super_admin') {
                                    addNotification({
                                        type: 'feedback',
                                        title: `📌 تێبینی لە سەرۆکەوە (${data.payload?.fromAdmin || 'سەرۆک'})`,
                                        message: data.payload?.feedbackText || 'تێبینی نوێ لەسەر سەبتایتڵ تۆمارکرا',
                                        data: data.payload
                                    });
                                }
                                break;
                            }

                            case 'INTERNAL_NOTE_ADDED': {
                                // Live note inside active editor
                                break;
                            }

                            default:
                                break;
                        }
                    } catch (err) {
                        console.error('[WS Client] Parse error:', err);
                    }
                };

                ws.onclose = () => {
                    if (isUnmounted) return;
                    setIsConnected(false);
                    // Exponential / 4-second auto-reconnect
                    reconnectTimeoutRef.current = setTimeout(connect, 4000);
                };

                ws.onerror = () => {
                    ws.close();
                };
            } catch (err) {
                if (!isUnmounted) {
                    reconnectTimeoutRef.current = setTimeout(connect, 5000);
                }
            }
        };

        connect();

        return () => {
            isUnmounted = true;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [token, user?.id, user?.role, addNotification]);

    return (
        <WebSocketContext.Provider
            value={{
                isConnected,
                lastEvent,
                notifications,
                activeLocks,
                dismissNotification,
                clearAllNotifications
            }}
        >
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
};
