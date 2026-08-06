from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from supabase import Client
from datetime import timedelta
from pydantic import BaseModel, EmailStr

from app.db.session import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_user
)

router = APIRouter()

class UserCreate(BaseModel):
    name: str
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

@router.post("/signup", response_model=Token)
def signup(user_in: UserCreate, db: Client = Depends(get_db)):
    # 1. 중복 회원 검사
    existing = db.table("users").select("*").eq("email", user_in.email).execute()
    if existing.data:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system."
        )
    
    # 2. 회원 등록
    new_user_data = {
        "name": user_in.name,
        "email": user_in.email,
        "hashed_password": get_password_hash(user_in.password),
    }
    insert_res = db.table("users").insert(new_user_data).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create user.")
    
    user = insert_res.data[0]
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Client = Depends(get_db)):
    response = db.table("users").select("*").eq("email", form_data.username).execute()
    users = response.data
    if not users or not verify_password(form_data.password, users[0]["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = users[0]
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

class UserResponse(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user
