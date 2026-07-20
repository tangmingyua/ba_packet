import {
  Callout,
  H1,
  H2,
  Row,
  Stack,
  Text,
  TextInput,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

const SUGGEST_ITEMS = [
  { name: "贷款金额", table: "贷款协议补充信息", source: "一表通" },
  { name: "贷款协议ID", table: "贷款协议补充信息", source: "一表通" },
  { name: "贷款状态", table: "贷款借据", source: "一表通" },
  { name: "协议金额", table: "6.8 担保协议", source: "一表通制度问答" },
  { name: "贷款本金", table: "8.1 贷款借据", source: "一表通制度问答" },
];

const FAQ_BLOCKS = [
  {
    blockKey: "6.8",
    tableNo: "6.8",
    tableName: "担保协议",
    rows: [
      {
        itemName: "协议金额",
        questionDesc:
          "当年已结清或核销的数据，协议金额为0，不满足「协议金额非空时大于0」的强校验规则。",
        solution: "建议明确已结清/核销数据的协议金额填报规则，或修改检核规则。",
        feedback: "（待总局反馈）",
        org: "福建海峡银行",
        proposer: "马志洪",
        feedbackBy: "",
      },
      {
        itemName: "客户ID",
        questionDesc: "担保协议中客户ID的填报口径与主表不一致时应如何处理？",
        solution: "建议与主表客户ID保持一致，取最新有效客户编号。",
        feedback: "同意机构建议，按主表客户ID规则填报。",
        org: "华夏银行",
        proposer: "谢慧欣",
        feedbackBy: "总局张老师",
      },
    ],
  },
  {
    blockKey: "8.1",
    tableNo: "8.1",
    tableName: "贷款借据",
    rows: [
      {
        itemName: "贷款本金",
        questionDesc: "贷款核销后本金余额是否继续报送？",
        solution: "核销后本金余额填报为0。",
        feedback: "按填报说明执行。",
        org: "工商银行",
        proposer: "李某",
        feedbackBy: "总局王老师",
      },
    ],
  },
];

type CellTone = "label" | "header" | "body-even" | "body-odd";

function Cell({
  children,
  tone,
  align = "left",
  colSpan,
  style,
}: {
  children?: unknown;
  tone: CellTone;
  align?: "left" | "center";
  colSpan?: number;
  style?: { [key: string]: string | number | undefined };
}) {
  const t = useHostTheme();
  const isTitle = tone === "label" || tone === "header";
  const bg =
    tone === "label" || tone === "header"
      ? t.fill.secondary
      : tone === "body-even"
        ? t.bg.editor
        : t.fill.tertiary;

  return (
    <div
      style={{
        background: bg,
        padding: "10px 12px",
        minHeight: 40,
        display: "flex",
        alignItems: align === "center" ? "center" : "flex-start",
        justifyContent: align === "center" ? "center" : "flex-start",
        borderRight: `1px solid ${t.stroke.secondary}`,
        borderBottom: `1px solid ${t.stroke.secondary}`,
        boxSizing: "border-box",
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        lineHeight: "18px",
        ...style,
      }}
    >
      {typeof children === "string" ? (
        <Text size={isTitle ? "body" : "small"} weight={isTitle ? "bold" : "normal"}>
          {children}
        </Text>
      ) : (
        children
      )}
    </div>
  );
}

/** Excel 列组展开控件：窄条、贴末列右边框 */
function ColGroupToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useHostTheme();
  return (
    <button
      type="button"
      title={expanded ? "隐藏填报机构、提出人、反馈人" : "显示填报机构、提出人、反馈人"}
      onClick={onToggle}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 40,
        padding: 0,
        border: "none",
        borderRight: `1px solid ${t.stroke.secondary}`,
        borderBottom: `1px solid ${t.stroke.secondary}`,
        background: t.fill.secondary,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: t.text.tertiary,
        fontSize: 11,
        fontFamily: "inherit",
      }}
    >
      {expanded ? "«" : "»"}
    </button>
  );
}

function SuggestDropdown() {
  const t = useHostTheme();
  return (
    <div
      style={{
        border: `1px solid ${t.stroke.secondary}`,
        borderRadius: 6,
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      {SUGGEST_ITEMS.map((item, i) => (
        <div
          key={`${item.source}-${item.name}`}
          style={{
            padding: "8px 12px",
            borderBottom: i < SUGGEST_ITEMS.length - 1 ? `1px solid ${t.stroke.tertiary}` : "none",
            background: i === 0 ? t.fill.tertiary : t.bg.editor,
          }}
        >
          <Text size="small" weight="medium">
            {item.name}
          </Text>
          <Text size="small" tone="secondary">
            表名：{item.table} · {item.source}
          </Text>
        </div>
      ))}
    </div>
  );
}

function FaqResultBlock({
  block,
  expanded,
  onToggle,
}: {
  block: (typeof FAQ_BLOCKS)[0];
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useHostTheme();
  const splitBorder = `2px solid ${t.stroke.primary}`;
  const dataCols = expanded
    ? "minmax(88px,0.9fr) minmax(140px,1.4fr) minmax(120px,1.2fr) minmax(100px,1fr) minmax(80px,0.8fr) minmax(64px,0.7fr) minmax(64px,0.7fr) 18px"
    : "minmax(96px,0.95fr) minmax(160px,1.5fr) minmax(140px,1.35fr) minmax(120px,1.15fr) 18px";

  return (
    <div
      style={{
        border: `1px solid ${t.stroke.primary}`,
        borderRadius: 6,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "96px 1fr 96px 1fr" }}>
        <Cell tone="label" align="center">
          主表号
        </Cell>
        <Cell tone="body-even">{block.tableNo}</Cell>
        <Cell tone="label" align="center">
          主表名
        </Cell>
        <Cell tone="body-even" style={{ borderRight: "none" }}>
          {block.tableName}
        </Cell>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: dataCols }}>
        <Cell tone="header" align="center">
          数据项名称
        </Cell>
        <Cell tone="header" align="center">
          具体问题描述
        </Cell>
        <Cell tone="header" align="center">
          解决方案或建议
        </Cell>
        <Cell tone="header" align="center">
          反馈意见（总局）
        </Cell>
        {expanded && (
          <>
            <Cell tone="header" align="center">
              填报机构
            </Cell>
            <Cell tone="header" align="center">
              提出人
            </Cell>
            <Cell tone="header" align="center">
              反馈人
            </Cell>
          </>
        )}
        <ColGroupToggle expanded={expanded} onToggle={onToggle} />

        {block.rows.map((row, i) => {
          const tone: CellTone = i % 2 === 0 ? "body-even" : "body-odd";
          const lastStyle = i === block.rows.length - 1 ? { borderBottom: "none" } : {};
          return (
            <div key={row.itemName} style={{ display: "contents" }}>
              <Cell tone={tone} style={lastStyle}>
                {row.itemName}
              </Cell>
              <Cell tone={tone} style={lastStyle}>
                {row.questionDesc}
              </Cell>
              <Cell tone={tone} style={lastStyle}>
                {row.solution}
              </Cell>
              <Cell tone={tone} style={lastStyle}>
                {row.feedback}
              </Cell>
              {expanded && (
                <>
                  <Cell tone={tone} style={lastStyle}>
                    {row.org}
                  </Cell>
                  <Cell tone={tone} style={lastStyle}>
                    {row.proposer}
                  </Cell>
                  <Cell tone={tone} style={lastStyle}>
                    {row.feedbackBy || "—"}
                  </Cell>
                </>
              )}
              <div
                style={{
                  borderBottom: i === block.rows.length - 1 ? "none" : `1px solid ${t.stroke.secondary}`,
                  background: tone === "body-even" ? t.bg.editor : t.fill.tertiary,
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: splitBorder, padding: "6px 12px", background: t.bg.chrome }}>
        <Text size="small" tone="tertiary">
          点击末列 » 展开人员信息（每块独立，类 Excel 隐藏列）
        </Text>
      </div>
    </div>
  );
}

function YbtTabPlaceholder() {
  const t = useHostTheme();
  return (
    <div
      style={{
        border: `1px dashed ${t.stroke.secondary}`,
        borderRadius: 6,
        padding: 24,
        textAlign: "center",
      }}
    >
      <Text tone="secondary">一表通标签页 — 沿用现有查询结果布局（未改动）</Text>
    </div>
  );
}

export default function RegulatorySearchFaqWireframe() {
  const t = useHostTheme();
  const [activeTab, setActiveTab] = useCanvasState<"ybt" | "faq">("faq-wireframe-tab", "faq");
  const [expandedKeys, setExpandedKeys] = useCanvasState<string[]>("faq-expanded-blocks", []);

  function toggleBlock(key: string) {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>查询页 — 制度问答搜索（已确认）</H1>
        <Text tone="secondary">
          混合联想 · 一表通在前 · 按主表号分块 · 每块独立展开人员列
        </Text>
      </Stack>

      <Callout tone="info" title="已确认方案">
        <Stack gap={4}>
          <Text size="small">主表号为空 → 未分类 · 联想混合排序 · 标签一表通在前</Text>
          <Text size="small">块头：主表号 + 主表名 · 人员列：每块末列 » 切换（非大按钮）</Text>
        </Stack>
      </Callout>

      <Stack
        gap={0}
        style={{ border: `1px dashed ${t.stroke.secondary}`, borderRadius: 6, overflow: "hidden" }}
      >
        <Row style={{ padding: "4px 10px", background: t.bg.chrome, borderBottom: `1px solid ${t.stroke.tertiary}` }}>
          <Text size="small" tone="tertiary">
            搜索「贷款」— 联想 + 双标签结果
          </Text>
        </Row>

        <Stack gap={0} style={{ padding: 16 }}>
          <Row gap={8} align="center" style={{ marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <TextInput value="贷款" placeholder="输入数据项名称关键词..." />
            </div>
            <div
              style={{
                padding: "8px 16px",
                background: t.accent.primary,
                color: "#fff",
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              搜索
            </div>
          </Row>
          <SuggestDropdown />

          <Row
            gap={0}
            style={{ marginTop: 16, borderBottom: `1px solid ${t.stroke.secondary}` }}
          >
            {[
              { id: "ybt" as const, label: "一表通(58)" },
              { id: "faq" as const, label: "一表通制度问答(12)" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  background: "transparent",
                  borderBottom:
                    activeTab === tab.id
                      ? `2px solid ${t.accent.primary}`
                      : "2px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                }}
              >
                <Text
                  size="small"
                  weight={activeTab === tab.id ? "bold" : "normal"}
                  style={{ color: activeTab === tab.id ? t.accent.primary : t.text.secondary }}
                >
                  {tab.label}
                </Text>
              </button>
            ))}
          </Row>

          {activeTab === "ybt" ? (
            <div style={{ marginTop: 16 }}>
              <YbtTabPlaceholder />
            </div>
          ) : (
            <Stack gap={12} style={{ marginTop: 16 }}>
              <Text size="small" tone="secondary">
                关键词「贷款」· 耗时 42ms
              </Text>
              {FAQ_BLOCKS.map((block) => (
                <div key={block.blockKey}>
                  <FaqResultBlock
                    block={block}
                    expanded={expandedKeys.includes(block.blockKey)}
                    onToggle={() => toggleBlock(block.blockKey)}
                  />
                </div>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>

      <Stack gap={8}>
        <H2>列展开说明</H2>
        <Text size="small">默认 4 列 + 末列 18px 控件列；点击 » 展开填报机构、提出人、反馈人</Text>
        <Text size="small">每个主表块各自记忆展开状态，互不影响</Text>
      </Stack>
    </Stack>
  );
}
