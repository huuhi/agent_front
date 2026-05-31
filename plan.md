# 改进计划

## 1. 流式输出平滑度

**当前问题**：buffer+flush 每 33ms 一次性写入所有累积文本 → 文字"突然出现一段"。

**方案**：去掉 flusher，改为 typewriter-style 逐字消费，但用**指针位置**代替 substring 切片避免 O(n²) 性能问题：

- `fullText` 持续追加新内容（O(1)每次）
- `revealPos` 指针每 tick 前进 N 字符
- 每次只取 `fullText.slice(0, revealPos)` → O(revealPos) 但比之前的 `queue.slice(2)` 好很多（后者每次复制剩余队列）
- 配合 `requestAnimationFrame` 代替 `setInterval` 实现更流畅的时间控制

## 2. 思考块点击展开

**当前问题**：思考中（streaming 时）无法展开查看内容。

**排查**：`MessageBubble.vue` 中 `v-if="msg.thinking"` 应该已经显示按钮。可能是样式/事件分发问题。需要在 plan 执行时验证并修复。

## 3. "回到最新"按钮

- 位置：聊天框**右下方**，对话输入区**上方**
- 出现条件：用户向上滚动超过 **200px**
- SVG 图标：使用你提供的 `<path>`
- 去掉旧的中心位置样式

## 4. 文本域自动伸缩

- 随内容自动增高
- 上限：屏幕高度的 **35%**（`max-height: 35vh`）
- 滚动条：淡灰色、无三角箭头

## 5. 滚动条样式优化

- 聊天记录区域：滚动条宽度稍微加粗
- 文本域滚动条：淡灰色、无三角箭头
- 全局风格统一
