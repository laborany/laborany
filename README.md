# LaborAny AI 劳动力平台

> 让不会编程的人也能用 AI Agent

LaborAny 是一个 AI 劳动力平台，通过可视化界面让用户轻松使用各种 AI Skills（如金融研报分析、股票分析等），无需编程知识。

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
├── src-api/               # Node.js API 服务
│   ├── src/
│   │   ├── core/         # 核心模块 (数据库、Agent 执行)
│   │   └── routes/       # API 路由
│   └── package.json
│
├── agent-service/         # Agent 执行服务
│   ├── src/
│   │   ├── routes/       # 对话、Cron、技能路由
│   │   ├── pipeline/     # 执行管线
│   │   ├── memory/       # 三级记忆系统
│   │   └── cron/         # 定时任务
│   └── package.json
│
├── shared/                # 前后端共享模块
│   └── src/
│       ├── skill-loader.ts
│       └── capability-naming.ts
│
├── skills/                # AI Skills 目录
│   ├── stock-analyzer/   # 股票分析
│   ├── financial-report/ # 金融研报
│   ├── pdf/              # PDF 处理
│   └── ...               # 30+ Skills
│
├── tasks/                 # 任务产出文件 (git ignored)
├── .env.example          # 环境变量示例
└── .env                  # 环境变量 (git ignored)
```

## 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.0 | 所有服务和前端构建 |
| npm | >= 9.0 | 包管理器 |

## 快速开始

### 1. 克隆项目

```bash
git clone git@github.com:chensnathan/laborany.git
cd laborany
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

`.env` 核心配置：

```env
# Anthropic API Key (必填)
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 3. 安装依赖

```bash
npm install
```

### 4. 启动服务

打开 3 个终端窗口：

```bash
# 终端 1: API 服务 (端口 3000)
npm run dev:api

# 终端 2: Agent 服务 (端口 3001)
npm run dev:agent

# 终端 3: 前端 (端口 5173)
npm run dev:frontend
```

### 5. 访问应用

打开浏览器访问：**http://localhost:5173**

## Skills 开发

### Skill 目录结构

```
skills/
└── my-skill/
    ├── SKILL.md          # 主指令 (System Prompt)
    ├── steps.yaml        # 多步骤定义 (可选)
    ├── references/       # 参考文档 (可选)
    └── scripts/          # 工具脚本 (可选)
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
```

## 常见问题

### Q: Agent 服务启动失败？

检查以下几点：
1. `.env` 中配置了正确的 `ANTHROPIC_API_KEY`
2. Node.js 版本 >= 18
3. 尝试 `rm -rf node_modules && npm install`

### Q: Skill 执行没有响应？

检查以下几点：
1. Agent 服务已启动并运行在 3001 端口
2. `ANTHROPIC_API_KEY` 有效
3. 查看 Agent 服务控制台日志

### Q: 如何添加新的 Skill？

两种方式：
1. 在 Skills 页面的「官方 Skills」标签页安装
2. 在 `skills/` 目录下创建新文件夹，添加 `SKILL.md`

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript | UI 框架 |
| 前端 | Vite | 构建工具 |
| 前端 | Tailwind CSS | 样式框架 |
| API | Node.js + Express | API 服务 |
| Agent | Node.js + Express | Agent 执行服务 |
| AI | Claude API | AI 能力 |
| 共享 | TypeScript | 前后端共享类型和工具 |

## License

MIT License - 详见 [LICENSE](LICENSE) 文件
