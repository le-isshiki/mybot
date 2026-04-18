from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # App
    app_name: str = "ReconAI"
    debug: bool = False
    secret_key: str = Field(default="change-me-in-production-32chars-min", env="SECRET_KEY")

    # Database
    database_url: str = Field(default=f"sqlite+aiosqlite:///{BASE_DIR}/reconai.db", env="DATABASE_URL")

    # AI
    anthropic_api_key: str = Field(default="", env="ANTHROPIC_API_KEY")
    ai_model: str = "claude-opus-4-7"
    ai_max_tokens: int = 8192

    # Tool paths (auto-detected if in PATH)
    subfinder_path: str = Field(default="subfinder", env="SUBFINDER_PATH")
    amass_path: str = Field(default="amass", env="AMASS_PATH")
    httpx_path: str = Field(default="httpx", env="HTTPX_PATH")
    nuclei_path: str = Field(default="nuclei", env="NUCLEI_PATH")
    nmap_path: str = Field(default="nmap", env="NMAP_PATH")
    ffuf_path: str = Field(default="ffuf", env="FFUF_PATH")
    katana_path: str = Field(default="katana", env="KATANA_PATH")
    gau_path: str = Field(default="gau", env="GAU_PATH")
    waybackurls_path: str = Field(default="waybackurls", env="WAYBACKURLS_PATH")
    dnsx_path: str = Field(default="dnsx", env="DNSX_PATH")
    naabu_path: str = Field(default="naabu", env="NAABU_PATH")
    hakrawler_path: str = Field(default="hakrawler", env="HAKRAWLER_PATH")
    gowitness_path: str = Field(default="gowitness", env="GOWITNESS_PATH")
    trufflehog_path: str = Field(default="trufflehog", env="TRUFFLEHOG_PATH")
    gf_path: str = Field(default="gf", env="GF_PATH")
    dalfox_path: str = Field(default="dalfox", env="DALFOX_PATH")
    sqlmap_path: str = Field(default="sqlmap", env="SQLMAP_PATH")

    # Wordlists
    wordlists_dir: str = Field(default=str(BASE_DIR / "wordlists"), env="WORDLISTS_DIR")
    seclists_dir: str = Field(default="/usr/share/seclists", env="SECLISTS_DIR")

    # Scan settings
    max_concurrent_scans: int = 3
    scan_timeout_hours: int = 12
    nuclei_rate_limit: int = 150
    httpx_threads: int = 50
    ffuf_rate: int = 100

    # Output
    output_dir: str = Field(default=str(BASE_DIR / "output"), env="OUTPUT_DIR")
    custom_tools_dir: str = Field(default=str(BASE_DIR / "tools"), env="CUSTOM_TOOLS_DIR")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure output dirs exist
Path(settings.output_dir).mkdir(parents=True, exist_ok=True)
Path(settings.custom_tools_dir).mkdir(parents=True, exist_ok=True)
