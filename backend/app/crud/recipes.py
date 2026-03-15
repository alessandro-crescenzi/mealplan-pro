from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from app.models.recipe import Recipe, RecipeIngredient
from app.models.ingredient import Ingredient
from app.models.user_lists import UserRecipeList
from app.schemas.recipe import RecipeCreate, RecipeUpdate


def _load_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return (
        db.query(Recipe)
        .options(joinedload(Recipe.recipe_ingredients).joinedload(RecipeIngredient.ingredient))
        .filter(Recipe.id == recipe_id)
        .first()
    )


def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return _load_recipe(db, recipe_id)


def get_user_recipes(db: Session, user_id: UUID, skip: int = 0, limit: int = 100) -> list[Recipe]:
    return (
        db.query(Recipe)
        .join(UserRecipeList, UserRecipeList.recipe_id == Recipe.id)
        .filter(UserRecipeList.user_id == user_id)
        .options(joinedload(Recipe.recipe_ingredients).joinedload(RecipeIngredient.ingredient))
        .offset(skip)
        .limit(limit)
        .all()
    )


def add_recipe_to_user_list(db: Session, user_id: UUID, recipe_id: int) -> bool:
    db.add(UserRecipeList(user_id=user_id, recipe_id=recipe_id))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def remove_recipe_from_user_list(db: Session, user_id: UUID, recipe_id: int) -> bool:
    deleted = (
        db.query(UserRecipeList)
        .filter(UserRecipeList.user_id == user_id, UserRecipeList.recipe_id == recipe_id)
        .delete()
    )
    db.commit()
    return deleted > 0


def create_recipe(db: Session, data: RecipeCreate, user_id: UUID | None = None) -> Recipe:
    recipe = Recipe(
        name=data.name,
        description=data.description,
        instructions=data.instructions,
        user_id=user_id,
    )
    db.add(recipe)
    db.flush()

    for ing in data.ingredients:
        ingredient = db.query(Ingredient).filter(Ingredient.id == ing.ingredient_id).first()
        if not ingredient:
            raise ValueError(f"Ingrediente {ing.ingredient_id} non trovato")
        db.add(RecipeIngredient(
            recipe_id=recipe.id,
            ingredient_id=ing.ingredient_id,
            quantity=ing.quantity,
            unit=ing.unit,
        ))

    if user_id is not None:
        db.add(UserRecipeList(user_id=user_id, recipe_id=recipe.id))

    db.commit()
    return _load_recipe(db, recipe.id)


def update_recipe(db: Session, recipe_id: int, data: RecipeUpdate, user_id: UUID | None = None) -> Recipe | None:
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe or recipe.user_id != user_id:
        return None

    for field, value in data.model_dump(exclude_unset=True, exclude={"ingredients"}).items():
        setattr(recipe, field, value)

    if data.ingredients is not None:
        db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id == recipe_id).delete()
        for ing in data.ingredients:
            db.add(RecipeIngredient(
                recipe_id=recipe_id,
                ingredient_id=ing.ingredient_id,
                quantity=ing.quantity,
                unit=ing.unit,
            ))

    db.commit()
    return _load_recipe(db, recipe_id)


def delete_recipe(db: Session, recipe_id: int, user_id: UUID | None = None) -> bool:
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe or recipe.user_id != user_id:
        return False
    db.delete(recipe)
    db.commit()
    return True
