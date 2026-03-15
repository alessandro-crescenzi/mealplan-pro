from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.settings import UserSettings
from app.schemas.settings import UserProfileUpdate, UserSettingsUpdate, UserSettingsOut, UserProfileOut

router = APIRouter()


def get_or_create_settings(db: Session, user_id) -> UserSettings:
    settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/users/me", response_model=UserProfileOut)
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    settings = get_or_create_settings(db, current_user.id)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "google_id": current_user.google_id,
        "created_at": current_user.created_at,
        "settings": settings,
    }


@router.put("/users/me", response_model=UserProfileOut)
def update_profile(
    data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.name is not None:
        current_user.name = data.name
        db.commit()
        db.refresh(current_user)
    settings = get_or_create_settings(db, current_user.id)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "google_id": current_user.google_id,
        "created_at": current_user.created_at,
        "settings": settings,
    }


@router.get("/users/me/settings", response_model=UserSettingsOut)
def get_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_or_create_settings(db, current_user.id)


@router.put("/users/me/settings", response_model=UserSettingsOut)
def update_settings(
    data: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = get_or_create_settings(db, current_user.id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings
