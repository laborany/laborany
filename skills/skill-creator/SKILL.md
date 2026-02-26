---
name: 技能创建助手
description: 创建、测试和迭代改进技能的开发指南，用于扩展 Claude 的专业知识、工作流程或工具集成。包含完整的 evaluate 体系：创建 skill 后可以跑测试用例、量化评分、迭代优化 description。
license: Complete terms in LICENSE.txt
icon: 🛠️
category: 开发
---

# Skill Creator

Create and iteratively improve skills through evaluation, scoring, and description optimization.

## About Skills

Skills are modular, self-contained packages that extend Claude's capabilities with specialized knowledge, workflows, and tools. They transform Claude from a general-purpose agent into a specialized one equipped with procedural knowledge.

### What Skills Provide

1. Specialized workflows — Multi-step procedures for specific domains
2. Tool integrations — Instructions for working with specific file formats or APIs
3. Domain expertise — Company-specific knowledge, schemas, business logic
4. Bundled resources — Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key

The context window is a public good shared with system prompt, conversation history, other skills' metadata, and the user request.

**Default assumption: Claude is already very smart.** Only add context Claude doesn't already have. Challenge each piece of information: "Does Claude really need this?" and "Does this paragraph justify its token cost?"

### Set Appropriate Degrees of Freedom

- **High freedom** (text-based instructions): Multiple approaches valid, decisions depend on context
- **Medium freedom** (pseudocode/scripts with parameters): Preferred pattern exists, some variation acceptable
- **Low freedom** (specific scripts, few parameters): Operations fragile, consistency critical

### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name + description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/      — Executable code
    ├── references/   — Documentation loaded into context as needed
    └── assets/       — Files used in output (templates, icons, fonts)
```

#### SKILL.md (required)

- **Frontmatter** (YAML): `name` and `description` fields. These determine when the skill triggers — be clear and comprehensive.
- **Body** (Markdown): Instructions loaded AFTER the skill triggers.

#### Bundled Resources (optional)

- **scripts/**: Executable code for tasks needing deterministic reliability or repeatedly rewritten code
- **references/**: Documentation loaded as needed to inform Claude's process
- **assets/**: Files used in output, not loaded into context

#### What to Not Include

Do NOT create extraneous documentation: README.md, INSTALLATION_GUIDE.md, CHANGELOG.md, etc. The skill should only contain information needed for an AI agent to do the job.

## Communicating with the User

Many skill users are not technical. When communicating:

- Use plain language. Avoid jargon unless the user introduced it first.
- Explain what you're doing and why, not just the technical details.
- When asking for input, provide concrete examples of what you need.
- If something fails, explain what happened in user-friendly terms and what you'll try next.
- Celebrate progress — let the user know when milestones are reached.

## Skill Creation Process

1. Understand the skill with concrete examples
2. Plan reusable skill contents (scripts, references, assets)
3. Initialize the skill (run init_skill.py)
4. Edit the skill (implement resources and write SKILL.md)
5. Package the skill (run package_skill.py)
6. Run and evaluate test cases
7. Improve the skill description
8. Iterate based on evaluation results

### Step 1: Understanding the Skill

Skip only when usage patterns are already clearly understood.

Ask targeted questions:
- "What functionality should this skill support?"
- "Can you give examples of how it would be used?"
- "What would a user say that should trigger this skill?"

Avoid overwhelming users — start with the most important questions.

### Step 2: Planning Reusable Contents

Analyze each concrete example:
1. Consider how to execute from scratch
2. Identify what scripts, references, and assets would help when executing repeatedly

### Step 3: Initializing the Skill

Run `init_skill.py` to generate a template skill directory:

```bash
scripts/init_skill.py <skill-name> --path <output-directory>
```

Skip if the skill already exists and only needs iteration.

### Step 4: Edit the Skill

Remember: the skill is for another Claude instance to use. Include non-obvious procedural knowledge and domain-specific details.

#### Frontmatter

Write `name` and `description`:
- `description` is the primary triggering mechanism
- Include both what the skill does AND specific triggers/contexts
- All "when to use" info goes here — the body is only loaded after triggering

For LaborAny skills, also include `icon` and `category`.

#### Body

Write instructions for using the skill and its bundled resources. Keep SKILL.md body under 500 lines. Split into reference files when approaching this limit.

### Step 5: Packaging

```bash
scripts/package_skill.py <path/to/skill-folder>
```

Validates the skill and creates a distributable .skill file (zip format).

### Step 6: Running and Evaluating Test Cases

This is the core of the evaluate system. The goal is to quantify skill quality and identify areas for improvement.

#### 6.1 Define Test Cases

Create `eval/eval_metadata.json` in the skill directory. See `references/schemas.md` for the schema. Each test case has:
- A user prompt (what the user would say)
- Assertions (expected behaviors/properties of the output)
- Optional tags and weights

#### 6.2 Spawn Evaluation Runs

Use `scripts/run_eval.py` to execute test cases against the skill:

```bash
python -m scripts.run_eval <skill-dir> [--test-case <id>] [--all]
```

Each run invokes `claude -p` with the skill loaded and captures the output.

#### 6.3 Grade Results

The grader agent (`agents/grader.md`) evaluates each run's output against the assertions. It produces:
- Pass/fail for each assertion with evidence
- Overall score (0.0 to 1.0)
- Eval quality critique (are the assertions good enough?)

#### 6.4 Aggregate and Benchmark

Use `scripts/aggregate_benchmark.py` to collect scores across runs into `eval/benchmark.json`. The analyzer agent (`agents/analyzer.md`) can then surface patterns and regressions.

#### 6.5 Generate Review

Use `eval-viewer/generate_review.py` to create an HTML report for visual inspection of results and benchmark trends.

### Step 7: Improving the Skill Description

Use `scripts/improve_description.py` to optimize the skill description based on evaluation results:

```bash
python -m scripts.improve_description <skill-dir>
```

This calls Claude via CLI to analyze eval results and propose a better description. The `<new_description>` tag in the response is extracted and applied.

For the full eval-improve loop:

```bash
python -m scripts.run_loop <skill-dir> [--iterations <n>]
```

This automates: run evals → grade → aggregate → improve description → repeat.

### Step 8: Iterate

After evaluation, iterate based on results:
1. Review the HTML report from eval-viewer
2. Check which test cases score lowest
3. Use the analyzer agent to find patterns
4. Update SKILL.md or bundled resources
5. Re-run evaluations to confirm improvement

## Writing Patterns

### Sequential Workflows

Break complex tasks into clear steps with an overview:

```markdown
Processing involves these steps:
1. Analyze input (run analyze.py)
2. Transform data (run transform.py)
3. Validate output (run validate.py)
```

### Conditional Workflows

Guide through decision points:

```markdown
1. Determine the task type:
   **Creating new?** → Follow "Creation workflow"
   **Editing existing?** → Follow "Editing workflow"
```

### Template Pattern

Provide output templates with appropriate strictness level.

### Examples Pattern

Provide input/output pairs when output quality depends on seeing examples.

## Writing Style

- Use imperative/infinitive form in instructions
- Be concise — every sentence should justify its token cost
- Prefer examples over explanations
- Keep reference files one level deep from SKILL.md
- Structure files >100 lines with a table of contents

## 自动分类规则

创建新 skill 时，必须根据功能添加 `category` 和 `icon` 字段：

| 关键词 | Category | 推荐 Icon |
|--------|----------|-----------|
| 文档、Word、PDF、PPT、Excel | 办公 | 📝📄📊📈 |
| 股票、金融、投资、财报 | 金融 | 💹📊 |
| 论文、学术、研究 | 学术 | 📚🎓 |
| 设计、UI、前端、网页 | 设计 | 🎨🖼️ |
| 数据、监控、分析 | 数据 | 📈📉 |
| 报销、费用、财务 | 财务 | 💰💳 |
| 社交、运营、营销 | 运营 | 📱📣 |
| 开发、代码、编程 | 开发 | 🛠️💻 |
| 其他 | 工具 | 🔧⚙️ |

**Frontmatter 示例：**

```yaml
---
name: 技能名称
description: |
  技能描述...
icon: 📝
category: 办公
---
```

## LaborAny Skill Install Rules (Mandatory)

When the user asks to install a skill, do not run a free-form manual process.
Always follow this deterministic flow:

1. Extract install source from user input. Supported source forms:
   - GitHub repo/tree URL (for example: `https://github.com/org/repo/tree/main/skills/agent-browser`)
   - GitHub short form (for example: `org/repo/skills/agent-browser`)
   - Direct downloadable ZIP/TAR URL (for example: `https://example.com/agent-browser.zip` or `https://example.com/agent-browser.tar.gz`)
2. Use LaborAny's built-in installation API/flow to install into the user skill directory.
3. Never copy files into builtin `skills/` manually.
4. Ensure metadata is valid for LaborAny:
   - `icon` and `category` must exist
   - fill missing values according to skill purpose
   - do not override valid existing values
5. After install, clearly report:
   - installed skill ID
   - absolute installed path
   - where to find it in UI (`能力管理 -> 我的能力`)

If install fails, report concrete reason and next action, such as:
- invalid source URL/path
- archive has no `SKILL.md`
- archive has multiple skill directories and cannot determine target

If source structure is not fully compliant with LaborAny skill format, adapt it automatically:
- create/repair `SKILL.md` template
- ensure `name`, `description`, `icon`, `category` are available
- keep original files as references/scripts/assets when possible
