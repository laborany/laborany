# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         安全模块 - JWT 认证                                ║
# ║                                                                          ║
# ║  职责：密码哈希、JWT 生成与验证、用户认证                                    ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic_settings import BaseSettings


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           配置                                            │
# └──────────────────────────────────────────────────────────────────────────┘
class Settings(BaseSettings):
    secret_key: str = "laborany-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 天

    class Config:
        env_prefix = "LABORANY_"


settings = Settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           密码处理                                        │
# └──────────────────────────────────────────────────────────────────────────┘
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           JWT 处理                                        │
# └──────────────────────────────────────────────────────────────────────────┘
def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload.get("sub")
    except JWTError:
        return None


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           认证依赖                                        │
# └──────────────────────────────────────────────────────────────────────────┘
async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """从 JWT 中提取当前用户 ID"""
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭证",
        )
    return user_id
