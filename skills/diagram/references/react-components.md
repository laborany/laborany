# React 组件参考

> 图表绘制的核心组件库

## 目录

1. [流程图节点](#流程图节点)
2. [架构图组件](#架构图组件)
3. [时序图组件](#时序图组件)
4. [类图组件](#类图组件)
5. [思维导图组件](#思维导图组件)
6. [连线组件](#连线组件)
7. [布局容器](#布局容器)
8. [导出功能](#导出功能)

---

## 流程图节点

### 矩形节点 (RectNode)

用于表示处理步骤、操作。

```jsx
function RectNode({ text, color = "blue", className = "" }) {
  const colors = {
    blue: "bg-blue-500 text-white",
    green: "bg-green-500 text-white",
    gray: "bg-gray-100 text-gray-800 border border-gray-300",
    white: "bg-white text-gray-800 border-2 border-gray-800",
  };

  return (
    <div className={`px-6 py-3 rounded-lg shadow-md text-center ${colors[color]} ${className}`}>
      {text}
    </div>
  );
}
```

### 菱形节点 (DiamondNode)

用于表示判断、条件分支。

```jsx
function DiamondNode({ text, color = "yellow" }) {
  const colors = {
    yellow: "bg-yellow-500 text-white",
    orange: "bg-orange-500 text-white",
    white: "bg-white text-gray-800 border-2 border-gray-800",
  };

  return (
    <div className="relative w-28 h-28">
      <div className={`absolute inset-0 rotate-45 ${colors[color]} shadow-md`} />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-center text-sm font-medium px-2">{text}</span>
      </div>
    </div>
  );
}
```

### 圆形节点 (CircleNode)

用于表示开始/结束。

```jsx
function CircleNode({ text, type = "start" }) {
  const styles = {
    start: "bg-green-500 text-white",
    end: "bg-red-500 text-white",
    neutral: "bg-gray-500 text-white",
  };

  return (
    <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-md ${styles[type]}`}>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}
```

### 圆角矩形节点 (RoundedNode)

用于表示子流程、模块。

```jsx
function RoundedNode({ text, color = "purple" }) {
  const colors = {
    purple: "bg-purple-500 text-white",
    indigo: "bg-indigo-500 text-white",
    white: "bg-white text-gray-800 border-2 border-gray-800",
  };

  return (
    <div className={`px-8 py-4 rounded-full shadow-md text-center ${colors[color]}`}>
      {text}
    </div>
  );
}
```

---

## 架构图组件

### 层级容器 (LayerBox)

用于表示系统层级。

```jsx
function LayerBox({ title, children, color = "blue" }) {
  const colors = {
    blue: "border-blue-500 bg-blue-50",
    green: "border-green-500 bg-green-50",
    purple: "border-purple-500 bg-purple-50",
    gray: "border-gray-400 bg-gray-50",
  };

  return (
    <div className={`border-2 rounded-lg p-4 ${colors[color]}`}>
      <div className="text-sm font-bold mb-3 text-gray-700">{title}</div>
      <div className="flex flex-wrap gap-3">
        {children}
      </div>
    </div>
  );
}
```

### 模块卡片 (ModuleCard)

用于表示系统模块。

```jsx
function ModuleCard({ title, items = [], color = "white" }) {
  const colors = {
    white: "bg-white border border-gray-200",
    blue: "bg-blue-500 text-white",
    green: "bg-green-500 text-white",
  };

  return (
    <div className={`rounded-lg shadow-md p-4 min-w-[120px] ${colors[color]}`}>
      <div className="font-bold text-sm mb-2">{title}</div>
      {items.length > 0 && (
        <ul className="text-xs space-y-1">
          {items.map((item, i) => (
            <li key={i} className="opacity-80">• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### 数据库图标 (DatabaseIcon)

```jsx
function DatabaseIcon({ label, color = "blue" }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg className="w-12 h-14" viewBox="0 0 48 56">
        <ellipse cx="24" cy="8" rx="20" ry="8" fill="#3b82f6" />
        <path d="M4 8 v40 a20 8 0 0 0 40 0 v-40" fill="#3b82f6" />
        <ellipse cx="24" cy="48" rx="20" ry="8" fill="#2563eb" />
      </svg>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
```

---

## 时序图组件

### 参与者头部 (ActorHeader)

用于显示时序图顶部的参与者。

```jsx
function ActorHeader({ name, x }) {
  const ACTOR_WIDTH = 100;
  return (
    <g transform={`translate(${x}, 0)`}>
      <rect
        x={-ACTOR_WIDTH / 2}
        y={0}
        width={ACTOR_WIDTH}
        height={40}
        rx={4}
        fill="#3b82f6"
      />
      <text x={0} y={25} textAnchor="middle" fill="white" fontSize="14">
        {name}
      </text>
    </g>
  );
}
```

### 生命线 (Lifeline)

参与者的垂直虚线。

```jsx
function Lifeline({ x, height }) {
  return (
    <line
      x1={x}
      y1={60}
      x2={x}
      y2={height - 20}
      stroke="#cbd5e1"
      strokeWidth="2"
      strokeDasharray="6,4"
    />
  );
}
```

### 消息箭头 (Message)

参与者之间的消息传递。

```jsx
// type: "sync" | "return" | "self"
function Message({ fromX, toX, y, text, type }) {
  const isReturn = type === "return";
  return (
    <g>
      <line
        x1={fromX}
        y1={y}
        x2={toX}
        y2={y}
        stroke="#64748b"
        strokeDasharray={isReturn ? "4,3" : "none"}
        markerEnd="url(#arrowhead)"
      />
      <text x={(fromX + toX) / 2} y={y - 8} textAnchor="middle" fontSize="12">
        {text}
      </text>
    </g>
  );
}
```

### 时序图数据结构

```javascript
// 参与者列表
const actors = [
  { id: "user", name: "用户" },
  { id: "server", name: "服务器" },
];

// 消息列表
const messages = [
  { from: "user", to: "server", text: "请求", type: "sync" },
  { from: "server", to: "user", text: "响应", type: "return" },
];
```

---

## 类图组件

### 类卡片 (ClassCard)

显示类的属性和方法。

```jsx
// type: "class" | "abstract" | "interface"
function ClassCard({ name, type, attributes, methods, x, y }) {
  const typeStyles = {
    class: { bg: "bg-blue-500", label: "" },
    abstract: { bg: "bg-purple-500", label: "«abstract»" },
    interface: { bg: "bg-green-500", label: "«interface»" },
  };
  const style = typeStyles[type];

  return (
    <div className="absolute bg-white border-2 rounded shadow-md" style={{ left: x, top: y }}>
      {/* 类名区域 */}
      <div className={`${style.bg} text-white text-center py-2`}>
        {style.label && <div className="text-xs">{style.label}</div>}
        <div className="font-bold">{name}</div>
      </div>
      {/* 属性区域 */}
      <div className="border-b p-2 text-sm font-mono">
        {attributes.map((attr, i) => <div key={i}>{attr}</div>)}
      </div>
      {/* 方法区域 */}
      <div className="p-2 text-sm font-mono">
        {methods.map((m, i) => <div key={i}>{m}</div>)}
      </div>
    </div>
  );
}
```

### 继承关系连线 (Relation)

```jsx
// type: "extends" | "implements"
function Relation({ from, to, type, classes }) {
  const fromClass = classes.find(c => c.id === from);
  const toClass = classes.find(c => c.id === to);
  const isImplements = type === "implements";

  return (
    <g>
      <line
        x1={fromClass.x + 90}
        y1={fromClass.y}
        x2={toClass.x + 90}
        y2={toClass.y + 120}
        stroke="#64748b"
        strokeDasharray={isImplements ? "6,4" : "none"}
      />
      {/* 空心三角箭头 */}
      <polygon
        points={`${toClass.x + 90},${toClass.y + 120} ...`}
        fill="white"
        stroke="#64748b"
      />
    </g>
  );
}
```

### 类图数据结构

```javascript
const classes = [
  {
    id: "animal",
    name: "Animal",
    type: "abstract",
    attributes: ["- name: string"],
    methods: ["+ eat(): void"],
    x: 200,
    y: 20,
  },
];

const relations = [
  { from: "dog", to: "animal", type: "extends" },
];
```

---

## 思维导图组件

### 中心节点 (CenterNode)

思维导图的核心主题。

```jsx
function CenterNode({ text, x, y }) {
  return (
    <div
      className="absolute bg-gradient-to-br from-indigo-500 to-purple-600 text-white
                 px-6 py-4 rounded-full shadow-lg font-bold transform -translate-x-1/2 -translate-y-1/2"
      style={{ left: x, top: y }}
    >
      {text}
    </div>
  );
}
```

### 分支节点 (BranchNode)

一级分支主题。

```jsx
function BranchNode({ text, x, y, color = "blue" }) {
  const colors = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
  };
  return (
    <div
      className={`absolute ${colors[color]} text-white px-4 py-2 rounded-lg shadow-md
                 transform -translate-x-1/2 -translate-y-1/2`}
      style={{ left: x, top: y }}
    >
      {text}
    </div>
  );
}
```

### 叶子节点 (LeafNode)

末端节点。

```jsx
function LeafNode({ text, x, y }) {
  return (
    <div
      className="absolute bg-white border-2 border-gray-200 text-gray-700
                 px-3 py-1.5 rounded shadow text-sm transform -translate-x-1/2 -translate-y-1/2"
      style={{ left: x, top: y }}
    >
      {text}
    </div>
  );
}
```

### 曲线连接 (CurvedLine)

节点之间的曲线连接。

```jsx
function CurvedLine({ x1, y1, x2, y2, color = "#6b7280" }) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const ctrlX = midX - (y2 - y1) * 0.2;
  const ctrlY = midY + (x2 - x1) * 0.2;

  return (
    <path
      d={`M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`}
      fill="none"
      stroke={color}
      strokeWidth="2"
    />
  );
}
```

### 思维导图数据结构

```javascript
const mindmapData = {
  text: "中心主题",
  children: [
    {
      text: "分支1",
      color: "blue",
      children: [
        { text: "叶子1" },
        { text: "叶子2" },
      ],
    },
  ],
};
```

---

## 连线组件

### SVG 箭头 (Arrow)

```jsx
function Arrow({ x1, y1, x2, y2, label = "", color = "#666", curved = false }) {
  const id = `arrow-${x1}-${y1}-${x2}-${y2}`;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const path = curved
    ? `M ${x1} ${y1} Q ${midX} ${y1} ${midX} ${midY} Q ${midX} ${y2} ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x2} ${y2}`;

  return (
    <g>
      <defs>
        <marker id={id} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={color} />
        </marker>
      </defs>
      <path d={path} stroke={color} strokeWidth="2" fill="none" markerEnd={`url(#${id})`} />
      {label && (
        <text x={midX} y={midY - 5} textAnchor="middle" className="text-xs fill-gray-600">
          {label}
        </text>
      )}
    </g>
  );
}
```

### 连接线容器 (ConnectionLayer)

```jsx
function ConnectionLayer({ width, height, children }) {
  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width={width}
      height={height}
      style={{ zIndex: 0 }}
    >
      {children}
    </svg>
  );
}
```

---

## 布局容器

### 垂直流程布局 (VerticalFlow)

```jsx
function VerticalFlow({ children, gap = 8 }) {
  return (
    <div className={`flex flex-col items-center gap-${gap}`}>
      {children}
    </div>
  );
}
```

### 水平流程布局 (HorizontalFlow)

```jsx
function HorizontalFlow({ children, gap = 8 }) {
  return (
    <div className={`flex items-center gap-${gap}`}>
      {children}
    </div>
  );
}
```

### 网格布局 (GridLayout)

```jsx
function GridLayout({ children, cols = 3, gap = 4 }) {
  return (
    <div className={`grid grid-cols-${cols} gap-${gap}`}>
      {children}
    </div>
  );
}
```

---

## 导出功能

### PNG 导出按钮

```jsx
function ExportButton({ targetId, filename = "diagram" }) {
  const handleExport = () => {
    const element = document.getElementById(targetId);
    html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
    }).then(canvas => {
      const link = document.createElement("a");
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  };

  return (
    <button
      onClick={handleExport}
      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
    >
      导出 PNG
    </button>
  );
}
```

### 完整 App 结构

```jsx
function App() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* 图表区域 */}
      <div id="diagram" className="bg-white p-8 rounded-lg shadow-lg">
        {/* 图表内容 */}
      </div>

      {/* 操作按钮 */}
      <div className="mt-6 flex gap-3">
        <ExportButton targetId="diagram" filename="my-diagram" />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
```
