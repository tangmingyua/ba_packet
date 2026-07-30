<template>
  <div ref="wrapRef" class="document-tree-wrap">
    <ul v-if="rootChildren.length" class="document-tree">
      <DocumentTreeNode
        v-for="child in rootChildren"
        :key="child.id"
        :node="child"
        :highlight-indicator-key="resolvedHighlightKey"
        :highlight-node-id="resolvedHighlightNodeId"
      />
    </ul>
    <p v-else class="muted">暂无节点内容</p>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import DocumentTreeNode from './DocumentTreeNode.vue';

const props = defineProps({
  tree: { type: Object, default: null },
  /** @deprecated 使用 highlightIndicatorKey */
  highlightIndicatorNo: { type: Number, default: null },
  highlightIndicatorKey: { type: String, default: '' },
  highlightNodeId: { type: Number, default: null },
});

const rootChildren = computed(() => {
  const tree = props.tree;
  if (!tree) return [];
  if (tree.nodeKind === 'doc_title') return tree.children || [];
  return [tree];
});

const resolvedHighlightKey = computed(() => {
  if (props.highlightIndicatorKey) return props.highlightIndicatorKey;
  if (props.highlightIndicatorNo != null) return String(props.highlightIndicatorNo);
  return '';
});

const resolvedHighlightNodeId = computed(() => {
  const id = Number(props.highlightNodeId);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const wrapRef = ref(null);

function scrollToHighlightedNode(nodeId, attempt = 0) {
  const wrap = wrapRef.value;
  if (!wrap || nodeId == null) return;

  const el = wrap.querySelector(`[data-node-id="${nodeId}"]`);
  if (el) {
    const row = el.querySelector('.doc-tree-row') || el;
    const wrapRect = wrap.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const top =
      rowRect.top - wrapRect.top + wrap.scrollTop - wrap.clientHeight / 2 + rowRect.height / 2;
    wrap.scrollTo({
      top: Math.max(0, top),
      behavior: attempt === 0 ? 'smooth' : 'auto',
    });
    return;
  }

  if (attempt < 12) {
    setTimeout(() => scrollToHighlightedNode(nodeId, attempt + 1), 50);
  }
}

watch(
  () => [resolvedHighlightNodeId.value, resolvedHighlightKey.value, props.tree],
  ([nodeId, indicatorKey]) => {
    if (nodeId == null && !indicatorKey) return;
    nextTick(() => {
      nextTick(() => {
        if (nodeId != null) {
          scrollToHighlightedNode(nodeId);
          return;
        }
        scrollToHighlightedIndicator(indicatorKey);
      });
    });
  }
);

function scrollToHighlightedIndicator(indicatorKey, attempt = 0) {
  const wrap = wrapRef.value;
  if (!wrap || !indicatorKey) return;
  const el = wrap.querySelector('.doc-tree-node.highlighted');
  if (el) {
    scrollToHighlightedNode(Number(el.getAttribute('data-node-id')), attempt);
    return;
  }
  if (attempt < 12) {
    setTimeout(() => scrollToHighlightedIndicator(indicatorKey, attempt + 1), 50);
  }
}
</script>

<style scoped>
.document-tree-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  padding: 8px 12px;
}

.document-tree {
  margin: 0;
  padding: 0;
}

.muted {
  color: var(--text-muted);
  font-size: 13px;
  padding: 12px;
}
</style>
