// L1 · Fysik-baserad rörelse för Design mode (v2.3). Ren, deterministisk matte för
// pan-inertia (exponentiell deceleration), snap-magnetism + mikro-studs och mjuk
// zoom-interpolation. Ingen DOM, ingen React → enhetstestad i motion.test.ts.
//
// ⚠️ STYRANDE PRINCIP "ALLTID SNABBT" (Andreas): rörelse får kännas men får ALDRIG
// fördröja nästa handling. Därför:
//   • allt är KORT (glid ≤ GLIDE_MAX_MS, studs ≤ BOUNCE_MS, zoom ≤ ZOOM_LERP_MS),
//   • allt är AVBRYTBART (kurvorna är rena funktioner av tid → den som styr loopen
//     kan sluta räkna när som helst; greppar man mitt i en glidning stannar den),
//   • prefers-reduced-motion → duration 0 = hård stopp/snap (ingen glidning/studs).
// App-agnostiskt: bara tal (px/ms, px, tid) – inga sid-selektorer eller DOM.

// ── Pan-inertia (exponentiell decay) ────────────────────────────────────────
// Hastighet v0 i px/ms (dokument-px). Position: x(t) = v0·τ·(1 − e^(−t/τ));
// hastighet: v(t) = v0·e^(−t/τ). Litet τ → snärtig, kort utglidning som stannar.

/** Tidskonstant (ms). Litet → kort, snärtig glidning (aldrig något att vänta på). */
export const GLIDE_TAU = 55
/** Under denna |hastighet| (px/ms) är en fling inte värd en glidning → hård stopp. */
export const GLIDE_MIN_V = 0.05
/** Hårt tak (ms): en inertia-glidning får ALDRIG kännas som väntan. */
export const GLIDE_MAX_MS = 200

/** Momentan glid-hastighet (px/ms) vid tid t (ms) efter släpp. */
export function glideVelocity(v0: number, t: number, tau = GLIDE_TAU): number {
  return v0 * Math.exp(-t / tau)
}

/** Förflyttning (px) från släpp (t=0) till tid t (ms). Monotont → asymptot glideTotal. */
export function glideDisplacement(v0: number, t: number, tau = GLIDE_TAU): number {
  return v0 * tau * (1 - Math.exp(-t / tau))
}

/** Total glid-längd (px) när t→∞ (v0·τ). Praktiskt taket nås runt glideDuration. */
export function glideTotal(v0: number, tau = GLIDE_TAU): number {
  return v0 * tau
}

/**
 * Glidningens längd i ms tills |v| < vMin – HÅRT klampad till maxMs så inget känns
 * som väntan. reduced-motion (eller för låg starthastighet) → 0 = ingen inertia.
 */
export function glideDuration(
  v0: number,
  opts: { reduced?: boolean; vMin?: number; tau?: number; maxMs?: number } = {},
): number {
  const { reduced = false, vMin = GLIDE_MIN_V, tau = GLIDE_TAU, maxMs = GLIDE_MAX_MS } = opts
  if (reduced) return 0
  const a = Math.abs(v0)
  if (a <= vMin) return 0
  return Math.min(maxMs, tau * Math.log(a / vMin))
}

/**
 * EMA-utjämning av pekhastighet (px/ms): dämpar sample-brus så en glidning inte
 * skjuter iväg på en enda ryckig sample. Senaste mätningen väger `alpha`.
 */
export function blendVelocity(prev: number, sample: number, alpha = 0.35): number {
  return prev * (1 - alpha) + sample * alpha
}

/** Är fling-hastigheten (2D) värd en glidning alls? Annars: stanna direkt vid släpp. */
export function shouldGlide(vx: number, vy: number, vMin = GLIDE_MIN_V): boolean {
  return Math.hypot(vx, vy) > vMin
}

// ── Magnetisk snap + mikro-studs ─────────────────────────────────────────────

/**
 * Snap-MÅLET: närmaste kandidatkant inom `tol` av `value`, annars null. Rör bara
 * den rörliga kanten (grannen står still) → samma snap-mål FW3 redan använder,
 * bara med mjukare bekräftelse via microBounce. Determinstiskt: närmast vinner.
 */
export function snapMagnet(value: number, edges: readonly number[], tol: number): number | null {
  let best: number | null = null
  let bestD = tol
  for (const e of edges) {
    const d = Math.abs(value - e)
    // Strikt < → deterministiskt "första vinner" vid exakt lika avstånd.
    if (best === null ? d <= bestD : d < bestD) { bestD = d; best = e }
  }
  return best
}

/** Studsens längd (ms) – kort bekräftelse, aldrig något att vänta på. */
export const BOUNCE_MS = 140
/** Studsens amplitud (px) – en liten, precis knuff. */
export const BOUNCE_AMP = 3

/**
 * Mikro-studs (px) vid tid t (ms) efter att en snap engagerat: dämpad enkel-
 * överslags-kurva – 0 vid t=0 och t≥dur, en liten positiv topp däremellan. Ren
 * bekräftelse, inte en gate. dur ≤ 0 (t.ex. reduced-motion) → alltid 0 (ingen studs).
 */
export function microBounce(t: number, dur = BOUNCE_MS, amp = BOUNCE_AMP): number {
  if (dur <= 0 || t <= 0 || t >= dur) return 0
  const p = t / dur
  return Math.sin(p * Math.PI) * (1 - p) * amp
}

// ── Mjuk zoom-interpolation ──────────────────────────────────────────────────
// För knapp/tangent-STEG (±) – en kort ease-out så zoomen mjuknar utan att kännas
// trög. (Ctrl+scroll zoomas snärtigt per-tick, ingen interpolation – varje tick är
// litet och tätt → interpolation där skulle bara ligga efter fingret.)

/** Zoom-interpolationens längd (ms) – kort så det känns snärtigt, aldrig trögt. */
export const ZOOM_LERP_MS = 120

/**
 * Ease-out-interpolerat zoom-värde z0→z1 vid tid t (ms). reduced-motion eller
 * dur ≤ 0 → z1 direkt (hård zoom). Cubic ease-out (snabb start, mjuk landning).
 */
export function zoomLerp(z0: number, z1: number, t: number, dur = ZOOM_LERP_MS, reduced = false): number {
  if (reduced || dur <= 0 || t >= dur) return z1
  if (t <= 0) return z0
  const p = t / dur
  const eased = 1 - Math.pow(1 - p, 3)
  return z0 + (z1 - z0) * eased
}
