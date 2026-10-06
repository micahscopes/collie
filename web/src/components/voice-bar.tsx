import { Keyboard, Loader2, Mic, X } from "lucide-react";
import { useRef, type PointerEvent } from "react";

import { useLocale } from "@/hooks/use-locale";
import type { SttRecorder } from "@/hooks/use-stt-recorder";
import { buzz } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { pressDown, pressUp, type Press } from "@/lib/voice-press";

// VOICE MODE's composer row (lib/stt.ts § voice mode): one wide button that IS the microphone.
//
// Hold it to talk and let go to send, or tap it once to start and once more to send; the two are
// told apart by lib/voice-press.ts, so neither needs a setting. What a finished clip does is the
// composer's business (`acceptTranscript`): with hands-free on it goes out through the guarded
// send; otherwise it lands in the draft and the field returns for review.
//
// The slot at the left is the way back to typing while idle and the discard while a clip is live.
// It sits where the field's left edge was, so the big button keeps the thumb's side of the row.
//
// A long press on a phone is also the browser's text-selection and callout gesture. `select-none`,
// `touch-none` and the callout style keep the hold ours, and the context menu is refused on the
// button so a hold on Android does not open it.

interface VoiceBarProps {
  recorder: SttRecorder;
  /** False while the composer may not write at all (locked, read-only, gone pane). */
  enabled: boolean;
  /** Back to the text composer. */
  onKeyboard: () => void;
}

export function VoiceBar({ recorder, enabled, onKeyboard }: VoiceBarProps) {
  useLocale();
  const press = useRef<Press | null>(null);
  const { phase } = recorder;
  const live = phase === "recording";
  const busy = phase === "requesting" || phase === "transcribing";

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!enabled || e.button !== 0) return;
    // Keep the pointer even when the finger drifts off the button mid-hold, so the release still
    // lands here and sends.
    // Guarded: not every engine has it (jsdom, older WebViews), and the hold works without it.
    if ("setPointerCapture" in e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);
    const next = pressDown(phase, Date.now());
    press.current = next.press;
    if (next.action === "start") {
      buzz();
      recorder.start();
    }
  };

  const onUp = () => {
    const action = pressUp(press.current, phase, Date.now());
    press.current = null;
    if (action === "send") {
      buzz();
      recorder.stopAndSend();
    }
  };

  const label = busy
    ? phase === "transcribing"
      ? t("composer.voice.transcribing")
      : t("composer.voice.waitingForMic")
    : live
      ? t("composer.voice.recording", { elapsed: recorder.elapsedLabel })
      : t("composer.voice.idle");

  return (
    <div className="flex items-stretch gap-2">
      {live || busy ? (
        <button
          type="button"
          onClick={recorder.discard}
          aria-label={t("composer.voice.discard")}
          className="flex w-14 shrink-0 items-center justify-center rounded-xl border border-input bg-background text-muted-foreground active:bg-muted"
        >
          <X className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onKeyboard}
          aria-label={t("composer.voice.keyboard")}
          className="flex w-14 shrink-0 items-center justify-center rounded-xl border border-input bg-background text-muted-foreground active:bg-muted"
        >
          <Keyboard className="size-5" />
        </button>
      )}
      <button
        type="button"
        disabled={!enabled}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
        // A keyboard or switch user gets the tap gesture: Enter or Space starts, and again sends.
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (phase === "idle") recorder.start();
          else if (live) recorder.stopAndSend();
        }}
        aria-label={label}
        aria-pressed={live}
        style={{ WebkitTouchCallout: "none" }}
        className={cn(
          "flex h-16 min-w-0 flex-1 touch-none select-none items-center justify-center gap-3 rounded-xl text-base font-medium transition-colors duration-150",
          live
            ? "bg-destructive text-white"
            : "bg-primary text-primary-foreground active:bg-primary/85",
          !enabled && "opacity-50",
        )}
      >
        {busy ? (
          <Loader2 className="size-6 shrink-0 animate-spin" />
        ) : (
          <Mic className={cn("size-6 shrink-0", live && "animate-pulse")} />
        )}
        <span className="min-w-0 truncate tabular-nums">{label}</span>
      </button>
    </div>
  );
}
