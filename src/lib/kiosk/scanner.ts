/**
 * Fob scan buffering — pure logic, no DOM, no React.
 *
 * The 125kHz reader is a keyboard emulator: on tap it types ~10 characters in
 * a tight burst and sends Enter. This module turns that keystroke stream into
 * discrete, validated scan codes, and is deliberately free of browser APIs so
 * the timing rules can be reasoned about (and unit tested) on their own.
 *
 * It defends against four real failure modes:
 *
 *   1. A partial read (fob dragged past the coil) leaving junk in the buffer,
 *      which would corrupt the *next* scan. Solved by burst splitting: a gap
 *      longer than maxInterKeyMs starts a fresh burst.
 *   2. A reader configured without an Enter suffix. Solved by quiet-flush.
 *   3. A double-fire — a bouncy read, or the same tap arriving down both the
 *      keydown and IME capture paths. Solved by the dedupe window.
 *   4. Stray human typing, if a keyboard is ever attached for support work.
 *      Solved by the burst-duration ceiling.
 *
 * Length is deliberately validated only at flush time, never mid-burst. An
 * earlier version emitted as soon as the buffer reached maxLength, which meant
 * a garbled 16-character read was accepted as its own first 12 characters —
 * a valid-looking code belonging to nobody, or worse, to someone else. A burst
 * is now judged once it is complete, and an over-long one is rejected whole.
 */

export interface ScanConfig {
  /** Shortest plausible code. Below this, a burst is treated as a misread. */
  minLength: number;
  /** Longest plausible code. An over-long burst is rejected whole, never truncated. */
  maxLength: number;
  /** Gap between keystrokes above which a new burst begins. */
  maxInterKeyMs: number;
  /** Ceiling on total burst duration. Separates reader bursts from typing. */
  maxBurstMs: number;
  /** Silence after which a complete-looking buffer flushes without Enter. */
  quietFlushMs: number;
  /** Ignore an identical code repeated inside this window. */
  dedupeMs: number;
  /** Which characters count as part of a code. */
  isCodeChar: (ch: string) => boolean;
}

/**
 * Tuned for a 125kHz EM4100-style reader emitting 10 digits.
 *
 * Two relationships matter more than the absolute numbers:
 *
 *   quietFlushMs > maxInterKeyMs — otherwise a reader that stalls mid-burst
 *   gets flushed early and the tail of the code is lost, silently turning a
 *   known fob into an unknown one. Quiet-flush must only fire once the burst
 *   is definitively over.
 *
 *   maxBurstMs sits well above a real burst (10 keys at ~15ms is ~150ms) and
 *   well below hand-typing ten digits. ~5x headroom absorbs a WebView GC
 *   pause without letting stray typing through.
 *
 * Pin minLength/maxLength to the exact width once diagnostics shows what this
 * reader really emits — a tolerant range means a dropped character can still
 * pass validation and be looked up as the wrong fob.
 */
export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  minLength: 8,
  maxLength: 12,
  maxInterKeyMs: 250,
  maxBurstMs: 900,
  quietFlushMs: 300,
  /*
   * Matches how long a confirmation stays on screen. A visitor who taps again
   * because they are not sure it worked would otherwise be signed straight
   * back out while their own "Signed in" message is still showing. Dedupe is
   * per-code, so a second person's fob is still processed immediately.
   */
  dedupeMs: 4000,
  isCodeChar: (ch) => /^[0-9A-Za-z]$/.test(ch),
};

export type ScanReason = "terminator" | "quiet-flush";

export type ScanRejection = "too-short" | "too-slow" | "duplicate" | "overflow";

export type ScanEvent =
  | {
      kind: "accepted";
      code: string;
      via: ScanReason;
      /** Wall-clock span of the burst, first keystroke to flush. */
      durationMs: number;
      keyCount: number;
      /** Mean gap between keystrokes; the clearest reader-vs-human signal. */
      meanGapMs: number;
    }
  | {
      kind: "rejected";
      code: string;
      reason: ScanRejection;
      durationMs: number;
      keyCount: number;
    };

export interface ScanBufferSnapshot {
  chars: string;
  /** May exceed chars.length once the storage cap is hit on a runaway burst. */
  keyCount: number;
  startedAt: number;
  lastKeyAt: number;
}

export class ScanBuffer {
  private readonly config: ScanConfig;

  /** Guards against a stuck key growing the buffer without bound. */
  private static readonly STORAGE_CAP = 256;

  private chars = "";
  /** Counted separately from `chars`, which stops growing at STORAGE_CAP. */
  private count = 0;
  private startedAt = 0;
  private lastKeyAt = 0;
  private gaps: number[] = [];
  private lastEmit: { code: string; at: number } | null = null;

  constructor(config: Partial<ScanConfig> = {}) {
    this.config = { ...DEFAULT_SCAN_CONFIG, ...config };
  }

  get snapshot(): ScanBufferSnapshot {
    return {
      chars: this.chars,
      keyCount: this.count,
      startedAt: this.startedAt,
      lastKeyAt: this.lastKeyAt,
    };
  }

  /** Feed one character from the reader. `at` is a monotonic timestamp (ms). */
  pushChar(ch: string, at: number): ScanEvent | null {
    if (!this.config.isCodeChar(ch)) return null;

    const gap = at - this.lastKeyAt;
    const isNewBurst = this.count === 0 || gap > this.config.maxInterKeyMs;

    if (isNewBurst) {
      // Whatever was half-collected belonged to an aborted read. Drop it
      // rather than letting it contaminate this scan.
      this.clearBurst();
      this.startedAt = at;
    } else {
      this.gaps.push(gap);
    }

    if (this.chars.length < ScanBuffer.STORAGE_CAP) this.chars += ch;
    this.count += 1;
    this.lastKeyAt = at;

    // No eager emit at maxLength: whether this burst is over-long is not known
    // until it ends. flush() judges the finished burst.
    return null;
  }

  /** Feed the Enter keystroke that terminates a scan. */
  pushTerminator(at: number): ScanEvent | null {
    if (this.count === 0) return null;
    return this.flush(at, "terminator");
  }

  /**
   * Call periodically. Flushes a burst that has gone quiet, covering readers
   * configured without an Enter suffix. Partial reads flush too and come back
   * as rejections, which keeps them visible in diagnostics instead of
   * disappearing silently.
   */
  poll(at: number): ScanEvent | null {
    if (this.count === 0) return null;
    if (at - this.lastKeyAt < this.config.quietFlushMs) return null;
    return this.flush(at, "quiet-flush");
  }

  reset(): void {
    this.clearBurst();
    this.lastEmit = null;
  }

  private clearBurst(): void {
    this.chars = "";
    this.count = 0;
    this.gaps = [];
    this.startedAt = 0;
  }

  /** Judges a finished burst. The only place a code is accepted or rejected. */
  private flush(at: number, via: ScanReason): ScanEvent {
    const code = this.chars;
    const durationMs = at - this.startedAt;
    const keyCount = this.count;
    const gaps = this.gaps;

    this.clearBurst();
    this.lastKeyAt = at;

    if (keyCount < this.config.minLength) {
      return { kind: "rejected", code, reason: "too-short", durationMs, keyCount };
    }

    if (keyCount > this.config.maxLength) {
      return { kind: "rejected", code, reason: "overflow", durationMs, keyCount };
    }

    if (durationMs > this.config.maxBurstMs) {
      return { kind: "rejected", code, reason: "too-slow", durationMs, keyCount };
    }

    if (
      this.lastEmit &&
      this.lastEmit.code === code &&
      at - this.lastEmit.at < this.config.dedupeMs
    ) {
      return { kind: "rejected", code, reason: "duplicate", durationMs, keyCount };
    }

    this.lastEmit = { code, at };

    const meanGapMs = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

    return { kind: "accepted", code, via, durationMs, keyCount, meanGapMs };
  }
}
