import React from 'react';

interface CountryFlagProps {
    code?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    style?: React.CSSProperties;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ code, className = '', size = 'md', style = {} }) => {
    if (!code) return null;

    const cleanCode = code.trim().toLowerCase();
    // Normalize aliases
    const isoCode = cleanCode === 'uk' ? 'gb' : cleanCode === 'en' ? 'gb' : cleanCode === 'usa' ? 'us' : cleanCode;

    const dimensions = size === 'sm' ? { w: 16, h: 12 } : size === 'lg' ? { w: 28, h: 21 } : { w: 20, h: 15 };

    return (
        <img
            src={`https://flagcdn.com/${dimensions.w * 2}x${dimensions.h * 2}/${isoCode}.png`}
            alt={code.toUpperCase()}
            className={`country-flag-img ${className}`}
            style={{
                width: `${dimensions.w}px`,
                height: `${dimensions.h}px`,
                objectFit: 'cover',
                borderRadius: '3px',
                display: 'inline-block',
                verticalAlign: 'middle',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                ...style
            }}
            onError={(e) => {
                // If flag image fails, hide broken img icon
                (e.target as HTMLElement).style.display = 'none';
            }}
            loading="lazy"
        />
    );
};

export default CountryFlag;
