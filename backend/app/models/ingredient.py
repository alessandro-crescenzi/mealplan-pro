import enum
from sqlalchemy import Column, Integer, String, Text, SmallInteger, Enum, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class IngredientCategory(str, enum.Enum):
    carbohydrate = "carbohydrate"
    protein = "protein"
    vegetable = "vegetable"
    other = "other"


class Ingredient(Base):
    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    category = Column(Enum(IngredientCategory), nullable=False)
    healthiness_score = Column(SmallInteger, nullable=True)  # 1-10, rilevante per le 3 categorie base
    unit = Column(String, nullable=False, default="g")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    recipe_usages = relationship("RecipeIngredient", back_populates="ingredient")
    dish_components = relationship("DishComponent", back_populates="ingredient")
