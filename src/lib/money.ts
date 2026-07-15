// ── Money helpers ─────────────────────────────────────────────────────────────
//
// All prices are stored as INTEGER PENCE (minor-currency units).
// These helpers are the ONLY place pence↔pounds conversion should happen.
// NULL means "no price" — not the same as 0 ("free").

/** Pence → whole-pounds display string.  NULL → "—". */
export function formatPence(pence: number | null): string {
  if (pence == null) return '—'
  return `£${(pence / 100).toFixed(0)}`
}

/** Pence → exact-pounds display string.  NULL → "—". */
export function formatPenceExact(pence: number | null): string {
  if (pence == null) return '—'
  return `£${(pence / 100).toFixed(2)}`
}

/** Pence → raw pounds number: `3600 → 36`. */
export function penceToPounds(pence: number): number {
  return pence / 100
}

/** Pounds (string or number) → pence integer.  Unparseable → null. */
export function poundsToPence(pounds: string | number): number | null {
  const n = typeof pounds === 'number' ? pounds : parseFloat(pounds)
  if (isNaN(n)) return null
  return Math.round(n * 100)
}
