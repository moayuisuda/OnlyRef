export const AUTO_TAG_THRESHOLD_DEFAULT = 0.24;
export const AUTO_TAG_THRESHOLD_MIN = 0.1;
export const AUTO_TAG_THRESHOLD_MAX = 0.5;
export const AUTO_TAG_THRESHOLD_STEP = 0.01;

const roundToStep = (value: number): number => {
  const rounded = Math.round(value / AUTO_TAG_THRESHOLD_STEP) * AUTO_TAG_THRESHOLD_STEP;
  return Number(rounded.toFixed(2));
};

export const normalizeAutoTagThreshold = (value: unknown): number => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return AUTO_TAG_THRESHOLD_DEFAULT;
  }

  if (numeric <= AUTO_TAG_THRESHOLD_MIN) {
    return AUTO_TAG_THRESHOLD_MIN;
  }

  if (numeric >= AUTO_TAG_THRESHOLD_MAX) {
    return AUTO_TAG_THRESHOLD_MAX;
  }

  return roundToStep(numeric);
};
