import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import diagnose
from app.api.v1.chat import router as chat_router


load_dotenv()

app = FastAPI(
    title=os.getenv("PROJECT_NAME", "Pension Tax Assistant"),
    version="1.0.0",
    description="연금저축 & IRP 절세 진단 및 RAG AI 챗봇 API",
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    diagnose.router,
    prefix="/api/v1",
    tags=["Tax Diagnosis"],
)
app.include_router(chat_router)


@app.get("/")
def read_root() -> dict[str, str]:
    return {
        "status": "online",
        "message": "Pension Tax Assistant API Server is running!",
    }


@app.get("/api/v1/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
