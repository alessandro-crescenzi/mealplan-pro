from datetime import datetime
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.pending_registration import PendingRegistration
from app.models.recipe import Recipe
from app.models.dish import Dish
from app.models.user_lists import UserDishList, UserRecipeList
from app.schemas.user import UserCreate, UserGoogleCreate
from app.core.security import hash_password, verify_password
from typing import Optional


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def get_user_by_google_id(db: Session, google_id: str) -> Optional[User]:
    return db.query(User).filter(User.google_id == google_id).first()


def get_pending_registration_by_email(db: Session, email: str) -> Optional[PendingRegistration]:
    return db.query(PendingRegistration).filter(PendingRegistration.email == email).first()


def _populate_user_default_lists(db: Session, user: User) -> tuple[int, int]:
    """Aggiunge solo i piatti e le ricette globali mancanti alle liste personali dell'utente."""
    default_dishes = db.query(Dish).filter(Dish.user_id == None).all()  # noqa: E711
    existing_dish_ids = {
        dish_id
        for (dish_id,) in db.query(UserDishList.dish_id).filter(UserDishList.user_id == user.id).all()
    }
    added_dishes = 0
    for dish in default_dishes:
        if dish.id in existing_dish_ids:
            continue
        db.add(UserDishList(user_id=user.id, dish_id=dish.id))
        added_dishes += 1

    default_recipes = db.query(Recipe).filter(Recipe.user_id == None).all()  # noqa: E711
    existing_recipe_ids = {
        recipe_id
        for (recipe_id,) in db.query(UserRecipeList.recipe_id).filter(UserRecipeList.user_id == user.id).all()
    }
    added_recipes = 0
    for recipe in default_recipes:
        if recipe.id in existing_recipe_ids:
            continue
        db.add(UserRecipeList(user_id=user.id, recipe_id=recipe.id))
        added_recipes += 1

    return added_dishes, added_recipes


def _create_user_record(
    db: Session,
    *,
    email: str,
    name: Optional[str],
    hashed_password: Optional[str] = None,
    google_id: Optional[str] = None,
    commit: bool = True,
) -> User:
    db_user = User(
        email=email,
        name=name,
        hashed_password=hashed_password,
        google_id=google_id,
    )
    db.add(db_user)
    db.flush()
    _populate_user_default_lists(db, db_user)
    if commit:
        db.commit()
        db.refresh(db_user)
    return db_user


def create_user(db: Session, user: UserCreate) -> User:
    return _create_user_record(
        db,
        email=user.email,
        name=user.name,
        hashed_password=hash_password(user.password),
    )


def create_pending_registration(
    db: Session,
    user: UserCreate,
    verification_code: str,
    expires_at: datetime,
) -> PendingRegistration:
    pending = get_pending_registration_by_email(db, user.email)
    if not pending:
        pending = PendingRegistration(email=user.email)
        db.add(pending)

    pending.name = user.name
    pending.hashed_password = hash_password(user.password)
    pending.verification_code_hash = hash_password(verification_code)
    pending.code_expires_at = expires_at
    db.commit()
    db.refresh(pending)
    return pending


def refresh_pending_registration_code(
    db: Session,
    pending: PendingRegistration,
    verification_code: str,
    expires_at: datetime,
) -> PendingRegistration:
    pending.verification_code_hash = hash_password(verification_code)
    pending.code_expires_at = expires_at
    db.commit()
    db.refresh(pending)
    return pending


def is_pending_registration_code_valid(pending: PendingRegistration, verification_code: str) -> bool:
    return verify_password(verification_code, pending.verification_code_hash)


def create_user_from_pending_registration(db: Session, pending: PendingRegistration) -> User:
    db_user = _create_user_record(
        db,
        email=pending.email,
        name=pending.name,
        hashed_password=pending.hashed_password,
        commit=False,
    )
    db.delete(pending)
    db.commit()
    db.refresh(db_user)
    return db_user


def get_or_create_google_user(db: Session, data: UserGoogleCreate) -> User:
    user = get_user_by_google_id(db, data.google_id)
    if not user:
        user = get_user_by_email(db, data.email)
        if user:
            # Link Google account to existing email account
            user.google_id = data.google_id
            if not user.name and data.name:
                user.name = data.name
            db.commit()
            db.refresh(user)
            return user
    if user:
        return user
    return _create_user_record(
        db,
        email=data.email,
        name=data.name,
        google_id=data.google_id,
    )
