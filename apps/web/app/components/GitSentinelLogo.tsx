import React from 'react';

interface GitSentinelLogoProps {
  className?: string;
  size?: number | string;
}

export function GitSentinelLogo({ className, size }: GitSentinelLogoProps) {
  const inlineStyle = typeof size === 'number' ? { width: size, height: size } : size ? { width: size, height: size } : undefined;

  return (
    <div
      style={inlineStyle}
      className={`relative inline-flex items-center justify-center rounded-[9px] bg-blue-600 text-white shadow-xs shadow-blue-500/25 shrink-0 overflow-hidden transition-all select-none ${
        className || 'h-8 w-8'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="white"
        className="h-[58%] w-[58%] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 2C10.2 3.6 7.7 5 5.7 5C5.15 5 4.7 5.45 4.7 6V13C4.7 18 8.2 20.5 11.66 21.95C11.88 22.04 12.12 22.04 12.34 21.95C15.8 20.5 19.3 18 19.3 13V6C19.3 5.45 18.85 5 18.3 5C16.3 5 13.8 3.6 12 2Z"
          fill="white"
        />
      </svg>
    </div>
  );
}
