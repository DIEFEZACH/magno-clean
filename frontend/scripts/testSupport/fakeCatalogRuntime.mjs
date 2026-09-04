// Deterministic clock: no network and no real sleep in availability tests.
export function fakeCatalogRuntime() {
  let elapsed = 0;
  let nextId = 0;
  const timers = new Map();
  const sleeps = [];
  const timeouts = [];
  const runtime = {
    now: () => elapsed,
    wallNow: () => Date.UTC(2026, 0, 1) + elapsed,
    setTimeout: (callback, delay) => {
      nextId += 1;
      timers.set(nextId, { callback, at: elapsed + delay });
      timeouts.push(delay);
      return nextId;
    },
    clearTimeout: (timer) => timers.delete(timer),
    sleep: async (delay) => { sleeps.push(delay); advanceBy(delay); },
  };
  function advanceBy(delay) {
    const target = elapsed + delay;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      elapsed = next[1].at;
      next[1].callback();
    }
    elapsed = target;
  }
  return { runtime, advanceBy, sleeps, timeouts, timers };
}
