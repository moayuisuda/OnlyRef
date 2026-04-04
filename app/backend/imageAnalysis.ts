import sharp from "sharp";

const DEFAULT_DOMINANT_COLOR = "#808080";
const DOMINANT_ANALYSIS_SIZE = 96;
const DOMINANT_CLUSTER_COUNT = 6;
const DOMINANT_CLUSTER_ITERATIONS = 10;
const MIN_VISIBLE_ALPHA = 8;

type HsvColor = { h: number; s: number; v: number };

type LabColor = {
  l: number;
  labA: number;
  labB: number;
};

type PixelSample = LabColor & {
  r: number;
  g: number;
  b: number;
  weight: number;
  centerWeight: number;
};

type Cluster = LabColor & {
  r: number;
  g: number;
  b: number;
  weight: number;
  centerWeight: number;
  count: number;
};

type DominantColorInput = {
  samples: PixelSample[];
  totalWeight: number;
  meanLab: LabColor;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      default:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, v };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

function srgbChannelToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r: number, g: number, b: number): LabColor {
  const rLinear = srgbChannelToLinear(r);
  const gLinear = srgbChannelToLinear(g);
  const bLinear = srgbChannelToLinear(b);

  const x = rLinear * 0.4124564 + gLinear * 0.3575761 + bLinear * 0.1804375;
  const y = rLinear * 0.2126729 + gLinear * 0.7151522 + bLinear * 0.072175;
  const z = rLinear * 0.0193339 + gLinear * 0.119192 + bLinear * 0.9503041;

  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;
  const delta = 6 / 29;
  const deltaCubed = delta ** 3;
  const factor = 1 / (3 * delta ** 2);
  const offset = 4 / 29;

  const f = (value: number): number => (value > deltaCubed ? Math.cbrt(value) : value * factor + offset);

  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);

  return {
    l: 116 * fy - 16,
    labA: 500 * (fx - fy),
    labB: 200 * (fy - fz),
  };
}

function labDistanceSquared(left: LabColor, right: LabColor): number {
  const dl = left.l - right.l;
  const da = left.labA - right.labA;
  const db = left.labB - right.labB;
  return dl * dl + da * da + db * db;
}

function deltaE2000(left: LabColor, right: LabColor): number {
  const l1 = left.l;
  const a1 = left.labA;
  const b1 = left.labB;
  const l2 = right.l;
  const a2 = right.labA;
  const b2 = right.labB;

  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const cMean = (c1 + c2) / 2;
  const cMeanPow7 = cMean ** 7;
  const g = 0.5 * (1 - Math.sqrt(cMeanPow7 / (cMeanPow7 + 25 ** 7)));

  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1);
  const c2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2);

  const hPrime = (aPrime: number, bValue: number): number => {
    if (aPrime === 0 && bValue === 0) return 0;
    const angle = (Math.atan2(bValue, aPrime) * 180) / Math.PI;
    return angle >= 0 ? angle : angle + 360;
  };

  const h1Prime = hPrime(a1Prime, b1);
  const h2Prime = hPrime(a2Prime, b2);

  const deltaLPrime = l2 - l1;
  const deltaCPrime = c2Prime - c1Prime;

  let deltahPrime = 0;
  if (c1Prime !== 0 && c2Prime !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) {
      deltahPrime = diff;
    } else if (diff > 180) {
      deltahPrime = diff - 360;
    } else {
      deltahPrime = diff + 360;
    }
  }

  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(((deltahPrime / 2) * Math.PI) / 180);
  const lPrimeMean = (l1 + l2) / 2;
  const cPrimeMean = (c1Prime + c2Prime) / 2;

  let hPrimeMean = h1Prime + h2Prime;
  if (c1Prime !== 0 && c2Prime !== 0) {
    const diff = Math.abs(h1Prime - h2Prime);
    if (diff <= 180) {
      hPrimeMean = (h1Prime + h2Prime) / 2;
    } else if (h1Prime + h2Prime < 360) {
      hPrimeMean = (h1Prime + h2Prime + 360) / 2;
    } else {
      hPrimeMean = (h1Prime + h2Prime - 360) / 2;
    }
  }

  const t =
    1 -
    0.17 * Math.cos(((hPrimeMean - 30) * Math.PI) / 180) +
    0.24 * Math.cos(((2 * hPrimeMean) * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hPrimeMean + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hPrimeMean - 63) * Math.PI) / 180);

  const deltaTheta = 30 * Math.exp(-(((hPrimeMean - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt((cPrimeMean ** 7) / (cPrimeMean ** 7 + 25 ** 7));
  const sL = 1 + (0.015 * ((lPrimeMean - 50) ** 2)) / Math.sqrt(20 + (lPrimeMean - 50) ** 2);
  const sC = 1 + 0.045 * cPrimeMean;
  const sH = 1 + 0.015 * cPrimeMean * t;
  const rT = -Math.sin(((2 * deltaTheta) * Math.PI) / 180) * rC;

  const lTerm = deltaLPrime / sL;
  const cTerm = deltaCPrime / sC;
  const hTerm = deltaHPrime / sH;

  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm);
}

function getCenterWeight(x: number, y: number, width: number, height: number): number {
  const normalizedX = width <= 1 ? 0 : (x / (width - 1)) * 2 - 1;
  const normalizedY = height <= 1 ? 0 : (y / (height - 1)) * 2 - 1;
  const radialDistance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
  return clamp(0.65 + Math.exp(-(radialDistance * radialDistance) / 0.55) * 0.55, 0.65, 1.2);
}

async function collectDominantColorInput(filePath: string): Promise<DominantColorInput | null> {
  const { data, info } = await sharp(filePath)
    .resize(DOMINANT_ANALYSIS_SIZE, DOMINANT_ANALYSIS_SIZE, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width || DOMINANT_ANALYSIS_SIZE;
  const height = info.height || DOMINANT_ANALYSIS_SIZE;
  const channels = info.channels || 4;
  const samples: PixelSample[] = [];

  let totalWeight = 0;
  let weightedL = 0;
  let weightedA = 0;
  let weightedB = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * channels;
      const alpha = channels > 3 ? data[index + 3] : 255;
      if (alpha < MIN_VISIBLE_ALPHA) continue;

      const alphaWeight = alpha / 255;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const { l, labA, labB } = rgbToLab(r, g, b);
      const centerWeight = getCenterWeight(x, y, width, height);
      const weight = alphaWeight * centerWeight;
      if (weight <= 0) continue;

      samples.push({ r, g, b, l, labA, labB, weight, centerWeight });
      totalWeight += weight;
      weightedL += l * weight;
      weightedA += labA * weight;
      weightedB += labB * weight;
    }
  }

  if (samples.length === 0 || totalWeight === 0) return null;

  return {
    samples,
    totalWeight,
    meanLab: {
      l: weightedL / totalWeight,
      labA: weightedA / totalWeight,
      labB: weightedB / totalWeight,
    },
  };
}

function chooseInitialCentroids(samples: PixelSample[], centroidCount: number): LabColor[] {
  if (samples.length === 0) return [];

  let firstIndex = 0;
  let maxWeight = -1;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].weight <= maxWeight) continue;
    maxWeight = samples[i].weight;
    firstIndex = i;
  }

  const centroids: LabColor[] = [
    {
      l: samples[firstIndex].l,
      labA: samples[firstIndex].labA,
      labB: samples[firstIndex].labB,
    },
  ];

  while (centroids.length < centroidCount && centroids.length < samples.length) {
    let bestIndex = -1;
    let bestScore = -1;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let minDistance = Number.POSITIVE_INFINITY;

      for (const centroid of centroids) {
        minDistance = Math.min(minDistance, labDistanceSquared(sample, centroid));
      }

      const score = minDistance * sample.weight;
      if (score <= bestScore) continue;
      bestScore = score;
      bestIndex = i;
    }

    if (bestIndex === -1) break;

    centroids.push({
      l: samples[bestIndex].l,
      labA: samples[bestIndex].labA,
      labB: samples[bestIndex].labB,
    });
  }

  return centroids;
}

function buildClusters(samples: PixelSample[], assignments: number[], centroidCount: number): Cluster[] {
  const accumulators = Array.from({ length: centroidCount }, () => ({
    weight: 0,
    centerWeight: 0,
    r: 0,
    g: 0,
    b: 0,
    l: 0,
    labA: 0,
    labB: 0,
    count: 0,
  }));

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const clusterIndex = assignments[i];
    const accumulator = accumulators[clusterIndex];

    accumulator.weight += sample.weight;
    accumulator.centerWeight += sample.centerWeight * sample.weight;
    accumulator.r += sample.r * sample.weight;
    accumulator.g += sample.g * sample.weight;
    accumulator.b += sample.b * sample.weight;
    accumulator.l += sample.l * sample.weight;
    accumulator.labA += sample.labA * sample.weight;
    accumulator.labB += sample.labB * sample.weight;
    accumulator.count += 1;
  }

  return accumulators
    .filter((accumulator) => accumulator.weight > 0)
    .map((accumulator) => ({
      r: accumulator.r / accumulator.weight,
      g: accumulator.g / accumulator.weight,
      b: accumulator.b / accumulator.weight,
      l: accumulator.l / accumulator.weight,
      labA: accumulator.labA / accumulator.weight,
      labB: accumulator.labB / accumulator.weight,
      weight: accumulator.weight,
      centerWeight: accumulator.centerWeight / accumulator.weight,
      count: accumulator.count,
    }))
    .sort((left, right) => right.weight - left.weight);
}

function clusterSamples(samples: PixelSample[]): Cluster[] {
  const centroidCount = Math.min(DOMINANT_CLUSTER_COUNT, samples.length);
  if (centroidCount === 0) return [];

  const centroids = chooseInitialCentroids(samples, centroidCount);
  const assignments = new Array<number>(samples.length).fill(0);

  for (let iteration = 0; iteration < DOMINANT_CLUSTER_ITERATIONS; iteration++) {
    const accumulators = Array.from({ length: centroids.length }, () => ({
      weight: 0,
      l: 0,
      labA: 0,
      labB: 0,
    }));

    let changed = false;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex++) {
        const centroid = centroids[centroidIndex];
        const distance = labDistanceSquared(sample, centroid);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        bestIndex = centroidIndex;
      }

      if (assignments[i] !== bestIndex) {
        changed = true;
        assignments[i] = bestIndex;
      }

      const accumulator = accumulators[bestIndex];
      accumulator.weight += sample.weight;
      accumulator.l += sample.l * sample.weight;
      accumulator.labA += sample.labA * sample.weight;
      accumulator.labB += sample.labB * sample.weight;
    }

    for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex++) {
      const accumulator = accumulators[centroidIndex];
      if (accumulator.weight === 0) continue;

      centroids[centroidIndex] = {
        l: accumulator.l / accumulator.weight,
        labA: accumulator.labA / accumulator.weight,
        labB: accumulator.labB / accumulator.weight,
      };
    }

    if (!changed && iteration > 0) break;
  }

  return buildClusters(samples, assignments, centroids.length);
}

function scoreCluster(
  cluster: Cluster,
  totalWeight: number,
  meanLab: LabColor,
  maxChroma: number,
  maxContrast: number,
): number {
  const share = cluster.weight / totalWeight;
  const { s, v } = rgbToHsv(cluster.r, cluster.g, cluster.b);
  const chroma = Math.sqrt(cluster.labA * cluster.labA + cluster.labB * cluster.labB);
  const contrast = deltaE2000(cluster, meanLab);
  const chromaScore = maxChroma > 0 ? chroma / maxChroma : 0;
  const contrastScore = maxContrast > 0 ? contrast / maxContrast : 0;
  const centerScore = clamp((cluster.centerWeight - 0.65) / 0.55, 0, 1);

  let score = share;
  score *= 0.95 + chromaScore * 1.8;
  score *= 0.95 + contrastScore * 1.35;
  score *= 0.9 + centerScore * 0.35;

  // Neutral bright backgrounds look large, but they rarely match perceived subject color.
  if (s < 0.08 && v > 0.9) {
    score *= 0.02;
  } else if (s < 0.15 && v > 0.82) {
    score *= 0.14;
  }

  // Near-black neutrals should also stay out of the way.
  if (v < 0.15 && chromaScore < 0.25) {
    score *= 0.18;
  } else if (v < 0.22 && s < 0.18) {
    score *= 0.35;
  }

  // Very small muted regions should not beat strong main regions.
  if (share < 0.015 && chromaScore < 0.3) {
    score *= 0.4;
  }

  return score;
}

export async function getDominantColor(filePath: string): Promise<string> {
  try {
    const input = await collectDominantColorInput(filePath);
    if (!input) return DEFAULT_DOMINANT_COLOR;

    const clusters = clusterSamples(input.samples);
    if (clusters.length === 0) return DEFAULT_DOMINANT_COLOR;

    const contrasts = clusters.map((cluster) => deltaE2000(cluster, input.meanLab));
    const chromas = clusters.map((cluster) => Math.sqrt(cluster.labA * cluster.labA + cluster.labB * cluster.labB));
    const maxContrast = Math.max(...contrasts, 1);
    const maxChroma = Math.max(...chromas, 1);

    let bestCluster: Cluster | null = null;
    let bestScore = -1;

    for (const cluster of clusters) {
      const score = scoreCluster(cluster, input.totalWeight, input.meanLab, maxChroma, maxContrast);
      if (score <= bestScore) continue;
      bestScore = score;
      bestCluster = cluster;
    }

    return bestCluster ? rgbToHex(bestCluster.r, bestCluster.g, bestCluster.b) : DEFAULT_DOMINANT_COLOR;
  } catch (error) {
    console.error(`Error calculating dominant color for ${filePath}:`, error);
    return DEFAULT_DOMINANT_COLOR;
  }
}

export async function calculateTone(filePath: string): Promise<string> {
  try {
    const { data, info } = await sharp(filePath)
      .resize(150, 150, { fit: "cover" })
      .grayscale() // Convert to grayscale
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Build histogram
    const hist = new Array(256).fill(0);
    const channels = info.channels || 2;
    for (let i = 0; i < data.length; i += channels) {
      const luminance = data[i];
      const alpha = channels > 1 ? data[i + 1] : 255;
      if (alpha === 0) continue;
      hist[luminance]++;
    }

    const totalPixels = hist.reduce((sum, count) => sum + count, 0);
    if (totalPixels === 0) return "mid-mid";

    // === 1. Determine Key (Brightness) ===
    // Shadows (0-85), Midtones (86-170), Highlights (171-255)
    let shadowPixels = 0;
    let highlightPixels = 0;
    let weightedSum = 0;

    for (let i = 0; i < 256; i++) {
      const count = hist[i];
      if (i <= 85) shadowPixels += count;
      if (i >= 171) highlightPixels += count;
      weightedSum += i * count;
    }

    const pShadow = shadowPixels / totalPixels;
    const pHigh = highlightPixels / totalPixels;
    const meanLum = weightedSum / totalPixels;

    let key = "mid";
    if (pHigh > 0.6 || meanLum > 180) {
      key = "high";
    } else if (pShadow > 0.6 || meanLum < 75) {
      key = "low";
    }

    // === 2. Determine Range (Contrast) ===
    let cumulative = 0;
    let p5Idx = -1;
    let p95Idx = 255;

    for (let i = 0; i < 256; i++) {
      cumulative += hist[i];
      const frac = cumulative / totalPixels;
      if (frac >= 0.05 && p5Idx === -1) {
        p5Idx = i;
      }
      if (frac >= 0.95) {
        p95Idx = i;
        break;
      }
    }

    if (p5Idx === -1) p5Idx = 0;

    const dynamicRange = p95Idx - p5Idx;
    let toneRange = "mid";

    if (dynamicRange < 100) {
      toneRange = "short";
    } else if (dynamicRange > 190) {
      toneRange = "long";
    }

    return `${key}-${toneRange}`;
  } catch (error) {
    console.error(`Error calculating tone for ${filePath}:`, error);
    return "mid-mid";
  }
}
