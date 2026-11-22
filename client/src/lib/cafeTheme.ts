import type { CSSProperties } from 'react';

export const cafeThemes = {
  e3: { label: 'E3 · Espresso & gold', primary: '28 82% 31%', background: '40 30% 96%', foreground: '24 25% 13%', card: '40 40% 99%' },
  forest: { label: 'Forest · Green & cream', primary: '155 45% 26%', background: '100 20% 96%', foreground: '150 25% 13%', card: '100 30% 99%' },
  terracotta: { label: 'Terracotta · Warm & earthy', primary: '16 58% 40%', background: '28 40% 96%', foreground: '15 30% 16%', card: '28 40% 99%' },
  ocean: { label: 'Ocean · Blue & white', primary: '205 70% 35%', background: '205 40% 97%', foreground: '210 35% 14%', card: '205 40% 99%' },
  plum: { label: 'Plum · Mulberry & blush', primary: '335 42% 34%', background: '340 25% 97%', foreground: '335 25% 15%', card: '340 25% 99%' },
};

export function hexToHslTriplet(hex?: string | null): string | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function cafeThemeStyle(theme = 'e3', brandAccentHex?: string | null): CSSProperties {
  const t = cafeThemes[theme as keyof typeof cafeThemes] || cafeThemes.e3;
  const primary = hexToHslTriplet(brandAccentHex) || t.primary;
  return {
    '--primary': primary,
    '--ring': primary,
    '--background': t.background,
    '--foreground': t.foreground,
    '--card': t.card,
    '--card-foreground': t.foreground,
    '--primary-foreground': '0 0% 100%',
    '--sidebar-primary': primary,
    '--sidebar-background': t.background,
  } as CSSProperties;
}

export function cafeDate(timezone = 'Asia/Qatar') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
