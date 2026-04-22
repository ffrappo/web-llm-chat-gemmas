"use client";

import log from "loglevel";
import {
  InitProgressReport,
  ChatCompletionMessageParam,
  ServiceWorkerMLCEngine,
  ChatCompletionChunk,
  ChatCompletion,
  WebWorkerMLCEngine,
  CompletionUsage,
  ChatCompletionFinishReason,
  hasModelInCache,
} from "@mlc-ai/web-llm";

import { ChatOptions, LLMApi, LLMConfig, RequestMessage } from "./api";
import { LogLevel } from "@mlc-ai/web-llm";
import { fixMessage } from "../utils";
import { DEFAULT_MODELS, WEBLLM_APP_CONFIG } from "../constant";
import { formatErrorMessage } from "../utils/error";

const KEEP_ALIVE_INTERVAL = 5_000;

export type WebLLMPreloadPhase =
  | "checkingCache"
  | "preparingRuntime"
  | "requestingGpu"
  | "fetchingModelFiles"
  | "loadingModel"
  | "compilingShaders"
  | "finalizing"
  | "ready";

export type WebLLMPreloadProgress = {
  cached: boolean | null;
  model: string;
  phase: WebLLMPreloadPhase;
  progress: number;
  phaseProgress: number;
  text: string;
  timeElapsed: number;
};

const PRELOAD_PHASE_PROGRESS: Record<
  WebLLMPreloadPhase,
  readonly [number, number]
> = {
  checkingCache: [0, 0.05],
  preparingRuntime: [0.05, 0.14],
  requestingGpu: [0.14, 0.24],
  fetchingModelFiles: [0.24, 0.72],
  loadingModel: [0.72, 0.9],
  compilingShaders: [0.9, 0.98],
  finalizing: [0.98, 1],
  ready: [1, 1],
};

function normalizeUnitProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  const normalized = progress > 1 ? progress / 100 : progress;
  return Math.min(1, Math.max(0, normalized));
}

function getOverallPreloadProgress(
  phase: WebLLMPreloadPhase,
  phaseProgress: number,
) {
  const [start, end] = PRELOAD_PHASE_PROGRESS[phase];
  return start + (end - start) * normalizeUnitProgress(phaseProgress);
}

function inferPreloadPhase(
  text: string,
  fallbackPhase: WebLLMPreloadPhase,
): WebLLMPreloadPhase {
  const normalized = text.trim().toLowerCase();

  if (
    normalized.startsWith("start to fetch params") ||
    normalized.startsWith("fetching param cache[")
  ) {
    return "fetchingModelFiles";
  }

  if (normalized.startsWith("loading model from cache[")) {
    return "loadingModel";
  }

  if (normalized.startsWith("loading gpu shader modules[")) {
    return "compilingShaders";
  }

  if (normalized.startsWith("finish loading on ")) {
    return "finalizing";
  }

  return fallbackPhase;
}

function formatPreloadText(
  text: string,
  phase: WebLLMPreloadPhase,
  cached: boolean | null,
) {
  const normalized = text.trim();

  if (
    phase === "fetchingModelFiles" &&
    normalized === "Start to fetch params"
  ) {
    return cached
      ? "Preparing model files from browser storage."
      : "Starting model file transfer into browser storage.";
  }

  return normalized
    .replace(/^Fetching param cache\[/, "Fetching model files [")
    .replace(/^Loading model from cache\[/, "Loading model into GPU [")
    .replace(/^Loading GPU shader modules\[/, "Compiling GPU shaders [")
    .replace(/completed/g, "complete")
    .replace(/secs elapsed/g, "s elapsed");
}

type ServiceWorkerWebLLMHandler = {
  type: "serviceWorker";
  engine: ServiceWorkerMLCEngine;
};

type WebWorkerWebLLMHandler = {
  type: "webWorker";
  engine: WebWorkerMLCEngine;
};

type WebLLMHandler = ServiceWorkerWebLLMHandler | WebWorkerWebLLMHandler;

export class WebLLMApi implements LLMApi {
  private llmConfig?: LLMConfig;
  private initialized = false;
  private initializing = false;
  private initPromise?: Promise<void>;
  private initPromiseKey?: string;
  onInitChange?: (initializing: boolean) => void;
  webllm: WebLLMHandler;

  isInitializing(): boolean {
    return this.initializing;
  }

  private setInitializing(value: boolean) {
    this.initializing = value;
    this.onInitChange?.(value);
  }

  private getAppConfig(cache = this.llmConfig?.cache) {
    return {
      ...WEBLLM_APP_CONFIG,
      useIndexedDBCache: cache === "index_db",
    };
  }

  constructor(
    type: "serviceWorker" | "webWorker",
    logLevel: LogLevel = "WARN",
  ) {
    const engineConfig = {
      appConfig: this.getAppConfig(),
      logLevel,
    };

    if (type === "serviceWorker") {
      log.info("Create ServiceWorkerMLCEngine");
      this.webllm = {
        type: "serviceWorker",
        engine: new ServiceWorkerMLCEngine(engineConfig, KEEP_ALIVE_INTERVAL),
      };
    } else {
      log.info("Create WebWorkerMLCEngine");
      this.webllm = {
        type: "webWorker",
        engine: new WebWorkerMLCEngine(
          new Worker(new URL("../worker/web-worker.ts", import.meta.url), {
            type: "module",
          }),
          engineConfig,
        ),
      };
    }
  }

  private getReloadKey(config: LLMConfig) {
    return JSON.stringify({
      model: config.model,
      cache: config.cache,
      temperature: config.temperature ?? null,
      context_window_size: config.context_window_size ?? null,
      top_p: config.top_p ?? null,
      presence_penalty: config.presence_penalty ?? null,
      frequency_penalty: config.frequency_penalty ?? null,
    });
  }

  private normalizeConfig(config: LLMConfig): LLMConfig {
    const nextConfig = { ...config };

    const isQwen3Model = nextConfig.model?.toLowerCase().startsWith("qwen3");
    const isThinkingEnabled = nextConfig.enable_thinking === true;

    if (isQwen3Model && isThinkingEnabled) {
      nextConfig.temperature = 0.6;
      nextConfig.top_p = 0.95;
    }

    return nextConfig;
  }

  private async initModel(
    config: LLMConfig,
    onUpdate?: (message: string, chunk: string) => void,
    onProgress?: (report: WebLLMPreloadProgress) => void,
  ) {
    const appConfig = this.getAppConfig(config.cache);
    let cached: boolean | null = null;
    let currentPhase: WebLLMPreloadPhase = "checkingCache";

    const emitProgress = (
      phase: WebLLMPreloadPhase,
      text: string,
      options?: {
        cached?: boolean | null;
        phaseProgress?: number;
        timeElapsed?: number;
      },
    ) => {
      currentPhase = phase;

      const resolvedCached = options?.cached ?? cached;
      const phaseProgress = normalizeUnitProgress(options?.phaseProgress ?? 0);
      const progress = {
        cached: resolvedCached,
        model: config.model,
        phase,
        progress: getOverallPreloadProgress(phase, phaseProgress),
        phaseProgress,
        timeElapsed: options?.timeElapsed ?? 0,
        text,
      };

      onUpdate?.(text, text);
      onProgress?.(progress);
    };

    emitProgress(
      "checkingCache",
      "Checking browser storage for an existing model copy.",
    );

    cached = await hasModelInCache(config.model, appConfig).catch(() => false);

    emitProgress(
      "preparingRuntime",
      cached
        ? "Cached model files found. Preparing runtime files and startup config."
        : "No cached model files found. Preparing runtime files before download begins.",
      {
        cached,
      },
    );

    this.webllm.engine.setAppConfig(appConfig);
    this.webllm.engine.setInitProgressCallback((report: InitProgressReport) => {
      const phase = inferPreloadPhase(report.text, currentPhase);
      const text = formatPreloadText(report.text, phase, cached);
      const progress = {
        cached,
        model: config.model,
        phase,
        progress: getOverallPreloadProgress(phase, report.progress),
        phaseProgress: normalizeUnitProgress(report.progress),
        timeElapsed: report.timeElapsed,
        text,
      };
      currentPhase = phase;
      onUpdate?.(text, text);
      onProgress?.(progress);
    });

    emitProgress(
      "requestingGpu",
      cached
        ? "Connecting to WebGPU and opening the cached model."
        : "Connecting to WebGPU and preparing the first model transfer.",
      {
        cached,
      },
    );

    await this.webllm.engine.reload(config.model, config);
    this.initialized = true;
  }

  private async ensureModelLoaded(
    config: LLMConfig,
    options?: {
      onUpdate?: (message: string, chunk: string) => void;
      onProgress?: (report: WebLLMPreloadProgress) => void;
    },
  ) {
    const nextConfig = this.normalizeConfig({
      ...(this.llmConfig || {}),
      ...config,
    });
    const nextReloadKey = this.getReloadKey(nextConfig);
    const needsReload = this.isDifferentConfig(nextConfig);

    this.llmConfig = nextConfig;

    if (!needsReload) {
      return;
    }

    if (this.initPromise && this.initPromiseKey === nextReloadKey) {
      await this.initPromise;
      return;
    }

    this.initialized = false;

    const initPromise = this.initModel(
      nextConfig,
      options?.onUpdate,
      options?.onProgress,
    );
    this.initPromise = initPromise;
    this.initPromiseKey = nextReloadKey;

    try {
      this.setInitializing(true);
      await initPromise;
    } finally {
      if (this.initPromise === initPromise) {
        this.initPromise = undefined;
        this.initPromiseKey = undefined;
      }
      this.setInitializing(false);
    }
  }

  async preload(
    config: LLMConfig,
    onProgress?: (report: WebLLMPreloadProgress) => void,
  ) {
    await this.ensureModelLoaded(config, { onProgress });
  }

  async chat(options: ChatOptions): Promise<void> {
    try {
      await this.ensureModelLoaded(options.config, {
        onUpdate: options.onUpdate,
      });
    } catch (err: any) {
      const errorMessage = formatErrorMessage(
        err,
        "Model initialization failed. Check the browser console for details.",
      );
      console.error("Error while initializing the model", err);
      options?.onError?.(errorMessage);
      return;
    }

    let reply: string | null = "";
    let stopReason: ChatCompletionFinishReason | undefined;
    let usage: CompletionUsage | undefined;
    try {
      const completion = await this.chatCompletion(
        !!options.config.stream,
        options.messages,
        options.onUpdate,
      );
      reply = completion.content;
      stopReason = completion.stopReason;
      usage = completion.usage;
    } catch (err: any) {
      let errorMessage = formatErrorMessage(
        err,
        "Chat completion failed. Check the browser console for details.",
      );
      console.error("Error in chatCompletion", err);
      if (
        errorMessage.includes("WebGPU") &&
        errorMessage.includes("compatibility chart")
      ) {
        // Add WebGPU compatibility chart link
        errorMessage = errorMessage.replace(
          "compatibility chart",
          "[compatibility chart](https://caniuse.com/webgpu)",
        );
      }
      options.onError?.(errorMessage);
      return;
    }

    if (reply) {
      reply = fixMessage(reply);
      options.onFinish(reply, stopReason, usage);
    } else {
      options.onError?.(new Error("Empty response generated by LLM"));
    }
  }

  async abort() {
    await this.webllm.engine?.interruptGenerate();
  }

  private isDifferentConfig(config: LLMConfig): boolean {
    if (!this.initialized || !this.llmConfig) {
      return true;
    }

    // Compare required fields
    if (this.llmConfig.model !== config.model) {
      return true;
    }

    if (this.llmConfig.cache !== config.cache) {
      return true;
    }

    // Compare optional fields
    const optionalFields: (keyof LLMConfig)[] = [
      "temperature",
      "context_window_size",
      "top_p",
      "presence_penalty",
      "frequency_penalty",
    ];

    for (const field of optionalFields) {
      if (
        this.llmConfig[field] !== undefined &&
        config[field] !== undefined &&
        this.llmConfig[field] !== config[field]
      ) {
        return true;
      }
    }

    return false;
  }

  async chatCompletion(
    stream: boolean,
    messages: RequestMessage[],
    onUpdate?: (
      message: string,
      chunk: string,
      usage?: CompletionUsage,
    ) => void,
  ) {
    // For Qwen3 models, we need to filter out the <think>...</think> content
    // Do not do it inplace, create a new messages array
    let newMessages: RequestMessage[] | undefined;
    const isQwen3Model = this.llmConfig?.model
      ?.toLowerCase()
      .startsWith("qwen3");
    if (isQwen3Model) {
      newMessages = messages.map((message) => {
        const newMessage = { ...message };
        if (
          message.role === "assistant" &&
          typeof message.content === "string"
        ) {
          newMessage.content = message.content.replace(
            /^<think>[\s\S]*?<\/think>\n?\n?/,
            "",
          );
        }
        return newMessage;
      });
    }

    // Prepare extra_body with enable_thinking option for Qwen3 models
    const extraBody: Record<string, any> = {};
    if (isQwen3Model) {
      extraBody.enable_thinking = this.llmConfig?.enable_thinking ?? false;
    }

    const completion = await this.webllm.engine.chatCompletion({
      stream: stream,
      messages: (newMessages || messages) as ChatCompletionMessageParam[],
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(Object.keys(extraBody).length > 0 ? { extra_body: extraBody } : {}),
    });

    if (stream) {
      let content: string | null = "";
      let stopReason: ChatCompletionFinishReason | undefined;
      let usage: CompletionUsage | undefined;
      const asyncGenerator = completion as AsyncIterable<ChatCompletionChunk>;
      for await (const chunk of asyncGenerator) {
        if (chunk.choices[0]?.delta.content) {
          content += chunk.choices[0].delta.content;
          onUpdate?.(content, chunk.choices[0].delta.content);
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }
        if (chunk.choices[0]?.finish_reason) {
          stopReason = chunk.choices[0].finish_reason;
        }
      }
      return { content, stopReason, usage };
    }

    const chatCompletion = completion as ChatCompletion;
    return {
      content: chatCompletion.choices[0].message.content,
      stopReason: chatCompletion.choices[0].finish_reason,
      usage: chatCompletion.usage,
    };
  }

  async models() {
    return DEFAULT_MODELS;
  }
}
