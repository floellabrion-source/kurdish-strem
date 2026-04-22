import { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, Users, Film, Activity, CalendarDays, Calendar } from 'lucide-react';
import './AdminAnalytics.css';

interface AnalyticsData {
    totalUsers: number;
    totalMovies: number;
    visitors: {
        daily: number;
        weekly: number;
        monthly: number;
        yearly: number;
    };
}

export default function AdminAnalytics() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const loadAnalytics = async () => {
            try {
                setErrorMsg('');
                const res = await axios.get('/api/admin/analytics');
                setData(res.data);
            } catch (error) {
                console.error('Error loading analytics:', error);
                const msg = (error as any)?.response?.data?.error || 'ناتوانرێت داتای ئامار بخوێندرێتەوە.';
                setErrorMsg(msg);
            } finally {
                setLoading(false);
            }
        };

        loadAnalytics();
    }, []);

    if (loading) {
        return <div className="admin-loading"><Loader2 size={32} className="spinning" /></div>;
    }

    if (!data) {
        return <div style={{ textAlign: 'center', padding: '40px', color: errorMsg ? '#f87171' : '#64748b' }}>{errorMsg || 'هیچ داتایەک نییە'}</div>;
    }

    return (
        <div className="analytics-container">
            <div className="analytics-grid">
                
                <div className="analytics-card primary-card">
                    <div className="ac-icon-box users">
                        <Users size={24} />
                    </div>
                    <div className="ac-content">
                        <h3>کۆی بەکارهێنەران</h3>
                        <p className="ac-value">{data.totalUsers}</p>
                    </div>
                </div>

                <div className="analytics-card primary-card">
                    <div className="ac-icon-box movies">
                        <Film size={24} />
                    </div>
                    <div className="ac-content">
                        <h3>کۆی بەرهەمەکان</h3>
                        <p className="ac-value">{data.totalMovies}</p>
                    </div>
                </div>

            </div>

            <h2 className="analytics-section-title">
                <Activity size={20} /> ئاماری سەردانکەران
            </h2>

            <div className="analytics-grid">
                <div className="analytics-card visitor-card daily">
                    <div className="ac-icon-box">
                        <Calendar size={20} />
                    </div>
                    <div className="ac-content">
                        <h3>سەردانکەرانی ئەمڕۆ</h3>
                        <p className="ac-value">{data.visitors.daily}</p>
                    </div>
                </div>

                <div className="analytics-card visitor-card weekly">
                    <div className="ac-icon-box">
                        <CalendarDays size={20} />
                    </div>
                    <div className="ac-content">
                        <h3>سەردانکەرانی ئەم هەفتەیە</h3>
                        <p className="ac-value">{data.visitors.weekly}</p>
                    </div>
                </div>

                <div className="analytics-card visitor-card monthly">
                    <div className="ac-icon-box">
                        <Calendar size={20} />
                    </div>
                    <div className="ac-content">
                        <h3>سەردانکەرانی ئەم مانگە</h3>
                        <p className="ac-value">{data.visitors.monthly}</p>
                    </div>
                </div>

                <div className="analytics-card visitor-card yearly">
                    <div className="ac-icon-box">
                        <Activity size={20} />
                    </div>
                    <div className="ac-content">
                        <h3>سەردانکەرانی ئەم ساڵ</h3>
                        <p className="ac-value">{data.visitors.yearly}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
