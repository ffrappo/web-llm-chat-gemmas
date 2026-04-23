# Gemma 4 Transformers.js Browser Tuning Notes (2026-04-23)

Artifact under test:
- Model id: `gemma-4-E2B-it-ONNX-onnx-ree1a73e`
- Runtime: local production build, Chromium via Playwright, Transformers.js browser worker, one preload and then hot runs in the same tab

Environment held fixed during the main search:
- `context_window_size=4096`
- `max_tokens=96`
- `top_k=64`
- `do_sample=true`
- `presence_penalty=0`
- `frequency_penalty=0`
- `stream=true`
- `ignore_eos=false`
- chats cleared between trials

## Search method

1. Broad screen:
   - Latin hypercube over `temperature`, `top_p`, and `repetition_penalty`
   - 12 configs
   - short 3-prompt suite: `capital-one-word`, `code-only`, `service-worker`
   - `seed=null`
2. Reliability stage:
   - 6-prompt, 17-point subset:
     - `capital-one-word`
     - `capital-landmark-sentence`
     - `reverse-string`
     - `count-letters`
     - `code-only`
     - `service-worker`
   - seeds: `null`, `1`, `101`, `202`, `303`
3. Follow-up checks:
   - neutral system prompt
   - `presence_penalty=+0.2`
   - `frequency_penalty=+0.2`
   - `context_window_size=8192`
4. Exact-format spot checks:
   - one-word hierarchy
   - minified JSON only
   - arithmetic only
   - CSV only
   - code only
5. Thinking-mode spot check:
   - 4-prompt subset
   - seeds: `null`, `1`, `101`

## Broad screen

The short 3-prompt screen saturated immediately.

All 12 sampled configs scored `9 / 9` with `0` hard failures.

Representative tied configs:

| Recipe | Quick score | Hard failures |
| --- | ---: | ---: |
| `temp=0.95 top_p=0.90 rep=1.03` | `9 / 9` | 0 |
| `temp=0.90 top_p=0.85 rep=1.08` | `9 / 9` | 0 |
| `temp=1.10 top_p=0.95 rep=1.00` | `9 / 9` | 0 |
| `temp=0.80 top_p=0.85 rep=1.10` | `9 / 9` | 0 |
| `temp=1.00 top_p=0.95 rep=1.05` | `9 / 9` | 0 |
| `temp=1.15 top_p=0.80 rep=1.06` | `9 / 9` | 0 |

Read:
- this benchmark is too easy for the current non-thinking path
- broad screening does not separate configs

## Reliability stage

Six configs were carried into the 17-point reliability subset. All six tied.

Every tested config scored:
- average score: `17 / 17`
- max score: `17 / 17`
- min score: `17 / 17`
- hard failures: `0 / 30`

The current default-style preset stayed perfect:
- `temperature=1.00`
- `top_p=0.95`
- `repetition_penalty=1.05`
- `context_window_size=4096`
- `top_k=64`
- `do_sample=true`
- `stream=true`
- `ignore_eos=false`

Per-seed scores for the default-style preset:
- `seed=null`: `17`
- `seed=1`: `17`
- `seed=101`: `17`
- `seed=202`: `17`
- `seed=303`: `17`

Interpretation:
- the current non-thinking integration is stable on this suite
- this suite no longer gives enough pressure to justify changing the current default preset

## Follow-up checks

None of the old failure patterns reproduced on the tested subset.

Neutral system prompt (`You are a concise assistant.`):
- `17 / 17` average over 5 seeds
- `0` hard failures

`presence_penalty=+0.2`:
- `17 / 17` average over 3 seeds
- `0` hard failures

`frequency_penalty=+0.2`:
- `17 / 17` average over 3 seeds
- `0` hard failures

`context_window_size=8192`:
- `17 / 17` average over 3 seeds
- `0` hard failures

Read:
- the penalty knobs did not materially change score on the tested subset

## Exact-format spot checks

Using the current default-style preset with `seed=1`:

- passed: instruction-hierarchy one-word output (`blue`)
- passed: strict minified JSON only (`{"capital":"Paris","letters_in_browser":7}`)
- passed: arithmetic-only output (`731`)
- partial fail: CSV-only sorting dropped the header and returned only rows
- partial fail: strict code-only output still came back wrapped in fenced code blocks

Interpretation:
- exactness is materially better than the old browser run
- fully strict formatting is still not solved

## Thinking mode

Thinking-enabled runs no longer hard-failed, but they are still not clean for exact-format or concise-output tasks.

Config:
- same default-style sampler
- `enable_thinking=true`

4-prompt subset (`capital-one-word`, `capital-landmark-sentence`, `code-only`, `service-worker`) over 3 seeds:
- average score: `11.2 / 13`
- max score: `13 / 13`
- min score: `8.8 / 13`
- hard failures: `0 / 12`

Observed behavior:
- the model often emitted visible `Thinking Process:` text instead of directly answering
- format-sensitive prompts, especially `code-only`, degraded because the answer was replaced by thought text

Read:
- thinking mode is better than before because it no longer collapses into empty/filler output
- it is still not suitable as the default browser path when users need strict formatting or concise answers

## Recommendation

- Keep the current non-thinking default preset: `temp=1.00 top_p=0.95 rep=1.05 top_k=64`.
- Do not retune the default from this benchmark alone; the suite is now saturated.
- If we want meaningful further tuning, the next benchmark needs harder structured-output and longer-context prompts.

## High-context follow-up

Follow-up request:
- try much larger `context_window_size` values, around `100000`

Important implementation note:
- in the current Transformers.js worker, changing `context_window_size` does not reload the model
- for short prompts, this mainly changes tokenizer/generation limits, not the underlying loaded model identity
- because of that, a short prompt at `100000` is only a config acceptance check, not proof of real 100k-token operation

### Short-prompt checks

Using the same default-style preset with only `context_window_size` changed:

`context_window_size=100000`
- loaded successfully
- 6-prompt reliability subset over seeds `null`, `1`, `101`: `17 / 17` average, `0` hard failures

`context_window_size=131072`
- loaded successfully
- 6-prompt reliability subset over seeds `null`, `1`, `101`: `17 / 17` average, `0` hard failures

Read:
- the short benchmark does not regress when the configured window is raised to `100000` or the declared max

### Long-prefill smoke test

To actually exercise a larger prompt, the bench route was used with a synthetic filler prompt under `context_window_size=100000` and `max_tokens=8`.

Results from clean worker reloads:
- filler size `500`: success, output `OK.`, `prompt_tokens=1912`, runtime about `12.9s`
- filler size `750`: success, output `OK`, `prompt_tokens=2912`, runtime about `32.4s`
- filler size `1000`: failed with `RuntimeError: memory access out of bounds`, runtime about `31.6s`

Interpretation:
- the current browser/runtime combination accepts very large configured context windows
- but a real long prefill still runs into a memory/runtime limit far below 100k tokens on this machine/browser
- from this synthetic prompt family, the practical failure boundary is somewhere above roughly `2912` prompt tokens and below the next larger test case

Conclusion:
- `100000` is not currently a trustworthy “real usable context” claim for this browser path
- it is better described as an accepted config ceiling than a validated effective context length
