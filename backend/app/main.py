from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import HTMLResponse

from .database import init_db
from .api import programs_router, scans_router, findings_router, tools_router

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
TEMPLATES_DIR = FRONTEND_DIR / "templates"
STATIC_DIR = FRONTEND_DIR / "static"

STATIC_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="ReconAI",
    description="AI-driven bug bounty recon automation platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(programs_router)
app.include_router(scans_router)
app.include_router(findings_router)
app.include_router(tools_router)


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/programs/{program_id}", response_class=HTMLResponse)
async def program_page(request: Request, program_id: str):
    return templates.TemplateResponse("program.html", {"request": request, "program_id": program_id})

@app.get("/scans/{scan_id}", response_class=HTMLResponse)
async def scan_page(request: Request, scan_id: str):
    return templates.TemplateResponse("scan.html", {"request": request, "scan_id": scan_id})

@app.get("/findings/{finding_id}", response_class=HTMLResponse)
async def finding_page(request: Request, finding_id: str):
    return templates.TemplateResponse("finding.html", {"request": request, "finding_id": finding_id})

@app.get("/health")
async def health():
    return {"status": "ok"}
