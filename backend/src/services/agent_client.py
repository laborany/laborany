# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         Agent 服务客户端                                   ║
# ║                                                                          ║
# ║  职责：调用 Node.js Agent 服务，处理 SSE 流式响应                           ║
# ╚══════════════════════════════════════════════════════════════════════════╝

import httpx
from typing import AsyncGenerator, Optional
import json

AGENT_SERVICE_URL = "http://localhost:3002"


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           执行 Agent                                      │
# └──────────────────────────────────────────────────────────────────────────┘
async def execute_agent(
    skill_id: str,
    query: str,
    session_id: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    """
    调用 Agent 服务执行 Skill，返回 SSE 事件流
    """
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{AGENT_SERVICE_URL}/execute",
            json={
                "skillId": skill_id,
                "query": query,
                "sessionId": session_id,
            },
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    try:
                        yield json.loads(data)
                    except json.JSONDecodeError:
                        continue


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           中止执行                                        │
# └──────────────────────────────────────────────────────────────────────────┘
async def stop_agent(session_id: str) -> bool:
    """中止正在执行的 Agent"""
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{AGENT_SERVICE_URL}/stop/{session_id}")
        result = response.json()
        return result.get("success", False)


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取 Skills 列表                                 │
# └──────────────────────────────────────────────────────────────────────────┘
async def list_skills() -> list[dict]:
    """获取可用的 Skills 列表"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{AGENT_SERVICE_URL}/skills")
        result = response.json()
        return result.get("skills", [])


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取 Skill 详情                                  │
# └──────────────────────────────────────────────────────────────────────────┘
async def get_skill_detail(skill_id: str) -> dict:
    """获取 Skill 详情，包括文件列表"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{AGENT_SERVICE_URL}/skills/{skill_id}/detail")
        return response.json()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取 Skill 文件内容                              │
# └──────────────────────────────────────────────────────────────────────────┘
async def get_skill_file(skill_id: str, file_path: str) -> dict:
    """获取 Skill 文件内容"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{AGENT_SERVICE_URL}/skills/{skill_id}/file",
            params={"path": file_path},
        )
        return response.json()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           保存 Skill 文件                                  │
# └──────────────────────────────────────────────────────────────────────────┘
async def save_skill_file(skill_id: str, file_path: str, content: str) -> dict:
    """保存 Skill 文件内容"""
    async with httpx.AsyncClient() as client:
        response = await client.put(
            f"{AGENT_SERVICE_URL}/skills/{skill_id}/file",
            json={"path": file_path, "content": content},
        )
        return response.json()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           对话式创建 Skill                                 │
# └──────────────────────────────────────────────────────────────────────────┘
async def create_skill_chat(messages: list[dict]) -> AsyncGenerator[dict, None]:
    """通过对话创建 Skill，返回 SSE 事件流"""
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{AGENT_SERVICE_URL}/skills/create",
            json={"messages": messages},
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    try:
                        yield json.loads(data)
                    except json.JSONDecodeError:
                        continue


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           从 GitHub 安装 Skill                            │
# └──────────────────────────────────────────────────────────────────────────┘
async def install_skill(source: str) -> dict:
    """从 GitHub 安装 Skill"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{AGENT_SERVICE_URL}/skills/install",
            json={"source": source},
        )
        if response.status_code != 200:
            error = response.json().get("error", "安装失败")
            raise Exception(error)
        return response.json()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取官方 Skills 列表                             │
# └──────────────────────────────────────────────────────────────────────────┘
async def get_official_skills() -> list[dict]:
    """获取 Anthropic 官方 Skills 列表"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{AGENT_SERVICE_URL}/skills/official")
        result = response.json()
        return result.get("skills", [])


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           卸载 Skill                                      │
# └──────────────────────────────────────────────────────────────────────────┘
async def uninstall_skill(skill_id: str) -> bool:
    """卸载已安装的 Skill"""
    async with httpx.AsyncClient() as client:
        response = await client.delete(f"{AGENT_SERVICE_URL}/skills/{skill_id}")
        return response.status_code == 200


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取任务文件列表                                  │
# └──────────────────────────────────────────────────────────────────────────┘
async def get_task_files(session_id: str) -> list[dict]:
    """获取任务目录中的文件列表"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{AGENT_SERVICE_URL}/tasks/{session_id}/files")
        if response.status_code == 200:
            return response.json().get("files", [])
        return []


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取任务文件内容                                  │
# └──────────────────────────────────────────────────────────────────────────┘
async def get_task_file(session_id: str, file_path: str) -> tuple[bytes, str, str]:
    """获取任务文件内容，返回 (内容, content_type, filename)"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{AGENT_SERVICE_URL}/tasks/{session_id}/files/{file_path}"
        )
        content_type = response.headers.get("content-type", "application/octet-stream")
        content_disposition = response.headers.get("content-disposition", "")
        filename = file_path.split("/")[-1]
        return response.content, content_type, filename


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           优化 Skill                                      │
# └──────────────────────────────────────────────────────────────────────────┘
async def optimize_skill(skill_id: str, messages: list[dict]) -> AsyncGenerator[dict, None]:
    """优化现有 Skill，返回 SSE 事件流"""
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{AGENT_SERVICE_URL}/skills/{skill_id}/optimize",
            json={"messages": messages},
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    try:
                        yield json.loads(data)
                    except json.JSONDecodeError:
                        continue
