export const acceleratorToHotkey = (accelerator: string): string | null => {
  const raw = accelerator.trim();
  if (!raw) return null;
  const parts = raw
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  const keys: string[] = [];
  modifiers.forEach((m) => {
    const lower = m.toLowerCase();
    if (
      lower === 'command' ||
      lower === 'cmd' ||
      lower === 'ctrl' ||
      lower === 'control'
    ) {
      if (!keys.includes('mod')) keys.push('mod');
    } else if (lower === 'shift') {
      keys.push('shift');
    } else if (lower === 'alt' || lower === 'option') {
      keys.push('alt');
    }
  });
  const main = mainKey.toLowerCase();
  if (!main) return null;
  keys.push(main);
  return keys.join('+');
};
