import React from "react";

interface ColorInputProps {
  value?: string | null;
  onChange: (value: string) => void;
  className?: string;
}

export const ColorInput: React.FC<ColorInputProps> = ({
  value,
  onChange,
  className,
}) => {
  const isEmpty = !value;

  return (
    <div
      className={`relative h-10 w-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
        className || ""
      }`}
    >
      <input
        type="color"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="absolute left-1/2 top-1/2 m-0 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 cursor-pointer border-0 p-0"
        style={{ opacity: isEmpty ? 0 : 1 }}
      />
    </div>
  );
};
