import os
from functools import lru_cache
from supabase import create_client, Client
from dotenv import load_dotenv
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT / ".env.local")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or ""

@lru_cache()
def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL 및 SUPABASE_KEY 환경변수가 설정되지 않았습니다.")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def get_db():
    """FastAPI Depends용 세션 대체 주입 함수"""
    return get_supabase_client()
