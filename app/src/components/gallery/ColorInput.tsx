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
      className={`relative w-8 h-8 rounded overflow-hidden border border-neutral-700 bg-neutral-800 ${
        className || ""
      }`}
    >
      <input
        type="color"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] p-0 m-0 border-0 cursor-pointer"
        style={{ opacity: isEmpty ? 0 : 1 }}
      />
    </div>
  );
};
