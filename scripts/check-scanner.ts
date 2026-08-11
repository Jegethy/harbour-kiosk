import { ScanBuffer, DEFAULT_SCAN_CONFIG, type ScanEvent } from "../src/lib/kiosk/scanner";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

/** Drive a buffer with a scripted keystroke stream, collecting emitted events. */
function drive(
  buffer: ScanBuffer,
  script: Array<{ ch?: string; enter?: true; poll?: true; at: number }>,
): ScanEvent[] {
  const out: ScanEvent[] = [];
  for (const step of script) {
    let ev: ScanEvent | null = null;
    if (step.enter) ev = buffer.pushTerminator(step.at);
    else if (step.poll) ev = buffer.poll(step.at);
    else if (step.ch !== undefined) ev = buffer.pushChar(step.ch, step.at);
    if (ev) out.push(ev);
  }
  return out;
}

/** A reader burst: `code` typed at `gap`ms intervals starting at `start`. */
function burst(code: string, start: number, gap: number) {
  return [...code].map((ch, i) => ({ ch, at: start + i * gap }));
}

function summarise(events: ScanEvent[]) {
  return events.map((e) =>
    e.kind === "accepted" ? `+${e.code}:${e.via}` : `-${e.code}:${e.reason}`,
  );
}

console.log("\nScanConfig:", {
  ...DEFAULT_SCAN_CONFIG,
  isCodeChar: undefined,
});

console.log("\n1. Normal reader burst, 10 digits at 15ms + Enter");
{
  const b = new ScanBuffer();
  const events = drive(b, [...burst("1234567890", 1000, 15), { enter: true, at: 1150 }]);
  check("accepted via terminator", summarise(events), ["+1234567890:terminator"]);
}

console.log("\n2. Reader with no Enter suffix -> quiet flush");
{
  const b = new ScanBuffer();
  const events = drive(b, [
    ...burst("1234567890", 1000, 15),
    { poll: true, at: 1200 }, // 65ms quiet: too soon
    { poll: true, at: 1500 }, // 365ms quiet: flush
  ]);
  check("accepted via quiet-flush", summarise(events), ["+1234567890:quiet-flush"]);
}

console.log("\n3. Aborted partial read must not contaminate the next scan");
{
  const b = new ScanBuffer();
  const events = drive(b, [
    ...burst("123", 1000, 15), // fob dragged past the coil
    ...burst("9876543210", 5000, 15), // clean read 4s later
    { enter: true, at: 5150 },
  ]);
  check("clean code only, no prefix", summarise(events), ["+9876543210:terminator"]);
}

console.log("\n4. Stall mid-burst must not truncate the code");
{
  const b = new ScanBuffer();
  // 8 chars (== minLength), then a 200ms WebView stall, then the last 2.
  const events = drive(b, [
    ...burst("12345678", 1000, 15),
    { poll: true, at: 1150 }, // 45ms quiet
    { poll: true, at: 1250 }, // 145ms quiet - would truncate if quietFlush < interKey
    { ch: "9", at: 1305 },
    { ch: "0", at: 1320 },
    { enter: true, at: 1335 },
  ]);
  check("full 10 digits survive the stall", summarise(events), ["+1234567890:terminator"]);
}

console.log("\n5. Bouncy double-fire of the same fob");
{
  const b = new ScanBuffer();
  const events = drive(b, [
    ...burst("1234567890", 1000, 15),
    { enter: true, at: 1150 },
    ...burst("1234567890", 1400, 15), // re-fires 250ms later
    { enter: true, at: 1550 },
  ]);
  check("second read rejected as duplicate", summarise(events), [
    "+1234567890:terminator",
    "-1234567890:duplicate",
  ]);
}

console.log("\n6. Same fob tapped again after the dedupe window (sign out)");
{
  const b = new ScanBuffer();
  const events = drive(b, [
    ...burst("1234567890", 1000, 15),
    { enter: true, at: 1150 },
    ...burst("1234567890", 6000, 15), // deliberate second tap 5s later
    { enter: true, at: 6150 },
  ]);
  check("both accepted", summarise(events), [
    "+1234567890:terminator",
    "+1234567890:terminator",
  ]);
}

console.log("\n7. Human typing ten digits at 300ms per key");
{
  const b = new ScanBuffer();
  const events = drive(b, [...burst("1234567890", 1000, 300), { enter: true, at: 3800 }]);
  check("nothing accepted", summarise(events).filter((s) => s.startsWith("+")), []);
}

console.log("\n8. Fast human typing at 120ms per key (inside interKey, over burst ceiling)");
{
  const b = new ScanBuffer();
  const events = drive(b, [...burst("1234567890", 1000, 120), { enter: true, at: 2100 }]);
  check("rejected as too-slow", summarise(events), ["-1234567890:too-slow"]);
}

console.log("\n9. Over-long burst is rejected whole, never accepted as a prefix");
{
  const b = new ScanBuffer();
  const events = drive(b, [
    ...burst("1234567890ABCDEF", 1000, 15), // 16 chars, over maxLength 12
    { enter: true, at: 1250 },
    ...burst("5555555555", 4000, 15), // clean read after
    { enter: true, at: 4150 },
  ]);
  check("overflow rejected, next read clean", summarise(events), [
    "-1234567890ABCDEF:overflow",
    "+5555555555:terminator",
  ]);
  // The regression this guards: emitting at maxLength accepted "1234567890AB"
  // as a real code — a valid-looking fob id belonging to nobody.
  check(
    "no truncated prefix accepted",
    events.filter((e) => e.kind === "accepted" && e.code !== "5555555555").length,
    0,
  );
}

console.log("\n10. Too-short burst rejected on Enter");
{
  const b = new ScanBuffer();
  const events = drive(b, [...burst("123", 1000, 15), { enter: true, at: 1060 }]);
  check("rejected as too-short", summarise(events), ["-123:too-short"]);
}

console.log("\n11. IME path: whole code arrives on one input event (same timestamp)");
{
  const b = new ScanBuffer();
  const events = drive(b, [...burst("1234567890", 1000, 0), { enter: true, at: 1005 }]);
  check("accepted", summarise(events), ["+1234567890:terminator"]);
}

console.log("\n12. Non-code characters are ignored");
{
  const b = new ScanBuffer();
  const events = drive(b, [
    { ch: "-", at: 1000 },
    ...burst("1234567890", 1010, 15),
    { ch: "!", at: 1170 },
    { enter: true, at: 1180 },
  ]);
  check("punctuation stripped", summarise(events), ["+1234567890:terminator"]);
}

console.log("\n13. Abandoned partial read surfaces as a rejection, not silence");
{
  const b = new ScanBuffer();
  const events = drive(b, [...burst("123", 1000, 15), { poll: true, at: 1400 }]);
  check("quiet-flushed as too-short", summarise(events), ["-123:too-short"]);
}

console.log("\n14. Buffer is clean after a rejection");
{
  const b = new ScanBuffer();
  const events = drive(b, [
    ...burst("123", 1000, 15),
    { poll: true, at: 1400 },
    ...burst("7777777777", 1500, 15),
    { enter: true, at: 1650 },
  ]);
  check("next read unaffected", summarise(events), [
    "-123:too-short",
    "+7777777777:terminator",
  ]);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
