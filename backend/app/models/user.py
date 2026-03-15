from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)  # null for Google-only users
    google_id = Column(String, unique=True, nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    recipes = relationship("Recipe", back_populates="owner")
    dishes = relationship("Dish", back_populates="owner")
    dish_list = relationship("UserDishList", back_populates="user", cascade="all, delete-orphan")
    recipe_list = relationship("UserRecipeList", back_populates="user", cascade="all, delete-orphan")
