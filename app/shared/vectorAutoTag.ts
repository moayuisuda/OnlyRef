// 短标签词的相似度低于完整图文描述，默认值按实际自动标签效果校准。
export const AUTO_TAG_THRESHOLD_DEFAULT = 0.09;
export const AUTO_TAG_THRESHOLD_MIN = 0.05;
export const AUTO_TAG_THRESHOLD_MAX = 0.3;
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
