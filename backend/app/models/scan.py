from sqlalchemy import String, Text, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base
from .base import TimestampMixin, gen_uuid
from datetime import datetime

class Scan(Base, TimestampMixin):
    __tablename__ = "scans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id"), nullable=False)
    workflow: Mapped[str] = mapped_column(String(64), default="full_recon")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    current_stage: Mapped[str] = mapped_column(String(64), default="")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    output_dir: Mapped[str] = mapped_column(String(512), default="")
    error: Mapped[str] = mapped_column(Text, default="")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    program: Mapped["Program"] = relationship(back_populates="scans")
    findings: Mapped[list["Finding"]] = relationship(back_populates="scan", cascade="all, delete-orphan")
    logs: Mapped[list["ScanLog"]] = relationship(back_populates="scan", cascade="all, delete-orphan")

class ScanLog(Base):
    __tablename__ = "scan_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id"), nullable=False)
    level: Mapped[str] = mapped_column(String(16), default="info")
    stage: Mapped[str] = mapped_column(String(64), default="")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[str] = mapped_column(String(32), nullable=False)
    scan: Mapped["Scan"] = relationship(back_populates="logs")
