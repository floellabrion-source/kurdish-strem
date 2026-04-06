import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#09090e', color: 'white' }}>
            <div style={{ width: '100%', maxWidth: '400px', padding: '40px', background: 'rgba(255,255,255,0.03)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '30px', fontSize: '28px', fontWeight: 800 }}>
                    {isLogin ? 'چوونەژوورەوە' : 'دروستکردنی هەژمار'}
                </h2>
                
                {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px', borderRadius: '10px', marginBottom: '20px', textAlign: 'center', fontSize: '14px' }}>{error}</div>}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>ناوی بەکارهێنەر</label>
                        <input 
                            type="text" 
                            value={username} 
                            onChange={e => setUsername(e.target.value)}
                            style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontFamily: 'inherit' }}
                            required 
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>وشەی نهێنی</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={e => setPassword(e.target.value)}
                            style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontFamily: 'inherit' }}
                            required 
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={loading}
                        style={{ background: '#7c3aed', color: 'white', border: 'none', padding: '14px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}
                    >
                        {isLogin ? <LogIn size={18} /> : <UserPlus size={18} />}
                        {loading ? 'چاوەڕوانبە...' : (isLogin ? 'چوونەژوورەوە' : 'تۆمارکردن')}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '20px', color: '#94a3b8', fontSize: '14px' }}>
                    {isLogin ? 'هەژمارت نییە؟' : 'هەژمارت هەیە؟'}{' '}
                    <span 
                        onClick={() => setIsLogin(!isLogin)} 
                        style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        {isLogin ? 'تۆمارکردن' : 'چوونەژوورەوە'}
                    </span>
                </div>
            </div>
        </div>
    );
}
