"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChatCompletionFinishReason,
  CompletionUsage,
  LLMConfig,
  RequestMessage,
} from "../client/api";
import { BrowserLLM } from "../client/browser-llm";
import type { BrowserLLMPreloadProgress } from "../client/browser-llm-protocol";
import { DEFAULT_MODEL } from "../constant";
import { CacheType, useChatStore } from "../store";

type BenchConfig = Partial<LLMConfig>;
type BenchRunOptions = {
  caseIds?: string[];
  clearAppChats?: boolean;
  orderSeed?: number;
  randomizeOrder?: boolean;
  systemPrompt?: string | null;
  warmup?: boolean;
};

type NumericFactorSpec = {
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  precision?: number;
};

type BenchSearchSpace = Partial<{
  context_window_size: NumericFactorSpec;
  temperature: NumericFactorSpec;
  top_p: NumericFactorSpec;
  top_k: NumericFactorSpec;
  max_tokens: NumericFactorSpec;
  presence_penalty: NumericFactorSpec;
  frequency_penalty: NumericFactorSpec;
  repetition_penalty: NumericFactorSpec;
  stream: boolean[];
  do_sample: boolean[];
  ignore_eos: boolean[];
  enable_thinking: boolean[];
}>;

type BenchCase = {
  id: string;
  prompt: string;
  weight: number;
  score: (output: string, error?: string) => number;
};

type BenchCaseResult = {
  id: string;
  prompt: string;
  output: string;
  error?: string;
  score: number;
  durationMs: number;
  stopReason?: ChatCompletionFinishReason;
  usage?: CompletionUsage;
};

type BenchSuiteResult = {
  config: LLMConfig;
  score: number;
  maxScore: number;
  scorePct: number;
  cases: BenchCaseResult[];
};

type BenchTrialResult = BenchSuiteResult & {
  hardFailureCount: number;
  orderSeed?: number;
  promptOrder: string[];
  seed?: number | null;
  trial: number;
};

type BenchReliabilityCaseSummary = {
  averageScore: number;
  hardFailures: number;
  id: string;
  maxScore: number;
  medianScore: number;
  minScore: number;
  stdev: number;
};

type BenchReliabilityResult = {
  config: LLMConfig;
  summary: {
    averageScore: number;
    caseSummaries: BenchReliabilityCaseSummary[];
    hardFailureCount: number;
    hardFailureRate: number;
    maxScore: number;
    medianScore: number;
    minScore: number;
    trialCount: number;
    zeroHardFailure: boolean;
  };
  trials: BenchTrialResult[];
};

type BenchApi = {
  clearAppChats: () => void;
  generateLatinHypercube: (
    space: BenchSearchSpace,
    count: number,
    seed?: number,
    base?: BenchConfig,
  ) => BenchConfig[];
  load: (override?: BenchConfig) => Promise<{
    config: LLMConfig;
    progress?: BrowserLLMPreloadProgress;
  }>;
  runReliability: (
    override?: BenchConfig,
    options?: BenchRunOptions & {
      seeds?: Array<number | null>;
      trials?: number;
    },
  ) => Promise<BenchReliabilityResult>;
  warmup: (
    override?: BenchConfig,
    options?: Pick<BenchRunOptions, "systemPrompt">,
  ) => Promise<void>;
  runPrompt: (
    prompt: string,
    override?: BenchConfig,
    options?: Pick<BenchRunOptions, "systemPrompt">,
  ) => Promise<BenchCaseResult & { config: LLMConfig }>;
  runSuite: (
    override?: BenchConfig,
    options?: BenchRunOptions,
  ) => Promise<BenchSuiteResult>;
  runBatch: (
    configs: BenchConfig[],
    options?: BenchRunOptions,
  ) => Promise<BenchSuiteResult[]>;
  screenConfigs: (
    configs: BenchConfig[],
    options?: BenchRunOptions & {
      seeds?: Array<number | null>;
      trials?: number;
    },
  ) => Promise<BenchReliabilityResult[]>;
  getState: () => {
    status: string;
    config: LLMConfig;
    progress?: BrowserLLMPreloadProgress;
    lastResult?: BenchSuiteResult;
  };
};

declare global {
  interface Window {
    __bench?: BenchApi;
  }
}

const DEFAULT_BENCH_CONFIG: LLMConfig = {
  model: DEFAULT_MODEL,
  cache: CacheType.Cache,
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

function stripReasoningPrelude(value: string) {
  return value
    .trim()
    .replace(/^<think>[\s\S]*?<\/think>\s*/i, "")
    .replace(
      /^<\|turn\>model\s*<\|channel\>thought[\s\S]*?<\|?channel\|>\s*/i,
      "",
    )
    .replace(/^<\|channel\>thought[\s\S]*?<\|?channel\|>\s*/i, "")
    .trim();
}

function normalizeText(value: string) {
  return stripReasoningPrelude(value).toLowerCase().replace(/\s+/g, " ");
}

function hasCodeFences(value: string) {
  return /```/.test(value);
}

function countWhitespaceTokens(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function parseStrictJson(value: string) {
  const trimmed = stripReasoningPrelude(value).trim();
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

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keysA = Object.keys(aObj);
  const keysB = Object.keys(bObj);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => deepEqual(aObj[key], bObj[key]));
}

function isGenericFailure(output: string, error?: string) {
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

const DEFAULT_SUITE: BenchCase[] = [
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
      const cleaned = stripReasoningPrelude(output).trim();
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
      const cleaned = stripReasoningPrelude(output).trim();
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
      const cleaned = stripReasoningPrelude(output).trim();
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
      const cleaned = stripReasoningPrelude(output).trim();
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
      const cleaned = stripReasoningPrelude(output).trim();
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
      const cleaned = stripReasoningPrelude(output).trim();
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

function mergeConfig(override?: BenchConfig): LLMConfig {
  return {
    ...DEFAULT_BENCH_CONFIG,
    ...override,
  };
}

function buildMessages(prompt: string, systemPrompt?: string | null) {
  const messages: RequestMessage[] = [];

  if (systemPrompt && systemPrompt.trim().length > 0) {
    messages.push({
      role: "system",
      content: systemPrompt,
    });
  }

  messages.push({
    role: "user",
    content: prompt,
  });

  return messages;
}

function scoreSuite(
  results: BenchCaseResult[],
  config: LLMConfig,
  tests: BenchCase[] = DEFAULT_SUITE,
): BenchSuiteResult {
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

function getPrecision(step?: number, fallback = 3) {
  if (!step || Number.isInteger(step)) return 0;
  const stepText = step.toString();
  const decimal = stepText.split(".")[1];
  return decimal ? decimal.length : fallback;
}

function quantizeValue(value: number, spec: NumericFactorSpec) {
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

function createSeededRng(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number) {
  const nextItems = [...items];
  for (let i = nextItems.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [nextItems[i], nextItems[j]] = [nextItems[j], nextItems[i]];
  }
  return nextItems;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function stdev(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
    values.length;
  return Math.sqrt(variance);
}

function getSuiteTests(caseIds?: string[], orderSeed?: number) {
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

function countHardFailures(results: BenchCaseResult[]) {
  return results.reduce(
    (sum, result) =>
      sum + (isGenericFailure(result.output, result.error) ? 1 : 0),
    0,
  );
}

function sampleLatinHypercube(
  space: BenchSearchSpace,
  count: number,
  seed = 1,
  base?: BenchConfig,
) {
  if (count <= 0) return [];

  const configs = Array.from({ length: count }, () => ({
    ...base,
  })) as BenchConfig[];
  const numericKeys = Object.entries(space).filter(
    ([, spec]) => spec && !Array.isArray(spec),
  ) as [keyof BenchSearchSpace, NumericFactorSpec][];
  const categoricalKeys = Object.entries(space).filter(([, spec]) =>
    Array.isArray(spec),
  ) as [keyof BenchSearchSpace, boolean[]][];

  numericKeys.forEach(([key, spec], keyIndex) => {
    const rng = createSeededRng(seed + keyIndex * 7919);
    const values = Array.from({ length: count }, (_, index) => {
      const fraction = (index + rng()) / count;
      const raw = spec.min + fraction * (spec.max - spec.min);
      return quantizeValue(raw, spec);
    });
    const shuffled = shuffleWithRng(values, rng);
    shuffled.forEach((value, index) => {
      configs[index][key as keyof BenchConfig] = value as never;
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
      configs[index][key as keyof BenchConfig] = value as never;
    });
  });

  return configs;
}

function summarizeReliability(
  trials: BenchTrialResult[],
  config: LLMConfig,
): BenchReliabilityResult {
  const scores = trials.map((trial) => trial.score);
  const testedCaseIds = new Set(
    trials.flatMap((trial) => trial.cases.map((entry) => entry.id)),
  );
  const allCases = DEFAULT_SUITE.filter((test) =>
    testedCaseIds.has(test.id),
  ).map((test) => {
    const cases = trials
      .map((trial) => trial.cases.find((entry) => entry.id === test.id))
      .filter(Boolean) as BenchCaseResult[];
    const scores = cases.map((entry) => entry.score);

    return {
      id: test.id,
      averageScore:
        scores.length > 0
          ? scores.reduce((sum, value) => sum + value, 0) / scores.length
          : 0,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      medianScore: median(scores),
      stdev: stdev(scores),
      hardFailures: cases.filter((entry) =>
        isGenericFailure(entry.output, entry.error),
      ).length,
    };
  });

  const hardFailureCount = trials.reduce(
    (sum, trial) => sum + trial.hardFailureCount,
    0,
  );
  const caseCount = trials.reduce((sum, trial) => sum + trial.cases.length, 0);

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

function compareReliabilityResults(
  left: BenchReliabilityResult,
  right: BenchReliabilityResult,
) {
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

export default function BenchPage() {
  const statusRef = useRef("idle");
  const configRef = useRef<LLMConfig>(DEFAULT_BENCH_CONFIG);
  const progressRef = useRef<BrowserLLMPreloadProgress>();
  const resultRef = useRef<BenchSuiteResult>();

  const [status, setStatus] = useState(statusRef.current);
  const [progress, setProgress] = useState<BrowserLLMPreloadProgress>();
  const [lastResult, setLastResult] = useState<BenchSuiteResult>();

  useEffect(() => {
    const api = new BrowserLLM("webWorker", "WARN");
    const clearAppChats = () => {
      useChatStore.getState().clearSessions();
    };

    const setBenchStatus = (nextStatus: string) => {
      statusRef.current = nextStatus;
      setStatus(nextStatus);
    };

    const load = async (override?: BenchConfig) => {
      const nextConfig = mergeConfig(override);
      configRef.current = nextConfig;
      setBenchStatus("loading");
      await api.preload(nextConfig, (nextProgress) => {
        progressRef.current = nextProgress;
        setProgress(nextProgress);
      });
      setBenchStatus("ready");
      return {
        config: nextConfig,
        progress: progressRef.current,
      };
    };

    const runPrompt = async (
      prompt: string,
      override?: BenchConfig,
      options?: Pick<BenchRunOptions, "systemPrompt">,
    ) => {
      const nextConfig = mergeConfig(override);
      configRef.current = nextConfig;
      const startedAt = performance.now();

      setBenchStatus("running");

      return await new Promise<BenchCaseResult & { config: LLMConfig }>(
        (resolve) => {
          let streamedOutput = "";

          const finish = (
            result: Omit<BenchCaseResult, "id" | "prompt" | "score">,
          ) => {
            setBenchStatus("ready");
            resolve({
              id: "adhoc",
              prompt,
              score: 0,
              ...result,
              config: nextConfig,
            });
          };

          api.chat({
            messages: buildMessages(prompt, options?.systemPrompt),
            config: nextConfig,
            onUpdate(message) {
              streamedOutput = message;
            },
            onFinish(message, stopReason, usage) {
              finish({
                output: message,
                durationMs: performance.now() - startedAt,
                stopReason,
                usage,
              });
            },
            onError(error) {
              finish({
                output: streamedOutput,
                error:
                  typeof error === "string"
                    ? error
                    : error.message || String(error),
                durationMs: performance.now() - startedAt,
              });
            },
          });
        },
      );
    };

    const warmup = async (
      override?: BenchConfig,
      options?: Pick<BenchRunOptions, "systemPrompt">,
    ) => {
      await runPrompt(WARMUP_PROMPT, override, options);
    };

    const runSuite = async (
      override?: BenchConfig,
      options?: BenchRunOptions,
    ) => {
      const nextConfig = mergeConfig(override);
      const tests = getSuiteTests(
        options?.caseIds,
        options?.randomizeOrder ? (options.orderSeed ?? 1) : undefined,
      );

      if (options?.clearAppChats) {
        clearAppChats();
      }

      await load(nextConfig);
      if (options?.warmup !== false) {
        await warmup(nextConfig, {
          systemPrompt: options?.systemPrompt,
        });
      }
      const results: BenchCaseResult[] = [];

      for (const test of tests) {
        const result = await runPrompt(test.prompt, nextConfig, {
          systemPrompt: options?.systemPrompt,
        });
        results.push({
          ...result,
          id: test.id,
          prompt: test.prompt,
          score: test.score(result.output, result.error),
        });
      }

      const summary = scoreSuite(results, nextConfig, tests);
      resultRef.current = summary;
      setLastResult(summary);
      return summary;
    };

    const runBatch = async (
      configs: BenchConfig[],
      options?: BenchRunOptions,
    ) => {
      const summaries: BenchSuiteResult[] = [];

      for (const config of configs) {
        summaries.push(await runSuite(config, options));
      }

      return summaries;
    };

    const runReliability = async (
      override?: BenchConfig,
      options?: BenchRunOptions & {
        seeds?: Array<number | null>;
        trials?: number;
      },
    ) => {
      const nextConfig = mergeConfig(override);
      const trialSeeds =
        options?.seeds && options.seeds.length > 0
          ? options.seeds
          : Array.from(
              { length: options?.trials ?? 5 },
              (_, index) => index + 1,
            );
      const trials: BenchTrialResult[] = [];

      await load(nextConfig);
      if (options?.warmup !== false) {
        await warmup(nextConfig, {
          systemPrompt: options?.systemPrompt,
        });
      }

      for (let index = 0; index < trialSeeds.length; index += 1) {
        const seed = trialSeeds[index];
        const orderSeed =
          options?.randomizeOrder === true
            ? (options.orderSeed ?? 10_007) + index
            : undefined;
        const trialConfig = mergeConfig({
          ...override,
          seed,
        });
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
    };

    const screenConfigs = async (
      configs: BenchConfig[],
      options?: BenchRunOptions & {
        seeds?: Array<number | null>;
        trials?: number;
      },
    ) => {
      const results: BenchReliabilityResult[] = [];
      for (const config of configs) {
        results.push(await runReliability(config, options));
      }
      return results.sort(compareReliabilityResults);
    };

    window.__bench = {
      clearAppChats,
      generateLatinHypercube: sampleLatinHypercube,
      load,
      warmup,
      runPrompt,
      runSuite,
      runBatch,
      runReliability,
      screenConfigs,
      getState() {
        return {
          status: statusRef.current,
          config: configRef.current,
          progress: progressRef.current,
          lastResult: resultRef.current,
        };
      },
    };

    return () => {
      if (window.__bench) {
        delete window.__bench;
      }
      api.abort().catch(() => undefined);
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        background: "#f4efe7",
        color: "#1f1a17",
      }}
    >
      <h1 style={{ marginTop: 0 }}>Bench</h1>
      <p style={{ maxWidth: 780, lineHeight: 1.5 }}>
        This route is a local tuning harness. Open the browser console or use
        Playwright and call <code>window.__bench</code> to load the model, run
        prompts, and sweep configs without reloading the page. The most useful
        methods are <code>generateLatinHypercube()</code> for broad screening,{" "}
        <code>runReliability()</code> for repeated seeded trials, and{" "}
        <code>screenConfigs()</code> for ranking configs by failure rate before
        deeper benchmarking.
      </p>
      <p style={{ maxWidth: 780, lineHeight: 1.5 }}>
        The default suite is 8 strict prompts, 28 points total: nested JSON,
        exact-word-count sentence, CSV with header, fence-free code, a two-step
        word problem, date extraction, an instruction-hierarchy test, and a
        structured extraction task. Every scorer is binary (exact match or 0)
        and rejects responses wrapped in code fences when the prompt forbids
        them. The case summaries report min, median, max, stdev, and
        hard-failure count per prompt so
        <code> screenConfigs()</code> can surface tight, stable winners instead
        of lucky runs.
      </p>

      <pre
        style={{
          padding: 16,
          borderRadius: 12,
          background: "#fffaf3",
          border: "1px solid #d9ccba",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {JSON.stringify(
          {
            status,
            config: configRef.current,
            progress,
            lastResult,
          },
          null,
          2,
        )}
      </pre>
    </main>
  );
}
