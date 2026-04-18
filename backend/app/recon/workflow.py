"""
YAML workflow executor — resolves stage dependencies, runs tools, streams logs.
"""
import asyncio
import json
import shutil
from pathlib import Path
from typing import Callable, Optional
import yaml

from ..config import settings
from .runner import run_tool, make_scan_dir, ToolNotFoundError, ts


def load_workflow(name: str) -> dict:
    wf_path = Path(__file__).resolve().parent.parent.parent / "workflows" / f"{name}.yaml"
    if not wf_path.exists():
        raise FileNotFoundError(f"Workflow not found: {name}")
    with open(wf_path) as f:
        return yaml.safe_load(f)


class WorkflowExecutor:
    def __init__(
        self,
        scan_id: str,
        program_name: str,
        targets: list[str],
        workflow_name: str = "full_recon",
        log_cb: Optional[Callable[[str, str, str], None]] = None,
        stop_event: Optional[asyncio.Event] = None,
    ):
        self.scan_id = scan_id
        self.program_name = program_name
        self.targets = targets
        self.workflow_name = workflow_name
        self.log_cb = log_cb or (lambda lvl, stage, msg: None)
        self.stop_event = stop_event or asyncio.Event()
        self.outdir = make_scan_dir(scan_id)
        self.completed_stages: set[str] = set()
        self.failed_stages: set[str] = set()

    def _fmt(self, value: str, domain: str = "") -> str:
        return (
            value
            .replace("{domain}", domain)
            .replace("{outdir}", str(self.outdir))
            .replace("{tools_dir}", settings.custom_tools_dir)
            .replace("{wordlists_dir}", settings.wordlists_dir)
            .replace("{seclists_dir}", settings.seclists_dir)
        )

    def _fmt_cmd(self, cmd: list[str], domain: str = "") -> list[str]:
        return [self._fmt(c, domain) for c in cmd]

    def log(self, level: str, stage: str, msg: str):
        self.log_cb(level, stage, msg)

    async def run(self) -> dict:
        wf = load_workflow(self.workflow_name)
        stages = wf.get("stages", [])
        results: dict[str, dict] = {}

        stage_map = {s["id"]: s for s in stages}

        async def run_stage(stage: dict) -> bool:
            sid = stage["id"]
            if sid in self.completed_stages or sid in self.failed_stages:
                return sid in self.completed_stages

            for dep in stage.get("depends_on", []):
                if dep not in self.completed_stages:
                    if dep in self.failed_stages:
                        self.log("warn", sid, f"Skipping {sid}: dependency {dep} failed")
                        self.failed_stages.add(sid)
                        return False

            if self.stop_event.is_set():
                self.log("warn", sid, f"Scan stopped before {sid}")
                return False

            stage_type = stage.get("type", "tool")
            if stage_type == "ai":
                self.completed_stages.add(sid)
                results[sid] = {"type": "ai", "status": "deferred"}
                return True

            self.log("info", sid, f"=== Stage: {stage['name']} ===")

            stage_outputs: list[str] = []
            for tool_def in stage.get("tools", []):
                if self.stop_event.is_set():
                    break

                tool_id = tool_def["id"]
                optional = tool_def.get("optional", False)

                for domain in self.targets:
                    cmd = self._fmt_cmd(tool_def["cmd"], domain)

                    stdin_file = tool_def.get("stdin_file")
                    if stdin_file:
                        stdin_path = self._fmt(stdin_file, domain)
                        if not Path(stdin_path).exists():
                            continue
                        cmd = ["sh", "-c", f"cat {stdin_path} | {' '.join(cmd)}"]

                    try:
                        rc, output = await run_tool(
                            cmd, self.scan_id, sid,
                            cwd=str(self.outdir),
                            log_cb=self.log_cb,
                            timeout=3600,
                        )
                        out_file = tool_def.get("output_file")
                        if out_file:
                            stage_outputs.append(str(self.outdir / out_file))
                    except ToolNotFoundError as e:
                        if optional:
                            self.log("warn", sid, f"[SKIP] {e}")
                        else:
                            self.log("error", sid, f"[FAIL] {e}")
                            self.failed_stages.add(sid)
                            return False

            merge_out = stage.get("merge_output")
            if merge_out:
                await self._merge_text_files(
                    [p for p in stage_outputs if Path(p).exists() and Path(p).is_file()],
                    str(self.outdir / merge_out),
                )

            self.completed_stages.add(sid)
            results[sid] = {"status": "completed", "outputs": stage_outputs}
            return True

        for stage in stages:
            if stage.get("type") == "ai":
                self.completed_stages.add(stage["id"])
                continue
            deps_ok = all(dep in self.completed_stages for dep in stage.get("depends_on", []))
            if not deps_ok:
                for dep_id in stage.get("depends_on", []):
                    if dep_id not in self.completed_stages and dep_id not in self.failed_stages:
                        dep_stage = stage_map.get(dep_id)
                        if dep_stage:
                            await run_stage(dep_stage)
            await run_stage(stage)

        return results

    async def _merge_text_files(self, file_paths: list[str], output_path: str):
        lines: set[str] = set()
        for fp in file_paths:
            try:
                with open(fp) as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            lines.add(line)
            except Exception:
                pass
        with open(output_path, "w") as f:
            f.write("\n".join(sorted(lines)) + "\n")
        self.log("info", "merge", f"Merged {len(lines)} unique entries → {output_path}")

    def get_live_urls_file(self) -> str:
        return str(self.outdir / "live_urls.txt")

    def extract_live_urls_from_httpx(self):
        httpx_file = self.outdir / "httpx.txt"
        live_file = self.outdir / "live_urls.txt"
        if not httpx_file.exists():
            return
        urls = []
        with open(httpx_file) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    url = data.get("url") or data.get("input")
                    if url:
                        urls.append(url)
                except json.JSONDecodeError:
                    if line.startswith("http"):
                        urls.append(line)
        with open(live_file, "w") as f:
            f.write("\n".join(urls) + "\n")
        self.log("info", "http_probe", f"Extracted {len(urls)} live URLs → live_urls.txt")
