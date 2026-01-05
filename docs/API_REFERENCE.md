# API 响应格式规范

## LLM API 响应格式

AI 助手必须输出 JSON 格式响应，包含以下字段：

```json
{
  "answer_user": "要显示给用户的完整句子",
  "other_data": "其他结构化数据用于处理"
}
```

### 关键规则
- 如果 JSON 中没有 `answer_user` 字段，则不在聊天界面显示任何内容
- `answer_user` 用于用户界面展示，其他字段用于程序处理

## 通用 API 响应

```json
{
  "success": true,
  "message": "操作描述",
  "data": {}
}
```

## IPC 消息类型（Electron）

系统使用 IPC 消息传递（替代 WebSocket）：

### 消息类型

```typescript
type IPCMessageType = 
  | 'initial_state'  // 初始状态
  | 'text_update'    // 中间结果（实时更新）
  | 'text_final'     // 确定结果（完整utterance）
  | 'state_change'   // 状态变更
  | 'error';         // 错误
```

### 消息格式

#### 1. initial_state - 初始状态
```json
{
  "type": "initial_state",
  "state": "idle|recording|paused|stopping",
  "text": "..." 
}
```

#### 2. text_update - 中间识别结果（实时更新）
```json
{
  "type": "text_update",
  "text": "..."
}
```

#### 3. text_final - 确定的完整utterance
```json
{
  "type": "text_final",
  "text": "...",
  "start_time": 1234,
  "end_time": 5678
}
```
- `start_time` 和 `end_time` 单位为毫秒，相对于音频流开始时间
- `text` 字段已包含后端累加后的完整文本（间隔<800ms的句子会自动累加）

#### 4. state_change - 状态变更
```json
{
  "type": "state_change",
  "state": "idle|recording|paused|stopping"
}
```

#### 5. error - 错误消息
```json
{
  "type": "error",
  "error_type": "...",
  "message": "..."
}
```

## REST API 端点

### 语音识别相关

#### 启动录音
```
POST /api/start_recording
Request: { app_type: "voice-note" | "smart-chat" | "voice-zen" }
Response: { success: true, message: "开始录音" }
```

#### 暂停录音
```
POST /api/pause_recording
Response: { success: true, message: "暂停录音" }
```

#### 恢复录音
```
POST /api/resume_recording
Response: { success: true, message: "恢复录音" }
```

#### 停止录音
```
POST /api/stop_recording
Request: { save_audio: false }
Response: { success: true, message: "停止录音" }
```

### 记录管理

#### 保存记录
```
POST /api/records
Request: {
  text: string,
  metadata: object,
  app_type: "voice-note" | "smart-chat" | "voice-zen"
}
Response: {
  success: true,
  record_id: string
}
```

#### 更新记录
```
PUT /api/records/{record_id}
Request: {
  text: string,
  metadata: object
}
Response: { success: true }
```

#### 获取记录
```
GET /api/records/{record_id}
Response: {
  id: string,
  text: string,
  metadata: object,
  app_type: string,
  created_at: string
}
```

#### 列表查询
```
GET /api/records?limit=50&offset=0&app_type=voice-note
Response: {
  records: [...],
  total: number
}
```

#### 删除记录
```
DELETE /api/records/{record_id}
Response: { success: true }
```

### 图片管理

#### 上传图片
```
POST /api/images/save
Request: { image_data: "data:image/png;base64,..." }
Response: { success: true, image_url: "images/xxx.png" }
```

#### 获取图片
```
GET /api/images/{filename}
Response: 图片文件（FileResponse）
```

### LLM 相关

#### 聊天对话
```
POST /api/chat
Request: {
  messages: [...],
  stream: false
}
Response: {
  success: true,
  message: "...",
  usage: {...}
}
```

#### 简单聊天
```
POST /api/simple_chat
Request: {
  prompt: string,
  system_prompt?: string
}
Response: {
  success: true,
  message: string
}
```

#### 生成摘要
```
POST /api/generate_summary
Request: {
  prompt: string,
  system_prompt?: string
}
Response: {
  success: true,
  message: string
}
```

#### 翻译
```
POST /api/translate
Request: {
  text: string,
  source_lang: "zh" | "en" | "ja" | "ko",
  target_lang: "zh" | "en" | "ja" | "ko"
}
Response: {
  success: true,
  translated_text: string
}
```

#### 批量翻译
```
POST /api/translate/batch
Request: {
  texts: string[],
  source_lang: string,
  target_lang: string
}
Response: {
  success: true,
  translations: string[]
}
```

### 知识库相关

#### 上传知识文件
```
POST /api/knowledge/upload
Request: {
  file_name: string,
  content: string
}
Response: {
  success: true,
  file_id: string
}
```

#### 搜索知识库
```
POST /api/knowledge/search
Request: {
  query: string,
  limit: number
}
Response: {
  success: true,
  results: [...]
}
```

#### 列出知识文件
```
GET /api/knowledge/files
Response: {
  success: true,
  files: [...]
}
```

### 系统相关

#### 获取状态
```
GET /api/status
Response: {
  asr_state: string,
  api_connected: boolean,
  current_app: string
}
```

#### 获取 LLM 信息
```
GET /api/llm_info
Response: {
  model: string,
  provider: string,
  available: boolean
}
```

## 错误码

详见 `src/core/error_codes.py` 和 `electron-app/src/utils/errorCodes.ts`

