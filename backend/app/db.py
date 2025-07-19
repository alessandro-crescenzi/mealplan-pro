# app/db.py

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# 📦 URL connessione (da .env o hardcoded temporaneo)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@host:port/dbname")

# 🔌 Crea il motore di connessione
engine = create_engine(DATABASE_URL)

# 🧪 Sessione (factory)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 🧬 Base da ereditare nei modelli (ORM)
Base = declarative_base()

# 📦 Dependency da usare nei path operation
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()