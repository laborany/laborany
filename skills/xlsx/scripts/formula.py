#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Excel 公式处理模块                                     ║
║                                                                              ║
║  提供单元格引用转换和基础公式计算功能                                            ║
║  设计理念：简洁、直接、无冗余分支                                                ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import re
from typing import Any, Optional, Tuple


# ═══════════════════════════════════════════════════════════════════════════════
#  单元格引用转换
# ═══════════════════════════════════════════════════════════════════════════════

def cell_to_index(cell_ref: str) -> Tuple[int, int]:
    """
    将单元格引用转换为 (行, 列) 索引。

    参数:
        cell_ref: 单元格引用 (如 "A1", "AA100", "$B$2")

    返回:
        (row, col) 元组，0-indexed

    示例:
        >>> cell_to_index("A1")
        (0, 0)
        >>> cell_to_index("B2")
        (1, 1)
        >>> cell_to_index("AA1")
        (0, 26)
    """
    # ─────────────────────────────────────────────────────────────────────────
    #  移除绝对引用符号
    # ─────────────────────────────────────────────────────────────────────────
    ref = cell_ref.replace("$", "").upper()

    # ─────────────────────────────────────────────────────────────────────────
    #  分离列字母和行数字
    # ─────────────────────────────────────────────────────────────────────────
    match = re.match(r"^([A-Z]+)(\d+)$", ref)
    if not match:
        raise ValueError(f"无效的单元格引用: {cell_ref}")

    col_str, row_str = match.groups()

    # ─────────────────────────────────────────────────────────────────────────
    #  转换列字母为索引 (A=0, B=1, ..., Z=25, AA=26, ...)
    # ─────────────────────────────────────────────────────────────────────────
    col = 0
    for char in col_str:
        col = col * 26 + (ord(char) - ord("A") + 1)
    col -= 1  # 转为 0-indexed

    row = int(row_str) - 1  # 转为 0-indexed

    return (row, col)


def index_to_cell(row: int, col: int, absolute: bool = False) -> str:
    """
    将 (行, 列) 索引转换为单元格引用。

    参数:
        row: 行索引 (0-indexed)
        col: 列索引 (0-indexed)
        absolute: 是否使用绝对引用

    返回:
        单元格引用字符串

    示例:
        >>> index_to_cell(0, 0)
        'A1'
        >>> index_to_cell(1, 1)
        'B2'
        >>> index_to_cell(0, 26)
        'AA1'
        >>> index_to_cell(0, 0, absolute=True)
        '$A$1'
    """
    # ─────────────────────────────────────────────────────────────────────────
    #  转换列索引为字母
    # ─────────────────────────────────────────────────────────────────────────
    col_str = ""
    col_num = col + 1  # 转为 1-indexed
    while col_num > 0:
        col_num, remainder = divmod(col_num - 1, 26)
        col_str = chr(ord("A") + remainder) + col_str

    row_str = str(row + 1)  # 转为 1-indexed

    if absolute:
        return f"${col_str}${row_str}"
    return f"{col_str}{row_str}"


def parse_range(range_ref: str) -> Tuple[Tuple[int, int], Tuple[int, int]]:
    """
    解析范围引用。

    参数:
        range_ref: 范围引用 (如 "A1:B10", "$A$1:$C$5")

    返回:
        ((start_row, start_col), (end_row, end_col))

    示例:
        >>> parse_range("A1:B10")
        ((0, 0), (9, 1))
    """
    parts = range_ref.split(":")
    if len(parts) != 2:
        raise ValueError(f"无效的范围引用: {range_ref}")

    start = cell_to_index(parts[0])
    end = cell_to_index(parts[1])
    return (start, end)


# ═══════════════════════════════════════════════════════════════════════════════
#  公式引擎
# ═══════════════════════════════════════════════════════════════════════════════

class FormulaEngine:
    """
    公式计算引擎。

    支持常用 Excel 函数的本地计算，用于：
    - 预览计算结果
    - 验证公式正确性
    - 简单场景下避免依赖 LibreOffice

    支持的函数:
        SUM, AVERAGE, COUNT, COUNTA, MAX, MIN, IF, AND, OR, NOT,
        ROUND, ABS, INT, MOD, POWER, SQRT, LEN, UPPER, LOWER, TRIM

    示例:
        engine = FormulaEngine(get_cell_value)
        result = engine.evaluate("SUM(A1:A10)")
    """

    SUPPORTED_FUNCTIONS = {
        "SUM", "AVERAGE", "COUNT", "COUNTA", "MAX", "MIN",
        "IF", "AND", "OR", "NOT",
        "ROUND", "ABS", "INT", "MOD", "POWER", "SQRT",
        "LEN", "UPPER", "LOWER", "TRIM",
    }

    def __init__(self, cell_getter):
        """
        初始化公式引擎。

        参数:
            cell_getter: 获取单元格值的函数 (cell_ref) -> value
        """
        self.get_cell = cell_getter

    def evaluate(self, formula: str) -> Any:
        """
        计算公式。

        参数:
            formula: 公式字符串 (不含前导 =)

        返回:
            计算结果

        异常:
            ValueError: 公式语法错误或不支持的函数
        """
        formula = formula.strip()
        if formula.startswith("="):
            formula = formula[1:]

        return self._eval_expression(formula)

    def _eval_expression(self, expr: str) -> Any:
        """递归计算表达式。"""
        expr = expr.strip()

        # ─────────────────────────────────────────────────────────────────────
        #  检测函数调用
        # ─────────────────────────────────────────────────────────────────────
        func_match = re.match(r"^([A-Z]+)\((.*)\)$", expr, re.IGNORECASE)
        if func_match:
            func_name = func_match.group(1).upper()
            args_str = func_match.group(2)
            return self._call_function(func_name, args_str)

        # ─────────────────────────────────────────────────────────────────────
        #  检测单元格引用
        # ─────────────────────────────────────────────────────────────────────
        if re.match(r"^\$?[A-Z]+\$?\d+$", expr, re.IGNORECASE):
            return self.get_cell(expr)

        # ─────────────────────────────────────────────────────────────────────
        #  检测数值
        # ─────────────────────────────────────────────────────────────────────
        try:
            if "." in expr:
                return float(expr)
            return int(expr)
        except ValueError:
            pass

        # ─────────────────────────────────────────────────────────────────────
        #  检测字符串
        # ─────────────────────────────────────────────────────────────────────
        if expr.startswith('"') and expr.endswith('"'):
            return expr[1:-1]

        # ─────────────────────────────────────────────────────────────────────
        #  检测布尔值
        # ─────────────────────────────────────────────────────────────────────
        if expr.upper() == "TRUE":
            return True
        if expr.upper() == "FALSE":
            return False

        raise ValueError(f"无法解析表达式: {expr}")

    def _call_function(self, func_name: str, args_str: str) -> Any:
        """调用函数。"""
        if func_name not in self.SUPPORTED_FUNCTIONS:
            raise ValueError(f"不支持的函数: {func_name}")

        args = self._parse_args(args_str)

        # ─────────────────────────────────────��───────────────────────────────
        #  聚合函数
        # ─────────────────────────────────────────────────────────────────────
        if func_name == "SUM":
            values = self._expand_args(args)
            return sum(v for v in values if isinstance(v, (int, float)))

        if func_name == "AVERAGE":
            values = [v for v in self._expand_args(args) if isinstance(v, (int, float))]
            return sum(values) / len(values) if values else 0

        if func_name == "COUNT":
            values = self._expand_args(args)
            return sum(1 for v in values if isinstance(v, (int, float)))

        if func_name == "COUNTA":
            values = self._expand_args(args)
            return sum(1 for v in values if v is not None and v != "")

        if func_name == "MAX":
            values = [v for v in self._expand_args(args) if isinstance(v, (int, float))]
            return max(values) if values else 0

        if func_name == "MIN":
            values = [v for v in self._expand_args(args) if isinstance(v, (int, float))]
            return min(values) if values else 0

        # ─────────────────────────────────────────────────────────────────────
        #  逻辑函数
        # ─────────────────────────────────────────────────────────────────────
        if func_name == "IF":
            condition = self._eval_expression(args[0])
            true_val = self._eval_expression(args[1]) if len(args) > 1 else True
            false_val = self._eval_expression(args[2]) if len(args) > 2 else False
            return true_val if condition else false_val

        if func_name == "AND":
            return all(self._eval_expression(a) for a in args)

        if func_name == "OR":
            return any(self._eval_expression(a) for a in args)

        if func_name == "NOT":
            return not self._eval_expression(args[0])

        # ─────────────────────────────────────────────────────────────────────
        #  数学函数
        # ─────────────────────────────────────────────────────────────────────
        if func_name == "ROUND":
            value = self._eval_expression(args[0])
            digits = int(self._eval_expression(args[1])) if len(args) > 1 else 0
            return round(value, digits)

        if func_name == "ABS":
            return abs(self._eval_expression(args[0]))

        if func_name == "INT":
            return int(self._eval_expression(args[0]))

        if func_name == "MOD":
            return self._eval_expression(args[0]) % self._eval_expression(args[1])

        if func_name == "POWER":
            return self._eval_expression(args[0]) ** self._eval_expression(args[1])

        if func_name == "SQRT":
            return self._eval_expression(args[0]) ** 0.5

        # ─────────────────────────────────────────────────────────────────────
        #  文本函数
        # ─────────────────────────────────────────────────────────────────────
        if func_name == "LEN":
            return len(str(self._eval_expression(args[0])))

        if func_name == "UPPER":
            return str(self._eval_expression(args[0])).upper()

        if func_name == "LOWER":
            return str(self._eval_expression(args[0])).lower()

        if func_name == "TRIM":
            return str(self._eval_expression(args[0])).strip()

        raise ValueError(f"函数 {func_name} 未实现")

    def _parse_args(self, args_str: str) -> list[str]:
        """解析函数参数，处理嵌套括号。"""
        args = []
        current = ""
        depth = 0

        for char in args_str:
            if char == "," and depth == 0:
                args.append(current.strip())
                current = ""
            else:
                if char == "(":
                    depth += 1
                elif char == ")":
                    depth -= 1
                current += char

        if current.strip():
            args.append(current.strip())

        return args

    def _expand_args(self, args: list[str]) -> list[Any]:
        """展开参数，处理范围引用。"""
        values = []
        for arg in args:
            if ":" in arg:
                # 范围引用
                values.extend(self._get_range_values(arg))
            else:
                values.append(self._eval_expression(arg))
        return values

    def _get_range_values(self, range_ref: str) -> list[Any]:
        """获取范围内所有单元格的值。"""
        (start_row, start_col), (end_row, end_col) = parse_range(range_ref)
        values = []

        for row in range(start_row, end_row + 1):
            for col in range(start_col, end_col + 1):
                cell_ref = index_to_cell(row, col)
                values.append(self.get_cell(cell_ref))

        return values
