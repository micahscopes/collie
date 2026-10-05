import { describe, expect, it } from "vitest";
import { createNudger, openPulse } from "./pulse";

// A clock whose timers run only when the test advances it.
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; f: () => void }>();
  return {
    now: () => now,
    set: (f: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { at: now + ms, f });
      return id;
    },
    clear: (id: number) => void timers.delete(id),
    advance(ms: number) {
      now += ms;
      for (const [id, t] of timers) {
        if (t.at <= now) {
          timers.delete(id);
          t.f();
        }
      }
    },
  };
}

describe("createNudger", () => {
  it("fires at once after a quiet spell", () => {
    const clock = fakeClock();
    let fired = 0;
    const n = createNudger(() => fired++, 600, clock);
    n.nudge();
    expect(fired).toBe(1);
    clock.advance(1000);
    n.nudge();
    expect(fired).toBe(2);
  });

  it("folds a burst inside the gap into one call at its end", () => {
    const clock = fakeClock();
    let fired = 0;
    const n = createNudger(() => fired++, 600, clock);
    n.nudge();
    clock.advance(100);
    n.nudge();
    n.nudge();
    clock.advance(200);
    n.nudge();
    expect(fired).toBe(1);
    clock.advance(300);
    expect(fired).toBe(2);
    clock.advance(1000);
    expect(fired).toBe(2);
  });

  it("drops a pending call when disposed", () => {
    const clock = fakeClock();
    let fired = 0;
    const n = createNudger(() => fired++, 600, clock);
    n.nudge();
    n.nudge();
    n.dispose();
    clock.advance(1000);
    expect(fired).toBe(1);
  });
});

describe("openPulse", () => {
  it("opens nothing where there is no EventSource", () => {
    const original = globalThis.EventSource;
    // @ts-expect-error -- simulating a browser without the API
    delete globalThis.EventSource;
    try {
      expect(() => openPulse("/api/pulse", () => {})()).not.toThrow();
    } finally {
      if (original !== undefined) globalThis.EventSource = original;
    }
  });
});
