import {
  ChatCompletionFinishReason,
  CompletionUsage,
  LLMConfig,
  LogLevel,
  RequestMessage,
} from "./api";

export type BrowserLLMPreloadPhase =
  | "checkingCache"
  | "preparingRuntime"
  | "requestingGpu"
  | "fetchingModelFiles"
  | "loadingModel"
  | "warmingUp"
  | "finalizing"
  | "ready";

export type BrowserLLMPreloadProgress = {
  cached: boolean | null;
  model: string;
  phase: BrowserLLMPreloadPhase;
  progress: number;
  phaseProgress: number;
  text: string;
  timeElapsed: number;
};

export type BrowserLLMWorkerRequest =
  | {
      kind: "preload";
      requestId: number;
      config: LLMConfig;
    }
  | {
      kind: "generate";
      requestId: number;
      config: LLMConfig;
      messages: RequestMessage[];
    }
  | {
      kind: "abort";
      requestId: number;
    }
  | {
      kind: "setLogLevel";
      requestId: number;
      logLevel: LogLevel;
    };

export type BrowserLLMWorkerResponse =
  | {
      kind: "progress";
      requestId: number;
      progress: BrowserLLMPreloadProgress;
    }
  | {
      kind: "stream";
      requestId: number;
      message: string;
      chunk: string;
      usage?: CompletionUsage;
    }
  | {
      kind: "result";
      requestId: number;
      content: string;
      stopReason?: ChatCompletionFinishReason;
      usage?: CompletionUsage;
    }
  | {
      kind: "ack";
      requestId: number;
    }
  | {
      kind: "error";
      requestId: number;
      error: string;
    };
