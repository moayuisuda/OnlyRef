export const OPEN_TAG_COLOR_PICKER = "open-tag-color-picker" as const;
export const CANVAS_AUTO_LAYOUT = "canvas-auto-layout" as const;

export type OpenTagColorPickerDetail = {
  tag: string;
  x: number;
  y: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isOpenTagColorPickerDetail = (
  detail: unknown
): detail is OpenTagColorPickerDetail => {
  if (!isRecord(detail)) return false;
  return (
    typeof detail.tag === "string" &&
    typeof detail.x === "number" &&
    typeof detail.y === "number"
  );
};

export const emitOpenTagColorPicker = (detail: OpenTagColorPickerDetail) => {
  window.dispatchEvent(
    new CustomEvent<OpenTagColorPickerDetail>(OPEN_TAG_COLOR_PICKER, { detail })
  );
};

export const onOpenTagColorPicker = (
  handler: (detail: OpenTagColorPickerDetail) => void
) => {
  const listener = (e: Event) => {
    if (!(e instanceof CustomEvent)) return;
    if (!isOpenTagColorPickerDetail((e as CustomEvent).detail)) return;
    handler((e as CustomEvent<OpenTagColorPickerDetail>).detail);
  };
  window.addEventListener(OPEN_TAG_COLOR_PICKER, listener);
  return () => window.removeEventListener(OPEN_TAG_COLOR_PICKER, listener);
};
