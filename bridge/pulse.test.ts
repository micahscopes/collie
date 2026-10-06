import { describe, expect, test } from "bun:test";
import { pulseStream, type PulseSource } from "./pulse.ts";

/** Reads the stream for `ms`, then aborts it, and returns the event names in order. */
async function eventsFor(source: PulseSource, ms: number, intervalMs = 10): Promise<string[]> {
  const abort = new AbortController();
  const stream = pulseStream(source, { intervalMs, signal: abort.signal, keepaliveMs: 1000 });
  setTimeout(() => abort.abort(), ms);
  let text = "";
  const decoder = new TextDecoder();
  for await (const chunk of stream) text += decoder.decode(chunk);
  return [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]!);
}

describe("pulseStream", () => {
  test("a still screen and a still herd send nothing", async () => {
    expect(await eventsFor({ snapshotKey: () => "a", paneKey: async () => "p" }, 80)).toEqual([]);
  });

  test("a pane that moves sends one event per change", async () => {
    let screen = 0;
    const source: PulseSource = { snapshotKey: () => "a", paneKey: async () => `p${screen}` };
    setTimeout(() => (screen = 1), 25);
    setTimeout(() => (screen = 2), 55);
    expect(await eventsFor(source, 90)).toEqual(["pane", "pane"]);
  });

  test("a herd that moves sends a snapshot event", async () => {
    let herd = "a";
    setTimeout(() => (herd = "b"), 25);
    expect(await eventsFor({ snapshotKey: () => herd, paneKey: async () => null }, 70)).toEqual(["snapshot"]);
  });

  test("a failed read neither nudges nor forgets the screen it last saw", async () => {
    const reads = ["p", null, "p", null, "p"];
    let i = 0;
    const source: PulseSource = { snapshotKey: () => "a", paneKey: async () => reads[Math.min(i++, reads.length - 1)] ?? null };
    expect(await eventsFor(source, 80)).toEqual([]);
  });

  test("one stream too many ends the oldest", async () => {
    const source: PulseSource = { snapshotKey: () => "a", paneKey: async () => "p" };
    const aborts = [new AbortController(), new AbortController(), new AbortController()];
    const streams = aborts.map((abort) => pulseStream(source, { intervalMs: 10, keepaliveMs: 1000, maxStreams: 2, signal: abort.signal }));
    const drained = streams.map(async (stream) => {
      for await (const _ of stream) {
        // Only the ending matters.
      }
      return true;
    });
    // The first stream ends by itself once the third starts; the other two run until aborted.
    expect(await Promise.race([drained[0], Bun.sleep(200).then(() => false)])).toBe(true);
    aborts[1]!.abort();
    aborts[2]!.abort();
    expect(await Promise.all(drained.slice(1))).toEqual([true, true]);
  });

  test("an already-aborted request ends the stream at once", async () => {
    const abort = new AbortController();
    abort.abort();
    const stream = pulseStream({ snapshotKey: () => "a", paneKey: async () => "p" }, { intervalMs: 10, signal: abort.signal });
    const chunks: Uint8Array[] = [];
    for await (const c of stream) chunks.push(c);
    expect(chunks).toEqual([]);
  });
});
