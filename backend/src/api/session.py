# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         会话 API                                          ║
# ║                                                                          ║
# ║  端点：获取历史会话列表、获取会话详情                                        ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import aiosqlite
import json

from src.core.database import get_db
from src.core.security import get_current_user_id

router = APIRouter()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           响应模型                                        │
# └──────────────────────────────────────────────────────────────────────────┘
class SessionSummary(BaseModel):
    id: str
    skill_id: str
    query: str
    status: str
    cost: float
    created_at: str


class MessageItem(BaseModel):
    id: int
    type: str
    content: Optional[dict]
    created_at: str


class SessionDetail(BaseModel):
    id: str
    skill_id: str
    query: str
    status: str
    cost: float
    created_at: str
    messages: list[MessageItem]


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取会话列表                                     │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("", response_model=list[SessionSummary])
async def list_sessions(
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        """
        SELECT id, skill_id, query, status, cost, created_at
        FROM sessions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
        """,
        (user_id,),
    )
    rows = await cursor.fetchall()

    return [
        SessionSummary(
            id=row[0],
            skill_id=row[1],
            query=row[2][:100],  # 截断查询内容
            status=row[3],
            cost=row[4],
            created_at=row[5],
        )
        for row in rows
    ]


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取会话详情                                     │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    # 获取会话
    cursor = await db.execute(
        """
        SELECT id, skill_id, query, status, cost, created_at
        FROM sessions
        WHERE id = ? AND user_id = ?
        """,
        (session_id, user_id),
    )
    session = await cursor.fetchone()

    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 获取消息
    cursor = await db.execute(
        """
        SELECT id, type, content, created_at
        FROM messages
        WHERE session_id = ?
        ORDER BY id ASC
        """,
        (session_id,),
    )
    messages = await cursor.fetchall()

    return SessionDetail(
        id=session[0],
        skill_id=session[1],
        query=session[2],
        status=session[3],
        cost=session[4],
        created_at=session[5],
        messages=[
            MessageItem(
                id=msg[0],
                type=msg[1],
                content=json.loads(msg[2]) if msg[2] else None,
                created_at=msg[3],
            )
            for msg in messages
        ],
    )
