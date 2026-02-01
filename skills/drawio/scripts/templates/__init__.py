"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         图表模板模块                                          ║
║                                                                              ║
║  提供各类图表的快速创建模板                                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from .flowchart import (
    create_basic_flowchart,
    create_approval_flowchart,
    create_data_processing_flowchart,
)
from .architecture import (
    create_three_tier_architecture,
    create_microservices_architecture,
    create_cloud_architecture,
)
from .sequence import (
    create_basic_sequence,
    create_login_sequence,
    create_api_sequence,
)
from .mindmap import (
    create_basic_mindmap,
    create_project_mindmap,
    create_learning_mindmap,
)
from .orgchart import (
    create_basic_orgchart,
    create_department_orgchart,
)
from .network import (
    create_basic_network,
    create_dmz_network,
)

__all__ = [
    # 流程图
    "create_basic_flowchart",
    "create_approval_flowchart",
    "create_data_processing_flowchart",
    # 架构图
    "create_three_tier_architecture",
    "create_microservices_architecture",
    "create_cloud_architecture",
    # 序列图
    "create_basic_sequence",
    "create_login_sequence",
    "create_api_sequence",
    # 思维导图
    "create_basic_mindmap",
    "create_project_mindmap",
    "create_learning_mindmap",
    # 组织架构图
    "create_basic_orgchart",
    "create_department_orgchart",
    # 网络拓扑图
    "create_basic_network",
    "create_dmz_network",
]
