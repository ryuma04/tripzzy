// ═══════════════════════════════════════════
// TRIPZYY — Demo mode
// ═══════════════════════════════════════════

/**
 * Whether to substitute bundled sample content when the API returns nothing.
 *
 * Off by default. Several pages used to fall back to `DEMO_TRIPS` whenever a
 * request failed *or* came back empty, which meant a broken backend still
 * rendered a full, convincing app -- so integration bugs stayed invisible and
 * a genuinely empty account looked identical to a seeded one.
 *
 * With the flag off, a failed request shows an error and an empty account
 * shows an empty state. Turn it on (`NEXT_PUBLIC_DEMO_MODE=true`) only to
 * present the UI without a backend; never in an environment where you need to
 * trust what you are seeing.
 *
 * Inlined by Next at build time, so it must be referenced as the full
 * `process.env.NEXT_PUBLIC_DEMO_MODE` expression rather than destructured.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/**
 * Logs, loudly, that sample content stood in for real data. Call this at
 * every fallback site so the reason something looks populated is visible in
 * the console rather than guessed at.
 */
export function noteDemoFallback(what: string, cause?: unknown): void {
  if (cause !== undefined) {
    console.warn(`[Tripzyy] demo fallback: ${what}`, cause);
  } else {
    console.warn(`[Tripzyy] demo fallback: ${what}`);
  }
}
