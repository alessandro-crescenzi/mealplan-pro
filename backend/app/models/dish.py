import enum
from sqlalchemy import (
    Column, Integer, String, Text, Float, ForeignKey, DateTime,
    Enum, CheckConstraint, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class SlotCategory(str, enum.Enum):
    carbohydrate = "carbohydrate"
    protein = "protein"
    vegetable = "vegetable"


class Dish(Base):
    __tablename__ = "dishes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    # Calcolato automaticamente alla creazione/modifica: somma score slot / 30 * 100
    healthiness_score = Column(Float, nullable=True)
    # NULL = piatto globale/default; non-NULL = piatto privato dell'utente
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    owner = relationship("User", back_populates="dishes")
    components = relationship(
        "DishComponent",
        back_populates="dish",
        cascade="all, delete-orphan",
    )
    user_list_entries = relationship("UserDishList", back_populates="dish", cascade="all, delete-orphan")


class DishComponent(Base):
    __tablename__ = "dish_components"

    id = Column(Integer, primary_key=True, index=True)
    dish_id = Column(Integer, ForeignKey("dishes.id", ondelete="CASCADE"), nullable=False)
    slot_category = Column(Enum(SlotCategory), nullable=False)
    # Esattamente uno tra ingredient_id e recipe_id deve essere non-NULL (XOR)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=True)
    recipe_id = Column(Integer, ForeignKey("recipes.id"), nullable=True)
    quantity = Column(Float, nullable=True)
    unit = Column(String, nullable=True)

    dish = relationship("Dish", back_populates="components")
    ingredient = relationship("Ingredient", back_populates="dish_components")
    recipe = relationship("Recipe", back_populates="dish_components")

    __table_args__ = (
        # XOR: ingredient_id o recipe_id, mai entrambi e mai nessuno
        CheckConstraint(
            "(ingredient_id IS NOT NULL AND recipe_id IS NULL) OR "
            "(ingredient_id IS NULL AND recipe_id IS NOT NULL)",
            name="ck_dish_component_xor",
        ),
        # Un solo componente per slot per piatto
        UniqueConstraint("dish_id", "slot_category", name="uq_dish_slot"),
    )
