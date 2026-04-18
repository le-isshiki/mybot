from sqlalchemy import String, Text, Integer, ForeignKey, JSON, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base
from .base import TimestampMixin, gen_uuid


SEVERITY_RANK = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1, "unknown": 0}


class Finding(Base, TimestampMixin):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), default="info")
    cvss: Mapped[float | None] = mapped_column(Float, nullable=True)
    cve: Mapped[str] = mapped_column(String(32), default="")
    cwe: Mapped[str] = mapped_column(String(32), default="")
    target: Mapped[str] = mapped_column(String(512), default="")
    url: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    proof: Mapped[str] = mapped_column(Text, default="")
    raw_output: Mapped[str] = mapped_column(Text, default="")
    source_tool: Mapped[str] = mapped_column(String(64), default="")
    template_id: Mapped[str] = mapped_column(String(256), default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    triage_note: Mapped[str] = mapped_column(Text, default="")
    is_false_positive: Mapped[bool] = mapped_column(default=False)
    report_included: Mapped[bool] = mapped_column(default=True)

    scan: Mapped["Scan"] = relationship(back_populates="findings")
    report: Mapped["Report | None"] = relationship(back_populates="finding", uselist=False)


class Report(Base, TimestampMixin):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    finding_id: Mapped[str] = mapped_column(ForeignKey("findings.id"), nullable=False, unique=True)
    platform: Mapped[str] = mapped_column(String(32), default="hackerone")
    title: Mapped[str] = mapped_column(String(512), default="")
    severity: Mapped[str] = mapped_column(String(16), default="")
    weakness: Mapped[str] = mapped_column(String(128), default="")
    vulnerability_info: Mapped[str] = mapped_column(Text, default="")
    steps_to_reproduce: Mapped[str] = mapped_column(Text, default="")
    impact: Mapped[str] = mapped_column(Text, default="")
    remediation: Mapped[str] = mapped_column(Text, default="")
    references: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="draft")

    finding: Mapped["Finding"] = relationship(back_populates="report")
