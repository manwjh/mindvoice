# ASR消费记录修复报告

## 问题描述

用户反馈：使用了1分钟多的ASR服务，但消费记录未被正确记录到数据库。

## 问题分析

### 1. 实际使用情况
从日志 `logs/api_server_20260105_194451.log` 中确认：
- **开始录音**: 2026-01-05 19:49:50
- **停止录音**: 2026-01-05 19:51:36
- **实际时长**: **106秒** (约1分46秒)

### 2. 数据库检查
```bash
sqlite3 ~/Library/Application\ Support/MindVoice/database/history.db \
  "SELECT COUNT(*) FROM consumption_records WHERE type='asr';"
```
结果：**0条记录** ❌

### 3. 根本原因

#### 问题1: 会员服务初始化失败
日志显示：
```
2026-01-05 19:44:56 - src.services.voice_service - ERROR - 
[语音服务] 会员服务初始化失败: __init__() takes 2 positional arguments but 3 were given
```

**原因**：`voice_service.py` 中错误地传递了多个参数给 `MembershipService` 和 `ConsumptionService`

**错误代码** (`voice_service.py:85-86`):
```python
self.membership_service = MembershipService(db_path, self.config)
self.consumption_service = ConsumptionService(db_path, self.config, self.membership_service)
```

**正确代码**：
```python
self.membership_service = MembershipService(self.config)
self.consumption_service = ConsumptionService(self.config)
```

#### 问题2: 消费记录方法参数不完整
`voice_service.py:140-143` 中调用 `record_asr_consumption` 时缺少必需参数：

**错误代码**:
```python
self.consumption_service.record_asr_consumption(
    device_id=self._device_id,
    duration_ms=duration_ms,
    provider=self.asr_provider.name if self.asr_provider else 'unknown'
)
```

**正确代码**:
```python
self.consumption_service.record_asr_consumption(
    device_id=self._device_id,
    duration_ms=duration_ms,
    start_time=self._asr_session_start_time,
    end_time=end_time,
    provider=self.asr_provider.name if self.asr_provider else 'unknown',
    language=self.config.get('asr.language', 'zh-CN'),
    session_id=self._current_session_id
)
```

## 修复方案

### 修改文件: `src/services/voice_service.py`

#### 修改1: 修复会员服务初始化 (第68-92行)
```python
def _initialize_membership_services(self):
    """初始化会员服务"""
    if not MEMBERSHIP_AVAILABLE:
        logger.warning("[语音服务] 会员服务不可用，跳过初始化")
        return
    
    try:
        # 初始化服务（只传入config，服务内部会自己读取数据库路径）
        self.membership_service = MembershipService(self.config)
        self.consumption_service = ConsumptionService(self.config)
        
        logger.info("[语音服务] ✅ 会员服务初始化成功")
    except Exception as e:
        logger.error(f"[语音服务] 会员服务初始化失败: {e}", exc_info=True)
        self.membership_service = None
        self.consumption_service = None
```

#### 修改2: 修复消费记录调用 (第121-151行)
```python
def _record_asr_consumption(self):
    """记录ASR消费时长"""
    if not MEMBERSHIP_AVAILABLE or not self.consumption_service or not self._device_id:
        return
    
    if not self._asr_session_start_time:
        logger.warning("[语音服务] ASR会话开始时间未记录，无法计算消费")
        return
    
    try:
        # 计算消费时长（毫秒）
        end_time = int(time.time() * 1000)
        duration_ms = end_time - self._asr_session_start_time
        
        if duration_ms <= 0:
            logger.warning(f"[语音服务] ASR消费时长异常: {duration_ms}ms")
            return
        
        # 记录消费
        self.consumption_service.record_asr_consumption(
            device_id=self._device_id,
            duration_ms=duration_ms,
            start_time=self._asr_session_start_time,
            end_time=end_time,
            provider=self.asr_provider.name if self.asr_provider else 'unknown',
            language=self.config.get('asr.language', 'zh-CN'),
            session_id=self._current_session_id
        )
        
        logger.info(f"[语音服务] ✅ ASR消费已记录: {duration_ms/1000:.2f}秒")
        
        # 重置会话开始时间
        self._asr_session_start_time = None
    except Exception as e:
        logger.error(f"[语音服务] 记录ASR消费失败: {e}", exc_info=True)
```

## 验证步骤

### 1. 重启服务
```bash
./stop.sh
./quick_start.sh
```

### 2. 测试ASR消费记录
1. 启动应用
2. 使用语音笔记或语音对话功能
3. 录音至少10秒以上
4. 停止录音

### 3. 检查日志
查看日志中是否有以下信息：
```
[语音服务] ✅ 会员服务初始化成功
[语音服务] ✅ ASR消费已记录: XX.XX秒
```

### 4. 查询数据库
运行测试脚本：
```bash
python test_consumption_fix.py
```

或手动查询：
```bash
sqlite3 ~/Library/Application\ Support/MindVoice/database/history.db \
  "SELECT created_at, amount/1000.0 as seconds, details 
   FROM consumption_records 
   WHERE type='asr' 
   ORDER BY created_at DESC 
   LIMIT 10;"
```

## 预期结果

修复后，每次使用ASR服务都应该：
1. ✅ 会员服务正常初始化
2. ✅ 开始录音时记录 `_asr_session_start_time`
3. ✅ 停止录音时调用 `_record_asr_consumption()`
4. ✅ 消费记录写入数据库 `consumption_records` 表
5. ✅ 日志中显示 "ASR消费已记录: XX.XX秒"

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

### 示例记录
```json
{
  "id": "uuid-xxxx",
  "device_id": "device-xxxx",
  "type": "asr",
  "amount": 106000,  // 106秒 = 106000毫秒
  "unit": "ms",
  "details": {
    "duration_ms": 106000,
    "start_time": 1704462590000,
    "end_time": 1704462696000,
    "provider": "volcano",
    "language": "zh-CN"
  },
  "created_at": "2026-01-05 19:51:36"
}
```

## 注意事项

1. **历史记录无法补录**：修复前的消费记录无法追溯，只能从修复后开始记录
2. **设备ID必需**：必须通过 `set_device_id()` 设置设备ID，否则消费记录不会被保存
3. **会员服务依赖**：如果 `MEMBERSHIP_AVAILABLE = False`，消费记录功能将被禁用

## 相关文件

- `src/services/voice_service.py` - 语音服务主类
- `src/services/consumption_service.py` - 消费计量服务
- `src/services/membership_service.py` - 会员服务
- `config.yml` - 配置文件（数据库路径）

## 修复日期

2026-01-05

## 修复人员

深圳王哥 & AI Assistant

