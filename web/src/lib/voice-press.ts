// One button, two gestures: what a press on the voice bar means (components/voice-bar.tsx).
//
//   • HOLD: press, talk, let go. The press starts the clip and the release sends it.
//   • TAP: a quick press starts the clip and the clip keeps running; the NEXT press sends it.
//
// The two are told apart only on release, by how long the press that STARTED the clip lasted. That
// is why no setting chooses between them: a press shorter than HOLD_MS cannot be a deliberate hold,
// and a press that long is never a tap, so both work on the same button at once.
//
// Pure: the bar feeds it pointer edges and the recorder's phase, and acts on what comes back.

import type { SttPhase } from "@/hooks/use-stt-recorder";

/** A press that started the clip and lasted at least this long is a hold, and its release sends. */
export const HOLD_MS = 350;

/** What one press is doing, from its down edge to its up edge. */
export interface Press {
  /** When the finger went down. */
  at: number;
  /** Whether this press is the one that started the clip. A press on a clip already running is
   *  the tap that ends it, whatever its length. */
  started: boolean;
}

export type PressAction = "start" | "send" | "none";

/** A down edge's answer: the press to hand back on release, and what to do now. */
export interface PressStart {
  press: Press;
  action: PressAction;
}

/** The down edge: start a clip from idle, or end a running one. */
export function pressDown(phase: SttPhase, now: number): PressStart {
  if (phase === "idle") return { press: { at: now, started: true }, action: "start" };
  // Recording already: this press ends it. While asking for the microphone or transcribing, a
  // press does nothing, and its release must not send either.
  return { press: { at: now, started: false }, action: "none" };
}

/** The up edge, for the press `pressDown` returned. */
export function pressUp(press: Press | null, phase: SttPhase, now: number): PressAction {
  if (press === null || phase !== "recording") return "none";
  if (!press.started) return "send";
  return now - press.at >= HOLD_MS ? "send" : "none";
}
