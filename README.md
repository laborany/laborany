# LaborAny AI 劳动力平台

让不会编程的人也能用 AI Agent。

## 项目结构

```
laborany/
├── frontend/          # React 前端 (Vite + TypeScript + Tailwind)
├── backend/           # FastAPI 后端 (Python + SQLite)
├── agent-service/     # Agent 服务 (Node.js + Express)
└── skills/            # Skills 目录
    └── financial-report/  # 金融研报助手
```

## 快速开始

### 1. 环境准备

```bash
# 复制环境变量配置
cp .env.example .env
# 编辑 .env 文件，填入你的 ANTHROPIC_API_KEY
```

### 2. 启动 Agent 服务

```bash
cd agent-service
npm install
npm run dev
```

### 3. 启动后端服务

```bash
cd backend
pip install -e .
uvicorn src.main:app --reload --port 8000
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 5. 访问应用

打开浏览器访问 http://localhost:3000

## API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/me` | GET | 获取当前用户 |
| `/api/skill/list` | GET | 获取 Skill 列表 |
| `/api/skill/execute` | POST | 执行 Skill (SSE) |
| `/api/skill/stop/{id}` | POST | 中止执行 |
| `/api/sessions` | GET | 获取历史会话 |

## 技术栈

- **前端**: Vite + React + TypeScript + Tailwind CSS
- **后端**: FastAPI + SQLite + JWT
- **Agent**: Node.js + Express + Claude API

## License

MIT
