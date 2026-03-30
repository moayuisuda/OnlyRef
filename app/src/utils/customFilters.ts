/**
 * Triangle Pixelate (Mosaic) Filter
 * Splits the image into a grid of squares, then splits each square into two triangles.
 * Fills each triangle with the average color of pixels inside it.
 */
export const TrianglePixelate = function (this: { getAttr: (key: string) => unknown }, imageData: ImageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Get size from config
  // Konva filters access the node instance via 'this'
  let ratio = 0.05;
  const minSize = 20;

  if (this && typeof this.getAttr === 'function') {
    const configRatio = this.getAttr('pixelRatio');
    if (typeof configRatio === 'number') {
      ratio = configRatio;
    }
  }

  const size = Math.max(minSize, Math.floor(width * ratio));

  // Helper to get pixel index
  const getIndex = (x: number, y: number) => (y * width + x) * 4;

  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const xEnd = Math.min(x + size, width);
      const yEnd = Math.min(y + size, height);
      
      // Determine split direction to create a mesh/diamond pattern
      // Even row+col or Odd row+col -> Diagonal \
      // Mixed -> Diagonal /
      const isEvenRow = Math.floor(y / size) % 2 === 0;
      const isEvenCol = Math.floor(x / size) % 2 === 0;
      const diagonal = (isEvenRow === isEvenCol); 
      
      let r1 = 0, g1 = 0, b1 = 0, c1 = 0;
      let r2 = 0, g2 = 0, b2 = 0, c2 = 0;
      
      // Pass 1: Calculate Average Colors
      for (let py = y; py < yEnd; py++) {
        for (let px = x; px < xEnd; px++) {
          const idx = getIndex(px, py);
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          let inTriangle1 = false;
          const dx = (px - x) / size;
          const dy = (py - y) / size;

          if (diagonal) { // Diagonal: \
             // Bottom-Left vs Top-Right
             inTriangle1 = dx < dy; 
          } else { // Diagonal: /
             // Top-Left vs Bottom-Right
             inTriangle1 = dx + dy < 1; 
          }
          
          if (inTriangle1) {
            r1 += r; g1 += g; b1 += b; c1++;
          } else {
            r2 += r; g2 += g; b2 += b; c2++;
          }
        }
      }
      
      if (c1 > 0) { r1 = Math.round(r1 / c1); g1 = Math.round(g1 / c1); b1 = Math.round(b1 / c1); }
      if (c2 > 0) { r2 = Math.round(r2 / c2); g2 = Math.round(g2 / c2); b2 = Math.round(b2 / c2); }
      
      // Pass 2: Fill Triangles
      for (let py = y; py < yEnd; py++) {
        for (let px = x; px < xEnd; px++) {
          const idx = getIndex(px, py);
          
          let inTriangle1 = false;
          const dx = (px - x) / size;
          const dy = (py - y) / size;

          if (diagonal) {
             inTriangle1 = dx < dy;
          } else {
             inTriangle1 = dx + dy < 1;
          }
          
          if (inTriangle1) {
            data[idx] = r1;
            data[idx + 1] = g1;
            data[idx + 2] = b1;
          } else {
            data[idx] = r2;
            data[idx + 1] = g2;
            data[idx + 2] = b2;
          }
        }
      }
    }
  }
};
