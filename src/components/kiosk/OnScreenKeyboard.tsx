"use client";

/**
 * In-app keyboard.
 *
 * Rendered in the DOM rather than raising Android's IME, for two reasons: the
 * system keyboard carries a settings cog and a microphone button that are a
 * breakout route out of kiosk mode, and its keys are too small for the people
 * using this.
 *
 * Keys are sized in viewport height units. An 8.7" tablet reports roughly
 * 765x457 CSS pixels, so fixed pixel heights either overflow in landscape or
 * waste half the panel in portrait; clamped vh scales to whatever the device
 * actually reports while never dropping below a 44px touch target.
 *
 * There is no Shift key. Everything is entered uppercase — one less thing to
 * understand, no keys changing appearance mid-word, and names stay legible on
 * the fire roster, which is where they matter most.
 */

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "'"],
  ["Z", "X", "C", "V", "B", "N", "M", "-"],
];

const KEY_HEIGHT = "h-[clamp(2.75rem,7.5vh,4rem)]";
const KEY_TEXT = "text-[clamp(1.05rem,2.9vh,1.6rem)]";

export interface OnScreenKeyboardProps {
  onCharacter: (character: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onNextField: () => void;
  disabled?: boolean;
}

export function OnScreenKeyboard({
  onCharacter,
  onBackspace,
  onSpace,
  onNextField,
  disabled = false,
}: OnScreenKeyboardProps) {
  return (
    <div className="grid grid-cols-10 gap-1.5 select-none sm:gap-2">
      {ROWS.flatMap((row, rowIndex) =>
        row.map((character) => (
          <Key
            key={`${rowIndex}-${character}`}
            label={character}
            onPress={() => onCharacter(character)}
            disabled={disabled}
          />
        )),
      )}

      <Key
        label="⌫ Delete"
        span={2}
        tone="action"
        onPress={onBackspace}
        disabled={disabled}
        ariaLabel="Delete last character"
      />

      <Key label="Space" span={7} tone="action" onPress={onSpace} disabled={disabled} />
      <Key label="Next →" span={3} tone="action" onPress={onNextField} disabled={disabled} />
    </div>
  );
}

function Key({
  label,
  onPress,
  span = 1,
  tone = "letter",
  disabled,
  ariaLabel,
}: {
  label: string;
  onPress: () => void;
  span?: number;
  tone?: "letter" | "action";
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const spanClass =
    span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : span === 7 ? "col-span-7" : "";

  const toneClass =
    tone === "letter"
      ? "bg-brand-cream text-brand-primary active:bg-brand-accent active:text-brand-cream"
      : "bg-brand-deep text-brand-cream border-2 border-cream-dim/40 active:bg-brand-accent active:border-brand-accent";

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className={`${spanClass} ${KEY_HEIGHT} ${KEY_TEXT} ${toneClass} flex items-center justify-center rounded-xl font-bold shadow-sm transition-transform duration-75 active:scale-95 disabled:opacity-40`}
    >
      {label}
    </button>
  );
}
