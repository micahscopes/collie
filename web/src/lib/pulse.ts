// The phone's end of the pulse (bridge/pulse.ts): a server-sent stream that says "something moved,
// look now". A nudge carries nothing. It only asks for the same revalidation the poll would have
// run on its next beat (hooks/use-polling.ts), so the poll stays the source of truth and a lost
// nudge costs one interval.
//
// A WORKING PANE NUDGES CONSTANTLY. A spinner or an elapsed-time counter repaints the screen several
// times a second, and the bridge reports each repaint. Answering every one would read the pane three
// times a second over a phone link, so nudges are spaced: one that comes after a quiet spell fires
// at once (the idle pane that suddenly moves, which is the delay this exists to remove), and one that
// comes inside the gap waits for its end, with every nudge in between folded into it.

/** The shortest time between two nudge-driven looks. Under the poll's HOT_MS (1500), so a working
 *  pane is still read faster than before, and far above the bridge's own 300 ms watch. */
export const PULSE_MIN_GAP_MS = 600;

export interface Nudger {
  nudge(): void;
  dispose(): void;
}

/** Spaces `fire` calls at least `minGapMs` apart, folding every nudge in a gap into one call at its
 *  end. Clock and timer are injectable for tests. */
export function createNudger(
  fire: () => void,
  minGapMs: number,
  clock: { now: () => number; set: (f: () => void, ms: number) => number; clear: (id: number) => void } = {
    now: () => Date.now(),
    set: (f, ms) => window.setTimeout(f, ms),
    clear: (id) => window.clearTimeout(id),
  },
): Nudger {
  let last = Number.NEGATIVE_INFINITY;
  let timer: number | null = null;
  const run = () => {
    timer = null;
    last = clock.now();
    fire();
  };
  return {
    nudge() {
      if (timer !== null) return;
      const wait = last + minGapMs - clock.now();
      if (wait <= 0) run();
      else timer = clock.set(run, wait);
    },
    dispose() {
      if (timer !== null) clock.clear(timer);
      timer = null;
    },
  };
}

/**
 * Opens the stream at `url` and calls `onNudge` for each event it names. Returns the close.
 *
 * The browser's EventSource reconnects on its own after a dropped connection (the bridge asks for one
 * second), and gives up for good on a non-200 answer: a crew peer's pane, or a bridge too old to have
 * the route, answers 404 and the phone simply goes on polling. No EventSource at all (an old browser,
 * the test DOM) is the same answer: nothing opens.
 */
export function openPulse(url: string, onNudge: () => void): () => void {
  if (!("EventSource" in globalThis)) return () => {};
  const source = new EventSource(url);
  const handler = () => onNudge();
  source.addEventListener("pane", handler);
  source.addEventListener("snapshot", handler);
  return () => source.close();
}
