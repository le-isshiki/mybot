"""Parse nuclei JSONL output into Finding dicts."""
import json
from pathlib import Path


def parse_nuclei_jsonl(file_path: str) -> list[dict]:
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

            info = d.get("info", {})
            severity = (info.get("severity") or "info").lower()
            cvss = None
            classification = info.get("classification", {})
            if classification:
                cvss_metrics = classification.get("cvss-metrics") or ""
                cvss_score = classification.get("cvss-score")
                if cvss_score:
                    try:
                        cvss = float(cvss_score)
                    except (ValueError, TypeError):
                        pass

            cve_ids = classification.get("cve-id") or []
            if isinstance(cve_ids, str):
                cve_ids = [cve_ids]
            cwe_ids = classification.get("cwe-id") or []
            if isinstance(cwe_ids, str):
                cwe_ids = [cwe_ids]

            matched_at = d.get("matched-at") or d.get("host") or ""
            curl_command = d.get("curl-command") or ""

            finding = {
                "title": info.get("name") or d.get("template-id") or "Unknown",
                "severity": severity,
                "cvss": cvss,
                "cve": ", ".join(cve_ids),
                "cwe": ", ".join(cwe_ids),
                "target": d.get("host") or "",
                "url": matched_at,
                "description": info.get("description") or "",
                "proof": curl_command,
                "raw_output": line,
                "source_tool": "nuclei",
                "template_id": d.get("template-id") or "",
                "tags": info.get("tags") or [],
                "extra": {
                    "matcher_name": d.get("matcher-name") or "",
                    "extracted_results": d.get("extracted-results") or [],
                    "type": d.get("type") or "",
                    "timestamp": d.get("timestamp") or "",
                },
            }
            findings.append(finding)

    return findings
