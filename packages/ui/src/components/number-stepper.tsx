import { ChevronDown, ChevronUp } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group";

// Ported from Swiftmap's Map Portal Components (Change 14). User-facing text
// comes in through props so callers can pass translated strings.

export type NumberStepperProps = {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name of the up button, e.g. "Increase min zoom". */
  increaseLabel: string;
  /** Accessible name of the down button, e.g. "Decrease min zoom". */
  decreaseLabel: string;
};

export function NumberStepper({
  id,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  increaseLabel,
  decreaseLabel,
}: NumberStepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        className="tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <InputGroupAddon
        align="inline-end"
        className="flex-col gap-0 self-stretch border-s p-0 has-[>button]:me-0"
      >
        <InputGroupButton
          size="icon-xs"
          className="h-1/2 rounded-none"
          aria-label={increaseLabel}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          <ChevronUp />
        </InputGroupButton>
        <InputGroupButton
          size="icon-xs"
          className="h-1/2 rounded-none border-t"
          aria-label={decreaseLabel}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          <ChevronDown />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
