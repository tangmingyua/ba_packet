<template>
  <section v-if="hits.length" class="material-hit-section">
    <header class="material-hit-head">
      <h3>{{ title }}</h3>
      <span class="muted">共 {{ hits.length }} 条</span>
    </header>
    <table class="simple-table material-hit-table">
      <thead>
        <tr>
          <th>模块</th>
          <th>标签</th>
          <th>子类</th>
          <th>标题</th>
          <th>摘要</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(hit, idx) in hits" :key="`${hit.entityKind}-${hit.entityId}-${idx}`">
          <td>{{ hit.moduleName || hit.moduleCode }}</td>
          <td>{{ hit.categoryLabel }}</td>
          <td>{{ hit.reportName }}</td>
          <td>{{ hit.dataItemName }}</td>
          <td class="snippet-cell">{{ hit.snippet }}</td>
          <td>
            <button
              v-if="hit.entityKind === 'code_value' && hit.dictName"
              type="button"
              class="btn-link"
              @click="openCodeValue(hit)"
            >
              查看码表
            </button>
            <router-link v-else-if="isViewLink(hit.linkPath)" :to="hit.linkPath" class="btn-link">
              查看
            </router-link>
            <span v-else class="muted">—</span>
          </td>
        </tr>
      </tbody>
    </table>

    <CodeValueLookupModal
      v-if="codeValueModal"
      :module-code="codeValueModal.moduleCode"
      :dict-name="codeValueModal.dictName"
      :source-text="codeValueModal.sourceText"
      @close="codeValueModal = null"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import CodeValueLookupModal from './CodeValueLookupModal.vue';
import { compareVersionLabelsDesc, pickItemVersion } from '../../utils/versionSort.js';

const props = defineProps({
  reports: { type: Array, default: () => [] },
  title: { type: String, default: '表样 / 说明 / 脚本 / 码值' },
});

const codeValueModal = ref(null);

const hits = computed(() => {
  const rows = [];
  for (const report of props.reports) {
    for (const block of report.blocks || []) {
      for (const item of block.items || []) {
        rows.push({
          reportName: report.name,
          moduleCode: item.moduleCode || report.moduleCode,
          moduleName: item.moduleName || report.moduleName,
          categoryLabel: item.categoryLabel || report.categoryLabel,
          dataItemName: item.dataItemName,
          snippet: item.snippet || '',
          linkPath: item.linkPath,
          entityKind: item.entityKind,
          entityId: item.entityId,
          dictName: item.payload?.dict_name || block.tableName || '',
          versionLabel: pickItemVersion(item, block),
        });
      }
    }
  }
  return rows.sort((a, b) => {
    const vcmp = compareVersionLabelsDesc(a.versionLabel, b.versionLabel);
    if (vcmp !== 0) return vcmp;
    return (a.dataItemName || '').localeCompare(b.dataItemName || '', 'zh-CN');
  });
});

function isViewLink(path) {
  if (!path || path === '/') return false;
  if (path.startsWith('/import')) return false;
  return true;
}

function openCodeValue(hit) {
  if (!hit.moduleCode || !hit.dictName) return;
  codeValueModal.value = {
    moduleCode: hit.moduleCode,
    dictName: hit.dictName,
    sourceText: hit.dataItemName,
  };
}
</script>

<style scoped>
.material-hit-section {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  margin-top: 0;
  overflow: auto;
}

.material-hit-head {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.material-hit-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.snippet-cell {
  max-width: 360px;
  color: var(--text-secondary);
  font-size: 12px;
}

.btn-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent-blue, #2563eb);
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
}

.btn-link:hover {
  color: #1d4ed8;
}
</style>
