const DEFAULT_API_BASE_URL = "http://localhost:30003";
const DEFAULT_WINDOW_TYPE = "main";

const getRuntimeApiBaseUrl = () => {
  if (typeof window === "undefined") {
    return DEFAULT_API_BASE_URL;
  }

  try {
    const value = new URL(window.location.href).searchParams.get("apiBaseUrl");
    if (value) {
      return value;
    }
  } catch {
    // ignore and fallback to default
  }

  return DEFAULT_API_BASE_URL;
};

export const API_BASE_URL = getRuntimeApiBaseUrl();

export const getRuntimeWindowType = () => {
  if (typeof window === "undefined") {
    return DEFAULT_WINDOW_TYPE;
  }

  try {
    return (
      new URL(window.location.href).searchParams.get("windowType") ||
      DEFAULT_WINDOW_TYPE
    );
  } catch {
    return DEFAULT_WINDOW_TYPE;
  }
};
