import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Watch from './pages/Watch';
import MovieDetail from './pages/MovieDetail';
import Favorites from './pages/Favorites';
import WatchLater from './pages/WatchLater';
import Admin from './pages/Admin';
import SeriesPage from './pages/SeriesPage';
import Flashcards from './pages/Flashcards';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import Navbar from './components/Navbar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>چاوەڕوانبە...</div>;
    return user ? <>{children}</> : <Navigate to="/auth" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>چاوەڕوانبە...</div>;
    if (!user) return <Navigate to="/auth" />;
    return user.role === 'admin' ? <>{children}</> : <Navigate to="/" />;
}

function AppRoutes() {
    const location = useLocation();
    const isSidebarCollapsed = !location.pathname.startsWith('/admin');

    return (
        <div className="app-container">
            <Navbar />
            <main className={`main-content ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <Routes>
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                    <Route path="/movies" element={<ProtectedRoute><Home filter="movie" /></ProtectedRoute>} />
                    <Route path="/series" element={<ProtectedRoute><Home filter="series" /></ProtectedRoute>} />
                    <Route path="/animations" element={<ProtectedRoute><Home filter="animation" /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                    <Route path="/watch/:id" element={<ProtectedRoute><Watch /></ProtectedRoute>} />
                    <Route path="/series/:id" element={<ProtectedRoute><SeriesPage /></ProtectedRoute>} />
                    <Route path="/movie/:id" element={<ProtectedRoute><MovieDetail /></ProtectedRoute>} />
                    <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
                    <Route path="/watch-later" element={<ProtectedRoute><WatchLater /></ProtectedRoute>} />
                    <Route path="/flashcards" element={<ProtectedRoute><Flashcards /></ProtectedRoute>} />
                    <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
                </Routes>
            </main>
        </div>
    );
}

export default function App() {
    return (
        <LanguageProvider>
            <AuthProvider>
                <BrowserRouter>
                    <AppRoutes />
                </BrowserRouter>
            </AuthProvider>
        </LanguageProvider>
    );
}
