from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from app.schemas.ingredient import IngredientOut


class RecipeIngredientIn(BaseModel):
    ingredient_id: int
    quantity: float
    unit: str


class RecipeIngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ingredient_id: int
    quantity: float
    unit: str
    ingredient: IngredientOut


class RecipeBase(BaseModel):
    name: str
    description: Optional[str] = None
    instructions: Optional[str] = None


class RecipeCreate(RecipeBase):
    ingredients: list[RecipeIngredientIn] = []


class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    ingredients: Optional[list[RecipeIngredientIn]] = None


class RecipeOut(RecipeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[UUID] = None
    recipe_ingredients: list[RecipeIngredientOut] = []
