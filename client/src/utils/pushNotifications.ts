import axios from '../api/client';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] Push notifications not supported in this browser.');
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        return registration;
    } catch (err) {
        console.error('[Push] Service Worker registration failed:', err);
        return null;
    }
}

export async function subscribeToPushNotifications(): Promise<boolean> {
    try {
        const registration = await registerPushServiceWorker();
        if (!registration) return false;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('[Push] Notification permission denied.');
            return false;
        }

        // Get VAPID public key from backend
        const keyRes = await axios.get('/api/notifications/vapid-public-key');
        const publicKey = keyRes.data.publicKey;
        if (!publicKey) return false;

        const convertedVapidKey = urlBase64ToUint8Array(publicKey);

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });
        }

        // Send subscription to server
        await axios.post('/api/notifications/subscribe', { subscription });
        return true;
    } catch (err) {
        console.error('[Push] Failed to subscribe to push notifications:', err);
        return false;
    }
}

export function isPushNotificationSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
