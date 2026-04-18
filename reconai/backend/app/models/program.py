from sqlalchemy import String, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base
from .base import TimestampMixin, gen_uuid
import enum


class PlatformType(str, enum.Enum):
    hackerone = "hackerone"
    bugcrowd = "bugcrowd"
    manual = "manual"
    other = "other"


class Program(Base, TimestampMixin):
    __tablename__ = "programs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    platform: Mapped[str] = mapped_column(String(32), default="manual")
    handle: Mapped[str | None] = mapped_column(String(256), nullable=True)
    scope_raw: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")

    targets: Mapped[list["Target"]] = relationship(back_populates="program", cascade="all, delete-orphan")
    scans: Mapped[list["Scan"]] = relationship(back_populates="program", cascade="all, delete-orphan")
