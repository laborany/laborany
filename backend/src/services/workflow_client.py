# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         工作流服务客户端                                    ║
# ║                                                                          ║
# ║  职责：调用 Node.js Agent 服务的工作流 API                                  ║
# ╚══════════════════════════════════════════════════════════════════════════╝

import httpx
from typing import AsyncGenerator, Optional
import json

AGENT_SERVICE_URL = "http://localhost:3002"


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取工作流列表                                   │
# └──────────────────────────────────────────────────────────────────────────┘
async def list_workflows() -> list[dict]:
    """获取可用的工作流列表"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{AGENT_SERVICE_URL}/workflows")
        result = response.json()
        return result.get("workflows", [])


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取工作流详情                                   │
# └──────────────────────────────────────────────────────────────────────────┘
async def get_workflow(workflow_id: str) -> Optional[dict]:
    """获取工作流详情"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{AGENT_SERVICE_URL}/workflows/{workflow_id}")
        if response.status_code == 404:
            return None
        return response.json()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           创建工作流                                       │
# └──────────────────────────────────────────────────────────────────────────┘
async def create_workflow(
    name: str,
    description: str,
    steps: list[dict],
    input_params: dict,
    icon: Optional[str] = None,
    on_failure: str = "stop",
) -> dict:
    """创建新工作流"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{AGENT_SERVICE_URL}/workflows",
            json={
                "name": name,
                "description": description,
                "icon": icon,
                "steps": steps,
                "input": input_params,
                "on_failure": on_failure,
            },
        )
        if response.status_code != 200:
            error = response.json().get("error", "创建失败")
            raise Exception(error)
        return response.json()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           更新工作流                                       │
# └──────────────────────────────────────────────────────────────────────────┘
async def update_workflow(workflow_id: str, updates: dict) -> Optional[dict]:
    """更新工作流"""
    async with httpx.AsyncClient() as client:
        response = await client.put(
            f"{AGENT_SERVICE_URL}/workflows/{workflow_id}",
            json=updates,
        )
        if response.status_code == 404:
            return None
        return response.json()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           删除工作流                                       │
# └──────────────────────────────────────────────────────────────────────────┘
async def delete_workflow(workflow_id: str) -> bool:
    """删除工作流"""
    async with httpx.AsyncClient() as client:
        response = await client.delete(f"{AGENT_SERVICE_URL}/workflows/{workflow_id}")
        return response.status_code == 200


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           执行工作流                                       │
# └──────────────────────────────────────────────────────────────────────────┘
async def execute_workflow(
    workflow_id: str,
    input_params: dict,
    run_id: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    """执行工作流，返回 SSE 事件流"""
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{AGENT_SERVICE_URL}/workflows/{workflow_id}/execute",
            json={
                "input": input_params,
                "runId": run_id,
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
# │                           中止工作流执行                                   │
# └──────────────────────────────────────────────────────────────────────────┘
async def stop_workflow(run_id: str) -> bool:
    """中止正在执行的工作流"""
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{AGENT_SERVICE_URL}/workflows/stop/{run_id}")
        result = response.json()
        return result.get("success", False)
