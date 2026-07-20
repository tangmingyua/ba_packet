<template>
  <div class="fields-panel">
    <p class="hint">
      标准字段是 Excel 列映射与导入 payload 的统一键名。系统保留字段（子类、版本、数据项）不可删除。
    </p>

    <fieldset class="form-section">
      <legend>筛选</legend>
      <div class="filter-bar">
        <label class="field compact">
          <span class="label">关键词</span>
          <input v-model="filterText" type="text" placeholder="code 或中文名" />
        </label>
        <label class="check-item">
          <input v-model="filterSystemOnly" type="checkbox" />
          仅系统字段
        </label>
        <label class="check-item">
          <input v-model="filterCustomOnly" type="checkbox" />
          仅自定义字段
        </label>
        <button type="button" class="btn-secondary" @click="resetFilter">重置</button>
      </div>
      <p class="summary">共 {{ fields.length }} 个字段，当前显示 {{ filteredFields.length }} 个</p>
    </fieldset>

    <fieldset class="form-section">
      <legend>添加标准字段</legend>
      <div class="add-row">
        <input v-model="newField.code" placeholder="code，如 east_table（小写+下划线）" />
        <input v-model="newField.label" placeholder="中文名，如 EAST表名" />
        <button type="button" class="submit-btn small" :disabled="saving" @click="addField">
          添加
        </button>
      </div>
      <p class="muted">code 规则：小写字母开头，仅含 a-z、0-9、_</p>
    </fieldset>

    <p v-if="message" class="feedback" :class="messageType">{{ message }}</p>

    <fieldset class="form-section">
      <legend>字段列表</legend>
      <table class="data-table">
        <thead>
          <tr>
            <th>code</th>
            <th>中文名</th>
            <th>类型</th>
            <th>排序</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!filteredFields.length">
            <td colspan="5" class="empty">无匹配字段</td>
          </tr>
          <tr v-for="f in filteredFields" :key="f.code">
            <td><code>{{ f.code }}</code></td>
            <td>{{ f.label }}</td>
            <td>
              <span class="pill" :class="f.isSystem ? 'system' : 'custom'">
                {{ f.isSystem ? '系统' : '自定义' }}
              </span>
            </td>
            <td>{{ f.sortOrder }}</td>
            <td>
              <button
                v-if="!f.isSystem"
                type="button"
                class="link-btn danger"
                :disabled="saving"
                @click="removeField(f)"
              >
                删除
              </button>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </fieldset>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { createStandardField, deleteStandardField, listStandardFields } from '../../api';

const emit = defineEmits(['changed']);

const fields = ref([]);
const filterText = ref('');
const filterSystemOnly = ref(false);
const filterCustomOnly = ref(false);
const saving = ref(false);
const message = ref('');
const messageType = ref('');

const newField = reactive({ code: '', label: '' });

const filteredFields = computed(() => {
  let list = fields.value;
  if (filterSystemOnly.value) list = list.filter((f) => f.isSystem);
  if (filterCustomOnly.value) list = list.filter((f) => !f.isSystem);
  const q = filterText.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (f) => f.code.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
    );
  }
  return list;
});

function resetFilter() {
  filterText.value = '';
  filterSystemOnly.value = false;
  filterCustomOnly.value = false;
}

async function loadFields() {
  const res = await listStandardFields();
  fields.value = res.items || [];
}

async function addField() {
  saving.value = true;
  message.value = '';
  try {
    await createStandardField({ code: newField.code.trim(), label: newField.label.trim() });
    newField.code = '';
    newField.label = '';
    await loadFields();
    messageType.value = 'success';
    message.value = '标准字段已添加';
    emit('changed');
  } catch (e) {
    messageType.value = 'error';
    message.value = e.message || '添加失败';
  } finally {
    saving.value = false;
  }
}

async function removeField(field) {
  if (!confirm(`确认删除标准字段「${field.label}」（${field.code}）？`)) return;
  saving.value = true;
  message.value = '';
  try {
    await deleteStandardField(field.code);
    await loadFields();
    messageType.value = 'success';
    message.value = `已删除：${field.code}`;
    emit('changed');
  } catch (e) {
    messageType.value = 'error';
    message.value = e.message || '删除失败';
  } finally {
    saving.value = false;
  }
}

onMounted(loadFields);
</script>

<style scoped>
.hint {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
}

.form-section {
  margin-top: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.form-section legend {
  padding: 0 6px;
  font-weight: 600;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: flex-end;
}

.field.compact {
  min-width: 220px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 13px;
  color: #374151;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.add-row input {
  min-width: 200px;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.summary {
  margin: 8px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th,
.data-table td {
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
}

.data-table th {
  background: #f9fafb;
}

.data-table code {
  font-size: 12px;
  color: #1d4ed8;
}

.empty {
  text-align: center;
  color: #9ca3af;
  padding: 16px;
}

.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.pill.system {
  color: #1d4ed8;
  background: #eff6ff;
}

.pill.custom {
  color: #047857;
  background: #ecfdf5;
}

.muted {
  color: #6b7280;
  font-size: 13px;
}

.feedback {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
}

.feedback.success {
  color: #047857;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}

.feedback.error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.submit-btn,
.btn-secondary {
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 14px;
}

.submit-btn {
  background: #2563eb;
  color: #fff;
}

.submit-btn.small {
  padding: 7px 12px;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f3f4f6;
  color: #111827;
}

.link-btn {
  border: none;
  background: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
}

.link-btn.danger {
  color: #b91c1c;
}
</style>
