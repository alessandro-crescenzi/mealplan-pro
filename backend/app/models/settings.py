from sqlalchemy import Column, String, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.core.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True)
    bio = Column(String, nullable=True, default="")
    theme = Column(String, default="light", nullable=False)
    language = Column(String, default="it", nullable=False)
    email_notifications = Column(Boolean, default=True, nullable=False)
    weekly_report = Column(Boolean, default=True, nullable=False)
    portions_per_meal = Column(Integer, default=2, nullable=False)
    dietary_preference = Column(String, default="nessuna", nullable=False)
