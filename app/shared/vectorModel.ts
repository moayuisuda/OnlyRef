export const VECTOR_MODEL_DIR_NAME = "siglip2-base-patch16-224";

export const VECTOR_MODEL_REQUIRED_FILES = [
  "config.json",
  "model.safetensors",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer_config.json",
  "tokenizer.json",
  "tokenizer.model",
] as const;
