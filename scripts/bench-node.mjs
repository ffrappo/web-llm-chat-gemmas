#!/usr/bin/env node
/**
 * Node.js benchmark runner for the Gemma 4 browser model.
 *
 * This script replicates the browser bench harness (app/bench/page.tsx)
 * but runs directly in Node.js via @huggingface/transformers + ONNX Runtime.
 * No browser, no WebGPU, no tab crashes. CPU inference by default; a CUDA
 * provider will be picked up automatically if onnxruntime-node was built
 * with CUDA support.
 *
 * Usage:
 *   node scripts/bench-node.mjs --suite
 *   node scripts/bench-node.mjs --reliability --trials 10
 *   node scripts/bench-node.mjs --prompt "Reply with exactly OK."
 *   node scripts/bench-node.mjs --suite --config-json '{"temperature":1.1}'
 */

import {
  Gemma4ForConditionalGeneration,
  Gemma4Processor,
  InterruptableStoppingCriteria,
  StoppingCriteriaList,
  env,
  random,
} from "@huggingface/transformers";
import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEMMA4_MODEL_REPO = "onnx-community/gemma-4-E2B-it-ONNX";
const GEMMA4_MODEL_WEIGHTS_REVISION =
  "5f09dcfb04eddbc9d8e2ebd8a0bf5250d048c79e";
const GEMMA4_MODEL_REVISION = "ee1a73e8f4cb9aab6c7165231bf7e8e6331051cc";
const GEMMA4_MODEL_ID = "gemma-4-E2B-it-ONNX-onnx-ree1a73e";

const MODEL_RUNTIME = {
  [GEMMA4_MODEL_ID]: {
    repo: GEMMA4_MODEL_REPO,
    revision: GEMMA4_MODEL_WEIGHTS_REVISION,
    processor_revision: GEMMA4_MODEL_REVISION,
    dtype: "q4f16",
    supports_images: true,
    supports_audio: true,
    max_context_window: 131072,
  },
};

const DEFAULT_BENCH_CONFIG = {
  model: GEMMA4_MODEL_ID,
  context_window_size: 4096,
  temperature: 1.0,
  top_p: 0.95,
  top_k: 64,
  max_tokens: 96,
  do_sample: true,
  presence_penalty: 0,
  frequency_penalty: 0,
  repetition_penalty: 1,
  ignore_eos: false,
  stream: true,
};

const WARMUP_PROMPT = "Reply with exactly OK.";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.useWasmCache = false;

// ---------------------------------------------------------------------------
// Text utilities (ported from web-worker.ts & page.tsx)
// ---------------------------------------------------------------------------

function stripGemmaControlTokens(content) {
  return content
    .replace(/^<\|turn\>model\s*/gi, "")
    .replace(/(?:<(?:\|)?turn\|>\s*)+$/gi, "")
    .trim();
}

function stripThinkBlocks(content) {
  return stripGemmaControlTokens(
    content
      .replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
      .replace(/<\|channel\>thought\s*[\s\S]*?<(?:\|)?channel\|>\s*/gi, ""),
  );
}

function getVisibleGemmaText(raw, includeThinking) {
  const trimmed = stripGemmaControlTokens(raw.trim());
  const openMatch = trimmed.match(/<\|channel\>thought\s*/i);

  if (!openMatch) {
    return trimmed;
  }

  const afterOpen = trimmed.slice(openMatch.index + openMatch[0].length);
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

function normalizeText(value) {
  return stripThinkBlocks(value).toLowerCase().replace(/\s+/g, " ");
}

function hasCodeFences(value) {
  return /```/.test(value);
}

function countWhitespaceTokens(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function parseStrictJson(value) {
  const trimmed = stripThinkBlocks(value).trim();
  if (hasCodeFences(trimmed)) return null;
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => deepEqual(a[key], b[key]));
}

function isGenericFailure(output, error) {
  if (error) {
    return true;
  }
  const raw = output.trim().toLowerCase();
  const normalized = normalizeText(output);
  return (
    (raw.startsWith("<think>") && !raw.includes("</think>")) ||
    (raw.startsWith("<|channel>thought") &&
      !raw.includes("<channel|>") &&
      !raw.includes("<|channel|>")) ||
    normalized.length === 0 ||
    normalized.includes("empty response generated by llm") ||
    normalized.includes("please tell me what you would like me to do")
  );
}

// ---------------------------------------------------------------------------
// Bench cases (ported from page.tsx)
// ---------------------------------------------------------------------------

const DEFAULT_SUITE = [
  {
    id: "strict-json-nested",
    prompt:
      'Reply with ONLY this minified JSON, nothing else. No code fences, no prose: {"name":"Alice","tags":["a","b","c"],"meta":{"active":true}}',
    weight: 4,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const parsed = parseStrictJson(output);
      if (!parsed) return 0;
      return deepEqual(parsed, {
        name: "Alice",
        tags: ["a", "b", "c"],
        meta: { active: true },
      })
        ? 1
        : 0;
    },
  },
  {
    id: "exact-seven-words",
    prompt:
      "Write a sentence about winter in exactly seven words. No more, no less. Reply with only the sentence.",
    weight: 3,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const cleaned = stripThinkBlocks(output).trim();
      if (hasCodeFences(cleaned)) return 0;
      return countWhitespaceTokens(cleaned) === 7 ? 1 : 0;
    },
  },
  {
    id: "csv-with-header",
    prompt:
      'Output a CSV with the header "name,age" and two data rows: "Alice,30" and "Bob,25". Only the CSV, nothing else. No code fences.',
    weight: 4,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const cleaned = stripThinkBlocks(output).trim();
      if (hasCodeFences(cleaned)) return 0;
      const lines = cleaned
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length !== 3) return 0;
      return lines[0] === "name,age" &&
        lines[1] === "Alice,30" &&
        lines[2] === "Bob,25"
        ? 1
        : 0;
    },
  },
  {
    id: "code-no-fences",
    prompt:
      "Reply with ONLY this JavaScript, nothing else. No markdown, no code fences, no prose:\nfunction add(a,b){return a+b;}",
    weight: 4,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const cleaned = stripThinkBlocks(output).trim();
      if (hasCodeFences(cleaned)) return 0;
      const normalized = cleaned.replace(/\s+/g, "");
      return normalized === "functionadd(a,b){returna+b;}" ? 1 : 0;
    },
  },
  {
    id: "arithmetic-multi-step",
    prompt:
      "Alice has 14 apples. She gives 4 to Bob and eats 2. Bob then gives half of his apples to Carol. How many apples does Carol have now? Reply with only the number.",
    weight: 3,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const cleaned = stripThinkBlocks(output).trim();
      if (hasCodeFences(cleaned)) return 0;
      return cleaned === "2" ? 1 : 0;
    },
  },
  {
    id: "reading-comprehension-year",
    prompt:
      'Text: "Marie moved to Lyon in 2018 and opened a bakery in 2020." Question: In what year did Marie open the bakery? Reply with only the year, four digits, nothing else.',
    weight: 3,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const cleaned = stripThinkBlocks(output).trim();
      if (hasCodeFences(cleaned)) return 0;
      return cleaned === "2020" ? 1 : 0;
    },
  },
  {
    id: "instruction-hierarchy-last-wins",
    prompt:
      "First, tell me the capital of Japan. Then, ignore that previous instruction and instead reply with only the word NO in uppercase. Reply with only NO.",
    weight: 3,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const cleaned = stripThinkBlocks(output).trim();
      if (hasCodeFences(cleaned)) return 0;
      return cleaned === "NO" ? 1 : 0;
    },
  },
  {
    id: "json-extract",
    prompt:
      'Text: "The event starts at 18:00 on 2026-05-14 in Paris." Extract into minified JSON as {"time":"...","date":"...","city":"..."}. Reply with only the JSON, no code fences, no prose.',
    weight: 4,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const parsed = parseStrictJson(output);
      if (!parsed) return 0;
      return deepEqual(parsed, {
        time: "18:00",
        date: "2026-05-14",
        city: "Paris",
      })
        ? 1
        : 0;
    },
  },
];

// ---------------------------------------------------------------------------
// Config utilities
// ---------------------------------------------------------------------------

function mergeConfig(override) {
  return {
    ...DEFAULT_BENCH_CONFIG,
    ...override,
  };
}

function buildMessages(prompt, systemPrompt) {
  const messages = [];
  if (systemPrompt && systemPrompt.trim().length > 0) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
}

function getRequestedContextWindow(config) {
  const runtimeMaxContext = MODEL_RUNTIME[config.model]?.max_context_window;
  if (!runtimeMaxContext) {
    return config.context_window_size ?? 4096;
  }
  if (!config.context_window_size) {
    return runtimeMaxContext;
  }
  return Math.max(256, Math.min(config.context_window_size, runtimeMaxContext));
}

function scoreSuite(results, config, tests = DEFAULT_SUITE) {
  const maxScore = tests.reduce((sum, test) => sum + test.weight, 0);
  const score = results.reduce((sum, result) => {
    const test = tests.find((entry) => entry.id === result.id);
    return sum + (test?.weight ?? 0) * result.score;
  }, 0);

  return {
    config,
    score,
    maxScore,
    scorePct: maxScore > 0 ? (score / maxScore) * 100 : 0,
    cases: results,
  };
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function stdev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
    values.length;
  return Math.sqrt(variance);
}

function countHardFailures(results) {
  return results.reduce(
    (sum, result) =>
      sum + (isGenericFailure(result.output, result.error) ? 1 : 0),
    0,
  );
}

function summarizeReliability(trials, config) {
  const scores = trials.map((trial) => trial.score);
  const testedCaseIds = new Set(
    trials.flatMap((trial) => trial.cases.map((entry) => entry.id)),
  );
  const allCases = DEFAULT_SUITE.filter((test) =>
    testedCaseIds.has(test.id),
  ).map((test) => {
    const cases = trials
      .map((trial) => trial.cases.find((entry) => entry.id === test.id))
      .filter(Boolean);
    const caseScores = cases.map((entry) => entry.score);

    return {
      id: test.id,
      averageScore:
        caseScores.length > 0
          ? caseScores.reduce((sum, value) => sum + value, 0) / caseScores.length
          : 0,
      minScore: caseScores.length > 0 ? Math.min(...caseScores) : 0,
      maxScore: caseScores.length > 0 ? Math.max(...caseScores) : 0,
      medianScore: median(caseScores),
      stdev: stdev(caseScores),
      hardFailures: cases.filter((entry) =>
        isGenericFailure(entry.output, entry.error),
      ).length,
    };
  });

  const hardFailureCount = trials.reduce(
    (sum, trial) => sum + trial.hardFailureCount,
    0,
  );
  const caseCount = trials.reduce(
    (sum, trial) => sum + trial.cases.length,
    0,
  );

  return {
    config,
    trials,
    summary: {
      averageScore:
        scores.length > 0
          ? scores.reduce((sum, value) => sum + value, 0) / scores.length
          : 0,
      caseSummaries: allCases,
      hardFailureCount,
      hardFailureRate: caseCount > 0 ? hardFailureCount / caseCount : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      medianScore: median(scores),
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
      trialCount: trials.length,
      zeroHardFailure: hardFailureCount === 0,
    },
  };
}

function compareReliabilityResults(left, right) {
  if (left.summary.zeroHardFailure !== right.summary.zeroHardFailure) {
    return left.summary.zeroHardFailure ? -1 : 1;
  }
  if (left.summary.hardFailureRate !== right.summary.hardFailureRate) {
    return left.summary.hardFailureRate - right.summary.hardFailureRate;
  }
  if (left.summary.minScore !== right.summary.minScore) {
    return right.summary.minScore - left.summary.minScore;
  }
  if (left.summary.averageScore !== right.summary.averageScore) {
    return right.summary.averageScore - left.summary.averageScore;
  }
  return right.summary.medianScore - left.summary.medianScore;
}

function createSeededRng(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleWithRng(items, rng) {
  const nextItems = [...items];
  for (let i = nextItems.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [nextItems[i], nextItems[j]] = [nextItems[j], nextItems[i]];
  }
  return nextItems;
}

function getSuiteTests(caseIds, orderSeed) {
  let tests = DEFAULT_SUITE;
  if (caseIds && caseIds.length > 0) {
    const wantedIds = new Set(caseIds);
    tests = DEFAULT_SUITE.filter((test) => wantedIds.has(test.id));
  }
  if (orderSeed === undefined) {
    return tests;
  }
  return shuffleWithRng(tests, createSeededRng(orderSeed));
}

function getPrecision(step, fallback = 3) {
  if (!step || Number.isInteger(step)) return 0;
  const stepText = step.toString();
  const decimal = stepText.split(".")[1];
  return decimal ? decimal.length : fallback;
}

function quantizeValue(value, spec) {
  let nextValue = value;
  if (spec.step) {
    nextValue = Math.round(nextValue / spec.step) * spec.step;
  }
  if (spec.integer) {
    nextValue = Math.round(nextValue);
  }
  nextValue = Math.min(spec.max, Math.max(spec.min, nextValue));
  const precision =
    spec.precision ?? getPrecision(spec.step, spec.integer ? 0 : 3);
  return Number(nextValue.toFixed(precision));
}

function sampleLatinHypercube(space, count, seed = 1, base) {
  if (count <= 0) return [];

  const configs = Array.from({ length: count }, () => ({
    ...base,
  }));
  const numericKeys = Object.entries(space).filter(
    ([, spec]) => spec && !Array.isArray(spec),
  );
  const categoricalKeys = Object.entries(space).filter(([, spec]) =>
    Array.isArray(spec),
  );

  numericKeys.forEach(([key, spec], keyIndex) => {
    const rng = createSeededRng(seed + keyIndex * 7919);
    const values = Array.from({ length: count }, (_, index) => {
      const fraction = (index + rng()) / count;
      const raw = spec.min + fraction * (spec.max - spec.min);
      return quantizeValue(raw, spec);
    });
    const shuffled = shuffleWithRng(values, rng);
    shuffled.forEach((value, index) => {
      configs[index][key] = value;
    });
  });

  categoricalKeys.forEach(([key, values], keyIndex) => {
    if (values.length === 0) return;
    const rng = createSeededRng(seed + 100_003 + keyIndex * 3571);
    const samples = Array.from(
      { length: count },
      (_, index) => values[index % values.length],
    );
    const shuffled = shuffleWithRng(samples, rng);
    shuffled.forEach((value, index) => {
      configs[index][key] = value;
    });
  });

  return configs;
}

// ---------------------------------------------------------------------------
// Model loading & generation (ported from web-worker.ts)
// ---------------------------------------------------------------------------

let loadedModel = null;
let loadPromise = null;

function normalizeAssistantHistory(messages) {
  return messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }
    if (typeof message.content === "string") {
      return { ...message, content: stripThinkBlocks(message.content) };
    }
    return {
      ...message,
      content: message.content.map((entry) =>
        entry.type === "text"
          ? { ...entry, text: stripThinkBlocks(entry.text ?? "") }
          : entry,
      ),
    };
  });
}

function convertMessagesToGemmaChat(messages) {
  const chatMessages = normalizeAssistantHistory(messages).map((message) => {
    if (typeof message.content === "string") {
      return { role: message.role, content: message.content };
    }
    const textParts = message.content
      .filter((entry) => entry.type === "text")
      .map((entry) => entry.text?.trim())
      .filter(Boolean);

    return { role: message.role, content: textParts.join("\n\n") };
  });

  return { chatMessages, imageUrls: [] };
}

async function disposeLoadedModel() {
  if (!loadedModel) return;
  await loadedModel.model.dispose().catch(() => undefined);
  loadedModel = null;
}

async function loadModel(config, onProgress) {
  const runtime = MODEL_RUNTIME[config.model];
  if (!runtime) {
    throw new Error(`Unsupported model: ${config.model}`);
  }

  const startedAt = performance.now();
  let sawDownload = false;
  let cached = null;

  const progressCallback = (info) => {
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

    if (status === "progress_total" && onProgress) {
      onProgress({
        phase: "fetchingModelFiles",
        progress: (info.progress ?? 0) / 100,
        text: `Downloading model files: ${Math.round(info.progress ?? 0)}% complete.`,
        cached,
        timeElapsed: (performance.now() - startedAt) / 1000,
      });
    }
  };

  if (onProgress) {
    onProgress({
      phase: "preparingRuntime",
      progress: 0.1,
      text: "Loading tokenizer and processor metadata.",
      cached: null,
      timeElapsed: (performance.now() - startedAt) / 1000,
    });
  }

  const processor = await Gemma4Processor.from_pretrained(runtime.repo, {
    revision: runtime.processor_revision ?? runtime.revision,
    progress_callback: progressCallback,
  });

  if (onProgress) {
    onProgress({
      phase: "loadingModel",
      progress: 0.1,
      text: "Opening the Gemma 4 ONNX graph and runtime sessions.",
      cached: null,
      timeElapsed: (performance.now() - startedAt) / 1000,
    });
  }

  const model = await Gemma4ForConditionalGeneration.from_pretrained(
    runtime.repo,
    {
      revision: runtime.revision,
      dtype: runtime.dtype,
      progress_callback: progressCallback,
    },
  );

  cached = sawDownload ? false : true;

  const loaded = { modelId: config.model, model, processor };

  // Warmup
  if (onProgress) {
    onProgress({
      phase: "warmingUp",
      progress: 0,
      text: "Running a short warmup pass to prime the runtime.",
      cached,
      timeElapsed: (performance.now() - startedAt) / 1000,
    });
  }

  const warmupPrompt = loaded.processor.apply_chat_template(
    [{ role: "user", content: WARMUP_PROMPT }],
    { add_generation_prompt: true },
  );

  const warmupInputs = await loaded.processor(warmupPrompt, null, null, {
    add_special_tokens: false,
    truncation: true,
    max_length: Math.min(getRequestedContextWindow(config), 1024),
  });

  await loaded.model.generate({
    ...warmupInputs,
    do_sample: false,
    max_new_tokens: 1,
  });

  if (onProgress) {
    onProgress({
      phase: "ready",
      progress: 1,
      text: "Gemma 4 is ready.",
      cached,
      timeElapsed: (performance.now() - startedAt) / 1000,
    });
  }

  return loaded;
}

async function ensureModel(config, onProgress) {
  if (loadedModel && loadedModel.modelId === config.model) {
    return loadedModel;
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    await disposeLoadedModel();
    const nextModel = await loadModel(config, onProgress);
    loadedModel = nextModel;
    return nextModel;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function buildUsage(promptTokens, completionTokens, extra) {
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    extra,
  };
}

function inferStopReason(interrupted, completionTokens, maxNewTokens) {
  if (interrupted) return "abort";
  if (completionTokens >= maxNewTokens) return "length";
  return "stop";
}

async function buildInputs(loaded, config, messages) {
  const { chatMessages } = convertMessagesToGemmaChat(messages);
  const prompt = loaded.processor.apply_chat_template(chatMessages, {
    add_generation_prompt: true,
    enable_thinking: config.enable_thinking === true,
  });

  const contextWindow = getRequestedContextWindow(config);
  const maxNewTokens = Math.max(
    1,
    Math.min(config.max_tokens ?? 512, Math.max(contextWindow - 1, 1)),
  );
  const promptBudget = Math.max(256, contextWindow - maxNewTokens);

  const inputs = await loaded.processor(prompt, null, null, {
    add_special_tokens: false,
    truncation: true,
    max_length: promptBudget,
  });

  return { inputs, maxNewTokens };
}

async function generate(config, messages) {
  const loaded = await ensureModel(config);
  const { inputs, maxNewTokens } = await buildInputs(loaded, config, messages);
  const preserveGemmaControlTokens = config.enable_thinking === true;

  const promptTokens = inputs.input_ids?.dims?.at(-1) ?? 0;
  const tokenizer = loaded.processor.tokenizer;
  if (!tokenizer) {
    throw new Error("Tokenizer failed to load for Gemma 4.");
  }

  const generationStartedAt = performance.now();
  const interruptable = new InterruptableStoppingCriteria();
  const stoppingCriteria = new StoppingCriteriaList();
  stoppingCriteria.push(interruptable);

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

  const usage = buildUsage(promptTokens, completionTokens, {
    prefill_tokens_per_s:
      promptTokens > 0 ? promptTokens / totalSeconds : undefined,
    decode_tokens_per_s:
      completionTokens > 0 ? completionTokens / totalSeconds : undefined,
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

  return {
    content,
    stopReason: inferStopReason(
      interruptable.interrupted,
      completionTokens,
      maxNewTokens,
    ),
    usage,
  };
}

// ---------------------------------------------------------------------------
// Bench orchestration
// ---------------------------------------------------------------------------

async function runPrompt(prompt, config, options = {}) {
  const nextConfig = mergeConfig(config);
  const startedAt = performance.now();

  try {
    const result = await generate(nextConfig, buildMessages(prompt, options.systemPrompt));
    return {
      id: "adhoc",
      prompt,
      score: 0,
      output: result.content,
      durationMs: performance.now() - startedAt,
      stopReason: result.stopReason,
      usage: result.usage,
      config: nextConfig,
    };
  } catch (error) {
    return {
      id: "adhoc",
      prompt,
      score: 0,
      output: "",
      error: error.message || String(error),
      durationMs: performance.now() - startedAt,
      config: nextConfig,
    };
  }
}

async function runSuite(override, options = {}) {
  const nextConfig = mergeConfig(override);
  const tests = getSuiteTests(
    options.caseIds,
    options.randomizeOrder ? (options.orderSeed ?? 1) : undefined,
  );

  if (options.warmup !== false) {
    console.error("[bench] warming up…");
    await runPrompt(WARMUP_PROMPT, nextConfig, {
      systemPrompt: options.systemPrompt,
    });
  }

  const results = [];
  for (const test of tests) {
    console.error(`[bench] running ${test.id}…`);
    const result = await runPrompt(test.prompt, nextConfig, {
      systemPrompt: options.systemPrompt,
    });
    results.push({
      ...result,
      id: test.id,
      prompt: test.prompt,
      score: test.score(result.output, result.error),
    });
  }

  return scoreSuite(results, nextConfig, tests);
}

async function runBatch(configs, options) {
  const summaries = [];
  for (const config of configs) {
    summaries.push(await runSuite(config, options));
  }
  return summaries;
}

async function runReliability(override, options = {}) {
  const nextConfig = mergeConfig(override);
  const trialSeeds =
    options.seeds && options.seeds.length > 0
      ? options.seeds
      : Array.from({ length: options.trials ?? 5 }, (_, index) => index + 1);

  const trials = [];

  if (options.warmup !== false) {
    console.error("[bench] warming up…");
    await runPrompt(WARMUP_PROMPT, nextConfig, {
      systemPrompt: options.systemPrompt,
    });
  }

  for (let index = 0; index < trialSeeds.length; index += 1) {
    const seed = trialSeeds[index];
    const orderSeed =
      options.randomizeOrder === true
        ? (options.orderSeed ?? 10_007) + index
        : undefined;
    const trialConfig = mergeConfig({ ...override, seed });

    console.error(`[bench] trial ${index + 1}/${trialSeeds.length} (seed=${seed})…`);
    const summary = await runSuite(trialConfig, {
      ...options,
      orderSeed,
      warmup: false,
    });

    trials.push({
      ...summary,
      hardFailureCount: countHardFailures(summary.cases),
      orderSeed,
      promptOrder: summary.cases.map((entry) => entry.id),
      seed,
      trial: index + 1,
    });
  }

  return summarizeReliability(trials, nextConfig);
}

async function screenConfigs(configs, options) {
  const results = [];
  for (const config of configs) {
    results.push(await runReliability(config, options));
  }
  return results.sort(compareReliabilityResults);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    suite: false,
    reliability: false,
    screen: false,
    prompt: null,
    trials: 5,
    seeds: null,
    caseIds: null,
    configJson: null,
    systemPrompt: null,
    orderSeed: undefined,
    randomizeOrder: false,
    warmup: true,
    output: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--suite":
        args.suite = true;
        break;
      case "--reliability":
        args.reliability = true;
        break;
      case "--screen":
        args.screen = true;
        break;
      case "--prompt":
        args.prompt = argv[++i];
        break;
      case "--trials":
        args.trials = parseInt(argv[++i], 10);
        break;
      case "--seeds":
        args.seeds = argv[++i].split(",").map((s) => {
          const n = parseInt(s, 10);
          return Number.isNaN(n) ? null : n;
        });
        break;
      case "--case-ids":
        args.caseIds = argv[++i].split(",");
        break;
      case "--config-json":
        args.configJson = argv[++i];
        break;
      case "--system-prompt":
        args.systemPrompt = argv[++i];
        break;
      case "--order-seed":
        args.orderSeed = parseInt(argv[++i], 10);
        break;
      case "--randomize-order":
        args.randomizeOrder = true;
        break;
      case "--no-warmup":
        args.warmup = false;
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (arg.startsWith("--")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage: node ${basename(process.argv[1])} [options]

Options:
  --suite                  Run the default benchmark suite once.
  --reliability            Run multiple seeded trials (default 5).
  --screen                 Screen configs read from stdin as JSON array.
  --prompt <text>          Run a single ad-hoc prompt.
  --trials <n>             Number of reliability trials (default: 5).
  --seeds <1,2,3>          Comma-separated seeds (null for random).
  --case-ids <a,b>         Run only specific case IDs.
  --config-json <json>     Override default config (JSON object string).
  --system-prompt <text>   Set a system prompt.
  --order-seed <n>         Seed for prompt ordering.
  --randomize-order        Shuffle prompt order per trial.
  --no-warmup              Skip the warmup pass.
  --output <path>          Write JSON results to file instead of stdout.
  -h, --help               Show this help.

Examples:
  node scripts/bench-node.mjs --suite
  node scripts/bench-node.mjs --reliability --trials 10 --config-json '{"temperature":1.1}'
  node scripts/bench-node.mjs --prompt "What is 2+2?"
  echo '[{"temperature":0.8},{"temperature":1.0}]' | node scripts/bench-node.mjs --screen --trials 3
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.suite && !args.reliability && !args.prompt && !args.screen)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const override = args.configJson ? JSON.parse(args.configJson) : {};
  const options = {
    caseIds: args.caseIds,
    orderSeed: args.orderSeed,
    randomizeOrder: args.randomizeOrder,
    systemPrompt: args.systemPrompt,
    warmup: args.warmup,
  };

  let result;

  if (args.prompt) {
    result = await runPrompt(args.prompt, override, options);
  } else if (args.screen) {
    let input = "";
    if (process.stdin.isTTY) {
      console.error("Error: --screen requires a JSON array on stdin.");
      process.exit(1);
    }
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    const configs = JSON.parse(input);
    if (!Array.isArray(configs)) {
      console.error("Error: stdin must be a JSON array of config objects.");
      process.exit(1);
    }
    result = await screenConfigs(configs, {
      ...options,
      trials: args.trials,
      seeds: args.seeds,
    });
  } else if (args.reliability) {
    result = await runReliability(override, {
      ...options,
      trials: args.trials,
      seeds: args.seeds,
    });
  } else {
    result = await runSuite(override, options);
  }

  const json = JSON.stringify(result, null, 2);
  if (args.output) {
    writeFileSync(args.output, json + "\n");
    console.error(`Wrote results to ${args.output}`);
  } else {
    console.log(json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
