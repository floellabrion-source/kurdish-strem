import { AxiosError } from 'axios';

/**
 * Unified API Error Extractor for Client Pages
 * Handles nested backend response errors, network errors, timeouts, and fallbacks cleanly.
 */
export function extractApiError(error: unknown, fallbackMessage: string = 'کێشە لە پەیوەندی سێرڤەر هەیە'): string {
    if (!error) return fallbackMessage;

    if (error instanceof AxiosError) {
        const serverData = error.response?.data;

        if (typeof serverData === 'string' && serverData.trim()) {
            return serverData.trim();
        }

        if (serverData && typeof serverData === 'object') {
            if (serverData.error) {
                if (typeof serverData.error === 'string') return serverData.error;
                if (serverData.error.message) return serverData.error.message;
            }
            if (serverData.message) return serverData.message;
        }

        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return 'داواکارییەکە کاتی بەسەرچوو (Timeout). تکایە هێڵی ئینتەرنێتەکەت بپشکنە.';
        }

        if (error.response?.status === 429) {
            return 'داواکاری زۆر بەنێردرا. تکایە کەمێک چاوەڕێ بکەرەوە.';
        }

        if (error.response?.status === 401) {
            return 'تکایە دووبارە بچۆژوورەوە (تۆکن بەسەرچووە).';
        }

        if (error.response?.status === 403) {
            return 'ڕێگەپێدان نییە بۆ ئەنجامدانی ئەم کارە.';
        }

        if (error.response?.status === 404) {
            return 'داواکارییەکە ندۆزرایەوە (404).';
        }
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallbackMessage;
}
