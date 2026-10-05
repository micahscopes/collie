import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SttPhase, SttRecorder } from "@/hooks/use-stt-recorder";
import { VoiceBar } from "./voice-bar";

function fakeRecorder(phase: SttPhase): SttRecorder {
  return {
    phase,
    elapsedLabel: "0:03",
    busy: phase !== "idle",
    start: vi.fn(),
    stopAndSend: vi.fn(),
    discard: vi.fn(),
  };
}

describe("VoiceBar", () => {
  it("starts a clip on the press", () => {
    const recorder = fakeRecorder("idle");
    render(<VoiceBar recorder={recorder} enabled onKeyboard={() => {}} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /hold to talk/i }), { button: 0 });
    expect(recorder.start).toHaveBeenCalledOnce();
  });

  it("sends a running clip on the next tap", () => {
    const recorder = fakeRecorder("recording");
    render(<VoiceBar recorder={recorder} enabled onKeyboard={() => {}} />);
    const big = screen.getByRole("button", { name: /0:03/ });
    fireEvent.pointerDown(big, { button: 0 });
    fireEvent.pointerUp(big, { button: 0 });
    expect(recorder.stopAndSend).toHaveBeenCalledOnce();
  });

  it("offers discard while recording and the keyboard while idle", () => {
    const live = fakeRecorder("recording");
    const { unmount } = render(<VoiceBar recorder={live} enabled onKeyboard={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(live.discard).toHaveBeenCalledOnce();
    unmount();
    const onKeyboard = vi.fn();
    render(<VoiceBar recorder={fakeRecorder("idle")} enabled onKeyboard={onKeyboard} />);
    fireEvent.click(screen.getByRole("button", { name: /type instead/i }));
    expect(onKeyboard).toHaveBeenCalledOnce();
  });

  it("does nothing when the composer may not write", () => {
    const recorder = fakeRecorder("idle");
    render(<VoiceBar recorder={recorder} enabled={false} onKeyboard={() => {}} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /hold to talk/i }), { button: 0 });
    expect(recorder.start).not.toHaveBeenCalled();
  });
});
