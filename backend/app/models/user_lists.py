from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class UserDishList(Base):
    """Traccia quali piatti unici sono presenti nel piano personale di un utente."""

    __tablename__ = "user_dish_list"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    dish_id = Column(Integer, ForeignKey("dishes.id", ondelete="CASCADE"), nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="dish_list")
    dish = relationship("Dish", back_populates="user_list_entries")

    __table_args__ = (UniqueConstraint("user_id", "dish_id", name="uq_user_dish"),)


class UserRecipeList(Base):
    """Traccia quali ricette sono presenti nella collezione personale di un utente."""

    __tablename__ = "user_recipe_list"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipe_id = Column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="recipe_list")
    recipe = relationship("Recipe", back_populates="user_list_entries")

    __table_args__ = (UniqueConstraint("user_id", "recipe_id", name="uq_user_recipe"),)
