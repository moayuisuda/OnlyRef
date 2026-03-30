export const OKLCH_FILTER = {
  deltaE: 0.17,
  maxHueDiff: 0.55,
  chromaThreshold: 0.04,
  neutralChromaCutoff: 0.02,
  tau: Math.PI * 2,
} as const;
