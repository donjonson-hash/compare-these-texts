#!/usr/bin/env python3
"""OCR-only probe against an explicitly configured local OpenAI-compatible server.
No model download, hosted inference, installer, or external document transmission.
"""
import argparse
import base64
import datetime
import hashlib
import ipaddress
import json
from pathlib import Path
import platform
import time
import urllib.error
import urllib.parse
import urllib.request

PROMPT = "Extract the text in the image."


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Inference redirects are not allowed")


def endpoint(value):
    parsed = urllib.parse.urlsplit(value)
    try:
        local = ipaddress.ip_address(parsed.hostname or "").is_loopback
    except ValueError:
        local = False
    if (parsed.scheme != "http" or not local or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path.rstrip("/") != "/v1"):
        raise argparse.ArgumentTypeError("Use a literal loopback endpoint, e.g. http://127.0.0.1:8080/v1")
    try:
        parsed.port
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Invalid port") from exc
    return value.rstrip("/")


def parse_response(response):
    choice = response["choices"][0]
    message = choice["message"]
    text = message.get("content")
    if not isinstance(text, str):
        raise ValueError("No text content in model response")
    finish = choice.get("finish_reason")
    # Unknown finish reasons are not counted as successful recognition.
    status = "ok" if finish == "stop" else "truncated" if finish == "length" else "error"
    return {"status": status, "text": text, "finish_reason": finish,
            "usage": response.get("usage"), "reasoning_content": message.get("reasoning_content")}


def main():
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", type=endpoint, default="http://127.0.0.1:8080/v1")
    parser.add_argument("--model", required=True, help="Exact model name exposed by your local server")
    parser.add_argument("--runtime-version", required=True)
    parser.add_argument("--model-sha256", required=True)
    parser.add_argument("--projector-sha256", required=True)
    parser.add_argument("--fixtures", type=Path, default=here / "fixtures")
    parser.add_argument("--output", type=Path, default=here / "results/xiaomi-cpu.json")
    parser.add_argument("--ids", nargs="*", help="Optional explicit subset of fixture IDs")
    parser.add_argument("--max-tokens", type=int, default=2048)
    parser.add_argument("--timeout", type=float, default=180)
    args = parser.parse_args()
    if not 1 <= args.max_tokens <= 8192 or not 0 < args.timeout <= 600:
        parser.error("max-tokens must be 1..8192 and timeout must be >0..600 seconds")
    for value in [args.model_sha256, args.projector_sha256]:
        if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            parser.error("Provide actual lowercase SHA256 digests of the model and projector files")
    manifest_bytes = (args.fixtures / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    if args.ids:
        unknown = set(args.ids) - {item["id"] for item in manifest}
        if unknown:
            parser.error("Unknown fixture IDs: " + ", ".join(sorted(unknown)))
        manifest = [item for item in manifest if item["id"] in args.ids]
    settings = {"temperature": 0, "seed": 0, "top_p": 1, "max_tokens": args.max_tokens,
                "stream": False, "chat_template_kwargs": {"enable_thinking": False}}
    report = {"engine": "Xiaomi-OCR-0/local-openai-compatible", "version": args.runtime_version,
              "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
              "environment": {"platform": platform.platform(), "python": platform.python_version(),
                              "model": args.model, "model_sha256": args.model_sha256,
                              "projector_sha256": args.projector_sha256, "prompt": PROMPT,
                              "generation_settings": settings, "memory": "not measured",
                              "scope": "plain-text prompt on whole fixture images; not the author's two-stage document benchmark"},
              "results": []}
    # Ignore ambient proxy settings and refuse redirects; only send to loopback.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for item in manifest:
        image_path = (args.fixtures / item["image"]).resolve()
        image_path.relative_to(args.fixtures.resolve())
        data = image_path.read_bytes()
        if len(data) > 10 * 1024 * 1024:
            raise ValueError("Fixture exceeds 10 MiB limit")
        payload = {"model": args.model, **settings, "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(data).decode()}},
            {"type": "text", "text": PROMPT}]}]}
        truth_path = (args.fixtures / item["truth"]).resolve()
        truth_path.relative_to(args.fixtures.resolve())
        row = {"id": item["id"], "image_sha256": hashlib.sha256(data).hexdigest(),
               "truth_sha256": hashlib.sha256(truth_path.read_bytes()).hexdigest()}
        started = time.perf_counter()
        try:
            req = urllib.request.Request(args.endpoint + "/chat/completions",
                                         data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
            with opener.open(req, timeout=args.timeout) as response:
                raw = response.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise ValueError("Inference response exceeds 4 MiB limit")
            row.update(parse_response(json.loads(raw)))
        except (TimeoutError, urllib.error.URLError, ValueError, KeyError, IndexError, TypeError) as exc:
            timeout = isinstance(exc, TimeoutError) or isinstance(getattr(exc, "reason", None), TimeoutError)
            row.update(status="timeout" if timeout else "error", text="", error=str(exc))
        row["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
        report["results"].append(row)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(item["id"], row["status"], row["elapsed_ms"], flush=True)
    print(args.output)


if __name__ == "__main__":
    main()
