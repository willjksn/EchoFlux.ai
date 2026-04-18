/**
 * Build a cohesive light storefront palette from a single primary hex so creators
 * on "Custom" don't have to tune five colors from scratch.
 */

function normalizeHex(input: string): string | null {
  let h = input.trim();
  if (!h.startsWith("#")) h = `#${h}`;
  if (/^#[0-9a-f]{3}$/i.test(h)) {
    const [, r, g, b] = h;
    h = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (!/^#[0-9a-f]{6}$/i.test(h)) return null;
  return h.toLowerCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
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
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360;
  s /= 100;
  l /= 100;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const x = (n: number) => n.toString(16).padStart(2, "0");
  return `#${x(r)}${x(g)}${x(b)}`;
}

export type DerivedFanHubThemeFields = {
  accentHover: string;
  background: string;
  text: string;
  textMuted: string;
  border: string;
};

/**
 * Returns companion colors for a storefront theme from one brand color (light UI).
 */
export function deriveFanHubThemeFromPrimary(primaryHex: string): DerivedFanHubThemeFields | null {
  const rgb = hexToRgb(primaryHex);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const sat = Math.min(Math.max(s, 0), 100);

  const hexFromHsl = (hh: number, ss: number, ll: number) => {
    const { r, g, b } = hslToRgb(hh, ss, ll);
    return rgbToHex(r, g, b);
  };

  if (sat < 8) {
    return {
      accentHover: hexFromHsl(h, 0, Math.max(l - 14, 12)),
      background: hexFromHsl(h, 0, 98),
      text: hexFromHsl(h, 0, 16),
      textMuted: hexFromHsl(h, 0, 46),
      border: hexFromHsl(h, 0, 88),
    };
  }

  const accentHover = hexFromHsl(h, Math.min(sat + 6, 100), Math.max(l - 11, 10));
  const background = hexFromHsl(h, Math.min(sat * 0.32 + 6, 38), 97.2);
  const text = hexFromHsl(h, Math.min(sat * 0.55 + 10, 52), Math.min(Math.max(l - 38, 14), 22));
  const textMuted = hexFromHsl(h, Math.min(sat * 0.42, 36), 44);
  const border = hexFromHsl(h, Math.min(sat * 0.22, 28), 90);

  return { accentHover, background, text, textMuted, border };
}
