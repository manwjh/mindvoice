# 数据库表结构文档

## 数据库技术选型

- **数据库**: SQLite 3
- **位置**: 由 `config.yml` 中的 `storage.data_dir` + `storage.database` 配置决定
- **共享机制**: 3个应用（voice-note, smart-chat, voice-zen）共享同一数据库，通过 `app_type` 字段区分

## records 表（里程碑基准版本）

```sql
CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    metadata TEXT,
    app_type TEXT NOT NULL DEFAULT 'voice-note',
    created_at TIMESTAMP NOT NULL
);
```

### 字段说明

| 字段 | 类型 | 说明 |
|-----|------|------|
| `id` | TEXT | 记录ID，UUID v4 格式 |
| `text` | TEXT | 纯文本内容，用于搜索和预览 |
| `metadata` | TEXT | JSON 格式元数据（blocks、noteInfo 等）|
| `app_type` | TEXT | 应用类型（voice-note/smart-chat/voice-zen）|
| `created_at` | TIMESTAMP | 创建时间，本地时间格式 `YYYY-MM-DD HH:MM:SS` |

## metadata 字段结构

```json
{
  "blocks": [
    {
      "id": "block-xxx",
      "type": "paragraph",
      "content": "段落内容",
      "startTime": 1704254400000,
      "endTime": 1704254410000,
      "isAsrWriting": false
    }
  ],
  "noteInfo": {
    "title": "会议纪要",
    "type": "会议",
    "relatedPeople": "张三, 李四",
    "location": "会议室A",
    "startTime": "2026-01-04 10:00:00",
    "endTime": "2026-01-04 11:30:00"
  },
  "language": "zh-CN",
  "provider": "volcano",
  "app_type": "voice-note"
}
```

## 数据库操作示例

### 创建记录

```python
import uuid
from datetime import datetime
import json

record_id = str(uuid.uuid4())
created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

cursor.execute('''
    INSERT INTO records (id, text, metadata, app_type, created_at)
    VALUES (?, ?, ?, ?, ?)
''', (record_id, text, json.dumps(metadata, ensure_ascii=False), app_type, created_at))
```

### 更新记录

```python
cursor.execute('''
    UPDATE records
    SET text = ?, metadata = ?
    WHERE id = ?
''', (text, json.dumps(metadata, ensure_ascii=False), record_id))
```

### 查询记录

```python
cursor.execute('''
    SELECT id, text, metadata, app_type, created_at
    FROM records
    WHERE id = ?
''', (record_id,))
```

### 列表查询

```python
cursor.execute('''
    SELECT id, text, metadata, app_type, created_at
    FROM records
    WHERE app_type = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
''', (app_type, limit, offset))
```

## 性能优化

### 推荐索引

```sql
-- 按创建时间倒序查询
CREATE INDEX idx_created_at ON records(created_at DESC);

-- 按应用类型筛选
CREATE INDEX idx_app_type ON records(app_type);

-- 组合索引
CREATE INDEX idx_app_type_created_at ON records(app_type, created_at DESC);
```

## 数据备份

```bash
# 获取数据库路径（从config.yml读取）
DB_PATH=$(grep 'database:' config.yml | awk '{print $2}')

# 手动备份
cp "$DB_PATH" "${DB_PATH}.backup"

# 查看记录数
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM records;"
```

## 数据库维护

### 重建数据库

```bash
./scripts/rebuild_database.sh
```

### 查看数据库信息

```bash
sqlite3 "$DB_PATH" ".schema records"
sqlite3 "$DB_PATH" ".tables"
```

