export type RGB = { r: number; g: number; b: number };
/** h is 0 to 360, s and v are 0 to 1 */
export type HSV = { h: number; s: number; v: number };

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
}

function hueOf(r: number, g: number, b: number, max: number, d: number) {
  if (!d) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  return { h: hueOf(R, G, B, max, d), s: max ? d / max : 0, v: max };
}

export function rgbToHsl({ r, g, b }: RGB) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: Math.round(hueOf(R, G, B, max, d)), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return { r: f(0), g: f(8), b: f(4) };
}

export const rgbToHex = ({ r, g, b }: RGB) =>
  "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");

export function hexToRgb(hex: string): RGB | null {
  let m = hex.trim().replace(/^#/, "");
  if (m.length === 3)
    m = m
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-f]{6}$/i.test(m)) return null;
  const n = parseInt(m, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
