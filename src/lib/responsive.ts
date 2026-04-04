/**
 * Responsive Utility Classes and Helpers
 * Use these classes and functions for consistent responsive design across the application
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine Tailwind classes with proper merging
 * Use this instead of cn() for consistent classname handling
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Responsive breakpoint values
 */
export const BREAKPOINTS = {
  xs: 320,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * Media query breakpoints for use in CSS-in-JS
 */
export const MEDIA_QUERIES = {
  xs: `@media (min-width: ${BREAKPOINTS.xs}px)`,
  sm: `@media (min-width: ${BREAKPOINTS.sm}px)`,
  md: `@media (min-width: ${BREAKPOINTS.md}px)`,
  lg: `@media (min-width: ${BREAKPOINTS.lg}px)`,
  xl: `@media (min-width: ${BREAKPOINTS.xl}px)`,
  '2xl': `@media (min-width: ${BREAKPOINTS['2xl']}px)`,
  smDown: `@media (max-width: ${BREAKPOINTS.sm - 1}px)`,
  mdDown: `@media (max-width: ${BREAKPOINTS.md - 1}px)`,
  lgDown: `@media (max-width: ${BREAKPOINTS.lg - 1}px)`,
  xlDown: `@media (max-width: ${BREAKPOINTS.xl - 1}px)`,
} as const;

/**
 * Predefined responsive class combinations
 */
export const RESPONSIVE_CLASSES = {
  // Padding variations
  padding: {
    sm: 'p-2 sm:p-3 md:p-4',
    md: 'p-3 sm:p-4 md:p-6',
    lg: 'p-4 sm:p-6 md:p-8',
  },
  // Gap variations
  gap: {
    sm: 'gap-2 sm:gap-3 md:gap-4',
    md: 'gap-3 sm:gap-4 md:gap-6',
    lg: 'gap-4 sm:gap-6 md:gap-8',
  },
  // Font sizes
  fontSize: {
    xs: 'text-xs sm:text-xs',
    sm: 'text-xs sm:text-sm',
    base: 'text-sm sm:text-base',
    lg: 'text-base sm:text-lg',
    xl: 'text-lg sm:text-xl',
    '2xl': 'text-xl sm:text-2xl',
    '3xl': 'text-2xl sm:text-3xl',
  },
  // Icon sizing
  icon: {
    sm: 'h-3 w-3 sm:h-4 sm:w-4',
    md: 'h-4 w-4 sm:h-5 sm:w-5',
    lg: 'h-5 w-5 sm:h-6 sm:w-6',
  },
  // Button sizing
  button: {
    sm: 'h-8 w-8 sm:h-9 sm:w-9 px-2 sm:px-3 py-1 sm:py-2',
    md: 'h-9 w-9 sm:h-10 sm:w-10 px-3 sm:px-4 py-2 sm:py-2.5',
    lg: 'h-10 w-10 sm:h-11 sm:w-11 px-4 sm:px-6 py-2.5 sm:py-3',
  },
  // Grid layouts
  grid: {
    auto: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    cols2: 'grid-cols-1 sm:grid-cols-2',
    cols3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    cols4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  },
} as const;

/**
 * Responsive header title styling
 */
export const RESPONSIVE_HEADING = {
  h1: 'text-2xl sm:text-3xl md:text-4xl font-bold',
  h2: 'text-xl sm:text-2xl md:text-3xl font-bold',
  h3: 'text-lg sm:text-xl md:text-2xl font-bold',
  h4: 'text-base sm:text-lg md:text-xl font-bold',
} as const;

/**
 * Responsive container class
 */
export const RESPONSIVE_CONTAINER = 'w-full px-3 sm:px-4 md:px-6 lg:px-8 mx-auto max-w-[1600px]';

/**
 * Get responsive class for padding
 */
export function getResponsivePadding(size: 'sm' | 'md' | 'lg' = 'md'): string {
  return RESPONSIVE_CLASSES.padding[size];
}

/**
 * Get responsive class for gap
 */
export function getResponsiveGap(size: 'sm' | 'md' | 'lg' = 'md'): string {
  return RESPONSIVE_CLASSES.gap[size];
}

/**
 * Get responsive class for grid
 */
export function getResponsiveGrid(cols: 'auto' | 'cols2' | 'cols3' | 'cols4' = 'auto'): string {
  return RESPONSIVE_CLASSES.grid[cols];
}

/**
 * Get responsive heading class
 */
export function getResponsiveHeading(level: 'h1' | 'h2' | 'h3' | 'h4' = 'h2'): string {
  return RESPONSIVE_HEADING[level];
}

/**
 * Utility to check if screen is mobile
 * Usage: if (isMobileScreen()) { ... }
 */
export function isMobileScreen(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < BREAKPOINTS.md;
}

/**
 * Utility to check if screen is tablet
 */
export function isTabletScreen(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= BREAKPOINTS.md && window.innerWidth < BREAKPOINTS.lg;
}

/**
 * Utility to check if screen is desktop
 */
export function isDesktopScreen(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= BREAKPOINTS.lg;
}

/**
 * Common responsive button class combinations
 */
export const RESPONSIVE_BUTTON_CLASSES = {
  primary: 'px-3 py-2 sm:px-4 sm:py-2.5 md:px-6 md:py-3 text-xs sm:text-sm md:text-base',
  secondary: 'px-2 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-2.5 text-xs sm:text-sm',
  icon: 'h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10',
} as const;

/**
 * Get responsive text size for body/content
 */
export function getResponsiveBodyText(adjust: -1 | 0 | 1 = 0): string {
  const sizes = [
    'text-xs sm:text-sm md:text-base', // -1
    'text-sm sm:text-base md:text-lg', // 0
    'text-base sm:text-lg md:text-xl', // 1
  ];
  return sizes[adjust + 1] || sizes[1];
}

/**
 * Common responsive form input class
 */
export const RESPONSIVE_INPUT_CLASS = 'w-full px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm';

/**
 * Common responsive card padding
 */
export const RESPONSIVE_CARD_PADDING = 'p-3 sm:p-4 md:p-6';

/**
 * Responsive margin/padding helper
 * Returns Tailwind classes for responsive spacing
 */
export function getResponsiveSpacing(
  type: 'margin' | 'padding',
  size: 'xs' | 'sm' | 'md' | 'lg' = 'md',
  axis: 'all' | 'x' | 'y' = 'all'
): string {
  const prefix = type === 'margin' ? 'm' : 'p';
  const spacings = {
    xs: 'xs:1 sm:2 md:3',
    sm: 'xs:2 sm:3 md:4',
    md: 'xs:3 sm:4 md:6',
    lg: 'xs:4 sm:6 md:8',
  };

  if (axis === 'x') {
    return `${prefix}x-2 sm:${prefix}x-3 md:${prefix}x-4`;
  } else if (axis === 'y') {
    return `${prefix}y-2 sm:${prefix}y-3 md:${prefix}y-4`;
  }

  return `${prefix}-2 sm:${prefix}-3 md:${prefix}-4`;
}
