import React, { createContext, useContext, useState, useEffect } from 'react';

interface PwaContextType {
    isInstallable: boolean;
    isInstalled: boolean;
    isIOS: boolean;
    showInstallModal: boolean;
    isBannerVisible: boolean;
    promptInstall: () => Promise<boolean>;
    openInstallGuide: () => void;
    closeInstallGuide: () => void;
    dismissBanner: () => void;
}

const PwaContext = createContext<PwaContextType | undefined>(undefined);

export const PwaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstalled, setIsInstalled] = useState<boolean>(false);
    const [isIOS, setIsIOS] = useState<boolean>(false);
    const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
    const [isBannerVisible, setIsBannerVisible] = useState<boolean>(false);

    useEffect(() => {
        // Check if running in standalone (installed) mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true;
        
        setIsInstalled(isStandalone);

        // Detect iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIosDevice);

        // Check if banner was dismissed recently (last 5 days)
        const dismissedAt = localStorage.getItem('pwa_banner_dismissed');
        const isDismissed = dismissedAt && (Date.now() - parseInt(dismissedAt, 10)) < 5 * 24 * 60 * 60 * 1000;

        if (!isStandalone && !isDismissed) {
            // Show banner after 3 seconds on initial visit
            const timer = setTimeout(() => {
                setIsBannerVisible(true);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, []);

    useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        const handleAppInstalled = () => {
            setIsInstalled(true);
            setIsBannerVisible(false);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const promptInstall = async (): Promise<boolean> => {
        if (deferredPrompt) {
            try {
                deferredPrompt.prompt();
                const choiceResult = await deferredPrompt.userChoice;
                if (choiceResult.outcome === 'accepted') {
                    setIsInstalled(true);
                    setIsBannerVisible(false);
                    setDeferredPrompt(null);
                    return true;
                }
            } catch (err) {
                console.error('[PWA] Error during install prompt:', err);
                setShowInstallModal(true);
            }
        } else {
            setShowInstallModal(true);
            return false;
        }
        return false;
    };

    const openInstallGuide = () => {
        setShowInstallModal(true);
    };

    const closeInstallGuide = () => {
        setShowInstallModal(false);
    };

    const dismissBanner = () => {
        setIsBannerVisible(false);
        localStorage.setItem('pwa_banner_dismissed', Date.now().toString());
    };

    const isInstallable = !isInstalled && (deferredPrompt !== null || isIOS);

    return (
        <PwaContext.Provider
            value={{
                isInstallable,
                isInstalled,
                isIOS,
                showInstallModal,
                isBannerVisible,
                promptInstall,
                openInstallGuide,
                closeInstallGuide,
                dismissBanner
            }}
        >
            {children}
        </PwaContext.Provider>
    );
};

export const usePwa = () => {
    const context = useContext(PwaContext);
    if (!context) {
        throw new Error('usePwa must be used within a PwaProvider');
    }
    return context;
};
