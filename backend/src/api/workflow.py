# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         工作流 API                                        ║
# ║                                                                          ║
# ║  端点：列表、详情、创建、执行、中止、历史                                     ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from uuid import uuid4
from typing import Optional
import aiosqlite
import json

from src.core.database import get_db
from src.core.security import get_current_user_id
from src.services.workflow_client import (
    list_workflows as client_list_workflows,
    get_workflow as client_get_workflow,
    create_workflow as client_create_workflow,
    update_workflow as client_update_workflow,
    delete_workflow as client_delete_workflow,
    execute_workflow as client_execute_workflow,
    stop_workflow as client_stop_workflow,
    install_workflow_as_skill as client_install_workflow,
)

router = APIRouter()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           请求模型                                        │
# └──────────────────────────────────────────────────────────────────────────┘
class WorkflowStepModel(BaseModel):
    skill: str
    name: str
    prompt: str


class WorkflowInputParamModel(BaseModel):
    type: str = "string"  # string, number, boolean, file
    description: str
    required: bool = False
    default: Optional[str] = None
    accept: Optional[str] = None  # 文件类型限制，如 '.pdf,.doc' 或 'image/*'


class CreateWorkflowRequest(BaseModel):
    name: str
    description: str = ""
    icon: Optional[str] = None
    steps: list[WorkflowStepModel]
    input: dict[str, WorkflowInputParamModel] = {}
    on_failure: str = "stop"


class UpdateWorkflowRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    steps: Optional[list[WorkflowStepModel]] = None
    input: Optional[dict[str, WorkflowInputParamModel]] = None
    on_failure: Optional[str] = None


class ExecuteWorkflowRequest(BaseModel):
    input: dict = {}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取工作流列表                                   │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/list")
async def get_workflows():
    """获取所有可用的工作流"""
    workflows = await client_list_workflows()
    return {"workflows": workflows}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取执行历史                                     │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/history")
async def get_workflow_history(
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    """获取用户的工作流执行历史"""
    cursor = await db.execute(
        """SELECT r.id, r.workflow_id, r.status, r.input, r.current_step,
                  r.total_steps, r.started_at, r.completed_at,
                  w.name as workflow_name, w.icon as workflow_icon
           FROM workflow_runs r
           LEFT JOIN workflows w ON r.workflow_id = w.id
           WHERE r.user_id = ?
           ORDER BY r.started_at DESC
           LIMIT 50""",
        (user_id,),
    )
    rows = await cursor.fetchall()

    runs = []
    for row in rows:
        runs.append({
            "id": row[0],
            "workflowId": row[1],
            "status": row[2],
            "input": json.loads(row[3]) if row[3] else {},
            "currentStep": row[4],
            "totalSteps": row[5],
            "startedAt": row[6],
            "completedAt": row[7],
            "workflowName": row[8],
            "workflowIcon": row[9],
        })

    return {"runs": runs}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取执行详情                                     │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/run/{run_id}")
async def get_workflow_run(
    run_id: str,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    """获取工作流执行详情"""
    cursor = await db.execute(
        """SELECT r.id, r.workflow_id, r.status, r.input, r.context,
                  r.current_step, r.total_steps, r.started_at, r.completed_at,
                  w.name as workflow_name, w.icon as workflow_icon
           FROM workflow_runs r
           LEFT JOIN workflows w ON r.workflow_id = w.id
           WHERE r.id = ? AND r.user_id = ?""",
        (run_id, user_id),
    )
    row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="执行记录不存在")

    step_cursor = await db.execute(
        """SELECT step_index, skill_id, session_id, status, output, error,
                  started_at, completed_at
           FROM workflow_step_runs
           WHERE run_id = ?
           ORDER BY step_index""",
        (run_id,),
    )
    step_rows = await step_cursor.fetchall()

    steps = []
    for step_row in step_rows:
        steps.append({
            "stepIndex": step_row[0],
            "skillId": step_row[1],
            "sessionId": step_row[2],
            "status": step_row[3],
            "output": step_row[4],
            "error": step_row[5],
            "startedAt": step_row[6],
            "completedAt": step_row[7],
        })

    return {
        "id": row[0],
        "workflowId": row[1],
        "status": row[2],
        "input": json.loads(row[3]) if row[3] else {},
        "context": json.loads(row[4]) if row[4] else None,
        "currentStep": row[5],
        "totalSteps": row[6],
        "startedAt": row[7],
        "completedAt": row[8],
        "workflowName": row[9],
        "workflowIcon": row[10],
        "steps": steps,
    }


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取工作流详情                                   │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/{workflow_id}")
async def get_workflow_detail(workflow_id: str):
    """获取工作流详情"""
    workflow = await client_get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return workflow


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           创建工作流                                       │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/create")
async def create_workflow(
    req: CreateWorkflowRequest,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    """创建新工作流"""
    try:
        # 调用 Agent Service 创建工作流文件
        workflow = await client_create_workflow(
            name=req.name,
            description=req.description,
            steps=[s.model_dump() for s in req.steps],
            input_params={k: v.model_dump() for k, v in req.input.items()},
            icon=req.icon,
            on_failure=req.on_failure,
        )

        # 保存到数据库
        await db.execute(
            """INSERT INTO workflows (id, name, description, icon, definition, user_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                workflow["id"],
                workflow["name"],
                workflow["description"],
                workflow.get("icon"),
                json.dumps(workflow),
                user_id,
            ),
        )
        await db.commit()

        return workflow
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           更新工作流                                       │
# └──────────────────────────────────────────────────────────────────────────┘
@router.put("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    req: UpdateWorkflowRequest,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    """更新工作流"""
    # 验证权限
    cursor = await db.execute(
        "SELECT id FROM workflows WHERE id = ? AND user_id = ?",
        (workflow_id, user_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="工作流不存在或无权限")

    # 构建更新数据
    updates = {}
    if req.name is not None:
        updates["name"] = req.name
    if req.description is not None:
        updates["description"] = req.description
    if req.icon is not None:
        updates["icon"] = req.icon
    if req.steps is not None:
        updates["steps"] = [s.model_dump() for s in req.steps]
    if req.input is not None:
        updates["input"] = {k: v.model_dump() for k, v in req.input.items()}
    if req.on_failure is not None:
        updates["on_failure"] = req.on_failure

    # 调用 Agent Service 更新
    workflow = await client_update_workflow(workflow_id, updates)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    # 更新数据库
    await db.execute(
        """UPDATE workflows SET name = ?, description = ?, icon = ?,
           definition = ?, updated_at = datetime('now') WHERE id = ?""",
        (
            workflow["name"],
            workflow["description"],
            workflow.get("icon"),
            json.dumps(workflow),
            workflow_id,
        ),
    )
    await db.commit()

    return workflow


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           删除工作流                                       │
# └──────────────────────────────────────────────────────────────────────────┘
@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    """删除工作流"""
    # 验证权限
    cursor = await db.execute(
        "SELECT id FROM workflows WHERE id = ? AND user_id = ?",
        (workflow_id, user_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="工作流不存在或无权限")

    # 调用 Agent Service 删除
    success = await client_delete_workflow(workflow_id)
    if not success:
        raise HTTPException(status_code=400, detail="删除失败")

    # 从数据库删除
    await db.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
    await db.commit()

    return {"success": True}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           执行工作流 (SSE)                                 │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    req: ExecuteWorkflowRequest,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    """执行工作流，返回 SSE 事件流"""
    # 获取工作流信息
    workflow = await client_get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    # 创建执行记录
    run_id = str(uuid4())
    total_steps = len(workflow.get("steps", []))

    await db.execute(
        """INSERT INTO workflow_runs
           (id, workflow_id, user_id, input, total_steps)
           VALUES (?, ?, ?, ?, ?)""",
        (run_id, workflow_id, user_id, json.dumps(req.input), total_steps),
    )
    await db.commit()

    async def event_stream():
        # 发送运行 ID
        yield f"data: {json.dumps({'type': 'run', 'runId': run_id})}\n\n"

        try:
            async for event in client_execute_workflow(workflow_id, req.input, run_id):
                yield f"data: {json.dumps(event)}\n\n"

                # 更新执行状态
                if event.get("type") == "step_start":
                    step_index = event.get("stepIndex", 0)
                    await db.execute(
                        """INSERT INTO workflow_step_runs
                           (run_id, step_index, skill_id, status, started_at)
                           VALUES (?, ?, ?, 'running', datetime('now'))""",
                        (run_id, step_index, event.get("skillId", "")),
                    )
                    await db.execute(
                        "UPDATE workflow_runs SET current_step = ? WHERE id = ?",
                        (step_index, run_id),
                    )
                    await db.commit()

                elif event.get("type") == "step_done":
                    step_index = event.get("stepIndex", 0)
                    result = event.get("result", {})
                    await db.execute(
                        """UPDATE workflow_step_runs
                           SET status = 'completed', output = ?,
                               session_id = ?, completed_at = datetime('now')
                           WHERE run_id = ? AND step_index = ?""",
                        (
                            result.get("output", ""),
                            result.get("sessionId", ""),
                            run_id,
                            step_index,
                        ),
                    )
                    await db.commit()

                elif event.get("type") == "step_error":
                    step_index = event.get("stepIndex", 0)
                    await db.execute(
                        """UPDATE workflow_step_runs
                           SET status = 'failed', error = ?,
                               completed_at = datetime('now')
                           WHERE run_id = ? AND step_index = ?""",
                        (event.get("error", ""), run_id, step_index),
                    )
                    await db.commit()

                elif event.get("type") == "workflow_done":
                    context = event.get("context", {})
                    await db.execute(
                        """UPDATE workflow_runs
                           SET status = 'completed', context = ?,
                               completed_at = datetime('now')
                           WHERE id = ?""",
                        (json.dumps(context), run_id),
                    )
                    await db.commit()

                elif event.get("type") in ("workflow_error", "workflow_stopped"):
                    status = "stopped" if event.get("type") == "workflow_stopped" else "failed"
                    await db.execute(
                        """UPDATE workflow_runs
                           SET status = ?, completed_at = datetime('now')
                           WHERE id = ?""",
                        (status, run_id),
                    )
                    await db.commit()

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            await db.execute(
                "UPDATE workflow_runs SET status = 'failed' WHERE id = ?",
                (run_id,),
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
# │                           中止工作流执行                                   │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/stop/{run_id}")
async def stop_workflow_run(
    run_id: str,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    """中止正在执行的工作流"""
    # 验证权限
    cursor = await db.execute(
        "SELECT id FROM workflow_runs WHERE id = ? AND user_id = ?",
        (run_id, user_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="执行记录不存在")

    success = await client_stop_workflow(run_id)

    if success:
        await db.execute(
            "UPDATE workflow_runs SET status = 'stopped' WHERE id = ?",
            (run_id,),
        )
        await db.commit()

    return {"success": success}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           安装工作流为 Skill                               │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/{workflow_id}/install")
async def install_workflow(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    """将工作流安装为独立的 Skill"""
    # 验证工作流存在
    workflow = await client_get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    # 调用 Agent Service 安装
    result = await client_install_workflow(workflow_id)
    if not result:
        raise HTTPException(status_code=400, detail="安装失败")

    return {"skillId": result.get("skillId", result.get("id", workflow_id))}
