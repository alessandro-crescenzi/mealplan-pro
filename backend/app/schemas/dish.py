from pydantic import BaseModel, ConfigDict, model_validator
from typing import Optional
from uuid import UUID
from app.models.dish import SlotCategory
from app.schemas.ingredient import IngredientOut
from app.schemas.recipe import RecipeOut


class DishComponentIn(BaseModel):
    slot_category: SlotCategory
    ingredient_id: Optional[int] = None
    recipe_id: Optional[int] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None

    @model_validator(mode="after")
    def check_xor(self) -> "DishComponentIn":
        has_ingredient = self.ingredient_id is not None
        has_recipe = self.recipe_id is not None
        if has_ingredient == has_recipe:  # entrambi o nessuno
            raise ValueError("Esattamente uno tra ingredient_id e recipe_id deve essere valorizzato")
        return self


class DishComponentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slot_category: SlotCategory
    ingredient_id: Optional[int] = None
    recipe_id: Optional[int] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    ingredient: Optional[IngredientOut] = None
    recipe: Optional[RecipeOut] = None


class DishBase(BaseModel):
    name: str
    description: Optional[str] = None
    instructions: Optional[str] = None


class DishCreate(DishBase):
    components: list[DishComponentIn] = []


class DishUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    components: Optional[list[DishComponentIn]] = None


class DishOut(DishBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[UUID] = None
    healthiness_score: Optional[float] = None
    components: list[DishComponentOut] = []
