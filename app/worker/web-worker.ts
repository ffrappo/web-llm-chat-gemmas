import log from "loglevel";
import type { Message as HFMessage } from "@huggingface/transformers";
import type {
  BrowserLLMPreloadPhase,
  BrowserLLMPreloadProgress,
  BrowserLLMWorkerRequest,
  BrowserLLMWorkerResponse,
} from "../client/browser-llm-protocol";
import type {
  ChatCompletionFinishReason,
  CompletionUsage,
  LLMConfig,
  LogLevel,
  RequestMessage,
} from "../client/api";
import { getModelRuntime, resolveCurrentModelId } from "../constant";
import { serializeError } from "../utils/error";

declare const self: DedicatedWorkerGlobalScope;

const TRANSFORMERS_JS_CDN_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

type TransformersModule = typeof import("@huggingface/transformers");
type TransformersRuntime = Pick<
  TransformersModule,
  | "Gemma4ForConditionalGeneration"
  | "Gemma4Processor"
  | "InterruptableStoppingCriteria"
  | "StoppingCriteriaList"
  | "TextStreamer"
  | "env"
  | "load_image"
  | "random"
>;

let transformersRuntimePromise: Promise<TransformersRuntime> | undefined;

async function getTransformersRuntime() {
  if (!transformersRuntimePromise) {
    transformersRuntimePromise = import(
      /* webpackIgnore: true */ TRANSFORMERS_JS_CDN_URL
    )
      .then((module) => {
        const runtime = module as TransformersRuntime;
        runtime.env.allowRemoteModels = true;
        runtime.env.allowLocalModels = false;
        runtime.env.useBrowserCache = true;
        runtime.env.useWasmCache = false;
        const onnxEnv = (runtime.env.backends as any)?.onnx;
        if (onnxEnv?.wasm) {
          onnxEnv.wasm.proxy = false;
          onnxEnv.wasm.numThreads = 1;
        }
        return runtime;
      })
      .catch((error) => {
        transformersRuntimePromise = undefined;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to load the Transformers.js browser runtime from ${TRANSFORMERS_JS_CDN_URL}: ${message}`,
        );
      });
  }

  return await transformersRuntimePromise;
}

const PRELOAD_PHASE_PROGRESS: Record<
  BrowserLLMPreloadPhase,
  readonly [number, number]
> = {
  checkingCache: [0, 0.05],
  preparingRuntime: [0.05, 0.14],
  requestingGpu: [0.14, 0.24],
  fetchingModelFiles: [0.24, 0.78],
  loadingModel: [0.78, 0.92],
  warmingUp: [0.92, 0.98],
  finalizing: [0.98, 1],
  ready: [1, 1],
};

type LoadedModel = {
  modelId: string;
  model: Awaited<
    ReturnType<
      TransformersModule["Gemma4ForConditionalGeneration"]["from_pretrained"]
    >
  >;
  processor: Awaited<
    ReturnType<TransformersModule["Gemma4Processor"]["from_pretrained"]>
  >;
};

type ActiveGeneration = {
  requestId: number;
  interruptable: InstanceType<
    TransformersModule["InterruptableStoppingCriteria"]
  >;
};

let loadedModel: LoadedModel | undefined;
let loadPromise: Promise<LoadedModel> | undefined;
let loadPromiseKey: string | undefined;
let activeGeneration: ActiveGeneration | undefined;

function normalizeUnitProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  const normalized = progress > 1 ? progress / 100 : progress;
  return Math.min(1, Math.max(0, normalized));
}

function getOverallPreloadProgress(
  phase: BrowserLLMPreloadPhase,
  phaseProgress: number,
) {
  const [start, end] = PRELOAD_PHASE_PROGRESS[phase];
  return start + (end - start) * normalizeUnitProgress(phaseProgress);
}

function nowElapsed(startedAt: number) {
  return Math.max(0, performance.now() - startedAt) / 1000;
}

function postMessage(message: BrowserLLMWorkerResponse) {
  self.postMessage(message);
}

function postError(requestId: number, error: unknown) {
  postMessage({
    kind: "error",
    requestId,
    error: serializeError(error, "Unknown worker error"),
  });
}

function createProgress(
  model: string,
  phase: BrowserLLMPreloadPhase,
  phaseProgress: number,
  text: string,
  cached: boolean | null,
  startedAt: number,
): BrowserLLMPreloadProgress {
  return {
    cached,
    model,
    phase,
    progress: getOverallPreloadProgress(phase, phaseProgress),
    phaseProgress: normalizeUnitProgress(phaseProgress),
    text,
    timeElapsed: nowElapsed(startedAt),
  };
}

function emitProgress(
  requestId: number,
  model: string,
  phase: BrowserLLMPreloadPhase,
  phaseProgress: number,
  text: string,
  cached: boolean | null,
  startedAt: number,
) {
  postMessage({
    kind: "progress",
    requestId,
    progress: createProgress(
      model,
      phase,
      phaseProgress,
      text,
      cached,
      startedAt,
    ),
  });
}

function makeLoadKey(config: LLMConfig) {
  const modelId = resolveCurrentModelId(config.model);
  return JSON.stringify({ modelId });
}

function setWorkerLogLevel(logLevel: LogLevel) {
  log.setLevel(logLevel.toLowerCase() as log.LogLevelDesc);
}

function stripGemmaControlTokens(content: string) {
  return content
    .replace(/^<\|turn\>model\s*/gi, "")
    .replace(/(?:<(?:\|)?turn\|>\s*)+$/gi, "")
    .trim();
}

function stripThinkBlocks(content: string) {
  return stripGemmaControlTokens(
    content
      .replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
      .replace(/<\|channel\>thought\s*[\s\S]*?<(?:\|)?channel\|>\s*/gi, ""),
  );
}

function getVisibleGemmaText(raw: string, includeThinking: boolean) {
  const trimmed = stripGemmaControlTokens(raw.trim());
  const openMatch = trimmed.match(/<\|channel\>thought\s*/i);

  if (!openMatch) {
    return trimmed;
  }

  const afterOpen = trimmed.slice(openMatch.index! + openMatch[0].length);
  const closeMatch = afterOpen.match(/<(?:\|)?channel\|>\s*/i);

  if (!closeMatch) {
    return includeThinking ? afterOpen.trim() : "";
  }

  const closeIndex = closeMatch.index ?? 0;
  const thought = afterOpen.slice(0, closeIndex).trim();
  const answer = stripGemmaControlTokens(
    afterOpen.slice(closeIndex + closeMatch[0].length).trim(),
  );

  if (includeThinking && thought.length > 0) {
    return [`<think>${thought}</think>`, answer].filter(Boolean).join("\n\n");
  }

  return answer;
}

function normalizeAssistantHistory(messages: RequestMessage[]) {
  return messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    if (typeof message.content === "string") {
      return {
        ...message,
        content: stripThinkBlocks(message.content),
      };
    }

    return {
      ...message,
      content: message.content.map((entry) =>
        entry.type === "text"
          ? {
              ...entry,
              text: stripThinkBlocks(entry.text ?? ""),
            }
          : entry,
      ),
    };
  });
}

function convertMessagesToGemmaChat(messages: RequestMessage[]) {
  const imageUrls: string[] = [];
  const chatMessages: HFMessage[] = normalizeAssistantHistory(messages).map(
    (message) => {
      if (typeof message.content === "string") {
        return {
          role: message.role,
          content: message.content,
        };
      }

      const imageParts = message.content
        .filter((entry) => entry.type === "image_url")
        .map((entry) => {
          imageUrls.push(entry.image_url?.url ?? "");
          return {
            type: "image" as const,
            image: entry.image_url?.url ?? "",
          };
        });

      const textParts = message.content
        .filter((entry) => entry.type === "text")
        .map((entry) => entry.text?.trim())
        .filter((entry): entry is string => Boolean(entry));

      if (imageParts.length === 0) {
        return {
          role: message.role,
          content: textParts.join("\n\n"),
        };
      }

      return {
        role: message.role,
        content: [
          ...imageParts,
          ...(textParts.length > 0
            ? [
                {
                  type: "text" as const,
                  text: textParts.join("\n\n"),
                },
              ]
            : []),
        ],
      };
    },
  );

  return { chatMessages, imageUrls };
}

function getRequestedContextWindow(config: LLMConfig) {
  const runtimeMaxContext = getModelRuntime(config.model)?.max_context_window;

  if (!runtimeMaxContext) {
    return config.context_window_size ?? 4096;
  }

  if (!config.context_window_size) {
    return runtimeMaxContext;
  }

  return Math.max(256, Math.min(config.context_window_size, runtimeMaxContext));
}

async function ensureWebGpu(
  requestId: number,
  config: LLMConfig,
  startedAt: number,
) {
  emitProgress(
    requestId,
    config.model,
    "requestingGpu",
    0,
    "Checking for a compatible WebGPU adapter.",
    null,
    startedAt,
  );

  if (!("gpu" in navigator)) {
    throw new Error(
      "WebGPU is not available in this browser. Gemma 4 requires a WebGPU-capable browser for local inference.",
    );
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error(
      "No compatible WebGPU adapter was found for local Gemma 4 inference.",
    );
  }
}

async function disposeLoadedModel() {
  if (!loadedModel) return;
  await loadedModel.model.dispose().catch(() => undefined);
  loadedModel = undefined;
}

async function warmupModel(
  loaded: LoadedModel,
  requestId: number,
  config: LLMConfig,
  startedAt: number,
  cached: boolean | null,
) {
  emitProgress(
    requestId,
    config.model,
    "warmingUp",
    0,
    "Running a short warmup pass to prime the runtime.",
    cached,
    startedAt,
  );

  const prompt = loaded.processor.apply_chat_template(
    [{ role: "user", content: "Reply with exactly OK." }],
    {
      add_generation_prompt: true,
    },
  );

  const inputs = await (loaded.processor as any)(prompt, null, null, {
    add_special_tokens: false,
    truncation: true,
    max_length: Math.min(getRequestedContextWindow(config), 1024),
  });

  await loaded.model.generate({
    ...inputs,
    do_sample: false,
    max_new_tokens: 1,
  });
}

async function loadModel(requestId: number, config: LLMConfig) {
  const normalizedModel = resolveCurrentModelId(config.model);
  const runtime = getModelRuntime(normalizedModel);

  if (!runtime) {
    throw new Error(`Unsupported browser model: ${normalizedModel}`);
  }

  const startedAt = performance.now();
  let sawDownload = false;
  let cached: boolean | null = null;

  const progressCallback = (info: {
    status?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }) => {
    const status = info.status ?? "progress";

    if (
      status === "download" ||
      status === "progress" ||
      status === "progress_total"
    ) {
      sawDownload = true;
      cached = false;
    } else if (cached === null) {
      cached = true;
    }

    if (status === "progress_total") {
      emitProgress(
        requestId,
        normalizedModel,
        "fetchingModelFiles",
        (info.progress ?? 0) / 100,
        `Downloading model files: ${Math.round(info.progress ?? 0)}% complete.`,
        cached,
        startedAt,
      );
      return;
    }

    if (status === "download") {
      emitProgress(
        requestId,
        normalizedModel,
        "fetchingModelFiles",
        0,
        `Starting download for ${info.file ?? "model asset"}.`,
        cached,
        startedAt,
      );
      return;
    }

    if (status === "done") {
      emitProgress(
        requestId,
        normalizedModel,
        sawDownload ? "loadingModel" : "preparingRuntime",
        sawDownload ? 0.4 : 0.7,
        `Prepared ${info.file ?? "model asset"}.`,
        cached,
        startedAt,
      );
    }
  };

  emitProgress(
    requestId,
    normalizedModel,
    "checkingCache",
    0,
    "Checking browser cache and model metadata.",
    cached,
    startedAt,
  );

  emitProgress(
    requestId,
    normalizedModel,
    "preparingRuntime",
    0.1,
    "Loading tokenizer and processor metadata.",
    cached,
    startedAt,
  );

  await ensureWebGpu(requestId, config, startedAt);

  const { Gemma4ForConditionalGeneration, Gemma4Processor } =
    await getTransformersRuntime();

  const processor = await Gemma4Processor.from_pretrained(runtime.repo, {
    revision: runtime.processor_revision ?? runtime.revision,
    progress_callback: progressCallback,
  });

  emitProgress(
    requestId,
    normalizedModel,
    "loadingModel",
    0.1,
    "Opening the Gemma 4 ONNX graph and runtime sessions.",
    cached,
    startedAt,
  );

  const model = await Gemma4ForConditionalGeneration.from_pretrained(
    runtime.repo,
    {
      revision: runtime.revision,
      device: runtime.device,
      dtype: runtime.dtype,
      progress_callback: progressCallback,
    },
  );

  cached = sawDownload ? false : true;

  const loaded = {
    modelId: normalizedModel,
    model,
    processor,
  } satisfies LoadedModel;

  await warmupModel(loaded, requestId, config, startedAt, cached);

  emitProgress(
    requestId,
    normalizedModel,
    "finalizing",
    1,
    cached
      ? "Loaded Gemma 4 from browser cache and finished startup."
      : "Finished downloading and priming Gemma 4.",
    cached,
    startedAt,
  );

  emitProgress(
    requestId,
    normalizedModel,
    "ready",
    1,
    "Gemma 4 is ready.",
    cached,
    startedAt,
  );

  return loaded;
}

async function ensureModel(requestId: number, config: LLMConfig) {
  const loadKey = makeLoadKey(config);

  if (
    loadedModel &&
    loadedModel.modelId === resolveCurrentModelId(config.model)
  ) {
    return loadedModel;
  }

  if (loadPromise && loadPromiseKey === loadKey) {
    return await loadPromise;
  }

  const nextLoadPromise = (async () => {
    await disposeLoadedModel();
    const nextModel = await loadModel(requestId, config);
    loadedModel = nextModel;
    return nextModel;
  })();

  loadPromise = nextLoadPromise;
  loadPromiseKey = loadKey;

  try {
    return await nextLoadPromise;
  } finally {
    if (loadPromise === nextLoadPromise) {
      loadPromise = undefined;
      loadPromiseKey = undefined;
    }
  }
}

function buildUsage(
  promptTokens: number,
  completionTokens: number,
  extra?: CompletionUsage["extra"],
): CompletionUsage {
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    extra,
  };
}

function inferStopReason(
  interrupted: boolean,
  completionTokens: number,
  maxNewTokens: number,
): ChatCompletionFinishReason {
  if (interrupted) return "abort";
  if (completionTokens >= maxNewTokens) return "length";
  return "stop";
}

async function buildInputs(
  loaded: LoadedModel,
  config: LLMConfig,
  messages: RequestMessage[],
) {
  const { chatMessages, imageUrls } = convertMessagesToGemmaChat(messages);
  const prompt = loaded.processor.apply_chat_template(chatMessages, {
    add_generation_prompt: true,
    enable_thinking: config.enable_thinking === true,
  } as any);

  const contextWindow = getRequestedContextWindow(config);
  const maxNewTokens = Math.max(
    1,
    Math.min(config.max_tokens ?? 512, Math.max(contextWindow - 1, 1)),
  );
  const promptBudget = Math.max(256, contextWindow - maxNewTokens);

  const tokenizerOptions = {
    add_special_tokens: false,
    truncation: true,
    max_length: promptBudget,
  };

  if (imageUrls.length === 0) {
    return {
      inputs: await (loaded.processor as any)(
        prompt,
        null,
        null,
        tokenizerOptions,
      ),
      maxNewTokens,
    };
  }

  const { load_image } = await getTransformersRuntime();
  const images = await Promise.all(imageUrls.map((url) => load_image(url)));
  return {
    inputs: await (loaded.processor as any)(
      prompt,
      images,
      null,
      tokenizerOptions,
    ),
    maxNewTokens,
  };
}

async function generate(
  requestId: number,
  config: LLMConfig,
  messages: RequestMessage[],
) {
  const {
    InterruptableStoppingCriteria,
    StoppingCriteriaList,
    TextStreamer,
    random,
  } = await getTransformersRuntime();
  const loaded = await ensureModel(requestId, config);
  const { inputs, maxNewTokens } = await buildInputs(loaded, config, messages);
  const preserveGemmaControlTokens = config.enable_thinking === true;

  const promptTokens = inputs.input_ids?.dims?.at(-1) ?? 0;
  const tokenizer = loaded.processor.tokenizer;
  if (!tokenizer) {
    throw new Error("Tokenizer failed to load for Gemma 4.");
  }

  let streamedText = "";
  let lastVisibleMessage = "";
  let firstTokenAt: number | undefined;
  const generationStartedAt = performance.now();
  const interruptable = new InterruptableStoppingCriteria();
  const stoppingCriteria = new StoppingCriteriaList();
  stoppingCriteria.push(interruptable);

  activeGeneration = {
    requestId,
    interruptable,
  };

  try {
    if (config.seed !== null && config.seed !== undefined) {
      random.seed(config.seed);
    }

    const outputs = await loaded.model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: config.do_sample ?? true,
      temperature: config.temperature,
      top_p: config.top_p,
      top_k: config.top_k,
      repetition_penalty: config.repetition_penalty,
      eos_token_id: config.ignore_eos ? [] : undefined,
      stopping_criteria: stoppingCriteria,
      ...(config.stream !== false
        ? {
            streamer: new TextStreamer(tokenizer, {
              skip_prompt: true,
              skip_special_tokens: !preserveGemmaControlTokens,
              callback_function(text: string) {
                streamedText += text;
                if (firstTokenAt === undefined && text.trim().length > 0) {
                  firstTokenAt = performance.now();
                }
                const visibleMessage = getVisibleGemmaText(
                  streamedText,
                  config.enable_thinking === true,
                );
                if (visibleMessage === lastVisibleMessage) {
                  return;
                }
                const chunk = visibleMessage.startsWith(lastVisibleMessage)
                  ? visibleMessage.slice(lastVisibleMessage.length)
                  : visibleMessage;
                lastVisibleMessage = visibleMessage;
                postMessage({
                  kind: "stream",
                  requestId,
                  message: visibleMessage,
                  chunk,
                });
              },
            }),
          }
        : {}),
    });

    if (!("slice" in outputs)) {
      throw new Error("Gemma 4 generation did not return token output.");
    }

    const generatedTokens = outputs.slice(null, [promptTokens, null]);
    const completionTokens = generatedTokens.dims?.at(-1) ?? 0;
    const generationFinishedAt = performance.now();
    const totalSeconds = Math.max(
      (generationFinishedAt - generationStartedAt) / 1000,
      0.001,
    );
    const timeToFirstTokenSeconds =
      firstTokenAt === undefined
        ? undefined
        : Math.max((firstTokenAt - generationStartedAt) / 1000, 0.001);
    const decodeSeconds =
      firstTokenAt === undefined
        ? totalSeconds
        : Math.max((generationFinishedAt - firstTokenAt) / 1000, 0.001);
    const usage = buildUsage(promptTokens, completionTokens, {
      prefill_tokens_per_s:
        promptTokens > 0
          ? promptTokens / (timeToFirstTokenSeconds ?? totalSeconds)
          : undefined,
      decode_tokens_per_s:
        completionTokens > 0 ? completionTokens / decodeSeconds : undefined,
      seconds_to_first_token: timeToFirstTokenSeconds,
      generation_seconds: totalSeconds,
    });
    const rawContent =
      loaded.processor.batch_decode(generatedTokens, {
        skip_special_tokens: !preserveGemmaControlTokens,
      })[0] ?? "";
    const content = getVisibleGemmaText(
      rawContent,
      config.enable_thinking === true,
    );

    postMessage({
      kind: "result",
      requestId,
      content,
      stopReason: inferStopReason(
        interruptable.interrupted,
        completionTokens,
        maxNewTokens,
      ),
      usage,
    });
  } finally {
    if (activeGeneration?.requestId === requestId) {
      activeGeneration = undefined;
    }
  }
}

self.onmessage = async (event: MessageEvent<BrowserLLMWorkerRequest>) => {
  const message = event.data;

  try {
    switch (message.kind) {
      case "setLogLevel":
        setWorkerLogLevel(message.logLevel);
        postMessage({
          kind: "ack",
          requestId: message.requestId,
        });
        break;

      case "abort":
        activeGeneration?.interruptable.interrupt();
        postMessage({
          kind: "ack",
          requestId: message.requestId,
        });
        break;

      case "preload":
        await ensureModel(message.requestId, message.config);
        postMessage({
          kind: "ack",
          requestId: message.requestId,
        });
        break;

      case "generate":
        await generate(message.requestId, message.config, message.messages);
        break;
    }
  } catch (error) {
    console.error("[Transformers Worker] Task failed:", error);
    postError(message.requestId, error);
  }
};
