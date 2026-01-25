# LaborAny AI 劳动力平台

> 让不会编程的人也能用 AI Agent

LaborAny 是一个 AI 劳动力平台，通过可视化界面让用户轻松使用各种 AI Skills（如金融研报分析、股票分析等），无需编程知识。

## 目录

- [项目架构](#项目架构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [详细配置](#详细配置)
- [API 接口](#api-接口)
- [Skills 开发](#skills-开发)
- [常见问题](#常见问题)

## 项目架构

```
laborany/
├── frontend/              # React 前端
│   ├── src/
│   │   ├── pages/        # 页面组件
│   │   ├── components/   # 共享组件
│   │   └── hooks/        # 自定义 Hooks
│   └── package.json
│
├── backend/               # FastAPI 后端
│   ├── src/
│   │   ├── api/          # API 路由
│   │   ├── core/         # 核心模块 (数据库、认证)
│   │   └── services/     # 业务服务
│   └── pyproject.toml
│
├── agent-service/         # Node.js Agent 服务
│   ├── src/
│   │   ├── index.ts      # Express 入口
│   │   ├── agent-executor.ts
│   │   ├── skill-loader.ts
│   │   └── session-manager.ts
│   └── package.json
│
├── skills/                # AI Skills 目录
│   ├── stock-analyzer/   # 股票分析
│   ├── financial-report/ # 金融研报
│   ├── pdf/              # PDF 处理
│   └── docx/             # Word 文档处理
│
├── tasks/                 # 任务产出文件 (git ignored)
├── .env.example          # 环境变量示例
└── .env                  # 环境变量 (git ignored)
```

## 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.0 | Agent 服务和前端构建 |
| Python | >= 3.10 | 后端服务 |
| npm | >= 9.0 | 包管理器 |
| pip | >= 23.0 | Python 包管理器 |

## 快速开始

### 1. 克隆项目

```bash
git clone git@github.com:chensnathan/laborany.git
cd laborany
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
# Windows: notepad .env
# Mac/Linux: nano .env
```

**.env 文件内容：**

```env
# Anthropic API Key (必填)
# 获取地址: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-xxxxx

# JWT 密钥 (可选，默认会自动生成)
JWT_SECRET=your-secret-key

# 数据库路径 (可选)
DATABASE_URL=sqlite:///./laborany.db
```

### 3. 启动所有服务

**方式一：分别启动（推荐开发时使用）**

打开 3 个终端窗口，分别执行：

```bash
# 终端 1: Agent 服务 (端口 3001)
cd agent-service
npm install
npm run dev

# 终端 2: 后端服务 (端口 8000)
cd backend
pip install -e .
uvicorn src.main:app --reload --port 8000

# 终端 3: 前端服务 (端口 3000)
cd frontend
npm install
npm run dev
```

**方式二：使用脚本一键启动**

```bash
# Windows (PowerShell)
./start-all.ps1

# Mac/Linux
./start-all.sh
```

### 4. 访问应用

打开浏览器访问：**http://localhost:3000**

默认测试账号：
- 邮箱：`test@example.com`
- 密码：`password123`

（首次使用需要注册新账号）

## 详细配置

### Agent 服务配置

Agent 服务负责与 Claude API 通信，执行 AI Skills。

```bash
cd agent-service

# 安装依赖
npm install

# 开发模式 (热重载)
npm run dev

# 生产模式
npm run build
npm start
```

**配置项：**

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `PORT` | 3001 | 服务端口 |
| `ANTHROPIC_API_KEY` | - | Claude API 密钥 |
| `SKILLS_DIR` | ../skills | Skills 目录路径 |

### 后端服务配置

后端服务提供 REST API，处理用户认证、会话管理等。

```bash
cd backend

# 创建虚拟环境 (推荐)
python -m venv .venv

# 激活虚拟环境
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# 安装依赖
pip install -e .

# 启动服务
uvicorn src.main:app --reload --port 8000
```

**配置项：**

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `DATABASE_URL` | sqlite:///./laborany.db | 数据库连接 |
| `JWT_SECRET` | auto-generated | JWT 签名密钥 |
| `AGENT_SERVICE_URL` | http://localhost:3001 | Agent 服务地址 |

### 前端配置

```bash
cd frontend

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

**配置项 (vite.config.ts)：**

```typescript
// API 代理配置
proxy: {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
}
```

## API 接口

### 认证接口

| 端点 | 方法 | 说明 | 请求体 |
|------|------|------|--------|
| `/api/auth/register` | POST | 用户注册 | `{email, password, name}` |
| `/api/auth/login` | POST | 用户登录 | `{email, password}` |
| `/api/auth/me` | GET | 获取当前用户 | - |

### Skill 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/skill/list` | GET | 获取已安装 Skills |
| `/api/skill/official` | GET | 获取官方 Skills |
| `/api/skill/execute` | POST | 执行 Skill (SSE) |
| `/api/skill/stop/{session_id}` | POST | 中止执行 |
| `/api/skill/install` | POST | 安装 Skill |
| `/api/skill/uninstall/{skill_id}` | DELETE | 卸载 Skill |
| `/api/skill/{skill_id}/optimize` | POST | 优化 Skill (SSE) |
| `/api/skill/{skill_id}/detail` | GET | 获取 Skill 详情 |

### 会话接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sessions` | GET | 获取历史会话列表 |
| `/api/sessions/{session_id}` | GET | 获取会话详情 |

### 任务文件接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/task/{session_id}/files` | GET | 获取任务产出文件列表 |
| `/api/task/{session_id}/files/{path}` | GET | 下载/预览文件 |

## Skills 开发

### Skill 目录结构

```
skills/
└── my-skill/
    ├── SKILL.md          # 主指令 (System Prompt)
    ├── skill.yaml        # 元信息配置
    ├── references/       # 参考文档 (可选)
    │   └── api-docs.md
    └── scripts/          # 工具脚本 (可选)
        └── fetch_data.py
```

### skill.yaml 示例

```yaml
name: 我的 Skill
description: Skill 功能描述
icon: "🤖"
category: 工具

# 定价 (可选)
price_per_run: 0.5

# 功能列表
features:
  - 功能 1
  - 功能 2

# 工具脚本
tools:
  - name: fetch_data
    script: scripts/fetch_data.py
    description: 获取数据
```

### SKILL.md 示例

```markdown
# 我的 Skill

## 角色定义
你是一个专业的 AI 助手...

## 工作流程
1. 接收用户输入
2. 分析需求
3. 执行任务
4. 返回结果

## 输出格式
- 使用 Markdown 格式
- 包含必要的图表
```

## 常见问题

### Q: Agent 服务启动失败？

**A:** 检查以下几点：
1. 确保 `.env` 文件中配置了正确的 `ANTHROPIC_API_KEY`
2. 确保 Node.js 版本 >= 18
3. 尝试删除 `node_modules` 重新安装：`rm -rf node_modules && npm install`

### Q: 后端服务启动失败？

**A:** 检查以下几点：
1. 确保 Python 版本 >= 3.10
2. 确保在虚拟环境中安装了依赖
3. 检查端口 8000 是否被占用：`lsof -i :8000`

### Q: 前端无法连接后端？

**A:** 检查以下几点：
1. 确保后端服务已启动并运行在 8000 端口
2. 检查 `vite.config.ts` 中的代理配置
3. 查看浏览器控制台的网络请求错误

### Q: Skill 执行没有响应？

**A:** 检查以下几点：
1. 确保 Agent 服务已启动并运行在 3001 端口
2. 检查 `ANTHROPIC_API_KEY` 是否有效
3. 查看 Agent 服务的控制台日志

### Q: 如何添加新的 Skill？

**A:** 两种方式：
1. **从官方安装**：在 Skills 页面的「官方 Skills」标签页安装
2. **手动创建**：在 `skills/` 目录下创建新文件夹，按照上述结构添加文件

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript | UI 框架 |
| 前端 | Vite | 构建工具 |
| 前端 | Tailwind CSS | 样式框架 |
| 后端 | FastAPI | Web 框架 |
| 后端 | SQLite | 数据库 |
| 后端 | JWT | 认证 |
| Agent | Node.js + Express | 服务框架 |
| Agent | Claude API | AI 能力 |

## 开发路线图

- [x] 用户认证系统
- [x] Skill 执行 (SSE 流式响应)
- [x] 历史会话管理
- [x] 文件预览/下载
- [x] Skill 安装/卸载
- [x] Skill 优化 (AI 辅助)
- [ ] 多用户权限管理
- [ ] Skill 市场
- [ ] 计费系统
- [ ] Docker 部署支持

## License

MIT License - 详见 [LICENSE](LICENSE) 文件
