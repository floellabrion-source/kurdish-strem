import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import LiveNotificationToast from './components/LiveNotificationToast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { PwaProvider } from './context/PwaContext';

// Code Splitting / Lazy Loading for High Performance
const Home = lazy(() => import('./pages/Home'));
const Watch = lazy(() => import('./pages/Watch'));
const MovieDetail = lazy(() => import('./pages/MovieDetail'));
const Favorites = lazy(() => import('./pages/Favorites'));
const WatchLater = lazy(() => import('./pages/WatchLater'));
const Admin = lazy(() => import('./pages/Admin'));
const SeriesPage = lazy(() => import('./pages/SeriesPage'));
const EpisodeDetail = lazy(() => import('./pages/EpisodeDetail'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const Auth = lazy(() => import('./pages/Auth'));
const Profile = lazy(() => import('./pages/Profile'));
const LevelAssessment = lazy(() => import('./pages/LevelAssessment'));
const BuyCredits = lazy(() => import('./pages/BuyCredits'));

const PageFallback = () => (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#22d3ee', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
);

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }
    componentDidCatch(error: any, errorInfo: any) {
        console.error('[React ErrorBoundary caught error]:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#f8fafc', padding: '24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                    <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '8px' }}>کێشەیەک لە بارکردنی ئەم لاپەڕەیە ڕوویدا</h2>
                    <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '450px', marginBottom: '20px' }}>
                        {this.state.error?.message || 'هەڵەیەکی نەزانراو ڕوویدا'}
                    </p>
                    <button 
                        onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
                        style={{ padding: '10px 24px', background: '#22d3ee', color: '#09090b', fontWeight: 'bold', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                    >
                        گەڕانەوە بۆ سەرەکی
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const hasToken = Boolean(localStorage.getItem('kurdish_stream_token') || localStorage.getItem('ks_token'));
    if (loading || (hasToken && !user)) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>چاوەڕوانبە...</div>;
    return user ? <>{children}</> : <Navigate to="/auth" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const hasToken = Boolean(localStorage.getItem('kurdish_stream_token') || localStorage.getItem('ks_token'));
    if (loading || (hasToken && !user)) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>چاوەڕوانبە...</div>;
    if (!user) return <Navigate to="/auth" replace />;
    const isAllowed = user.role === 'admin' || user.role === 'super_admin' || user.username === 'maher2' || user.username?.toLowerCase() === 'admin';
    return isAllowed ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
    const location = useLocation();
    const isShellHidden = location.pathname.startsWith('/auth') || location.pathname.startsWith('/watch/');
    const isSidebarCollapsed = !isShellHidden && !location.pathname.startsWith('/admin');
    const { updateCredits } = useAuth();

    useEffect(() => {
        const handleAiCreditsUpdated = (e: any) => {
            if (e.detail !== undefined) {
                updateCredits(e.detail);
            }
        };
        window.addEventListener('aiCreditsUpdated', handleAiCreditsUpdated);
        return () => window.removeEventListener('aiCreditsUpdated', handleAiCreditsUpdated);
    }, [updateCredits]);

    return (
        <div className="app-container">
            <Navbar />
            <main className={`main-content ${isSidebarCollapsed ? 'collapsed' : ''} ${isShellHidden ? 'shell-hidden' : ''}`}>
                <ErrorBoundary>
                    <Suspense fallback={<PageFallback />}>
                        <Routes>
                            <Route path="/auth" element={<Auth />} />
                            <Route path="/" element={<Home />} />
                            <Route path="/movies" element={<Home filter="movie" />} />
                            <Route path="/series" element={<Home filter="series" />} />
                            <Route path="/animations" element={<Home filter="animation" />} />
                            <Route path="/watch/:id" element={<Watch />} />
                            <Route path="/series/:id" element={<SeriesPage />} />
                            <Route path="/series/:id/season/:seasonNum/episode/:episodeNum" element={<EpisodeDetail />} />
                            <Route path="/movie/:id" element={<MovieDetail />} />
                            
                            {/* User Profile & Private Lists */}
                            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                            <Route path="/buy-credits" element={<ProtectedRoute><BuyCredits /></ProtectedRoute>} />
                            <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
                            <Route path="/watch-later" element={<ProtectedRoute><WatchLater /></ProtectedRoute>} />
                            <Route path="/flashcards" element={<Flashcards />} />
                            <Route path="/assessment" element={<ProtectedRoute><LevelAssessment /></ProtectedRoute>} />
                            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
                        </Routes>
                    </Suspense>
                </ErrorBoundary>
            </main>
            <PWAInstallPrompt />
            <LiveNotificationToast />
        </div>
    );
}

export default function App() {
    return (
        <LanguageProvider>
            <AuthProvider>
                <WebSocketProvider>
                    <PwaProvider>
                        <BrowserRouter>
                            <AppRoutes />
                        </BrowserRouter>
                    </PwaProvider>
                </WebSocketProvider>
            </AuthProvider>
        </LanguageProvider>
    );
}
