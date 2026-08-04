/**
 * Small helpers for optimistic UI state that reconciles when HA echoes.
 */

/** Merge pending optimistic values; drop keys confirmed by HA. */
export function reconcilePending<T extends string>(
  pending: Record<string, T>,
  confirmed: Record<string, T>,
): Record<string, T> {
  let changed = false;
  const next = { ...pending };
  for (const [k, v] of Object.entries(pending)) {
    if (confirmed[k] === v) {
      delete next[k];
      changed = true;
    }
  }
  return changed ? next : pending;
}

/** Pick optimistic override or fall back to HA-derived value. */
export function pickOptimistic<T>(
  id: string,
  pending: Record<string, T> | undefined,
  actual: T,
): T {
  if (pending && pending[id] != null) return pending[id];
  return actual;
}
