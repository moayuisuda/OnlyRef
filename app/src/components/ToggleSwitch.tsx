import React from "react";
import { clsx } from "clsx";

export type ToggleSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={clsx(
        "relative h-6 w-11 rounded-full border transition-all duration-200 disabled:opacity-60",
        checked
          ? "border-[rgba(57,197,187,0.28)] bg-[rgba(57,197,187,0.22)]"
          : "border-white/10 bg-white/[0.05]",
      )}
    >
      <div
        className={clsx(
          "absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-[rgba(237,241,243,0.96)] shadow-[0_6px_14px_rgba(0,0,0,0.28)] transition-transform duration-200",
          checked ? "translate-x-[20px]" : "translate-x-0",
        )}
      />
    </button>
  );
};
