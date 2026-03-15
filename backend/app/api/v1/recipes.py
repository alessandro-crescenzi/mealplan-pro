from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas.recipe import RecipeCreate, RecipeOut, RecipeUpdate
from app.crud.recipes import (
    get_recipe, get_user_recipes, create_recipe, update_recipe, delete_recipe,
    add_recipe_to_user_list, remove_recipe_from_user_list,
)
from app.core.deps import get_db, get_current_user
from app.models.user import User

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("", response_model=list[RecipeOut])
def list_recipes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ritorna le ricette presenti nella lista personale dell'utente autenticato."""
    return get_user_recipes(db, user_id=current_user.id, skip=skip, limit=limit)


@router.get("/{recipe_id}", response_model=RecipeOut)
def read_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = get_recipe(db, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    return recipe


@router.post("", response_model=RecipeOut, status_code=201)
def add_recipe(
    data: RecipeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea una ricetta privata e la aggiunge automaticamente alla lista personale."""
    return create_recipe(db, data, user_id=current_user.id)


@router.put("/{recipe_id}", response_model=RecipeOut)
def edit_recipe(
    recipe_id: int,
    data: RecipeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = update_recipe(db, recipe_id, data, user_id=current_user.id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata o non autorizzata")
    return recipe


@router.delete("/{recipe_id}", status_code=204)
def remove_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina una ricetta privata (solo il proprietario può eliminarla)."""
    if not delete_recipe(db, recipe_id, user_id=current_user.id):
        raise HTTPException(status_code=404, detail="Ricetta non trovata o non autorizzata")


@router.post("/{recipe_id}/subscribe", status_code=204)
def subscribe_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggiunge una ricetta esistente (globale o privata) alla lista personale dell'utente."""
    if not get_recipe(db, recipe_id):
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    add_recipe_to_user_list(db, user_id=current_user.id, recipe_id=recipe_id)


@router.delete("/{recipe_id}/unsubscribe", status_code=204)
def unsubscribe_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rimuove una ricetta dalla lista personale dell'utente (non elimina il record)."""
    if not remove_recipe_from_user_list(db, user_id=current_user.id, recipe_id=recipe_id):
        raise HTTPException(status_code=404, detail="Ricetta non presente nella lista personale")
