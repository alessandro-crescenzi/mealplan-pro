"""Seed idempotente: carica dati di default da fixtures/default_data.json.

Viene chiamato all'avvio dell'applicazione. Se i dati esistono già non fa nulla.
Modifica `fixtures/default_data.json` per aggiungere/modificare i dati di default.
"""
import json
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.ingredient import Ingredient, IngredientCategory
from app.models.recipe import Recipe, RecipeIngredient
from app.models.dish import Dish, DishComponent, SlotCategory
from app.models.user import User
from app.crud.users import _populate_user_default_lists

FIXTURES_PATH = Path(__file__).parent.parent.parent / "fixtures" / "default_data.json"


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

def _upsert_ingredient(db: Session, data: dict) -> Ingredient:
    existing = db.query(Ingredient).filter(Ingredient.name == data["name"]).first()
    if existing:
        return existing
    ingredient = Ingredient(
        name=data["name"],
        category=IngredientCategory(data["category"]),
        healthiness_score=data.get("healthiness_score"),
        unit=data.get("unit", "g"),
        description=data.get("description"),
    )
    db.add(ingredient)
    db.flush()
    return ingredient


def _upsert_recipe(db: Session, data: dict, ingredient_map: dict[str, Ingredient]) -> Recipe:
    existing = db.query(Recipe).filter(Recipe.name == data["name"], Recipe.user_id == None).first()  # noqa: E711
    if existing:
        return existing
    recipe = Recipe(
        name=data["name"],
        description=data.get("description"),
        instructions=data.get("instructions"),
        user_id=None,
    )
    db.add(recipe)
    db.flush()
    for ri in data.get("ingredients", []):
        ingredient = ingredient_map.get(ri["ingredient"])
        if not ingredient:
            raise ValueError(f"Ingrediente '{ri['ingredient']}' non trovato nella fixture.")
        db.add(RecipeIngredient(
            recipe_id=recipe.id,
            ingredient_id=ingredient.id,
            quantity=ri["quantity"],
            unit=ri["unit"],
        ))
    db.flush()
    return recipe


def _compute_score(components: list[DishComponent]) -> float | None:
    if not components:
        return None
    raw = 0.0
    for c in components:
        if c.ingredient and c.ingredient.healthiness_score:
            raw += c.ingredient.healthiness_score
        elif c.recipe:
            scores = [
                ri.ingredient.healthiness_score
                for ri in c.recipe.recipe_ingredients
                if ri.ingredient and ri.ingredient.healthiness_score
                and ri.ingredient.category == c.slot_category
            ]
            if scores:
                raw += sum(scores) / len(scores)
    return round(min(max((raw / 30.0) * 100, 0.0), 100.0), 2)


def _upsert_dish(
    db: Session,
    data: dict,
    ingredient_map: dict[str, Ingredient],
    recipe_map: dict[str, Recipe],
) -> Dish:
    existing = db.query(Dish).filter(Dish.name == data["name"], Dish.user_id == None).first()  # noqa: E711
    if existing:
        return existing
    dish = Dish(name=data["name"], description=data.get("description"), user_id=None)
    db.add(dish)
    db.flush()
    for comp in data.get("components", []):
        slot = SlotCategory(comp["slot_category"])
        ingredient_name = comp.get("ingredient")
        recipe_name = comp.get("recipe")
        if ingredient_name and recipe_name:
            raise ValueError(f"Componente del piatto '{data['name']}': specificare solo 'ingredient' o 'recipe', non entrambi.")
        if not ingredient_name and not recipe_name:
            raise ValueError(f"Componente del piatto '{data['name']}': specificare 'ingredient' o 'recipe'.")
        ingredient = ingredient_map.get(ingredient_name) if ingredient_name else None
        recipe = recipe_map.get(recipe_name) if recipe_name else None
        if ingredient_name and not ingredient:
            raise ValueError(f"Ingrediente '{ingredient_name}' non trovato nella fixture.")
        if recipe_name and not recipe:
            raise ValueError(f"Ricetta '{recipe_name}' non trovata nella fixture.")
        db.add(DishComponent(
            dish_id=dish.id,
            slot_category=slot,
            ingredient_id=ingredient.id if ingredient else None,
            recipe_id=recipe.id if recipe else None,
            quantity=comp.get("quantity"),
            unit=comp.get("unit"),
        ))
    db.flush()
    dish.healthiness_score = _compute_score(dish.components)
    return dish


def _populate_user_lists(db: Session) -> int:
    """Aggiunge i piatti/ricette di default alle liste di tutti gli utenti che non li hanno già.
    Ritorna il numero di utenti aggiornati."""
    users = db.query(User).all()
    updated = 0
    for user in users:
        added_dishes, added_recipes = _populate_user_default_lists(db, user)
        if added_dishes or added_recipes:
            updated += 1
    return updated


# ---------------------------------------------------------------------------
# Main seed function
# ---------------------------------------------------------------------------

def run_seed(db: Session, fixtures_path: Path = FIXTURES_PATH) -> None:
    if not fixtures_path.exists():
        print(f"[seed] File fixture non trovato: {fixtures_path} — seed saltato.")
        return

    with open(fixtures_path, encoding="utf-8") as f:
        data = json.load(f)

    # 1. Ingredienti
    ingredient_map: dict[str, Ingredient] = {}
    for ing_data in data.get("ingredients", []):
        ingredient = _upsert_ingredient(db, ing_data)
        ingredient_map[ingredient.name] = ingredient
    print(f"[seed] {len(ingredient_map)} ingredienti caricati.")

    # 2. Ricette
    recipe_map: dict[str, Recipe] = {}
    for recipe_data in data.get("recipes", []):
        recipe = _upsert_recipe(db, recipe_data, ingredient_map)
        recipe_map[recipe.name] = recipe
    print(f"[seed] {len(recipe_map)} ricette caricate.")

    # 3. Piatti unici
    all_dishes: list[Dish] = []
    for dish_data in data.get("dishes", []):
        all_dishes.append(_upsert_dish(db, dish_data, ingredient_map, recipe_map))
    print(f"[seed] {len(all_dishes)} piatti unici caricati.")

    db.commit()

    # 4. Popola le liste degli utenti esistenti (idempotente)
    n = _populate_user_lists(db)
    if n:
        print(f"[seed] Liste piatti/ricette sincronizzate per {n} utenti.")

    db.commit()
    print("[seed] Completato.")
