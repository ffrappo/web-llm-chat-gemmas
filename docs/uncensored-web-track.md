# Uncensored Gemma 4 E2B in the browser — status & blockers

**Date:** 2026-04-24
**Status:** parked. No clean path exists in the browser today. Native app track is the primary path for uncensored Gemma 4.

## What we want

Swap the default `onnx-community/gemma-4-E2B-it-ONNX` for an uncensored variant of the same model, keeping the existing browser-only architecture (WebGPU, streaming, cached weights, zero server calls). Target: **parity or better perf than the current setup**, no regressions in user experience.

## What was tried

| Session | Approach | Outcome |
|---------|----------|---------|
| 2026-04-23 | Custom ONNX export of `HauhauCS/Gemma-4-E2B-Uncensored` (only GGUF, unusable) and weight-swap into `onnx-community` fp16 files | Local OOM during PyTorch weight loading. Thunder A100 session ended up running the base-model benchmark instead — see [`remote-gpu-a100-2026-04-23.md`](./benchmarks/remote-gpu-a100-2026-04-23.md). |
| 2026-04-24 | Researched alternative browser runtimes (wllama, WebLLM) and tried to reproduce `onnx-community`'s conversion pipeline | All three browser paths hit hard blockers (see next section). No regression-free path. |

## Why each browser runtime is blocked

### 1. `@huggingface/transformers` (current path) — ONNX conversion gap

- `onnx-community/gemma-4-E2B-it-ONNX` ships 4 submodule ONNX files × 5 dtype variants (`embed_tokens`, `decoder_model_merged`, `vision_encoder`, `audio_encoder`). The conversion pipeline that produced them **is not public**. [HF discussion #3](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/discussions/3) was opened asking for the script; `@xenova` has not responded (9 days as of writing).
- `huggingface/optimum-onnx` main has Gemma 3 configs but **zero Gemma 4 support** — no `Gemma4OnnxConfig`, no `gemma4` entry in `optimum/exporters/onnx/model_configs.py`.
- `huggingface/transformers` main *does* have `src/transformers/models/gemma4/` (so `Gemma4ForConditionalGeneration` loads), but a custom `torch.onnx.export` must solve three non-obvious problems to match the shipped layout:
  1. **Per-Layer Embeddings (PLE)** have to be fused into `embed_tokens.onnx` as a `per_layer_inputs` output — there is no clean PyTorch module boundary for this.
  2. `vision_encoder` adds a new `pixel_position_ids` input vs Gemma 3n, so the 3n exporter cannot be copied.
  3. `decoder_model_merged` at fp16 exceeds the 2 GB protobuf limit without carefully sharded external data.
- Search of HF for forks (`huggingworld`, `LemOneLabs`, `matsudai17`, `giebebs`, `madhured/*`, etc.) found only re-uploads or fine-tunes of the base ONNX — no independent conversion of an uncensored variant exists.

### 2. MLC WebLLM — Gemma 4 not supported

- [`mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) model catalog only lists Gemma **2** (`gemma-2-2b-it-*-MLC`). No Gemma 4 entries.
- No commits mentioning `gemma` or `sliding` window since 2026-01-01 (this project's first Gemma 4 WebLLM attempt failed on Gemma 4's sliding-window attention — see commit `842f45e`, later switched to Transformers.js in `3f7ac93`).
- Would require MLC-compiling the uncensored Gemma 4 safetensors via `mlc_llm compile` — a separate pipeline gap equivalent to the ONNX one.

### 3. wllama (GGUF in browser) — no WebGPU

- wllama explicitly states: **"Currently, there is no WebGPU support, although it might be considered for future releases."** It runs llama.cpp under WebAssembly SIMD, CPU-only.
- Swapping to wllama would regress inference speed vs the current WebGPU path by an order of magnitude. Not acceptable for the "powerful" pitch.

## Where uncensored Gemma 4 *does* work today

- **Native Apple (iOS + iPadOS + macOS)** via llama.cpp Metal — any uncensored GGUF drops in (e.g. `HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive` Q4_K_P, ~300k downloads). This is the primary uncensored roadmap; see the native app track for details.
- **MLX on Apple Silicon** — `deadbydawn101/gemma-4-E2B-Heretic-Uncensored-mlx-4bit` exists on HF, loads directly via `mlx-lm`.
- **llama.cpp / node-llama-cpp** on desktop — any Windows/Linux/Mac with a GPU or modern CPU.

## Revisit triggers

Re-open this track when **any one** of the following changes:

- [ ] `@xenova` or the onnx-community team publishes / replies with the Gemma 4 conversion pipeline.
- [ ] `huggingface/optimum-onnx` ships a `Gemma4OnnxConfig` (watch the main branch and v2.x release notes).
- [ ] `mlc-ai/web-llm` adds Gemma 4 to its catalog — either the base or a community-compiled uncensored variant.
- [ ] `ngxson/wllama` adds WebGPU support.
- [ ] A third party publishes an uncensored Gemma 4 E2B ONNX that matches the onnx-community structure (check HF quarterly — search terms: `gemma-4-E2B onnx uncensored`, `gemma-4 onnx abliterated`, `gemma-4 E2B onnx-community fine-tune`).

## Not recommended

- **Do not** ship a CPU-only wllama path as an "Uncensored (slow)" mode. The perf regression will be interpreted as the uncensored variant being worse, not as a runtime limitation, and it contradicts the product pitch.
- **Do not** attempt a custom `torch.onnx.export` of Gemma 4 without first having the `vision_encoder` + PLE problems solved on the base model — those failure modes are not cheap to debug on a $0.78/hr clock. If the pipeline is still unavailable when revisiting, open a PR against `huggingface/optimum-onnx` adding a `Gemma4OnnxConfig` (~1 week calendar, zero GPU cost) rather than a one-off export script.

## Related files

- [`app/constant.ts`](../app/constant.ts) — current model ID and revision pinning
- [`app/worker/web-worker.ts`](../app/worker/web-worker.ts) — Transformers.js + ONNX Runtime Web worker
- [`app/client/browser-llm.ts`](../app/client/browser-llm.ts) — RPC client
- [`docs/benchmarks/remote-gpu-a100-2026-04-23.md`](./benchmarks/remote-gpu-a100-2026-04-23.md) — GPU baseline
