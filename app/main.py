import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

app = FastAPI(
    title=os.getenv("PROJECT_NAME", "Pension Tax Assistant"),
    version="1.0.0",
    description="연금저축 & IRP 절세 진단 및 RAG AI 챗봇 API"
)

# 프론트엔드 통신을 위한 CORS 설정
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

# 기본 헬스체크 엔드포인트
@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Pension Tax Assistant API Server is running!"
    }

@app.get("/api/v1/health")
def health_check():
    return {"status": "ok"}