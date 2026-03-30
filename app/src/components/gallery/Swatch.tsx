import React, { useRef } from "react";
import { useT } from "../../i18n/useT";

interface SwatchProps {
  color: string;
  selected: boolean;
  onPress: () => void;
  onReplaceWithCurrent?: () => void;
}

export const Swatch: React.FC<SwatchProps> = ({
  color,
  selected,
  onPress,
  onReplaceWithCurrent,
}) => {
  const { t } = useT();
  const timerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  return (
    <button
      type="button"
      className={[
        "w-5 h-5 rounded transition-all",
        selected ? "ring-2" : "hover:border-white/60",
      ].join(" ")}
      style={{ backgroundColor: color }}
      onPointerDown={(e) => {
        e.preventDefault();
        didLongPressRef.current = false;
        if (!onReplaceWithCurrent) return;
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          didLongPressRef.current = true;
          onReplaceWithCurrent();
        }, 420);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        const didLongPress = didLongPressRef.current;
        clearTimer();
        if (!didLongPress) onPress();
      }}
      onPointerCancel={() => clearTimer()}
      onPointerLeave={() => clearTimer()}
      title={onReplaceWithCurrent ? t("swatch.replaceHint", { color }) : color}
    />
  );
}
