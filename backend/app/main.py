from fastapi import FastAPI
from app.api.v1 import meals, auth, users, ingredients, recipes, dishes
from app.core.database import Base, engine, SessionLocal
from app.models import user, settings, ingredient, recipe, dish, user_lists, pending_registration  # ensure all models are registered with Base
from app.core.seed import run_seed
from app.core.migrate import run_migrations
from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)

# Applica migrazioni schema idempotenti (colonne aggiunte dopo la creazione iniziale)
with SessionLocal() as db:
    run_migrations(db)

# Esegui il seed dei dati di default (idempotente)
with SessionLocal() as db:
    run_seed(db)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # metti dominio vercel in produzione
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(ingredients.router, prefix="/api/v1")
app.include_router(recipes.router, prefix="/api/v1")
app.include_router(dishes.router, prefix="/api/v1")
# meals router mantenuto per retrocompatibilità
app.include_router(meals.router, prefix="/api/v1")

@app.get("/")
def healthcheck():
    return {"status": "ok"}
