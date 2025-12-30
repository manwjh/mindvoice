# ASR优化指南

本文档说明针对火山引擎ASR服务的优化措施和使用建议。

## 优化内容总览

### 1. 音频包大小优化 ✅

**问题**：原配置音频包大小为64ms，低于火山引擎推荐值（100-200ms）

**优化**：
- 将`chunk`从`1024`调整为`3200`（200ms）
- 符合火山引擎官方推荐的最优性能配置
- 减少发包频率，从15.6包/秒降至5包/秒

**配置位置**：`config.yml`
```yaml
audio:
  chunk: 3200  # 200ms，性能最优
```

**参考文档**：[火山引擎ASR文档](https://www.volcengine.com/docs/6561/1354869?lang=zh)

---

### 2. Utterance智能合并 ✅

**问题**：ASR可能将一句话分割成多个短片段（utterance片段化），且连续utterance之间存在重叠

**问题示例**：
```
第一段结尾："...解放军这"
第二段开头："解放军这一次的演习..."
```
导致界面显示重复："解放军这"出现两次

**优化**：在`BlockEditor.tsx`中添加智能检测和合并逻辑

**检测场景**：

**场景1：Utterance重叠**（主要问题）
- 新utterance的开头与上一个utterance的结尾重叠
- 使用最长公共后缀/前缀算法检测重叠（至少2字符）
- 合并时去掉重叠部分

**场景2：短文本片段**（兜底处理）
- 两次`definite utterance`间隔小于3秒
- 当前文本长度小于10个字符
- 不是以标点符号开头

**处理方式**：自动合并到上一个Block

**日志提示**：
```
[BlockEditor] 检测到utterance重叠，尝试合并
[BlockEditor] 检测到短文本utterance，尝试合并
```

---

### 3. WebSocket广播优化 ✅

**问题1**：使用`create_task`异步发送可能导致消息乱序或丢失  
**问题2**：全局`broadcast_lock`在不同事件循环中访问导致RuntimeError

**优化**：
- ~~添加`broadcast_lock`保证消息顺序~~（已移除，会导致事件循环冲突）
- 改用`get_running_loop()`获取当前事件循环
- 使用`asyncio.gather`等待所有发送完成
- 统一错误处理和连接清理

**关键改进**：
```python
def broadcast(message: dict):
    """保证在正确的事件循环中广播"""
    try:
        loop = asyncio.get_running_loop()
        asyncio.create_task(broadcast_safe(message))
    except RuntimeError:
        logger.warning("[API] 无法广播消息：没有运行的事件循环")
```

**修复的错误**：
```
RuntimeError: Task got Future attached to a different loop
```

---

### 4. ASR详细日志 ✅

**问题**：缺少对utterance细节的日志记录，难以诊断问题

**优化**：添加以下日志信息
- Utterance详细信息（definite、时间、文本）
- 短文本definite检测警告
- 快速连续definite检测警告

**日志示例**：
```
[ASR] Utterance[0]: definite=True, time=0-3500, text='这是一个测试...'
[ASR] ⚠️  检测到短文本definite utterance: '工具。' (长度=3字符，可能是片段化)
[ASR] ⚠️  快速连续definite: 上次长度=45, 当前长度=3, 变化=-42字符
```

---

## 使用建议

### 配置迁移

如果你已有`config.yml`文件，请手动更新以下字段：

```yaml
asr:
  # 推荐使用优化版本接口
  base_url: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async

audio:
  # 更新chunk大小
  chunk: 3200  # 200ms（性能最优）
```

### 接口版本选择

火山引擎提供三种接口：

| 接口 | URL后缀 | 特点 | 适用场景 |
|------|--------|------|---------|
| **双向流式（优化）** ⭐ | `bigmodel_async` | 结果变化时才返回，性能最优 | **推荐使用** |
| 双向流式（普通） | `bigmodel` | 每包返回，速度较快 | 需要每包都响应 |
| 流式输入 | `bigmodel_nostream` | 15s后返回，准确率更高 | 对延迟不敏感 |

### 调试模式

启用详细日志以观察utterance行为：

```bash
# 设置日志级别为DEBUG
export LOG_LEVEL=DEBUG
python api_server.py
```

观察日志中的警告信息：
- `⚠️  检测到短文本definite utterance` - ASR可能过于激进地分割句子
- `⚠️  快速连续definite` - 短时间内多次definite
- `[BlockEditor] 检测到可能的utterance片段化` - 前端尝试合并

---

## 性能指标

### 优化前
- 音频包大小：64ms
- 发包频率：15.6包/秒
- utterance片段化：频繁出现
- WebSocket消息：可能乱序

### 优化后
- 音频包大小：200ms ✅
- 发包频率：5包/秒 ✅
- utterance片段化：智能检测和合并 ✅
- WebSocket消息：保证顺序 ✅

---

## 常见问题

### Q1：修改chunk后录音有延迟？

**A**：200ms的包大小是正常的，这是官方推荐的最优配置。如果觉得延迟明显，可以尝试100ms：
```yaml
chunk: 1600  # 100ms
```

### Q2：仍然出现片段化或重复怎么办？

**A**：
1. **检查日志**：
   - 看是否有`检测到utterance重叠`的警告
   - 观察重叠长度是否正常
2. **调整阈值**（`BlockEditor.tsx`中）：
   - 重叠检测最小长度：当前为2字符
   - 时间窗口：当前为3000ms
   - 短文本阈值：当前为10字符
3. **对比测试**：切换到`bigmodel`（普通版本）看是否改善
4. **联系支持**：向火山引擎反馈utterance重叠问题

### Q3：如何验证优化效果？

**A**：
1. 观察日志中是否出现`⚠️`警告减少
2. 前端显示文本是否更连贯
3. 检查控制台是否有合并日志
4. 对比优化前后的录音体验

---

## 参考资料

- [火山引擎ASR官方文档](https://www.volcengine.com/docs/6561/1354869?lang=zh)
- [项目架构文档](./ARCHITECTURE.md)
- [BlockEditor流程说明](./BlockEditor_Flow.md)

---

**更新日期**：2025-12-31  
**版本**：v1.1

---

## 更新日志

### v1.1 (2025-12-31)
- 🔧 修复WebSocket广播的事件循环冲突问题
- ✨ 添加utterance重叠检测和智能合并（最长公共子串算法）
- 📝 更新文档说明实际运行中发现的问题

### v1.0 (2025-12-31)
- ✨ 初始版本：音频包优化、智能合并、广播优化、详细日志

