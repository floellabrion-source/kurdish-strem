const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kurdish-stream-secret-key-change-in-prod-2025';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'چووندەژوورەوە پێویستە (Token Missing)' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // Return 401 HTTP status for invalid/expired token so client can auto-refresh or purge token
            return res.status(401).json({ error: 'تۆکنەکە بەسەرچووە یان هەڵەیە (Token Invalid or Expired)' });
        }
        req.user = user;
        next();
    });
}

function optionalAuthenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            req.user = null;
        } else {
            req.user = user;
        }
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'تەنها ئەدمین ڕێگەی پێدراوە (Admin Access Required)' });
    }
    next();
}

module.exports = {
    authenticateToken,
    optionalAuthenticateToken,
    requireAdmin,
    JWT_SECRET
};
