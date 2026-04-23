import { CacheType, Model } from "../store";
import { ModelFamily } from "../constant";

export const LOG_LEVEL_NAMES = [
  "TRACE",
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "SILENT",
] as const;

export type LogLevel = (typeof LOG_LEVEL_NAMES)[number];

export type ChatCompletionFinishReason = "stop" | "length" | "abort" | "error";

export interface CompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  extra?: {
    prefill_tokens_per_s?: number;
    decode_tokens_per_s?: number;
    seconds_to_first_token?: number;
    generation_seconds?: number;
  };
}

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

export const Models = ["gpt-3.5-turbo", "gpt-4"] as const;
export type ChatModel = Model;

export interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
  dimension?: {
    width: number;
    height: number;
  };
}

export interface RequestMessage {
  role: MessageRole;
  content: string | MultimodalContent[];
}

export interface LLMConfig {
  model: string;
  cache: CacheType;
  temperature?: number;
  context_window_size?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  stream?: boolean;
  do_sample?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  repetition_penalty?: number;
  ignore_eos?: boolean;
  seed?: number | null;
  enable_thinking?: boolean;
}

export interface ChatOptions {
  messages: RequestMessage[];
  config: LLMConfig;

  onUpdate?: (message: string, chunk: string) => void;
  onFinish: (
    message: string,
    stopReason?: ChatCompletionFinishReason,
    usage?: CompletionUsage,
  ) => void;
  onError?: (err: string | Error) => void;
}

export interface LLMUsage {
  used: number;
  total: number;
}

export interface ModelRecord {
  name: string;
  display_name: string;
  provider?: string;
  size?: string;
  quantization?: string;
  family: ModelFamily;
  hf_model_id?: string;
  hf_revision?: string;
  preferred_device?: "webgpu" | "webnn" | "wasm";
  preferred_dtype?: "auto" | "fp16" | "fp32" | "q4" | "q4f16" | "q8";
  supports_images?: boolean;
  supports_audio?: boolean;
  max_context_window?: number;
  recommended_config?: {
    temperature?: number;
    context_window_size?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
    do_sample?: boolean;
    presence_penalty?: number;
    frequency_penalty?: number;
    repetition_penalty?: number;
    stream?: boolean;
    ignore_eos?: boolean;
  };
}

export abstract class LLMApi {
  abstract chat(options: ChatOptions): Promise<void>;
  abstract abort(): Promise<void>;
  abstract models(): Promise<ModelRecord[] | Model[]>;
  isInitializing?(): boolean;
}
