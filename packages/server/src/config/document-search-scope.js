/**
 * 填报说明搜索范围：节点正文 + 文档代号/标题
 */

/** 参与全文搜索的 node_kind（不含 doc_title，标题在 documents 表单独匹配） */
export const SEARCHABLE_NODE_KINDS = ['part', 'body', 'general_item', 'section', 'indicator'];

export const NODE_KIND_LABELS = {
  part: '部分',
  general_item: '条目',
  section: '分节',
  indicator: '指标',
  body: '正文',
  doc_title: '标题',
  document_code: '代号',
  document_title: '标题',
};
