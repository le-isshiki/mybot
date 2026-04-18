"""Parse httpx JSONL output."""
import json
from pathlib import Path


def parse_httpx_jsonl(file_path: str) -> list[dict]:
    results = []
    path = Path(file_path)
    if not path.exists():
        return results

    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                results.append({
                    "url": d.get("url") or d.get("input") or "",
                    "status_code": d.get("status-code") or d.get("status_code"),
                    "title": d.get("title") or "",
                    "tech": d.get("tech") or d.get("technologies") or [],
                    "content_length": d.get("content-length"),
                    "webserver": d.get("webserver") or "",
                    "cdn": d.get("cdn") or False,
                    "ip": d.get("a") or d.get("host") or "",
                })
            except json.JSONDecodeError:
                continue

    return results
