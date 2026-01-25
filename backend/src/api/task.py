# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         任务文件 API                                      ║
# ║                                                                          ║
# ║  端点：获取任务产出文件列表、下载/预览文件                                    ║
# ║  注意：不需要认证，因为 sessionId 本身是随机 UUID                            ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from fastapi import APIRouter
from fastapi.responses import Response

from src.services.agent_client import get_task_files, get_task_file

router = APIRouter()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取任务产出文件列表                              │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/{session_id}/files")
async def get_task_files_api(session_id: str):
    files = await get_task_files(session_id)
    return {"files": files}


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           下载/预览任务产出文件                             │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/{session_id}/files/{file_path:path}")
async def get_task_file_api(session_id: str, file_path: str):
    content, content_type, filename = await get_task_file(session_id, file_path)
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
