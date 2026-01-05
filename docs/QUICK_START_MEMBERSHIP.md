# MindVoice 会员体系快速启动指南

> **版本**: v1.0.0  
> **更新时间**: 2026-01-05

---

## 🚀 快速开始（5分钟）

### 前置条件

- ✅ Python 3.9+ 已安装
- ✅ Node.js 16+ 已安装
- ✅ 虚拟环境已创建并激活

### 步骤 1: 初始化数据库

```bash
cd /Users/wangjunhui/playcode/语音桌面助手
source venv/bin/activate
python scripts/init_membership_db.py
```

**预期输出**:
```
[数据库] ✓ 设备信息表已创建
[数据库] ✓ 用户信息表已创建
[数据库] ✓ 会员信息表已创建
[数据库] ✓ 消费记录表已创建
[数据库] ✓ 月度消费汇总表已创建
[数据库] ✓ 会员升级历史表已创建
[数据库] ✅ 会员体系数据库初始化完成
```

### 步骤 2: 更新配置文件

将 `config.yml.example` 中的会员配置复制到 `config.yml`:

```yaml
# 会员体系配置
membership:
  default_tier: free
  free_permanent: true
  quotas:
    free:
      asr_duration_ms_monthly: 3600000
      llm_tokens_monthly: 100000
    vip:
      asr_duration_ms_monthly: 36000000
      llm_tokens_monthly: 1000000
    pro:
      asr_duration_ms_monthly: 180000000
      llm_tokens_monthly: 5000000
    pro_plus:
      asr_duration_ms_monthly: 720000000
      llm_tokens_monthly: 20000000
```

### 步骤 3: 编译前端

```bash
cd electron-app
npm run build:electron
```

**预期输出**: 编译成功，无错误 ✅

### 步骤 4: 启动应用

```bash
# 方式1: 使用快速启动脚本
./quick_start.sh

# 方式2: 手动启动
# 终端1 - 后端
python api_server.py --host 127.0.0.1 --port 8765

# 终端2 - 前端
cd electron-app
npm run dev
```

### 步骤 5: 验证功能

1. **设备注册**: 应用启动时会自动注册设备
   - 查看终端输出: `[主进程] ✅ 设备注册成功`
   - 新用户会看到: `🎉 欢迎新用户！已自动开通免费永久权限`

2. **查看会员信息**: 在应用中打开会员界面
   - 会员等级: 免费尝鲜
   - 状态: 有效
   - 有效期: 永久有效
   - 月度额度: ASR 1小时, LLM 10万tokens

3. **测试激活码**: 生成测试激活码
   ```bash
   python scripts/generate_activation_codes.py \
     --tier vip \
     --months 3 \
     --count 1 \
     --output test_code.csv
   ```
   
   打开 `test_code.csv` 查看激活码，在应用中激活测试。

---

## 📖 常用命令

### 生成激活码

```bash
# VIP 3个月 100个
python scripts/generate_activation_codes.py \
  --tier vip --months 3 --count 100 \
  --output codes_vip_3m.csv

# PRO 6个月 50个
python scripts/generate_activation_codes.py \
  --tier pro --months 6 --count 50 \
  --output codes_pro_6m.csv

# PRO+ 12个月 10个
python scripts/generate_activation_codes.py \
  --tier pro_plus --months 12 --count 10 \
  --output codes_proplus_12m.csv
```

### 查看数据库

```bash
# 进入数据库
sqlite3 ~/Library/Application\ Support/MindVoice/database/history.db

# 查看设备
SELECT * FROM devices;

# 查看会员
SELECT * FROM memberships;

# 查看消费记录
SELECT * FROM consumption_records ORDER BY timestamp DESC LIMIT 10;

# 退出
.quit
```

### 备份数据

```bash
# 备份数据库
cp ~/Library/Application\ Support/MindVoice/database/history.db \
   ~/Library/Application\ Support/MindVoice/backups/history.db.backup.$(date +%Y%m%d)

# 备份黑名单
cp ~/Library/Application\ Support/MindVoice/blacklist.json \
   ~/Library/Application\ Support/MindVoice/backups/blacklist.backup.$(date +%Y%m%d)
```

---

## 🔧 故障排查

### 问题 1: 数据库初始化失败

**症状**: `python scripts/init_membership_db.py` 报错

**解决**:
```bash
# 检查虚拟环境
source venv/bin/activate
which python  # 应该指向 venv/bin/python

# 检查配置文件
cat config.yml | grep storage

# 手动创建目录
mkdir -p ~/Library/Application\ Support/MindVoice/database
```

### 问题 2: TypeScript 编译错误

**症状**: `npm run build:electron` 失败

**解决**:
```bash
cd electron-app

# 清理缓存
rm -rf node_modules/.cache
rm -rf dist-electron

# 重新编译
npm run build:electron
```

### 问题 3: 设备注册失败

**症状**: 启动时看到 `设备注册失败`

**解决**:
1. 检查后端是否启动: `curl http://127.0.0.1:8765/api/status`
2. 检查数据库是否初始化: `ls -la ~/Library/Application\ Support/MindVoice/database/`
3. 查看后端日志: 检查 Python 终端输出

### 问题 4: 激活码无效

**症状**: 激活时提示 "激活码已被使用或已失效"

**解决**:
1. 检查黑名单: `cat ~/Library/Application\ Support/MindVoice/blacklist.json`
2. 生成新的激活码
3. 确认激活码格式正确: `TIER-MONTHS-XXXX-XXXX`

---

## 📊 API 测试

### 测试设备注册

```bash
curl -X POST http://127.0.0.1:8765/api/device/register \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-001",
    "machine_id": "test-machine-001",
    "platform": "darwin"
  }'
```

### 测试会员信息查询

```bash
curl http://127.0.0.1:8765/api/membership/test-device-001
```

### 测试激活码验证

```bash
curl -X POST http://127.0.0.1:8765/api/activation/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "VIP-3-ABCD-1234"}'
```

### 测试额度检查

```bash
curl -X POST http://127.0.0.1:8765/api/quota/check \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-001",
    "type": "asr",
    "estimated_amount": 60000,
    "model_source": "vendor"
  }'
```

---

## 🎯 下一步

### Phase 2: 消费计量集成

1. **ASR集成**: 修改 `src/providers/asr/volcano.py`
2. **LLM集成**: 修改 `src/providers/llm/litellm_provider.py`
3. **测试**: 录音和对话时验证消费记录

### Phase 3: 用户信息管理

1. **后端服务**: 创建 `src/services/user_profile_service.py`
2. **API接口**: 扩展 `src/api/membership_api.py`
3. **前端UI**: 创建用户信息编辑界面

---

## 📞 获取帮助

**文档**:
- 📖 完整规划: `docs/MEMBERSHIP_AND_CONSUMPTION_PLANNING.md`
- 📊 实施进度: `docs/MEMBERSHIP_IMPLEMENTATION_PROGRESS.md`
- ✅ 完成报告: `docs/MEMBERSHIP_PHASE1_COMPLETE.md`

**联系方式**:
- 邮箱: manwjh@126.com
- 项目: MindVoice v1.8.1

---

**最后更新**: 2026-01-05  
**状态**: Phase 1 完成 ✅

