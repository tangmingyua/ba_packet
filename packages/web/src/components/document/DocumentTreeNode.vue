<template>
  <li v-if="visible" ref="nodeRef" class="doc-tree-node" :class="nodeClass" :data-node-id="node.id">
    <div class="doc-tree-row" :style="{ paddingLeft: `${indent}px` }">
      <button
        v-if="collapsible"
        type="button"
        class="doc-tree-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? '▼' : '▶' }}
      </button>
      <span v-else class="doc-tree-toggle placeholder" aria-hidden="true"></span>

      <span
        v-if="node.nodeKind === 'indicator' && (node.indicatorKey || node.indicatorNo != null)"
        class="doc-indicator-no"
      >
        #{{ node.indicatorKey ?? node.indicatorNo }}
      </span>
      <span v-if="showKindBadge" class="doc-kind-badge">{{ kindLabel }}</span>
      <span v-if="leafPartBody" class="doc-tree-text leaf-part">
        <span class="leaf-part-title">{{ leafPartTitle }}</span>
        <span class="leaf-part-body">{{ leafPartBody }}</span>
      </span>
      <span v-else-if="node.nodeKind !== 'table'" class="doc-tree-text">{{ node.text }}</span>
      <span v-else class="doc-tree-text doc-tree-table-title">{{ node.text }}</span>
    </div>

    <div
      v-if="node.nodeKind === 'table' && tableRows.length && (collapsible ? expanded : true)"
      class="doc-word-table-wrap"
      :style="{ paddingLeft: `${indent + 24}px` }"
    >
      <table class="doc-word-table">
        <tbody>
          <tr v-for="(row, ri) in tableRows" :key="ri">
            <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ul v-if="collapsible ? expanded && hasChildren : hasChildren" class="doc-tree-children">
      <DocumentTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :highlight-indicator-key="highlightIndicatorKey"
        :highlight-node-id="highlightNodeId"
      />
    </ul>
  </li>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import {
  indicatorNodeMatches,
  subtreeHasIndicatorMatch,
} from '../../utils/documentIndicator.js';

defineOptions({ name: 'DocumentTreeNode' });

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  highlightIndicatorKey: { type: String, default: '' },
  highlightNodeId: { type: Number, default: null },
});

const COLLAPSIBLE = new Set(['part', 'section', 'heading', 'table']);
const KIND_LABELS = {
  part: '部分',
  general_item: '条目',
  section: '分节',
  indicator: '指标',
  body: '正文',
  heading: '标题',
  paragraph: '段落',
  placeholder: '表样',
  table: '表格',
};

const collapsible = computed(() => COLLAPSIBLE.has(props.node.nodeKind));
const hasChildren = computed(() => (props.node.children?.length ?? 0) > 0);
const leafPartSplit = computed(() => {
  if (props.node.nodeKind !== 'part' || hasChildren.value) return null;
  const raw = String(props.node.text || '');
  const nl = raw.indexOf('\n');
  if (nl < 0) return null;
  return { title: raw.slice(0, nl), body: raw.slice(nl + 1) };
});
const leafPartTitle = computed(() => leafPartSplit.value?.title || '');
const leafPartBody = computed(() => leafPartSplit.value?.body || '');
const indent = computed(() => Math.min(props.depth * 16, 96));
const kindLabel = computed(() => KIND_LABELS[props.node.nodeKind] || props.node.nodeKind);
const showKindBadge = computed(() =>
  ['part', 'section', 'indicator', 'heading', 'placeholder', 'table'].includes(props.node.nodeKind)
);

const tableRows = computed(() => {
  const rows = props.node.tableRows;
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row) => (Array.isArray(row) ? row : [String(row ?? '')]));
});

const nodeRef = ref(null);

const resolvedHighlightNodeId = computed(() => {
  const id = Number(props.highlightNodeId);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const isMatchTarget = computed(
  () =>
    (resolvedHighlightNodeId.value != null && props.node.id === resolvedHighlightNodeId.value) ||
    indicatorNodeMatches(props.node, props.highlightIndicatorKey)
);

const expanded = ref(
  subtreeHasIndicatorMatch(
    props.node,
    props.highlightIndicatorKey,
    resolvedHighlightNodeId.value ?? props.highlightNodeId
  ) || defaultExpanded(props.node)
);

const visible = computed(() => props.node.nodeKind !== 'doc_title');

const highlighted = computed(() => isMatchTarget.value);

const nodeClass = computed(() => [
  `kind-${props.node.nodeKind}`,
  { highlighted: highlighted.value, collapsible: collapsible.value },
]);

watch(
  () => [props.highlightIndicatorKey, props.highlightNodeId],
  ([key, nodeId]) => {
    const resolvedNodeId =
      nodeId != null && Number.isFinite(Number(nodeId)) ? Number(nodeId) : null;
    if ((key || resolvedNodeId != null) && subtreeHasIndicatorMatch(props.node, key, resolvedNodeId)) {
      expanded.value = true;
    }
  },
  { immediate: true }
);

function defaultExpanded(node) {
  if (node.nodeKind === 'part') return node.sortOrder === 1;
  if (node.nodeKind === 'section') return false;
  if (node.nodeKind === 'heading') return true;
  if (node.nodeKind === 'table') return true;
  return true;
}
</script>

<style scoped>
.doc-tree-node {
  list-style: none;
}

.doc-tree-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 8px 4px 0;
  line-height: 1.55;
  font-size: 13px;
  border-radius: var(--radius-sm);
}

.doc-tree-row:hover {
  background: var(--bg-hover);
}

.doc-tree-toggle {
  flex-shrink: 0;
  width: 18px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  line-height: 22px;
}

.doc-tree-toggle.placeholder {
  display: inline-block;
  cursor: default;
}

.doc-indicator-no {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 4px;
  padding: 0 6px;
  line-height: 20px;
}

.doc-kind-badge {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 5px;
  line-height: 18px;
}

.doc-tree-text {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.doc-tree-children {
  margin: 0;
  padding: 0;
}

.kind-part > .doc-tree-row .doc-tree-text {
  font-weight: 600;
}

.kind-part > .doc-tree-row .doc-tree-text.leaf-part {
  font-weight: 400;
}

.kind-part > .doc-tree-row .leaf-part-title {
  font-weight: 600;
  display: block;
}

.kind-part > .doc-tree-row .leaf-part-body {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.kind-section > .doc-tree-row .doc-tree-text {
  font-weight: 600;
  color: var(--text-secondary);
}

.kind-indicator > .doc-tree-row .doc-tree-text {
  font-weight: 600;
}

.kind-placeholder > .doc-tree-row .doc-tree-text {
  color: var(--text-muted);
  font-style: italic;
}

.doc-tree-table-title {
  font-weight: 500;
}

.doc-word-table-wrap {
  margin: 4px 8px 10px 0;
  max-width: 100%;
  overflow: auto;
}

.doc-word-table {
  border-collapse: collapse;
  font-size: 12px;
  width: max-content;
  max-width: 100%;
  background: #fff;
}

.doc-word-table td {
  border: 1px solid var(--border);
  padding: 4px 8px;
  vertical-align: top;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  min-width: 48px;
  max-width: 280px;
}

.kind-table > .doc-tree-row .doc-tree-text {
  color: var(--text);
}

.kind-body > .doc-tree-row .doc-tree-text {
  color: var(--text-secondary);
}

.doc-tree-node.highlighted > .doc-tree-row {
  background: #fef9c3;
  outline: 1px solid #fde047;
}
</style>
