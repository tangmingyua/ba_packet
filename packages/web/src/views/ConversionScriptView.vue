<template>
  <section class="cs-page">
    <header class="cs-page-head">
      <div class="list-header">
        <h3>转1104 脚本</h3>
        <router-link to="/import?tab=conversionScript" class="btn-link">去导入</router-link>
      </div>

      <div class="filter-bar">
        <label class="field compact">
          <span class="label">模块</span>
          <select v-model="moduleCode">
            <option value="">全部</option>
            <option v-for="mod in modules" :key="mod.code" :value="mod.code">
              {{ mod.name }}
            </option>
          </select>
        </label>
        <label class="field compact grow">
          <span class="label">1104 表号</span>
          <input
            v-model="reportCodeInput"
            type="text"
            placeholder="模糊匹配，留空显示全部"
            @keydown.enter="search"
          />
        </label>
        <button type="button" class="btn btn-primary" :disabled="loading" @click="search">
          查询
        </button>
      </div>

      <p v-if="loadError" class="feedback error">{{ loadError }}</p>
      <p v-else-if="resultSummary" class="result-summary">{{ resultSummary }}</p>
    </header>

    <div class="cs-list-body">
      <p v-if="loading" class="muted state-hint">加载中…</p>
      <p v-else-if="searched && !items.length" class="muted state-hint">
        无匹配脚本，
        <router-link to="/import?tab=conversionScript">前往导入</router-link>
      </p>
      <p v-else-if="!searched" class="muted state-hint">
        点击「查询」列出脚本；留空表号则显示全部
      </p>

      <div v-else class="table-wrap">
        <table class="simple-table cs-table">
          <thead>
            <tr>
              <th>表号</th>
              <th>文件名</th>
              <th>版本</th>
              <th>导入时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" :class="{ selected: activeId === item.id }">
              <td>{{ item.reportCode }}</td>
              <td class="file-name">
                <button type="button" class="file-link" @click="selectItem(item)">
                  {{ item.sourceFileName }}
                </button>
              </td>
              <td>{{ item.versionLabel }}</td>
              <td>{{ item.importedAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Transition name="cs-drawer">
      <div
        v-if="previewOpen"
        class="cs-drawer-backdrop"
        role="presentation"
        @click="closePreview"
      >
        <aside class="cs-drawer" role="dialog" aria-modal="true" @click.stop>
          <header class="drawer-header">
            <div class="drawer-title-wrap">
              <h2 v-if="detail">{{ detail.reportCode }} — {{ detail.sourceFileName }}</h2>
              <h2 v-else>加载脚本…</h2>
              <p v-if="detail" class="preview-meta">
                版本 {{ detail.versionLabel }} · 模块 {{ moduleLabel(detail.moduleCode) }} · 导入
                {{ detail.importedAt }}
              </p>
            </div>
            <div class="drawer-actions">
              <button v-if="detail" type="button" class="btn" @click="copyFileName">复制文件名</button>
              <button type="button" class="btn drawer-close" aria-label="关闭" @click="closePreview">
                关闭
              </button>
            </div>
          </header>
          <div class="drawer-body">
            <p v-if="loadingDetail" class="muted state-hint">加载脚本…</p>
            <ScriptPreview v-else-if="detail" :key="detail.id" :text="detail.scriptText" />
          </div>
        </aside>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getConversionScript, getDatasetCatalog, listConversionScripts } from '../api';
import ScriptPreview from '../components/conversion-script/ScriptPreview.vue';

const route = useRoute();
const router = useRouter();

const modules = ref([]);
const moduleCode = ref('');
const reportCodeInput = ref('');
const lastReportCode = ref('');
const items = ref([]);
const activeId = ref(null);
const detail = ref(null);
const loading = ref(false);
const loadingDetail = ref(false);
const searched = ref(false);
const loadError = ref('');

const previewOpen = computed(() => loadingDetail.value || Boolean(detail.value));

const moduleLabel = (code) => modules.value.find((m) => m.code === code)?.name || code;

const resultSummary = computed(() => {
  if (!searched.value || loading.value) return '';
  const parts = [`共 ${items.value.length} 条`];
  if (lastReportCode.value) parts.unshift(`表号含「${lastReportCode.value}」`);
  else parts.unshift('全部表号');
  if (moduleCode.value) {
    parts.push(`模块 ${moduleLabel(moduleCode.value)}`);
  }
  return parts.join(' · ');
});

function listQuery() {
  return {
    ...(moduleCode.value ? { moduleCode: moduleCode.value } : {}),
    ...(lastReportCode.value ? { reportCode: lastReportCode.value } : {}),
  };
}

async function loadCatalog() {
  try {
    const catalog = await getDatasetCatalog();
    modules.value = catalog.modules || [];
  } catch {
    modules.value = [];
  }
}

function clearPreview() {
  activeId.value = null;
  detail.value = null;
  loadingDetail.value = false;
}

function closePreview() {
  clearPreview();
  router.replace({ name: 'conversionScripts', query: listQuery() });
}

async function search() {
  loading.value = true;
  loadError.value = '';
  searched.value = true;
  lastReportCode.value = reportCodeInput.value.trim().toUpperCase();
  closePreview();
  try {
    const { items: list } = await listConversionScripts({
      moduleCode: moduleCode.value || undefined,
      reportCode: lastReportCode.value || undefined,
    });
    items.value = list || [];
    router.replace({ name: 'conversionScripts', query: listQuery() });
  } catch (e) {
    loadError.value = e.message || '查询失败';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

async function selectItem(item) {
  if (!item?.id) return;
  activeId.value = item.id;
  loadingDetail.value = true;
  detail.value = null;
  loadError.value = '';
  router.replace({
    name: 'conversionScriptDetail',
    params: { id: item.id },
    query: listQuery(),
  });
  try {
    detail.value = await getConversionScript(item.id);
  } catch (e) {
    detail.value = null;
    loadError.value = e.message || '加载失败';
  } finally {
    loadingDetail.value = false;
  }
}

async function copyFileName() {
  if (!detail.value?.sourceFileName) return;
  try {
    await navigator.clipboard.writeText(detail.value.sourceFileName);
  } catch {
    /* ignore */
  }
}

async function restoreFromRoute() {
  const qReport = String(route.query.reportCode || '').trim();
  const qModule = String(route.query.moduleCode || '').trim();
  if (qModule) moduleCode.value = qModule;
  if (qReport) reportCodeInput.value = qReport;

  const id = Number(route.params.id);
  const shouldSearch = Boolean(qReport || qModule || id);

  if (shouldSearch) {
    loading.value = true;
    searched.value = true;
    lastReportCode.value = qReport;
    try {
      const { items: list } = await listConversionScripts({
        moduleCode: moduleCode.value || undefined,
        reportCode: lastReportCode.value || undefined,
      });
      items.value = list || [];
    } catch (e) {
      loadError.value = e.message || '查询失败';
    } finally {
      loading.value = false;
    }
  }

  if (id && items.value.some((x) => x.id === id)) {
    await selectItem(items.value.find((x) => x.id === id));
  } else if (id && !items.value.length) {
    loadingDetail.value = true;
    try {
      detail.value = await getConversionScript(id);
      activeId.value = id;
    } catch (e) {
      loadError.value = e.message || '加载失败';
    } finally {
      loadingDetail.value = false;
    }
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && previewOpen.value) {
    closePreview();
  }
}

onMounted(async () => {
  await loadCatalog();
  await restoreFromRoute();
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});

watch(
  () => route.params.id,
  async (id) => {
    const numId = Number(id);
    if (!numId) {
      clearPreview();
      return;
    }
    if (numId !== activeId.value) {
      const item = items.value.find((x) => x.id === numId);
      if (item) await selectItem(item);
    }
  }
);
</script>

<style scoped>
.cs-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg);
}

.cs-page-head {
  flex-shrink: 0;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.list-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  align-items: flex-end;
}

.field.compact {
  min-width: 140px;
}

.field.grow {
  flex: 1;
  min-width: 200px;
  max-width: 360px;
}

.result-summary {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.cs-list-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 24px 24px;
}

.state-hint {
  padding: 24px 0;
}

.table-wrap {
  padding-top: 12px;
}

.cs-table {
  width: 100%;
}

.cs-table tbody tr.selected {
  background: #eff6ff;
}

.file-name {
  max-width: none;
}

.file-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent-blue, #2563eb);
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
  text-align: left;
}

.file-link:hover {
  color: #1d4ed8;
}

.cs-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  justify-content: flex-end;
}

.cs-drawer {
  width: min(760px, 94vw);
  height: 100%;
  background: var(--bg);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 32px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.drawer-header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle, #f8fafc);
}

.drawer-title-wrap h2 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  word-break: break-all;
}

.preview-meta {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.drawer-close {
  min-width: 64px;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.drawer-body :deep(.script-preview) {
  flex: 1;
  min-height: 0;
}

.cs-drawer-enter-active,
.cs-drawer-leave-active {
  transition: opacity 0.2s ease;
}

.cs-drawer-enter-active .cs-drawer,
.cs-drawer-leave-active .cs-drawer {
  transition: transform 0.22s ease;
}

.cs-drawer-enter-from,
.cs-drawer-leave-to {
  opacity: 0;
}

.cs-drawer-enter-from .cs-drawer,
.cs-drawer-leave-to .cs-drawer {
  transform: translateX(100%);
}
</style>
