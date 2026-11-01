"""OCR worker for dy-browse: Apple Vision (macOS's VNRecognizeTextRequest) through `ocrmac`.

Reads one JSON object per line from stdin and answers each with one JSON line on stdout:

    {"image": "/path/to/frame.jpg"}   ->  {"lines": [{"text": "…", "confidence": 0.98}, …]}
                                          or {"error": "…"} when the image can't be read
    {"quit": true}                    ->  exits (so does closing stdin)

It prints `{"ready": true}` once it's started. Languages are zh-Hans, zh-Hant and en. macOS only:
dy-browse doesn't start it anywhere else. Logs go to stderr.

    uv run ocr-worker.py
"""

import json
import sys

LANGUAGES = ["zh-Hans", "zh-Hant", "en"]


def recognize(path: str) -> list[dict]:
    from ocrmac import ocrmac  # imported late so a start-up error is reported as one

    annotations = ocrmac.OCR(
        path, language_preference=LANGUAGES, recognition_level="accurate"
    ).recognize()
    return [{"text": text, "confidence": float(confidence)} for text, confidence, _box in annotations]


def say(message: dict) -> None:
    print(json.dumps(message, ensure_ascii=False), flush=True)


def main() -> None:
    say({"ready": True})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as error:
            say({"error": f"bad request: {error}"})
            continue
        if request.get("quit"):
            break
        try:
            say({"lines": recognize(request["image"])})
        except Exception as error:  # one bad image must not stop the run
            print(f"ocr failed: {error}", file=sys.stderr)
            say({"error": str(error)})


if __name__ == "__main__":
    main()
