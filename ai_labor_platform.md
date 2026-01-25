# AI 劳动力平台 (AI Labor Platform)

> 基于 Claude Code Agent 系统构建的 Skills 平台，让用户可以"雇佣"虚拟员工执行标准化工作流

---

## 零、核心定位

### 0.1 产品定位

```
┌─────────────────────────────────────────────────────────────┐
│                       产品定位                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   一句话定位：                                               │
│   「让不会编程的人也能用 AI Agent」                          │
│                                                             │
│   核心差异化：                                               │
│   ┌─────────────────┬─────────────────┐                    │
│   │   Claude Code   │   AI 劳动力平台  │                    │
│   ├─────────────────┼─────────────────┤                    │
│   │ 命令行界面      │ 图形化界面       │                    │
│   │ 需要编程能力    │ 零技术门槛       │                    │
│   │ 每次写 Prompt   │ 预制工作流       │                    │
│   │ 程序员专属      │ 人人可用         │                    │
│   └─────────────────┴─────────────────┘                    │
│                                                             │
│   第一个垂直场景：金融研报助手                               │
│   目标用户：金融从业者、投资者（不会编程但有自动化需求）     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 0.2 为什么这个定位有价值？

| 维度 | 说明 |
|------|------|
| **市场空白** | Claude Code 只服务程序员，但 AI Agent 能力远不止写代码 |
| **用户痛点明确** | 非技术人员想用 AI 自动化，但门槛太高 |
| **差异化清晰** | 不是和 Claude Code 竞争，而是把它的能力带给更多人 |
| **可扩展** | 金融只是第一个场景，未来可以扩展到更多垂直领域 |

### 0.3 核心洞察

```
标准化工作流可以无限复制 + 多倍提效
```

- 配置一次，复用无限次
- 消除重复写 Prompt 的痛苦
- 保证输出质量的一致性

---

## 〇.五、目标用户画像

### 第一批用户：金融从业者

| 属性 | 描述 |
|------|------|
| **职业** | 投研分析师、基金经理、个人投资者 |
| **痛点** | 每天要看大量信息，写分析报告耗时 |
| **特点** | 付费意愿强，但不会编程 |
| **获取渠道** | 创始人的金融圈朋友 |

### 用户故事

**核心故事**：
```
作为一个投研分析师，
我每天要花 3 小时看财报和新闻，
然后花 2 小时写分析报告。

我希望有个工具能帮我自动整理信息、生成初稿，
这样我可以把时间花在更有价值的判断上。
```

**使用场景**：
```
场景一：自然语言输入
用户输入："帮我分析一下腾讯2024年Q3的财报"
→ 系统自动识别公司和时间
→ 自动从港交所下载财报 PDF
→ 生成结构化研报

场景二：上传文件
用户拖入一份刚下载的财报 PDF
→ 系统直接解析
→ 生成结构化研报

场景三：对比分析
用户输入："对比一下阿里和京东最近两年的毛利率变化"
→ 系统自动下载两家公司的财报
→ 提取关键数据
→ 生成对比分析报告
```

### 用户金字塔

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code 用户金字塔                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         ▲  顶层：核心开发者（能写 Skills/MCP）              │
│        ╱ ╲   - 数量：极少                                   │
│       ╱   ╲  - 特点：技术极强，自己造轮子                   │
│      ╱─────╲                                                │
│     ╱       ╲ 中层：熟练用户（会配置、会用）                │
│    ╱         ╲  - 数量：少                                  │
│   ╱───────────╲ - 特点：程序员，能折腾                      │
│  ╱             ╲                                            │
│ ╱               ╲ 底层：潜在用户（听说过但不会用）          │
│╱─────────────────╲ - 数量：巨大  ← 我们的目标市场           │
│                    - 特点：非技术人员，有需求但有门槛       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 〇.七五、验证计划

### 战略路径

```
┌─────────────────────────────────────────────────────────────┐
│                     战略路径                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ❌ 错误路径：                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐               │
│   │ 建平台  │ →  │ 等用户  │ →  │ 没人来  │               │
│   └─────────┘    └─────────┘    └─────────┘               │
│                                                             │
│   ✅ 正确路径：                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌────────┐│
│   │做1个工具│ →  │找10个人 │ →  │验证付费 │ →  │再扩平台││
│   │解决1个痛│    │深度使用 │    │意愿    │    │        ││
│   └─────────┘    └─────────┘    └─────────┘    └────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 0：验证阶段（4周）

**第一周：用户访谈 + 原型设计**
1. 找 5 个金融/炒股的朋友
2. 问他们：
   - 你每天花多少时间看研报/写分析？
   - 最痛苦的环节是什么？
   - 如果有个工具能帮你做 XX，你愿意付多少钱？
3. 画出简单的界面原型（Figma/手绘）
4. 给他们看，收集反馈

**第二周：手动 MVP**
1. 不写代码，用 Claude 手动帮 3 个朋友做研报
2. 记录：
   - 他们的真实需求是什么？
   - 哪些步骤可以标准化？
   - 输出质量是否满足需求？
3. 把手动流程固化成 SKILL.md

**第三周：最小产品开发**
1. 搭建简单的 Web 界面
2. 实现文件上传 + Agent 调用 + 结果展示
3. 让 3 个朋友自己用
4. 收集反馈，快速迭代

**第四周：付费验证**
1. 问：如果这个工具每月 XX 元，你会订阅吗？
2. 如果有 3 个人愿意付费，说明方向对了
3. 开始考虑下一步：更多 Skills、平台化

### 成功标准

| 指标 | 目标 |
|------|------|
| 愿意付费的用户 | ≥ 3 人 |
| 用户满意度 | > 4/5 |
| 单次使用成本 | < 售价的 50% |

---

## 一、核心概念

### 1.1 什么是 AI 劳动力平台？

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI 劳动力平台                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   传统人力市场                      AI 劳动力市场                        │
│   ┌─────────┐                      ┌─────────┐                         │
│   │  员工   │  ←── 对应 ──→        │  Skill  │                         │
│   │ (人类)  │                      │(虚拟员工)│                         │
│   └─────────┘                      └─────────┘                         │
│       ↓                                ↓                               │
│   技能 + 经验                      System Prompt + Tools + MCP          │
│       ↓                                ↓                               │
│   执行任务                     Claude Code Agent 循环执行               │
│       ↓                                ↓                               │
│   交付成果                          输出文件/数据/报告                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心价值主张

| 传统方式 | AI 劳动力平台 |
|----------|---------------|
| 招聘员工，培训上岗 | 选择 Skill，即刻使用 |
| 按月支付工资 | 按使用量付费 |
| 工作时间有限 | 7x24 小时可用 |
| 质量参差不齐 | 标准化输出 |
| 难以规模化 | 无限并发 |

---

## 二、技术架构

### 2.1 架构哲学

**核心原则**：不重复造轮子。Claude Code 的 Agent 系统已经非常成熟，我们在其之上构建「配置层 + 业务层」。

### 2.2 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              前端层 (React)                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │
│   │  Skills 市场 │  │  工作台     │  │  创作工具   │                    │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                    │
└──────────┼────────────────┼────────────────┼────────────────────────────┘
           │                │                │
           ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Python 平台层 (FastAPI)                          │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│   │  /skills    │  │  /sessions  │  │  /users     │  │  /billing   │   │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Node.js Agent 服务 (桥接层)                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │              @anthropic-ai/claude-agent-sdk                      │   │
│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │   │
│   │   │ query() │  │  MCP    │  │ Session │  │  SSE    │           │   │
│   │   │ 执行器  │  │ 加载器  │  │ 管理器  │  │  流    │           │   │
│   │   └─────────┘  └─────────┘  └─────────┘  └─────────┘           │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Claude Code Agent 系统 (底层)                       │
│   完整的 Agent 循环：思考 → 工具调用 → 结果处理 → 继续/终止              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | React + TypeScript | 用户界面 |
| 平台层 | Python + FastAPI | 业务逻辑、数据库 |
| Agent 服务 | Node.js + claude-agent-sdk | 桥接 Claude Code |
| 数据库 | PostgreSQL + Redis | 存储 + 缓存 |
| Agent 引擎 | Claude Code | 核心能力（不自建）|

---

## 三、Skills 体系

### 3.1 Skill 目录结构

每个 Skill 是一个完整的目录，包含主指令、补充文档和工具脚本：

```
skills/
└── pdf-processor/
    ├── SKILL.md              # 主指令（触发时加载）
    ├── FORMS.md              # 表单指南（按需加载）
    ├── reference.md          # API 参考（按需加载）
    ├── examples.md           # 使用示例（按需加载）
    ├── skill.yaml            # 元信息和能力配置
    └── scripts/
        ├── analyze.py        # 分析脚本
        ├── process.py        # 处理脚本
        └── validate.py       # 验证脚本
```

### 3.2 文件职责与加载策略

| 文件 | 加载时机 | 内容 |
|------|----------|------|
| SKILL.md | 立即加载 | 角色定义、核心工作流、输出规范 |
| FORMS.md | 按需加载 | 表单字段说明、填写规则 |
| reference.md | 按需加载 | API 端点、参数、响应格式 |
| examples.md | 按需加载 | 典型用例、边界情况处理 |
| scripts/ | 执行时调用 | Python/Shell 工具脚本 |

### 3.3 SKILL.md 示例

```markdown
# PDF 表单处理专家

你是一个专业的 PDF 表单处理助手。

## 核心能力
1. **表单分析**：识别 PDF 中的表单字段
2. **智能填写**：根据数据自动填写表单
3. **数据验证**：确保填写内容符合要求

## 工作流程
1. 接收用户上传的 PDF 文件
2. 运行 `scripts/analyze.py` 分析表单结构
3. 如需填写指导，读取 `FORMS.md`
4. 运行 `scripts/process.py` 填写表单
5. 运行 `scripts/validate.py` 验证结果

## 输出规范
- 填写完成的 PDF 保存到 `output/` 目录
- 生成填写报告 `report.json`
```

### 3.4 skill.yaml 配置

```yaml
id: pdf-processor
name: PDF 表单处理专家
version: 1.0.0
description: 自动分析、填写和验证 PDF 表单
category: productivity
author: official
repository: https://github.com/ai-labor/skills

capabilities:
  allowed_tools: [Read, Write, Bash, Glob]
  denied_tools: [Edit]
  mcp_servers:
    - name: pdf-tools
      command: npx
      args: ["-y", "@anthropic-ai/mcp-pdf"]
  dependencies:
    python: ["PyPDF2>=3.0", "pdfplumber>=0.9"]

pricing:
  model: per_use
  price: 0.5
  currency: CNY
```

### 3.5 Skills 市场与仓库

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Skills 生态系统                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐            │
│   │  官方仓库   │      │  社区仓库   │      │  私有仓库   │            │
│   │  (official) │      │ (community) │      │  (private)  │            │
│   └──────┬──────┘      └──────┬──────┘      └──────┬──────┘            │
│          │                    │                    │                    │
│          └────────────────────┼────────────────────┘                    │
│                               ▼                                         │
│                    ┌─────────────────────┐                              │
│                    │    Skills Registry   │                              │
│                    │    (中央索引服务)    │                              │
│                    └──────────┬──────────┘                              │
│                               │                                         │
│          ┌────────────────────┼────────────────────┐                    │
│          ▼                    ▼                    ▼                    │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐            │
│   │   浏览      │      │   安装      │      │   更新      │            │
│   │   搜索      │      │   卸载      │      │   版本管理  │            │
│   └─────────────┘      └─────────────┘      └─────────────┘            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.6 Skills 安装与管理

**CLI 命令**：

```bash
# 搜索 Skills
ailabor skill search "pdf"

# 安装 Skill（从官方仓库）
ailabor skill install pdf-processor

# 安装指定版本
ailabor skill install pdf-processor@1.2.0

# 从 GitHub 安装
ailabor skill install github:username/my-skill

# 从本地路径安装
ailabor skill install ./my-local-skill

# 列出已安装的 Skills
ailabor skill list

# 更新 Skill
ailabor skill update pdf-processor

# 卸载 Skill
ailabor skill uninstall pdf-processor
```

**安装流程**：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Skill 安装流程                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 解析来源                                                            │
│     ├─ 官方仓库: pdf-processor → registry.ailabor.com/pdf-processor     │
│     ├─ GitHub: github:user/repo → https://github.com/user/repo          │
│     └─ 本地: ./path → 直接复制                                          │
│                                                                         │
│  2. 下载/复制文件                                                       │
│     └─ 下载到 ~/.ailabor/skills/{skill-id}/                             │
│                                                                         │
│  3. 验证结构                                                            │
│     ├─ 检查 SKILL.md 存在                                               │
│     ├─ 检查 skill.yaml 格式                                             │
│     └─ 验证脚本安全性（可选沙盒扫描）                                    │
│                                                                         │
│  4. 安装依赖                                                            │
│     ├─ Python: pip install -r requirements.txt                          │
│     ├─ Node.js: npm install (如有 package.json)                         │
│     └─ MCP: 预热 MCP 服务器                                             │
│                                                                         │
│  5. 注册到本地索引                                                      │
│     └─ 更新 ~/.ailabor/skills.json                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.7 Skills 创建工具

**CLI 创建命令**：

```bash
# 交互式创建新 Skill
ailabor skill create

# 从模板创建
ailabor skill create --template pdf-processor

# 验证 Skill 结构
ailabor skill validate ./my-skill

# 本地测试运行
ailabor skill test ./my-skill --prompt "处理这个PDF"

# 发布到社区仓库
ailabor skill publish ./my-skill
```

**创建流程**：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Skill 创建流程                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: 初始化                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  $ ailabor skill create                                          │   │
│  │  ? Skill ID: my-awesome-skill                                    │   │
│  │  ? Skill 名称: 我的超棒技能                                       │   │
│  │  ? 分类: [productivity/development/data/creative]                │   │
│  │  ? 描述: 这个技能可以...                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Step 2: 生成目录结构                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  my-awesome-skill/                                               │   │
│  │  ├── SKILL.md           # 已生成模板                             │   │
│  │  ├── skill.yaml         # 已填充基本信息                         │   │
│  │  ├── examples.md        # 示例模板                               │   │
│  │  └── scripts/                                                    │   │
│  │      └── .gitkeep                                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Step 3: 编写核心逻辑                                                   │
│  ├─ 编辑 SKILL.md 定义角色和工作流                                      │
│  ├─ 添加 scripts/ 下的工具脚本                                          │
│  └─ 配置 skill.yaml 中的能力和依赖                                      │
│                                                                         │
│  Step 4: 测试验证                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  $ ailabor skill validate ./my-awesome-skill                     │   │
│  │  ✓ SKILL.md 存在且格式正确                                        │   │
│  │  ✓ skill.yaml 配置有效                                           │   │
│  │  ✓ scripts/ 脚本可执行                                           │   │
│  │  ✓ 依赖声明完整                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Step 5: 发布                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  $ ailabor skill publish ./my-awesome-skill                      │   │
│  │  ? 发布到: [community/private]                                   │   │
│  │  ✓ 已发布到 community/my-awesome-skill@1.0.0                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.8 Skills 服务实现

```python
# ════════════════════════════════════════════════════════════════════════
#  src/services/skill_manager.py - Skills 管理服务
# ════════════════════════════════════════════════════════════════════════

import shutil
import subprocess
from pathlib import Path
from typing import Optional
import yaml
import httpx

class SkillManager:
    """Skills 安装、卸载、更新管理"""

    def __init__(self, skills_dir: Path = None):
        self.skills_dir = skills_dir or Path.home() / ".ailabor" / "skills"
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        self.registry_url = "https://registry.ailabor.com"

    async def search(self, query: str) -> list[dict]:
        """搜索 Skills"""
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.registry_url}/search", params={"q": query})
            return resp.json()["skills"]

    async def install(self, source: str, version: str = "latest") -> dict:
        """安装 Skill"""
        # 解析来源
        skill_id, download_url = await self._resolve_source(source, version)
        target_dir = self.skills_dir / skill_id

        # 下载/复制
        if download_url.startswith("http"):
            await self._download_skill(download_url, target_dir)
        else:
            shutil.copytree(download_url, target_dir)

        # 验证结构
        self._validate_structure(target_dir)

        # 安装依赖
        await self._install_dependencies(target_dir)

        # 注册到本地索引
        self._register_skill(skill_id, target_dir)

        return {"skill_id": skill_id, "path": str(target_dir)}

    async def uninstall(self, skill_id: str) -> bool:
        """卸载 Skill"""
        target_dir = self.skills_dir / skill_id
        if target_dir.exists():
            shutil.rmtree(target_dir)
            self._unregister_skill(skill_id)
            return True
        return False

    async def list_installed(self) -> list[dict]:
        """列出已安装的 Skills"""
        skills = []
        for skill_dir in self.skills_dir.iterdir():
            if skill_dir.is_dir():
                config_path = skill_dir / "skill.yaml"
                if config_path.exists():
                    with open(config_path) as f:
                        config = yaml.safe_load(f)
                    skills.append({
                        "id": config.get("id"),
                        "name": config.get("name"),
                        "version": config.get("version"),
                        "path": str(skill_dir),
                    })
        return skills

    def _validate_structure(self, skill_dir: Path) -> None:
        """验证 Skill 目录结构"""
        required_files = ["SKILL.md", "skill.yaml"]
        for f in required_files:
            if not (skill_dir / f).exists():
                raise ValueError(f"Missing required file: {f}")

    async def _install_dependencies(self, skill_dir: Path) -> None:
        """安装 Skill 依赖"""
        # Python 依赖
        requirements = skill_dir / "requirements.txt"
        if requirements.exists():
            subprocess.run(["pip", "install", "-r", str(requirements)], check=True)

        # Node.js 依赖
        package_json = skill_dir / "package.json"
        if package_json.exists():
            subprocess.run(["npm", "install"], cwd=skill_dir, check=True)
```

---

## 四、Node.js Agent 服务

这是一个薄薄的桥接层，封装 `@anthropic-ai/claude-agent-sdk`，提供 HTTP 接口给 Python 平台层调用。

### 4.1 项目结构

```
agent-service/
├── package.json
└── src/
    ├── index.ts              # 入口，Express 服务
    ├── skill-loader.ts       # Skill 加载器
    ├── session-manager.ts    # 会话管理（含中止控制）
    ├── mcp-loader.ts         # MCP 多源配置加载
    └── sse.ts                # SSE 流工具
```

### 4.2 核心实现

```typescript
// ════════════════════════════════════════════════════════════════════════
//  agent-service/src/index.ts
// ════════════════════════════════════════════════════════════════════════

import express from 'express';
import { query, Options } from '@anthropic-ai/claude-agent-sdk';
import { loadSkill } from './skill-loader';
import { loadMcpServers } from './mcp-loader';
import { sessionManager } from './session-manager';

const app = express();
app.use(express.json({ limit: '10mb' }));

// ─────────────────────────────────────────────────────────────────────────
//  POST /agent/run - 执行 Agent
// ─────────────────────────────────────────────────────────────────────────
app.post('/agent/run', async (req, res) => {
  const { sessionId, prompt, skillId, workDir } = req.body;

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 创建会话（含 AbortController）
  const abortController = sessionManager.create(sessionId);

  try {
    // 加载 Skill 和 MCP 配置
    const skill = await loadSkill(`./skills/${skillId}`);
    const mcpServers = await loadMcpServers();

    // 构建 query 选项
    const options: Options = {
      systemPrompt: skill.mainPrompt,
      cwd: workDir,
      abortController,
      mcpServers: Object.entries(mcpServers).map(([name, cfg]) => ({
        name, ...cfg
      })),
    };

    // 执行 Agent 并流式返回
    for await (const message of query({ prompt, options })) {
      if (abortController.signal.aborted) break;
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    }

    sessionManager.complete(sessionId);
    res.write('data: {"type":"done"}\n\n');
  } catch (error) {
    res.write(`data: {"type":"error","message":"${error.message}"}\n\n`);
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /agent/stop/:sessionId - 中止会话
// ─────────────────────────────────────────────────────────────────────────
app.post('/agent/stop/:sessionId', (req, res) => {
  const success = sessionManager.abort(req.params.sessionId);
  res.json({ success });
});

app.listen(3001, () => console.log('Agent service on port 3001'));
```

### 4.3 Skill 加载器

```typescript
// ════════════════════════════════════════════════════════════════════════
//  agent-service/src/skill-loader.ts
// ════════════════════════════════════════════════════════════════════════

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

interface SkillConfig {
  id: string;
  mainPrompt: string;
  supplementaryDocs: Record<string, string>;  // 路径映射
  scripts: string[];
}

export async function loadSkill(skillDir: string): Promise<SkillConfig> {
  // 加载主指令
  const mainPrompt = await readFile(join(skillDir, 'SKILL.md'), 'utf-8');

  // 扫描补充文档（仅记录路径，按需加载）
  const supplementaryDocs: Record<string, string> = {};
  for (const doc of ['FORMS.md', 'reference.md', 'examples.md']) {
    const docPath = join(skillDir, doc);
    try {
      await stat(docPath);
      supplementaryDocs[doc.replace('.md', '').toLowerCase()] = docPath;
    } catch { /* 不存在则跳过 */ }
  }

  // 扫描脚本目录
  let scripts: string[] = [];
  const scriptsDir = join(skillDir, 'scripts');
  try {
    const files = await readdir(scriptsDir);
    scripts = files
      .filter(f => f.endsWith('.py') || f.endsWith('.sh'))
      .map(f => join(scriptsDir, f));
  } catch { /* 目录不存在 */ }

  return {
    id: skillDir.split('/').pop() || '',
    mainPrompt,
    supplementaryDocs,
    scripts,
  };
}
```

### 4.4 会话管理器

```typescript
// ════════════════════════════════════════════════════════════════════════
//  agent-service/src/session-manager.ts
// ════════════════════════════════════════════════════════════════════════

interface Session {
  id: string;
  abortController: AbortController;
  startedAt: Date;
  status: 'running' | 'completed' | 'aborted';
}

class SessionManager {
  private sessions = new Map<string, Session>();

  create(sessionId: string): AbortController {
    const abortController = new AbortController();
    this.sessions.set(sessionId, {
      id: sessionId,
      abortController,
      startedAt: new Date(),
      status: 'running',
    });
    return abortController;
  }

  abort(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.abortController.abort();
    session.status = 'aborted';
    return true;
  }

  complete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.status = 'completed';
  }

  // 定期清理过期会话
  cleanup(): void {
    const maxAge = 60 * 60 * 1000;
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.startedAt.getTime() > maxAge) this.sessions.delete(id);
    }
  }
}

export const sessionManager = new SessionManager();
setInterval(() => sessionManager.cleanup(), 10 * 60 * 1000);
```

### 4.5 MCP 多源加载

```typescript
// ════════════════════════════════════════════════════════════════════════
//  agent-service/src/mcp-loader.ts
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export async function loadMcpServers(): Promise<Record<string, McpServerConfig>> {
  const home = homedir();
  const configPaths = [
    join(home, '.ai-labor', 'mcp.json'),
    join(home, '.claude', 'settings.json'),
  ];

  const allServers: Record<string, McpServerConfig> = {};

  for (const configPath of configPaths) {
    try {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      const servers = config.mcpServers || config.mcp_servers || {};
      Object.assign(allServers, servers);
    } catch { /* 配置不存在 */ }
  }

  return allServers;
}
```

---

## 五、Python 平台层

### 5.1 项目结构

```
ai-labor-platform/
├── pyproject.toml
├── docker-compose.yml
├── src/
│   ├── api/
│   │   ├── main.py           # FastAPI 入口
│   │   └── routers/
│   │       ├── skills.py     # Skills 市场 + 管理
│   │       ├── sessions.py   # 会话管理
│   │       ├── users.py      # 用户管理
│   │       └── billing.py    # 计费
│   ├── services/
│   │   ├── skill_service.py  # Skill 加载
│   │   ├── skill_manager.py  # Skill 安装/卸载/更新
│   │   ├── session_service.py
│   │   ├── agent_client.py   # 调用 Node.js Agent 服务
│   │   └── billing_service.py
│   └── models/
│       ├── skill.py
│       ├── session.py
│       └── user.py
├── skills/                   # 本地 Skill 目录
├── cli/                      # CLI 工具
│   └── ailabor.py
└── agent-service/            # Node.js Agent 服务
```

### 5.2 Skills API

```python
# ════════════════════════════════════════════════════════════════════════
#  src/api/routers/skills.py - Skills 市场与管理 API
# ════════════════════════════════════════════════════════════════════════

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import Optional

from src.services.skill_manager import SkillManager
from src.services.skill_service import SkillService

router = APIRouter(prefix="/skills", tags=["skills"])

# ─────────────────────────────────────────────────────────────────────────
#  市场：浏览与搜索
# ─────────────────────────────────────────────────────────────────────────

@router.get("")
async def list_skills(
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db = Depends(get_db),
):
    """获取 Skills 列表（市场）"""
    return await SkillService(db).list_skills(
        category=category, search=search, page=page, limit=limit
    )

@router.get("/{skill_id}")
async def get_skill(skill_id: str, db = Depends(get_db)):
    """获取 Skill 详情"""
    skill = await SkillService(db).get_skill(skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    return skill

@router.get("/{skill_id}/versions")
async def get_skill_versions(skill_id: str, db = Depends(get_db)):
    """获取 Skill 版本历史"""
    return await SkillService(db).get_versions(skill_id)

# ─────────────────────────────────────────────────────────────────────────
#  用户：安装与管理
# ─────────────────────────────────────────────────────────────────────────

@router.post("/install")
async def install_skill(
    source: str,
    version: str = "latest",
    user = Depends(get_current_user),
):
    """安装 Skill"""
    manager = SkillManager(user_id=user.id)
    result = await manager.install(source, version)
    return {"success": True, **result}

@router.delete("/{skill_id}")
async def uninstall_skill(
    skill_id: str,
    user = Depends(get_current_user),
):
    """卸载 Skill"""
    manager = SkillManager(user_id=user.id)
    success = await manager.uninstall(skill_id)
    return {"success": success}

@router.get("/installed")
async def list_installed_skills(user = Depends(get_current_user)):
    """列出用户已安装的 Skills"""
    manager = SkillManager(user_id=user.id)
    return await manager.list_installed()

@router.post("/{skill_id}/update")
async def update_skill(
    skill_id: str,
    version: str = "latest",
    user = Depends(get_current_user),
):
    """更新 Skill"""
    manager = SkillManager(user_id=user.id)
    result = await manager.update(skill_id, version)
    return {"success": True, **result}

# ─────────────────────────────────────────────────────────────────────────
#  创作者：创建与发布
# ─────────────────────────────────────────────────────────────────────────

@router.post("/create")
async def create_skill(
    skill_id: str,
    name: str,
    category: str,
    description: str,
    user = Depends(get_current_user),
):
    """创建新 Skill（生成模板）"""
    manager = SkillManager(user_id=user.id)
    result = await manager.create_template(
        skill_id=skill_id, name=name, category=category, description=description
    )
    return {"success": True, **result}

@router.post("/validate")
async def validate_skill(
    skill_path: str,
    user = Depends(get_current_user),
):
    """验证 Skill 结构"""
    manager = SkillManager(user_id=user.id)
    errors = manager.validate(skill_path)
    return {"valid": len(errors) == 0, "errors": errors}

@router.post("/publish")
async def publish_skill(
    skill_path: str,
    repository: str = "community",  # community/private
    user = Depends(get_current_user),
    db = Depends(get_db),
):
    """发布 Skill 到仓库"""
    manager = SkillManager(user_id=user.id)
    result = await manager.publish(skill_path, repository, db)
    return {"success": True, **result}

# ─────────────────────────────────────────────────────────────────────────
#  评价
# ─────────────────────────────────────────────────────────────────────────

@router.post("/{skill_id}/review")
async def review_skill(
    skill_id: str,
    rating: int,
    comment: str = "",
    user = Depends(get_current_user),
    db = Depends(get_db),
):
    """评价 Skill"""
    return await SkillService(db).add_review(
        skill_id=skill_id, user_id=user.id, rating=rating, comment=comment
    )
```

### 5.3 Agent 客户端

```python
# ════════════════════════════════════════════════════════════════════════
#  src/services/agent_client.py
# ════════════════════════════════════════════════════════════════════════

import httpx
import json
from typing import AsyncGenerator

class AgentClient:
    """调用 Node.js Agent 服务"""

    def __init__(self, base_url: str = "http://localhost:3001"):
        self.base_url = base_url

    async def run(
        self,
        session_id: str,
        prompt: str,
        skill_id: str,
        work_dir: str,
    ) -> AsyncGenerator[dict, None]:
        """执行 Agent，流式返回消息"""
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/agent/run",
                json={
                    "sessionId": session_id,
                    "prompt": prompt,
                    "skillId": skill_id,
                    "workDir": work_dir,
                },
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        message = json.loads(line[6:])
                        yield message
                        if message.get("type") == "done":
                            break

    async def stop(self, session_id: str) -> bool:
        """中止会话"""
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{self.base_url}/agent/stop/{session_id}")
            return resp.json().get("success", False)
```

### 5.4 Sessions API

```python
# ════════════════════════════════════════════════════════════════════════
#  src/api/routers/sessions.py
# ════════════════════════════════════════════════════════════════════════

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import json

from src.services.agent_client import AgentClient
from src.services.skill_service import SkillService

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.post("")
async def create_session(
    request: SessionCreate,
    db = Depends(get_db),
    user = Depends(get_current_user),
):
    """创建执行会话，返回 SSE 流"""
    # 加载 Skill
    skill = await SkillService(db).get_skill(request.skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")

    # 创建工作目录
    work_dir = create_work_dir(user.id, request.session_id)

    # 调用 Agent 服务
    agent = AgentClient()

    async def generate():
        async for msg in agent.run(
            session_id=request.session_id,
            prompt=request.prompt,
            skill_id=request.skill_id,
            work_dir=work_dir,
        ):
            yield f"data: {json.dumps(msg)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
    )

@router.post("/{session_id}/stop")
async def stop_session(session_id: str):
    """中止会话"""
    success = await AgentClient().stop(session_id)
    return {"success": success}
```

---

## 六、数据库设计

```sql
-- ════════════════════════════════════════════════════════════════════════
--  用户相关
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(128) NOT NULL,
    role VARCHAR(32) DEFAULT 'user',  -- user/creator/admin
    balance DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ════════════════════════════════════════════════════════════════════════
--  Skills 仓库（中央索引）
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE skill_registry (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    category VARCHAR(32),
    author_id VARCHAR(64) REFERENCES users(id),
    repository_type VARCHAR(32) DEFAULT 'official',  -- official/community/private
    repository_url TEXT,
    latest_version VARCHAR(32) DEFAULT '1.0.0',
    download_count INTEGER DEFAULT 0,
    rating DECIMAL(3, 2) DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skills 版本历史
CREATE TABLE skill_versions (
    id SERIAL PRIMARY KEY,
    skill_id VARCHAR(64) REFERENCES skill_registry(id),
    version VARCHAR(32) NOT NULL,
    changelog TEXT,
    download_url TEXT NOT NULL,
    checksum VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, version)
);

-- ════════════════════════════════════════════════════════════════════════
--  用户安装的 Skills
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE user_skills (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    skill_id VARCHAR(64) REFERENCES skill_registry(id),
    installed_version VARCHAR(32) NOT NULL,
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    UNIQUE(user_id, skill_id)
);

-- ════════════════════════════════════════════════════════════════════════
--  会话与消息
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    skill_id VARCHAR(64) REFERENCES skill_registry(id),
    prompt TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'running',
    cost DECIMAL(10, 4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) REFERENCES sessions(id),
    type VARCHAR(32) NOT NULL,
    content TEXT,
    tool_name VARCHAR(64),
    tool_input JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ════════════════════════════════════════════════════════════════════════
--  Skills 评价
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE skill_reviews (
    id SERIAL PRIMARY KEY,
    skill_id VARCHAR(64) REFERENCES skill_registry(id),
    user_id VARCHAR(64) REFERENCES users(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, user_id)
);
```

---

## 七、部署架构

```yaml
# docker-compose.yml
version: '3.8'

services:
  platform:
    build: .
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/ailabor
      - AGENT_SERVICE_URL=http://agent:3001
    depends_on: [postgres, redis, agent]

  agent:
    build: ./agent-service
    ports: ["3001:3001"]
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./workspaces:/workspaces

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=ailabor

  redis:
    image: redis:7
```

---

## 八、实现路线图

### Phase 0: 验证（4周）⭐ 当前阶段
- [ ] 用户访谈（5人）
- [ ] 手动 MVP 验证（用 Claude 手动帮用户做研报）
- [ ] 最小产品开发（简单 Web 界面）
- [ ] 付费验证（至少 3 人愿意付费）

### Phase 1: MVP（调整后）
- [ ] 简单 Web 界面（登录、Skill 执行、结果展示）
- [ ] 金融研报 Skill（第一个垂直场景）
- [ ] 基础计费功能
- [ ] 部署上线

**MVP 功能清单**：

```
┌─────────────────────────────────────────────────────────────┐
│                     MVP 功能清单                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   前端（React）                                              │
│   ├── 登录/注册页面（简单即可）                             │
│   ├── Skills 列表页（MVP只有1个Skill）                      │
│   ├── Skill 执行页面                                        │
│   │   ├── 通用输入区（见下方详细设计）                      │
│   │   ├── 执行按钮                                          │
│   │   ├── 实时进度展示（SSE流式）                           │
│   │   └── 结果展示（Markdown渲染 + 下载）                   │
│   └── 历史记录页面                                          │
│                                                             │
│   后端（FastAPI）                                            │
│   ├── 用户认证（JWT）                                       │
│   ├── 文件上传/存储                                         │
│   ├── 数据源适配器（PDF下载、网页抓取等）                   │
│   ├── Skill 执行（调用 Claude API）                         │
│   ├── 结果存储/查询                                         │
│   └── 简单计费（按次计费）                                  │
│                                                             │
│   金融研报 Skill                                             │
│   ├── SKILL.md（角色定义、工作流）                          │
│   ├── scripts/fetch_data.py（数据获取）                     │
│   ├── scripts/analyze.py（财报解析）                        │
│   └── scripts/report.py（报告生成）                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**通用输入设计**：

```
┌─────────────────────────────────────────────────────────────┐
│                     通用输入设计                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   用户输入方式（三选一或组合）：                             │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  方式一：自然语言 Query                              │   │
│   │  ┌─────────────────────────────────────────────┐   │   │
│   │  │ 输入框：帮我分析一下腾讯2024年的财报        │   │   │
│   │  └─────────────────────────────────────────────┘   │   │
│   │  → 系统自动识别：公司=腾讯，年份=2024              │   │
│   │  → 自动下载对应财报 PDF                            │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  方式二：上传文件                                    │   │
│   │  ┌─────────────────────────────────────────────┐   │   │
│   │  │ [拖拽上传] 或 [点击选择文件]                 │   │   │
│   │  │ 支持：PDF / Excel / Word / 图片              │   │   │
│   │  └─────────────────────────────────────────────┘   │   │
│   │  → 直接使用用户上传的文件                          │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  方式三：结构化参数（可选，高级用户）                │   │
│   │  ┌───────────────┐  ┌───────────────┐              │   │
│   │  │ 股票代码：    │  │ 分析维度：    │              │   │
│   │  │ [0700.HK   ]  │  │ [▼ 全面分析]  │              │   │
│   │  └───────────────┘  └───────────────┘              │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   输入处理流程：                                             │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐               │
│   │ 用户输入 │ →  │ 意图识别 │ →  │ 数据获取 │ → 执行Skill │
│   └─────────┘    └─────────┘    └─────────┘               │
│                                                             │
│   意图识别（由 Claude 完成）：                               │
│   - 从自然语言中提取：公司名/股票代码、时间范围、分析类型   │
│   - 判断是否需要下载数据，还是使用用户上传的文件           │
│                                                             │
│   数据获取（数据源适配器）：                                 │
│   - 巨潮资讯网：A股财报 PDF                                 │
│   - 港交所披露易：港股财报 PDF                              │
│   - SEC EDGAR：美股财报                                     │
│   - 东方财富/同花顺：实时行情、历史数据                     │
│   - 用户上传：直接使用                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**MVP 架构简化**：

```
原架构（完整版）：
React → FastAPI → Node.js Agent → Claude Code

MVP架构（简化版）：
React → FastAPI → Claude API（直接调用）

为什么可以简化？
- MVP 只有 1 个 Skill，不需要复杂的 Skill 加载机制
- 可以把 SKILL.md 的内容直接作为 System Prompt
- 等验证成功后，再引入 Node.js Agent 层
```

### Phase 2: 平台化（原 Phase 2-3 合并）
- [ ] Skills 市场 API（列表/详情/搜索）
- [ ] Skills 安装/卸载/更新
- [ ] 更多 Skills（周报、文档处理等）
- [ ] 用户系统完善
- [ ] CLI 工具（ailabor skill install/create/publish）

### Phase 3: 生态（原 Phase 4-5 合并）
- [ ] Skill 创建模板生成
- [ ] Skill 验证工具
- [ ] 社区仓库发布
- [ ] 创作者后台（收益统计）
- [ ] MCP 服务器管理
- [ ] 沙盒执行环境
- [ ] 私有仓库支持
- [ ] 企业版功能

---

## 九、总结

### 核心定位

```
「让不会编程的人也能用 AI Agent」
```

- **差异化**：Claude Code 服务程序员，我们服务所有人
- **第一个场景**：金融研报助手
- **目标用户**：金融从业者（付费意愿强，但不会编程）

### 技术架构

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| Agent 引擎 | Claude Code | 核心能力，不自建 |
| Agent 桥接 | Node.js + claude-agent-sdk | 薄薄一层（MVP 可简化） |
| 平台层 | Python + FastAPI | 业务逻辑 |
| Skills 仓库 | Registry + GitHub | 官方/社区/私有 |
| 通信协议 | HTTP + SSE | 流式响应 |

### 核心洞察

1. 站在 Claude Code 的肩膀上，不重复造轮子
2. Skills = SKILL.md + 补充文档 + 脚本 + 配置
3. 混合架构：Python 业务 + Node.js 桥接
4. SSE 实现实时流式输出
5. Skills 生态：创建 → 发布 → 安装 → 使用 → 评价
6. **先验证，再扩展**：用 1 个 Skill 验证 PMF，再做平台

### 路线图概览

```
Phase 0: 验证（4周）    ← 当前阶段
    ↓
Phase 1: MVP（金融研报 + 简单界面）
    ↓
Phase 2: 平台化（Skills 市场 + 更多 Skills）
    ↓
Phase 3: 生态（创作者工具 + 企业版）
```

### Skills 生命周期

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Skills 生命周期                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   创作者                                                                │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐            │
│   │  创建   │ →  │  测试   │ →  │  验证   │ →  │  发布   │            │
│   │ create  │    │  test   │    │ validate│    │ publish │            │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘            │
│                                                      │                  │
│                                                      ▼                  │
│                                              ┌─────────────┐            │
│                                              │  Skills     │            │
│                                              │  Registry   │            │
│                                              └──────┬──────┘            │
│                                                     │                   │
│   用户                                              ▼                   │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐            │
│   │  搜索   │ →  │  安装   │ →  │  使用   │ →  │  评价   │            │
│   │ search  │    │ install │    │  run    │    │ review  │            │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

> 文档版本：6.0.0
> 最后更新：2026-01-25
> 核心改动：
> - 新增「零、核心定位」章节
> - 新增「〇.五、目标用户画像」章节
> - 新增「〇.七五、验证计划」章节
> - 调整实现路线图，增加 Phase 0 验证阶段
> - 简化 MVP 技术架构
