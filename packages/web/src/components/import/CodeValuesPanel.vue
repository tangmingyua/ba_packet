<template>
  <div class="code-values-panel">
    <p class="hint">
      批量导入「码值更新格式」Sheet（码值名称、码值代码、码值含义、扩展字段1–11）。同一模块导入将全量替换该模块下已有码值；扩展字段展示映射单独维护。
    </p>

    <fieldset class="form-section">
      <legend>模块</legend>
      <label class="field compact">
        <span class="label">主类 / 模块</span>
        <select v-model="moduleCode" @change="onModuleChange">
          <option v-for="m in modules" :key="m.code" :value="m.code">{{ m.name }} ({{ m.code }})</option>
        </select>
      </label>
      <p v-if="summary" class="summary muted">
        已导入 <strong>{{ summary.total }}</strong> 条码值，
        <strong>{{ summary.dicts?.length || 0 }}</strong> 个码表
        <template v-if="summary.lastImport?.importedAt">
          · 最近 {{ summary.lastImport.importedAt }}
          <span v-if="summary.lastImport.sourceFile">（{{ summary.lastImport.sourceFile }}）</span>
        </template>
      </p>
    </fieldset>

    <fieldset class="form-section">
      <legend>批量导入码值</legend>
      <div class="dropzone" :class="{ active: dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
        <p v-if="!file">
          拖拽 Excel 到此处，或
          <label class="file-link"
            >选择文件<input type="file" accept=".xlsx,.xls" hidden @change="onFile"
          /></label>
        </p>
        <p v-else>
          {{ file.name }}
          <button type="button" class="btn-link" @click="file = null">清除</button>
        </p>
      </div>
      <div class="inline-actions">
        <button type="button" class="btn btn-primary" :disabled="!file || importing" @click="doImport">
          {{ importing ? '导入中...' : '导入码值' }}
        </button>
      </div>
      <p v-if="importMessage" class="feedback" :class="importMessageType">{{ importMessage }}</p>
    </fieldset>

    <fieldset class="form-section">
      <legend>字段展示映射</legend>
      <p class="hint block-hint">
        按模块 + 码表名称，配置码值名称/码值代码/码值含义及扩展字段1–11 在前端弹窗中的展示名。
      </p>
      <div class="filter-bar">
        <label class="field compact">
          <span class="label">码表名称</span>
          <select v-model="dictName" :disabled="!dictOptions.length" @change="onDictChange">
            <option value="">请选择</option>
            <option v-for="d in dictOptions" :key="d.dictName" :value="d.dictName">
              {{ d.dictName }}（{{ d.count }}）
            </option>
          </select>
        </label>
        <button type="button" class="btn" :disabled="!dictName || savingDisplay" @click="saveDisplay">
          保存展示映射
        </button>
      </div>
      <table v-if="dictName" class="simple-table display-table">
        <thead>
          <tr>
            <th>字段键</th>
            <th>展示名称</th>
            <th>排序</th>
            <th>显示</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in displayRows" :key="row.fieldKey">
            <td><code class="code-tag">{{ row.fieldKey }}</code></td>
            <td>
              <input v-model="row.displayLabel" type="text" class="cell-input" :placeholder="row.placeholder" />
            </td>
            <td>
              <input v-model.number="row.sortOrder" type="number" min="0" class="cell-input narrow" />
            </td>
            <td class="center">
              <input v-model="row.visible" type="checkbox" />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="moduleCode && !dictOptions.length" class="empty-hint">该模块尚无码值，请先导入 Excel。</p>
      <p v-if="displayMessage" class="feedback" :class="displayMessageType">{{ displayMessage }}</p>
    </fieldset>

    <fieldset class="form-section">
      <legend>码值预览</legend>
      <p class="hint block-hint">当前模块 + 码表名称下，数据库中的码值记录（与导入 Sheet 列一致）。</p>
      <p v-if="dictName && previewTotal" class="summary muted">共 {{ previewTotal }} 条</p>
      <div v-if="dictName && previewItems.length" class="table-scroll-panel">
        <div class="table-wrap">
          <table class="simple-table preview-table">
            <thead>
              <tr>
                <th v-for="col in PREVIEW_COLUMNS" :key="col.key">{{ col.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in previewItems" :key="idx">
                <td v-for="col in PREVIEW_COLUMNS" :key="col.key">{{ cellText(item[col.key]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-else-if="dictName && previewLoaded" class="empty-hint">该码表下暂无数据</p>
      <p v-else-if="moduleCode && !dictOptions.length" class="empty-hint">请先导入码值 Excel。</p>
      <p v-else class="empty-hint">请选择码表名称查看预览。</p>
    </fieldset>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import {
  getCodeValueSummary,
  importCodeValuesExcel,
  listCodeValueDictNames,
  listCodeValues,
  saveCodeValueDisplay,
} from '../../api';

const props = defineProps({
  modules: { type: Array, default: () => [] },
});

const EXTEND_COUNT = 11;

const PREVIEW_COLUMNS = [
  { key: 'dict_name', label: '码值名称' },
  { key: 'code', label: '码值代码' },
  { key: 'meaning', label: '码值含义' },
  ...Array.from({ length: EXTEND_COUNT }, (_, i) => ({
    key: `extend_${i + 1}`,
    label: `扩展字段${i + 1}`,
  })),
];

const moduleCode = ref('');
const dictName = ref('');
const dictOptions = ref([]);
const summary = ref(null);
const file = ref(null);
const dragging = ref(false);
const importing = ref(false);
const importMessage = ref('');
const importMessageType = ref('');

const displayRows = ref([]);
const savingDisplay = ref(false);
const displayMessage = ref('');
const displayMessageType = ref('');

const previewItems = ref([]);
const previewTotal = ref(0);
const previewLoaded = ref(false);

const CORE_DISPLAY_FIELDS = [
  { fieldKey: 'dict_name', placeholder: '码值名称', defaultOrder: 1 },
  { fieldKey: 'code', placeholder: '码值代码', defaultOrder: 2 },
  { fieldKey: 'meaning', placeholder: '码值含义', defaultOrder: 3 },
];

function buildEmptyDisplayRows(existing = []) {
  const byKey = new Map(existing.map((r) => [r.fieldKey, r]));
  const coreRows = CORE_DISPLAY_FIELDS.map((def) => {
    const prev = byKey.get(def.fieldKey);
    return {
      fieldKey: def.fieldKey,
      placeholder: def.placeholder,
      displayLabel: prev?.displayLabel || '',
      sortOrder: prev?.sortOrder ?? def.defaultOrder,
      visible: prev?.visible !== false,
    };
  });
  const extendRows = Array.from({ length: EXTEND_COUNT }, (_, i) => {
    const fieldKey = `extend_${i + 1}`;
    const prev = byKey.get(fieldKey);
    return {
      fieldKey,
      placeholder: `扩展字段${i + 1}`,
      displayLabel: prev?.displayLabel || '',
      sortOrder: prev?.sortOrder ?? i + 4,
      visible: prev?.visible !== false,
    };
  });
  return [...coreRows, ...extendRows];
}

async function refreshSummary() {
  if (!moduleCode.value) {
    summary.value = null;
    return;
  }
  try {
    summary.value = await getCodeValueSummary(moduleCode.value);
  } catch {
    summary.value = null;
  }
}

async function refreshDictNames() {
  if (!moduleCode.value) {
    dictOptions.value = [];
    return;
  }
  const res = await listCodeValueDictNames(moduleCode.value);
  dictOptions.value = res.items || [];
  if (dictName.value && !dictOptions.value.some((d) => d.dictName === dictName.value)) {
    dictName.value = '';
  }
}

async function onModuleChange() {
  dictName.value = '';
  displayRows.value = [];
  previewItems.value = [];
  previewTotal.value = 0;
  previewLoaded.value = false;
  await refreshSummary();
  await refreshDictNames();
}

function cellText(val) {
  if (val === null || val === undefined || val === '') return '—';
  return String(val);
}

async function onDictChange() {
  await loadDictData();
}

async function loadDictData() {
  displayMessage.value = '';
  previewLoaded.value = false;
  previewItems.value = [];
  previewTotal.value = 0;
  if (!moduleCode.value || !dictName.value) {
    displayRows.value = [];
    return;
  }
  try {
    const res = await listCodeValues(moduleCode.value, dictName.value);
    displayRows.value = buildEmptyDisplayRows(res.display || []);
    previewTotal.value = res.total || 0;
    previewItems.value = (res.items || []).map((item) => ({
      dict_name: item.dict_name || res.dictName,
      code: item.code,
      meaning: item.meaning,
      ...Object.fromEntries(
        Array.from({ length: EXTEND_COUNT }, (_, i) => [`extend_${i + 1}`, item[`extend_${i + 1}`] || ''])
      ),
    }));
    previewLoaded.value = true;
  } catch (e) {
    displayMessageType.value = 'error';
    displayMessage.value = e.message || '加载失败';
    displayRows.value = buildEmptyDisplayRows();
    previewLoaded.value = true;
  }
}

function onFile(e) {
  file.value = e.target.files?.[0] || null;
}

function onDrop(e) {
  dragging.value = false;
  const f = e.dataTransfer.files?.[0];
  if (f) file.value = f;
}

async function doImport() {
  if (!file.value || !moduleCode.value) return;
  importing.value = true;
  importMessage.value = '';
  try {
    const result = await importCodeValuesExcel(file.value, moduleCode.value);
    importMessageType.value = 'success';
    importMessage.value = `导入成功：${result.imported} 条，${result.dictCount} 个码表（Sheet：${result.sheetName}）`;
    file.value = null;
    await refreshSummary();
    await refreshDictNames();
    if (result.dictNames?.length === 1) {
      dictName.value = result.dictNames[0];
      await loadDictData();
    }
  } catch (e) {
    importMessageType.value = 'error';
    importMessage.value = e.message || '导入失败';
  } finally {
    importing.value = false;
  }
}

async function saveDisplay() {
  if (!moduleCode.value || !dictName.value) return;
  savingDisplay.value = true;
  displayMessage.value = '';
  try {
    const fields = displayRows.value
      .filter((r) => r.displayLabel.trim())
      .map((r) => ({
        fieldKey: r.fieldKey,
        displayLabel: r.displayLabel.trim(),
        sortOrder: r.sortOrder,
        visible: r.visible,
      }));
    await saveCodeValueDisplay(moduleCode.value, dictName.value, fields);
    displayMessageType.value = 'success';
    displayMessage.value = '展示映射已保存';
    await loadDictData();
  } catch (e) {
    displayMessageType.value = 'error';
    displayMessage.value = e.message || '保存失败';
  } finally {
    savingDisplay.value = false;
  }
}

watch(
  () => props.modules,
  (mods) => {
    if (!moduleCode.value && mods.length) {
      moduleCode.value = mods[0].code;
      onModuleChange();
    }
  },
  { immediate: true }
);

onMounted(async () => {
  if (moduleCode.value) await onModuleChange();
});
</script>

<style scoped>
.code-values-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.block-hint {
  margin: 0 0 10px;
  font-size: 13px;
}

.summary {
  margin: 8px 0 0;
  font-size: 13px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  margin-bottom: 12px;
}

.display-table .cell-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.display-table .cell-input.narrow {
  width: 72px;
}

.center {
  text-align: center;
}

.table-scroll-panel {
  margin-top: 12px;
  overflow: auto;
  max-height: 420px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.preview-table {
  min-width: 100%;
  font-size: 12px;
}

.empty-hint {
  color: var(--text-muted);
  font-size: 13px;
  margin: 8px 0;
}
</style>
