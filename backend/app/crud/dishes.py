from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from app.models.dish import Dish, DishComponent
from app.models.recipe import Recipe, RecipeIngredient
from app.models.user_lists import UserDishList
from app.schemas.dish import DishCreate, DishUpdate

_MAX_RAW_SCORE = 30.0


def _compute_healthiness_score(components: list[DishComponent]) -> float | None:
    if not components:
        return None

    raw_score = 0.0
    for component in components:
        slot_category = component.slot_category

        if component.ingredient_id is not None and component.ingredient is not None:
            raw_score += component.ingredient.healthiness_score or 0

        elif component.recipe_id is not None and component.recipe is not None:
            slot_scores = [
                ri.ingredient.healthiness_score
                for ri in component.recipe.recipe_ingredients
                if ri.ingredient is not None
                and ri.ingredient.category == slot_category
                and ri.ingredient.healthiness_score is not None
            ]
            if slot_scores:
                raw_score += sum(slot_scores) / len(slot_scores)

    normalized = (raw_score / _MAX_RAW_SCORE) * 100
    return round(min(max(normalized, 0.0), 100.0), 2)


def _dish_options():
    return [
        joinedload(Dish.components).joinedload(DishComponent.ingredient),
        joinedload(Dish.components)
        .joinedload(DishComponent.recipe)
        .joinedload(Recipe.recipe_ingredients)
        .joinedload(RecipeIngredient.ingredient),
    ]


def _load_dish(db: Session, dish_id: int) -> Dish | None:
    return (
        db.query(Dish)
        .options(*_dish_options())
        .filter(Dish.id == dish_id)
        .first()
    )


def get_dish(db: Session, dish_id: int) -> Dish | None:
    return _load_dish(db, dish_id)


def get_user_dishes(db: Session, user_id: UUID, skip: int = 0, limit: int = 100) -> list[Dish]:
    return (
        db.query(Dish)
        .join(UserDishList, UserDishList.dish_id == Dish.id)
        .filter(UserDishList.user_id == user_id)
        .options(*_dish_options())
        .offset(skip)
        .limit(limit)
        .all()
    )


def add_dish_to_user_list(db: Session, user_id: UUID, dish_id: int) -> bool:
    db.add(UserDishList(user_id=user_id, dish_id=dish_id))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def remove_dish_from_user_list(db: Session, user_id: UUID, dish_id: int) -> bool:
    deleted = (
        db.query(UserDishList)
        .filter(UserDishList.user_id == user_id, UserDishList.dish_id == dish_id)
        .delete()
    )
    db.commit()
    return deleted > 0


def create_dish(db: Session, data: DishCreate, user_id: UUID | None = None) -> Dish:
    dish = Dish(
        name=data.name,
        description=data.description,
        instructions=data.instructions,
        user_id=user_id,
    )
    db.add(dish)
    db.flush()

    for comp in data.components:
        db.add(DishComponent(
            dish_id=dish.id,
            slot_category=comp.slot_category,
            ingredient_id=comp.ingredient_id,
            recipe_id=comp.recipe_id,
            quantity=comp.quantity,
            unit=comp.unit,
        ))

    db.flush()
    loaded = _load_dish(db, dish.id)
    loaded.healthiness_score = _compute_healthiness_score(loaded.components)

    if user_id is not None:
        db.add(UserDishList(user_id=user_id, dish_id=dish.id))

    db.commit()
    return _load_dish(db, dish.id)


def update_dish(db: Session, dish_id: int, data: DishUpdate, user_id: UUID | None = None) -> Dish | None:
    dish = db.query(Dish).filter(Dish.id == dish_id).first()
    if not dish or dish.user_id != user_id:
        return None

    for field, value in data.model_dump(exclude_unset=True, exclude={"components"}).items():
        setattr(dish, field, value)

    if data.components is not None:
        db.query(DishComponent).filter(DishComponent.dish_id == dish_id).delete()
        for comp in data.components:
            db.add(DishComponent(
                dish_id=dish_id,
                slot_category=comp.slot_category,
                ingredient_id=comp.ingredient_id,
                recipe_id=comp.recipe_id,
                quantity=comp.quantity,
                unit=comp.unit,
            ))

    db.flush()
    loaded = _load_dish(db, dish_id)
    loaded.healthiness_score = _compute_healthiness_score(loaded.components)
    db.commit()
    return _load_dish(db, dish_id)


def delete_dish(db: Session, dish_id: int, user_id: UUID | None = None) -> bool:
    dish = db.query(Dish).filter(Dish.id == dish_id).first()
    if not dish or dish.user_id != user_id:
        return False
    db.delete(dish)
    db.commit()
    return True
