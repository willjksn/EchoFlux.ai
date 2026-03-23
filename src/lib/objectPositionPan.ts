/** Shared helpers for drag-to-pan CSS object-position (% %). */

export function clampPan(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function parseObjectPositionPercentPair(s: string | undefined): [number, number] {
  if (!s || s === "center") return [50, 50];
  const t = String(s).trim();
  const m = t.match(/^([\d.]+)%\s+([\d.]+)%$/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  if (t === "top") return [50, 0];
  if (t === "bottom") return [50, 100];
  if (t === "left") return [0, 50];
  if (t === "right") return [100, 50];
  return [50, 50];
}

export function formatObjectPositionPercentPair(x: number, y: number) {
  return `${clampPan(Math.round(x * 10) / 10, 0, 100)}% ${clampPan(Math.round(y * 10) / 10, 0, 100)}%`;
}
