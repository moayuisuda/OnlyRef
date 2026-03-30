import path from "path";
import { getDominantColor, calculateTone } from "./backend/imageAnalysis";

async function main() {
  const imagePath = path.resolve("resources/icon.png");
  console.log("Testing with:", imagePath);
  
  try {
    const color = await getDominantColor(imagePath);
    console.log("Dominant Color:", color);
  } catch (e) {
    console.error("Color Error:", e);
  }

  try {
    const tone = await calculateTone(imagePath);
    console.log("Tone:", tone);
  } catch (e) {
    console.error("Tone Error:", e);
  }
}

main();
