import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import apiClient from '../api/client';
import { 
    LogIn, UserPlus, Eye, EyeOff, ArrowRight, ArrowLeft, 
    Smartphone, Mail, Sparkles, RotateCcw, ShieldCheck, KeyRound, ArrowLeftCircle, CheckCircle2
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import './Auth.css';

export default function Auth() {
    const { login, setAuthSession } = useAuth();
    const { lang, t } = useLanguage();
    const navigate = useNavigate();

    // Active Tab: 'login' | 'register' | 'forgot'
    const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');

    // Login Form State
    const [loginIdentifier, setLoginIdentifier] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showLoginPassword, setShowLoginPassword] = useState(false);

    // Register Form State (2 Steps)
    const [regStep, setRegStep] = useState<'info' | 'otp'>('info');
    const [regUsername, setRegUsername] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirmPassword, setRegConfirmPassword] = useState('');
    const [showRegPassword, setShowRegPassword] = useState(false);
    const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

    // Forgot Password Form State (3 Steps)
    const [forgotStep, setForgotStep] = useState<'target' | 'otp' | 'new_password'>('target');
    const [forgotTarget, setForgotTarget] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    // OTP 6-Digit Inputs State
    const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [otpErrorShake, setOtpErrorShake] = useState(false);

    // Google Sign-In States
    const [showGoogleModal, setShowGoogleModal] = useState(false);
    const [googleCustomEmail, setGoogleCustomEmail] = useState('');
    const [googleCustomName, setGoogleCustomName] = useState('');

    // UI Feedback
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);

    // Multilingual Error Translator
    const translateAuthError = (errStr: string | undefined, fallbackEn: string, fallbackKu: string): string => {
        if (!errStr) return lang === 'en' ? fallbackEn : fallbackKu;
        
        const map: Record<string, { en: string; ar: string; ku: string }> = {
            'ناو یان وشەی نهێنی هەڵەیە': {
                en: 'Invalid username, email or password',
                ar: 'اسم المستخدم أو كلمة المرور غير صحيحة',
                ku: 'ناو یان وشەی نهێنی هەڵەیە'
            },
            'ئەم ناوی بەکارهێنەرە پێشتر بەکارهاتووە': {
                en: 'This username is already taken',
                ar: 'اسم المستخدم هذا مستخدم بالفعل',
                ku: 'ئەم ناوی بەکارهێنەرە پێشتر بەکارهاتووە'
            },
            'ئەم ئیمەیلە پێشتر بەکارهاتووە': {
                en: 'This email is already registered',
                ar: 'هذا البريد الإلكتروني مسجل بالفعل',
                ku: 'ئەم ئیمەیلە پێشتر بەکارهاتووە'
            },
            'ئەم ژمارە مۆبایلە پێشتر بەکارهاتووە': {
                en: 'This phone number is already registered',
                ar: 'رقم الهاتف هذا مسجل بالفعل',
                ku: 'ئەم ژمارە مۆبایلە پێشتر بەکارهاتووە'
            },
            'کۆدەکە هەڵەیە یان بەسەرچووە': {
                en: 'Invalid or expired verification code',
                ar: 'رمز التحقق غير صالح أو منتهي الصلاحية',
                ku: 'کۆدەکە هەڵەیە یان بەسەرچووە'
            },
            'کۆدەکە هەڵەیە': {
                en: 'Invalid verification code',
                ar: 'رمز التحقق غير صحيح',
                ku: 'کۆدەکە هەڵەیە'
            },
            'تکایە هەموو خانەکان پڕبکەرەوە': {
                en: 'Please fill in all required fields',
                ar: 'يرجى ملء جميع الحقول المطلوبة',
                ku: 'تکایە هەموو خانەکان پڕبکەرەوە'
            },
            'هەژمارەکە نەدۆزرایەوە': {
                en: 'Account not found',
                ar: 'الحساب غير موجود',
                ku: 'هەژمارەکە نەدۆزرایەوە'
            },
            'وشەی نهێنی پێویستە': {
                en: 'Password is required',
                ar: 'كلمة المرور مطلوبة',
                ku: 'وشەی نهێنی پێویستە'
            }
        };

        if (map[errStr]) {
            return map[errStr][lang as 'en' | 'ar' | 'ku'] || (lang === 'en' ? map[errStr].en : errStr);
        }
        return errStr;
    };

    // Refs for 6-Box OTP Inputs
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Google Sign-In Handler
    const handleGoogleCallback = async (response: any) => {
        setLoading(true);
        setError('');
        try {
            const res = await apiClient.post('/api/auth/google', { credential: response.credential });
            setAuthSession(res.data.token, res.data.user);
            navigate('/');
        } catch (err: any) {
            setError(translateAuthError(err.response?.data?.error, 'Google sign-in failed', 'چوونەژوورەوەی گووگڵ سەرکەوتوو نەبوو'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const scriptId = 'google-gsi-script';
        let script = document.getElementById(scriptId) as HTMLScriptElement;
        if (!script) {
            script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            document.body.appendChild(script);
        }

        const initGsi = () => {
            const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '8888836091-kurdishstream.apps.googleusercontent.com';
            if ((window as any).google?.accounts?.id) {
                (window as any).google.accounts.id.initialize({
                    client_id: clientId,
                    callback: handleGoogleCallback,
                    auto_select: false,
                });
                const renderTarget = document.getElementById('google-native-btn');
                if (renderTarget) {
                    (window as any).google.accounts.id.renderButton(renderTarget, {
                        theme: 'filled_black',
                        size: 'large',
                        width: '100%',
                        text: 'continue_with',
                        shape: 'pill'
                    });
                }
            }
        };

        if ((window as any).google?.accounts?.id) {
            initGsi();
        } else {
            script.onload = initGsi;
        }
    }, [tab, regStep]);

    const handleDirectGoogleAuth = async (emailToUse: string, nameToUse?: string) => {
        if (!emailToUse || !emailToUse.includes('@')) {
            setError(lang === 'en' ? 'Please enter a valid Google email' : 'تکایە ئیمەیلی دروستی Google بنووسە');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await apiClient.post('/api/auth/google', {
                email: emailToUse.trim(),
                name: nameToUse || emailToUse.split('@')[0],
                googleId: 'g_' + btoa(emailToUse.trim().toLowerCase()).replace(/=/g, '').slice(0, 16),
                picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(emailToUse.trim())}`
            });
            setShowGoogleModal(false);
            setAuthSession(res.data.token, res.data.user);
            navigate('/');
        } catch (err: any) {
            setError(translateAuthError(err.response?.data?.error, 'Google sign-in failed', 'چوونەژوورەوەی گووگڵ سەرکەوتوو نەبوو'));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = () => {
        setError('');
        const clientId = '881192521008-j6t14adc4461pr5d8i2lo0a5tbi0oi51.apps.googleusercontent.com';

        // 1. Try Native Google GSI OAuth2 Token Client (Shows all logged in accounts on PC!)
        if ((window as any).google?.accounts?.oauth2) {
            try {
                const client = (window as any).google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'email profile openid',
                    prompt: 'select_account',
                    callback: async (tokenResponse: any) => {
                        if (tokenResponse.error) {
                            console.error('[Google OAuth Error]', tokenResponse.error);
                            setShowGoogleModal(true);
                            return;
                        }
                        if (tokenResponse.access_token) {
                            setLoading(true);
                            try {
                                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                                });
                                const userInfo = await userInfoRes.json();
                                const res = await apiClient.post('/api/auth/google', {
                                    email: userInfo.email,
                                    name: userInfo.name,
                                    picture: userInfo.picture,
                                    googleId: userInfo.sub
                                });
                                setAuthSession(res.data.token, res.data.user);
                                navigate('/');
                            } catch (err: any) {
                                setError(translateAuthError(err.response?.data?.error, 'Google sign-in failed', 'چوونەژوورەوەی گووگڵ سەرکەوتوو نەبوو'));
                            } finally {
                                setLoading(false);
                            }
                        }
                    }
                });
                client.requestAccessToken();
                return;
            } catch (err) {
                console.error('[Google OAuth Init Error]', err);
            }
        }

        // 2. Fallback to GSI ID Prompt or Modal
        if ((window as any).google?.accounts?.id) {
            (window as any).google.accounts.id.prompt((notification: any) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    setShowGoogleModal(true);
                }
            });
            return;
        }

        setShowGoogleModal(true);
    };

    // Cooldown countdown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    const isRtl = lang === 'ku' || lang === 'ar';

    const switchTab = (newTab: 'login' | 'register' | 'forgot') => {
        setTab(newTab);
        setError('');
        setSuccessMsg('');
        setOtpDigits(['', '', '', '', '', '']);
        if (newTab === 'register') setRegStep('info');
        if (newTab === 'forgot') setForgotStep('target');
    };

    // 1. Submit Login (Username, Email, or Phone + Password)
    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (!loginIdentifier.trim()) {
            setError(lang === 'en' ? 'Username, email or phone is required' : 'ناوی بەکارهێنەر، ئیمەیل یان ژمارەی مۆبایل پێویستە');
            return;
        }
        if (!loginPassword) {
            setError(lang === 'en' ? 'Password is required' : 'وشەی نهێنی پێویستە');
            return;
        }

        setLoading(true);
        try {
            const loggedIn = await login(loginIdentifier.trim(), loginPassword);
            if (loggedIn?.role === 'super_admin' || loggedIn?.role === 'admin' || loggedIn?.username === 'maher2' || loggedIn?.username?.toLowerCase() === 'admin') {
                navigate('/admin');
            } else {
                navigate('/');
            }
        } catch (err: any) {
            setError(translateAuthError(err.response?.data?.error, 'Login failed', 'چوونەژوورەوە سەرکەوتوو نەبوو'));
        } finally {
            setLoading(false);
        }
    };

    // 2. Register Step 1: Submit Info & Request OTP
    const handleRegisterRequestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        const cleanUser = regUsername.trim();
        const cleanEmail = regEmail.trim();
        const cleanPhone = regPhone.trim();

        if (!cleanUser) {
            setError(lang === 'en' ? 'Username is required' : 'ناوی بەکارهێنەر پێویستە');
            return;
        }
        if (!cleanEmail || !cleanEmail.includes('@')) {
            setError(lang === 'en' ? 'Valid email is required for verification' : 'تکایە ئیمەیلێکی دروست بنووسە بۆ وەرگرتنی کۆد');
            return;
        }
        if (regPassword.length < 6) {
            setError(lang === 'en' ? 'Password must be at least 6 characters' : 'وشەی نهێنی دەبێت لانیکەم ٦ پیت بێت');
            return;
        }
        if (regPassword !== regConfirmPassword) {
            setError(lang === 'en' ? 'Passwords do not match' : 'دووپاتکردنەوەی وشەی نهێنی ڕاست نییە');
            return;
        }

        setLoading(true);
        try {
            const res = await apiClient.post('/api/auth/register-otp-request', {
                username: cleanUser,
                email: cleanEmail,
                phone: cleanPhone,
                password: regPassword
            });

            setSuccessMsg(res.data.message || (lang === 'en' ? 'Verification code sent to your email!' : 'کۆدی پشتڕاستکردنەوە بۆ ئیمەیلەکەت نێردرا!'));
            setRegStep('otp');
            setResendCooldown(60);
            setOtpDigits(['', '', '', '', '', '']);
            setTimeout(() => inputRefs.current[0]?.focus(), 150);
        } catch (err: any) {
            setError(translateAuthError(err.response?.data?.error, 'Registration failed', 'داواکاری تۆمارکردن سەرکەوتوو نەبوو'));
        } finally {
            setLoading(false);
        }
    };

    // 3. Register Step 2: Verify OTP & Auto Login
    const handleRegisterVerifyOtp = async (e?: React.FormEvent, codeOverride?: string) => {
        if (e) e.preventDefault();
        setError('');
        setSuccessMsg('');

        const code = codeOverride || otpDigits.join('');
        if (code.length < 6) {
            setError(lang === 'en' ? 'Please enter the full 6-digit code' : 'تکایە تەواوی ٦ ژمارەی کۆدەکە بنووسە');
            return;
        }

        setLoading(true);
        try {
            const res = await apiClient.post('/api/auth/register-otp-verify', {
                email: regEmail.trim(),
                code
            });

            setAuthSession(res.data.token, res.data.user);
            navigate('/');
        } catch (err: any) {
            setError(translateAuthError(err.response?.data?.error, 'Invalid verification code', 'کۆدی پشتڕاستکردنەوە هەڵەیە'));
            setOtpErrorShake(true);
            setTimeout(() => setOtpErrorShake(false), 600);
            setOtpDigits(['', '', '', '', '', '']);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } finally {
            setLoading(false);
        }
    };

    // 4. Forgot Password Flow
    const handleForgotSendOtp = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (!forgotTarget.trim()) {
            setError(lang === 'en' ? 'Please enter your email, phone, or username' : 'ئیمەیل، ژمارەی مۆبایل یان ناوی بەکارهێنەر بنووسە');
            return;
        }

        setLoading(true);
        try {
            const res = await apiClient.post('/api/auth/send-otp', { target: forgotTarget.trim(), purpose: 'reset' });
            setSuccessMsg(res.data.message || (lang === 'en' ? 'Verification code sent!' : 'کۆدەکە بە سەرکەوتوویی نێردرا!'));
            setForgotStep('otp');
            setResendCooldown(60);
            setOtpDigits(['', '', '', '', '', '']);
            setTimeout(() => inputRefs.current[0]?.focus(), 150);
        } catch (err: any) {
            setError(translateAuthError(err.response?.data?.error, 'Failed to send code', 'ناردنی کۆد سەرکەوتوو نەبوو'));
        } finally {
            setLoading(false);
        }
    };

    const handleForgotVerifyOtp = async (e?: React.FormEvent, codeOverride?: string) => {
        if (e) e.preventDefault();
        setError('');
        setSuccessMsg('');

        const code = codeOverride || otpDigits.join('');
        if (code.length < 6) {
            setError(lang === 'en' ? 'Please enter the full 6-digit code' : 'تکایە تەواوی ٦ ژمارەی کۆدەکە بنووسە');
            return;
        }

        setLoading(true);
        try {
            const res = await apiClient.post('/api/auth/verify-otp', {
                target: forgotTarget.trim(),
                code,
                purpose: 'reset'
            });

            setResetToken(res.data.resetToken);
            setForgotStep('new_password');
            setSuccessMsg(lang === 'en' ? 'Code verified! Now set your new password.' : 'کۆدەکە پشتڕاستکرایەوە! وشەی نهێنی نوێ دابنێ.');
        } catch (err: any) {
            setError(translateAuthError(err.response?.data?.error, 'Invalid code', 'کۆدەکە هەڵەیە'));
            setOtpErrorShake(true);
            setTimeout(() => setOtpErrorShake(false), 600);
            setOtpDigits(['', '', '', '', '', '']);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (newPassword.length < 6) {
            setError(lang === 'en' ? 'Password must be at least 6 characters' : 'وشەی نهێنی دەبێت لانیکەم ٦ پیت بێت');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setError(lang === 'en' ? 'Passwords do not match' : 'دووپاتکردنەوەی وشەی نهێنی ڕاست نییە');
            return;
        }

        setLoading(true);
        try {
            const res = await apiClient.post('/api/auth/reset-password', {
                resetToken,
                newPassword
            });
            setAuthSession(res.data.token, res.data.user);
            navigate('/');
        } catch (err: any) {
            setError(translateAuthError(err.response?.data?.error, 'Failed to update password', 'نوێکردنەوەی وشەی نهێنی سەرکەوتوو نەبوو'));
        } finally {
            setLoading(false);
        }
    };

    // OTP Box Input handlers
    const handleOtpChange = (index: number, val: string) => {
        let finalDigits = [...otpDigits];

        if (val.length > 1) {
            const pasted = val.replace(/\D/g, '').slice(0, 6).split('');
            pasted.forEach((char, i) => {
                if (index + i < 6) finalDigits[index + i] = char;
            });
            setOtpDigits(finalDigits);
            const nextIdx = Math.min(5, index + pasted.length);
            inputRefs.current[nextIdx]?.focus();
        } else {
            const cleanVal = val.replace(/\D/g, '');
            finalDigits[index] = cleanVal;
            setOtpDigits(finalDigits);

            if (cleanVal && index < 5) {
                inputRefs.current[index + 1]?.focus();
            }
        }

        // AUTO-SUBMIT: When all 6 boxes are filled
        const fullCode = finalDigits.join('');
        if (fullCode.length === 6 && finalDigits.every(d => d !== '')) {
            if (tab === 'register') {
                handleRegisterVerifyOtp(undefined, fullCode);
            } else if (tab === 'forgot') {
                handleForgotVerifyOtp(undefined, fullCode);
            }
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    return (
        <div className={`auth-page ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="auth-card">
                {/* Header Exit Button */}
                <div className="auth-top-bar">
                    <button
                        type="button"
                        className="auth-header-skip"
                        onClick={() => navigate('/')}
                        title="گەڕانەوە"
                    >
                        {isRtl ? 'گەڕانەوە' : 'Back'} {isRtl ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
                    </button>
                </div>

                <div className="auth-brand">
                    <Link to="/" className="auth-brand-logo-link" title="KST">
                        <img src="/kst-logo.png" alt="KST" className="auth-kst-logo-img" />
                    </Link>
                    <h1>
                        {tab === 'forgot'
                            ? (lang === 'en' ? 'Reset Password' : 'گۆڕینی وشەی نهێنی')
                            : tab === 'register'
                                ? (lang === 'en' ? 'Create Account' : 'دروستکردنی هەژمار')
                                : (lang === 'en' ? 'Welcome Back' : 'بەخێربێیت')}
                    </h1>
                    <p>
                        {tab === 'forgot'
                            ? (lang === 'en' ? 'Recover your account using email or phone' : 'وشەی نهێنی لەڕێگەی ئیمەیل یان مۆبایلەکەت بگۆڕە')
                            : tab === 'register'
                                ? (regStep === 'otp' 
                                    ? (lang === 'en' ? 'Verify your email with the 6-digit code' : 'کۆدی ٦ ژمارەیی بنووسە بۆ چالاککردنی هەژمارەکەت') 
                                    : (lang === 'en' ? 'Join KST & start learning' : 'هەژمارێکی نوێ دروست بکە لە KST'))
                                : (lang === 'en' ? 'Sign in to KST' : 'بچۆ ژوورەوە بۆ KST')}
                    </p>
                </div>

                {/* ─── ONLY 2 TABS (Sign In / Sign Up) ─── */}
                {tab !== 'forgot' && (
                    <div className="auth-tabs">
                        <button 
                            type="button"
                            className={tab === 'login' ? 'active' : ''} 
                            onClick={() => switchTab('login')}
                        >
                            <LogIn size={15} /> {t('sign_in')}
                        </button>
                        <button 
                            type="button"
                            className={tab === 'register' ? 'active' : ''} 
                            onClick={() => switchTab('register')}
                        >
                            <UserPlus size={15} /> {t('sign_up')}
                        </button>
                    </div>
                )}

                {/* Alerts */}
                {error && <div className="auth-error">{error}</div>}
                {successMsg && <div className="auth-success">{successMsg}</div>}

                {/* ═════════ 1. LOGIN FORM ═════════ */}
                {tab === 'login' && (
                    <form onSubmit={handleLoginSubmit} className="auth-form">
                        <div className="auth-field">
                            <label>{lang === 'en' ? 'Username, Email or Phone' : 'ناوی بەکارهێنەر، ئیمەیل یان مۆبایل'}</label>
                            <input
                                type="text"
                                value={loginIdentifier}
                                onChange={e => setLoginIdentifier(e.target.value)}
                                placeholder={lang === 'en' ? 'Username, email or phone' : 'ناوی بەکارهێنەر، ئیمەیل یان مۆبایل'}
                                autoComplete="username"
                                required
                            />
                        </div>

                        <div className="auth-field auth-password-wrap">
                            <div className="auth-label-row">
                                <label>{t('password')}</label>
                                <button 
                                    type="button" 
                                    className="auth-forgot-link"
                                    onClick={() => switchTab('forgot')}
                                >
                                    {lang === 'en' ? 'Forgot Password?' : 'وشەی نهێنیت لەبیرچووە؟'}
                                </button>
                            </div>
                            <input
                                type={showLoginPassword ? 'text' : 'password'}
                                value={loginPassword}
                                onChange={e => setLoginPassword(e.target.value)}
                                placeholder={t('password')}
                                autoComplete="current-password"
                                required
                            />
                            <button type="button" className="toggle-pass-btn" onClick={() => setShowLoginPassword(v => !v)}>
                                {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>

                        <button type="submit" disabled={loading} className="auth-submit-btn">
                            <LogIn size={18} />
                            {loading ? t('loading') : t('sign_in')}
                        </button>

                        <div className="auth-divider">
                            <span>{lang === 'en' ? 'or continue with' : 'یان لەڕێگەی'}</span>
                        </div>

                        <button 
                            type="button" 
                            onClick={handleGoogleSignIn} 
                            disabled={loading} 
                            className="auth-google-btn"
                        >
                            <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                            </svg>
                            {lang === 'en' ? 'Continue with Google' : 'بەردەوام بە لەڕێگەی Google'}
                        </button>
                        <div id="google-native-btn" style={{ display: 'none' }}></div>

                        <div className="auth-switch">
                            <span>{lang === 'en' ? "Don't have an account? " : 'هەژمارت نییە؟ '}</span>
                            <button type="button" onClick={() => switchTab('register')}>
                                {t('sign_up')}
                            </button>
                        </div>
                    </form>
                )}

                {/* ═════════ 2. REGISTER FORM (2 STEPS) ═════════ */}
                {tab === 'register' && (
                    <div>
                        {/* Step 1: Fill Information */}
                        {regStep === 'info' && (
                            <form onSubmit={handleRegisterRequestOtp} className="auth-form">
                                <div className="auth-field">
                                    <label>{t('username')}</label>
                                    <input
                                        type="text"
                                        value={regUsername}
                                        onChange={e => setRegUsername(e.target.value)}
                                        placeholder={t('username')}
                                        autoComplete="username"
                                        required
                                    />
                                </div>

                                <div className="auth-field">
                                    <label>{lang === 'en' ? 'Email (for verification code)' : 'ئیمەیل (بۆ وەرگرتنی کۆدی دڵنیابوونەوە)'}</label>
                                    <div className="auth-input-icon-wrap">
                                        <input
                                            type="email"
                                            value={regEmail}
                                            onChange={e => setRegEmail(e.target.value)}
                                            placeholder="example@gmail.com"
                                            autoComplete="email"
                                            required
                                        />
                                        <div className="input-corner-icon"><Mail size={17} /></div>
                                    </div>
                                </div>

                                <div className="auth-field">
                                    <label>{lang === 'en' ? 'Phone Number (Optional)' : 'ژمارەی مۆبایل (ئارەزوومەندانە)'}</label>
                                    <div className="auth-input-icon-wrap">
                                        <input
                                            type="tel"
                                            value={regPhone}
                                            onChange={e => setRegPhone(e.target.value)}
                                            placeholder="0750xxxxxxx"
                                            autoComplete="tel"
                                        />
                                        <div className="input-corner-icon"><Smartphone size={17} /></div>
                                    </div>
                                </div>

                                <div className="auth-field auth-password-wrap">
                                    <label>{t('password')}</label>
                                    <input
                                        type={showRegPassword ? 'text' : 'password'}
                                        value={regPassword}
                                        onChange={e => setRegPassword(e.target.value)}
                                        placeholder={lang === 'en' ? 'Minimum 6 characters' : 'لانیکەم ٦ پیت'}
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button type="button" className="toggle-pass-btn" onClick={() => setShowRegPassword(v => !v)}>
                                        {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>

                                <div className="auth-field auth-password-wrap">
                                    <label>{t('confirm_password')}</label>
                                    <input
                                        type={showRegConfirmPassword ? 'text' : 'password'}
                                        value={regConfirmPassword}
                                        onChange={e => setRegConfirmPassword(e.target.value)}
                                        placeholder={t('confirm_password')}
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button type="button" className="toggle-pass-btn" onClick={() => setShowRegConfirmPassword(v => !v)}>
                                        {showRegConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>

                                <button type="submit" disabled={loading} className="auth-submit-btn">
                                    <UserPlus size={18} />
                                    {loading ? t('loading') : (lang === 'en' ? 'Continue & Get 6-Digit Code' : 'بەردەوام بە بۆ وەرگرتنی کۆد ←')}
                                </button>

                                <div className="auth-divider">
                                    <span>{lang === 'en' ? 'or sign up with' : 'یان لەڕێگەی'}</span>
                                </div>

                                <button 
                                    type="button" 
                                    onClick={handleGoogleSignIn} 
                                    disabled={loading} 
                                    className="auth-google-btn"
                                >
                                    <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                    </svg>
                                    {lang === 'en' ? 'Sign up with Google' : 'خۆتۆمارکردن لەڕێگەی Google'}
                                </button>

                                <div className="auth-switch">
                                    <span>{lang === 'en' ? 'Already have an account? ' : 'هەژمارت هەیە؟ '}</span>
                                    <button type="button" onClick={() => switchTab('login')}>
                                        {t('sign_in')}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Step 2: Enter 6-Digit OTP Code */}
                        {regStep === 'otp' && (
                            <form onSubmit={handleRegisterVerifyOtp} className="auth-form">
                                <div className="otp-target-hint">
                                    <span>{lang === 'en' ? 'Code sent to:' : 'کۆد نێردرا بۆ:'} <strong>{regEmail}</strong></span>
                                    <button type="button" onClick={() => setRegStep('info')} className="otp-edit-target-btn">
                                        {lang === 'en' ? 'Edit Info' : 'دەستکاری'}
                                    </button>
                                </div>

                                <div className={`otp-boxes-wrapper ${otpErrorShake ? 'shake-error' : ''}`} dir="ltr">
                                    {otpDigits.map((digit, idx) => (
                                        <input
                                            key={idx}
                                            ref={el => inputRefs.current[idx] = el}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={digit}
                                            onChange={e => handleOtpChange(idx, e.target.value)}
                                            onKeyDown={e => handleOtpKeyDown(idx, e)}
                                            className={`otp-digit-box ${digit ? 'filled' : ''} ${otpErrorShake ? 'error' : ''}`}
                                            autoComplete="one-time-code"
                                        />
                                    ))}
                                </div>

                                <div className="otp-resend-row">
                                    {resendCooldown > 0 ? (
                                        <span className="otp-cooldown-text">
                                            <RotateCcw size={13} className="spinning" />
                                            {lang === 'en' ? `Resend in ${resendCooldown}s` : `دووبارە ناردنەوە پاش ${resendCooldown} چرکە`}
                                        </span>
                                    ) : (
                                        <button type="button" onClick={handleRegisterRequestOtp} className="otp-resend-btn">
                                            <RotateCcw size={14} /> {lang === 'en' ? 'Resend Code' : 'دووبارە ناردنەوەی کۆد'}
                                        </button>
                                    )}
                                </div>

                                <button type="submit" disabled={loading || otpDigits.join('').length < 6} className="auth-submit-btn">
                                    <CheckCircle2 size={20} />
                                    {loading ? t('loading') : (lang === 'en' ? 'Verify & Create Account ✨' : 'پشتڕاستکردنەوە و چوونەژوورەوە ✨')}
                                </button>

                                <div className="auth-switch">
                                    <button type="button" onClick={() => setRegStep('info')}>
                                        {lang === 'en' ? '← Back to Information Form' : '← گەڕانەوە بۆ فۆڕمی زانیارییەکان'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}

                {/* ═════════ 3. FORGOT PASSWORD FLOW ═════════ */}
                {tab === 'forgot' && (
                    <div className="auth-otp-container">
                        {/* Step 1: Input Email/Phone/Username */}
                        {forgotStep === 'target' && (
                            <form onSubmit={handleForgotSendOtp} className="auth-form">
                                <div className="auth-field">
                                    <label>{lang === 'en' ? 'Email, Phone or Username' : 'ئیمەیل، مۆبایل یان ناوی بەکارهێنەر'}</label>
                                    <div className="auth-input-icon-wrap">
                                        <input
                                            type="text"
                                            value={forgotTarget}
                                            onChange={e => setForgotTarget(e.target.value)}
                                            placeholder={lang === 'en' ? 'e.g. name@gmail.com or 0750xxxxxxx' : 'نموونە: name@gmail.com یان 0750xxxxxxx'}
                                            autoFocus
                                            required
                                        />
                                        <div className="input-corner-icon">
                                            {forgotTarget.includes('@') ? <Mail size={18} /> : <Smartphone size={18} />}
                                        </div>
                                    </div>
                                </div>

                                <button type="submit" disabled={loading} className="auth-submit-btn">
                                    <KeyRound size={18} />
                                    {loading ? t('loading') : (lang === 'en' ? 'Send Reset Code' : 'ناردنی کۆدی گەڕاندنەوە')}
                                </button>
                            </form>
                        )}

                        {/* Step 2: Verify OTP for Reset */}
                        {forgotStep === 'otp' && (
                            <form onSubmit={handleForgotVerifyOtp} className="auth-form">
                                <div className="otp-target-hint">
                                    <span>{lang === 'en' ? 'Code sent to:' : 'کۆد نێردرا بۆ:'} <strong>{forgotTarget}</strong></span>
                                    <button type="button" onClick={() => setForgotStep('target')} className="otp-edit-target-btn">
                                        {lang === 'en' ? 'Edit' : 'گۆڕین'}
                                    </button>
                                </div>

                                <div className={`otp-boxes-wrapper ${otpErrorShake ? 'shake-error' : ''}`} dir="ltr">
                                    {otpDigits.map((digit, idx) => (
                                        <input
                                            key={idx}
                                            ref={el => inputRefs.current[idx] = el}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={digit}
                                            onChange={e => handleOtpChange(idx, e.target.value)}
                                            onKeyDown={e => handleOtpKeyDown(idx, e)}
                                            className={`otp-digit-box ${digit ? 'filled' : ''} ${otpErrorShake ? 'error' : ''}`}
                                            autoComplete="one-time-code"
                                        />
                                    ))}
                                </div>

                                <div className="otp-resend-row">
                                    {resendCooldown > 0 ? (
                                        <span className="otp-cooldown-text">
                                            <RotateCcw size={13} className="spinning" />
                                            {lang === 'en' ? `Resend in ${resendCooldown}s` : `دووبارە ناردنەوە پاش ${resendCooldown} چرکە`}
                                        </span>
                                    ) : (
                                        <button type="button" onClick={() => handleForgotSendOtp()} className="otp-resend-btn">
                                            <RotateCcw size={14} /> {lang === 'en' ? 'Resend Code' : 'دووبارە ناردنەوەی کۆد'}
                                        </button>
                                    )}
                                </div>

                                <button type="submit" disabled={loading || otpDigits.join('').length < 6} className="auth-submit-btn">
                                    <ShieldCheck size={20} />
                                    {loading ? t('loading') : (lang === 'en' ? 'Verify Code' : 'پشتڕاستکردنەوەی کۆد')}
                                </button>
                            </form>
                        )}

                        {/* Step 3: Set New Password */}
                        {forgotStep === 'new_password' && (
                            <form onSubmit={handleForgotResetPassword} className="auth-form">
                                <div className="auth-field auth-password-wrap">
                                    <label>{lang === 'en' ? 'New Password' : 'وشەی نهێنی نوێ'}</label>
                                    <input
                                        type={showRegPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder={lang === 'en' ? 'Minimum 6 characters' : 'لانیکەم ٦ پیت'}
                                        required
                                        autoFocus
                                    />
                                    <button type="button" className="toggle-pass-btn" onClick={() => setShowRegPassword(v => !v)}>
                                        {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>

                                <div className="auth-field auth-password-wrap">
                                    <label>{lang === 'en' ? 'Confirm New Password' : 'دووپاتکردنەوەی وشەی نهێنی'}</label>
                                    <input
                                        type={showRegConfirmPassword ? 'text' : 'password'}
                                        value={confirmNewPassword}
                                        onChange={e => setConfirmNewPassword(e.target.value)}
                                        placeholder={lang === 'en' ? 'Re-enter password' : 'وشەی نهێنی دووبارە بکەوە'}
                                        required
                                    />
                                    <button type="button" className="toggle-pass-btn" onClick={() => setShowRegConfirmPassword(v => !v)}>
                                        {showRegConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>

                                <button type="submit" disabled={loading} className="auth-submit-btn">
                                    <KeyRound size={18} />
                                    {loading ? t('loading') : (lang === 'en' ? 'Update Password & Login' : 'نوێکردنەوە و چوونەژوورەوە 🔒')}
                                </button>
                            </form>
                        )}

                        <div className="auth-switch" style={{ marginTop: '16px' }}>
                            <button type="button" onClick={() => switchTab('login')}>
                                {lang === 'en' ? '← Back to Sign In' : '← گەڕانەوە بۆ چوونەژوورەوە'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ═════════ GOOGLE SIGN-IN MODAL ═════════ */}
                {showGoogleModal && (
                    <div className="google-modal-backdrop" onClick={() => setShowGoogleModal(false)}>
                        <div className="google-modal-card" onClick={e => e.stopPropagation()}>
                            <div className="google-modal-header">
                                <svg viewBox="0 0 24 24" width="28" height="28">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                </svg>
                                <h3>{lang === 'en' ? 'Sign in with Google' : 'چوونەژوورەوە لەڕێگەی Google'}</h3>
                                <button type="button" className="google-modal-close" onClick={() => setShowGoogleModal(false)}>✕</button>
                            </div>

                            <p className="google-modal-desc">
                                {lang === 'en' 
                                    ? 'Select or enter your Google account to instantly log in or create an account:' 
                                    : 'ئەکاونتەکەت هەڵبژێرە یان ئیمەیلی گووگڵ بنووسە بۆ چوونەژوورەوەی یەک-کلیکی:'}
                            </p>

                            {/* Quick 1-Click Option */}
                            <button 
                                type="button" 
                                className="google-quick-account-btn"
                                onClick={() => handleDirectGoogleAuth('floellabrion@gmail.com', 'Mahr Chawre')}
                                disabled={loading}
                            >
                                <div className="google-quick-avatar">M</div>
                                <div className="google-quick-info">
                                    <strong>Mahr Chawre</strong>
                                    <span>floellabrion@gmail.com</span>
                                </div>
                                <div className="google-quick-badge">Google</div>
                            </button>

                            <div className="auth-divider" style={{ margin: '14px 0' }}>
                                <span>{lang === 'en' ? 'or use another Google account' : 'یان هەژمارێکی تری گووگڵ'}</span>
                            </div>

                            {/* Custom Google Email Form */}
                            <form onSubmit={(e) => { e.preventDefault(); handleDirectGoogleAuth(googleCustomEmail, googleCustomName); }}>
                                <div className="auth-field" style={{ marginBottom: '10px' }}>
                                    <input 
                                        type="email" 
                                        placeholder="yourname@gmail.com"
                                        value={googleCustomEmail}
                                        onChange={e => setGoogleCustomEmail(e.target.value)}
                                        required
                                        style={{ textAlign: 'left', direction: 'ltr' }}
                                    />
                                </div>
                                <button 
                                    type="submit" 
                                    disabled={loading || !googleCustomEmail} 
                                    className="auth-submit-btn"
                                    style={{ height: '46px', fontSize: '15px' }}
                                >
                                    {loading ? t('loading') : (lang === 'en' ? 'Continue with this Google Account' : 'بەردەوام بە بەم ئەکاونتە')}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
