from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import auth
import models
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        # Note: In production, use Alembic for migrations instead of create_all
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan, title="Odoo Hackathon API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)

@app.get("/")
async def root():
    return {"message": "Welcome to the API!"}
