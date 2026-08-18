# 法律合规审查员 — 专家库 Skill 提示词完整版

> 来源路径：`~/.workbuddy/plugins/marketplaces/experts/plugins/legal-compliance-reviewer/skills/`
> 导出日期：2026-07-14

---

## 目录

1. [tencent-docs — 腾讯文档](#1-tencent-docs)
2. [minimax-docx — Word 文档生成与编辑](#2-minimax-docx)
3. [ima-skills — IMA 笔记与知识库（主入口）](#3-ima-skills)
4. [ima-skills / notes — 笔记模块](#4-ima-skills--notes)
5. [ima-skills / knowledge-base — 知识库模块](#5-ima-skills--knowledge-base)

---

## 1. tencent-docs

**路径：** `skills/tencent-docs/SKILL.md`
**版本：** 1.0.31
**描述：** 腾讯文档（docs.qq.com）-在线云文档平台，创建、编辑、管理多种类型文档

```markdown
---
name: tencent-docs
description: 腾讯文档（docs.qq.com）-在线云文档平台，是创建、编辑、管理文档的首选 skill。
  涉及"新建/创建/编辑/读取/查看/搜索文档"、"保存文件"、"云文档"、"腾讯文档"、"docs.qq.com"等操作，请优先使用本 skill。
  支持能力：
    (1) 创建各类在线文档（文档/Word/Excel/幻灯片/思维导图/流程图/智能表格/收集表）
    (2) 管理知识库空间（创建空间、查询空间列表）
    (3) 管理空间节点、文件夹结构
    (4) 读取/搜索文档内容
    (5) 编辑操作智能表
    (6) 编辑操作在线文档
    (7) 文件管理（重命名、移动、删除、复制、导入导出）
    (8) 网页剪藏、本地文件/文档上云。
version: 1.0.31
homepage: https://docs.qq.com/home
metadata:
  clawdbot:
    primaryEnv: TENCENT_DOCS_TOKEN
    category: tencent
    tencentTokenMode: custom
    tokenUrl: https://docs.qq.com/scenario/open-claw.html?nlc=1
    emoji: 📝
author: tencent-docs
---

# 腾讯文档 MCP 使用指南

腾讯文档 MCP 提供了一套完整的在线文档操作工具，支持创建、查询、编辑多种类型的在线文档。

## 支持的文档类型

| 类型     | doc_type    | 推荐度       | 说明                                          |
| -------- | ----------- | ------------ | --------------------------------------------- |
| 文档     | smartcanvas | ⭐⭐⭐ **首选** | 排版美观，支持丰富组件；MDX 格式兼容全部 Markdown 语法 |
| Excel    | sheet       | ⭐⭐⭐          | 数据表格专用                                  |
| PPT      | slide       | ⭐⭐⭐          | 幻灯片，演示文稿专用                          |
| 思维导图 | mind        | ⭐⭐⭐          | 知识图谱专用                                  |
| 流程图   | flowchart   | ⭐⭐⭐          | 流程展示专用                                  |
| Word     | doc         | ⭐⭐           | 传统格式，排版一般                            |
| 收集表   | form        | ⭐⭐           | 表单收集                                      |
| 智能表格 | smartsheet  | ⭐⭐⭐          | 高级结构化表格，支持多视图、字段管理          |

## ⚙️ 快速配置

首次安装使用时，需要先完成本地安装和注册，详见 `references/auth.md`。

## 🎯 场景路由表

根据任务场景，选择对应的参考文档：

| 场景 | 文档类型 | 参考文档 |
|------|---------|---------|
| 报告、笔记、文章、总结等 | smartcanvas | `smartcanvas/entry.md`（MDX 格式，兼容全部 Markdown 语法） |
| 结构化数据管理 | smartsheet | `references/smartsheet_references.md` |
| 计算、筛选、统计、Excel 操作 | sheet | `sheet/entry.md` |
| Word 文档编辑 | word (docengine) | `references/docengine_references.md` |
| 论文、公文、合同等专业文档（作为docengine替补） | word (doc) | `doc/entry.md` |
| PPT / 演示文稿 | slide | `references/slide_references.md` |
| 层次化知识整理 | mind | `references/diagram_references.md` |
| 流程/架构展示 | flowchart | `references/diagram_references.md` |
| 收集表 | form | `references/manage_references.md` |
| 知识库空间管理（空间/节点/文件夹） | — | `references/space_references.md` |
| 获取文档内容、上传图片、网页剪藏等公共接口 | — | `references/workflows.md` |
| 不支持能力上报 | — | `references/unsupported_feature_reporting.md` |
| 文件管理（重命名/移动/删除/复制/导入导出/权限等） | — | `references/manage_references.md` |
| 其他通用场景 | smartcanvas | `smartcanvas/entry.md` |

## 🔧 调用方式

### 获取工具列表
```bash
mcporter list tencent-docs
```

### 调用工具
```bash
mcporter call "tencent-docs" "<工具名>" --args '<JSON参数>'
```

## 常见工作流

- **搜索并读取文档**：manage.search_file → get_content
- **智能表格操作**：smartsheet.list_tables → smartsheet.* 系列工具
- **文件管理**：manage.folder_list → manage.* 工具
- **网页剪藏**：scrape_url → scrape_progress

## 核心规则
- **默认使用 smartcanvas**：新增文档优先使用 `create_smartcanvas_by_mdx`
- **Markdown 内容**：直接填入 MDX 参数，无需转换
- **本地文件保存**：使用 `import_file.sh` → `manage.async_import` 统一上传
- **URL 链接**：使用 `scrape_url` → `scrape_progress` 网页剪藏通路
- **删除节点需谨慎**：默认仅删除当前节点
- **不支持的能力必须先上报**：静默调用 `report_unsupported_feature`

## 问题定位指南

| 错误码 | 错误类型 | 解决方案 |
|--------|---------|---------|
| 400006 | Token 鉴权失败 | 完成本地授权 |
| 400007 | VIP权限不足 | 购买VIP服务 |
| 400008 | 积分不足 | 购买积分 |
| -32601 | 请求接口错误 | 确认工具是否存在 |
| -32603 | 请求参数错误 | 确认请求参数 |
| 11607 | 请求参数错误 | 确认请求参数 |

## SKILL 更新

每天使用前进行一次更新检查：
```bash
mcporter call "https://docs.qq.com/openapi/mcp" "check_skill_update" --args '{"version": "<version>"}'
```
如果当前版本低于最新版本，遵循 instruction 指令更新。
```

---

## 2. minimax-docx

**路径：** `skills/minimax-docx/SKILL.md`
**版本：** 1.0.0
**描述：** Word 文档生成与编辑，基于 OpenXML SDK (.NET)

```markdown
---
name: minimax-docx
description: >
  Professional DOCX document creation, editing, and formatting using OpenXML SDK (.NET).
  Three pipelines: (A) create new documents from scratch, (B) fill/edit content in existing
  documents, (C) apply template formatting with XSD validation gate-check.
  MUST use this skill whenever the user wants to produce, modify, or format a Word document.
version: 1.0.0
license: MIT
triggers:
  - Word
  - docx
  - document
  - 文档
  - Word文档
  - 报告
  - 合同
  - 公文
  - 排版
  - 套模板
---

# minimax-docx

Create, edit, and format DOCX documents via CLI tools or direct C# scripts built on OpenXML SDK (.NET).

## Setup

**First time:** `bash scripts/setup.sh`
**First operation in session:** `scripts/env_check.sh`

## Quick Start: Direct C# Path

```csharp
#r "nuget: DocumentFormat.OpenXml, 3.2.0"

using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

using var doc = WordprocessingDocument.Create("output.docx", WordprocessingDocumentType.Document);
var mainPart = doc.AddMainDocumentPart();
mainPart.Document = new Document(new Body());
// --- Your logic here ---
```

> Before writing any C#, read the relevant `Samples/*.cs` file FIRST.

## Pipeline routing

| Pipeline | Signals | Reference |
|----------|---------|-----------|
| A: CREATE | "write", "create", "draft", "generate", "new", "make a report" | `references/scenario_a_create.md` |
| B: FILL-EDIT | "fill in", "replace", "update", "change text", "edit" | `references/scenario_b_edit_content.md` |
| C: FORMAT-APPLY | "reformat", "apply template", "restyle", "套模板", "排版" | `references/scenario_c_apply_template.md` |

## Scenario A: Create

Read `references/scenario_a_create.md`, `references/typography_guide.md`, and `references/design_principles.md` first.
Pick an aesthetic recipe from `Samples/AestheticRecipeSamples.cs`.
For CJK, also read `references/cjk_typography.md`.

- **Simple**: use CLI — `$CLI create --type report --output out.docx --config content.json`
- **Structural**: write C# directly.

## Validation pipeline

```bash
$CLI merge-runs --input doc.docx
$CLI validate --input doc.docx --xsd assets/xsd/wml-subset.xsd
$CLI validate --input doc.docx --business
```

## Critical Rules (element ordering)

| Parent | Order |
|--------|-------|
| `w:p`  | `pPr` → runs |
| `w:r`  | `rPr` → `t`/`br`/`tab` |
| `w:tbl`| `tblPr` → `tblGrid` → `tr` |
| `w:tr` | `trPr` → `tc` |
| `w:tc` | `tcPr` → `p` (min 1 `<w:p/>`) |
| `w:body` | block content → `sectPr` (LAST child) |

- **Font size:** `w:sz` = points × 2 (12pt → sz="24")
- **Margins/spacing:** in DXA (1 inch = 1440, 1cm ≈ 567)
- **Heading styles MUST have OutlineLevel** for TOC/navigation
- **Direct format contamination:** strip inline rPr/pPr when copying content
- **Track changes:** `<w:del>` uses `<w:delText>`, `<w:ins>` uses `<w:t>`

## References

### Scenario guides
- `references/scenario_a_create.md`
- `references/scenario_b_edit_content.md`
- `references/scenario_c_apply_template.md`

### C# code samples (in `scripts/dotnet/MiniMaxAIDocx.Core/Samples/`)
- `DocumentCreationSamples.cs` — Document lifecycle
- `StyleSystemSamples.cs` — Styles: Normal/Heading chain, latentStyles, CJK 公文, APA 7th
- `CharacterFormattingSamples.cs` — RunProperties: fonts, size, bold/italic, color, etc.
- `ParagraphFormattingSamples.cs` — ParagraphProperties: justification, indentation, spacing, etc.
- `TableSamples.cs` — Tables: borders, grid, cell props, merge, three-line 三线表
- `HeaderFooterSamples.cs` — Headers/footers: page numbers, first/even/odd
- `ImageSamples.cs` — Images: inline, floating, text wrapping
- `ListAndNumberingSamples.cs` — Numbering: bullets, multi-level, Chinese 一/（一）/1.
- `FieldAndTocSamples.cs` — Fields: TOC, DATE/PAGE/REF/SEQ
- `FootnoteAndCommentSamples.cs` — Footnotes, endnotes, comments
- `TrackChangesSamples.cs` — Revisions: insertions, deletions
- `AestheticRecipeSamples.cs` — 13 aesthetic recipes: ModernCorporate, AcademicThesis, ExecutiveBrief, ChineseGovernment (GB/T 9704), etc.

### Markdown references
- `references/openxml_element_order.md`
- `references/openxml_units.md`
- `references/typography_guide.md`
- `references/cjk_typography.md`
- `references/design_principles.md`
- `references/design_good_bad_examples.md`
- `references/track_changes_guide.md`
- `references/troubleshooting.md`
```

---

## 3. ima-skills

**路径：** `skills/ima-skills/SKILL.md`
**版本：** 1.1.7
**描述：** 统一的 IMA OpenAPI 技能，支持笔记管理和知识库操作

```markdown
---
name: ima-skills
description: |
  统一的 IMA OpenAPI 技能，支持笔记管理和知识库操作。
  当用户提到知识库、资料库、笔记、备忘录、记事，或者想要上传文件、添加网页到知识库、
  搜索知识库内容、搜索/浏览/创建/编辑笔记时，使用此 skill。
  （即使用户没有明确说"知识库"或"笔记"，只要意图涉及文件上传到知识库、网页收藏、
  知识搜索、个人文档存取，也应触发此 skill）
version: 1.1.7
homepage: https://ima.qq.com
---

# ima-skill

Unified IMA OpenAPI skill. Currently supports: **notes**, **knowledge-base**.

## ⛔ MANDATORY RULES

1. **UTF-8 encoding (notes writes only):** Before calling `import_doc` or `append_doc`, ALL string fields MUST be validated as legal UTF-8.
2. **File upload naming:** `title` MUST equal `file_name` (with extension). Never rename.
3. **Unsupported file types:** Reject immediately. Do NOT ask user "do you still want to try?"
4. **File upload integrity:** Keep file content as-is during upload. No encoding conversion for binary files.
5. **PowerShell 5.1:** Detect version before first API call. Must use UTF-8 byte array mode.

## 模块决策表

| 用户意图 | 模块 | 读取 |
|---------|------|-----|
| 搜索笔记、浏览笔记本、获取笔记内容、创建笔记、追加内容 | notes | `notes/SKILL.md` |
| 上传文件、添加网页链接、搜索知识库、浏览知识库内容 | knowledge-base | `knowledge-base/SKILL.md` |
| 查看原文、分析原文、导出原文（需要 media_id） | knowledge-base | `knowledge-base/SKILL.md` |

## 易混淆场景

| 用户说的 | 实际意图 | 正确路由 |
|---------|---------|---------|
| "把这段内容添加到知识库XX里的笔记YY" | 往已有笔记追加内容 | **notes** — append_doc |
| "把这个写到XX笔记里"、"记到XX笔记" | 往已有笔记追加内容 | **notes** — append_doc |
| "把这篇笔记添加到知识库" | 将笔记关联到知识库 | **knowledge-base** — add_knowledge |
| "上传文件到知识库" | 上传文件到知识库 | **knowledge-base** |
| "新建一篇笔记记录这些内容" | 创建新笔记 | **notes** — import_doc |
| "帮我记一下"、"保存为笔记"（未指定已有笔记） | 意图不明确，需要确认 | **notes** — 先询问用户 |

## Credential Check

```
test -f ~/.config/ima/client_id && test -f ~/.config/ima/api_key
```

凭证获取：https://ima.qq.com/agent-interface

存储方式：
- 配置文件：`~/.config/ima/client_id` + `~/.config/ima/api_key`
- 环境变量：`IMA_OPENAPI_CLIENTID` + `IMA_OPENAPI_APIKEY`

## API 调用模板

所有请求统一为 HTTP POST + JSON Body，发往 `https://ima.qq.com`。

```bash
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
OPTS=$(printf '{"clientId":"%s","apiKey":"%s"}' "$IMA_OPENAPI_CLIENTID" "$IMA_OPENAPI_APIKEY")
resp=$(node "$SKILL_DIR/ima_api.cjs" "openapi/list_docs" '{"limit":10}' "$OPTS")
```

错误处理两层：
- 第一层 — 脚本执行错误（stderr）：-100 程序错误，-200 skill 需要更新
- 第二层 — 后端业务错误（stdout）：code≠0，将 msg 展示给用户

## SKILL Update

每天首次 API 调用自动检查一次更新。
主动触发：`export IMA_FORCE_UPDATE_CHECK=1`
```

---

## 4. ima-skills / notes

**路径：** `skills/ima-skills/notes/SKILL.md`
**API base path:** `openapi/note/v1`

```markdown
# Notes (笔记)

> ⛔ Before ANY write: validate ALL string fields are legal UTF-8.

通过 IMA OpenAPI 管理用户个人笔记，支持读取（搜索、列表、获取内容）和写入（新建、追加）。

## 接口决策表

| 用户意图 | 调用接口 | 关键参数 |
|---------|---------|---------|
| 搜索/查找笔记 | `search_note` | `query_info`（QueryInfo 对象） |
| 查看笔记本列表 | `list_notebook` | `cursor`(必填，首页传"0") + `limit`(必填) |
| 列出笔记 | `list_note` | `folder_id`(选填) + `sort_type` + `cursor`(首次传"") + `limit` |
| 读取笔记正文 | `get_doc_content` | `note_id` + `target_content_format`(必填，推荐0纯文本) |
| 新建一篇笔记 | `import_doc` | `content` + `content_format`(必填，固定1) + 可选 `folder_id` |
| 往已有笔记追加内容 | `append_doc` | `note_id` + `content` + `content_format`(必填，固定1) |

## 新建 vs. 追加行为规则

### 明确走新建的信号词
- "新建笔记"、"创建笔记"、"写一篇笔记"

### 明确走追加的信号词
- "追加到《XX》笔记里"、"在笔记末尾加上"

### 模糊场景 — 必须先询问用户
- "帮我记一下"、"记录一下"、"保存为笔记"、"存成笔记"
- "添加到笔记里"
→ 询问："您是想创建一篇新笔记，还是追加到某篇已有笔记？"

### 本地图片不支持
- 过滤本地图片路径（`file://`, `/Users/`, `C:\` 等）
- 保留网络图片（`http://` 或 `https://`）
- 告知用户哪些图片被过滤

## 枚举值

- `content_format`：0=纯文本，1=Markdown，2=JSON（写入仅支持1）
- `search_type`：0=标题检索，1=正文检索
- `sort_type`：0=更新时间，1=创建时间，2=标题
- `folder_type`：0=用户自建，1=全部笔记（根目录），2=未分类

## 分页

- 笔记本列表：游标分页，首次 cursor: "0"
- 笔记列表：游标分页，首次 cursor: ""
- 搜索：偏移量分页，start/end

## 错误处理

| 错误码 | 含义 | 建议处理 |
|--------|------|---------|
| 100001 | 参数错误 | 检查请求参数 |
| 100002 | 无效 ID | 检查凭证配置 |
| 100003 | 服务器内部错误 | 等待后重试 |
| 100005 | 无权限 | 确认操作的是用户自己的笔记 |
| 100006 | 笔记已删除 | 告知用户 |
| 100009 | 超过大小限制 | 拆分为多次 append_doc |
| 310001 | 笔记本不存在 | 检查 folder_id |
| 20002 | apiKey超过限频 | |
| 20004 | apikey 鉴权失败 | 检查凭证 |
```

---

## 5. ima-skills / knowledge-base

**路径：** `skills/ima-skills/knowledge-base/SKILL.md`
**API base path:** `openapi/wiki/v1`

```markdown
# Knowledge Base (知识库)

## 接口决策表

| 用户意图 | 调用接口 | 关键参数 |
|---------|---------|---------|
| 上传文件到知识库 | `check_repeated_names` → `create_media` → COS Upload → `add_knowledge` | `media_type`（按扩展名），`knowledge_base_id`，`file_name`，`file_size` |
| 上传文件到知识库的某个文件夹 | 先定位文件夹 → 同上（`folder_id` 传入目标文件夹 ID） | |
| 添加网页/微信文章到知识库 | `import_urls` | `urls`（1-10 个），`knowledge_base_id`，可选 `folder_id` |
| 添加笔记到知识库 | `add_knowledge` | `media_type=11`，`note_info.content_id=<note_id>` |
| 添加 URL（文件型）到知识库 | `check_repeated_names` → 下载文件 → 走"上传文件"流程 | |
| 检查文件名是否重复 | `check_repeated_names` | `params[].name`，`params[].media_type` |
| 获取知识库信息 | `get_knowledge_base` | `ids`（1-20 个） |
| 浏览知识库内容列表 | `get_knowledge_list` | `knowledge_base_id`，`cursor`，`limit`(1~50)，可选 `folder_id` |
| 在知识库中搜索 | `search_knowledge` | `query`，`knowledge_base_id`，`cursor` |
| 按关键词查找知识库 | `search_knowledge_base` | `query`，`cursor`，`limit`(1~20) |
| 查看自己有哪些知识库 | `search_knowledge_base`（`query` 传空字符串） | |
| 添加内容但未指定目标知识库 | `get_addable_knowledge_base_list` → 展示列表让用户选择 | |
| 查看原文、分析原文、导出原文 | `get_media_info` | `media_id` |

## ⛔ 文件上传安全门（仅适用于文件上传 → add_knowledge 流程）

GATE 1 [TYPE CHECK]: 先运行 preflight-check.cjs。pass=false → 立即拒绝。
GATE 2 [NAMING]: add_knowledge 的 title 必须等于 file_name（含扩展名）。
GATE 3 [DUPLICATES]: 所有文件上传前调用 check_repeated_names。
GATE 4 [UPLOAD EXIT]: cos-upload.cjs 非零退出 → 立即停止。

## 上传文件到知识库完整流程

1. preflight-check.cjs（GATE 1）
2. 提取 file_name, file_ext, file_size, media_type, content_type
3. check_repeated_names（GATE 3）
4. create_media
5. cos-upload.cjs（GATE 4）
6. add_knowledge（GATE 2: title = file_name）

## 文件夹操作

- 操作根目录时省略 `folder_id`
- 不要将 `knowledge_base_id` 作为 `folder_id`
- `get_knowledge_list` 返回的 `current_path` 是面包屑

## 响应处理

统一结构 `{ "code": 0, "msg": "...", "data": { ... } }`。
code=0 成功；code≠0 直接展示 msg 给用户。

## 用户体验规则

- 隐藏内部 ID：不暴露 knowledge_base_id、media_id、folder_id
- 精简进度：只报告关键步骤
- 格式化展示：知识库列表、内容列表、搜索结果各有专用格式
```

---

> **导出完成。** 以上五个 SKILL.md 文件构成法律合规审查员专家库的完整 skill 提示词体系。
