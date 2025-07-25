from pydantic import BaseModel
from typing import List, Optional

class MealCreate(BaseModel):
    name: str
    carbohydrate: str
    protein: str
    vegetable: str
    ingredients: List[str]
    description: Optional[str] = None
    instructions: Optional[str] = None

class MealOut(MealCreate):
    id: int

    class Config:
        orm_mode = True