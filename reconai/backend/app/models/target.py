from sqlalchemy import String, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base
from .base import TimestampMixin, gen_uuid


class Target(Base, TimestampMixin):
    __tablename__ = "targets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id"), nullable=False)
    value: Mapped[str] = mapped_column(String(512), nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), default="domain")
    in_scope: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    program: Mapped["Program"] = relationship(back_populates="targets")
