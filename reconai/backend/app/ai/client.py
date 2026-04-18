import json
import re
from typing import Any

import anthropic

from ..config import settings

_client = None


def get_client():
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def _call(system: str, user: str, max_tokens: int | None = None) -> str:
    client = get_client()
    response = await client.messages.create(
        model=settings.ai_model,
        max_tokens=max_tokens or settings.ai_max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return response.content[0].text


def _extract_json(text: str) -> Any:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1)
    return json.loads(text)


async def triage_findings(program_name: str, scope: list[str], findings: list[dict]) -> list[dict]:
    from .prompts import TRIAGE_SYSTEM, TRIAGE_USER
    if not findings:
        return []
    batch_size = 20
    results = []
    for i in range(0, len(findings), batch_size):
        batch = findings[i:i + batch_size]
        indexed = [{"id": f.get("id", str(i + j)), **f} for j, f in enumerate(batch)]
        prompt = TRIAGE_USER.format(
            program_name=program_name,
            scope=", ".join(scope[:20]),
            findings_json=json.dumps(indexed, indent=2),
        )
        try:
            text = await _call(TRIAGE_SYSTEM, prompt)
            verdicts = _extract_json(text)
            results.extend(verdicts)
        except Exception as e:
            for f in batch:
                results.append({
                    "id": f.get("id", ""),
                    "verdict": "needs_manual_review",
                    "adjusted_severity": f.get("severity", "info"),
                    "triage_note": f"AI triage failed: {e}",
                    "report_worthy": False,
                })
    return results


async def generate_h1_report(program_name: str, finding: dict) -> dict:
    from .prompts import H1_REPORT_SYSTEM, H1_REPORT_USER
    prompt = H1_REPORT_USER.format(
        program_name=program_name, title=finding.get("title", ""),
        severity=finding.get("severity", ""), target=finding.get("target", ""),
        url=finding.get("url", ""), description=finding.get("description", ""),
        proof=finding.get("proof", "")[:2000], template_id=finding.get("template_id", ""),
        tags=", ".join(finding.get("tags") or []), cve=finding.get("cve", ""),
        cwe=finding.get("cwe", ""), cvss=finding.get("cvss") or "N/A",
        triage_note=finding.get("triage_note", ""), raw_output=finding.get("raw_output", "")[:1000],
    )
    text = await _call(H1_REPORT_SYSTEM, prompt)
    return _extract_json(text)


async def generate_bugcrowd_report(program_name: str, finding: dict) -> dict:
    from .prompts import BUGCROWD_REPORT_SYSTEM, BUGCROWD_REPORT_USER
    prompt = BUGCROWD_REPORT_USER.format(
        program_name=program_name, title=finding.get("title", ""),
        severity=finding.get("severity", ""), target=finding.get("target", ""),
        url=finding.get("url", ""), description=finding.get("description", ""),
        proof=finding.get("proof", "")[:2000], template_id=finding.get("template_id", ""),
        tags=", ".join(finding.get("tags") or []), cve=finding.get("cve", ""),
        cwe=finding.get("cwe", ""), cvss=finding.get("cvss") or "N/A",
        triage_note=finding.get("triage_note", ""), raw_output=finding.get("raw_output", "")[:1000],
    )
    text = await _call(BUGCROWD_REPORT_SYSTEM, prompt)
    return _extract_json(text)


async def generate_custom_probe(task_description: str, target_type: str, expected_output: str) -> str:
    from .prompts import CUSTOM_PROBE_SYSTEM, CUSTOM_PROBE_USER
    prompt = CUSTOM_PROBE_USER.format(
        task_description=task_description,
        target_type=target_type,
        expected_output=expected_output,
    )
    return await _call(CUSTOM_PROBE_SYSTEM, prompt)
