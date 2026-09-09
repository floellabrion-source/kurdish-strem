import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Watch from './pages/Watch';
import MovieDetail from './pages/MovieDetail';
import Favorites from './pages/Favorites';
import WatchLater from './pages/WatchLater';
import Admin from './pages/Admin';
import SeriesPage from './pages/SeriesPage';
import EpisodeDetail from './pages/EpisodeDetail';
import Flashcards from './pages/Flashcards';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import LevelAssessment from './pages/LevelAssessment';
import BuyCredits from './pages/BuyCredits';
import Navbar from './components/Navbar';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import LiveNotificationToast from './components/LiveNotificationToast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { PwaProvider } from './context/PwaContext';

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

import { useEffect } from 'react';

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
