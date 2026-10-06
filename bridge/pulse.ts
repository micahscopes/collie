// THE PULSE: a server-sent nudge that tells an open phone "look now", so a change reaches it in a
// fraction of a second instead of at its next poll.
//
// The phone polls on its own clock (web/src/hooks/use-polling.ts): 1.5 s on a pane whose agent is
// working, 6 s on one that looks idle. Measured on a live bridge, every read the poll makes answers
// in 2 to 20 ms, so nearly all of the wait between "Claude finished" and "the phone shows it" is the
// phone not having asked yet. The bridge sits next to the multiplexer, where a read is cheap, so it
// watches instead and says when to ask.
//
// It carries NO content, only the name of what moved (`snapshot` or `pane`). The phone answers a
// nudge with the same loader read it would have made on its next poll, so every guard, ETag, seen
// mark and parse stays where it is, and the poll stays the source of truth: a nudge lost on a flaky
// link costs one interval, never correctness. It is the same posture the bridge already takes with
// the multiplexer's own event stream (event-poker.ts): events accelerate, the snapshot decides.
//
// It never marks a pane seen. Only the loader's real read does (.adr/0003), and this module reads
// through the multiplexer port, below the route that stamps it.

/** What one pulse watches. Both keys are fingerprints: equal means "nothing to tell the phone". */
export interface PulseSource {
  /** The bridge's herd view (statuses, panes, tabs). In-memory, so it may be asked every tick. */
  snapshotKey(): string;
  /** The open pane's screen, or null when no pane is watched or the read failed. */
  paneKey(): Promise<string | null>;
}

export interface PulseOptions {
  /** How often the sources are looked at. */
  intervalMs: number;
  /** How often a comment line keeps the connection open through idle timeouts and proxies. Must be
   *  under Bun.serve's idle timeout (10 s by default), or the server closes a quiet stream. */
  keepaliveMs?: number;
  /** How long one stream lives before the server ends it and the phone reconnects. A bound, so a
   *  phone that vanished without closing its socket cannot hold a watcher forever. */
  maxLifetimeMs?: number;
  /** How many streams may run at once. Opening one more ends the OLDEST, which is the likeliest to
   *  belong to a phone that dropped off the network without closing (its socket can look open for
   *  minutes); a phone that is still there just reconnects after `retry`. Every visible tab on a
   *  local pane holds one, so with more than this many open they take turns: about one reconnect a
   *  second, harmless because the poll stays the source of truth. */
  maxStreams?: number;
  signal?: AbortSignal;
}

/** The running streams' `end`s, oldest first (a Set keeps insertion order). */
const running = new Set<() => void>();

const encoder = new TextEncoder();

/** An SSE frame naming what changed. The `data` line is required for the browser to dispatch it. */
function frame(event: string): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${Date.now()}\n\n`);
}

/**
 * The stream itself. The first look only records the fingerprints, so connecting never nudges; after
 * that, each change sends one event. A pane read still in flight when the next tick comes is not
 * doubled up: that tick skips the pane and looks at the snapshot only.
 */
export function pulseStream(source: PulseSource, opts: PulseOptions): ReadableStream<Uint8Array> {
  const keepaliveMs = opts.keepaliveMs ?? 5000;
  const maxLifetimeMs = opts.maxLifetimeMs ?? 10 * 60_000;
  let tick: ReturnType<typeof setInterval> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let endSelf: (() => void) | undefined;

  const stop = () => {
    closed = true;
    if (endSelf) running.delete(endSelf);
    clearInterval(tick);
    clearInterval(keepalive);
    clearTimeout(lifetime);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (bytes: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(bytes);
        } catch {
          stop();
        }
      };
      const end = () => {
        if (closed) return;
        stop();
        try {
          controller.close();
        } catch {
          // Already closed by the reader going away.
        }
      };
      if (opts.signal?.aborted) {
        end();
        return;
      }
      opts.signal?.addEventListener("abort", end, { once: true });
      endSelf = end;
      running.add(end);
      const maxStreams = opts.maxStreams ?? 8;
      for (const oldest of running) {
        if (running.size <= maxStreams) break;
        oldest();
      }

      let lastSnapshot = source.snapshotKey();
      let lastPane = await source.paneKey();
      // Ended (evicted, aborted, cancelled) while that first read was out: `stop` has already run,
      // so timers made now would outlive the stream.
      if (closed) return;
      let reading = false;
      // `retry` tells the browser how soon to reconnect after the stream ends; the comment opens the
      // body at once, so a proxy that waits for the first bytes passes the stream on.
      send(encoder.encode(`retry: 1000\n: pulse\n\n`));

      tick = setInterval(() => {
        if (closed) return;
        const snapshot = source.snapshotKey();
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          send(frame("snapshot"));
        }
        if (reading) return;
        reading = true;
        const look = async () => {
          try {
            const pane = await source.paneKey();
            // A failed read says nothing about the screen, so it neither nudges nor resets the key.
            if (pane !== null && pane !== lastPane) {
              lastPane = pane;
              send(frame("pane"));
            }
          } catch {
            // Same as a failed read: nothing to say.
          } finally {
            reading = false;
          }
        };
        void look();
      }, opts.intervalMs);
      keepalive = setInterval(() => send(encoder.encode(": ka\n\n")), keepaliveMs);
      lifetime = setTimeout(end, maxLifetimeMs);
    },
    cancel() {
      stop();
    },
  });
}

/** A short, stable fingerprint of a string. */
export function fingerprint(text: string): string {
  return Bun.hash(text).toString(36);
}
