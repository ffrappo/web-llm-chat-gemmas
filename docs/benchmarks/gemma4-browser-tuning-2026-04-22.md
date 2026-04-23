# Gemma 4 Browser Tuning Notes (2026-04-22)

Artifact under test:
- Model id: `gemma-4-E2B-it-q4f16_1-MLC-r387f4e9`
- Runtime: local WebLLM app, Chromium via Playwright, one cached model load

Environment held fixed during the main search:
- `context_window_size=4096`
- `max_tokens=96`
- `presence_penalty=0`
- `frequency_penalty=0`
- `stream=true`
- `ignore_eos=false`
- chats cleared between trials

External context:
- Google's base `gemma-4-e2b-it` model card advertises `128K` native context for E2B.
- The custom `welcoma/gemma-4-E2B-it-q4f16_1-MLC` WebLLM artifact used here is packaged with `4096` context.
- Current WebLLM long-context work is still constrained by browser KV-cache memory and precompiled context-window support.

## Search method

1. Broad screen:
   - Latin hypercube over `temperature`, `top_p`, and `repetition_penalty`
   - short 3-prompt suite
   - `seed=null`
2. Reliability stage:
   - 5-prompt suite
   - seeds: `null`, `1`, `101`, `202`, `303`
3. Role-conditioning checks:
   - neutral system prompt vs no system prompt
4. Follow-up checks:
   - `presence_penalty=+0.2`
   - `frequency_penalty=+0.2`
   - `context_window_size=8192`
   - harder exact-format prompts

## Broad-screen survivors

Quick 3-prompt screen (`capital-one-word`, `code-only`, `service-worker`):

| Recipe | Quick score | Hard failures |
| --- | ---: | ---: |
| `temp=1.05 top_p=1.00 rep=1.01` | `7.8 / 9` | 0 |
| `temp=0.80 top_p=0.95 rep=1.08` | `7.8 / 9` | 0 |
| `temp=0.95 top_p=1.00 rep=1.06` | `7.8 / 9` | 0 |
| `temp=0.85 top_p=0.85 rep=1.04` | `6.0 / 9` | 0 |
| `temp=0.95 top_p=0.90 rep=1.02` | `4.8 / 9` | 0 |
| `temp=1.05 top_p=0.90 rep=1.05` | `4.8 / 9` | 0 |

Thinking-enabled configs were screened separately and were dropped early because they repeatedly leaked thought-channel text or returned empty/filler outputs instead of answers.

## Finalists

### Peak

Config:
- `temperature=1.05`
- `top_p=1.00`
- `repetition_penalty=1.01`
- `context_window_size=4096`
- `presence_penalty=0`
- `frequency_penalty=0`
- `stream=true`
- `ignore_eos=false`

5-seed reliability:
- average score: `4.56 / 17`
- max score: `10 / 17`
- min score: `0 / 17`
- hard failures: `0 / 25`

Per-seed scores:
- `seed=null`: `0`
- `seed=1`: `10`
- `seed=101`: `4`
- `seed=202`: `1.8`
- `seed=303`: `7`

Read:
- best upside
- zero hard failures in this run
- noticeably volatile

### Stable

Config:
- `temperature=0.80`
- `top_p=0.95`
- `repetition_penalty=1.08`
- `context_window_size=4096`
- `presence_penalty=0`
- `frequency_penalty=0`
- `stream=true`
- `ignore_eos=false`

5-seed reliability:
- average score: `3.61 / 17`
- max score: `7 / 17`
- min score: `1 / 17`
- hard failures: `0 / 25`

Per-seed scores:
- `seed=null`: `7`
- `seed=1`: `6`
- `seed=101`: `1.05`
- `seed=202`: `3`
- `seed=303`: `1`

Read:
- lower ceiling than Peak
- less collapse at the low end
- best candidate for the default browser preset

### Bench

Config:
- same sampler as Peak
- `max_tokens=96`

Purpose:
- reproduce the short-prompt bench conditions quickly

## What did not help

Neutral system prompt:
- sometimes smoothed a 3-seed run
- did not stay safe over 5 seeds
- introduced hard failures for the service-worker prompt

Thinking mode:
- frequent thought-channel leakage
- empty/filler outputs
- not suitable as the default path for this runtime

Penalty changes:
- `presence_penalty=+0.2` made the best baseline worse
- `frequency_penalty=+0.2` was much worse

Context window:
- the Peak recipe at `context_window_size=8192` scored `0 / 17` across 3 seeds
- this does not prove Gemma 4 is a "4K model"
- it does show that this specific browser/runtime/artifact combination became unusable at 8K on the short benchmark

## Harder exact-format prompts

Two finalists were spot-checked on stricter prompts with `seed=1`:
- both handled a simple instruction-hierarchy prompt (`blue`)
- both failed strict JSON-only output
- both failed exact arithmetic-only output
- both failed CSV-only sorting
- both failed exact code-only output

Interpretation:
- current browser Gemma 4 tuning can avoid hard failures on basic chat-like prompts
- structured exactness is still weak and needs separate investigation
