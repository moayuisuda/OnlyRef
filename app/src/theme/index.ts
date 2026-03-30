export const THEME = {
  // Primary Brand Color (Teal)
  primary: "#39c5bb",
  // Secondary Brand Color (Darker Teal for Hover)
  secondary: "#17524e",
  danger: "#ef4444",
  
  // Canvas Specific
  canvas: {
    selectionFill: "rgba(57, 197, 187, 0.2)",
    controlsBg: "white",
  },
  
  // Gallery Specific
  gallery: {
    selectionRingOpacity: 0.7,
  },
  
  // Default Color Swatches for Color Picker
  swatches: [
    '#a855f7',
    '#3b82f6',
    '#06b6d4',
    '#22c55e',
    '#eab308',
    '#f97316',
    '#ef4444',
    '#ec4899',
    '#94a3b8',
    '#ffffff',
    '#0f172a',
  ]
} as const;

// Helper to get hex color with alpha
export const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
