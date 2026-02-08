import { readable } from 'svelte/store';

/**
 * A single shared 1-second heartbeat for all activity timers.
 * Automatically starts when the first TaskCard subscribes and
 * stops when the last one unsubscribes (Svelte readable contract).
 *
 * Replaces per-card setInterval calls with one board-level timer.
 */
export const activityTick = readable(0, (set) => {
  let count = 0;
  const interval = setInterval(() => set(++count), 1000);
  return () => clearInterval(interval);
});
