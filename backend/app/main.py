from fastapi import FastAPI
from app.api.v1 import meals
from app.core.database import Base, engine
from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # metti dominio vercel in produzione
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meals.router, prefix="/api/v1")

@app.get("/")
def healthcheck():
    return {"status": "ok"}