import React, { useState } from 'react';
import { Film } from 'lucide-react';
import './OptimizedImage.css';

interface OptimizedImageProps {
    src?: string | null;
    alt?: string;
    className?: string;
    isThumbnail?: boolean;
    aspectRatio?: '2/3' | '16/9' | '1/1' | 'auto';
    fallbackIconSize?: number;
    onClick?: () => void;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
    src,
    alt = '',
    className = '',
    isThumbnail = false,
    aspectRatio = '2/3',
    fallbackIconSize = 28,
    onClick
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    // Compute optimized URL if it's a local /api/poster/ URL and isThumbnail is requested
    const computedSrc = React.useMemo(() => {
        if (!src) return null;
        if (isThumbnail && src.includes('/api/poster/')) {
            return src.includes('?') ? `${src}&thumb=1` : `${src}?thumb=1`;
        }
        return src;
    }, [src, isThumbnail]);

    const aspectClass = aspectRatio === '16/9' ? 'aspect-16-9' : aspectRatio === '1/1' ? 'aspect-1-1' : aspectRatio === 'auto' ? 'aspect-auto' : 'aspect-2-3';

    if (!computedSrc || hasError) {
        return (
            <div className={`opt-image-fallback ${aspectClass} ${className}`} onClick={onClick}>
                <Film size={fallbackIconSize} className="opt-fallback-icon" />
                <span className="opt-fallback-text">{alt || 'KST'}</span>
            </div>
        );
    }

    return (
        <div className={`opt-image-container ${aspectClass} ${className}`} onClick={onClick}>
            {/* Shimmer Placeholder while loading */}
            {!isLoaded && <div className="opt-image-skeleton" />}
            
            <img
                src={computedSrc}
                alt={alt}
                loading="lazy"
                decoding="async"
                className={`opt-image-element ${isLoaded ? 'loaded' : 'loading'}`}
                onLoad={() => setIsLoaded(true)}
                onError={() => setHasError(true)}
            />
        </div>
    );
};
