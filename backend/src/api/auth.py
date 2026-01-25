# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         认证 API                                          ║
# ║                                                                          ║
# ║  端点：注册、登录、获取当前用户                                             ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
import aiosqlite
from uuid import uuid4

from src.core.database import get_db
from src.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_id,
)

router = APIRouter()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           请求/响应模型                                    │
# └──────────────────────────────────────────────────────────────────────────┘
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    balance: float


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           注册                                            │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: aiosqlite.Connection = Depends(get_db)):
    # 检查邮箱是否已存在
    cursor = await db.execute("SELECT id FROM users WHERE email = ?", (req.email,))
    if await cursor.fetchone():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    # 创建用户
    user_id = str(uuid4())
    password_hash = hash_password(req.password)

    await db.execute(
        "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)",
        (user_id, req.email, password_hash, req.name),
    )
    await db.commit()

    token = create_access_token(user_id)
    return TokenResponse(access_token=token)


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           登录                                            │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "SELECT id, password_hash FROM users WHERE email = ?", (req.email,)
    )
    row = await cursor.fetchone()

    if not row or not verify_password(req.password, row[1]):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    token = create_access_token(row[0])
    return TokenResponse(access_token=token)


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取当前用户                                     │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/me", response_model=UserResponse)
async def get_me(
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT id, email, name, balance FROM users WHERE id = ?", (user_id,)
    )
    row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")

    return UserResponse(id=row[0], email=row[1], name=row[2], balance=row[3])
