<template>
  <section class="code-value-result-section">
    <header class="code-value-result-head">
      <h3>{{ title }} <span class="table-count">{{ rows.length }}</span> 条</h3>
    </header>

    <div v-if="!rows.length" class="empty">{{ emptyText }}</div>

    <div v-else class="table-scroll">
      <table class="simple-table code-value-result-table">
        <thead>
          <tr>
            <th>码表</th>
            <th>码值</th>
            <th>含义</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in rows" :key="`${row.dictName}-${row.code}-${idx}`">
            <td v-html="highlight(row.dictName)" />
            <td v-html="highlight(row.code)" />
            <td class="meaning-cell" v-html="highlight(row.meaning)" />
            <td>
              <button type="button" class="btn-link" @click="openDict(row)">查看码表</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

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
import { highlightKeyword } from '../../composables/useDynamicTable.js';

const props = defineProps({
  reports: { type: Array, default: () => [] },
  keyword: { type: String, default: '' },
  title: { type: String, default: '码值' },
  emptyText: { type: String, default: '未找到匹配码值' },
});

const codeValueModal = ref(null);

const rows = computed(() => {
  const list = [];
  for (const report of props.reports) {
    for (const block of report.blocks || []) {
      for (const item of block.items || []) {
        const payload = item.payload || {};
        list.push({
          dictName: payload.dict_name || block.tableName || '',
          code: payload.code || '',
          meaning: payload.meaning || item.snippet || '',
          moduleCode: item.moduleCode || report.moduleCode || '',
          sourceText: item.dataItemName || payload.code || '',
        });
      }
    }
  }
  return list;
});

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlight(text) {
  const safe = escapeHtml(text || '');
  const q = props.keyword.trim();
  if (!q) return safe || '—';
  return highlightKeyword(safe, q);
}

function openDict(row) {
  if (!row.moduleCode || !row.dictName) return;
  codeValueModal.value = {
    moduleCode: row.moduleCode,
    dictName: row.dictName,
    sourceText: row.sourceText,
  };
}
</script>

<style scoped>
.code-value-result-section {
  margin-top: 12px;
}

.code-value-result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.code-value-result-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.table-count {
  font-weight: 400;
  color: var(--text-secondary);
}

.table-scroll {
  overflow: auto;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
}

.code-value-result-table {
  width: 100%;
  border-collapse: collapse;
}

.code-value-result-table th,
.code-value-result-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  vertical-align: top;
}

.code-value-result-table th {
  background: var(--bg-subtle, #f9fafb);
  font-weight: 600;
  font-size: 13px;
}

.meaning-cell {
  max-width: 420px;
  color: var(--text-secondary);
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

.empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-secondary);
  border: 1px dashed var(--border-color, #e5e7eb);
  border-radius: 8px;
}
</style>
