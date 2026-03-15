from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas.dish import DishCreate, DishOut, DishUpdate
from app.crud.dishes import (
    get_dish, get_user_dishes, create_dish, update_dish, delete_dish,
    add_dish_to_user_list, remove_dish_from_user_list,
)
from app.crud.users import _populate_user_default_lists
from app.core.deps import get_db, get_current_user
from app.models.user import User

router = APIRouter(prefix="/dishes", tags=["dishes"])


@router.get("", response_model=list[DishOut])
def list_dishes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ritorna i piatti unici presenti nella lista personale dell'utente autenticato.
    Se la lista è vuota, popola automaticamente con i piatti di default."""
    dishes = get_user_dishes(db, user_id=current_user.id, skip=0, limit=1)
    if not dishes:
        # Lazy init: l'utente non ha ancora nessun piatto → aggiunge i default
        _populate_user_default_lists(db, current_user)
        db.commit()
    return get_user_dishes(db, user_id=current_user.id, skip=skip, limit=limit)


@router.get("/{dish_id}", response_model=DishOut)
def read_dish(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dish = get_dish(db, dish_id)
    if not dish:
        raise HTTPException(status_code=404, detail="Piatto non trovato")
    return dish


@router.post("", response_model=DishOut, status_code=201)
def add_dish(
    data: DishCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea un piatto privato e lo aggiunge automaticamente alla lista personale."""
    return create_dish(db, data, user_id=current_user.id)


@router.put("/{dish_id}", response_model=DishOut)
def edit_dish(
    dish_id: int,
    data: DishUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dish = update_dish(db, dish_id, data, user_id=current_user.id)
    if not dish:
        raise HTTPException(status_code=404, detail="Piatto non trovato o non autorizzato")
    return dish


@router.delete("/{dish_id}", status_code=204)
def remove_dish(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina un piatto privato (solo il proprietario può eliminarlo)."""
    if not delete_dish(db, dish_id, user_id=current_user.id):
        raise HTTPException(status_code=404, detail="Piatto non trovato o non autorizzato")


@router.post("/{dish_id}/subscribe", status_code=204)
def subscribe_dish(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggiunge un piatto esistente (globale o privato) alla lista personale dell'utente."""
    if not get_dish(db, dish_id):
        raise HTTPException(status_code=404, detail="Piatto non trovato")
    add_dish_to_user_list(db, user_id=current_user.id, dish_id=dish_id)


@router.delete("/{dish_id}/unsubscribe", status_code=204)
def unsubscribe_dish(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rimuove un piatto dalla lista personale dell'utente (non elimina il record)."""
    if not remove_dish_from_user_list(db, user_id=current_user.id, dish_id=dish_id):
        raise HTTPException(status_code=404, detail="Piatto non presente nella lista personale")
