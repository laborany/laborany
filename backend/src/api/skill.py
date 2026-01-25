# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         Skill 执行 API                                    ║
# ║                                                                          ║
# ║  端点：获取列表、执行 Skill (SSE)、中止执行、优化 Skill                       ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from uuid import uuid4
import aiosqlite
import json

from src.core.database import get_db
from src.core.security import get_current_user_id
from src.services.agent_client import (
    execute_agent,
    stop_agent,
    list_skills,
    get_skill_detail,
    get_skill_file,
    save_skill_file,
    create_skill_chat,
    install_skill,
    get_official_skills,
    uninstall_skill,
    optimize_skill,
)

router = APIRouter()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           请求模型                                        │
# └──────────────────────────────────────────────────────────────────────────┘
class ExecuteRequest(BaseModel):
    skill_id: str
    query: str


class SaveFileRequest(BaseModel):
    path: str
    content: str


class CreateChatRequest(BaseModel):
    messages: list[dict]


class InstallRequest(BaseModel):
    source: str


class OptimizeRequest(BaseModel):
    messages: list[dict]


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取 Skills 列表                                 │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/list")
async def get_skills():
    skills = await list_skills()
    return {"skills": skills}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           执行 Skill (SSE)                                │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/execute")
async def execute_skill(
    req: ExecuteRequest,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    # 创建会话记录
    session_id = str(uuid4())
    await db.execute(
        "INSERT INTO sessions (id, user_id, skill_id, query) VALUES (?, ?, ?, ?)",
        (session_id, user_id, req.skill_id, req.query),
    )
    await db.commit()

    async def event_stream():
        # 发送会话 ID
        yield f"data: {json.dumps({'type': 'session', 'sessionId': session_id})}\n\n"

        try:
            async for event in execute_agent(req.skill_id, req.query, session_id):
                yield f"data: {json.dumps(event)}\n\n"

                # 保存消息到数据库
                if event.get("type") in ("text", "tool_use", "tool_result"):
                    await db.execute(
                        "INSERT INTO messages (session_id, type, content) VALUES (?, ?, ?)",
                        (session_id, event["type"], json.dumps(event)),
                    )

            # 更新会话状态
            await db.execute(
                "UPDATE sessions SET status = 'completed' WHERE id = ?",
                (session_id,),
            )
            await db.commit()

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            await db.execute(
                "UPDATE sessions SET status = 'failed' WHERE id = ?",
                (session_id,),
            )
            await db.commit()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           中止执行                                        │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/stop/{session_id}")
async def stop_skill(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    # 验证会话属于当前用户
    cursor = await db.execute(
        "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="会话不存在")

    success = await stop_agent(session_id)

    if success:
        await db.execute(
            "UPDATE sessions SET status = 'stopped' WHERE id = ?",
            (session_id,),
        )
        await db.commit()

    return {"success": success}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           对话式创建 Skill (SSE)                           │
# │                           注意：静态路由必须在动态路由之前                    │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/create-chat")
async def create_skill_chat_api(req: CreateChatRequest):
    async def event_stream():
        try:
            async for event in create_skill_chat(req.messages):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           从 GitHub 安装 Skill                            │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/install")
async def install_skill_api(req: InstallRequest):
    try:
        result = await install_skill(req.source)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取官方 Skills 列表                             │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/official")
async def get_official_skills_api():
    skills = await get_official_skills()
    return {"skills": skills}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           卸载 Skill                                      │
# └──────────────────────────────────────────────────────────────────────────┘
@router.delete("/uninstall/{skill_id}")
async def uninstall_skill_api(skill_id: str):
    success = await uninstall_skill(skill_id)
    if not success:
        raise HTTPException(status_code=400, detail="卸载失败")
    return {"success": True}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取 Skill 详情                                  │
# │  注意：动态路由必须在静态前缀路由之后                                        │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/{skill_id}/detail")
async def get_skill_detail_api(skill_id: str):
    detail = await get_skill_detail(skill_id)
    return detail


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取 Skill 文件内容                              │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/{skill_id}/file")
async def get_skill_file_api(skill_id: str, path: str):
    result = await get_skill_file(skill_id, path)
    return result


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           保存 Skill 文件                                  │
# └──────────────────────────────────────────────────────────────────────────┘
@router.put("/{skill_id}/file")
async def save_skill_file_api(skill_id: str, req: SaveFileRequest):
    result = await save_skill_file(skill_id, req.path, req.content)
    return result


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           优化 Skill (SSE)                                │
# │  对话式优化现有 Skill                                                      │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/{skill_id}/optimize")
async def optimize_skill_api(skill_id: str, req: OptimizeRequest):
    async def event_stream():
        try:
            async for event in optimize_skill(skill_id, req.messages):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
