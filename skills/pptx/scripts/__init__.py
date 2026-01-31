#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         PPTX Scripts 模块                                     ║
║                                                                              ║
║  提供 PowerPoint 演示文稿的编辑和操作功能                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from .presentation import Presentation
from .utilities import XMLEditor

__all__ = ['Presentation', 'XMLEditor']
