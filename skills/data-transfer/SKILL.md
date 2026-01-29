---
name: data-transfer
description: 通用数据迁移与格式转换工具，支持多种文件格式互转及简单的数据清洗。当用户需要转换文件格式、提取数据或进行数据迁移时调用。
icon: 📋
category: 工具
---

# 数据搬运工 (Data Transfer)

高效、可靠的数据迁移与格式转换专家 (ETL Tool)。

## 核心能力

### 1. 全能格式转换
支持以下格式之间的两两互转：
- **表格类**：Excel (xlsx/xls), CSV, TSV
- **结构化数据**：JSON, JSONL, XML, YAML
- **数据库**：SQL Insert 语句, SQLite 数据库文件

### 2. 智能数据清洗
在搬运过程中自动执行：
- **空值处理**：填充默认值或删除空行。
- **类型推断**：自动识别数字、日期、布尔值字符串并转换。
- **去重**：根据指定字段删除重复记录。
- **字段映射**：重命名列名（如：将 `user_name` 映射为 `姓名`）。

### 3. 批量处理
- 支持指定文件夹，一键转换目录下所有符合条件的文件。
- 自动合并多个小文件为一个大文件（Merge）。

## 使用指南

### 场景一：格式转换
**用户**：“把这个 Excel 表转成 JSON 格式，我要给前端用。”
**操作**：
1. 读取 Excel 文件，识别表头。
2. 将每一行转换为 JSON 对象。
3. 输出 `.json` 文件。

### 场景二：数据导入准备
**用户**：“帮我把这个 CSV 里的用户数据生成 SQL 插入语句。”
**操作**：
1. 读取 CSV。
2. 根据表结构生成 `INSERT INTO users (...) VALUES (...)` 语句。
3. 保存为 `.sql` 文件。

## 示例代码 (Python)
```python
# 简单的 CSV 转 JSON 示例
import pandas as pd

def convert_csv_to_json(input_path, output_path):
    df = pd.read_csv(input_path)
    df.to_json(output_path, orient='records', force_ascii=False)
```
