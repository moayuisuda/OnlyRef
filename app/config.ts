const DEFAULT_API_BASE_URL = "http://localhost:30003";

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
