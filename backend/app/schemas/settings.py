from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None


class UserSettingsUpdate(BaseModel):
    bio: Optional[str] = None
    theme: Optional[str] = None
    language: Optional[str] = None
    email_notifications: Optional[bool] = None
    weekly_report: Optional[bool] = None
    portions_per_meal: Optional[int] = None
    dietary_preference: Optional[str] = None


class UserSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    bio: Optional[str]
    theme: str
    language: str
    email_notifications: bool
    weekly_report: bool
    portions_per_meal: int
    dietary_preference: str


class UserProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: Optional[str]
    google_id: Optional[str]
    created_at: datetime
    settings: Optional[UserSettingsOut] = None

    @property
    def login_method(self) -> str:
        return "google" if self.google_id else "email"
