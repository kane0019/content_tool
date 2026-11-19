# 内容生成工具 · 技术架构文档

**版本：** v1.0  
**日期：** 2026-07-12

---

## 1. 整体架构

```
微信小程序（前端）
       │
       │  wx.cloud.callFunction
       ▼
┌─────────────────────────────────────────┐
│         微信云开发（CloudBase）           │
│                                         │
│  ┌──────────┐  fire-and-forget          │
│  │createTask│ ──────────────────────►   │
│  └──────────┘                           │
│                  ┌─────────────────┐    │
│                  │generateContent  │    │
│                  │  (stream write) │    │
│                  └────────┬────────┘    │
│  ┌──────────────┐         │             │
│  │refineContent │         │             │
│  └──────────────┘         │             │
│  ┌──────────────┐         │             │
│  │ taskManager  │         │             │
│  └──────────────┘         │             │
│  ┌──────────────────────┐ │             │
│  │  templateManager     │ │             │
│  └──────────────────────┘ │             │
│                            ▼            │
│  ┌──────────────────────────────────┐   │
│  │     云数据库（文档型）            │   │
│  │  tasks 集合 | templates 集合     │   │
│  └──────────────────────────────────┘   │
└────────────────────────┬────────────────┘
                         │ HTTPS
                    ┌────▼──────┐
                    │ DeepSeek  │
                    │   API     │
                    └───────────┘
```

---

## 2. 云函数模块

### 2.1 `createTask` · 创建生成任务

**职责：** 入口函数，接收小程序请求，立即返回 `task_id`，异步触发生成。

**调用方：** 小程序前端

**输入：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `skeleton` | string | ✓ | 内容骨架 / 提纲 |
| `style` | string | ✓ | 行文风格（如"干货科普"） |
| `platforms` | string[] | ✓ | 目标平台（如 `["wechat_mp"]`） |
| `audience` | string | ✓ | 面向群体 |
| `length_pref` | string | - | `short` / `medium` / `long`，默认 `medium` |
| `ref_material` | string | - | 参考素材 |

**输出：** `{ code: 0, data: { task_id } }`

**执行流程：**
1. 参数校验
2. 向 `tasks` 集合写入文档，`status = running`，`partial_content = ""`
3. 调用 `generateContent`（不 await，fire-and-forget）
4. 立即返回 `task_id`

---

### 2.2 `generateContent` · 流式生成内容

**职责：** 核心生成函数，调用 DeepSeek 流式 API，每累积 50 字写入数据库。

**调用方：** `createTask` 内部触发（不由小程序直接调用）

**输入：**

| 字段 | 说明 |
|---|---|
| `taskId` | 已创建的任务文档 ID（必填） |
| 其余字段 | 同 `createTask` 的输入参数 |

**执行流程：**
1. 根据 `platform` + `style` + `audience` + `length_pref` 构建 System Prompt
2. 根据 `skeleton` + `ref_material` 构建 User Prompt
3. 以 `stream: true` 调用 DeepSeek，逐 token 累积
4. 每积累 50 字，`UPDATE tasks.partial_content`（前端轮询可见）
5. 流结束后，再次调用 DeepSeek 生成 5 条候选标题
6. 最终 `UPDATE tasks`：`status = done`，写入 `results[]`

**环境变量（需在控制台设置）：**
- `DEEPSEEK_API_KEY` — DeepSeek API 密钥
- `DEEPSEEK_BASE_URL` — 默认 `https://api.deepseek.com`
- `DEEPSEEK_MODEL` — 默认 `deepseek-chat`

---

### 2.3 `refineContent` · 局部优化

**职责：** 对选中段落执行扩写 / 缩写 / 润色，同步返回结果。

**调用方：** 小程序前端

**输入：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `platform` | string | 目标平台 |
| `selected_text` | string | 待优化的文字片段 |
| `action` | string | `expand` / `shorten` / `polish` |

**输出：** `{ code: 0, data: { content } }`

**执行流程：**
1. 根据 `action` 选择对应 Prompt 指令
2. 同步调用 DeepSeek，直接返回优化结果

---

### 2.4 `taskManager` · 任务历史管理

**职责：** 任务历史 CRUD，通过 `action` 字段路由。

| action | 输入 | 输出 | 说明 |
|---|---|---|---|
| `list` | `{ page?, page_size? }` | `{ total, items[] }` | 按时间倒序分页，不含 `results` 大字段 |
| `get` | `{ task_id }` | `{ ...task, results[] }` | 完整任务文档含所有平台结果 |
| `delete` | `{ task_id }` | `{}` | 删除整条文档 |

---

### 2.5 `templateManager` · 自定义内容模板

**职责：** 用户保存的风格配置模板 CRUD，通过 `action` 路由。

| action | 输入 | 输出 |
|---|---|---|
| `list` | `{}` | `[{ id, name, config, created_at }]` |
| `create` | `{ name, config }` | `{ id }` |
| `update` | `{ id, name?, config? }` | `{}` |
| `delete` | `{ id }` | `{}` |

`config` 示例：
```json
{ "style": "干货科普", "platforms": ["wechat_mp"], "audience": "科技爱好者", "length_pref": "long" }
```

---

### 2.6 `testDeepSeek` · 连通性测试

**职责：** 验证 DeepSeek API Key 和网络连通性，返回延迟和模型信息。

**输出：** `{ code: 0, data: { reply, model, tokens, latency_ms } }`

---

## 3. 共享模块（`_shared/`）

> 部署前由 `deploy_prep.ps1` 复制到 `generateContent/` 和 `refineContent/`。

### 3.1 `promptEngine.js`

Prompt 构建模块，维护**平台 × 风格**二维矩阵。

**平台规则（`PLATFORM_RULES`）：** 5 个平台各自一份固定指令
- `wechat_mp` — 结构完整、小标题分层
- `xiaohongshu` — emoji 分点、话题标签
- `weibo` — 140字内、口语化
- `douyin_script` — 开场钩子、口播结构、CTA
- `zhihu` — 逻辑论证、小标题

**风格指令（`STYLE_INSTRUCTIONS`）：** 6 种内置风格
专业严谨 / 轻松幽默 / 情感共鸣 / 干货科普 / 故事叙述 / 犀利评论

**长度指令（`LENGTH_INSTRUCTIONS`）：**
- `short` — ≤300 字
- `medium` — 300-800 字
- `long` — 800 字+

**导出函数：**

| 函数 | 用途 |
|---|---|
| `buildSystemPrompt(platform, style, audience, lengthPref)` | 组合四层指令生成 System Prompt |
| `buildUserPrompt(skeleton, refMaterial)` | 骨架 + 参考素材拼接 User Prompt |
| `buildTitlePrompt(content, platform)` | 基于前 500 字生成候选标题请求 |
| `buildRefinePrompt(selectedText, action, platform)` | 局部优化请求 |

### 3.2 `llmClient.js`

DeepSeek API 调用封装，复用单例 `OpenAI` 客户端。

| 函数 | 模式 | 用途 |
|---|---|---|
| `chatOnce(system, user, temp?)` | 同步，返回 `{ content, tokens }` | 生成正文（非流式模式）、候选标题、局部优化 |
| `streamChat(system, user, temp?)` | 异步生成器，`for await` 逐 token | `generateContent` 流式写数据库 |

---

## 4. 数据模型（CloudBase 云数据库）

### 4.1 `tasks` 集合

```json
{
  "_id": "auto",
  "skeleton": "内容骨架文本",
  "style": "干货科普",
  "platforms": ["wechat_mp"],
  "audience": "科技爱好者",
  "length_pref": "medium",
  "ref_material": "可选参考素材",
  "status": "done",
  "partial_content": "生成过程中每50字更新一次，完成后为完整内容",
  "results": [
    {
      "platform": "wechat_mp",
      "content": "完整生成内容",
      "title_candidates": ["标题A", "标题B", "标题C", "标题D", "标题E"]
    }
  ],
  "error_msg": "仅 status=failed 时存在",
  "created_at": "2026-07-12T01:00:00.000Z"
}
```

### 4.2 `templates` 集合

```json
{
  "_id": "auto",
  "name": "我的常用风格",
  "config": {
    "style": "干货科普",
    "platforms": ["wechat_mp"],
    "audience": "科技爱好者",
    "length_pref": "long"
  },
  "created_at": "2026-07-12T01:00:00.000Z"
}
```

---

## 5. 生成流程时序

```
小程序                    createTask              generateContent         DeepSeek
  │                           │                        │                    │
  │── callFunction ──────────►│                        │                    │
  │                           │── db.add(status=running)                    │
  │◄── { task_id } ───────────│                        │                    │
  │                           │── callFunction ────────►│                   │
  │                           │   (fire-and-forget)     │── stream=true ───►│
  │                           │                        │◄── token,token... ─│
  │                           │                        │ db.update(+50字)   │
  │── taskManager.get ───────────────────────────────────────────────────── │
  │◄── partial_content ────────────────────────────────────────────────────  │
  │  （2秒轮询）               │                        │                    │
  │                           │                        │── chatOnce(titles)►│
  │                           │                        │◄── titles ─────────│
  │                           │                        │ db.update(done)    │
  │── taskManager.get ────────────────────────────────────────────────────── │
  │◄── { status:done, results, title_candidates } ──────────────────────────
```

---

## 6. 部署清单

### 云函数（微信开发工具上传）

| 函数 | 依赖包 | 需要复制共享文件 |
|---|---|---|
| `createTask` | `wx-server-sdk` | 否 |
| `generateContent` | `wx-server-sdk`, `openai` | ✓（`promptEngine.js`, `llmClient.js`） |
| `refineContent` | `wx-server-sdk`, `openai` | ✓（`promptEngine.js`, `llmClient.js`） |
| `taskManager` | `wx-server-sdk` | 否 |
| `templateManager` | `wx-server-sdk` | 否 |
| `testDeepSeek` | `openai` | 否 |

上传前执行：`.\cloudfunctions\deploy_prep.ps1`

### 云函数环境变量（控制台设置）

`generateContent` 和 `refineContent` 和 `testDeepSeek` 均需在控制台设置：

| 键 | 值 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | `deepseek-chat` |

### 超时设置（控制台）

| 函数 | 建议超时 |
|---|---|
| `generateContent` | 60s（上限） |
| `refineContent` | 30s |
| 其余 | 10s |

### 数据库集合（控制台创建）

| 集合 | 权限 |
|---|---|
| `tasks` | 所有用户可读，仅创建者可写 |
| `templates` | 所有用户可读，仅创建者可写 |

---

## 7. 项目文件结构

```
content_tool/
├── app.js                        # 小程序入口，初始化云开发环境
├── app.json                      # 小程序配置
├── project.config.json           # 开发工具配置（cloudfunctionRoot 指向 cloudfunctions/）
├── pages/
│   └── test/
│       ├── test.js               # 测试页面逻辑（上线前删除）
│       └── test.wxml             # 测试页面 UI（上线前删除）
└── cloudfunctions/
    ├── _shared/
    │   ├── promptEngine.js       # Prompt 矩阵（源文件，不上传）
    │   └── llmClient.js          # LLM 客户端（源文件，不上传）
    ├── createTask/               # 创建任务入口
    ├── generateContent/          # 流式内容生成
    ├── refineContent/            # 局部优化
    ├── taskManager/              # 任务历史 CRUD
    ├── templateManager/          # 模板 CRUD
    ├── testDeepSeek/             # API 连通性测试
    └── deploy_prep.ps1           # 部署前共享文件复制脚本
```
