"""Parse TruffleHog JSON output into Finding dicts."""
import json
from pathlib import Path


def parse_trufflehog_json(file_path: str) -> list[dict]:
    findings = []
    path = Path(file_path)
    if not path.exists():
        return findings

    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue

            detector = d.get("DetectorName") or d.get("detector_name") or "unknown"
            raw = d.get("Raw") or d.get("raw") or ""
            raw_v2 = d.get("RawV2") or d.get("raw_v2") or ""
            source = d.get("SourceMetadata") or {}
            source_data = source.get("Data") or {}
            location = ""
            for key in ("Filesystem", "Git", "Github", "S3", "Gcs"):
                if key in source_data:
                    inner = source_data[key]
                    location = (
                        inner.get("file")
                        or inner.get("filename")
                        or inner.get("repository")
                        or str(inner)
                    )
                    break

            verified = d.get("Verified") or d.get("verified") or False
            severity = "high" if verified else "medium"

            finding = {
                "title": f"Exposed Secret: {detector}",
                "severity": severity,
                "cvss": None,
                "cve": "",
                "cwe": "CWE-312",
                "target": location,
                "url": location,
                "description": (
                    f"TruffleHog detected an exposed {detector} secret. "
                    f"Verified: {verified}."
                ),
                "proof": (raw or raw_v2)[:500],
                "raw_output": line,
                "source_tool": "trufflehog",
                "template_id": f"trufflehog/{detector.lower()}",
                "tags": ["secrets", "exposure", detector.lower()],
                "extra": {
                    "detector": detector,
                    "verified": verified,
                    "source": location,
                },
            }
            findings.append(finding)

    return findings
