import { describe, expect, it } from "vitest";
import { HOLD_MS, pressDown, pressUp } from "./voice-press";

describe("voice press", () => {
  it("a hold starts on the press and sends on the release", () => {
    const down = pressDown("idle", 1000);
    expect(down.action).toBe("start");
    expect(pressUp(down.press, "recording", 1000 + HOLD_MS)).toBe("send");
  });

  it("a quick tap starts and keeps recording; the next press sends on its release", () => {
    const tap = pressDown("idle", 1000);
    expect(tap.action).toBe("start");
    expect(pressUp(tap.press, "recording", 1100)).toBe("none");
    const second = pressDown("recording", 5000);
    expect(second.action).toBe("none");
    expect(pressUp(second.press, "recording", 5050)).toBe("send");
  });

  it("a long second press still just sends", () => {
    const second = pressDown("recording", 5000);
    expect(pressUp(second.press, "recording", 9000)).toBe("send");
  });

  it("a release while the microphone is still being asked for sends nothing", () => {
    const down = pressDown("idle", 1000);
    expect(pressUp(down.press, "requesting", 3000)).toBe("none");
  });

  it("a press while transcribing does nothing on either edge", () => {
    const down = pressDown("transcribing", 1000);
    expect(down.action).toBe("none");
    expect(pressUp(down.press, "transcribing", 1100)).toBe("none");
  });

  it("a release with no press does nothing", () => {
    expect(pressUp(null, "recording", 1000)).toBe("none");
  });
});
