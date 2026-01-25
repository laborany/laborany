# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         文件 API                                          ║
# ║                                                                          ║
# ║  端点：上传文件、下载文件                                                   ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
from uuid import uuid4
import aiosqlite
import aiofiles

from src.core.database import get_db
from src.core.security import get_current_user_id

router = APIRouter()

UPLOAD_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           响应模型                                        │
# └──────────────────────────────────────────────────────────────────────────┘
class FileInfo(BaseModel):
    id: str
    name: str
    size: int


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           上传文件                                        │
# └──────────────────────────────────────────────────────────────────────────┘
@router.post("/upload", response_model=FileInfo)
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    # 确保上传目录存在
    user_dir = UPLOAD_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)

    # 生成文件 ID 和路径
    file_id = str(uuid4())
    file_ext = Path(file.filename or "").suffix
    file_path = user_dir / f"{file_id}{file_ext}"

    # 保存文件
    content = await file.read()
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # 记录到数据库
    await db.execute(
        "INSERT INTO files (id, user_id, name, path, size) VALUES (?, ?, ?, ?, ?)",
        (file_id, user_id, file.filename, str(file_path), len(content)),
    )
    await db.commit()

    return FileInfo(id=file_id, name=file.filename or "", size=len(content))


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           下载文件                                        │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("/{file_id}")
async def download_file(
    file_id: str,
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    # 查询文件
    cursor = await db.execute(
        "SELECT name, path FROM files WHERE id = ? AND user_id = ?",
        (file_id, user_id),
    )
    row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="文件不存在")

    file_path = Path(row[1])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件已被删除")

    return FileResponse(file_path, filename=row[0])


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           获取文件列表                                     │
# └──────────────────────────────────────────────────────────────────────────┘
@router.get("", response_model=list[FileInfo])
async def list_files(
    user_id: str = Depends(get_current_user_id),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT id, name, size FROM files WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    )
    rows = await cursor.fetchall()

    return [FileInfo(id=row[0], name=row[1], size=row[2]) for row in rows]
