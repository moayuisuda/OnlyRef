import Konva from "konva";
import { TrianglePixelate } from "./customFilters";

export type FilterType = "grayscale" | "posterize" | "trianglePixelate";

export interface FilterConfig {
  id: FilterType;
  name: string; // Display name key for i18n
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  konvaFilters: any[]; // List of Konva Filter objects
  config?: Record<string, number | string | boolean>; // Default config for the filter
}

export const AVAILABLE_FILTERS: FilterConfig[] = [
  {
    id: "grayscale",
    name: "canvas.filters.grayscale",
    konvaFilters: [Konva.Filters.Grayscale],
  },
  {
    id: "trianglePixelate",
    name: "canvas.filters.trianglePixelate",
    konvaFilters: [TrianglePixelate],
    config: {
      pixelRatio: 0.05, // Default triangle size as 5% of image width
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getKonvaFilters = (filterIds: string[]): any[] => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = [];

  const uniqueIds = Array.from(new Set(filterIds));

  uniqueIds.forEach((id) => {
    const filterConfig = AVAILABLE_FILTERS.find((f) => f.id === id);
    if (filterConfig) {
      filters.push(...filterConfig.konvaFilters);
    }
  });

  return filters;
};

export const applyFilterConfigs = (node: Konva.Image, filterIds: string[]) => {
  filterIds.forEach((id) => {
    const config = AVAILABLE_FILTERS.find((f) => f.id === id)?.config;
    if (config) {
      Object.entries(config).forEach(([key, value]) => {
        node.setAttr(key, value);
      });
    }
  });
};
