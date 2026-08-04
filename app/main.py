from fastapi import FastAPI

app = FastAPI(title="연금 연말정산 절세 비서")

@app.get("/")
def root():
    return {"message": "서버가 정상 작동 중입니다!"}