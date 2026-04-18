import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

export default function Auth() {
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isLogin) {
            if (!email.includes('@')) {
                setError('ئیمەیڵی دروست بنووسە');
                return;
            }
            if (password !== confirmPassword) {
                setError('دووپاتکردنەوەی وشەی نهێنی ڕاست نییە');
                return;
            }
            if (password.length < 6) {
                setError('وشەی نهێنی دەبێت لانیکەم ٦ پیت بێت');
                return;
            }
        }

        setLoading(true);
        try {
            if (isLogin) {
                await login(username, password);
            } else {
                await register(username, password);
            }
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.error || 'هەڵەیەک ڕووی دا');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-brand">
                    <h1>{isLogin ? 'بەخێربێیت' : 'دروستکردنی هەژمار'}</h1>
                    <p>{isLogin ? 'بچۆ ژوورەوە بۆ بینەما' : 'هەژمارێکی نوێ دروست بکە'}</p>
                </div>

                <div className="auth-tabs">
                    <button className={isLogin ? 'active' : ''} onClick={() => setIsLogin(true)}>چوونەژوورەوە</button>
                    <button className={!isLogin ? 'active' : ''} onClick={() => setIsLogin(false)}>خۆتۆمارکردن</button>
                </div>
                
                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    {!isLogin && (
                        <div className="auth-field">
                            <label>ناوی تەواو</label>
                            <input type="text" placeholder="ناوی تەواو" />
                        </div>
                    )}

                    <div className="auth-field">
                        <label>{!isLogin ? 'ئیمەیڵ' : 'ناوی بەکارهێنەر'}</label>
                        <input 
                            type={!isLogin ? 'email' : 'text'}
                            value={!isLogin ? email : username}
                            onChange={e => !isLogin ? setEmail(e.target.value) : setUsername(e.target.value)}
                            placeholder={!isLogin ? 'ئیمەیڵ' : 'ناوی بەکارهێنەر'}
                            required 
                        />
                    </div>

                    {!isLogin && (
                        <div className="auth-field">
                            <label>ناوی بەکارهێنەر</label>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="ناوی بەکارهێنەر"
                                required
                            />
                        </div>
                    )}

                    <div className="auth-field auth-password-wrap">
                        <label>تێپەڕوشە</label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="تێپەڕوشەکەت"
                            required
                        />
                        <button type="button" className="toggle-pass-btn" onClick={() => setShowPassword(v => !v)}>
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    {!isLogin && (
                        <div className="auth-field auth-password-wrap">
                            <label>دڵنیابوونەوەی تێپەڕوشە</label>
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                placeholder="دووبارە تێپەڕوشەکەت بنووسە"
                                required
                            />
                            <button type="button" className="toggle-pass-btn" onClick={() => setShowConfirmPassword(v => !v)}>
                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    )}

                    <button type="submit" disabled={loading} className="auth-submit-btn">
                        {isLogin ? <LogIn size={18} /> : <UserPlus size={18} />}
                        {loading ? 'چاوەڕوانبە...' : (isLogin ? 'چوونەژوورەوە' : 'خۆتۆمارکردن')}
                    </button>
                </form>

                <div className="auth-switch">
                    {isLogin ? 'هەژمارت نییە؟ ' : 'هەژمارت هەیە؟ '}
                    <button type="button" onClick={() => setIsLogin(!isLogin)}>
                        {isLogin ? 'خۆتۆمارکردن' : 'چوونەژوورەوە'}
                    </button>
                </div>
            </div>
        </div>
    );
}
