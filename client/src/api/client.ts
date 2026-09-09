import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000 // 30 seconds timeout
});

// Request interceptor to automatically attach JWT token if available
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('kurdish_stream_token') || localStorage.getItem('ks_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor for unified error handling & auto token cleanup
apiClient.interceptors.response.use((response) => {
    return response;
}, (error) => {
    if (error.response?.status === 401) {
        const url = error.config?.url || '';
        // Only trigger token purge if an authenticated request failed (NOT login or register)
        if (!url.includes('/api/auth/login') && !url.includes('/api/auth/register') && !url.includes('/api/auth/forgot')) {
            console.warn('[API Client] Unauthorized request (401). Purging invalid token.');
            const currentToken = localStorage.getItem('kurdish_stream_token') || localStorage.getItem('ks_token');
            if (currentToken) {
                localStorage.removeItem('kurdish_stream_token');
                localStorage.removeItem('ks_token');
                localStorage.removeItem('kurdish_stream_user');
                // Dispatch window event so AuthContext can react seamlessly without hard refresh
                window.dispatchEvent(new Event('auth_token_expired'));
            }
        }
    }
    return Promise.reject(error);
});

export default apiClient;
