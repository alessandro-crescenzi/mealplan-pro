from sqlalchemy.orm import Session
from app.models.ingredient import Ingredient, IngredientCategory
from app.schemas.ingredient import IngredientCreate, IngredientUpdate


def get_ingredient(db: Session, ingredient_id: int) -> Ingredient | None:
    return db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()


def get_ingredient_by_name(db: Session, name: str) -> Ingredient | None:
    return db.query(Ingredient).filter(Ingredient.name == name).first()


def get_ingredients(
    db: Session,
    category: IngredientCategory | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Ingredient]:
    q = db.query(Ingredient)
    if category:
        q = q.filter(Ingredient.category == category)
    return q.offset(skip).limit(limit).all()


def create_ingredient(db: Session, data: IngredientCreate) -> Ingredient:
    ingredient = Ingredient(**data.model_dump())
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)
    return ingredient


def update_ingredient(db: Session, ingredient_id: int, data: IngredientUpdate) -> Ingredient | None:
    ingredient = get_ingredient(db, ingredient_id)
    if not ingredient:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ingredient, field, value)
    db.commit()
    db.refresh(ingredient)
    return ingredient


def delete_ingredient(db: Session, ingredient_id: int) -> bool:
    ingredient = get_ingredient(db, ingredient_id)
    if not ingredient:
        return False
    db.delete(ingredient)
    db.commit()
    return True
