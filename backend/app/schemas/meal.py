from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict

class MealCreate(BaseModel):
    name: str
    carbohydrate: str
    protein: str
    vegetable: str
    ingredients: Dict[str, int]
    instructions: str

class MealOut(MealCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int

class MealAutofillRequest(BaseModel):
    name: str

class MealAutofillOut(BaseModel):
    carbohydrate: Optional[str] = None
    protein: Optional[str] = None
    vegetable: Optional[str] = None
    ingredients: Dict[str, int] = {}
    instructions: Optional[str] = None