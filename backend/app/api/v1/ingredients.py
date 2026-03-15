from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.schemas.ingredient import IngredientCreate, IngredientOut, IngredientUpdate
from app.crud.ingredients import (
    get_ingredient, get_ingredients, create_ingredient,
    update_ingredient, delete_ingredient, get_ingredient_by_name,
)
from app.models.ingredient import IngredientCategory
from app.core.deps import get_db

router = APIRouter(prefix="/ingredients", tags=["ingredients"])


@router.get("", response_model=list[IngredientOut])
def list_ingredients(
    category: IngredientCategory | None = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return get_ingredients(db, category=category, skip=skip, limit=limit)


@router.get("/{ingredient_id}", response_model=IngredientOut)
def read_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    ingredient = get_ingredient(db, ingredient_id)
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")
    return ingredient


@router.post("", response_model=IngredientOut, status_code=201)
def add_ingredient(data: IngredientCreate, db: Session = Depends(get_db)):
    if get_ingredient_by_name(db, data.name):
        raise HTTPException(status_code=409, detail="Un ingrediente con questo nome esiste già")
    return create_ingredient(db, data)


@router.put("/{ingredient_id}", response_model=IngredientOut)
def edit_ingredient(ingredient_id: int, data: IngredientUpdate, db: Session = Depends(get_db)):
    ingredient = update_ingredient(db, ingredient_id, data)
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")
    return ingredient


@router.delete("/{ingredient_id}", status_code=204)
def remove_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    if not delete_ingredient(db, ingredient_id):
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")
