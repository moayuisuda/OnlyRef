import sharp from "sharp";

// Helper: RGB to HSV
// r, g, b in [0, 255]
// Returns h, s, v in [0, 1]
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
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
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, v };
}

// Helper: Number to Hex
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

export async function getDominantColor(filePath: string): Promise<string> {
  try {
    const { data } = await sharp(filePath)
      .resize(150, 150, { fit: "cover" }) // Resize for performance
      .removeAlpha() // Ensure RGB
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = data.length / 3;
    const colorCounts = new Map<string, number>();

    // Quantize and count
    // Using 5-bit quantization (32 levels per channel) to cluster similar colors
    // This is a simple alternative to Median Cut
    const QUANTIZATION_BITS = 5;
    const SHIFT = 8 - QUANTIZATION_BITS; // 3
    const BIN_SIZE = 1 << SHIFT; // 8
    const OFFSET = BIN_SIZE / 2; // 4 (center of bin)

    for (let i = 0; i < data.length; i += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Quantize
      const rQ = (r >> SHIFT) << SHIFT;
      const gQ = (g >> SHIFT) << SHIFT;
      const bQ = (b >> SHIFT) << SHIFT;

      const key = `${rQ},${gQ},${bQ}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }

    // Sort by count
    const sortedColors = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // Top 5
      .map(([key, count]) => {
        const [r, g, b] = key.split(",").map(Number);
        // Use center of the bin
        return {
          r: Math.min(255, r + OFFSET),
          g: Math.min(255, g + OFFSET),
          b: Math.min(255, b + OFFSET),
          count,
        };
      });

    // Scoring system (matching Python implementation)
    let bestScore = -1.0;
    let bestHex = "#808080";
    const totalPixels = pixelCount; // Use total pixels for dominance calc (approx)

    for (const color of sortedColors) {
      const { r, g, b, count } = color;
      const { s, v } = rgbToHsv(r, g, b);

      const dominance = count / totalPixels;
      let score = dominance;

      // Boost for Saturation
      score *= 1.0 + s * 1.5;

      // Boost for Value
      score *= 1.0 + v * 1.2;

      // Penalty for very dark colors
      if (v < 0.2) {
        score *= 0.1;
      }

      // Penalty for near-whites/grays
      if (s < 0.1 && v > 0.8) {
        score *= 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestHex = rgbToHex(r, g, b);
      }
    }

    return bestHex;
  } catch (error) {
    console.error(`Error calculating dominant color for ${filePath}:`, error);
    return "#808080";
  }
}

export async function calculateTone(filePath: string): Promise<string> {
  try {
    const { data } = await sharp(filePath)
      .resize(150, 150, { fit: "cover" })
      .grayscale() // Convert to grayscale
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Build histogram
    const hist = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) {
      hist[data[i]]++;
    }

    const totalPixels = data.length;
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
