"""Local text-embedding service for the chat bot.

Loads one embedding model once (Qwen3-Embedding-0.6B by default, on the Apple GPU in float16) and
answers on 127.0.0.1 only, for every bot running on this machine at once (each room's bot asks it;
unlike the speech worker, it isn't one bot's at a time):

    GET  /info   -> {"model": "Qwen/Qwen3-Embedding-0.6B", "dims": 1024, "cutoff": 0.58}
    POST /embed  {"texts": ["…"], "kind": "query" | "document"}
                 -> {"model": "…", "vectors": [[…], …]}

Vectors are normalized, so a dot product is their cosine similarity. A `query` (what's being said
in the room now) gets the model's task instruction in front, a `document` (a memory) doesn't:
that's how Qwen3-Embedding is meant to be used, and in chat-bot/embedding-eval it ranked the right
memory first more often than without it. `cutoff` is the similarity under which a memory is taken
as not about what's being said, measured for the model in that eval (null when it hasn't been);
`--cutoff` overrides it.

Run it by hand before the bot, and leave it running:

    uv run serve.py                       # port 8759, Qwen3-Embedding-0.6B
    uv run serve.py --model Qwen/Qwen3-Embedding-4B --port 8759

The bot works without it: it then shows only its latest memories, as before. The first run
downloads the model from Hugging Face. Stop it with Ctrl+C.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

# What each model is told a query is for, and its cutoff (see chat-bot/embedding-eval/README.md): the
# score under which a memory is taken as not about what's being said. In the bot that score is
# 0.85 × cosine + 0.15 × the pinyin match, against each line being said, the best line counting.
# 0.58 for 0.6B is the best F1 for that on 400 real moments ("Speech vs chat" in the README;
# 0.54-0.60 did about as well): with it, a moment with nothing relevant still recalls something
# 29% of the time, against 55% for the whole window at 0.5. Recalibrate once rooms have thoughts
# and days of their own, or from the bot's `memory recall` log lines.
TASK_INSTRUCT = (
    "Given what is being said in a Chinese live-stream room (viewers' chat and the "
    "streamer's speech-to-text, which has typos), retrieve the bot's memory notes "
    "that are relevant to it"
)
MODELS: dict[str, dict[str, Any]] = {
    "Qwen/Qwen3-Embedding-0.6B": {"instruct": TASK_INSTRUCT, "cutoff": 0.58},
    "Qwen/Qwen3-Embedding-4B": {"instruct": TASK_INSTRUCT, "cutoff": None},
    "Qwen/Qwen3-Embedding-8B": {"instruct": TASK_INSTRUCT, "cutoff": None},
}

# A request bigger than this is refused: the bot sends a few hundred short lines at most.
MAX_BODY = 4 * 1024 * 1024
MAX_TEXTS = 512

Encode = Callable[[list[str], str], list[list[float]]]


def load(model_name: str) -> Encode:
    """The model, loaded now, as a function from texts and their kind to normalized vectors."""
    import torch
    from sentence_transformers import SentenceTransformer

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.float16 if device == "mps" else torch.float32
    model = SentenceTransformer(model_name, device=device, model_kwargs={"torch_dtype": dtype})
    instruct = MODELS.get(model_name, {}).get("instruct")
    print(f"loaded {model_name} on {device}", file=sys.stderr, flush=True)
    lock = threading.Lock()

    def encode(texts: list[str], kind: str) -> list[list[float]]:
        prompt = f"Instruct: {instruct}\nQuery:" if kind == "query" and instruct else None
        # One at a time: the GPU is shared, and the bot's questions are small.
        with lock:
            vectors = model.encode(
                texts, prompt=prompt, batch_size=32, normalize_embeddings=True, convert_to_numpy=True
            )
        return [[round(float(x), 6) for x in vector] for vector in vectors]

    return encode


def handler(model_name: str, cutoff: float | None, encode: Encode) -> type[BaseHTTPRequestHandler]:
    dims: list[int] = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            pass

        def answer(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            if self.path != "/info":
                self.answer(404, {"error": "not found"})
                return
            if not dims:
                dims.append(len(encode(["你好"], "document")[0]))
            self.answer(200, {"model": model_name, "dims": dims[0], "cutoff": cutoff})

        def do_POST(self) -> None:
            if self.path != "/embed":
                self.answer(404, {"error": "not found"})
                return
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                self.answer(413, {"error": "body too large or empty"})
                return
            try:
                request = json.loads(self.rfile.read(length))
            except ValueError:
                self.answer(400, {"error": "not JSON"})
                return
            texts = request.get("texts") if isinstance(request, dict) else None
            kind = request.get("kind") if isinstance(request, dict) else None
            if (
                not isinstance(texts, list)
                or not all(isinstance(text, str) for text in texts)
                or len(texts) > MAX_TEXTS
                or kind not in ("query", "document")
            ):
                self.answer(400, {"error": 'want {"texts": [str, …], "kind": "query" | "document"}'})
                return
            vectors = encode(texts, kind) if texts else []
            self.answer(200, {"model": model_name, "vectors": vectors})

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Local text-embedding service for the chat bot.")
    parser.add_argument("--model", default="Qwen/Qwen3-Embedding-0.6B")
    parser.add_argument("--port", type=int, default=8759)
    parser.add_argument("--cutoff", type=float, help="overrides the model's measured cutoff")
    args = parser.parse_args()
    cutoff = args.cutoff if args.cutoff is not None else MODELS.get(args.model, {}).get("cutoff")
    encode = load(args.model)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler(args.model, cutoff, encode))
    print(f"listening on 127.0.0.1:{args.port}", file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
