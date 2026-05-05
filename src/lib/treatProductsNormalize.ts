import type { TreatProduct } from "../../types";

function toOptionalNonNegativeInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return undefined;
}

/**
 * Dedupe by Firestore doc id (first wins) and normalize quantity fields.
 * Use for `/api/products` JSON and any merged client lists to avoid duplicate rows.
 */
export function normalizeTreatProductsFromApi(raw: unknown): TreatProduct[] {
  if (!Array.isArray(raw)) return [];
  const out: TreatProduct[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<TreatProduct> & { id?: unknown };
    const sid =
      typeof p.id === "string"
        ? p.id.trim()
        : p.id != null && String(p.id).trim() !== ""
          ? String(p.id).trim()
          : "";
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    const quantityLimit = toOptionalNonNegativeInt((p as { quantityLimit?: unknown }).quantityLimit);
    const soldCount = toOptionalNonNegativeInt((p as { soldCount?: unknown }).soldCount);
    out.push({
      ...(p as TreatProduct),
      id: sid,
      quantityLimit,
      soldCount,
    });
  }
  return out;
}
