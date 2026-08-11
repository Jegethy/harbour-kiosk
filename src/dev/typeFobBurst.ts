/**
 * DEV ONLY — see src/dev/config.ts.
 *
 * Replays a fob tap as real DOM keyboard events, at reader speed.
 *
 * This deliberately does not call into ScanBuffer or submitScan directly. A
 * simulator that skipped straight to the outcome would prove nothing: the
 * whole point is to exercise the same path a physical tap takes — window
 * capture listener, burst timing checks, length validation, dedupe window,
 * then the API route and the RPC. If the timing rules would reject a real
 * reader, they reject this too.
 *
 * The gaps are genuine awaits rather than fabricated timestamps, so
 * performance.now() inside the buffer sees real elapsed milliseconds.
 */

export interface BurstProfile {
  /** Mean gap between keystrokes. EM4100-style readers sit around 10-20ms. */
  meanGapMs: number;
  /** Random spread either side of the mean. */
  jitterMs: number;
  /** Pause before the terminating Enter. */
  terminatorGapMs: number;
}

export const READER_PROFILE: BurstProfile = {
  meanGapMs: 14,
  jitterMs: 4,
  terminatorGapMs: 16,
};

export interface BurstReport {
  code: string;
  keyCount: number;
  /** Measured, not assumed — first keystroke to Enter. */
  durationMs: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function keyCodeFor(character: string): number {
  if (character >= "0" && character <= "9") return 48 + Number(character);
  const upper = character.toUpperCase();
  if (upper >= "A" && upper <= "Z") return upper.charCodeAt(0);
  return 0;
}

function codeFor(character: string): string {
  if (character >= "0" && character <= "9") return `Digit${character}`;
  const upper = character.toUpperCase();
  if (upper >= "A" && upper <= "Z") return `Key${upper}`;
  return "Unidentified";
}

function dispatchKey(target: EventTarget, key: string, code: string, keyCode: number) {
  const event = new KeyboardEvent("keydown", {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  // keyCode and which are not part of KeyboardEventInit, so they would read as
  // 0. The diagnostics page displays them, and the IME detection in
  // useFobScanner checks keyCode === 229, so make them look like a real key.
  Object.defineProperty(event, "keyCode", { get: () => keyCode });
  Object.defineProperty(event, "which", { get: () => keyCode });

  target.dispatchEvent(event);
}

/** Generate a plausible unassigned fob number. */
export function randomFobId(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

export async function typeFobBurst(
  target: EventTarget,
  code: string,
  profile: BurstProfile = READER_PROFILE,
): Promise<BurstReport> {
  const gap = () =>
    Math.max(1, profile.meanGapMs + (Math.random() * 2 - 1) * profile.jitterMs);

  const startedAt = performance.now();

  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    if (index > 0) await delay(gap());
    dispatchKey(target, character, codeFor(character), keyCodeFor(character));
  }

  await delay(profile.terminatorGapMs);
  dispatchKey(target, "Enter", "Enter", 13);

  return {
    code,
    keyCount: code.length,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
