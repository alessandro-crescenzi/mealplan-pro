from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from app.core.database import Base

class Meal(Base):
    __tablename__ = "meals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    carbohydrate = Column(String, nullable=False)
    protein = Column(String, nullable=False)
    vegetable = Column(String, nullable=False)
    ingredients = Column(ARRAY(String), nullable=False)
    description = Column(Text)
    instructions = Column(Text)