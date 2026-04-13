const PINTEREST_SIZE_SEGMENT_RE = /^\d+x\d*$/i;
const X_IMAGE_HOSTNAME = "pbs.twimg.com";

export const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const normalizePinterestImageUrl = (parsed: URL): void => {
  if (!parsed.hostname.toLowerCase().endsWith("pinimg.com")) {
    return;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 5 || segments[0] === "originals") {
    return;
  }

  if (PINTEREST_SIZE_SEGMENT_RE.test(segments[0])) {
    segments[0] = "originals";
    parsed.pathname = `/${segments.join("/")}`;
  }
};

const normalizeXImageUrl = (parsed: URL): void => {
  if (parsed.hostname.toLowerCase() !== X_IMAGE_HOSTNAME) {
    return;
  }

  const size = parsed.searchParams.get("name")?.trim().toLowerCase();
  if (!size || size === "orig") {
    return;
  }

  // x.com drag-and-drop often yields a pbs.twimg.com thumbnail URL.
  parsed.searchParams.set("name", "orig");
};

export const normalizeDroppedImageUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    normalizePinterestImageUrl(parsed);
    normalizeXImageUrl(parsed);

    return parsed.toString();
  } catch {
    return value;
  }
};

const pickHttpUrl = (values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && isHttpUrl(trimmed)) {
      return normalizeDroppedImageUrl(trimmed);
    }
  }
  return null;
};

const parseSrcSet = (value: string | null): string | null => {
  if (!value) return null;

  const candidates = value
    .split(",")
    .map((item, index) => {
      const [url = "", descriptor = ""] = item.trim().split(/\s+/, 2);
      const width = Number(descriptor.match(/^(\d+)w$/i)?.[1] ?? 0);
      const density = Number(descriptor.match(/^(\d+(?:\.\d+)?)x$/i)?.[1] ?? 0);
      return {
        url,
        width,
        density,
        index,
      };
    })
    .filter((item) => isHttpUrl(item.url))
    .sort((a, b) => {
      if (b.width !== a.width) return b.width - a.width;
      if (b.density !== a.density) return b.density - a.density;
      return b.index - a.index;
    });

  if (candidates.length === 0) {
    return null;
  }

  return normalizeDroppedImageUrl(candidates[0].url);
};

const extractImageUrlFromHtml = (html: string): string | null => {
  const trimmed = html.trim();
  if (!trimmed) return null;

  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));
  for (const image of images) {
    const url = pickHttpUrl([
      image.getAttribute("data-original"),
      image.getAttribute("data-lazy-src"),
      parseSrcSet(image.getAttribute("srcset")),
      image.currentSrc,
      image.getAttribute("data-src"),
      image.getAttribute("src"),
    ]);
    if (url) {
      return url;
    }
  }

  return null;
};

const extractHttpUrlFromText = (value: string): string | null => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const directUrl = pickHttpUrl(lines);
  if (directUrl) {
    return directUrl;
  }

  for (const line of lines) {
    const matched = line.match(/https?:\/\/\S+/i)?.[0];
    if (matched && isHttpUrl(matched)) {
      return normalizeDroppedImageUrl(matched);
    }
  }

  return null;
};

export const extractDroppedImageUrl = (dataTransfer: DataTransfer): string | null => {
  const htmlUrl = extractImageUrlFromHtml(dataTransfer.getData("text/html"));
  if (htmlUrl) {
    return htmlUrl;
  }

  return (
    extractHttpUrlFromText(dataTransfer.getData("text/uri-list")) ??
    extractHttpUrlFromText(dataTransfer.getData("text/plain"))
  );
};
