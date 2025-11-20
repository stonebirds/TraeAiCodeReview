# UI设计规范（v1）

## 视觉风格
- 主题：深色渐变背景（from slate-900 via slate-800 to slate-900）
- 卡片：玻璃拟态（glass-card），半透明背景、模糊、细边框、柔和阴影
- 配色：主色蓝（blue-600/700）、辅色绿/紫，用透明白（white/5、white/10）做层次
- 字体：Inter 优先，标题加粗（600/700），正文提升字距与行高（line-height 1.6）
- 微交互：按钮与卡片 hover 轻微抬升与缩放（tap-hover），入场淡入（fade-in）

## 组件规则
- 顶栏：半透明、模糊背景、粘顶、阴影分隔；标签切换使用同一风格
- 表单：深色背景下输入框采用白色半透明背景与细边框，聚焦时主色外圈
- 按钮：统一圆角 12px、加粗、过渡动画，禁用时降低不透明度
- 卡片：统一使用 glass-card 样式，保持视觉一致性
- 列表/日志：暗背景下文字对比度提升，颜色标签用浅色系以保证可读性

## 布局规范
- 宽度容器：`max-w-screen-2xl`，保证在大屏下的易读性
- 响应式：Flex/Grid 结合，移动端单列、桌面端多列；关键操作按钮在移动端占满宽度
- 间距：section 之间间距 24-32px，卡片内间距 24px

## 动画与过渡
- 入场：`fade-in`（300ms ease），用于页签切换与卡片渲染
- 按钮：`tap-hover`（hover 轻微抬升、active 轻微压下）
- 进度条：宽度变化采用 `transition-all duration-300`

## 可访问性
- 对比度：深色背景下文字使用 `text-white/80~90`
- 焦点：所有可交互元素在聚焦时增加可见的 `focus:ring`
- 触达面积：按钮/交互元素最小高度 36px

## 兼容性
- 玻璃拟态 `backdrop-filter` 提供 `supports-[backdrop-filter]` 兼容写法与背景色回退
- 使用 Autoprefixer 处理前缀（已在项目中启用）

---

## 命名与类
- 全局工具类：`glass-card`、`tap-hover`、`fade-in`
- Tailwind 颜色透明度结合（如 `bg-white/5`、`border-white/10`）提升层次感