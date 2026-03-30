import type { LLMSettings } from "./store/globalStore";

export interface LLMResponse {
  translation?: string;
  error?: string;
}

export type LLMRequestOptions = {
  signal?: AbortSignal;
};

export const translateToClipFriendly = async (
  query: string,
  settings: LLMSettings,
  options: LLMRequestOptions = {},
): Promise<string> => {
  if (
    !settings.enabled ||
    !settings.baseUrl ||
    !settings.key ||
    !settings.model
  ) {
    return query;
  }

  try {
    let url = settings.baseUrl;
    if (
      !url.endsWith("/v1/chat/completions") &&
      !url.endsWith("/chat/completions")
    ) {
      // If it doesn't look like a full path, append /chat/completions
      // This is a heuristic.
      url = url.replace(/\/+$/, "") + "/chat/completions";
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.key}`,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: settings.model,
        thinking: {
          type: "disabled",
        },
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that translates user search queries into CLIP-friendly English prompts. Keep it concise, descriptive, and focused on visual elements. Only output the translated text, no explanations.",
          },
          {
            role: "user",
            content: `Translate the following search query to a CLIP-friendly English prompt: "${query}"`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error(
        "LLM request failed:",
        response.status,
        response.statusText,
      );
      throw new Error(
        `Request failed with status ${response.status}: ${response.statusText}`,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (content) {
      // Remove quotes if present
      return content.replace(/^["']|["']$/g, "");
    }

    return query;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
    ) {
      throw error;
    }
    console.error("LLM translation error:", error);
    throw error;
  }
};
