import type { TreatProduct, TreatProductType } from "../../types";

/** Humanized internal product `type` for placeholders (underscores → spaces). Not shown on cards unless saved as `typeDisplayLabel`. */
export function defaultTreatProductTypeLabel(type: TreatProductType | string | undefined): string {
  const t = typeof type === "string" && type.trim() ? type : "custom";
  return String(t).replace(/_/g, " ");
}

/**
 * Fan-facing category line above the treat title. Only shown when the creator set `typeDisplayLabel`.
 */
export function getTreatProductTypeDisplayLabel(
  product: Pick<TreatProduct, "type" | "typeDisplayLabel">
): string | null {
  const custom =
    typeof product.typeDisplayLabel === "string" ? product.typeDisplayLabel.trim() : "";
  return custom || null;
}

export const TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN = 48;
