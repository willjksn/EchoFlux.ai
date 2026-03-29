/**
 * Deep-convert values so Express/Vercel res.json() does not throw (Firestore Timestamp,
 * DocumentReference-like objects, BigInt). Uses an ancestry stack only for true cycles —
 * shared object references (same sub-object in two fields) remain valid.
 */
export function jsonSafeForApiResponse(input: unknown, depth = 0, pathStack: object[] = []): unknown {
  if (depth > 48) return null;
  if (input === null || input === undefined) return input;
  const t = typeof input;
  if (t === "string" || t === "number" || t === "boolean") return input;
  if (t === "bigint") return (input as bigint).toString();
  if (input instanceof Date) return input.toISOString();

  if (t !== "object") return String(input);

  if (Array.isArray(input)) {
    const arr = input as unknown[];
    if (pathStack.includes(arr)) return null;
    pathStack.push(arr);
    try {
      return arr.map((x) => jsonSafeForApiResponse(x, depth + 1, pathStack));
    } finally {
      pathStack.pop();
    }
  }

  const o = input as Record<string, unknown>;
  if (pathStack.includes(o)) return null;

  // Firestore Timestamp (plain object with toDate)
  if (typeof o.toDate === "function") {
    try {
      const d = (o as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    } catch {
      return null;
    }
  }

  // GeoPoint-like
  if (
    typeof o.latitude === "number" &&
    typeof o.longitude === "number" &&
    Object.keys(o).length <= 4
  ) {
    return { latitude: o.latitude, longitude: o.longitude };
  }

  // DocumentReference / CollectionReference-like
  if (typeof o.path === "string" && typeof o.id === "string") {
    return { _refPath: o.path };
  }

  pathStack.push(o);
  try {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || typeof v === "function" || typeof v === "symbol") continue;
      try {
        out[k] = jsonSafeForApiResponse(v, depth + 1, pathStack);
      } catch {
        out[k] = null;
      }
    }
    return out;
  } finally {
    pathStack.pop();
  }
}
