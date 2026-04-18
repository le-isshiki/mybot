"""
Generic async subprocess runner with live log streaming.
"""
import asyncio
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator, Callable, Optional

from ..config import settings


class ToolNotFoundError(Exception):
    pass


async def run_tool(
    cmd: list[str],
    scan_id: str,
    stage: str,
    cwd: Optional[str] = None,
    env: Optional[dict] = None,
    timeout: int = 3600,
    log_cb: Optional[Callable[[str, str, str], None]] = None,
) -> tuple[int, str]:
    """
    Run a subprocess command, streaming stdout/stderr line by line.
    log_cb(level, stage, message) is called for each line.
    Returns (returncode, combined_output).
    """
    tool = cmd[0]
    resolved = shutil.which(tool)
    if not resolved:
        raise ToolNotFoundError(f"Tool not found: {tool}")

    full_cmd = [resolved] + cmd[1:]
    proc_env = {**os.environ, **(env or {})}

    if log_cb:
        log_cb("info", stage, f"[{stage}] Running: {' '.join(full_cmd)}")

    proc = await asyncio.create_subprocess_exec(
        *full_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=proc_env,
    )

    output_lines: list[str] = []

    async def drain(stream: asyncio.StreamReader, level: str):
        async for line in stream:
            text = line.decode("utf-8", errors="replace").rstrip()
            if text:
                output_lines.append(text)
                if log_cb:
                    log_cb(level, stage, text)

    try:
        await asyncio.wait_for(
            asyncio.gather(drain(proc.stdout, "info"), drain(proc.stderr, "warn")),
            timeout=timeout,
        )
        await proc.wait()
    except asyncio.TimeoutError:
        proc.kill()
        if log_cb:
            log_cb("error", stage, f"[{stage}] TIMEOUT after {timeout}s — killed")

    return proc.returncode or 0, "\n".join(output_lines)


async def run_tool_lines(
    cmd: list[str],
    cwd: Optional[str] = None,
    env: Optional[dict] = None,
    timeout: int = 3600,
) -> AsyncIterator[str]:
    """Yield stdout lines one at a time (for streaming to WebSocket)."""
    tool = cmd[0]
    resolved = shutil.which(tool)
    if not resolved:
        raise ToolNotFoundError(f"Tool not found: {tool}")

    full_cmd = [resolved] + cmd[1:]
    proc = await asyncio.create_subprocess_exec(
        *full_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=cwd,
        env={**os.environ, **(env or {})},
    )

    async def _read():
        async for line in proc.stdout:
            yield line.decode("utf-8", errors="replace").rstrip()

    try:
        async with asyncio.timeout(timeout):
            async for line in _read():
                yield line
    except asyncio.TimeoutError:
        proc.kill()
        yield f"[TIMEOUT] Process killed after {timeout}s"

    await proc.wait()


def make_scan_dir(scan_id: str) -> Path:
    d = Path(settings.output_dir) / scan_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
