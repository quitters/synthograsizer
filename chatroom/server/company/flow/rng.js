/**
 * A seeded random source, so a draw can be repeated and a casting can be argued about.
 * ───────────────────────────────────────────────────────────────────────────────────────
 * Casting a company is sampling: which countries, which ages, which temperaments. Sampling with Math.random cannot be reproduced, tested or
 * explained; the same seed gives the same people. mulberry32, seeded from a hash of any string (the quiz uses the same, to shuffle its questions).
 */
import crypto from 'node:crypto';

/** @param {string|number} seed @returns {() => number} numbers in [0, 1) */
export function rng(seed) {
  let a = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (r, list) => list[Math.floor(r() * list.length)];

export function shuffle(r, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** An integer in [lo, hi]. */
export const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

/** Draw by weight: items are [value, weight]. */
export function weighted(r, items) {
  const total = items.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  for (const [value, w] of items) { x -= w; if (x <= 0) return value; }
  return items[items.length - 1][0];
}

/**
 * Cycle through a shuffled copy of `list` so that the first n draws are all different when n <= list.length (and each value is used about equally
 * after that). This is what makes a small team's attributes spread without a retry loop.
 */
export function cycler(r, list) {
  let bag = [];
  return () => {
    if (!bag.length) bag = shuffle(r, list);
    return bag.pop();
  };
}
