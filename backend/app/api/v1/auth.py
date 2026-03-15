from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.schemas.user import (
    UserCreate,
    UserGoogleCreate,
    Token,
    LoginRequest,
    PendingRegistrationEmail,
    RegistrationStartResponse,
    RegistrationVerifyRequest,
    MessageResponse,
)
from app.crud.users import (
    get_user_by_email,
    get_or_create_google_user,
    create_pending_registration,
    get_pending_registration_by_email,
    refresh_pending_registration_code,
    is_pending_registration_code_valid,
    create_user_from_pending_registration,
)
from app.core.security import verify_password, create_access_token
from app.services.email_verification import (
    generate_verification_code,
    get_registration_code_expiry_minutes,
    send_registration_verification_email,
)

router = APIRouter()
REGISTRATION_CODE_EXPIRE_MINUTES = get_registration_code_expiry_minutes()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _normalize_verification_code(code: str) -> str:
    normalized_code = code.strip().replace(" ", "")
    if not normalized_code.isdigit() or len(normalized_code) != 6:
        raise HTTPException(status_code=400, detail="Il codice di verifica deve contenere 6 cifre")
    return normalized_code


def _send_registration_code_email(email: str, code: str, expires_at: datetime) -> None:
    try:
        send_registration_verification_email(email, code, expires_at)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Errore durante l'invio dell'email di verifica {exc}") from exc


@router.post("/auth/register", response_model=RegistrationStartResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    if len(user_data.password) < 8:
        raise HTTPException(status_code=400, detail="La password deve essere di almeno 8 caratteri")
    existing = get_user_by_email(db, user_data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    verification_code = generate_verification_code()
    expires_at = datetime.utcnow() + timedelta(minutes=REGISTRATION_CODE_EXPIRE_MINUTES)
    create_pending_registration(db, user_data, verification_code, expires_at)
    _send_registration_code_email(user_data.email, verification_code, expires_at)
    return RegistrationStartResponse(
        message="Ti abbiamo inviato un codice di verifica via email",
        email=user_data.email,
        expires_in_minutes=REGISTRATION_CODE_EXPIRE_MINUTES,
    )


@router.post("/auth/register/resend", response_model=RegistrationStartResponse)
def resend_registration_code(data: PendingRegistrationEmail, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")

    pending = get_pending_registration_by_email(db, data.email)
    if not pending:
        raise HTTPException(status_code=404, detail="Nessuna registrazione in attesa per questa email")

    verification_code = generate_verification_code()
    expires_at = datetime.utcnow() + timedelta(minutes=REGISTRATION_CODE_EXPIRE_MINUTES)
    refresh_pending_registration_code(db, pending, verification_code, expires_at)
    _send_registration_code_email(data.email, verification_code, expires_at)
    return RegistrationStartResponse(
        message="Ti abbiamo inviato un nuovo codice di verifica via email",
        email=data.email,
        expires_in_minutes=REGISTRATION_CODE_EXPIRE_MINUTES,
    )


@router.post("/auth/register/verify", response_model=MessageResponse)
def verify_registration(data: RegistrationVerifyRequest, db: Session = Depends(get_db)):
    if get_user_by_email(db, data.email):
        raise HTTPException(status_code=400, detail="Email già registrata")

    pending = get_pending_registration_by_email(db, data.email)
    if not pending:
        raise HTTPException(status_code=404, detail="Nessuna registrazione in attesa per questa email")

    normalized_code = _normalize_verification_code(data.code)
    if pending.code_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Il codice di verifica è scaduto")
    if not is_pending_registration_code_valid(pending, normalized_code):
        raise HTTPException(status_code=400, detail="Codice di verifica non valido")

    create_user_from_pending_registration(db, pending)
    return MessageResponse(message="Email verificata con successo")


@router.post("/auth/login", response_model=Token)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(db, credentials.email)
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return Token(access_token=token, token_type="bearer", user=user)

@router.post("/auth/google", response_model=Token)
def google_auth(data: UserGoogleCreate, db: Session = Depends(get_db)):
    user = get_or_create_google_user(db, data)
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return Token(access_token=token, token_type="bearer", user=user)
