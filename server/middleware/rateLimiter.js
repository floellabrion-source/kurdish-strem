const rateLimit = require('express-rate-limit');

// 1. Strict Limiter for Login (Anti Brute-Force Protection)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60, // Limit each IP to 60 login attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '⚠️ هەوڵی چوونەژوورەوەی زۆر هەبوو لەم ئامێرەوە. بۆ پاراستنی ئەکاونتەکان، تکایە کەمێک دواتر تاقی بکەرەوە.' }
});

// 2. Limiter for Register (Anti-Spam & Bot Accounts)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // Limit each IP to 30 account creations per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '⚠️ ژمارەی تۆمارکردنی ئەکاونت لە سنوور بەدەرە لەم ئامێرەوە. تکایە کەمێک چاوەڕێ بکە.' }
});

// 3. Limiter for Credit / Receipt Submissions
const creditRequestLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 6, // Limit each IP to 6 receipt submissions per 10 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '⚠️ تکایە کەمێک چاوەڕێ بکە پێش ناردنی وەسڵی تر.' }
});

// 4. Limiter for AI Generation endpoints
const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 35, // Limit each IP to 35 AI requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'داواکاری زۆر نێردرا بۆ AI. تکایە کەمێک چاوەڕێ بکە.' }
});

// 5. Global API Limiter for DDoS / Scraping prevention
const apiGlobalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 350, // Limit each IP to 350 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'داواکاری بەربڵاو تێپەڕی. تکایە چاوەڕێ بکەرەوە.' }
});

module.exports = {
    loginLimiter,
    registerLimiter,
    creditRequestLimiter,
    aiLimiter,
    apiGlobalLimiter
};
