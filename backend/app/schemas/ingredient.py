from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from app.models.ingredient import IngredientCategory


class IngredientBase(BaseModel):
    name: str
    category: IngredientCategory
    healthiness_score: Optional[int] = Field(None, ge=1, le=10)
    unit: str = "g"
    description: Optional[str] = None


class IngredientCreate(IngredientBase):
    pass


class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[IngredientCategory] = None
    healthiness_score: Optional[int] = Field(None, ge=1, le=10)
    unit: Optional[str] = None
    description: Optional[str] = None


class IngredientOut(IngredientBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
