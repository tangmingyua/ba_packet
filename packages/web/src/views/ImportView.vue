<template>
  <section class="import-page">
    <p class="hint page-intro">
        先配置子类与标准字段，再为子类创建版本并保存字段映射，最后上传 Excel 导入。
      </p>

    <nav class="qa-module-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="qa-module-tab"
        :class="{ active: activeTab === 'import' }"
        :aria-selected="activeTab === 'import'"
        @click="setTab('import')"
      >
        资料导入
      </button>
      <button
        type="button"
        role="tab"
        class="qa-module-tab"
        :class="{ active: activeTab === 'subtypes' }"
        :aria-selected="activeTab === 'subtypes'"
        @click="setTab('subtypes')"
      >
        子类配置
      </button>
      <button
        type="button"
        role="tab"
        class="qa-module-tab"
        :class="{ active: activeTab === 'fields' }"
        :aria-selected="activeTab === 'fields'"
        @click="setTab('fields')"
      >
        标准字段
      </button>
      <button
        type="button"
        role="tab"
        class="qa-module-tab"
        :class="{ active: activeTab === 'formTemplate' }"
        :aria-selected="activeTab === 'formTemplate'"
        @click="setTab('formTemplate')"
      >
        1104 表样
      </button>
      <button
        type="button"
        role="tab"
        class="qa-module-tab"
        :class="{ active: activeTab === 'fillInstruction' }"
        :aria-selected="activeTab === 'fillInstruction'"
        @click="setTab('fillInstruction')"
      >
        填报说明
      </button>
      <button
        type="button"
        role="tab"
        class="qa-module-tab"
        :class="{ active: activeTab === 'data' }"
        :aria-selected="activeTab === 'data'"
        @click="setTab('data')"
      >
        数据查看
      </button>
    </nav>

    <!-- 标签：资料导入 -->
    <div v-show="activeTab === 'import'" class="tab-panel">
      <fieldset class="form-section">
        <legend>上传 Excel</legend>
        <div class="form-grid">
          <label class="field span-2">
            <span class="label">目标子类版本（可多选，优先于仅按 Sheet 名匹配）</span>
            <div class="version-checks">
              <label v-for="opt in versionOptions" :key="opt.id" class="check-item">
                <input v-model="selectedVersionIds" type="checkbox" :value="opt.id" />
                <span>{{ opt.label }}</span>
              </label>
              <p v-if="!versionOptions.length" class="feedback error">
                当前没有可导入的版本。已启用子类须先完成：<strong>新建版本 → 保存字段映射</strong>（映射数 &gt; 0 后才会出现在此处）。
                <span v-if="enabledButNotReady.length">待完成：{{ enabledButNotReady.join('、') }}</span>
                <button type="button" class="btn-link" @click="setTab('subtypes')">去子类配置</button>
              </p>
            </div>
          </label>
          <label class="field span-2">
            <span class="label">备注</span>
            <input v-model="description" type="text" placeholder="可选" />
          </label>
          <div class="field span-2">
            <span class="label">Excel 文件</span>
            <div
              class="dropzone"
              :class="{ active: dragging }"
              @dragover.prevent="dragging = true"
              @dragleave="dragging = false"
              @drop.prevent="onDrop"
            >
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
          </div>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn btn-primary" :disabled="!file || importing" @click="doImport">
            {{ importing ? '导入中...' : '开始导入' }}
          </button>
        </div>
        <p v-if="importMessage" class="feedback" :class="importMessageType">{{ importMessage }}</p>
        <div v-if="importResult" class="sheet-results">
          <h4>逐 Sheet 结果</h4>
          <table class="simple-table">
            <thead>
              <tr>
                <th>Sheet</th>
                <th>状态</th>
                <th>子类/版本</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in importResult.sheets" :key="i">
                <td>{{ s.sheetName }}</td>
                <td>
                  <span :class="['status', s.status]">{{ statusLabel(s.status) }}</span>
                </td>
                <td>{{ s.subtypeCode ? `${s.subtypeCode} / ${s.versionLabel}` : '—' }}</td>
                <td>{{ s.message }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>

      <div v-if="datasets.length" class="log-section">
        <h3>已导入 Sheet 档案</h3>
        <table class="simple-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>子类</th>
              <th>版本</th>
              <th>Sheet</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in datasets" :key="d.id">
              <td>{{ d.id }}</td>
              <td>{{ d.name }}</td>
              <td>{{ d.subtypeName }}</td>
              <td>{{ d.versionLabel }}</td>
              <td>{{ d.sheetName }}</td>
              <td>{{ d.importedAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 标签：1104 表样 -->
    <div v-show="activeTab === 'formTemplate'" class="tab-panel">
      <p class="hint">
        上传 1104 汇总指标表样。支持单表（G0100-logic_231.xls）、多 Sheet 合集（logic_231.xlsx），以及
        整合版（1104汇总总表-整合版-20260428.xlsx，Sheet 名如 G0100_231、S2400_201）。Sheet
        名带 _版本 则写入版本，否则版本留空。逻辑公式自动清空；同表号+版本已存在时需先删除再导入。
      </p>
      <fieldset class="form-section">
        <legend>上传表样 Excel</legend>
        <div class="form-grid">
          <div class="field span-2">
            <span class="label">Excel 文件</span>
            <div
              class="dropzone"
              :class="{ active: formTemplateDragging }"
              @dragover.prevent="formTemplateDragging = true"
              @dragleave="formTemplateDragging = false"
              @drop.prevent="onFormTemplateDrop"
            >
              <p v-if="!formTemplateFile">
                拖拽 .xls / .xlsx 到此处，或
                <label class="file-link"
                  >选择文件<input
                    type="file"
                    accept=".xlsx,.xls"
                    hidden
                    @change="onFormTemplateFile"
                /></label>
              </p>
              <p v-else>
                {{ formTemplateFile.name }}
                <button type="button" class="btn-link" @click="formTemplateFile = null">清除</button>
              </p>
            </div>
          </div>
        </div>
        <div class="inline-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!formTemplateFile || formTemplateImporting"
            @click="doFormTemplateImport"
          >
            {{ formTemplateImporting ? '导入中...' : '导入表样' }}
          </button>
          <button type="button" class="btn" :disabled="formTemplateLoading" @click="refreshFormTemplates">
            刷新列表
          </button>
          <router-link to="/form-templates" class="btn">查看表样</router-link>
        </div>
        <p v-if="formTemplateMessage" class="feedback form-template-feedback" :class="formTemplateMessageType">
          {{ formTemplateMessage }}
        </p>
        <ul v-if="formTemplateImportItems.length" class="import-result-list">
          <li v-for="item in formTemplateImportItems" :key="item.id">
            {{ item.reportCode }} / 版本 {{ item.versionLabel }}
            <span class="muted">（{{ item.rowCount }}×{{ item.colCount }}）</span>
          </li>
        </ul>
      </fieldset>

      <fieldset class="form-section">
        <legend>已导入表样</legend>
        <table v-if="formTemplates.length" class="simple-table">
          <thead>
            <tr>
              <th>表号</th>
              <th>表名</th>
              <th>版本</th>
              <th>规模</th>
              <th>导入时间</th>
              <th>源文件</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in formTemplates" :key="item.id">
              <td>{{ item.reportCode }}</td>
              <td>{{ item.reportTitle }}</td>
              <td>{{ item.versionLabel }}</td>
              <td>{{ item.rowCount }}×{{ item.colCount }}</td>
              <td>{{ item.importedAt }}</td>
              <td>{{ item.sourceFileName }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-cell">暂无表样，请上传表样 Excel</p>
      </fieldset>
    </div>

    <!-- 标签：1104 填报说明 Word -->
    <div v-show="activeTab === 'fillInstruction'" class="tab-panel">
      <p class="hint">
        上传合并填报说明 Word（.docx，含多张 G 表说明）。系统将按 G01、G02…拆分为多条记录入库；同
        doc_code 再次导入将覆盖。版本字段暂留空。表样跳转说明将在后续步骤接入。
      </p>
      <fieldset class="form-section">
        <legend>上传填报说明 Word</legend>
        <div class="form-grid">
          <div class="field span-2">
            <span class="label">Word 文件</span>
            <div
              class="dropzone"
              :class="{ active: fillInstructionDragging }"
              @dragover.prevent="fillInstructionDragging = true"
              @dragleave="fillInstructionDragging = false"
              @drop.prevent="onFillInstructionDrop"
            >
              <p v-if="!fillInstructionFile">
                拖拽 .docx 到此处，或
                <label class="file-link"
                  >选择文件<input
                    type="file"
                    accept=".docx"
                    hidden
                    @change="onFillInstructionFile"
                /></label>
              </p>
              <p v-else>
                {{ fillInstructionFile.name }}
                <button type="button" class="btn-link" @click="fillInstructionFile = null">清除</button>
              </p>
            </div>
          </div>
        </div>
        <div class="inline-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!fillInstructionFile || fillInstructionImporting"
            @click="doFillInstructionImport"
          >
            {{ fillInstructionImporting ? '导入中...' : '导入填报说明' }}
          </button>
          <button type="button" class="btn" :disabled="fillInstructionLoading" @click="refreshFillInstructions">
            刷新列表
          </button>
          <router-link to="/documents" class="btn">查看填报说明</router-link>
        </div>
        <p
          v-if="fillInstructionMessage"
          class="feedback form-template-feedback"
          :class="fillInstructionMessageType"
        >
          {{ fillInstructionMessage }}
        </p>
        <ul v-if="fillInstructionImportItems.length" class="import-result-list">
          <li v-for="item in fillInstructionImportItems" :key="`${item.docCode}-${item.id}`">
            {{ item.docCode }}（{{ item.reportCode || '未关联' }}）
            <span class="muted">{{ item.nodeCount }} 节点</span>
            <span v-if="item.overwritten" class="muted">覆盖</span>
          </li>
        </ul>
      </fieldset>

      <fieldset class="form-section">
        <legend>已导入填报说明</legend>
        <table v-if="fillInstructions.length" class="simple-table">
          <thead>
            <tr>
              <th>说明代号</th>
              <th>对应表样</th>
              <th>标题</th>
              <th>节点数</th>
              <th>导入时间</th>
              <th>源文件</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in fillInstructions" :key="item.id">
              <td>{{ item.docCode }}</td>
              <td>{{ item.reportCode || '—' }}</td>
              <td>{{ item.docTitle }}</td>
              <td>{{ item.nodeCount ?? '—' }}</td>
              <td>{{ item.importedAt }}</td>
              <td>{{ item.sourceFileName }}</td>
              <td>
                <router-link
                  :to="{ name: 'documentDetail', params: { id: item.id } }"
                  class="btn-link"
                >
                  查看
                </router-link>
                <button type="button" class="btn-link danger" @click="removeFillInstruction(item)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-cell">暂无填报说明，请上传合并 Word</p>
      </fieldset>
    </div>

    <!-- 标签：子类配置 -->
    <div v-show="activeTab === 'subtypes'" class="tab-panel config-section">
      <fieldset class="form-section">
        <legend>添加主类</legend>
        <div class="add-row">
          <input v-model="newModule.code" placeholder="code，如 EAST（大写）" />
          <input v-model="newModule.name" placeholder="名称，如 EAST" />
          <button type="button" class="btn" :disabled="saving" @click="addModule">添加主类</button>
        </div>
        <p class="muted">主类用于归类子类，如「一表通」「EAST」。已有子类引用时不可删除。</p>
      </fieldset>

      <fieldset class="form-section">
        <legend>添加子类</legend>
        <div class="add-row">
          <input v-model="newSubtype.code" placeholder="code，如 MY_FAQ（大写+下划线）" />
          <input v-model="newSubtype.name" placeholder="中文名，如 我的答疑" />
          <select v-model="newSubtype.moduleCode">
            <option v-for="m in catalog.modules" :key="m.code" :value="m.code">
              {{ m.name }}
            </option>
          </select>
          <select v-model="newSubtype.category">
            <option v-for="cat in categoryOptions" :key="cat.code" :value="cat.code">
              {{ cat.label }}
            </option>
          </select>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="addSubtype">
            添加子类
          </button>
        </div>
        <p class="muted">code 创建后不可修改；「类型」标签与「主类」无关，用于检索过滤与业务归类。</p>
      </fieldset>

      <fieldset class="form-section">
        <legend>子类列表</legend>
        <table class="simple-table">
          <thead>
            <tr>
              <th>code</th>
              <th>名称</th>
              <th>主类</th>
              <th>类型</th>
              <th>启用</th>
              <th>版本数</th>
              <th>排序</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!catalog.subtypes.length">
              <td colspan="8" class="empty-cell">暂无子类，请先添加</td>
            </tr>
            <tr
              v-for="st in catalog.subtypes"
              :key="st.code"
              :class="{ selected: activeSubtypeCode === st.code }"
              @click="selectSubtype(st.code)"
            >
              <td><code class="code-tag">{{ st.code }}</code></td>
              <td>{{ st.name }}</td>
              <td>{{ st.moduleName || st.moduleCode }}</td>
              <td>{{ st.categoryLabel || getCategoryLabel(st.category) }}</td>
              <td>{{ st.enabled ? '是' : '否' }}</td>
              <td>{{ st.versions?.length || 0 }}</td>
              <td>{{ st.sortOrder }}</td>
              <td>
                <button type="button" class="btn-link danger" @click.stop="removeSubtype(st)">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </fieldset>

      <header class="config-header">
        <h3>版本与字段映射</h3>
        <p class="hint">映射挂在子类版本上；每次导入会替换该版本全部数据。必填项由映射中的勾选决定。</p>
      </header>

      <fieldset class="form-section overview-section">
        <legend>子类与版本总览</legend>
        <div class="filter-bar">
          <label class="field compact">
            <span class="label">筛选子类</span>
            <select v-model="filterSubtypeCode">
              <option value="">全部子类</option>
              <option v-for="st in catalog.subtypes" :key="st.code" :value="st.code">
                {{ st.name }}
              </option>
            </select>
          </label>
          <label class="field compact">
            <span class="label">筛选版本 / Sheet</span>
            <input
              v-model="filterVersionText"
              type="text"
              placeholder="版本号或 Sheet 名关键词"
            />
          </label>
          <label class="check-item">
            <input v-model="filterEnabledOnly" type="checkbox" />
            仅已启用子类
          </label>
          <label class="check-item">
            <input v-model="filterReadyOnly" type="checkbox" />
            仅可导入（已有映射）
          </label>
          <button type="button" class="btn" @click="resetFilters">重置筛选</button>
        </div>
        <p class="overview-summary">
          共 {{ catalog.subtypes.length }} 个子类，{{ totalVersionCount }} 个版本；
          当前显示 <strong>{{ filteredOverviewRows.length }}</strong> 条
          <span v-if="filterSubtypeCode || filterVersionText || filterEnabledOnly || filterReadyOnly">
            （已筛选）
          </span>
        </p>
        <table class="simple-table overview-table">
          <thead>
            <tr>
              <th>子类</th>
              <th>启用</th>
              <th>版本</th>
              <th>Sheet 名</th>
              <th>映射数</th>
              <th>记录数</th>
              <th>默认</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredOverviewRows.length">
              <td colspan="9" class="empty-cell">无匹配项，请调整筛选条件</td>
            </tr>
            <tr
              v-for="row in filteredOverviewRows"
              :key="row.rowKey"
              :class="{
                selected: row.versionId && activeVersionId === row.versionId,
                'no-version': !row.versionId,
              }"
              @click="openOverviewRow(row)"
            >
              <td>{{ row.subtypeName }}</td>
              <td>{{ row.enabled ? '是' : '否' }}</td>
              <td>{{ row.versionLabel }}</td>
              <td>{{ row.sheetName }}</td>
              <td>{{ row.mappingCount }}</td>
              <td>{{ row.recordCount }}</td>
              <td>{{ row.isDefault ? '是' : '' }}</td>
              <td>
                <span class="status-pill" :class="row.statusClass">{{ row.statusText }}</span>
              </td>
              <td>
                <button
                  v-if="row.versionId"
                  type="button"
                  class="btn-link"
                  @click.stop="openOverviewRow(row)"
                >
                  配置
                </button>
                <button v-else type="button" class="btn-link" @click.stop="openOverviewRow(row)">
                  去新建
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </fieldset>

      <div v-if="catalog.subtypes.length" class="config-toolbar">
        <label class="field compact">
          <span class="label">当前子类</span>
          <select v-model="activeSubtypeCode" @change="onSubtypeChange">
            <option v-for="st in catalog.subtypes" :key="st.code" :value="st.code">
              {{ st.name }}{{ st.enabled ? '' : '（未启用）' }}
            </option>
          </select>
        </label>
        <label class="field compact">
          <span class="label">子类名称</span>
          <input v-model="subtypeNameEdit" type="text" />
        </label>
        <label class="field compact">
          <span class="label">所属主类</span>
          <select v-model="subtypeModuleEdit">
            <option v-for="m in catalog.modules" :key="m.code" :value="m.code">
              {{ m.name }}
            </option>
          </select>
        </label>
        <label class="field compact">
          <span class="label">类型标签</span>
          <select v-model="subtypeCategoryEdit">
            <option v-for="cat in categoryOptions" :key="cat.code" :value="cat.code">
              {{ cat.label }}
            </option>
          </select>
        </label>
        <label class="check-item">
          <input
            type="checkbox"
            :checked="activeSubtype?.enabled"
            @change="toggleSubtypeEnabled($event.target.checked)"
          />
          启用该子类
        </label>
        <button type="button" class="btn" :disabled="saving" @click="saveSubtypeInfo">
          保存子类信息
        </button>
      </div>
      <p v-else class="muted">请先添加至少一个子类。</p>

      <p v-if="configMessage" class="feedback" :class="configMessageType">{{ configMessage }}</p>

      <template v-if="activeSubtype">
        <fieldset class="form-section">
          <legend>新建版本（当前子类：{{ activeSubtype.name }}）</legend>
          <div class="add-version">
            <input v-model="newVersion.versionLabel" placeholder="版本号，如 v1" />
            <input v-model="newVersion.sheetName" placeholder="Sheet 名" />
            <label class="check-item"
              ><input v-model="newVersion.isDefault" type="checkbox" />默认</label
            >
            <button type="button" class="btn" @click="addVersion">新建版本</button>
          </div>
        </fieldset>

        <template v-if="versionDetail">
          <fieldset class="form-section">
            <legend>版本设置 — {{ versionDetail.version.versionLabel }}</legend>
            <div class="form-grid">
              <label class="field">
                <span class="label">Sheet 名</span>
                <input v-model="versionForm.sheetName" type="text" />
              </label>
              <label class="field">
                <span class="label">表头行</span>
                <input v-model.number="versionForm.headerRow" type="number" min="1" />
              </label>
              <label class="field">
                <span class="label">数据起始行</span>
                <input v-model.number="versionForm.dataStartRow" type="number" min="2" />
              </label>
              <label class="check-item">
                <input v-model="versionForm.isDefault" type="checkbox" />设为默认版本
              </label>
            </div>
            <div class="inline-actions">
              <button type="button" class="btn" :disabled="saving" @click="saveVersionSettings">
                保存版本设置
              </button>
              <button type="button" class="btn danger" @click="removeActiveVersion">
                删除此版本
              </button>
              <button
                v-if="versionDetail.recordCount > 0"
                type="button"
                class="btn danger"
                @click="clearRecords"
              >
                清空该版本数据（{{ versionDetail.recordCount }}，导入时也会自动清空）
              </button>
            </div>
          </fieldset>

          <fieldset class="form-section">
            <legend>字段映射</legend>
            <p class="muted">
              标准字段共 {{ catalog.standardFields.length }} 个。
              <button type="button" class="btn-link" @click="setTab('fields')">去标准字段标签</button>
              可添加自定义字段。
            </p>
            <MappingRowsTable v-model="mappingRows" :fields="catalog.standardFields" />
            <div class="inline-actions">
              <button type="button" class="btn" @click="addMappingRow">添加映射</button>
              <button type="button" class="btn btn-primary" :disabled="saving" @click="saveMappings">
                保存字段映射
              </button>
            </div>
            <p class="muted">
              拖动左侧 ⋮⋮ 可调整映射顺序，保存后按该顺序写入配置。
              是否必填请在「必填」列勾选；子类、版本由系统在导入时写入。
              标准字段支持输入中文名或 code 搜索后选择。
            </p>
          </fieldset>
        </template>
      </template>
    </div>

    <!-- 标签：标准字段 -->
    <div v-show="activeTab === 'fields'" class="tab-panel">
      <StandardFieldsPanel @changed="refreshCatalog" />
    </div>

    <!-- 标签：数据查看 -->
    <div v-show="activeTab === 'data'" class="tab-panel">
      <VersionDataPanel :catalog="catalog" :active="activeTab === 'data'" />
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StandardFieldsPanel from '../components/import/StandardFieldsPanel.vue';
import VersionDataPanel from '../components/import/VersionDataPanel.vue';
import MappingRowsTable from '../components/import/MappingRowsTable.vue';
import { createMappingRow, toMappingPayload } from '../components/import/mapping-row.js';
import { MATERIAL_CATEGORIES, getCategoryLabel } from '../constants/materialCategories.js';
import {
  clearVersionRecords,
  createSubtype,
  createSubtypeVersion,
  deleteSubtype,
  deleteSubtypeVersion,
  getDatasetCatalog,
  getVersionDetail,
  importDatasetExcel,
  importFormTemplateExcel,
  importFillInstructionDocument,
  listDatasets,
  listFormTemplates,
  listDocuments,
  deleteDocument,
  saveVersionMappings,
  updateSubtype,
  updateSubtypeVersion,
  upsertModule,
} from '../api';

const VALID_TABS = ['import', 'formTemplate', 'fillInstruction', 'subtypes', 'fields', 'data'];

const route = useRoute();
const router = useRouter();

const catalog = ref({ modules: [], standardFields: [], subtypes: [], categories: MATERIAL_CATEGORIES });
const categoryOptions = computed(() =>
  catalog.value.categories?.length ? catalog.value.categories : MATERIAL_CATEGORIES
);
const datasets = ref([]);
const activeSubtypeCode = ref('');
const subtypeNameEdit = ref('');
const subtypeCategoryEdit = ref('norm');
const activeVersionId = ref(null);
const versionDetail = ref(null);
const mappingRows = ref([]);
const saving = ref(false);
const configMessage = ref('');
const configMessageType = ref('');

const file = ref(null);
const description = ref('');
const selectedVersionIds = ref([]);
const importing = ref(false);
const dragging = ref(false);
const importMessage = ref('');
const importMessageType = ref('');
const importResult = ref(null);

const formTemplateFile = ref(null);
const formTemplateDragging = ref(false);
const formTemplateImporting = ref(false);
const formTemplateLoading = ref(false);
const formTemplateMessage = ref('');
const formTemplateMessageType = ref('');
const formTemplateImportItems = ref([]);
const formTemplates = ref([]);

const fillInstructionFile = ref(null);
const fillInstructionDragging = ref(false);
const fillInstructionImporting = ref(false);
const fillInstructionLoading = ref(false);
const fillInstructionMessage = ref('');
const fillInstructionMessageType = ref('');
const fillInstructionImportItems = ref([]);
const fillInstructions = ref([]);

const activeTab = ref(
  VALID_TABS.includes(route.query.tab) ? route.query.tab : 'import'
);

const subtypeModuleEdit = ref('YBT');

const newModule = reactive({ code: '', name: '' });

const newSubtype = reactive({ code: '', name: '', category: 'qa', moduleCode: 'YBT' });

const newVersion = reactive({
  versionLabel: '',
  sheetName: '',
  isDefault: false,
});

const versionForm = reactive({
  sheetName: '',
  headerRow: 1,
  dataStartRow: 2,
  isDefault: false,
});

const filterSubtypeCode = ref('');
const filterVersionText = ref('');
const filterEnabledOnly = ref(false);
const filterReadyOnly = ref(false);

const activeSubtype = computed(() =>
  catalog.value.subtypes.find((s) => s.code === activeSubtypeCode.value)
);

const totalVersionCount = computed(() =>
  catalog.value.subtypes.reduce((n, st) => n + (st.versions?.length || 0), 0)
);

const allOverviewRows = computed(() => {
  const rows = [];
  for (const st of catalog.value.subtypes) {
    const versions = st.versions || [];
    if (!versions.length) {
      rows.push({
        rowKey: `${st.code}__empty`,
        subtypeCode: st.code,
        subtypeName: st.name,
        enabled: st.enabled,
        versionId: null,
        versionLabel: '—',
        sheetName: '—',
        mappingCount: 0,
        recordCount: 0,
        isDefault: false,
        statusText: st.enabled ? '缺版本' : '未启用',
        statusClass: st.enabled ? 'warn' : 'muted',
      });
      continue;
    }
    for (const v of versions) {
      let statusText = '可导入';
      let statusClass = 'ok';
      if (!st.enabled) {
        statusText = '子类未启用';
        statusClass = 'muted';
      } else if (v.mappingCount === 0) {
        statusText = '缺映射';
        statusClass = 'warn';
      }
      rows.push({
        rowKey: `${st.code}__${v.id}`,
        subtypeCode: st.code,
        subtypeName: st.name,
        enabled: st.enabled,
        versionId: v.id,
        versionLabel: v.versionLabel,
        sheetName: v.sheetName,
        mappingCount: v.mappingCount,
        recordCount: v.recordCount,
        isDefault: v.isDefault,
        statusText,
        statusClass,
      });
    }
  }
  return rows;
});

const filteredOverviewRows = computed(() => {
  let rows = allOverviewRows.value;
  if (filterSubtypeCode.value) {
    rows = rows.filter((r) => r.subtypeCode === filterSubtypeCode.value);
  }
  if (filterVersionText.value.trim()) {
    const q = filterVersionText.value.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.versionLabel.toLowerCase().includes(q) ||
        r.sheetName.toLowerCase().includes(q) ||
        r.subtypeName.toLowerCase().includes(q)
    );
  }
  if (filterEnabledOnly.value) {
    rows = rows.filter((r) => r.enabled);
  }
  if (filterReadyOnly.value) {
    rows = rows.filter((r) => r.versionId && r.mappingCount > 0 && r.enabled);
  }
  return rows;
});

const versionOptions = computed(() =>
  catalog.value.subtypes
    .filter((s) => s.enabled)
    .flatMap((s) =>
      (s.versions || [])
        .filter((v) => v.mappingCount > 0)
        .map((v) => ({
          id: v.id,
          label: `${s.name} / ${v.versionLabel}（sheet: ${v.sheetName}）`,
        }))
    )
);

const enabledButNotReady = computed(() =>
  catalog.value.subtypes
    .filter((s) => s.enabled)
    .filter((s) => {
      const versions = s.versions || [];
      if (!versions.length) return true;
      return !versions.some((v) => v.mappingCount > 0);
    })
    .map((s) => s.name)
);

function setTab(tab) {
  if (!VALID_TABS.includes(tab)) return;
  activeTab.value = tab;
  router.replace({ path: '/import', query: { tab } });
}

watch(
  () => route.query.tab,
  (tab) => {
    if (tab && VALID_TABS.includes(tab)) activeTab.value = tab;
  }
);

watch(activeSubtype, (st) => {
  subtypeNameEdit.value = st?.name || '';
  subtypeCategoryEdit.value = st?.category || 'norm';
  subtypeModuleEdit.value = st?.moduleCode || catalog.value.modules[0]?.code || 'YBT';
});

function statusLabel(status) {
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  if (status === 'skipped') return '跳过';
  return status;
}

async function refreshCatalog() {
  catalog.value = await getDatasetCatalog();
  if (activeSubtypeCode.value) {
    const stillExists = catalog.value.subtypes.some((s) => s.code === activeSubtypeCode.value);
    if (!stillExists) {
      activeSubtypeCode.value = '';
      activeVersionId.value = null;
      versionDetail.value = null;
      mappingRows.value = [];
    }
  }
  if (!activeSubtypeCode.value && catalog.value.subtypes.length) {
    activeSubtypeCode.value = catalog.value.subtypes[0].code;
  }
}

async function refreshDatasets() {
  const res = await listDatasets();
  datasets.value = res.items || [];
}

function selectSubtype(code) {
  activeSubtypeCode.value = code;
  onSubtypeChange();
}

async function onSubtypeChange() {
  activeVersionId.value = null;
  versionDetail.value = null;
  mappingRows.value = [];
  configMessage.value = '';
}

async function selectVersion(id) {
  activeVersionId.value = id;
  configMessage.value = '';
  const detail = await getVersionDetail(id);
  versionDetail.value = detail;
  Object.assign(versionForm, {
    sheetName: detail.version.sheetName,
    headerRow: detail.version.headerRow,
    dataStartRow: detail.version.dataStartRow,
    isDefault: detail.version.isDefault,
  });
  mappingRows.value = detail.mappings.map((m) =>
    createMappingRow({
      originalColumn: m.originalColumn,
      standardField: m.standardField,
      isRequired: m.isRequired,
      defaultDisplay: m.defaultDisplay,
    })
  );
}

async function addModule() {
  const code = newModule.code.trim().toUpperCase();
  const name = newModule.name.trim();
  if (!code || !name) {
    configMessageType.value = 'error';
    configMessage.value = '请填写主类 code 与名称';
    return;
  }
  saving.value = true;
  configMessage.value = '';
  try {
    await upsertModule(code, { name, sortOrder: catalog.value.modules.length });
    newModule.code = '';
    newModule.name = '';
    await refreshCatalog();
    configMessageType.value = 'success';
    configMessage.value = `主类「${name}」已添加`;
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '添加失败';
  } finally {
    saving.value = false;
  }
}

async function addSubtype() {
  const code = newSubtype.code.trim();
  const name = newSubtype.name.trim();
  if (!code || !name) {
    configMessageType.value = 'error';
    configMessage.value = '请填写子类 code 与名称';
    return;
  }
  saving.value = true;
  configMessage.value = '';
  try {
    await createSubtype(code, {
      name,
      enabled: false,
      sortOrder: catalog.value.subtypes.length,
      category: newSubtype.category,
      moduleCode: newSubtype.moduleCode,
    });
    newSubtype.code = '';
    newSubtype.name = '';
    newSubtype.category = 'qa';
    newSubtype.moduleCode = catalog.value.modules[0]?.code || 'YBT';
    await refreshCatalog();
    activeSubtypeCode.value = code;
    configMessageType.value = 'success';
    configMessage.value = `子类「${name}」已添加，请继续新建版本并保存映射`;
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '添加失败';
  } finally {
    saving.value = false;
  }
}

async function removeSubtype(st) {
  const versionCount = st.versions?.length || 0;
  const warn =
    versionCount > 0
      ? `子类「${st.name}」含 ${versionCount} 个版本及关联数据，删除后不可恢复，确认？`
      : `确认删除子类「${st.name}」？`;
  if (!confirm(warn)) return;
  saving.value = true;
  configMessage.value = '';
  try {
    await deleteSubtype(st.code);
    if (activeSubtypeCode.value === st.code) {
      activeVersionId.value = null;
      versionDetail.value = null;
      mappingRows.value = [];
    }
    await refreshCatalog();
    await refreshDatasets();
    configMessageType.value = 'success';
    configMessage.value = `已删除子类：${st.code}`;
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '删除失败';
  } finally {
    saving.value = false;
  }
}

async function saveSubtypeInfo() {
  if (!activeSubtype.value) return;
  saving.value = true;
  configMessage.value = '';
  try {
    await updateSubtype(activeSubtypeCode.value, {
      name: subtypeNameEdit.value.trim() || activeSubtype.value.name,
      enabled: activeSubtype.value.enabled,
      sortOrder: activeSubtype.value.sortOrder,
      category: subtypeCategoryEdit.value,
      moduleCode: subtypeModuleEdit.value,
    });
    await refreshCatalog();
    configMessageType.value = 'success';
    configMessage.value = '子类信息已保存';
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

async function toggleSubtypeEnabled(enabled) {
  try {
    await updateSubtype(activeSubtypeCode.value, {
      name: subtypeNameEdit.value.trim() || activeSubtype.value.name,
      enabled,
      sortOrder: activeSubtype.value.sortOrder,
      category: subtypeCategoryEdit.value,
      moduleCode: subtypeModuleEdit.value,
    });
    await refreshCatalog();
    configMessageType.value = 'success';
    configMessage.value = enabled ? '子类已启用' : '子类已停用';
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '保存失败';
  }
}

async function addVersion() {
  try {
    const { version } = await createSubtypeVersion(activeSubtypeCode.value, { ...newVersion });
    newVersion.versionLabel = '';
    newVersion.sheetName = '';
    newVersion.isDefault = false;
    await refreshCatalog();
    await selectVersion(version.id);
    configMessageType.value = 'success';
    configMessage.value = '版本已创建';
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '创建失败';
  }
}

function resetFilters() {
  filterSubtypeCode.value = '';
  filterVersionText.value = '';
  filterEnabledOnly.value = false;
  filterReadyOnly.value = false;
}

async function openOverviewRow(row) {
  activeSubtypeCode.value = row.subtypeCode;
  filterSubtypeCode.value = row.subtypeCode;
  configMessage.value = '';
  if (row.versionId) {
    await selectVersion(row.versionId);
  } else {
    activeVersionId.value = null;
    versionDetail.value = null;
    mappingRows.value = [];
    configMessageType.value = 'warn';
    configMessage.value = `子类「${row.subtypeName}」尚无版本，请在下方新建版本并保存映射。`;
  }
}

async function removeActiveVersion() {
  if (!versionDetail.value?.version) return;
  await removeVersion(versionDetail.value.version);
}

async function removeVersion(v) {
  if (!confirm(`删除版本「${v.versionLabel}」将级联删除映射与数据，确认？`)) return;
  try {
    await deleteSubtypeVersion(v.id);
    if (activeVersionId.value === v.id) {
      activeVersionId.value = null;
      versionDetail.value = null;
    }
    await refreshCatalog();
    await refreshDatasets();
    configMessageType.value = 'success';
    configMessage.value = '版本已删除';
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '删除失败';
  }
}

async function saveVersionSettings() {
  saving.value = true;
  configMessage.value = '';
  try {
    await updateSubtypeVersion(activeVersionId.value, {
      sheetName: versionForm.sheetName,
      headerRow: versionForm.headerRow,
      dataStartRow: versionForm.dataStartRow,
      isDefault: versionForm.isDefault,
    });
    await refreshCatalog();
    await selectVersion(activeVersionId.value);
    configMessageType.value = 'success';
    configMessage.value = '版本设置已保存';
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

async function clearRecords() {
  if (!confirm('确认清空该版本全部导入数据？')) return;
  try {
    await clearVersionRecords(activeVersionId.value);
    await refreshCatalog();
    await refreshDatasets();
    await selectVersion(activeVersionId.value);
    configMessageType.value = 'success';
    configMessage.value = '数据已清空';
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '清空失败';
  }
}

function addMappingRow() {
  mappingRows.value.push(createMappingRow());
}

async function saveMappings() {
  saving.value = true;
  configMessage.value = '';
  try {
    await saveVersionMappings(activeVersionId.value, toMappingPayload(mappingRows.value));
    await refreshCatalog();
    await selectVersion(activeVersionId.value);
    configMessageType.value = 'success';
    configMessage.value = '字段映射已保存';
  } catch (e) {
    configMessageType.value = 'error';
    configMessage.value = e.message || '保存失败';
  } finally {
    saving.value = false;
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
  if (!file.value) return;
  importing.value = true;
  importMessage.value = '';
  importResult.value = null;
  try {
    const result = await importDatasetExcel(file.value, {
      versionIds: selectedVersionIds.value,
      description: description.value,
    });
    importResult.value = result;
    const { summary } = result;
    importMessageType.value =
      summary.failed > 0 && summary.success === 0 ? 'error' : 'success';
    importMessage.value = `完成：成功 ${summary.success} 个 sheet，失败 ${summary.failed}，跳过 ${summary.skipped}；共导入 ${summary.inserted} 行`;
    await refreshCatalog();
    await refreshDatasets();
    if (activeVersionId.value) await selectVersion(activeVersionId.value);
  } catch (e) {
    importMessageType.value = 'error';
    importMessage.value = e.message || '导入失败';
  } finally {
    importing.value = false;
  }
}

function onFormTemplateFile(e) {
  formTemplateFile.value = e.target.files?.[0] || null;
}

function onFormTemplateDrop(e) {
  formTemplateDragging.value = false;
  const f = e.dataTransfer.files?.[0];
  if (f) formTemplateFile.value = f;
}

async function refreshFormTemplates() {
  formTemplateLoading.value = true;
  try {
    const { items } = await listFormTemplates();
    formTemplates.value = items || [];
  } catch (e) {
    formTemplateMessageType.value = 'error';
    formTemplateMessage.value = e.message || '加载表样列表失败';
  } finally {
    formTemplateLoading.value = false;
  }
}

async function doFormTemplateImport() {
  if (!formTemplateFile.value) return;
  formTemplateImporting.value = true;
  formTemplateMessage.value = '';
  formTemplateImportItems.value = [];
  try {
    const result = await importFormTemplateExcel(formTemplateFile.value);
    formTemplateMessageType.value = 'success';
    formTemplateMessage.value = result.message || '导入成功';
    formTemplateImportItems.value =
      result.sheetCount > 1 && Array.isArray(result.items) ? result.items : [];
    formTemplateFile.value = null;
    await refreshFormTemplates();
  } catch (e) {
    formTemplateMessageType.value = 'error';
    formTemplateMessage.value = e.message || '导入失败';
    formTemplateImportItems.value = [];
  } finally {
    formTemplateImporting.value = false;
  }
}

function onFillInstructionFile(e) {
  fillInstructionFile.value = e.target.files?.[0] || null;
}

function onFillInstructionDrop(e) {
  fillInstructionDragging.value = false;
  const f = e.dataTransfer.files?.[0];
  if (f) fillInstructionFile.value = f;
}

async function refreshFillInstructions() {
  fillInstructionLoading.value = true;
  try {
    const { items } = await listDocuments();
    fillInstructions.value = items || [];
  } catch (e) {
    fillInstructionMessageType.value = 'error';
    fillInstructionMessage.value = e.message || '加载填报说明列表失败';
  } finally {
    fillInstructionLoading.value = false;
  }
}

async function doFillInstructionImport() {
  if (!fillInstructionFile.value) return;
  fillInstructionImporting.value = true;
  fillInstructionMessage.value = '';
  fillInstructionImportItems.value = [];
  try {
    const result = await importFillInstructionDocument(fillInstructionFile.value);
    fillInstructionMessageType.value = 'success';
    fillInstructionMessage.value = result.message || '导入成功';
    fillInstructionImportItems.value = Array.isArray(result.items) ? result.items : [];
    fillInstructionFile.value = null;
    await refreshFillInstructions();
  } catch (e) {
    fillInstructionMessageType.value = 'error';
    fillInstructionMessage.value = e.message || '导入失败';
    fillInstructionImportItems.value = [];
  } finally {
    fillInstructionImporting.value = false;
  }
}

async function removeFillInstruction(item) {
  if (!item?.id) return;
  if (!window.confirm(`确定删除填报说明 ${item.docCode}？`)) return;
  try {
    await deleteDocument(item.id);
    fillInstructionMessageType.value = 'success';
    fillInstructionMessage.value = `已删除 ${item.docCode}`;
    await refreshFillInstructions();
  } catch (e) {
    fillInstructionMessageType.value = 'error';
    fillInstructionMessage.value = e.message || '删除失败';
  }
}

onMounted(async () => {
  await refreshCatalog();
  await refreshDatasets();
  await refreshFormTemplates();
  await refreshFillInstructions();
});
</script>

<style scoped>
.import-page {
  max-width: 100%;
  min-width: 0;
}

.page-intro {
  margin-bottom: 16px;
}

.tab-panel {
  margin-top: 8px;
  min-width: 0;
}

.add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  align-items: center;
}

.config-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: end;
  margin: 12px 0;
}

.field.compact {
  min-width: 200px;
}

.version-checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.overview-section {
  margin-top: 12px;
}

.overview-summary {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.overview-table tbody tr.no-version {
  background: #fffbeb;
}

.empty-cell {
  text-align: center;
  color: var(--text-muted);
  padding: 16px;
}

.import-result-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0 12px;
  font-size: 13px;
}

.import-result-list li {
  padding: 4px 0;
}

.form-template-feedback {
  margin-bottom: 4px;
}

.config-header h3 {
  margin: 16px 0 6px;
  font-size: 15px;
  font-weight: 600;
}

.add-version {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}

.log-section {
  margin-top: 24px;
}

.log-section h3 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}

.sheet-results h4 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}

.file-link {
  color: var(--accent-blue);
  cursor: pointer;
  text-decoration: underline;
}

.btn.danger,
.btn-link.danger {
  color: #b91c1c;
}

.status.success {
  color: #047857;
}

.status.failed {
  color: #b91c1c;
}

.status.skipped {
  color: #b45309;
}

.center {
  text-align: center;
}
</style>
