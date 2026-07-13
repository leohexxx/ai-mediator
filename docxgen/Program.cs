using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using WpPageSize = DocumentFormat.OpenXml.Wordprocessing.PageSize;

string outputPath = args.Length > 0 ? args[0] : "../合规审查报告.docx";
using var doc = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
var mainPart = doc.AddMainDocumentPart();
mainPart.Document = new Document(new Body());
var body = mainPart.Document.Body!;

// ═══════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════
var stylesPart = mainPart.AddNewPart<StyleDefinitionsPart>();
stylesPart.Styles = new Styles();
var styles = stylesPart.Styles;

styles.Append(new DocDefaults(
    new RunPropertiesDefault(
        new RunPropertiesBaseStyle(
            new RunFonts { Ascii = "Calibri", HighAnsi = "Calibri", EastAsia = "Microsoft YaHei", ComplexScript = "Calibri" },
            new FontSize { Val = "22" },
            new FontSizeComplexScript { Val = "22" },
            new Color { Val = "333333" },
            new Languages { Val = "en-US", EastAsia = "zh-CN" }
        )
    ),
    new ParagraphPropertiesDefault(
        new ParagraphPropertiesBaseStyle(
            new SpacingBetweenLines { Line = "276", LineRule = LineSpacingRuleValues.Auto, After = "120" }
        )
    )
));

static Style CreateParaStyle(string id, string name, bool isDefault, int priority)
{
    var s = new Style { Type = StyleValues.Paragraph, StyleId = id };
    s.Default = isDefault;
    s.Append(new StyleName { Val = name });
    if (isDefault) s.Append(new PrimaryStyle());
    s.Append(new StyleParagraphProperties(new SpacingBetweenLines { After = "120", Line = "276", LineRule = LineSpacingRuleValues.Auto }));
    return s;
}

static Style CreateHeading(int lvl, string font, string size, string color, bool bold)
{
    var s = new Style { Type = StyleValues.Paragraph, StyleId = $"Heading{lvl}" };
    s.Append(new StyleName { Val = $"heading {lvl}" });
    s.Append(new BasedOn { Val = "Normal" });
    s.Append(new NextParagraphStyle { Val = "Normal" });
    int before = lvl == 1 ? 480 : 360;
    s.Append(new StyleParagraphProperties(
        new KeepNext(), new KeepLines(),
        new SpacingBetweenLines { Before = before.ToString(), After = "200", Line = "240", LineRule = LineSpacingRuleValues.Auto },
        new OutlineLevel { Val = lvl - 1 }
    ));
    s.Append(new StyleRunProperties(
        new RunFonts { Ascii = font, HighAnsi = font, EastAsia = "Microsoft YaHei", ComplexScript = font },
        new FontSize { Val = size }, new FontSizeComplexScript { Val = size },
        new Color { Val = color },
        new Bold { Val = bold }
    ));
    return s;
}

styles.Append(CreateParaStyle("Normal", "Normal", true, 0));
styles.Append(CreateHeading(1, "Microsoft YaHei", "36", "C41E3A", true));
styles.Append(CreateHeading(2, "Microsoft YaHei", "28", "1A1A2E", true));
styles.Append(CreateHeading(3, "Microsoft YaHei", "24", "4A4A6A", true));

// ═══════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════
static Paragraph MakePara(string text, string styleId = "Normal", string? color = null, bool bold = false, string? fontSize = null)
{
    var p = new Paragraph(new ParagraphProperties(new ParagraphStyleId { Val = styleId }));
    var rp = new RunProperties();
    if (color != null) rp.Append(new Color { Val = color });
    if (bold) rp.Append(new Bold());
    if (fontSize != null) { rp.Append(new FontSize { Val = fontSize }); rp.Append(new FontSizeComplexScript { Val = fontSize }); }
    p.Append(new Run(rp, new Text(text) { Space = SpaceProcessingModeValues.Preserve }));
    return p;
}

static Paragraph MakeCentered(string text, string fontSize, string color, bool bold = false)
{
    var p = new Paragraph(new ParagraphProperties(
        new SpacingBetweenLines { Before = "0", After = "60" },
        new Justification { Val = JustificationValues.Center }
    ));
    var rp = new RunProperties(
        new FontSize { Val = fontSize }, new FontSizeComplexScript { Val = fontSize }, new Color { Val = color }
    );
    if (bold) rp.Append(new Bold());
    p.Append(new Run(rp, new Text(text) { Space = SpaceProcessingModeValues.Preserve }));
    return p;
}

static void AddLine(Body b, string color = "E2E8F0")
{
    b.Append(new Paragraph(new ParagraphProperties(
        new ParagraphBorders(new BottomBorder { Val = BorderValues.Single, Size = 6, Color = color, Space = 1 }),
        new SpacingBetweenLines { Before = "100", After = "200" }
    )));
}

static Table MakeTable(string[] headers, string[][] rows, int[] colWidths)
{
    var tbl = new Table();
    tbl.Append(new TableProperties(
        new TableWidth { Width = "5000", Type = TableWidthUnitValues.Pct },
        new TableBorders(
            new TopBorder { Val = BorderValues.Single, Size = 4, Color = "C0C0C0" },
            new BottomBorder { Val = BorderValues.Single, Size = 4, Color = "C0C0C0" },
            new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4, Color = "E0E0E0" }
        ),
        new TableCellMarginDefault(
            new TopMargin { Width = "60", Type = TableWidthUnitValues.Dxa },
            new StartMargin { Width = "100", Type = TableWidthUnitValues.Dxa },
            new BottomMargin { Width = "60", Type = TableWidthUnitValues.Dxa },
            new EndMargin { Width = "100", Type = TableWidthUnitValues.Dxa }
        )
    ));
    var grid = new TableGrid();
    foreach (var w in colWidths) grid.Append(new GridColumn { Width = w.ToString() });
    tbl.Append(grid);

    var hRow = new TableRow();
    foreach (var h in headers)
    {
        hRow.Append(new TableCell(
            new TableCellProperties(
                new Shading { Val = ShadingPatternValues.Clear, Fill = "F1F5F9" },
                new TableCellVerticalAlignment { Val = TableVerticalAlignmentValues.Center }
            ),
            new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "0", After = "0" }, new Justification { Val = JustificationValues.Center }),
            new Run(new RunProperties(new Bold(), new FontSize { Val = "20" }, new FontSizeComplexScript { Val = "20" }, new Color { Val = "1A1A2E" }),
            new Text(h) { Space = SpaceProcessingModeValues.Preserve }))
        ));
    }
    tbl.Append(hRow);

    foreach (var row in rows)
    {
        var dRow = new TableRow();
        foreach (var cell in row)
        {
            dRow.Append(new TableCell(
                new TableCellProperties(new TableCellVerticalAlignment { Val = TableVerticalAlignmentValues.Center }),
                new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "0", After = "0" }),
                new Run(new RunProperties(new FontSize { Val = "20" }, new FontSizeComplexScript { Val = "20" }),
                new Text(cell) { Space = SpaceProcessingModeValues.Preserve }))
            ));
        }
        tbl.Append(dRow);
    }
    return tbl;
}

static void AddRiskItem(Body b, string num, string title, string desc, string? codeRef, string citation)
{
    b.Append(MakePara($"#{num}  {title}", "Heading3", "C41E3A"));
    b.Append(MakePara(desc, "Normal", "555555"));
    if (!string.IsNullOrEmpty(codeRef))
    {
        var cp = new Paragraph(new ParagraphProperties(
            new SpacingBetweenLines { Before = "60", After = "60" },
            new Indentation { Left = "360" },
            new ParagraphBorders(new LeftBorder { Val = BorderValues.Single, Size = 12, Color = "94A3B8", Space = 8 })
        ));
        cp.Append(new Run(new RunProperties(
            new FontSize { Val = "18" }, new FontSizeComplexScript { Val = "18" },
            new Color { Val = "666666" }, new RunFonts { Ascii = "Consolas", HighAnsi = "Consolas" }
        ), new Text(codeRef) { Space = SpaceProcessingModeValues.Preserve }));
        b.Append(cp);
    }
    b.Append(MakePara(citation, "Normal", "1E40AF", fontSize: "18"));
    b.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "0", After = "80" })));
}

// ═══════════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════════
body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "3600", After = "0" })));
var titleP = new Paragraph(new ParagraphProperties(
    new SpacingBetweenLines { Before = "0", After = "200" },
    new Justification { Val = JustificationValues.Center }
));
titleP.Append(new Run(new RunProperties(
    new RunFonts { Ascii = "Microsoft YaHei", HighAnsi = "Microsoft YaHei", EastAsia = "Microsoft YaHei" },
    new FontSize { Val = "52" }, new FontSizeComplexScript { Val = "52" },
    new Color { Val = "C41E3A" }, new Bold()
), new Text("合规审查报告") { Space = SpaceProcessingModeValues.Preserve }));
body.Append(titleP);

body.Append(MakeCentered("AI 调解员", "28", "666666"));
body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "200", After = "100" })));
body.Append(MakeCentered("审查日期：2026年7月13日", "20", "888888"));
body.Append(MakeCentered("审查范围：Web 前端 · Node.js 后端 · 微信小程序 · 云函数", "20", "888888"));
body.Append(MakeCentered("适用法规：PIPL · DSL · CSL · 生成式AI管理办法 · 微信小程序平台规范", "20", "888888"));

// Page break
body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));

// ═══════════════════════════════════════════
// 一、合规评分摘要
// ═══════════════════════════════════════════
body.Append(MakePara("一、合规评分摘要", "Heading1"));
AddLine(body, "C41E3A");

body.Append(MakePara("合规评分：22 / 100 — 严重不合规", "Normal", "C41E3A", true, "28"));
body.Append(MakePara("项目当前处于早期开发阶段（MVP），在法律合规方面存在重大缺失。未建立任何隐私政策、用户协议或数据处理规范。核心功能涉及高度敏感的个人信息处理（微信聊天记录、人际关系、情绪分析），但在数据采集、存储、传输、AI处理等各环节均缺乏合规保障机制。", "Normal", "555555"));

void AddScoreLine(string label, string value, string color)
{
    var p = new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "0", After = "60" }));
    p.Append(new Run(new RunProperties(new FontSize { Val = "22" }, new FontSizeComplexScript { Val = "22" }, new Color { Val = "555555" }),
        new Text(label + "：") { Space = SpaceProcessingModeValues.Preserve }));
    p.Append(new Run(new RunProperties(new FontSize { Val = "28" }, new FontSizeComplexScript { Val = "28" }, new Color { Val = color }, new Bold()),
        new Text(value) { Space = SpaceProcessingModeValues.Preserve }));
    body.Append(p);
}

body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "200", After = "200" })));
AddScoreLine("严重风险 (P0)", "8 项", "C41E3A");
AddScoreLine("高风险 (P1)", "5 项", "9A3412");
AddScoreLine("中风险 (P2)", "4 项", "1E40AF");
AddScoreLine("适用法规框架", "6 个", "333333");

body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));

// ═══════════════════════════════════════════
// 二、适用法规框架
// ═══════════════════════════════════════════
body.Append(MakePara("二、适用法规框架", "Heading1"));
AddLine(body);

string[][] regs = {
    new[] { "《个人信息保护法》(PIPL)", "严重不合规", "处理微信聊天记录等敏感个人信息，缺少合法性基础、知情同意、用户权利保障" },
    new[] { "《数据安全法》(DSL)", "不合规", "缺乏数据分类分级、安全保护义务、风险评估报告制度" },
    new[] { "《网络安全法》(CSL)", "部分不合规", "缺少个人信息保护制度、网络运营者安全义务落实" },
    new[] { "《生成式人工智能服务管理暂行办法》", "严重不合规", "AI生成内容涉及人格评判，缺少算法备案、内容标识、投诉举报机制" },
    new[] { "《互联网信息服务深度合成管理规定》", "不合规", "涉及对自然人特征的分析判断，未进行安全评估" },
    new[] { "微信小程序平台运营规范", "不合规", "缺少隐私弹窗、数据收集声明；云开发环境存储敏感数据" }
};
body.Append(MakeTable(new[] { "法规框架", "合规状态", "主要问题" }, regs, new[] { 2500, 1200, 5300 }));

body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));

// ═══════════════════════════════════════════
// 三、严重风险 (P0)
// ═══════════════════════════════════════════
body.Append(MakePara("三、严重风险项 (P0)——需立即整改", "Heading1"));
AddLine(body, "C41E3A");
body.Append(MakePara("以下问题可能直接导致行政处罚、应用下架或法律诉讼，必须在产品上线前解决。", "Normal", "C41E3A"));

AddRiskItem(body, "1", "API 密钥硬编码暴露",
    "文件 server/.env 中包含有效的 DeepSeek API 密钥。虽然 .env 在 .gitignore 中，但存在被误提交或通过其他途径泄露的风险。密钥泄露可导致 API 资金被盗用、用户数据被第三方访问。",
    "server/.env → LLM_API_KEY=sk-23bd49439b4********（已暴露）",
    "⚠️ 建议立即轮换密钥并移除本地 .env 文件中的硬编码值。");

AddRiskItem(body, "2", "无隐私政策——违反 PIPL 第17条",
    "项目完全没有任何隐私政策文件。用户上传微信聊天截图、录屏、文本等包含大量敏感个人信息（对话内容、人际关系、情感状态、人格特征），但用户完全不知情数据将被如何处理。PIPL 第17条要求处理者在处理个人信息前，以显著方式、清晰易懂的语言告知处理目的、方式、种类、保存期限等。",
    null,
    "PIPL 第17条：个人信息处理者在处理个人信息前，应当以显著方式、清晰易懂的语言真实、准确、完整地向个人告知有关事项。PIPL 第66条：违反规定可处五千万元以下或上一年度营业额百分之五以下罚款。");

AddRiskItem(body, "3", "无用户协议/服务条款",
    "项目没有服务条款（Terms of Service）。用户在使用 AI 调解员给出人格判断、行为评价、关系建议等功能时，没有任何法律约定来限定服务性质（非法律意见、仅供参考等免责声明）。",
    null,
    "⚠️ AI 对用户的对错判断可能被误解为专业法律/心理意见，产生法律责任风险。");

AddRiskItem(body, "4", "第三方 AI 服务数据传输无告知——违反 PIPL 第23条",
    "用户的聊天记录（含个人身份、关系、情感等敏感信息）被完整发送至第三方 AI 服务商（DeepSeek / OpenAI / Anthropic）进行处理。依据 PIPL 第23条，向第三方提供个人信息需告知接收方信息并获得单独同意。当前代码直接将用户聊天原文作为 LLM prompt 发送，无任何脱敏处理。",
    "server/src/services/llm.ts:158 → userPrompt 包含完整聊天记录原文\nserver/src/prompts/analysisPrompt.ts → buildAnalysisUserPrompt 未做数据脱敏",
    "PIPL 第23条：向第三方提供个人信息需告知接收方信息并取得单独同意。PIPL 第39条：向境外提供需取得单独同意。");

AddRiskItem(body, "5", "缺少数据处理合法性基础——违反 PIPL 第13条",
    "PIPL 第13条要求个人信息处理必须具有合法性基础（如取得同意、履行合同所必需等）。项目未建立任何同意机制（如隐私弹窗、勾选框），也未明确处理的法律基础。",
    null,
    "PIPL 第13条：处理个人信息应取得个人同意（或满足其他法定情形）。");

AddRiskItem(body, "6", "敏感个人信息处理无单独同意——违反 PIPL 第29条",
    "聊天记录中包含大量敏感个人信息：人际关系、情感状态、MBTI性格类型、冲突细节等。PIPL 将特定身份、医疗健康、金融账户等列为敏感个人信息，处理需取得单独同意且具有特定目的和充分必要性。此外，项目还收集微信用户的 openid、昵称、头像等信息。",
    null,
    "PIPL 第28-29条：敏感个人信息的处理需单独同意、告知必要性及对个人权益的影响。");

AddRiskItem(body, "7", "生成式 AI 服务违规——违反《生成式人工智能服务管理暂行办法》",
    "应用核心功能是 AI 判断谁对谁错，属于对人格和行为的评判。根据《生成式人工智能服务管理暂行办法》：① 未进行算法备案（第17条）② AI 生成内容未进行标识（第12条）③ 未建立投诉举报机制（第15条）④ 未对生成内容进行合规审查 ⑤ 涉及舆论属性或社会动员能力，需进行安全评估。",
    null,
    "《生成式人工智能服务管理暂行办法》第17条：提供具有舆论属性或者社会动员能力的生成式人工智能服务的，应当开展安全评估，并履行算法备案手续。");

AddRiskItem(body, "8", "数据存储安全严重不足",
    "Web 端：聊天记录存储在浏览器 IndexedDB 中，无任何加密措施。服务端（Express）：所有案例数据存储在内存 Map 中，无访问控制。小程序端：openid 存储在 wx.StorageSync 中；聊天记录存储在腾讯云 CloudBase 数据库中，未配置字段级加密。文件上传：multer 将截图/录屏存储到磁盘 server/uploads/，无访问控制、无定期清理。",
    "src/utils/storage.ts → IndexedDB 明文存储\nserver/src/routes/cases.ts → new Map<string, Case>()\nminiprogram/app.js → wx.setStorageSync('openid', ...)",
    "PIPL 第51条：应采取加密、去标识化等安全措施保护个人信息。DSL 第27条：开展数据处理活动应加强风险监测。");

body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));

// ═══════════════════════════════════════════
// 四、高风险 (P1)
// ═══════════════════════════════════════════
body.Append(MakePara("四、高风险项 (P1)——需在30天内整改", "Heading1"));
AddLine(body, "9A3412");

string[][] p1Items = {
    new[] { "9", "跨境数据传输合规", "OpenAI/Anthropic 服务器位于境外，切换提供商时用户数据跨境传输违反 PIPL 第38-40条" },
    new[] { "10", "用户权利响应缺失", "无数据查看、更正、删除、导出功能，违反 PIPL 第45-47条" },
    new[] { "11", "未成年人信息保护缺失", "无年龄验证机制，违反 PIPL 第31条" },
    new[] { "12", "数据安全应急预案缺失", "无安全事件响应流程，违反 PIPL 第57条" },
    new[] { "13", "小程序隐私合规缺失", "缺少隐私弹窗和接口声明，违反微信小程序平台规范" }
};
body.Append(MakeTable(new[] { "#", "风险项", "核心问题" }, p1Items, new[] { 500, 2000, 6500 }));

body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "400" })));

// ═══════════════════════════════════════════
// 五、中风险 (P2)
// ═══════════════════════════════════════════
body.Append(MakePara("五、中风险项 (P2)——需在90天内整改", "Heading1"));
AddLine(body, "1E40AF");

string[][] p2Items = {
    new[] { "14", "CORS 配置过度开放", "app.use(cors()) 允许所有源，可能导致 CSRF 攻击" },
    new[] { "15", "前端 OCR 隐私考量", "Tesseract.js 本地处理虽好，但需在隐私政策中明确说明" },
    new[] { "16", "合规审计追踪缺失", "无日志和审计追踪，无法在监管审查时提供证据" },
    new[] { "17", "AI 结果透明度不足", "用户无法充分理解 AI 判断依据和局限性" }
};
body.Append(MakeTable(new[] { "#", "风险项", "核心问题" }, p2Items, new[] { 500, 2000, 6500 }));

body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));

// ═══════════════════════════════════════════
// 六、风险总览表
// ═══════════════════════════════════════════
body.Append(MakePara("六、风险总览表", "Heading1"));
AddLine(body);

string[][] allRisks = {
    new[] { "1", "API密钥暴露", "P0", "PIPL/安全基线", "资金损失、数据泄露" },
    new[] { "2", "无隐私政策", "P0", "PIPL 第17条", "罚款最高5000万元或营收5%" },
    new[] { "3", "无用户协议", "P0", "合同法/消保法", "法律纠纷、责任不清" },
    new[] { "4", "第三方AI数据传输无告知", "P0", "PIPL 第23条", "行政处罚、民事赔偿" },
    new[] { "5", "缺少数据处理合法性基础", "P0", "PIPL 第13条", "数据处理被认定违法" },
    new[] { "6", "敏感信息无单独同意", "P0", "PIPL 第29条", "加重处罚" },
    new[] { "7", "生成式AI服务违规", "P0", "AI管理办法", "暂停服务、下架" },
    new[] { "8", "数据存储安全不足", "P0", "PIPL/DSL", "数据泄露、监管处罚" },
    new[] { "9", "跨境数据传输合规", "P1", "PIPL 第38-40条", "限制跨境传输" },
    new[] { "10", "用户权利响应缺失", "P1", "PIPL 第45-47条", "用户投诉、监管介入" },
    new[] { "11", "未成年人信息保护缺失", "P1", "PIPL 第31条", "加重处罚情节" },
    new[] { "12", "数据安全应急预案缺失", "P1", "PIPL 第57条", "通报延迟加重责任" },
    new[] { "13", "小程序隐私合规缺失", "P1", "微信平台规范", "审核不通过、下架" },
    new[] { "14", "CORS配置过度开放", "P2", "安全基线", "CSRF攻击风险" },
    new[] { "15", "OCR隐私考量", "P2", "透明度要求", "用户信任降低" },
    new[] { "16", "合规审计追踪缺失", "P2", "PIPL 第69条", "举证困难" },
    new[] { "17", "AI结果透明度不足", "P2", "AI管理办法", "用户投诉" }
};
body.Append(MakeTable(new[] { "#", "风险项", "等级", "法规依据", "潜在后果" }, allRisks, new[] { 400, 2000, 600, 1800, 2200 }));

body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));

// ═══════════════════════════════════════════
// 七、整改路线图
// ═══════════════════════════════════════════
body.Append(MakePara("七、整改实施路线图", "Heading1"));
AddLine(body);

body.Append(MakePara("Phase 1 — 紧急整改（7天内）", "Heading2", "C41E3A"));
string[][] phase1 = {
    new[] { "1", "立即轮换暴露的 API 密钥，使用环境变量或密钥管理服务", "后端开发", "#1" },
    new[] { "2", "将 server/.env 从项目目录移除，改用 .env.example", "后端开发", "#1" },
    new[] { "3", "限制 CORS 为具体允许的域名", "后端开发", "#14" },
    new[] { "4", "初步编写隐私政策草案（数据收集种类、目的、第三方共享）", "法务/产品", "#2" },
    new[] { "5", "编写服务条款草案（含AI分析免责声明、非法律建议声明）", "法务/产品", "#3" },
    new[] { "6", "确认当前 LLM_PROVIDER 仅使用境内服务（DeepSeek），禁止配置为 OpenAI/Anthropic", "后端开发", "#9" }
};
body.Append(MakeTable(new[] { "#", "行动项", "负责人", "对应风险" }, phase1, new[] { 400, 4800, 1500, 1300 }));

body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "200" })));
body.Append(MakePara("Phase 2 — 短期整改（30天内）", "Heading2", "9A3412"));
string[][] phase2 = {
    new[] { "7", "实现用户知情同意机制（首次使用弹窗 + 勾选框）", "前端开发", "#5, #6" },
    new[] { "8", "第三方 AI 数据共享告知（明确列出使用的 AI 服务商）", "前端+法务", "#4" },
    new[] { "9", "小程序隐私弹窗（符合微信平台规范）", "小程序开发", "#13" },
    new[] { "10", "数据加密存储（IndexedDB 加密 + 数据库字段加密）", "全栈开发", "#8" },
    new[] { "11", "实现用户数据删除功能（前端 + 服务端 + AI服务商数据清理请求）", "全栈开发", "#10" },
    new[] { "12", "建立数据留存策略（定期自动清理超过7天的数据）", "后端开发", "#8, #10" },
    new[] { "13", "添加年龄验证机制（至少询问是否满14周岁）", "前端开发", "#11" },
    new[] { "14", "AI 生成内容添加标识（本分析由AI生成，仅供参考）", "前端+后端", "#7, #17" }
};
body.Append(MakeTable(new[] { "#", "行动项", "负责人", "对应风险" }, phase2, new[] { 400, 4800, 1500, 1300 }));

body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "200" })));
body.Append(MakePara("Phase 3 — 中期完善（90天内）", "Heading2", "1E40AF"));
string[][] phase3 = {
    new[] { "15", "数据安全应急预案制定与演练", "安全/运维", "#12" },
    new[] { "16", "建立合规审计日志系统", "后端开发", "#16" },
    new[] { "17", "个人信息保护影响评估（DPIA）", "法务", "#5, #6, #9" },
    new[] { "18", "算法备案（如适用）", "法务/技术", "#7" },
    new[] { "19", "建立投诉举报处理机制", "运营/法务", "#7" },
    new[] { "20", "数据脱敏机制（发送至AI前去除直接标识符）", "后端开发", "#4" },
    new[] { "21", "用户数据导出功能（PIPL 数据可携带权）", "全栈开发", "#10" }
};
body.Append(MakeTable(new[] { "#", "行动项", "负责人", "对应风险" }, phase3, new[] { 400, 4800, 1500, 1300 }));

body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));

// ═══════════════════════════════════════════
// 八、审查结论
// ═══════════════════════════════════════════
body.Append(MakePara("八、审查结论", "Heading1"));
AddLine(body, "C41E3A");

body.Append(MakePara("不建议在当前状态下公开发布或上线运营", "Normal", "C41E3A", true, "28"));
body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "100", After = "200" })));

body.Append(MakePara("AI 调解员是一个具有创新性的产品，但在法律合规方面存在根本性缺陷。考虑到应用处理的聊天记录包含大量敏感个人信息，且核心功能涉及 AI 对人格的评判，一旦上线将面临严重的法律风险。"));
body.Append(new Paragraph());
body.Append(MakePara("核心问题在于：项目在 MVP 阶段完全忽略了法律合规的并行建设。隐私政策、用户协议、数据安全措施等不是在功能开发完成后再补的，而应当是产品设计的出发点（Privacy by Design）。"));
body.Append(new Paragraph());
body.Append(MakePara("最低上线标准：至少完成 Phase 1 全部项目和 Phase 2 中 #7-#14 项目，确保有基本的隐私政策、用户协议、同意机制和数据安全措施。"));

body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "600" })));
AddLine(body);

body.Append(MakeCentered("法律合规审查员  |  审查日期：2026年7月13日", "20", "888888"));
body.Append(MakeCentered("审查范围：D:\\4.开发工具\\code\\app （完整项目代码库）", "20", "888888"));
body.Append(MakeCentered("审查状态：严重不合规——建议暂停公开发布", "20", "C41E3A", true));
body.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "200" })));
body.Append(MakeCentered("声明：本报告基于对代码库的自动化分析，不构成正式法律意见。", "18", "AAAAAA"));
body.Append(MakeCentered("对于重大合规决策，建议咨询持牌专业律师。", "18", "AAAAAA"));

// ═══════════════════════════════════════════
// Page setup (MUST be last child of body)
// ═══════════════════════════════════════════
body.Append(new SectionProperties(
    new WpPageSize { Width = 11906U, Height = 16838U },
    new PageMargin {
        Top = 1440, Right = 1440U, Bottom = 1440, Left = 1440U,
        Header = 720U, Footer = 720U, Gutter = 0U
    }
));

mainPart.Document.Save();
Console.WriteLine($"Report generated successfully: {System.IO.Path.GetFullPath(outputPath)}");
