from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas.meal import MealCreate, MealOut, MealAutofillRequest, MealAutofillOut
from app.crud.meals import create_meal
from app.core.database import SessionLocal
from app.services.autofill import autofill_meal

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

@router.post("/meals/autofill", response_model=MealAutofillOut)
async def autofill_meal_endpoint(request: MealAutofillRequest):
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Il nome del piatto non può essere vuoto")
    try:
        return await autofill_meal(request.name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Errore nella generazione automatica: {str(e)}")