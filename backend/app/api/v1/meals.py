from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas.meal import MealCreate, MealOut
from app.crud.meals import create_meal
from app.core.database import SessionLocal

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/meals", response_model=MealOut)
def add_meal(meal: MealCreate, db: Session = Depends(get_db)):
    return create_meal(db, meal)