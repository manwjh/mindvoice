# 会员体系快速启动指南

## 🚀 5分钟快速上手

本指南帮助您快速启动和测试 MindVoice 会员体系功能。

---

## 前置条件

- ✅ Python 3.9+ 已安装
- ✅ Node.js 16+ 已安装
- ✅ 项目依赖已安装 (`pip install -r requirements.txt` 和 `npm install`)
- ✅ 配置文件 `config.yml` 已正确配置

---

## 步骤 1: 初始化数据库 (30秒)

```bash
# 进入项目根目录
cd /Users/wangjunhui/playcode/语音桌面助手

# 运行数据库初始化脚本
python scripts/init_membership_db.py
```

**预期输出**:
```
[数据库初始化] 开始初始化会员数据库...
[数据库初始化] 数据库路径: ~/MindVoice/database/history.db
[数据库初始化] ✅ 表 devices 创建成功
[数据库初始化] ✅ 表 user_profiles 创建成功
[数据库初始化] ✅ 表 memberships 创建成功
[数据库初始化] ✅ 表 consumption_records 创建成功
[数据库初始化] ✅ 表 monthly_consumption 创建成功
[数据库初始化] ✅ 表 membership_history 创建成功
[数据库初始化] ✅ 数据库初始化完成！
```

---

## 步骤 2: 生成测试激活码 (30秒)

```bash
# 生成10个VIP 1个月激活码
python scripts/generate_activation_codes.py --tier vip --months 1 --count 10

# 生成5个PRO 3个月激活码
python scripts/generate_activation_codes.py --tier pro --months 3 --count 5
```

**预期输出**:
```
[激活码生成] 开始生成激活码...
[激活码生成] 等级: VIP, 周期: 1个月, 数量: 10
[激活码生成] ✅ 激活码已保存到: activation_codes_vip_1m_20260105_123456.csv
```

**激活码文件内容示例**:
```csv
activation_code,tier,months,generated_at,status
VIP-1-A3B5-C7D9,vip,1,2026-01-05 12:34:56,unused
VIP-1-E8F2-G4H6,vip,1,2026-01-05 12:34:56,unused
...
```

---

## 步骤 3: 启动应用 (1分钟)

```bash
# 使用快速启动脚本
./quick_start.sh
```

**启动流程**:
1. ✅ 激活Python虚拟环境
2. ✅ 启动Python API服务器 (端口 8765)
3. ✅ 生成设备ID (首次启动)
4. ✅ 注册设备到后端
5. ✅ 自动开通免费永久会员
6. ✅ 启动Electron应用

**首次启动日志**:
```
[主进程] ✅ 设备ID已初始化: 1a2b3c4d5e6f7g8h...
[主进程] Python API服务器已启动
[主进程] ✅ 设备注册成功
[主进程] 🎉 欢迎新用户！已自动开通免费永久权限
[主进程] ✅ 设备ID已设置到语音服务
```

---

## 步骤 4: 测试会员功能 (2分钟)

### 4.1 查看会员信息
1. 打开应用后，点击左侧导航栏的 **"会员"** 图标
2. 查看当前会员等级（应为 **FREE**）
3. 查看ASR和LLM额度进度条
4. 查看下次重置时间（下月1日）

### 4.2 测试激活码
1. 在会员界面，点击 **"激活会员"** 按钮
2. 输入刚才生成的激活码（如 `VIP-1-A3B5-C7D9`）
3. 点击 **"激活"** 按钮
4. 查看激活结果（应显示 **"激活成功！"**）
5. 返回会员信息界面，确认等级已升级为 **VIP**

### 4.3 测试ASR消费记录
1. 切换到 **"语音笔记"** 应用
2. 点击 **"开始录音"** 按钮
3. 说话30秒后点击 **"停止录音"**
4. 返回会员界面，查看ASR消费进度条（应增加约30秒）

### 4.4 测试LLM消费记录
1. 切换到 **"智能对话"** 应用
2. 输入一条消息并发送
3. 等待AI回复
4. 返回会员界面，查看LLM消费进度条（应增加若干tokens）

### 4.5 测试用户信息
1. 在会员界面，点击 **"用户信息"** 标签
2. 编辑昵称、邮箱、个人简介
3. 上传头像（可选）
4. 点击 **"保存"** 按钮
5. 刷新页面，确认信息已保存

---

## 步骤 5: 验证数据库 (1分钟)

```bash
# 连接到数据库
sqlite3 ~/MindVoice/database/history.db

# 查看设备信息
SELECT * FROM devices;

# 查看会员信息
SELECT * FROM memberships;

# 查看消费记录
SELECT * FROM consumption_records ORDER BY timestamp DESC LIMIT 10;

# 查看月度消费
SELECT * FROM monthly_consumption;

# 退出数据库
.quit
```

**预期结果**:
- `devices` 表有1条记录（你的设备）
- `memberships` 表有1条记录（tier='vip' 或 'free'）
- `consumption_records` 表有若干条记录（ASR和LLM消费）
- `monthly_consumption` 表有1条记录（当前月份）

---

## 🎯 功能验证清单

完成以下清单，确保所有功能正常工作：

### 设备管理
- [ ] 设备ID自动生成且稳定
- [ ] 设备注册成功
- [ ] 新设备自动开通免费会员

### 会员管理
- [ ] 会员信息正确显示
- [ ] 激活码验证通过
- [ ] 会员等级正确升级
- [ ] 激活历史记录显示

### 消费计量
- [ ] ASR消费自动记录
- [ ] LLM消费自动记录
- [ ] 额度进度条实时更新
- [ ] 月度统计准确

### 用户信息
- [ ] 昵称、邮箱、简介编辑成功
- [ ] 头像上传成功
- [ ] 信息保存并持久化

### 额度限制（可选）
- [ ] 修改数据库，将免费会员额度设为0
- [ ] 尝试启动ASR，应提示额度不足
- [ ] 激活VIP后，可正常使用

---

## 🐛 常见问题

### Q1: 数据库初始化失败
**错误**: `FileNotFoundError: ~/MindVoice/database/history.db`

**解决方案**:
```bash
# 手动创建目录
mkdir -p ~/MindVoice/database

# 重新运行初始化脚本
python scripts/init_membership_db.py
```

### Q2: 设备注册失败
**错误**: `[主进程] 设备注册失败（不影响启动）`

**解决方案**:
1. 检查Python API服务器是否启动（端口8765）
2. 检查 `config.yml` 中的数据库路径配置
3. 查看后端日志：`tail -f logs/api.log`

### Q3: 激活码无效
**错误**: `激活失败：激活码格式错误`

**解决方案**:
1. 检查激活码格式（如 `VIP-1-A3B5-C7D9`）
2. 确保激活码未被使用过
3. 检查 `activation_blacklist.json` 文件

### Q4: ASR消费未记录
**错误**: 录音后消费进度条未更新

**解决方案**:
1. 检查设备ID是否已设置到语音服务
2. 查看后端日志：`[语音服务] ✅ ASR消费已记录`
3. 检查数据库 `consumption_records` 表

### Q5: LLM消费未记录
**错误**: 发送消息后消费进度条未更新

**解决方案**:
1. 检查前端是否传递 `device_id` 参数（当前版本可能未实现）
2. 查看后端日志：`[API] ✅ LLM消费已记录`
3. 临时解决方案：在后端从session获取device_id

---

## 📊 监控与调试

### 查看实时日志
```bash
# Python API日志
tail -f logs/api.log

# Electron主进程日志
# 在应用启动时查看终端输出

# 前端渲染进程日志
# 打开开发者工具 (Cmd+Option+I) 查看Console
```

### 数据库查询示例
```sql
-- 查看今日ASR消费
SELECT SUM(duration_ms)/1000.0 AS total_seconds
FROM consumption_records
WHERE type='asr' AND DATE(timestamp)=DATE('now');

-- 查看今日LLM消费
SELECT SUM(total_tokens) AS total_tokens
FROM consumption_records
WHERE type='llm' AND DATE(timestamp)=DATE('now');

-- 查看会员分布
SELECT tier, COUNT(*) AS count
FROM memberships
GROUP BY tier;
```

---

## 🎉 下一步

恭喜！您已成功启动并测试了会员体系的核心功能。

**接下来可以**:
1. 📖 阅读 [完整实施总结](./MEMBERSHIP_IMPLEMENTATION_SUMMARY.md)
2. 🧪 执行更详细的测试用例
3. 🔧 根据需求调整会员等级配置
4. 🚀 部署到生产环境

**需要帮助？**
- 📧 联系开发者：manwjh@126.com
- 📚 查看项目文档：`docs/`
- 🐛 提交Issue：GitHub Issues

---

**文档版本**: v1.0.0  
**最后更新**: 2026-01-05  
**预计完成时间**: 5分钟 ⏱️

