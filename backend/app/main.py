from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import route_router, crime_router
from app.http_client import close_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Cleanly close the shared HTTP client pool on shutdown (Windows in
    # particular needs sockets released properly rather than left open).
    await close_client()


app = FastAPI(
    title="RouteSafe AI",
    description="Multi-modal spatio-temporal risk fusion API for safe route recommendation.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(route_router.router)
app.include_router(crime_router.router)


@app.get("/")
async def root():
    return {"status": "ok", "service": "RouteSafe AI backend"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
