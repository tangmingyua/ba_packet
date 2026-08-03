<template>
  <div class="aggregate-browse">
    <p v-if="!items.length" class="message muted">{{ emptyText }}</p>
    <div v-else class="aggregate-browse-table-wrap">
      <table class="aggregate-browse-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.label"
              :class="{ 'col-link': isLinkColumn(col.label) }"
            >
              {{ col.label }}
            </th>
            <th class="col-count">条数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in items" :key="idx" class="aggregate-row">
            <td
              v-for="col in columns"
              :key="col.label"
              :class="{ 'col-link': isLinkColumn(col.label) }"
            >
              <button
                v-if="isLinkColumn(col.label)"
                type="button"
                class="link-cell-btn"
                @click="emit('pick', row)"
              >
                {{ displayCell(row, col.label) }}
              </button>
              <span v-else>{{ displayCell(row, col.label) }}</span>
            </td>
            <td class="col-count">{{ row.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  columns: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] },
  emptyText: { type: String, default: '暂无去重组合' },
  /** Excel 列名：标准字段一般为 table_name（表名），如「报表」 */
  linkColumnLabel: { type: String, default: '' },
});

const emit = defineEmits(['pick']);

function isLinkColumn(label) {
  return Boolean(props.linkColumnLabel && label === props.linkColumnLabel);
}

function displayCell(row, label) {
  const v = row.values?.[label];
  if (v === undefined || v === null || v === '') return '—';
  return v;
}
</script>

<style scoped>
.aggregate-browse {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 20px;
}

.aggregate-browse-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.aggregate-browse-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.aggregate-browse-table th,
.aggregate-browse-table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.aggregate-browse-table th {
  background: #f9fafb;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

.col-link {
  color: #2563eb;
}

th.col-link {
  font-weight: 600;
}

.col-count {
  width: 72px;
  text-align: right;
  white-space: nowrap;
  color: inherit;
}

.link-cell-btn {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: #2563eb;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
}

.link-cell-btn:hover {
  text-decoration: underline;
}

.link-cell-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
  border-radius: 2px;
}
</style>
