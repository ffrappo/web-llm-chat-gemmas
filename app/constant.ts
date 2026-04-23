import { ModelRecord } from "./client/api";

export const OWNER = "fornacestudio";
export const REPO = "gemmas";
export const HOME_URL = "https://fornacestudio.com";
export const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
export const ISSUE_URL = `https://github.com/${OWNER}/${REPO}/issues`;

export enum Path {
  Home = "/",
  Chat = "/chat",
  Settings = "/settings",
  Templates = "/templates",
}

export enum ApiPath {
  Cors = "",
}

export enum SlotID {
  AppBody = "app-body",
  CustomModel = "custom-model",
}

export enum FileName {
  Templates = "templates.json",
  Prompts = "prompts.json",
}

export enum StoreKey {
  Chat = "chat-next-web-store",
  Access = "access-control",
  Config = "app-config",
  Templates = "templates-store",
  Prompt = "prompt-store",
  Update = "chat-update",
  Sync = "sync",
}

export const DEFAULT_SIDEBAR_WIDTH = 320;
export const MAX_SIDEBAR_WIDTH = 500;
export const MIN_SIDEBAR_WIDTH = 260;
export const NARROW_SIDEBAR_WIDTH = 100;

export const ACCESS_CODE_PREFIX = "nk-";

export const LAST_INPUT_KEY = "last-input";
export const UNFINISHED_INPUT = (name: string) => "unfinished-input-" + name;

export const STORAGE_KEY = "gemmas";

export const REQUEST_TIMEOUT_MS = 60000;

export const EXPORT_MESSAGE_CLASS_NAME = "export-markdown";

export const DEFAULT_INPUT_TEMPLATE = `{{input}}`; // input / time / model / lang

export const DEFAULT_SYSTEM_TEMPLATE = `
You are an AI large language model assistant trained by {{provider}}.
Model display_name:  {{model}}
The current date and time is {{time}}.
Latex inline format: \\(x^2\\)
Latex block format: $$e=mc^2$$
`;

export enum ModelFamily {
  LLAMA = "llama",
  PHI = "phi",
  MISTRAL = "mistral",
  GEMMA = "gemma",
  QWEN = "qwen",
  SMOL_LM = "smollm",
  WIZARD_MATH = "wizardmath",
  STABLE_LM = "stablelm",
  REDPAJAMA = "redpajama",
  DEEPSEEK = "DeepSeek",
}

const qwen3_common_configs = {
  display_name: "Qwen",
  provider: "Alibaba",
  family: ModelFamily.QWEN,
  // Recommended config is for non-thinking mode.
  recommended_config: {
    temperature: 0.7,
    presence_penalty: 0,
    frequency_penalty: 0,
    top_p: 0.8,
  },
};

export const GEMMA4_MODEL_REPO = "onnx-community/gemma-4-E2B-it-ONNX";
export const GEMMA4_MODEL_WEIGHTS_REVISION =
  "5f09dcfb04eddbc9d8e2ebd8a0bf5250d048c79e";
export const GEMMA4_MODEL_REVISION = "ee1a73e8f4cb9aab6c7165231bf7e8e6331051cc";
export const GEMMA4_MODEL_CACHE_VERSION = "onnx-ree1a73e";
export const GEMMA4_MODEL_ID = `gemma-4-E2B-it-ONNX-${GEMMA4_MODEL_CACHE_VERSION}`;
export const DEFAULT_MODEL_ID = GEMMA4_MODEL_ID;

const GEMMA4_PRESET_BASE = {
  context_window_size: 16384,
  max_tokens: 4000,
  top_k: 64,
  do_sample: true,
  presence_penalty: 0,
  frequency_penalty: 0,
  stream: true,
  ignore_eos: false,
} as const;

export const GEMMA4_PEAK_PRESET = {
  ...GEMMA4_PRESET_BASE,
  temperature: 1.1,
  top_p: 0.98,
  top_k: 96,
  repetition_penalty: 1.02,
} as const;

export const GEMMA4_STABLE_PRESET = {
  ...GEMMA4_PRESET_BASE,
  temperature: 1.0,
  top_p: 0.95,
  top_k: 64,
  repetition_penalty: 1.05,
} as const;

export const GEMMA4_BENCH_PRESET = {
  ...GEMMA4_STABLE_PRESET,
  context_window_size: 4096,
  max_tokens: 256,
} as const;

export function resolveCurrentModelId(modelId?: string | null) {
  return modelId || DEFAULT_MODEL_ID;
}

const MODEL_RUNTIME = {
  [GEMMA4_MODEL_ID]: {
    repo: GEMMA4_MODEL_REPO,
    revision: GEMMA4_MODEL_WEIGHTS_REVISION,
    processor_revision: GEMMA4_MODEL_REVISION,
    device: "webgpu",
    dtype: "q4f16",
    supports_images: true,
    supports_audio: true,
    max_context_window: 131072,
  },
} as const;

export function getModelRuntime(modelId?: string | null) {
  const currentModelId = resolveCurrentModelId(modelId);
  return MODEL_RUNTIME[currentModelId as keyof typeof MODEL_RUNTIME];
}

const DEFAULT_MODEL_BASES: ModelRecord[] = [
  // Phi-3.5 Vision
  {
    name: "Phi-3.5-vision-instruct-q4f32_1-MLC",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Phi-3.5-vision-instruct-q4f16_1-MLC",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  // Llama-3.2
  {
    name: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3.2-1B-Instruct-q0f32-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3.2-1B-Instruct-q0f16-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  // Llama-3.1 8B
  {
    name: "Llama-3.1-8B-Instruct-q4f32_1-MLC-1k",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3.1-8B-Instruct-q4f16_1-MLC-1k",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  // Deepseek
  {
    name: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC",
    display_name: "DeepSeek",
    provider: "DeepSeek",
    family: ModelFamily.DEEPSEEK,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "DeepSeek-R1-Distill-Qwen-7B-q4f32_1-MLC",
    display_name: "DeepSeek",
    provider: "DeepSeek",
    family: ModelFamily.DEEPSEEK,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "DeepSeek-R1-Distill-Llama-8B-q4f32_1-MLC",
    display_name: "DeepSeek",
    provider: "DeepSeek",
    family: ModelFamily.DEEPSEEK,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC",
    display_name: "DeepSeek",
    provider: "DeepSeek",
    family: ModelFamily.DEEPSEEK,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  // Hermes
  {
    name: "Hermes-3-Llama-3.2-3B-q4f32_1-MLC",
    display_name: "Hermes",
    provider: "NousResearch",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
    display_name: "Hermes",
    provider: "NousResearch",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Hermes-3-Llama-3.1-8B-q4f32_1-MLC",
    display_name: "Hermes",
    provider: "NousResearch",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
    display_name: "Hermes",
    provider: "NousResearch",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC",
    display_name: "Hermes",
    provider: "NousResearch",
    family: ModelFamily.MISTRAL,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.95,
    },
  },
  {
    name: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
    display_name: "Hermes",
    provider: "NousResearch",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC",
    display_name: "Hermes",
    provider: "NousResearch",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  // Phi
  {
    name: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Phi-3.5-mini-instruct-q4f32_1-MLC",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Phi-3.5-mini-instruct-q4f16_1-MLC-1k",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Phi-3.5-mini-instruct-q4f32_1-MLC-1k",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  // Mistral
  {
    name: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
    display_name: "Mistral",
    provider: "Mistral AI",
    family: ModelFamily.MISTRAL,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Mistral-7B-Instruct-v0.3-q4f32_1-MLC",
    display_name: "Mistral",
    provider: "Mistral AI",
    family: ModelFamily.MISTRAL,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Mistral-7B-Instruct-v0.2-q4f16_1-MLC",
    display_name: "Mistral",
    provider: "Mistral AI",
    family: ModelFamily.MISTRAL,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "OpenHermes-2.5-Mistral-7B-q4f16_1-MLC",
    display_name: "OpenHermes",
    provider: "NousResearch",
    family: ModelFamily.MISTRAL,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC",
    display_name: "NeuralHermes",
    provider: "Maxime Labonne",
    family: ModelFamily.MISTRAL,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  // WizardMath
  {
    name: "WizardMath-7B-V1.1-q4f16_1-MLC",
    display_name: "WizardMath",
    provider: "WizardLM",
    family: ModelFamily.WIZARD_MATH,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  // SmolLM2
  {
    name: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
    display_name: "SmolLM",
    provider: "HuggingFaceTB",
    family: ModelFamily.SMOL_LM,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "SmolLM2-1.7B-Instruct-q4f32_1-MLC",
    display_name: "SmolLM",
    provider: "HuggingFaceTB",
    family: ModelFamily.SMOL_LM,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "SmolLM2-360M-Instruct-q0f16-MLC",
    display_name: "SmolLM",
    provider: "HuggingFaceTB",
    family: ModelFamily.SMOL_LM,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "SmolLM2-360M-Instruct-q0f32-MLC",
    display_name: "SmolLM",
    provider: "HuggingFaceTB",
    family: ModelFamily.SMOL_LM,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    display_name: "SmolLM",
    provider: "HuggingFaceTB",
    family: ModelFamily.SMOL_LM,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "SmolLM2-360M-Instruct-q4f32_1-MLC",
    display_name: "SmolLM",
    provider: "HuggingFaceTB",
    family: ModelFamily.SMOL_LM,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "SmolLM2-135M-Instruct-q0f16-MLC",
    display_name: "SmolLM",
    provider: "HuggingFaceTB",
    family: ModelFamily.SMOL_LM,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "SmolLM2-135M-Instruct-q0f32-MLC",
    display_name: "SmolLM",
    provider: "HuggingFaceTB",
    family: ModelFamily.SMOL_LM,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  // Qwen3
  {
    name: "Qwen3-0.6B-q4f16_1-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-0.6B-q4f32_1-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-0.6B-q0f16-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-0.6B-q0f32-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-1.7B-q4f16_1-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-1.7B-q4f32_1-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-4B-q4f16_1-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-4B-q4f32_1-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-8B-q4f16_1-MLC",
    ...qwen3_common_configs,
  },
  {
    name: "Qwen3-8B-q4f32_1-MLC",
    ...qwen3_common_configs,
  },
  // Qwen2.5
  {
    name: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-0.5B-Instruct-q0f16-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-0.5B-Instruct-q0f32-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-3B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-7B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-7B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  // Qwen2.5-Coder
  {
    name: "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-Coder-0.5B-Instruct-q0f16-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-Coder-0.5B-Instruct-q0f32-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 1.0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1.0,
    },
  },
  {
    name: "Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 1.0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1.0,
    },
  },
  {
    name: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-Coder-3B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 1.0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1.0,
    },
  },
  {
    name: "Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 1.0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1.0,
    },
  },
  // Qwen2-Math
  {
    name: "Qwen2-Math-1.5B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 1.0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-Math-1.5B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 1.0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-Math-7B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-Math-7B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  // Gemma 4
  {
    name: GEMMA4_MODEL_ID,
    display_name: "Gemma 4",
    provider: "Google",
    family: ModelFamily.GEMMA,
    hf_model_id: GEMMA4_MODEL_REPO,
    hf_revision: GEMMA4_MODEL_REVISION,
    preferred_device: "webgpu",
    preferred_dtype: "q4f16",
    supports_images: true,
    supports_audio: true,
    max_context_window: 131072,
    recommended_config: GEMMA4_STABLE_PRESET,
  },
  // Gemma 2
  {
    name: "gemma-2-2b-it-q4f16_1-MLC",
    display_name: "Gemma",
    provider: "Google",
    family: ModelFamily.GEMMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 1,
      top_p: 0.95,
    },
  },
  {
    name: "gemma-2-2b-it-q4f32_1-MLC",
    display_name: "Gemma",
    provider: "Google",
    family: ModelFamily.GEMMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 1,
      top_p: 0.95,
    },
  },
  {
    name: "gemma-2-2b-it-q4f16_1-MLC-1k",
    display_name: "Gemma",
    provider: "Google",
    family: ModelFamily.GEMMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 1,
      top_p: 0.95,
    },
  },
  {
    name: "gemma-2-2b-it-q4f32_1-MLC-1k",
    display_name: "Gemma",
    provider: "Google",
    family: ModelFamily.GEMMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 1,
      top_p: 0.95,
    },
  },
  {
    name: "gemma-2-9b-it-q4f16_1-MLC",
    display_name: "Gemma",
    provider: "Google",
    family: ModelFamily.GEMMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 1,
      top_p: 0.95,
    },
  },
  {
    name: "gemma-2-9b-it-q4f32_1-MLC",
    display_name: "Gemma",
    provider: "Google",
    family: ModelFamily.GEMMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 1,
      top_p: 0.95,
    },
  },
  {
    name: "gemma-2-2b-jpn-it-q4f16_1-MLC",
    display_name: "Gemma",
    provider: "Google",
    family: ModelFamily.GEMMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 1,
      top_p: 0.9,
    },
  },
  {
    name: "gemma-2-2b-jpn-it-q4f32_1-MLC",
    display_name: "Gemma",
    provider: "Google",
    family: ModelFamily.GEMMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 1,
      top_p: 0.9,
    },
  },
  // StableLM
  {
    name: "stablelm-2-zephyr-1_6b-q4f16_1-MLC",
    display_name: "StableLM",
    provider: "Hugging Face",
    family: ModelFamily.STABLE_LM,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.95,
    },
  },
  {
    name: "stablelm-2-zephyr-1_6b-q4f32_1-MLC",
    display_name: "StableLM",
    provider: "Hugging Face",
    family: ModelFamily.STABLE_LM,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.95,
    },
  },
  {
    name: "stablelm-2-zephyr-1_6b-q4f16_1-MLC-1k",
    display_name: "StableLM",
    provider: "Hugging Face",
    family: ModelFamily.STABLE_LM,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.95,
    },
  },
  {
    name: "stablelm-2-zephyr-1_6b-q4f32_1-MLC-1k",
    display_name: "StableLM",
    provider: "Hugging Face",
    family: ModelFamily.STABLE_LM,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.95,
    },
  },
  // RedPajama
  {
    name: "RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC",
    display_name: "RedPajama",
    provider: "Together",
    family: ModelFamily.REDPAJAMA,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC",
    display_name: "RedPajama",
    provider: "Together",
    family: ModelFamily.REDPAJAMA,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC-1k",
    display_name: "RedPajama",
    provider: "Together",
    family: ModelFamily.REDPAJAMA,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC-1k",
    display_name: "RedPajama",
    provider: "Together",
    family: ModelFamily.REDPAJAMA,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  // TinyLlama
  {
    name: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
    display_name: "TinyLlama",
    provider: "Zhang Peiyuan",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC",
    display_name: "TinyLlama",
    provider: "Zhang Peiyuan",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC-1k",
    display_name: "TinyLlama",
    provider: "Zhang Peiyuan",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC-1k",
    display_name: "TinyLlama",
    provider: "Zhang Peiyuan",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  // Older models
  {
    name: "Llama-3.1-70B-Instruct-q3f16_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-0.5B-Instruct-q0f16-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-0.5B-Instruct-q0f32-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-1.5B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-1.5B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-7B-Instruct-q4f16_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Qwen2-7B-Instruct-q4f32_1-MLC",
    display_name: "Qwen",
    provider: "Alibaba",
    family: ModelFamily.QWEN,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.8,
    },
  },
  {
    name: "Llama-3-8B-Instruct-q4f32_1-MLC-1k",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3-8B-Instruct-q4f16_1-MLC-1k",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3-8B-Instruct-q4f32_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3-8B-Instruct-q4f16_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-3-70B-Instruct-q3f16_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.95,
    },
  },
  // Phi3-mini-instruct
  {
    name: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    display_name: "Phi 3",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Phi-3-mini-4k-instruct-q4f32_1-MLC",
    display_name: "Phi 3",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k",
    display_name: "Phi 3",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Phi-3-mini-4k-instruct-q4f32_1-MLC-1k",
    display_name: "Phi 3",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    },
  },
  {
    name: "Llama-2-7b-chat-hf-q4f32_1-MLC-1k",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-2-7b-chat-hf-q4f16_1-MLC-1k",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-2-7b-chat-hf-q4f32_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-2-7b-chat-hf-q4f16_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      top_p: 0.9,
    },
  },
  {
    name: "Llama-2-13b-chat-hf-q4f16_1-MLC",
    display_name: "Llama",
    provider: "Meta",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.6,
      top_p: 0.9,
    },
  },
  {
    name: "phi-2-q4f16_1-MLC",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "phi-2-q4f32_1-MLC",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "phi-2-q4f16_1-MLC-1k",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "phi-2-q4f32_1-MLC-1k",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "phi-1_5-q4f16_1-MLC",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "phi-1_5-q4f32_1-MLC",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "phi-1_5-q4f16_1-MLC-1k",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "phi-1_5-q4f32_1-MLC-1k",
    display_name: "Phi",
    provider: "Microsoft",
    family: ModelFamily.PHI,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC",
    display_name: "TinyLlama",
    provider: "Zhang Peiyuan",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC",
    display_name: "TinyLlama",
    provider: "Zhang Peiyuan",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC-1k",
    display_name: "TinyLlama",
    provider: "Zhang Peiyuan",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    name: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k",
    display_name: "TinyLlama",
    provider: "Zhang Peiyuan",
    family: ModelFamily.LLAMA,
    recommended_config: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
];

const ENABLED_MODEL_IDS = new Set(Object.keys(MODEL_RUNTIME));

function getModelSize(model_id: string): string | undefined {
  const sizeRegex = /-((?:E)?\d+(?:\.\d+)?[BK])-?/i;
  const match = model_id.match(sizeRegex);
  return match?.[1];
}

function getModelQuantization(model_id: string): string | undefined {
  const quantizationRegex = /-(q[0-9]f[0-9]+(?:_[0-9])?)-/;
  const match = model_id.match(quantizationRegex);
  return match?.[1];
}

const AVAILABLE_DEFAULT_MODELS: ModelRecord[] = DEFAULT_MODEL_BASES.filter(
  (model) => ENABLED_MODEL_IDS.has(model.name),
).map((model) => ({
  ...model,
  size: getModelSize(model.name),
  quantization: getModelQuantization(model.name),
}));

export const DEFAULT_MODELS: ModelRecord[] = [
  ...AVAILABLE_DEFAULT_MODELS.filter(
    (model) => model.name === DEFAULT_MODEL_ID,
  ),
  ...AVAILABLE_DEFAULT_MODELS.filter(
    (model) => model.name !== DEFAULT_MODEL_ID,
  ),
];

export const DEFAULT_MODEL =
  DEFAULT_MODELS.find((model) => model.name === DEFAULT_MODEL_ID)?.name ??
  DEFAULT_MODELS[0].name;

export const CHAT_PAGE_SIZE = 15;
export const MAX_RENDER_MSG_COUNT = 45;

export const LOG_LEVELS = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  SILENT: 5,
};
