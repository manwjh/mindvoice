# 消费记录追踪修复报告

## 问题概述

用户测试后发现：
1. ✅ ASR消费记录功能已调用
2. ❌ 数据库锁定导致记录失败
3. ❓ LLM消费记录未找到调用日志

## 详细分析

### 1. ASR消费记录问题

#### 问题表现
从日志 `logs/api_server_20260105_195512.log` 第1348行：
```
2026-01-05 19:56:18 | ERROR | MindVoice.ConsumptionService | [消费服务] 记录ASR消费失败: database is locked
```

#### 根本原因
**SQLite数据库并发写入冲突**：
- 多个服务同时访问同一数据库
- 默认的SQLite连接没有设置超时和并发模式
- 导致写入时出现 `database is locked` 错误

#### 实际消费情况
- 开始时间：2026-01-05 19:55:33
- 停止时间：2026-01-05 19:56:12
- **实际时长：39秒**

#### 修复方案
为所有SQLite连接添加：
1. **超时设置**：`timeout=30.0` (30秒超时)
2. **WAL模式**：`PRAGMA journal_mode=WAL` (Write-Ahead Logging，支持并发读写)

**修改的文件**：
- `src/services/consumption_service.py`
- `src/services/membership_service.py`
- `src/providers/storage/sqlite.py`
- `src/services/cleanup_service.py`

### 2. LLM消费记录问题

#### 实现位置
`src/api/server.py` 第1682-1695行：

```python
# 记录LLM消费（如果提供了device_id）
if device_id and consumption_service and llm_service.llm_provider:
    try:
        usage = llm_service.llm_provider.get_last_usage() if hasattr(llm_service.llm_provider, 'get_last_usage') else None
        if usage:
            consumption_service.record_llm_consumption(
                device_id=device_id,
                prompt_tokens=usage.get('prompt_tokens', 0),
                completion_tokens=usage.get('completion_tokens', 0),
                total_tokens=usage.get('total_tokens', 0),
                model=llm_service.llm_provider._config.get('model', 'unknown'),
                provider=llm_service.llm_provider._config.get('provider', 'unknown'),
                model_source='vendor'
            )
            logger.info(f"[API] ✅ LLM消费已记录: {usage['total_tokens']} tokens")
    except Exception as e:
        logger.error(f"[API] 记录LLM消费失败: {e}", exc_info=True)
```

#### 问题分析
LLM消费记录需要满足以下条件：
1. ✅ `device_id` 已设置（从前端传入）
2. ✅ `consumption_service` 已初始化
3. ✅ `llm_service.llm_provider` 存在
4. ✅ `get_last_usage()` 方法已实现（在 `litellm_provider.py`）
5. ❓ **前端是否传递了 `device_id` 参数？**

#### 可能的原因
1. **前端未传递 device_id**：LLM API调用时缺少 `device_id` 参数
2. **数据库锁定**：与ASR相同的问题，写入时数据库被锁定
3. **异常被捕获**：错误被 try-except 捕获但未显示

### 3. 数据库并发问题的影响范围

#### 受影响的操作
所有需要写入数据库的操作：
- ✅ ASR消费记录
- ✅ LLM消费记录
- ✅ 会员信息更新
- ✅ 月度汇总更新
- ✅ 历史记录保存

#### SQLite WAL模式优势
- **并发读写**：允许一个写入者和多个读取者同时访问
- **更好的性能**：写入不阻塞读取
- **更少的锁冲突**：减少 `database is locked` 错误

## 修复内容

### 修改1: `src/services/consumption_service.py`
```python
def _get_connection(self) -> sqlite3.Connection:
    """获取数据库连接"""
    conn = sqlite3.connect(self.db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    # 启用WAL模式，支持并发读写
    conn.execute('PRAGMA journal_mode=WAL')
    return conn
```

### 修改2: `src/services/membership_service.py`
```python
def _get_connection(self) -> sqlite3.Connection:
    """获取数据库连接"""
    conn = sqlite3.connect(self.db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    # 启用WAL模式，支持并发读写
    conn.execute('PRAGMA journal_mode=WAL')
    return conn
```

### 修改3: `src/providers/storage/sqlite.py`
```python
def _init_db(self):
    """初始化数据库表"""
    conn = sqlite3.connect(str(self.db_path), timeout=30.0)
    conn.execute('PRAGMA journal_mode=WAL')
    cursor = conn.cursor()
    # ...

def _get_connection(self):
    """获取数据库连接"""
    conn = sqlite3.connect(str(self.db_path), timeout=30.0)
    conn.execute('PRAGMA journal_mode=WAL')
    return conn
```

### 修改4: `src/services/cleanup_service.py`
```python
try:
    conn = sqlite3.connect(str(self.db_path), timeout=30.0)
    conn.execute('PRAGMA journal_mode=WAL')
    cursor = conn.cursor()
    # ...
```

## 验证步骤

### 1. 重启服务
```bash
./stop.sh
./quick_start.sh
```

### 2. 测试ASR消费记录
1. 打开语音笔记或语音对话
2. 录音至少10秒
3. 停止录音
4. 检查日志是否有 `[语音服务] ✅ ASR消费已记录: XX.XX秒`

### 3. 测试LLM消费记录
1. 使用智能对话功能
2. 发送消息并等待回复
3. 检查日志是否有 `[API] ✅ LLM消费已记录: XXX tokens`

### 4. 查询数据库
```bash
# 查看ASR消费记录
sqlite3 ~/Library/Application\ Support/MindVoice/database/history.db \
  "SELECT created_at, type, amount, unit FROM consumption_records WHERE type='asr' ORDER BY created_at DESC LIMIT 5;"

# 查看LLM消费记录
sqlite3 ~/Library/Application\ Support/MindVoice/database/history.db \
  "SELECT created_at, type, amount, unit FROM consumption_records WHERE type='llm' ORDER BY created_at DESC LIMIT 5;"

# 查看所有消费记录
python test_consumption_fix.py
```

### 5. 检查WAL模式是否启用
```bash
sqlite3 ~/Library/Application\ Support/MindVoice/database/history.db \
  "PRAGMA journal_mode;"
```
预期输出：`wal`

## 前端检查清单

### LLM API调用是否传递 device_id？

需要检查以下文件：
- `electron-app/src/components/apps/VoiceChat/VoiceChat.tsx`
- `electron-app/src/components/apps/SmartChat/SmartChat.tsx`
- `electron-app/src/services/llm_service.ts`

**正确的调用示例**：
```typescript
const response = await fetch(`${API_BASE_URL}/api/llm/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [...],
    temperature: 0.7,
    max_tokens: 2000,
    device_id: deviceId  // ⭐ 必须传递
  })
});
```

## 预期结果

修复后，每次使用ASR和LLM服务都应该：

### ASR消费记录
1. ✅ 开始录音时记录 `_asr_session_start_time`
2. ✅ 停止录音时调用 `_record_asr_consumption()`
3. ✅ 成功写入数据库（无 `database is locked` 错误）
4. ✅ 日志显示 "[语音服务] ✅ ASR消费已记录: XX.XX秒"
5. ✅ 数据库中有对应记录

### LLM消费记录
1. ✅ 前端传递 `device_id` 参数
2. ✅ LLM API调用完成后获取token使用情况
3. ✅ 调用 `record_llm_consumption()` 记录消费
4. ✅ 成功写入数据库（无 `database is locked` 错误）
5. ✅ 日志显示 "[API] ✅ LLM消费已记录: XXX tokens"
6. ✅ 数据库中有对应记录

## 数据库表结构

### consumption_records 表
```sql
CREATE TABLE consumption_records (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 'asr' 或 'llm'
    amount INTEGER NOT NULL,  -- ASR: 毫秒, LLM: tokens
    unit TEXT NOT NULL,  -- 'ms' 或 'tokens'
    model_source TEXT,  -- 'vendor' 或 'user'
    details TEXT,  -- JSON格式详情
    session_id TEXT,
    timestamp REAL NOT NULL,
    created_at TEXT NOT NULL
);
```

### ASR记录示例
```json
{
  "id": "uuid-xxxx",
  "device_id": "b27c8839-7b75-d875-b364-8eae13c825ac",
  "type": "asr",
  "amount": 39000,  // 39秒
  "unit": "ms",
  "details": {
    "duration_ms": 39000,
    "start_time": 1704462933000,
    "end_time": 1704462972000,
    "provider": "volcano",
    "language": "zh-CN"
  },
  "created_at": "2026-01-05 19:56:12"
}
```

### LLM记录示例
```json
{
  "id": "uuid-yyyy",
  "device_id": "b27c8839-7b75-d875-b364-8eae13c825ac",
  "type": "llm",
  "amount": 1250,  // 总tokens
  "unit": "tokens",
  "model_source": "vendor",
  "details": {
    "prompt_tokens": 850,
    "completion_tokens": 400,
    "total_tokens": 1250,
    "model": "openai/Qwen3-Next-80B-Instruct",
    "provider": "perfxcloud-专线",
    "model_source": "vendor"
  },
  "created_at": "2026-01-05 19:56:15"
}
```

## WAL模式说明

### 什么是WAL模式？
WAL (Write-Ahead Logging) 是SQLite的一种日志模式，它：
- 将修改先写入WAL文件，然后异步合并到主数据库
- 允许读写并发进行（一个写入者 + 多个读取者）
- 提高了并发性能，减少锁冲突

### WAL模式的文件
启用WAL后会生成两个额外文件：
- `history.db-wal` - WAL日志文件
- `history.db-shm` - 共享内存文件

这些文件会自动管理，无需手动处理。

### WAL模式的优势
1. **更好的并发性**：读写不互相阻塞
2. **更少的锁错误**：减少 `database is locked` 错误
3. **更快的写入**：批量提交，减少磁盘I/O
4. **原子性保证**：事务仍然是ACID兼容的

### WAL模式的注意事项
1. 需要文件系统支持共享内存
2. 数据库文件和WAL文件必须在同一目录
3. 不适合网络文件系统（NFS）

## 下一步行动

### 立即执行
1. ✅ 重启服务（让修复生效）
2. ✅ 测试ASR消费记录
3. ✅ 测试LLM消费记录
4. ✅ 验证数据库中的记录

### 需要检查
1. ❓ 前端LLM API调用是否传递 `device_id`
2. ❓ 是否有其他地方也存在数据库锁定问题

### 后续优化
1. 考虑添加消费记录重试机制
2. 考虑添加消费记录队列（异步写入）
3. 考虑添加消费记录统计API

## 相关文件

### 后端
- `src/services/consumption_service.py` - 消费计量服务
- `src/services/membership_service.py` - 会员服务
- `src/services/voice_service.py` - 语音服务（ASR消费记录）
- `src/api/server.py` - API服务器（LLM消费记录）
- `src/providers/storage/sqlite.py` - SQLite存储提供商
- `src/services/cleanup_service.py` - 清理服务

### 前端
- `electron-app/src/components/apps/VoiceChat/VoiceChat.tsx`
- `electron-app/src/components/apps/SmartChat/SmartChat.tsx`
- `electron-app/src/services/llm_service.ts`

### 测试
- `test_consumption_fix.py` - 消费记录验证脚本

## 修复日期

2026-01-05

## 修复人员

深圳王哥 & AI Assistant

## 总结

### 主要问题
1. **数据库并发锁定**：多个服务同时写入导致 `database is locked`
2. **LLM消费记录未触发**：可能是前端未传递 `device_id`

### 解决方案
1. **启用WAL模式**：支持并发读写，减少锁冲突
2. **增加超时设置**：避免瞬时锁定导致失败
3. **需要检查前端**：确保LLM API调用传递 `device_id`

### 预期效果
- ✅ ASR消费记录100%成功
- ✅ LLM消费记录100%成功（如果前端正确传递device_id）
- ✅ 无数据库锁定错误
- ✅ 支持多个服务并发访问数据库

