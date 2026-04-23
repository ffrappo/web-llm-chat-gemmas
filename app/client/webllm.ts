"use client";

import log from "loglevel";
import {
  ChatCompletionFinishReason,
  ChatOptions,
  CompletionUsage,
  LLMApi,
  LLMConfig,
  LogLevel,
} from "./api";
import {
  BrowserLLMPreloadPhase,
  BrowserLLMPreloadProgress,
  BrowserLLMWorkerRequest,
  BrowserLLMWorkerResponse,
} from "./browser-llm-protocol";
import { DEFAULT_MODELS, resolveCurrentModelId } from "../constant";
import { fixMessage } from "../utils";
import { formatErrorMessage } from "../utils/error";

export type WebLLMPreloadPhase = BrowserLLMPreloadPhase;
export type WebLLMPreloadProgress = BrowserLLMPreloadProgress;

type WorkerRequestPayload = BrowserLLMWorkerRequest extends infer T
  ? T extends { requestId: number }
    ? Omit<T, "requestId">
    : never
  : never;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: WebLLMPreloadProgress) => void;
  onStream?: (message: string, chunk: string, usage?: CompletionUsage) => void;
};

function hasVisibleContent(
  content: string | null | undefined,
): content is string {
  return typeof content === "string" && content.trim().length > 0;
}

export class WebLLMApi implements LLMApi {
  private worker: Worker;
  private llmConfig?: LLMConfig;
  private initialized = false;
  private initializing = false;
  private initPromise?: Promise<void>;
  private initPromiseKey?: string;
  private requestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private activeChatRequestId?: number;
  private abortedChatRequestIds = new Set<number>();

  onInitChange?: (initializing: boolean) => void;

  constructor(
    _type: "serviceWorker" | "webWorker" = "webWorker",
    logLevel: LogLevel = "WARN",
  ) {
    this.worker = new Worker(
      new URL("../worker/web-worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    this.worker.addEventListener("message", this.handleWorkerMessage);
    this.setLogLevel(logLevel).catch(() => undefined);
  }

  isInitializing(): boolean {
    return this.initializing;
  }

  setLogLevel(logLevel: LogLevel) {
    log.setLevel(logLevel.toLowerCase() as log.LogLevelDesc);
    return this.send<void>({
      kind: "setLogLevel",
      logLevel,
    });
  }

  private setInitializing(value: boolean) {
    this.initializing = value;
    this.onInitChange?.(value);
  }

  private handleWorkerMessage = (
    event: MessageEvent<BrowserLLMWorkerResponse>,
  ) => {
    const message = event.data;
    const pending = this.pendingRequests.get(message.requestId);

    if (!pending) {
      return;
    }

    switch (message.kind) {
      case "progress":
        pending.onProgress?.(message.progress);
        break;

      case "stream":
        pending.onStream?.(message.message, message.chunk, message.usage);
        break;

      case "ack":
        this.pendingRequests.delete(message.requestId);
        pending.resolve(undefined);
        break;

      case "result":
        this.pendingRequests.delete(message.requestId);
        if (this.abortedChatRequestIds.has(message.requestId)) {
          this.abortedChatRequestIds.delete(message.requestId);
          pending.reject(new Error("aborted"));
          return;
        }
        pending.resolve(message);
        break;

      case "error":
        this.pendingRequests.delete(message.requestId);
        this.abortedChatRequestIds.delete(message.requestId);
        pending.reject(new Error(message.error));
        break;
    }
  };

  private async send<TResult>(
    request: WorkerRequestPayload,
    handlers?: Pick<PendingRequest, "onProgress" | "onStream">,
  ) {
    const requestId = this.requestId++;
    return await new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        ...handlers,
      });
      const payload: BrowserLLMWorkerRequest = {
        ...request,
        requestId,
      };
      this.worker.postMessage(payload);
    });
  }

  private getReloadKey(config: LLMConfig) {
    return JSON.stringify({
      model: config.model,
    });
  }

  private normalizeConfig(config: LLMConfig): LLMConfig {
    return {
      ...config,
      model: resolveCurrentModelId(config.model),
    };
  }

  private isDifferentConfig(config: LLMConfig): boolean {
    if (!this.initialized || !this.llmConfig) {
      return true;
    }

    return this.llmConfig.model !== config.model;
  }

  private async initModel(
    config: LLMConfig,
    onProgress?: (report: WebLLMPreloadProgress) => void,
  ) {
    await this.send<void>(
      {
        kind: "preload",
        config,
      },
      {
        onProgress,
      },
    );
    this.initialized = true;
  }

  private async ensureModelLoaded(
    config: LLMConfig,
    options?: {
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

    const initPromise = this.initModel(nextConfig, options?.onProgress);
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

  private async chatCompletion(
    config: LLMConfig,
    messages: ChatOptions["messages"],
    onUpdate?: (
      message: string,
      chunk: string,
      usage?: CompletionUsage,
    ) => void,
  ) {
    const requestId = this.requestId++;
    this.activeChatRequestId = requestId;

    try {
      return await new Promise<{
        content: string;
        stopReason?: ChatCompletionFinishReason;
        usage?: CompletionUsage;
      }>((resolve, reject) => {
        this.pendingRequests.set(requestId, {
          resolve,
          reject,
          onStream: onUpdate,
        });
        this.worker.postMessage({
          kind: "generate",
          requestId,
          config,
          messages,
        } satisfies BrowserLLMWorkerRequest);
      });
    } finally {
      if (this.activeChatRequestId === requestId) {
        this.activeChatRequestId = undefined;
      }
    }
  }

  async chat(options: ChatOptions): Promise<void> {
    const normalizedConfig = this.normalizeConfig({
      ...(this.llmConfig || {}),
      ...options.config,
    });

    try {
      await this.ensureModelLoaded(normalizedConfig);
    } catch (err: unknown) {
      const errorMessage = formatErrorMessage(
        err,
        "Model initialization failed. Check the browser console for details.",
      );
      console.error("Error while initializing the model", err);
      options.onError?.(errorMessage);
      return;
    }

    let reply: string | null = "";
    let stopReason: ChatCompletionFinishReason | undefined;
    let usage: CompletionUsage | undefined;

    try {
      const completion = await this.chatCompletion(
        normalizedConfig,
        options.messages,
        options.onUpdate,
      );
      reply = completion.content;
      stopReason = completion.stopReason;
      usage = completion.usage;
    } catch (err: unknown) {
      const errorMessage = formatErrorMessage(
        err,
        "Chat completion failed. Check the browser console for details.",
      );
      console.error("Error in chatCompletion", err);
      options.onError?.(errorMessage);
      return;
    }

    if (hasVisibleContent(reply)) {
      options.onFinish(fixMessage(reply), stopReason, usage);
      return;
    }

    options.onError?.(
      new Error(
        stopReason
          ? `Empty response generated by LLM (finish reason: ${stopReason})`
          : "Empty response generated by LLM",
      ),
    );
  }

  async abort() {
    if (this.activeChatRequestId !== undefined) {
      this.abortedChatRequestIds.add(this.activeChatRequestId);
    }
    await this.send<void>({
      kind: "abort",
    });
  }

  async models() {
    return DEFAULT_MODELS;
  }
}
