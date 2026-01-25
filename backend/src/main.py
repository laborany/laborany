# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                     LaborAny Backend - FastAPI 入口                       ║
# ║                                                                          ║
# ║  核心职责：路由注册、中间件配置、应用启动                                    ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import traceback

from src.api import auth, skill, session, file, task, workflow
from src.core.database import init_db

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           应用实例                                        │
# └──────────────────────────────────────────────────────────────────────────┘
app = FastAPI(
    title="LaborAny API",
    description="AI 劳动力平台后端服务",
    version="0.1.0",
)


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           全局异常处理                                     │
# └──────────────────────────────────────────────────────────────────────────┘
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"Error: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           CORS 配置                                       │
# └──────────────────────────────────────────────────────────────────────────┘
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           路由注册                                        │
# └──────────────────────────────────────────────────────────────────────────┘
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(task.router, prefix="/api/task", tags=["任务文件"])
app.include_router(skill.router, prefix="/api/skill", tags=["Skill"])
app.include_router(workflow.router, prefix="/api/workflow", tags=["工作流"])
app.include_router(session.router, prefix="/api/sessions", tags=["会话"])
app.include_router(file.router, prefix="/api/files", tags=["文件"])


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           启动事件                                        │
# └──────────────────────────────────────────────────────────────────────────┘
@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/api/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok"}

