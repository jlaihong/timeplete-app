import { Platform, Vibration } from "react-native";

/**
 * A brief "got it" when a task is ticked off: a soft two-note chime on web,
 * a short buzz where the device supports one. The visual half (the tick
 * popping, the row lingering for a moment) lives in `CompleteCheckIcon`
 * and `useRecentlyCompleted`.
 *
 * Never throws: feedback must not get in the way of the completion itself.
 */

type AudioCtor = typeof AudioContext;
let audioContext: AudioContext | null = null;

function playChime(): void {
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return;
  audioContext ??= new Ctor();
  const ctx = audioContext;
  if (ctx.state === "suspended") void ctx.resume();

  const start = ctx.currentTime;
  // Two rising notes, about 140ms in all, kept quiet.
  const notes: [frequency: number, offset: number][] = [
    [660, 0],
    [990, 0.06],
  ];
  for (const [frequency, offset] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const t = start + offset;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }
}

export function acknowledgeTaskCompleted(): void {
  try {
    if (Platform.OS === "web") {
      playChime();
      // Phones on the web app; desktop browsers ignore this.
      navigator.vibrate?.(15);
    } else if (Platform.OS === "android") {
      Vibration.vibrate(15);
    }
    // iOS: `Vibration` only offers a long buzz, which is worse than
    // nothing here. A light tap needs a haptics module (and a new build).
  } catch {
    // Feedback is best-effort.
  }
}
