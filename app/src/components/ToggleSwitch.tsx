import React from 'react';
import { clsx } from 'clsx';
import { THEME } from '../theme';

export type ToggleSwitchProps = {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onToggle,
  disabled,
}) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={clsx(
        'w-8 h-4 rounded-full relative transition-colors duration-200 bg-neutral-700 disabled:opacity-60',
      )}
      style={{
        backgroundColor: checked ? THEME.primary : undefined,
      }}
    >
      <div
        className={clsx(
          'absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
};

