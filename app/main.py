from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import diagnose

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
app.include_router(diagnose.router, prefix="/api/v1", tags=["Tax Diagnosis"])


@app.get("/")
def read_root():
    return {"message": "Pension Tax Assistant API is running!"}