<template>
  <div class="document-tree-wrap">
    <ul v-if="rootChildren.length" class="document-tree">
      <DocumentTreeNode
        v-for="child in rootChildren"
        :key="child.id"
        :node="child"
        :highlight-indicator-no="highlightIndicatorNo"
      />
    </ul>
    <p v-else class="muted">暂无节点内容</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DocumentTreeNode from './DocumentTreeNode.vue';

const props = defineProps({
  tree: { type: Object, default: null },
  highlightIndicatorNo: { type: Number, default: null },
});

const rootChildren = computed(() => {
  const tree = props.tree;
  if (!tree) return [];
  if (tree.nodeKind === 'doc_title') return tree.children || [];
  return [tree];
});
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
