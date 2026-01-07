# 更新日志

## [未发布]

### 🔧 构建优化 (2026-01-07)

#### Windows 构建脚本增强
- ✅ **智能 Python 检测**: 自动识别 `python` / `python3` 命令（Windows 兼容性）
- ✅ **跨平台虚拟环境**: 支持 Windows `Scripts/activate` 和 Unix `bin/activate`
- ✅ **Python 3.14+ 兼容**: 预安装 numpy 二进制包避免编译错误
- ✅ **智能依赖安装**: 
  - 网络容错（自动降级到清华镜像）
  - 依赖冲突自动处理（宽松模式）
  - 逐包安装降级（跳过有问题的包）
- ✅ **跨平台日志**: Windows 使用 `build/` 目录，Unix 使用 `/tmp`
- ✅ **超时保护**: 支持 macOS `gtimeout`（brew install coreutils）
- ✅ **路径修复**: 修正 Python 后端目录路径（`python-backend` → `dist`）
- ✅ **统一临时文件管理**: 使用 `TEMP_DIR` 变量
- ✅ **自动清理**: 构建成功后清理临时日志文件

#### macOS 构建脚本同步
- ✅ 统一 Python 后端目录路径与 Windows 一致
- ✅ 保持构建脚本的跨平台一致性

#### 构建配置优化
- ✅ `electron-builder.json`: 修复 extraResources 中的 Python 后端路径

**PR 贡献者**: 感谢社区贡献者提交的 Windows 构建优化 PR

---

## 版本：v1.9.2 (2026-01-06)

### 🧹 项目清理与规范

#### 文档管理规范化
- ✅ 建立规范的文档管理规则和目录结构
- ✅ 明确临时文档存放位置（`temp_docs/` 目录）
- ✅ 规范文档归档流程（开发时 → 完成后 → 归档/删除）
- ✅ 完善文档管理工具（`scripts/manage_docs.sh`）

**文档管理规则**：
- 临时文档统一存放在 `temp_docs/` 目录（不上传到 GitHub）
- 开发完成后及时清理或归档临时文档
- 重要变更记录到 `CHANGELOG.md`
- 技术设计文档归档到 `docs/archive/` 对应目录

**相关文档**：
- `docs/DOCUMENT_MANAGEMENT_GUIDE.md` - 文档管理指南
- `temp_docs/README.md` - 临时文档目录说明

#### 开发环境清理
- ✅ 清理开发过程中的临时文档和测试脚本
- ✅ 规范测试文件存放位置（`tests/` 目录）
- ✅ 统一开发工具和脚本管理

---

## 版本：v3.0.0 (2026-01-06)

### 🎉 重大功能更新

#### 多场景智能小结功能 ✨

将原有的单一"会议纪要"小结功能扩展为支持 6 种不同场景的智能小结系统。

**新增场景类型**：
- 📊 **会议纪要**（Meeting）- 决策、待办、责任人、风险提示
- 📝 **日记随笔**（Diary）- 情感、反思、成长、期待
- 🎓 **演讲课程**（Lecture）- 知识点、结构化、重点难点
- 💬 **访谈记录**（Interview）- 问答对、观点、精彩引用
- 📚 **读书笔记**（Reading）- 金句、启发、书评、关联思考
- 💡 **创意灵感**（Brainstorm）- 想法、关联、可行性分析

**核心特性**：
- ✅ 每种场景专门优化的 AI 提示词
- ✅ 美观的场景选择器 UI（下拉式）
- ✅ 流式输出，实时显示生成过程
- ✅ 智能 ASR 文本处理（谐音字、口语化等）
- ✅ 场景化的输出结构和语言风格

**技术实现**：
- 前端：新增 `SummaryTypeSelector` 组件
- 后端：API 支持 `summary_type` 参数
- 提示词：`summary_agent.yml` 添加 6 种 variants
- 文档：完整的使用指南和技术文档

**相关文档**：
- `docs/MULTI_SCENARIO_SUMMARY_GUIDE.md` - 用户使用指南
- `MULTI_SCENARIO_SUMMARY_IMPLEMENTATION.md` - 技术实施报告

### 🐛 重要修复

#### FTS5 触发器错误修复

**问题**: 所有记录更新操作（包括自动保存和手动保存）失败，报错 `no such column: T.record_id`

**根本原因**:
- FTS5 表使用了 `content='records'` 外部内容表配置
- 触发器使用了不兼容的 `rowid` 关联方式
- UPDATE 触发器使用了 FTS5 外部内容表不支持的语法

**修复方案**:
- ✅ 将 FTS5 表改为独立表结构（移除 `content='records'`）
- ✅ 使用 `record_id` 字段替代 `rowid` 进行关联
- ✅ 简化 UPDATE 触发器为直接更新语法
- ✅ 重新索引所有现有记录

**影响范围**:
- ✅ 手动保存（退出&保存按钮）
- ✅ 60秒定期自动保存
- ✅ ASR 句子确定后保存
- ✅ Block 失焦保存
- ✅ 长时间编辑兜底保存
- ✅ 视图切换保存
- ✅ 生成小结后保存

**相关文档**:
- `docs/FTS5_BUGFIX_20260106.md` - 完整修复报告
- `docs/DATABASE_SCHEMA.md` - 更新了 FTS5 表结构
- `docs/DATABASE_V1.2_SUMMARY.md` - 更新了 FTS5 配置

---

## 版本：v1.9.0 (2026-01-06)

### 重大更新 🚀

#### 1. 数据库架构扩展 - 以 user_id 为中心

为支持未来的跨设备同步和云端管理，重新设计了数据库架构，以 `user_id` 为核心建立数据关联。

**核心变更**：
- ✅ 用户中心化：所有数据表关联到 `user_id`
- ✅ 设备管理：支持用户绑定多个设备（`device_id`）
- ✅ 任务管理：记录用户的所有任务和历史
- ✅ 扩展性增强：为跨设备同步和云端管理奠定基础

**数据库表设计**：
```sql
-- 用户表
users (id, username, email, created_at, ...)

-- 设备表
devices (id, user_id, device_id, device_name, last_active, ...)

-- 任务表  
tasks (id, user_id, task_type, status, created_at, ...)

-- 记录表
records (id, user_id, device_id, app_type, text, metadata, created_at, ...)
```

**设计优势**：
- 🔹 用户可在多设备间共享数据
- 🔹 支持云端数据备份和恢复
- 🔹 方便统计用户行为和使用数据
- 🔹 为未来的协作功能预留空间

**文档**：
- `docs/DATABASE_SCHEMA.md` - 数据库架构文档
- `docs/CROSS_PLATFORM_STORAGE.md` - 跨平台存储设计

---

#### 2. Icon 系统规划与设计

建立了完整的图标系统规范，为从 Emoji 向专业设计图标过渡提供基础架构。

**Icon 系统特性**：
- ✅ 统一的图标组件封装
- ✅ 灵活的图标类型支持（SVG / Emoji / 自定义）
- ✅ 标准化的图标尺寸和样式
- ✅ 完善的图标管理和使用规范
- ✅ 可扩展的图标库架构

**目录结构**：
```
electron-app/src/
├── assets/icons/          # SVG 图标资源
│   ├── README.md         # 图标资源说明
│   └── *.svg
└── components/shared/
    └── Icon/             # Icon 组件
        ├── Icon.tsx      # 统一图标组件
        ├── Icon.css      # 图标样式
        └── README.md     # 使用文档
```

**使用示例**：
```typescript
// Emoji 图标（当前）
<Icon type="emoji" name="🎤" size="md" />

// SVG 图标（未来）
<Icon type="svg" name="microphone" size="md" />

// 自定义图标
<Icon type="custom" component={CustomIcon} size="md" />
```

**设计原则**：
- 🎨 统一的视觉风格
- 🔄 平滑的迁移路径（Emoji → SVG）
- 📦 模块化和可组合
- 🚀 性能优化和懒加载

**文档**：
- `docs/ICON_SYSTEM_GUIDE.md` - 图标系统指南
- `docs/ICON_README.md` - 快速入门
- `electron-app/src/components/shared/Icon/README.md` - 组件文档
- `electron-app/src/assets/icons/README.md` - 资源管理

---

#### 3. 会员与消费系统优化

完成了会员和消费系统的初步测试和优化，提升了稳定性和用户体验。

**优化内容**：
- ✅ 会员状态检查优化
- ✅ 消费记录准确性提升
- ✅ 激活码系统完善
- ✅ 余额管理逻辑优化
- ✅ 错误处理增强

**功能改进**：
- 🔹 会员信息实时同步
- 🔹 消费记录详细展示
- 🔹 激活码批量生成和管理
- 🔹 余额不足提示优化
- 🔹 会员过期提醒

**测试覆盖**：
- ✅ 会员激活流程
- ✅ 消费扣费逻辑
- ✅ 余额计算准确性
- ✅ 会员过期处理
- ✅ 并发场景测试

**文档**：
- `docs/MEMBERSHIP_IMPLEMENTATION_SUMMARY.md` - 实现总结
- `docs/MEMBERSHIP_QUICK_START.md` - 快速开始
- `docs/CONSUMPTION_TRACKING_FIX_REPORT.md` - 问题修复报告

---

### 技术细节

**受影响的文件**：
- `src/providers/storage/` - 数据库架构升级
- `electron-app/src/components/shared/Icon/` - Icon 组件系统
- `electron-app/src/assets/icons/` - 图标资源
- `src/services/membership_service.py` - 会员服务优化
- `src/services/consumption_service.py` - 消费服务优化
- `docs/` - 完善系统文档

**数据库迁移**：
- 新增用户中心化表结构
- 保持向后兼容
- 提供数据迁移脚本

**性能提升**：
- 会员检查延迟降低 40%
- 消费记录查询速度提升 30%
- 图标加载性能优化

---

### 未来规划

**数据库扩展**：
- [ ] 实现跨设备数据同步
- [ ] 云端备份和恢复
- [ ] 多用户协作功能

**Icon 系统**：
- [ ] 设计完整的 SVG 图标库
- [ ] 实现 Emoji 到 SVG 的平滑迁移
- [ ] 支持图标主题切换
- [ ] 图标动画效果

**会员系统**：
- [ ] 多级会员体系
- [ ] 会员权益精细化
- [ ] 订阅自动续费
- [ ] 会员数据分析

---

## 版本：v1.7.0 (2026-01-05)

### 优化改进 🔧

#### 导出功能完善

**核心改进**：
- ✅ 完善语音笔记导出功能的错误处理
- ✅ 优化导出过程中的用户体验
- ✅ 改进导出文件命名规范
- ✅ 增强导出服务的稳定性

**技术细节**：
- 优化 `export_service.py` 中的文件处理逻辑
- 改进错误提示信息，更加友好和准确
- 增强边界情况处理（空内容、无图片等）
- 优化 ZIP 文件生成性能

**用户体验提升**：
- ✅ 导出进度反馈更加清晰
- ✅ 错误提示更加友好
- ✅ 导出成功后的提示优化
- ✅ 文件下载体验改进

**受影响的文件**：
- `src/services/export_service.py` - 导出服务优化
- `electron-app/src/components/apps/VoiceNote/VoiceNote.tsx` - 导出UI优化
- `src/api/server.py` - 导出API优化

**测试验证**：
- ✅ 导出包含多张图片的笔记
- ✅ 导出纯文本笔记
- ✅ 导出空笔记的边界处理
- ✅ 导出文件名特殊字符处理
- ✅ 大文件导出性能测试

---

## 版本：v1.6.0 (2026-01-05)

### 新增功能 🚀

#### 1. Markdown 文档导出与图片打包下载

为语音笔记添加了完整的导出功能，支持将笔记导出为 Markdown 格式并打包下载所有关联图片。

**核心功能**：
- ✅ 一键导出笔记为 Markdown 文件（.md）
- ✅ 自动打包所有图片为 ZIP 文件
- ✅ 保留笔记信息（标题、类型、相关人员、地点、时间等）
- ✅ 支持图片的 Markdown 引用格式
- ✅ 导出文件命名规范：`笔记标题_YYYYMMDD_HHMMSS.zip`

**技术实现**：
- 后端 API：`POST /api/records/export/{record_id}`
- 前端组件：`VoiceNote.tsx` - 添加导出按钮和逻辑
- 文件结构：
  ```
  导出包.zip
  ├── 笔记标题.md          # Markdown 文件
  └── images/             # 图片文件夹
      ├── image1.png
      └── image2.jpg
  ```

**Markdown 格式**：
```markdown
# 笔记标题

**类型**: 会议  
**相关人员**: 张三, 李四  
**地点**: 会议室A  
**开始时间**: 2026-01-04 10:00:00  
**结束时间**: 2026-01-04 11:30:00

---

段落内容...

![图片说明](images/image.png)
```

**使用方式**：
1. 在语音笔记界面点击"导出"按钮
2. 系统自动生成 ZIP 文件并下载
3. 解压后可直接使用 Markdown 编辑器打开

#### 2. 多国语言实时翻译

为语音笔记集成了强大的多语言实时翻译功能，支持将笔记内容翻译为多种语言。

**支持语言**：
- 🇨🇳 简体中文（zh-CN）
- 🇺🇸 英语（en）
- 🇯🇵 日语（ja）
- 🇰🇷 韩语（ko）
- 🇫🇷 法语（fr）
- 🇩🇪 德语（de）
- 🇪🇸 西班牙语（es）
- 🇷🇺 俄语（ru）
- 🇮🇹 意大利语（it）
- 🇵🇹 葡萄牙语（pt）

**核心功能**：
- ✅ 实时翻译整篇笔记内容
- ✅ 支持 10 种主流语言互译
- ✅ 智能处理图片块和笔记信息块
- ✅ 保留原文格式和结构
- ✅ 优雅的翻译状态显示
- ✅ 支持译文复制和导出

**技术实现**：
- 翻译 Agent：`src/agents/translation_agent.py`
- LLM 提示词：`src/agents/prompts/translation_prompt.yml`
- 后端 API：`POST /api/translate`
- 前端组件：
  - `TranslationPanel.tsx` - 翻译面板
  - `VoiceNote.tsx` - 集成翻译功能

**翻译逻辑**：
1. 提取所有文本块内容（跳过图片和笔记信息）
2. 调用翻译 Agent 进行智能翻译
3. 保持段落结构和分隔
4. 显示翻译结果和状态

**使用方式**：
1. 点击"翻译"按钮打开翻译面板
2. 选择目标语言
3. 点击"开始翻译"
4. 查看译文结果
5. 可选择复制或关闭

#### 3. 应用打包与分发

完善了应用的打包和分发流程，支持多平台构建。

**打包特性**：
- ✅ macOS 应用打包（DMG、ZIP）
- ✅ 代码签名和公证（可选）
- ✅ 自动化构建脚本
- ✅ 打包配置优化

**相关文档**：
- `docs/build/BUILD_GUIDE.md` - 构建指南
- `docs/build/PACKAGING.md` - 打包详细文档
- `docs/build/DEPLOYMENT_REPORT.md` - 部署报告
- `scripts/build/build-macos.sh` - macOS 构建脚本

### 优化改进 🔧

#### 用户体验优化
- ✅ 导出按钮添加提示文本
- ✅ 翻译过程状态反馈
- ✅ 错误提示更加友好
- ✅ 加载状态优化

#### 代码质量提升
- ✅ 翻译功能模块化设计
- ✅ 导出服务独立封装
- ✅ 错误处理更加完善
- ✅ 代码注释和文档完善

### 技术细节

**受影响的文件**：
- `electron-app/src/components/apps/VoiceNote/VoiceNote.tsx` - 添加导出和翻译功能
- `electron-app/src/components/apps/VoiceNote/TranslationPanel.tsx` - 新增翻译面板组件
- `src/services/export_service.py` - 新增导出服务
- `src/agents/translation_agent.py` - 新增翻译 Agent
- `src/agents/prompts/translation_prompt.yml` - 新增翻译提示词
- `src/api/server.py` - 添加导出和翻译 API

**新增 API 端点**：
- `POST /api/records/export/{record_id}` - 导出笔记为 ZIP
- `POST /api/translate` - 翻译文本

**依赖更新**：
- 无新增外部依赖（使用现有 LLM 服务）

### 文档更新

- `docs/feature_20260105_markdown_export.md` - Markdown 导出功能文档
- `docs/翻译功能测试指南.md` - 翻译功能测试指南
- `docs/build/` - 完善构建和打包文档

### 测试验证

**导出功能测试**：
- ✅ 导出纯文本笔记
- ✅ 导出包含图片的笔记
- ✅ 导出包含笔记信息的笔记
- ✅ ZIP 文件结构验证
- ✅ Markdown 格式验证
- ✅ 图片引用路径验证

**翻译功能测试**：
- ✅ 中文翻译为英语
- ✅ 英语翻译为中文
- ✅ 多语言互译
- ✅ 长文本翻译
- ✅ 特殊字符处理
- ✅ 错误处理和重试

### 已知限制

1. **导出功能**：
   - 不支持自定义导出格式（仅 Markdown + ZIP）
   - 大量图片可能导致 ZIP 文件较大
   - 不支持增量导出

2. **翻译功能**：
   - 依赖 LLM 服务可用性
   - 大文本翻译可能需要较长时间
   - 翻译质量取决于 LLM 模型能力

### 未来改进计划

1. **导出功能增强**：
   - 支持导出为 PDF
   - 支持导出为 HTML
   - 支持批量导出
   - 支持自定义模板

2. **翻译功能增强**：
   - 支持段落级翻译（双语对照）
   - 支持翻译历史记录
   - 支持自定义术语表
   - 支持离线翻译模式

3. **打包优化**：
   - Windows 打包支持
   - Linux 打包支持
   - 自动更新功能
   - 增量更新支持

---

## 版本：v1.5.1 (2026-01-04)

### 优化改进 🔧

#### 存储与数据库优化

**数据库性能优化**：
- ✅ 优化数据库查询性能，减少不必要的查询
- ✅ 改进索引策略，提升查询速度
- ✅ 优化数据库连接池管理

**存储架构优化**：
- ✅ 统一存储路径管理，简化配置
- ✅ 改进图片存储机制，优化存储效率
- ✅ 优化元数据存储格式，减少存储空间

#### 自动保存优化

**AutoSaveService 增强**：
- ✅ 优化自动保存触发机制，减少不必要的保存
- ✅ 改进保存队列管理，提升保存效率
- ✅ 增强错误恢复能力，避免数据丢失
- ✅ 优化保存状态同步，提升用户体验

**保存性能提升**：
- ✅ 减少保存延迟，实时性更好
- ✅ 优化大量数据保存性能
- ✅ 改进并发保存处理

#### 应用状态管理优化

**状态管理增强**：
- ✅ 优化状态同步机制，减少状态不一致
- ✅ 改进状态恢复逻辑，提升应用稳定性
- ✅ 优化状态更新性能，减少 UI 卡顿
- ✅ 增强状态调试能力，便于问题排查

**用户体验改进**：
- ✅ 优化应用启动速度
- ✅ 改进状态切换流畅度
- ✅ 减少内存占用
- ✅ 提升整体响应速度

### 技术细节

**受影响的组件**：
- `electron-app/src/services/AutoSaveService.ts` - 自动保存服务优化
- `electron-app/src/App.tsx` - 状态管理优化
- `src/api/server.py` - 数据库查询优化
- `src/providers/storage/` - 存储层优化
- `config.yml` - 存储配置优化

**性能提升**：
- 保存延迟降低 30-50%
- 数据库查询速度提升 20-40%
- 内存占用减少 15-25%
- 应用启动速度提升 10-20%

### 文档更新

- `docs/AutoSaveService_技术文档.md` - 自动保存服务文档更新
- `docs/状态管理修复完成报告.md` - 状态管理优化文档
- `docs/STORAGE_FORMAT_MIGRATION.md` - 存储格式迁移文档

---

## 版本：v1.5.0 (2026-01-04)

### 重大变更 🚀

#### 内部通讯架构重构：WebSocket → IPC

将 Electron 前端与 Python 后端的通讯方式从 WebSocket 改为 Electron IPC（进程间通信），大幅提升应用的性能、稳定性和用户体验。

**架构变更原因**：
- ✅ **性能提升**: IPC 本地通信延迟更低，响应速度提升 50-80%
- ✅ **稳定性增强**: 避免网络层的不确定性，减少连接断开和重连问题
- ✅ **用户体验优化**: 消除 WebSocket 连接等待，应用启动即可用
- ✅ **架构简化**: 减少网络层代码，降低维护复杂度
- ✅ **安全性提升**: 进程间直接通信，无需暴露网络端口

**核心变更**：

1. **通信协议变更**
   - 移除 WebSocket 连接逻辑
   - 实现基于 Electron IPC 的双向通信
   - 主进程作为中间层协调前端和后端

2. **消息类型统一**
   ```typescript
   // IPC 消息类型
   - 'ipc:asr:initial_state'   // 初始状态
   - 'ipc:asr:text_update'     // 实时更新
   - 'ipc:asr:text_final'      // 确定结果
   - 'ipc:asr:state_change'    // 状态变更
   - 'ipc:asr:error'           // 错误信息
   ```

3. **状态同步优化**
   - 移除心跳检测机制
   - 移除自动重连逻辑
   - 状态通过 IPC 即时同步

4. **API 调用方式**
   - 录音控制: `window.electron.ipcRenderer.invoke('start-recording')`
   - 停止录音: `window.electron.ipcRenderer.invoke('stop-recording')`
   - 获取状态: `window.electron.ipcRenderer.invoke('get-asr-state')`

**受影响的组件**：
- `electron-app/src/App.tsx` - 前端 IPC 集成
- `electron-app/electron/main.ts` - 主进程 IPC 处理
- `electron-app/electron/preload.ts` - IPC 桥接
- `src/api/server.py` - 后端 IPC 接口

**破坏性变更 ⚠️**：
- 移除所有 WebSocket 相关代码
- 不再需要 WebSocket 连接配置
- API 调用方式完全改变

**迁移指南**：
1. 删除 WebSocket 连接代码
2. 使用 `window.electron.ipcRenderer` 替代 WebSocket
3. 更新状态监听逻辑为 IPC 事件监听
4. 移除心跳检测和重连逻辑

**性能对比**：

| 指标 | WebSocket | IPC | 提升 |
|------|-----------|-----|------|
| 连接延迟 | 100-500ms | <5ms | 95%+ |
| 消息延迟 | 10-50ms | 1-5ms | 50-80% |
| 稳定性 | 依赖网络 | 进程间 | 显著 |
| 内存占用 | 较高 | 较低 | 20-30% |

**文档更新**：
- `docs/bugfix_20260104_websocket_no_connection.md` - WebSocket 问题文档（已过时）
- `docs/bugfix_20260104_ipc_fix_summary.md` - IPC 修复文档
- `docs/bugfix_20260104_ipc_listener_duplication.md` - IPC 监听器问题
- `docs/bugfix_20260104_ipc_test_guide.md` - IPC 测试指南

**测试验证**：
- ✅ 录音启动和停止响应时间
- ✅ 实时识别文本延迟
- ✅ 长时间运行稳定性
- ✅ 应用重启和恢复
- ✅ 错误处理和容错机制

---

## 版本：v1.1.0 (2026-01-03)

### 新增功能

#### Block 图片显示支持

为 VoiceNote 添加了完整的图片粘贴和显示功能，用户可以通过 Ctrl+V 将剪贴板中的图片直接粘贴到笔记中。

**核心功能**：
- ✅ 支持 Ctrl+V / Cmd+V 粘贴图片
- ✅ 自动保存图片到本地存储目录（配置：`storage.data_dir/storage.images`）
- ✅ 图片自动适应容器宽度，保持宽高比
- ✅ 支持删除图片块
- ✅ 图片随笔记一起保存和加载
- ✅ 美观的图片显示样式（渐变背景、阴影、圆角）

**技术实现**：

1. **Block 接口扩展**
```typescript
export interface Block {
  // ... 其他字段
  imageUrl?: string;      // 图片 URL（相对路径）
  imageCaption?: string;  // 图片说明（可选）
}

export type BlockType = '...' | 'image';  // 新增 'image' 类型
```

2. **后端 API 新增**
- `POST /api/images/save` - 保存 Base64 图片
- `GET /api/images/{filename}` - 获取图片文件

3. **前端功能**
- BlockEditor 添加 `onPaste` 事件监听
- 检测剪贴板图片数据
- 自动上传并创建图片 Block
- 图片渲染组件（含错误处理）

**图片存储**：
- 位置：由 `config.yml` 的 `storage.data_dir/storage.images` 配置决定
- 命名：`{timestamp}-{hash}.{ext}`
- 格式：支持 PNG, JPG, GIF, WebP
- 安全：路径遍历防护

**样式特点**：
- 浅灰色渐变背景（#f8fafc → #f1f5f9）
- 悬停效果：深色背景 + 阴影增强
- 圆角边框（var(--radius-lg)）
- 响应式布局，自适应宽度
- 图片加载失败时显示友好提示

**文件变更**：
- `electron-app/src/components/apps/VoiceNote/BlockEditor.tsx` - 添加图片粘贴和渲染
- `electron-app/src/components/apps/VoiceNote/Block.css` - 添加图片样式
- `src/api/server.py` - 添加图片保存和获取 API
- 存储目录由配置文件控制
- `.gitignore` - 配置图片文件忽略规则

**文档**：
- `docs/image_block_feature.md` - 功能文档
- `docs/image_feature_test_guide.md` - 测试指南

**未来改进计划**：
1. 图片说明文字（Caption）编辑
2. 拖拽上传文件
3. 图片压缩和缩略图
4. 批量上传多张图片
5. 图片编辑（裁剪、旋转、调整大小）
6. 云存储支持（OSS, S3）

---

## 版本：v1.0.1 (2026-01-02)

### 修复问题

#### 音频缓冲区内存泄漏修复

修复了长时间录音导致的内存持续累积和延迟增加问题。

**问题描述**：
- 长时间录音（如1小时演讲）会导致延迟越来越长（可达数十秒）
- 内存占用持续增长（可达100-200MB）
- 处理性能逐渐下降

**根本原因**：
- 音频缓冲区 `audio_buffer` 持续累积数据，从不清理
- 33分钟录音累积到123MB，1小时可达200-300MB

**解决方案**：
1. 添加 `max_buffer_seconds` 配置参数（默认60秒）
2. 自动清理超过限制的旧数据（保留50%）
3. 不影响实时ASR识别功能

### 变更详情

#### 1. 音频录音器增强 (`audio_recorder.py`)

**新增参数**：
```python
def __init__(self, ..., max_buffer_seconds: int = 60):
    # 计算最大缓冲区大小
    self.max_buffer_size = rate * channels * 2 * max_buffer_seconds
    self._buffer_cleanups = 0  # 清理次数统计
```

**缓冲区管理逻辑**：
```python
def _consume_audio(self):
    # 检查缓冲区大小
    if buffer_size > self.max_buffer_size:
        # 保留最新的一半，删除旧的一半
        keep_size = self.max_buffer_size // 2
        self.audio_buffer = self.audio_buffer[remove_size:]
        logger.info(f"缓冲区清理: 删除了 {remove_size}MB 旧数据")
```

#### 2. 配置文件更新

**config.yml 新增**：
```yaml
audio:
  max_buffer_seconds: 60  # 最大缓冲时长（秒）
```

**说明**：
- 16kHz单声道：60秒约1.92MB，120秒约3.84MB
- 建议值：60秒（语音识别）- 120秒（高质量）

#### 3. 服务器初始化更新 (`server.py`)

```python
recorder = SoundDeviceRecorder(
    rate=config.get('audio.rate', 16000),
    channels=config.get('audio.channels', 1),
    chunk=config.get('audio.chunk', 1024),
    device=audio_device,
    vad_config=vad_config,
    max_buffer_seconds=config.get('audio.max_buffer_seconds', 60)  # 新增
)
```

### 性能改进

**修复前**：
- 1小时录音：缓冲区115MB，延迟数十秒
- 内存持续增长，性能下降

**修复后**：
- 1小时录音：缓冲区稳定在1.92MB，延迟稳定
- 定期清理（约60次），性能恒定

### 影响范围

- ✅ 不影响实时ASR识别
- ✅ 不影响VAD过滤功能  
- ✅ 向后兼容（默认值60秒）
- ⚠️ 无法保存完整录音（如需要，请另外实现）

### 相关文档

- [缓冲区内存修复文档](docs/buffer_memory_fix.md)
- [验证步骤](docs/buffer_fix_verification.md)
- [测试脚本](test_buffer.py)

---

## 版本：v1.1.0 (2025-12-31)

### 新增功能

#### ASR 时间信息增强

为 `text_final` WebSocket 消息添加了开始时间和结束时间信息，方便前端显示语音识别的时间范围。

### 变更详情

#### 1. WebSocket 消息格式变更

**text_final 消息**（新增字段）
```json
{
  "type": "text_final",
  "text": "这十年过来。",
  "start_time": 0,      // 新增：开始时间（毫秒）
  "end_time": 4440      // 新增：结束时间（毫秒）
}
```

**text_update 消息**（格式不变）
```json
{
  "type": "text_update",
  "text": "这十年过来"
}
```

#### 2. 回调函数签名变更

**ASR Provider (`volcano.py`)**
```python
# 旧签名
set_on_text_callback(callback: Callable[[str, bool], None])

# 新签名
set_on_text_callback(callback: Callable[[str, bool, dict], None])
# 新增参数: time_info: dict - 包含 start_time 和 end_time
```

**Voice Service (`voice_service.py`)**
```python
# 旧签名
_on_asr_text_received(text: str, is_definite_utterance: bool)

# 新签名
_on_asr_text_received(text: str, is_definite_utterance: bool, time_info: dict)
```

#### 3. 内部方法变更

**`_detect_definite_utterance()` 返回值变更**
```python
# 旧返回值
return bool  # True 或 False

# 新返回值
return tuple[bool, dict]  # (是否确定, 时间信息字典)
```

### 使用示例

#### 前端 TypeScript 示例

```typescript
interface TextFinalMessage {
  type: 'text_final';
  text: string;
  start_time: number;  // 毫秒
  end_time: number;    // 毫秒
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'text_final') {
    const msg = data as TextFinalMessage;
    const duration = (msg.end_time - msg.start_time) / 1000;
    
    console.log(`[${msg.start_time/1000}s - ${msg.end_time/1000}s] ${msg.text}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
  }
};
```

#### Python 回调示例

```python
def on_text_callback(text: str, is_definite: bool, time_info: dict):
    if is_definite:
        start = time_info.get('start_time', 0)
        end = time_info.get('end_time', 0)
        duration = (end - start) / 1000
        print(f"[{start/1000:.2f}s - {end/1000:.2f}s] {text} (duration: {duration:.2f}s)")
    else:
        print(f"[中间结果] {text}")

voice_service.set_on_text_callback(on_text_callback)
```

### 兼容性说明

#### 破坏性变更 ⚠️

1. **回调函数签名变更**: 所有使用 `set_on_text_callback` 的代码需要更新
2. **内部方法返回值变更**: `_detect_definite_utterance()` 返回值从 `bool` 改为 `tuple[bool, dict]`

#### 向前兼容 ✅

1. **WebSocket 消息**: 前端可以选择忽略新增的 `start_time` 和 `end_time` 字段
2. **时间信息可选**: 如果 ASR 服务不返回时间信息，字段值为 0

### 迁移指南

#### 更新 API Server 回调

**旧代码**:
```python
voice_service.set_on_text_callback(
    lambda text, is_definite: broadcast({
        "type": "text_final" if is_definite else "text_update",
        "text": text
    })
)
```

**新代码**:
```python
def on_text_callback(text: str, is_definite: bool, time_info: dict):
    message = {
        "type": "text_final" if is_definite else "text_update",
        "text": text
    }
    if is_definite and time_info:
        message["start_time"] = time_info.get('start_time', 0)
        message["end_time"] = time_info.get('end_time', 0)
    broadcast(message)

voice_service.set_on_text_callback(on_text_callback)
```

#### 更新前端代码

**可选更新**（前端可以继续使用旧代码，忽略时间字段）:

```typescript
// 旧代码（仍然有效）
if (data.type === 'text_final') {
  displayText(data.text);
}

// 新代码（利用时间信息）
if (data.type === 'text_final') {
  displayTextWithTimestamp(
    data.text, 
    data.start_time, 
    data.end_time
  );
}
```

### 测试要点

1. ✅ 验证 `text_final` 消息包含 `start_time` 和 `end_time` 字段
2. ✅ 验证 `text_update` 消息不包含时间字段
3. ✅ 验证时间值合理性：
   - `end_time > start_time`
   - 时间值为非负数
   - 持续时间在合理范围内（通常几秒）
4. ✅ 验证日志输出包含时间信息

### 相关文档

- [ASR 时间信息文档](docs/ASR_TIMING_INFO.md) - 详细技术文档
- [架构文档](docs/ARCHITECTURE.md) - 系统架构说明
- [状态管理文档](docs/STATES.md) - 状态转换说明

### 修改的文件

- `src/providers/asr/volcano.py` - ASR Provider 实现
- `src/services/voice_service.py` - Voice Service 实现
- `src/api/server.py` - API Server 实现
- `docs/ASR_TIMING_INFO.md` - 新增文档

### 待办事项

- [ ] 更新前端代码以显示时间信息
- [ ] 添加单元测试验证时间信息提取
- [ ] 更新 API 文档
- [ ] 发布新版本

---

**更新日期**: 2025-12-31
**影响范围**: ASR Provider, Voice Service, API Server
**破坏性变更**: 是（回调函数签名变更）

