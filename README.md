# Gemmas

A **Gemma 4 chat app that runs entirely in your browser** — no server, no API key, no request ever leaves the tab. Weights stream from Hugging Face the first time, then live in browser storage. Inference is WebGPU through a **Transformers.js + ONNX Runtime Web** worker.

## Why this repo is interesting

- **Fully local Gemma 4 E2B-it** in a dedicated `Worker`, WebGPU by default, `q4f16` quantized, multimodal metadata (image + audio) wired in.
- **Custom preload pipeline** with eight observable phases — `checkingCache → preparingRuntime → requestingGpu → fetchingModelFiles → loadingModel → warmingUp → finalizing → ready`. The UI shows exactly where the load is and whether weights came from cache.
- **Pinned model revisions** in [`app/constant.ts`](app/constant.ts) so the browser cache key never drifts from under a user.
- **Abortable streaming** via Transformers.js `InterruptableStoppingCriteria`, tunneled through a typed request/response protocol ([`app/client/browser-llm-protocol.ts`](app/client/browser-llm-protocol.ts)).
- **A real benchmark lab**, not a toy. [`app/bench/page.tsx`](app/bench/page.tsx) exposes `window.__bench` with latin-hypercube sampling, reliability stages, multi-seed runs, and a scoring suite for format-exactness and concise-answer prompts.
- **Benchmark results checked into the repo** — see [`docs/benchmarks/`](docs/benchmarks/). Honest numbers, including where the browser path breaks.
- **Model variant tracks documented**, not hidden. See [`docs/uncensored-web-track.md`](docs/uncensored-web-track.md) for why the uncensored Gemma 4 browser path is currently parked and what will unblock it.

## Architecture

```
 app/page.tsx (chat UI)
        │
        ▼
 app/client/browser-llm.ts ──postMessage──► app/worker/web-worker.ts
   (BrowserLLM, typed RPC)                (Transformers.js + onnxruntime-web)
        ▲                                          │
        │                                          ▼
 stream / progress / result                 Gemma4ForConditionalGeneration
                                            Gemma4Processor
                                            WebGPU · q4f16
```

The main thread never blocks on inference. The worker loads Transformers.js from a pinned CDN URL, then loads the model from `onnx-community/gemma-4-E2B-it-ONNX` at fixed weight and processor revisions. WASM threading is forced to a single thread and the proxy is disabled to keep memory behavior predictable across Safari and Chrome.

## The bench lab

Open `/bench` in the running app and `window.__bench` appears on the page:

```ts
__bench.load(override?)
__bench.warmup(override?)
__bench.runPrompt(prompt, override?)
__bench.runSuite(override?, options?)
__bench.runBatch(configs, options?)
__bench.runReliability(override?, { seeds, trials })
__bench.screenConfigs(configs, { seeds, trials })
__bench.generateLatinHypercube(space, count, seed?, base?)
__bench.clearAppChats()
__bench.getState()
```

The built-in suite scores six prompts covering one-word answers, single-sentence factual composition, strict minified JSON, string reversal, letter counting, code-only output, and a longer-form explanation — each with weighted, deterministic scorers and a generic-failure detector that catches leaked `<think>` tags and "please tell me what you would like me to do" non-answers.

This is what produced the tuning notes in `docs/benchmarks/`.

## Current default preset

Derived from the 2026-04-23 tuning run. Non-thinking, stable across five seeds on the 17-point reliability subset:

```
temperature        1.00
top_p              0.95
top_k              64
repetition_penalty 1.05
context_window     16384
max_tokens         4000
do_sample          true
stream             true
```

Thinking mode is wired up (`enable_thinking`) but **not** the default — it still degrades format-sensitive prompts by emitting a visible `Thinking Process:` prelude instead of just answering.

## Honest limits

The model card advertises 128K context and the runtime metadata declares `max_context_window: 131072`. On the tested browser/hardware combo:

- raising `context_window_size` to `100000` or `131072` is accepted and **does not** regress the short benchmark
- actual long prefill failed with `RuntimeError: memory access out of bounds` somewhere between ~2.9k and higher prompt-token lengths

Treat the 128K number as **a config ceiling, not a validated effective context**. Real in-browser long-context on commodity hardware is an open problem, not a shipped feature.

## Caching

- Browser weight storage is selectable between **Cache API** and **IndexedDB** in the model config UI.
- Cache hits vs. fresh downloads are reflected in the preload progress (`cached: true | false | null`).
- Artifact caching is delegated to Transformers.js and the browser.

## Running it

```sh
yarn install
yarn dev
```

Requirements: Node.js, Yarn 1.x, a browser with WebGPU (recent Chrome/Edge, Safari 18+ with the feature enabled).

Other scripts:

```sh
yarn lint
yarn build            # standalone Next.js build
yarn export           # static export
./node_modules/.bin/tsc --noEmit
```

## Deployment

Three build modes:

- **Standalone Next.js** (`yarn build`) — deploy on Vercel, Node server, anything that runs Next.
- **Static export** (`yarn export`) — drop the output on any static host, including GitHub Pages.
- **Docker** — `docker build -t gemmas . && docker run -p 3000:3000 gemmas`. The Dockerfile honors `PROXY_URL` if you need outbound proxying for Hugging Face downloads.

## Optional: MLC-LLM REST mode

There's a secondary client ([`app/client/mlcllm.ts`](app/client/mlcllm.ts)) that points the UI at a local `mlc_llm serve` endpoint over REST. Not the focus, but it works.

## Layout

```
app/
  bench/page.tsx              ← benchmark lab + window.__bench
  client/
    api.ts                    ← LLMApi surface
    browser-llm-protocol.ts   ← typed worker RPC
    browser-llm.ts            ← main-thread BrowserLLM client
    mlcllm.ts                 ← optional REST client
  worker/web-worker.ts        ← Transformers.js + ORT worker
  constant.ts                 ← pinned model IDs, revisions, presets
  components/                 ← chat, settings, model config UI
  store/                      ← zustand stores
docs/benchmarks/              ← checked-in tuning notes
```

## Origin

Originally forked from [NextChat](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web) via [WebLLM Chat](https://github.com/mlc-ai/web-llm-chat); the runtime has since been rewritten on Transformers.js. Apache-2.0.
