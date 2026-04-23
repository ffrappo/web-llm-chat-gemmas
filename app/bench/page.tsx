"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChatCompletionFinishReason,
  CompletionUsage,
  LLMConfig,
  RequestMessage,
} from "../client/api";
import { WebLLMApi, WebLLMPreloadProgress } from "../client/webllm";
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
  minScore: number;
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
    progress?: WebLLMPreloadProgress;
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
    progress?: WebLLMPreloadProgress;
    lastResult?: BenchSuiteResult;
  };
};

declare global {
  interface Window {
    __webllmBench?: BenchApi;
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

function stripCodeFences(value: string) {
  return stripReasoningPrelude(value)
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

function normalizeCode(value: string) {
  return stripCodeFences(value)
    .replace(/\s+/g, " ")
    .replace(/\s*([{}();,+])/g, "$1")
    .replace(/([{}();,+])\s*/g, "$1")
    .trim();
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(stripCodeFences(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
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
    id: "capital-one-word",
    prompt: "Which city is the capital of France? Reply with exactly one word.",
    weight: 3,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const normalized = normalizeText(output);
      if (normalized === "paris") return 1;
      if (normalized.includes("paris")) return 0.35;
      return 0;
    },
  },
  {
    id: "capital-landmark-sentence",
    prompt:
      "In one short sentence, name France's capital and one famous landmark there.",
    weight: 4,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const normalized = normalizeText(output);
      const hasParis = normalized.includes("paris");
      const hasEiffel = normalized.includes("eiffel");
      if (hasParis && hasEiffel) return 1;
      if (hasParis || hasEiffel) return 0.25;
      return 0;
    },
  },
  {
    id: "json-response",
    prompt:
      'Reply with minified JSON only: {"capital":"...","landmark":"..."} for France.',
    weight: 4,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const parsed = parseJsonObject(output);
      if (!parsed) return 0;
      const capital = normalizeText(String(parsed.capital ?? ""));
      const landmark = normalizeText(String(parsed.landmark ?? ""));
      if (capital === "paris" && landmark.includes("eiffel")) return 1;
      if (capital === "paris" || landmark.includes("eiffel")) return 0.35;
      return 0;
    },
  },
  {
    id: "reverse-string",
    prompt:
      'Reply with exactly this reversed string and nothing else: "stressed".',
    weight: 2,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      return normalizeText(output) === "desserts" ? 1 : 0;
    },
  },
  {
    id: "count-letters",
    prompt:
      'Reply with exactly one number: how many letters are in the word "browser"?',
    weight: 2,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      return normalizeText(output) === "7" ? 1 : 0;
    },
  },
  {
    id: "code-only",
    prompt:
      "Return only JavaScript code that defines function add(a, b) { return a + b; }",
    weight: 3,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const normalized = normalizeCode(output);
      if (normalized === "function add(a,b){return a+b;}") return 1;
      if (
        normalized.includes("function add(a,b)") &&
        normalized.includes("return a+b;")
      ) {
        return 0.6;
      }
      return 0;
    },
  },
  {
    id: "service-worker",
    prompt:
      "In one complete sentence, explain what a service worker does in a browser.",
    weight: 3,
    score(output, error) {
      if (isGenericFailure(output, error)) return 0;
      const normalized = normalizeText(output);
      const mentionsServiceWorker =
        normalized.includes("service worker") ||
        normalized.includes("service-worker");
      const mentionsBehavior =
        normalized.includes("cache") ||
        normalized.includes("network") ||
        normalized.includes("background") ||
        normalized.includes("offline") ||
        normalized.includes("request");
      if (mentionsServiceWorker && mentionsBehavior) return 1;
      if (mentionsServiceWorker) return 0.35;
      return 0;
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

    return {
      id: test.id,
      averageScore:
        cases.length > 0
          ? cases.reduce((sum, entry) => sum + entry.score, 0) / cases.length
          : 0,
      minScore:
        cases.length > 0 ? Math.min(...cases.map((entry) => entry.score)) : 0,
      maxScore:
        cases.length > 0 ? Math.max(...cases.map((entry) => entry.score)) : 0,
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
  const progressRef = useRef<WebLLMPreloadProgress>();
  const resultRef = useRef<BenchSuiteResult>();

  const [status, setStatus] = useState(statusRef.current);
  const [progress, setProgress] = useState<WebLLMPreloadProgress>();
  const [lastResult, setLastResult] = useState<BenchSuiteResult>();

  useEffect(() => {
    const api = new WebLLMApi("webWorker", "WARN");
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

    window.__webllmBench = {
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
      if (window.__webllmBench) {
        delete window.__webllmBench;
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
      <h1 style={{ marginTop: 0 }}>WebLLM Bench</h1>
      <p style={{ maxWidth: 780, lineHeight: 1.5 }}>
        This route is a local tuning harness. Open the browser console or use
        Playwright and call <code>window.__webllmBench</code> to load the model,
        run prompts, and sweep configs without reloading the page. The most
        useful methods are <code>generateLatinHypercube()</code> for broad
        screening, <code>runReliability()</code> for repeated seeded trials, and{" "}
        <code>screenConfigs()</code> for ranking configs by failure rate before
        deeper benchmarking.
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
