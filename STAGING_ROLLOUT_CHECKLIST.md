# STAGING ROLLOUT CHECKLIST
# President Tools OS — Internal Beta (Steven + 50 Downlines)
# Complete ALL 20 items before sending first invite link.

---

## TIER 1 — INFRASTRUCTURE (完成才能建数据库)

### ✅ 1. 环境变量全部配置
确认 Vercel staging environment 里以下变量全部已设：

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
ANTHROPIC_API_KEY
OPENAI_API_KEY
CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_R2_BUCKET_NAME
CLOUDFLARE_R2_PUBLIC_URL
BUNNY_STREAM_LIBRARY_ID
BUNNY_STREAM_API_KEY
REDIS_URL
CRON_SECRET
RESEND_API_KEY
NEXT_PUBLIC_APP_URL
```

**验证方式：** Vercel dashboard → Settings → Environment Variables，逐一对照。
**风险：** 任何一个漏填，对应模块在 staging 直接 500。

---

### ✅ 2. 数据库迁移全部跑通
在 staging Supabase 项目上按顺序执行：

```
0001_initial_accounts.sql
0002_voice_capture.sql
0003_content_studio.sql
0004_account_slug.sql
0005_funnels.sql
0006_lead_magnets.sql
0007_webinars.sql
0008_crm.sql
0009_coach.sql
0010_ads.sql
0011_objections.sql
0011_objections_seed.sql
0013_voice_remediation.sql
0014_pdpa_consent.sql
```

**验证方式：** Supabase → Table Editor，确认以下表存在：
`accounts`, `memberships`, `voice_captures`, `content_drafts`, `funnels`, `funnel_leads`,
`lead_magnets`, `webinars`, `contacts`, `daily_tasks`, `ad_entries`, `objection_responses`,
`why_story_sessions`, `journey_moments`, `weekly_draft_seeds`

RLS 已启用：每张表右上角显示 "RLS enabled"。

---

### ✅ 3. BullMQ Worker 在线
Transcription 和 Voice Profile worker 必须作为独立进程运行（不是 serverless function）。

**验证方式：**
1. 上传一段 30 秒测试音频
2. 等待 60 秒
3. Supabase → `voice_captures` 表，确认该条记录的 `status` 从 `uploading` 变为 `accepted`
4. Redis dashboard（Upstash / Railway）确认队列 `transcription` 消费了任务

**失败后果：** 所有 Why Story 录音永远卡在 `transcribing`，Voice Profile 无法生成。

---

### ✅ 4. Cloudflare R2 Bucket 可读写
**验证方式：**
1. 通过 staging 上传一张广告截图（Ad Insights → 新增广告）
2. 确认截图出现在 R2 Bucket 的 `ad-screenshots/` 路径下
3. 用 presigned URL 在浏览器打开该截图，确认图片可访问

---

## TIER 2 — 核心安全 (数据隔离是底线)

### ✅ 5. Account Isolation 人工验证
用两个不同 staging 账号（A 和 B）各自创建一条联系人记录。

**验证方式：**
1. 账号 A 登录 → Contacts → 新增联系人"测试A"
2. 账号 B 登录 → Contacts → 确认看不到"测试A"
3. 直接在浏览器 URL 栏访问 `/api/contacts?accountId=A的UUID` → 确认返回 401 或空数据

**失败后果：** 数据泄漏，内测终止。

---

### ✅ 6. Invite-only 注册验证
确认没有 invite link 无法创建账号。

**验证方式：**
1. 在无痕浏览器直接访问 `https://staging.yourdomain.com/login`
2. 尝试用一个从未被邀请的邮箱登录
3. 预期结果：登录页返回错误，不创建账号
4. 检查 Supabase → `memberships` 表，确认没有新增记录

---

### ✅ 7. Admin guard 验证
确认普通 distributor 无法访问 `/admin/*` 路由。

**验证方式：**
1. 用一个 `role = 'member'` 的账号登录
2. 直接访问 `https://staging.yourdomain.com/admin`
3. 预期结果：重定向到 dashboard，不显示管理页面

---

## TIER 3 — 合规三道门 (上线必须全过)

### ✅ 8. Modification Rule 实测
AI 生成的内容，不修改直接导出必须被拒绝。

**验证方式：**
1. Content Studio → 选一个语音片段 → 生成内容
2. **不做任何修改**，直接点击"导出"
3. 预期结果：导出被阻止，提示"请先修改内容"（HTTP 403）
4. 修改超过 20% 文字后再导出 → 成功

---

### ✅ 9. Compliance Filter 实测
确认违规内容被拦截。

**验证方式：** 在 Content Studio 文本框输入以下测试词，点击合规检查：
- `"每月赚 RM 10,000"` → 预期：❌ 收入声明
- `"保证瘦 10 公斤"` → 预期：❌ 效果保证
- `"我的个人分享，结果因人而异"` → 预期：✅ 通过

---

### ✅ 10. Disclosure 不可删除验证
内容导出时 disclosure 声明不能被去掉。

**验证方式：**
1. 导出任意一条通过合规的内容
2. 检查导出结果，确认末尾包含类似 `"个人分享，结果因人而异"` 的免责声明
3. 尝试在文本框手动删除 disclosure 文字后再导出 → 预期：被重新附加

---

### ✅ 11. PDPA 同意 checkbox 验证
三个公开页面必须有不可跳过的同意框。

**验证方式（登出状态 / 无痕浏览器）：**
1. 访问任意一个 Funnel 公开页 → 确认有 PDPA 同意 checkbox，未勾选无法提交
2. 访问 Lead Magnet 下载页 → 同上
3. 访问 Webinar 注册页 → 同上
4. 检查 Supabase → 提交后该记录的 `pdpa_consent = true`，`consent_text` 非空

---

### ✅ 12. PDPA 删除 API 验证
**验证方式：**
1. 用管理员账号登录
2. 调用 `POST /api/admin/pdpa/erase` body: `{ "whatsappNumber": "601XXXXXXXX", "accountId": "..." }`
3. 检查 Supabase → funnel_leads / contacts 对应记录的 name 变为 `DELETED`，whatsapp 变为匿名值
4. audit_logs 出现一条 `action = 'pdpa_erasure'` 记录

---

## TIER 4 — 核心功能端到端

### ✅ 13. Why Story 完整流程
**验证方式：**
1. Voice → 我的故事 → 开始录音
2. 对 5 个问题各录 10–30 秒语音
3. 提交 → 等待转录（约 2–5 分钟）
4. 看到 AI 提取的片段草稿 → 勾选确认
5. 检查 Supabase → `journey_moments` 出现 5 条记录，`confirmed_at` 非空

---

### ✅ 14. Lead Magnet PDF 个性化
**验证方式：**
1. Admin → Lead Magnets → 上传一份测试 PDF（最后一页留空）
2. Distributor 账号 → 激活该 Magnet
3. 用无痕浏览器访问 Magnet 公开页 → 填写信息 → 勾选 PDPA → 下载
4. 打开下载的 PDF → 最后一页确认显示该 Distributor 的联系方式（姓名 / WhatsApp）

---

### ✅ 15. Webinar 注册 → 回放流程
**验证方式：**
1. Admin → 新增 Webinar，从 Bunny.net Dashboard 复制 videoId 粘贴
2. Distributor → 激活该 Webinar
3. 无痕浏览器访问注册页 → 填写信息 → 注册
4. 收到含 watch token 的回放 URL
5. 访问回放页 → Bunny.net 视频正常播放
6. 确认页面顶部显示 "RECORDED TRAINING"，无任何 "LIVE" 字样

---

### ✅ 16. CRM Sync + WhatsApp 深链接
**验证方式：**
1. 完成步骤 14（Magnet 下载）和步骤 15（Webinar 注册）
2. Contacts → 点击"同步联系人"
3. 确认刚才的两个测试联系人出现在 Kanban 的 "New Lead" 栏
4. 点击联系人卡片上的 WhatsApp 图标 → 确认跳转到 `wa.me/60XXXXXXX?text=...`

---

### ✅ 17. Daily Coach 生成
**验证方式：**
1. 手动触发：`POST /api/crons/daily-coach` with header `Authorization: Bearer {CRON_SECRET}`
2. 等待约 30 秒
3. Dashboard → Daily Coach widget → 出现 3–7 条今日任务
4. 点击一条任务上的 WhatsApp 按钮 → 任务状态变为完成

---

### ✅ 18. Weekly Seeds 生成
**验证方式（需先有 ≥ 3 个 journey_moments）：**
1. 手动触发：`POST /api/crons/weekly-compile` with header `Authorization: Bearer {CRON_SECRET}`
2. Voice → 本周灵感 → 出现 5 张内容种子卡片
3. 点击"用于内容创作" → 跳转 Content Studio，草稿已预填

---

## TIER 5 — 运营准备

### ✅ 19. 错误监控已接入
**验证方式：**
1. 故意触发一个 500 错误（例如临时删掉一个 env var，访问对应功能）
2. Sentry dashboard → 出现该错误记录，包含 stack trace
3. 恢复 env var

确认 Sentry DSN 已在 Vercel 环境变量中设置：`NEXT_PUBLIC_SENTRY_DSN`

---

### ✅ 20. 第一个 Invite 流程完整测试
**在发给真实下线前，先用自己的第二个邮箱测试一遍：**

1. Admin → Invites → 发送邀请到你的第二个邮箱
2. 打开邮件 → 点击邀请链接
3. 设置密码 → 完成 8 步 Account Setup Wizard（包括输入 WhatsApp、接受 Terms）
4. 确认 sidebar 显示所有 11 个模块（灰色或可用）
5. 确认 Dashboard 正常加载，无 console 错误
6. Admin → Accounts → 看到该账号出现，状态正常

---

## 通过标准

| Tier | 项目 | 通过条件 |
|---|---|---|
| T1 基础设施 | 1–4 | 全部 ✅ 才能继续 |
| T2 安全 | 5–7 | 任一 ❌ 立即停止 |
| T3 合规 | 8–12 | 任一 ❌ 立即停止（法律风险） |
| T4 功能 | 13–18 | ≥ 5/6 通过（1项小问题可带bug上线修） |
| T5 运营 | 19–20 | 19 建议必过；20 必过 |

**全部通过后，发出前 5 个邀请（种子成员），观察 2 周，再开放剩余 45 个名额。**

---

*生成日期：2026-05-21 | President Tools OS v4.1.3*
