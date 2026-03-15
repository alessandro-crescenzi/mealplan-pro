from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class PendingRegistrationEmail(BaseModel):
    email: EmailStr


class RegistrationStartResponse(BaseModel):
    message: str
    email: EmailStr
    expires_in_minutes: int


class RegistrationVerifyRequest(BaseModel):
    email: EmailStr
    code: str


class MessageResponse(BaseModel):
    message: str


class UserGoogleCreate(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    google_id: str

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: Optional[str]
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
