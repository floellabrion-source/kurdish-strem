const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'notificationSettings.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'pushSubscriptions.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapidKeys.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Initialize or Load VAPID Keys
let vapidKeys = { publicKey: '', privateKey: '' };
if (fs.existsSync(VAPID_FILE)) {
    try {
        vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
    } catch (e) {
        vapidKeys = webpush.generateVAPIDKeys();
        fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
    }
} else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
}

webpush.setVapidDetails(
    'mailto:support@kurdishstream.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Default Notification Settings
const DEFAULT_SETTINGS = {
    inactivityReminderDays: 3,
    inactivityPenaltyXP: 20,
    reminderFrequencyDays: 3,
    autoNewContentPush: true,
    autoCreditStatusPush: true,
    quietHoursEnabled: false,
    quietHoursStart: "23:00",
    quietHoursEnd: "08:00",
    lastUpdatedBy: "Super Admin",
    lastUpdatedAt: Date.now()
};

function readSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
        return DEFAULT_SETTINGS;
    }
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
}

function writeSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function readSubscriptions() {
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function writeSubscriptions(subs) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2));
}

function addSubscription(userId, subscription) {
    const subs = readSubscriptions();
    const existingIdx = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    
    if (existingIdx !== -1) {
        subs[existingIdx].userId = userId || subs[existingIdx].userId;
        subs[existingIdx].updatedAt = Date.now();
    } else {
        subs.push({
            id: uuidv4(),
            userId: userId || null,
            subscription,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    }
    writeSubscriptions(subs);
}

function isQuietHoursNow(settings) {
    if (!settings.quietHoursEnabled) return false;
    try {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();

        const [sH, sM] = (settings.quietHoursStart || '23:00').split(':').map(Number);
        const [eH, eM] = (settings.quietHoursEnd || '08:00').split(':').map(Number);

        const startMins = sH * 60 + sM;
        const endMins = eH * 60 + eM;

        if (startMins > endMins) {
            // Over midnight (e.g. 23:00 to 08:00)
            return currentMins >= startMins || currentMins <= endMins;
        } else {
            return currentMins >= startMins && currentMins <= endMins;
        }
    } catch (e) {
        return false;
    }
}

async function sendPushNotification(subscription, payload) {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return true;
    } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
            // Expired subscription, cleanup
            const subs = readSubscriptions().filter(s => s.subscription.endpoint !== subscription.endpoint);
            writeSubscriptions(subs);
        }
        return false;
    }
}

async function broadcastPushToAll(payload) {
    const settings = readSettings();
    if (isQuietHoursNow(settings)) {
        console.log('[Push] Quiet hours active. Push suppressed.');
        return { total: 0, sent: 0 };
    }

    const subs = readSubscriptions();
    let sent = 0;

    const promises = subs.map(async (sub) => {
        const ok = await sendPushNotification(sub.subscription, payload);
        if (ok) sent++;
    });

    await Promise.allSettled(promises);
    return { total: subs.length, sent };
}

async function sendPushToUser(userId, payload) {
    const settings = readSettings();
    if (isQuietHoursNow(settings)) return false;

    const subs = readSubscriptions().filter(s => s.userId === userId);
    let sent = 0;
    for (const sub of subs) {
        const ok = await sendPushNotification(sub.subscription, payload);
        if (ok) sent++;
    }
    return sent > 0;
}

module.exports = {
    getVapidPublicKey: () => vapidKeys.publicKey,
    readSettings,
    writeSettings,
    readSubscriptions,
    addSubscription,
    broadcastPushToAll,
    sendPushToUser,
    sendPushNotification
};
