// ── Money ────────────────────────────────────────────────────────────────────
//
// Amounts are stored as INTEGER MINOR UNITS of the amount's own currency — pence
// for GBP, cents for EUR, paise for INR, and whole yen for JPY, whose minor unit
// IS the yen. So "divide by 100" is not a general rule, and neither is "£".
//
// This is the ONLY place minor→major conversion and currency formatting happen.
// Four separate implementations of this used to exist in the app; three of them
// hardcoded a pound sign and a /100, which is why an Italian player booking an
// Italian court saw a price in pounds.
//
// NULL means "no price" — not the same as 0, which means free.

/**
 * Format a minor-unit amount for display using the currency's real exponent.
 * formatMoney(500, 'GBP') → "£5.00"   formatMoney(500, 'JPY') → "¥500"
 *
 * Uses Intl.NumberFormat to derive both the symbol and the decimal exponent, so
 * it is correct for every currency without a lookup table to maintain.
 */
export function formatMoney(minorUnits: number, currency: string): string {
  const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency })
  const digits = fmt.resolvedOptions().minimumFractionDigits ?? 2
  const majorUnits = digits > 0 ? minorUnits / Math.pow(10, digits) : minorUnits
  return fmt.format(majorUnits)
}

/**
 * Display helper for values that may be absent. NULL amount → "—".
 * A missing CURRENCY also renders "—": showing an amount without knowing its
 * currency is how the original bug looked to a user, and a dash is honest.
 */
export function money(
  minorUnits: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (minorUnits == null) return '—'
  if (!currency) return '—'
  return formatMoney(minorUnits, currency)
}

/**
 * Just the currency's symbol, for the price-TIER indicator (£ / ££ / £££) where
 * there is no amount to format. Derived from the currency via Intl rather than a
 * country→symbol lookup table, which was previously maintained by hand in two
 * components and defaulted every unlisted country to a pound sign.
 */
export function currencySymbolFor(currency: string | null | undefined): string | null {
  if (!currency) return null
  const part = new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0).find((p) => p.type === 'currency')
  return part?.value ?? currency
}

/** Number of decimal digits in a currency's minor unit (GBP→2, JPY→0). */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency })
    .resolvedOptions().minimumFractionDigits ?? 2
}

/** Major units → minor units for the given currency. "24" + GBP → 2400. */
export function majorToMinor(major: string | number, currency: string): number | null {
  const n = typeof major === 'number' ? major : Number.parseFloat(major)
  if (!Number.isFinite(n)) return null
  return Math.round(n * Math.pow(10, currencyExponent(currency)))
}
