import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import diagnose, chat

# DB 및 모델 import
from app.db.session import engine, Base
import app.models.chat_history
import app.models.tax_savings
import app.models.user

# 데이터 디렉토리 자동 생성
os.makedirs("app/data", exist_ok=True)

# 서버 시작 시 SQLite 테이블 자동 생성
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pension Tax Assistant API")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 연결
from app.api.v1 import diagnose, chat, tax_savings, auth
app.include_router(diagnose.router, prefix="/api/v1", tags=["Tax Diagnosis"])
app.include_router(chat.router, prefix="/api/v1", tags=["RAG Chatbot"])
app.include_router(tax_savings.router, prefix="/api/v1", tags=["Tax Savings Dashboard"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])


@app.get("/")
def read_root():
    return {"message": "Pension Tax Assistant API is running!"}