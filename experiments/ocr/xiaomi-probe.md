# Xiaomi-OCR-0 CPU feasibility probe

Date: 2026-11-04. This is a local research probe, not production extension integration.

- Host has about 10 GiB RAM, no NVIDIA runtime, no preinstalled Ollama/PyTorch/Transformers.
- Ollama `v0.40.14` Linux x64 runtime archive is 1,525,335,029 bytes, so it was not installed.
- A smaller CPU runtime was obtained instead: llama.cpp `b12091`, version `0.8.0-dev`, commit `0f35d6d7b`. Its x64 CPU release archive is 22,963,980 bytes; `llama-server --version` runs successfully.
- Candidate: community `longwayxu/xiaomi-ocr-0:bf16` package referenced in the Xiaomi repository's `OLLAMA.md`.
- Language model: 1,557,662,848 bytes, SHA256 `f4f2f14b6d330a8e8df509b2de98bb4e2704a0ba6bead22e4d4b9361dc33c76f`.
- Vision projector: 207,346,528 bytes, SHA256 `aa8b9bed474e2f5c34356c15e25c35a82f0da55ba6e76d36f710d6acdb82e2a8`.
- These weights are not included in the repository or extension.

## Reproduction

Obtain the runtime and the above model/projector locally and verify their hashes. No installer or model download runs as part of the prototype.

```bash
llama-server \
  --model /path/to/model.gguf --mmproj /path/to/mmproj.gguf \
  --alias xiaomi-ocr-0 --host 127.0.0.1 --port 8080 \
  --ctx-size 16384 --parallel 1 --threads 4 --threads-batch 4 \
  --n-gpu-layers 0 --no-mmproj-offload \
  --jinja --chat-template-kwargs '{"enable_thinking": false}'

python3 experiments/ocr/benchmark-xiaomi.py \
  --endpoint http://127.0.0.1:8080/v1 --model xiaomi-ocr-0 \
  --runtime-version 'llama.cpp b12091 (0f35d6d7b), CPU, 4 threads, ctx16384, parallel1' \
  --model-sha256 f4f2f14b6d330a8e8df509b2de98bb4e2704a0ba6bead22e4d4b9361dc33c76f \
  --projector-sha256 aa8b9bed474e2f5c34356c15e25c35a82f0da55ba6e76d36f710d6acdb82e2a8 \
  --ids eng-paragraphs-a rus-paragraphs-a
```

The adapter uses the official text-region prompt `Extract the text in the image.` on whole-page fixtures. This tests our plain-text use case; it does **not** reproduce the authors' two-stage document benchmark. Their full document prompt explicitly ignores headers and footers and emits table/formula markup, which is not the intended behavior for our initial text comparison mode.

Only literal loopback HTTP endpoints are allowed; ambient HTTP proxies and redirects are disabled. Model/runtime identifiers and hashes must be supplied explicitly. Temperature 0, seed 0, top-p 1, non-thinking template flag, token budget and raw finish reason are recorded. A `length` finish is `truncated`, never successful. These settings improve reproducibility but do not guarantee identical inference across runtimes/hardware. Server memory is not measured by the HTTP adapter.

Six adapter tests cover loopback restrictions, redirect refusal, truncation, unknown finish reasons, missing content, and exact Cyrillic text preservation.

Sources:
- https://github.com/xiaomi-research/Xiaomi-OCR-0/blob/main/OLLAMA.md
- https://huggingface.co/xiaomi-research/Xiaomi-OCR-0
- https://github.com/ggml-org/llama.cpp/releases/tag/b12091
