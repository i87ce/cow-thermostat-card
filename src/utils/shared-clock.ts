/** Shared 30 s wall-clock tick — one interval for all small panels. */

type Listener = () => void;

const listeners = new Set<Listener>();
let timer: number | undefined;
let refCount = 0;

function tick(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to the shared clock; returns unsubscribe. */
export function subscribeSharedClock(fn: Listener): () => void {
  listeners.add(fn);
  refCount++;
  if (refCount === 1) {
    timer = window.setInterval(tick, 30_000);
  }
  return () => {
    listeners.delete(fn);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && timer != null) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}
