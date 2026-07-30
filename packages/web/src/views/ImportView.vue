<template>
  <section class="import-page">
    <p class="hint page-intro">
        选择资料子类后上传对应文件。配置类须先在「子类配置」中完成版本与字段映射；表样 Excel / Word / SQL / 码值等还原类子类选定解析方式后可直接导入。
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
        :class="{ active: activeTab === 'data' }"
        :aria-selected="activeTab === 'data'"
        @click="setTab('data')"
      >
        数据查看
      </button>
    </nav>

    <!-- 标签：资料导入 -->
    <div v-if="activeTab === 'import'" class="tab-panel">
      <fieldset class="form-section import-subtype-picker">
        <legend>选择资料子类</legend>
        <div class="form-grid">
          <label class="field span-2">
            <span class="label">目标子类</span>
            <select v-model="importSubtypeCode">
              <optgroup v-for="group in importSubtypeGroups" :key="group.code" :label="group.name">
                <option v-for="st in group.subtypes" :key="st.code" :value="st.code">
                  {{ st.name }} · {{ st.storageKindLabel || st.storageKind }} ·
                  {{ st.categoryLabel || getCategoryLabel(st.category) }}
                  {{ st.enabled ? '' : '（未启用）' }}
                </option>
              </optgroup>
            </select>
          </label>
        </div>
        <p v-if="selectedImportSubtype" class="muted import-subtype-hint">
          主类 {{ selectedImportSubtype.moduleName || selectedImportSubtype.moduleCode }} ·
          标签 {{ selectedImportSubtype.categoryLabel || getCategoryLabel(selectedImportSubtype.category) }} ·
          形态 {{ selectedImportSubtype.storageKindLabel || selectedImportSubtype.storageKind }}
          <template v-if="importStorageKind === 'excel'">
            · 须在子类配置中启用并完成字段映射
          </template>
        </p>
        <p v-if="selectedImportSubtype && !selectedImportSubtype.enabled" class="feedback error">
          该子类未启用。
          <button type="button" class="btn-link" @click="setTab('subtypes')">去子类配置启用</button>
        </p>
      </fieldset>

      <div v-if="importStorageKind === 'excel'">
      <fieldset class="form-section">
        <legend>上传 Excel</legend>
        <div class="form-grid">
          <div class="field span-2">
            <span class="label">目标子类版本（可多选，优先于仅按 Sheet 名匹配）</span>
            <p v-if="!versionOptions.length" class="feedback error">
              当前没有可导入的版本。已启用子类须先完成：<strong>新建版本 → 保存字段映射</strong>（映射数 &gt; 0 后才会出现在此处）。
              <span v-if="enabledButNotReady.length">待完成：{{ enabledButNotReady.join('、') }}</span>
              <button type="button" class="btn-link" @click="setTab('subtypes')">去子类配置</button>
            </p>
            <template v-else>
              <div v-if="importModuleTabs.length > 1" class="import-module-tabs" role="tablist">
                <button
                  v-for="mod in importModuleTabs"
                  :key="mod.code"
                  type="button"
                  role="tab"
                  class="import-module-tab"
                  :class="{ active: importModuleFilter === mod.code }"
                  :aria-selected="importModuleFilter === mod.code"
                  @click="importModuleFilter = mod.code"
                >
                  {{ mod.name }}
                  <span class="tab-count">{{ mod.count }}</span>
                  <span
                    v-if="mod.selectedCount"
                    class="tab-selected"
                    :title="`本主类已选 ${mod.selectedCount} 个`"
                  >
                    ·已选{{ mod.selectedCount }}
                  </span>
                </button>
              </div>
              <div class="version-checks-toolbar">
                <span class="muted">
                  当前主类 {{ filteredVersionOptions.length }} 个版本
                  <template v-if="selectedVersionIds.length">
                    · 全部已选 <strong>{{ selectedVersionIds.length }}</strong>
                  </template>
                </span>
                <div class="version-checks-actions">
                  <button type="button" class="btn-link" @click="selectAllFilteredVersions">
                    全选当前主类
                  </button>
                  <button type="button" class="btn-link" @click="clearFilteredVersions">
                    清空当前主类
                  </button>
                  <button
                    v-if="selectedVersionIds.length"
                    type="button"
                    class="btn-link"
                    @click="selectedVersionIds = []"
                  >
                    清空全部已选
                  </button>
                </div>
              </div>
              <div class="version-checks">
                <label v-for="opt in filteredVersionOptions" :key="opt.id" class="check-item">
                  <input v-model="selectedVersionIds" type="checkbox" :value="opt.id" />
                  <span>{{ opt.label }}</span>
                </label>
                <p v-if="!filteredVersionOptions.length" class="muted">该主类下暂无可导入版本</p>
              </div>
            </template>
          </div>
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

      <div v-if="importStorageKind === 'form_template'" class="import-kind-panel">
      <p class="hint">
        上传汇总指标表样 Excel。导入前须选择模块（与子类配置中的主类一致）。仅导入 Sheet 名以字母开头且可解析表号的
        Sheet（如 G0100_231、S2400_201、NR0100_231）；Sheet 名带 _版本 则写入版本，否则版本留空。逻辑公式自动清空；同表号+版本+模块已存在时需先删除再导入。
      </p>
      <fieldset class="form-section">
        <legend>上传表样 Excel</legend>
        <div class="form-grid">
          <label class="field">
            <span class="label">模块 <span class="required">*</span></span>
            <select v-model="formTemplateModuleCode" :disabled="Boolean(selectedImportSubtype?.moduleCode)">
              <option v-for="mod in formTemplateModules" :key="mod.code" :value="mod.code">
                {{ mod.name }}
              </option>
            </select>
          </label>
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
            :disabled="!formTemplateFile || !formTemplateModuleCode || formTemplateImporting"
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
          <li v-for="(item, idx) in formTemplateImportItems" :key="`${item.reportCode}-${item.versionLabel}-${idx}`">
            <span class="import-action-tag" :class="item.importAction">
              {{ item.importAction === 'replaced' ? '覆盖' : '新增' }}
            </span>
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
              <th>模块</th>
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
              <td>{{ item.moduleCode || '—' }}</td>
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

      <div v-if="importStorageKind === 'script'" class="import-kind-panel">
      <p class="hint">
        上传转 1104 SQL/TXT 脚本。须选择模块（与子类配置主类一致）。文件名格式为「表号_版本.sql/.txt」或「表号.sql/.txt」（无版本时记为
        LASTEST）。同模块+表号+版本再次导入将覆盖。删除请在本页已导入列表中操作。
      </p>
      <fieldset class="form-section">
        <legend>上传脚本</legend>
        <div class="form-grid">
          <label class="field">
            <span class="label">模块 <span class="required">*</span></span>
            <select v-model="conversionScriptModuleCode">
              <option v-for="mod in conversionScriptModules" :key="mod.code" :value="mod.code">
                {{ mod.name }}
              </option>
            </select>
          </label>
          <div class="field span-2">
            <span class="label">脚本文件（.sql / .txt）</span>
            <div
              class="dropzone"
              :class="{ active: conversionScriptDragging }"
              @dragover.prevent="conversionScriptDragging = true"
              @dragleave="conversionScriptDragging = false"
              @drop.prevent="onConversionScriptDrop"
            >
              <p v-if="!conversionScriptFile">
                拖拽文件到此处，或
                <label class="file-link"
                  >选择文件<input
                    type="file"
                    accept=".sql,.txt"
                    hidden
                    @change="onConversionScriptFile"
                /></label>
              </p>
              <p v-else>
                {{ conversionScriptFile.name }}
                <button type="button" class="btn-link" @click="conversionScriptFile = null">清除</button>
              </p>
            </div>
          </div>
        </div>
        <div class="inline-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!conversionScriptFile || !conversionScriptModuleCode || conversionScriptImporting"
            @click="doConversionScriptImport"
          >
            {{ conversionScriptImporting ? '导入中...' : '导入脚本' }}
          </button>
          <button type="button" class="btn" :disabled="conversionScriptLoading" @click="refreshConversionScripts">
            刷新列表
          </button>
          <router-link to="/conversion-scripts" class="btn">查询脚本</router-link>
        </div>
        <p
          v-if="conversionScriptMessage"
          class="feedback form-template-feedback"
          :class="conversionScriptMessageType"
        >
          {{ conversionScriptMessage }}
        </p>
      </fieldset>

      <fieldset class="form-section">
        <legend>已导入脚本</legend>
        <table v-if="conversionScripts.length" class="simple-table">
          <thead>
            <tr>
              <th>模块</th>
              <th>表号</th>
              <th>文件名</th>
              <th>版本</th>
              <th>导入时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in conversionScripts" :key="item.id">
              <td>{{ moduleNameByCode(item.moduleCode) }}</td>
              <td>{{ item.reportCode }}</td>
              <td>{{ item.sourceFileName }}</td>
              <td>{{ item.versionLabel }}</td>
              <td>{{ item.importedAt }}</td>
              <td>
                <router-link
                  :to="{ name: 'conversionScriptDetail', params: { id: item.id } }"
                  class="btn-link"
                >
                  查看
                </router-link>
                <button type="button" class="btn-link danger" @click="removeConversionScript(item)">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-cell">暂无脚本，请上传 .sql 或 .txt 文件</p>
      </fieldset>
      </div>

      <div v-if="importStorageKind === 'document'" class="import-kind-panel">
      <p class="hint">
        上传填报说明 Word（.docx）。系统自动识别合并填报说明或 IMAS 采集规范等格式，按表号拆分为多条记录；
        无法识别切分锚点时将整本导入为 1 条。Word 内表格不解析，显示「表样见 xx Excel 导入」。同 doc_code
        再次导入将覆盖。
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
          <router-link to="/" class="btn">去首页查询</router-link>
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
                <router-link :to="{ path: '/', query: { q: item.docCode || '' } }" class="btn-link">
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

      <div v-if="importStorageKind === 'code_value'" class="import-kind-panel">
        <CodeValuesPanel
          :modules="catalog.modules"
          :fixed-module-code="selectedImportSubtype?.moduleCode || ''"
          :lock-module="Boolean(selectedImportSubtype?.moduleCode)"
          :subtype-code="selectedImportSubtype?.code || ''"
          :initial-dict-name="String(route.query.dictName || '')"
        />
      </div>
    </div>

    <!-- 标签：子类配置 -->
    <div v-if="activeTab === 'subtypes'" class="tab-panel config-section subtype-config">
      <div class="flow-guide">
        <div class="flow-guide-title">配置流程</div>
        <ol class="flow-steps">
          <li :class="{ done: catalog.modules.length > 0 && catalog.subtypes.length > 0 }">
            <span class="step-no">1</span>
            <span class="step-text">建主类 / 子类</span>
          </li>
          <li :class="{ done: totalVersionCount > 0, current: catalog.subtypes.length > 0 && !activeVersionId }">
            <span class="step-no">2</span>
            <span class="step-text">新建版本</span>
          </li>
          <li :class="{ done: hasReadyVersion, current: Boolean(activeVersionId) }">
            <span class="step-no">3</span>
            <span class="step-text">配置字段映射</span>
          </li>
          <li :class="{ done: hasReadyVersion, current: hasReadyVersion && !activeVersionId }">
            <span class="step-no">4</span>
            <span class="step-text">启用子类 → 去「资料导入」</span>
          </li>
        </ol>
        <p class="flow-hint">
          一个子类可有多个版本；映射挂在版本上。新建版本会默认复制上一版本的字段映射。
        </p>
      </div>

      <!-- 步骤 1 -->
      <section class="config-card">
        <header class="config-card-head">
          <span class="card-step">步骤 1</span>
          <div>
            <h3>主类与子类</h3>
            <p>先有主类（如一表通、EAST），再在主类下添加子类，并选择解析方式（配置类 / 表样 Excel / Word / SQL / 码值）。</p>
          </div>
        </header>

        <div class="config-card-body">
          <p v-if="step1Message" class="feedback step-feedback" :class="step1MessageType">
            {{ step1Message }}
          </p>
          <div class="setup-block tags-reference">
            <h4>资料类型标签（系统维护，新增需改代码）</h4>
            <ul class="tag-chip-list">
              <li v-for="cat in categoryOptions" :key="cat.code" class="tag-chip">
                {{ cat.label }}
                <code class="code-tag">{{ cat.code }}</code>
              </li>
            </ul>
          </div>
          <div class="setup-grid">
            <div class="setup-block">
              <h4>添加主类</h4>
              <div class="form-grid-2">
                <label class="field">
                  <span class="label">code</span>
                  <input v-model="newModule.code" placeholder="如 EAST（大写）" />
                </label>
                <label class="field">
                  <span class="label">名称</span>
                  <input v-model="newModule.name" placeholder="如 EAST" />
                </label>
              </div>
              <button type="button" class="btn" :disabled="saving" @click="addModule">添加主类</button>
              <p class="muted">已有子类引用的主类不可删除。</p>
            </div>

            <div class="setup-block">
              <h4>添加子类</h4>
              <div class="form-grid-2">
                <label class="field">
                  <span class="label">code</span>
                  <input v-model="newSubtype.code" placeholder="如 MY_FAQ（大写+下划线）" />
                </label>
                <label class="field">
                  <span class="label">中文名</span>
                  <input v-model="newSubtype.name" placeholder="如 我的答疑" />
                </label>
                <label class="field">
                  <span class="label">所属主类</span>
                  <select v-model="newSubtype.moduleCode">
                    <option v-for="m in catalog.modules" :key="m.code" :value="m.code">
                      {{ m.name }}
                    </option>
                  </select>
                </label>
                <label class="field">
                  <span class="label">解析方式</span>
                  <select v-model="newSubtype.storageKind">
                    <option v-for="kind in parseKindOptions" :key="kind.code" :value="kind.code">
                      {{ kind.label }}
                    </option>
                  </select>
                </label>
                <label class="field">
                  <span class="label">类型标签</span>
                  <select v-model="newSubtype.category">
                    <option v-for="cat in categoryOptions" :key="cat.code" :value="cat.code">
                      {{ cat.label }}
                    </option>
                  </select>
                </label>
              </div>
              <p v-if="newSubtypeParseHint" class="muted">{{ newSubtypeParseHint }}</p>
              <button type="button" class="btn btn-primary" :disabled="saving" @click="addSubtype">
                添加子类
              </button>
              <p class="muted">code 创建后不可改；解析方式创建后不可改。配置类须配置版本与字段映射，还原类可直接导入。</p>
            </div>
          </div>

          <div class="subtype-list-block">
            <div class="block-title-row">
              <h4>子类列表</h4>
              <span class="muted">点击一行，进入下方步骤 2 / 3 配置</span>
            </div>
            <table class="simple-table">
              <thead>
                <tr>
                  <th>code</th>
                  <th>名称</th>
                  <th>主类</th>
                  <th>类型</th>
                  <th>形态</th>
                  <th>启用</th>
                  <th>版本数</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!catalog.subtypes.length">
                  <td colspan="8" class="empty-cell">暂无子类，请先在上方添加</td>
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
                  <td>{{ st.storageKindLabel || st.storageKind || 'excel' }}</td>
                  <td>{{ st.enabled ? '是' : '否' }}</td>
                  <td>{{ st.versions?.length || 0 }}</td>
                  <td>
                    <button
                      type="button"
                      class="btn-link danger"
                      @click.stop="removeSubtype(st)"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        v-if="activeSubtype && !isExcelStorageKind(activeSubtype.storageKind)"
        class="config-card"
      >
        <header class="config-card-head">
          <span class="card-step">还原类</span>
          <div>
            <h3>{{ activeSubtype.name }} · {{ activeSubtype.storageKindLabel }}</h3>
            <p>还原类无需版本与字段映射。保存启用后，在「资料导入」选择该子类上传文件。</p>
          </div>
        </header>
        <div class="config-card-body work-context">
          <label class="field">
            <span class="label">子类名称</span>
            <input v-model="subtypeNameEdit" type="text" />
          </label>
          <label class="field">
            <span class="label">所属主类</span>
            <select v-model="subtypeModuleEdit">
              <option v-for="m in catalog.modules" :key="m.code" :value="m.code">
                {{ m.name }}
              </option>
            </select>
          </label>
          <label class="field">
            <span class="label">类型标签</span>
            <select v-model="subtypeCategoryEdit">
              <option v-for="cat in categoryOptions" :key="cat.code" :value="cat.code">
                {{ cat.label }}
              </option>
            </select>
          </label>
          <label class="field readonly-field">
            <span class="label">解析方式</span>
            <input :value="activeSubtype.storageKindLabel" type="text" readonly />
          </label>
          <label class="check-item enable-check">
            <input
              type="checkbox"
              :checked="activeSubtype.enabled"
              @change="toggleSubtypeEnabled($event.target.checked)"
            />
            启用该子类
          </label>
          <button type="button" class="btn" :disabled="saving" @click="saveSubtypeInfo">
            保存子类信息
          </button>
          <button type="button" class="btn btn-primary" @click="setTab('import', { subtype: activeSubtype.code })">
            去资料导入
          </button>
        </div>
      </section>

      <!-- 步骤 2 -->
      <section class="config-card">
        <header class="config-card-head">
          <span class="card-step">步骤 2</span>
          <div>
            <h3>版本总览</h3>
            <p>查看各<strong>配置类</strong>子类版本状态；点击「配置 / 去新建」进入步骤 3。</p>
          </div>
        </header>

        <div class="config-card-body">
          <p v-if="step2Message" class="feedback step-feedback" :class="step2MessageType">
            {{ step2Message }}
          </p>
          <div class="filter-bar">
            <label class="field compact">
              <span class="label">筛选子类</span>
              <select v-model="filterSubtypeCode">
                <option value="">全部子类</option>
                <option v-for="st in excelSubtypes" :key="st.code" :value="st.code">
                  {{ st.name }}
                </option>
              </select>
            </label>
            <label class="field compact">
              <span class="label">版本 / Sheet</span>
              <input
                v-model="filterVersionText"
                type="text"
                placeholder="版本号或 Sheet 名"
              />
            </label>
            <label class="check-item">
              <input v-model="filterEnabledOnly" type="checkbox" />
              仅已启用
            </label>
            <label class="check-item">
              <input v-model="filterReadyOnly" type="checkbox" />
              仅可导入
            </label>
            <button type="button" class="btn" @click="resetFilters">重置</button>
          </div>
          <p class="overview-summary">
            共 {{ excelSubtypes.length }} 个 Excel 子类 · {{ totalVersionCount }} 个版本 ·
            显示 <strong>{{ filteredOverviewRows.length }}</strong> 条
          </p>
          <table class="simple-table overview-table">
            <thead>
              <tr>
                <th>子类</th>
                <th>启用</th>
                <th>版本</th>
                <th>版本日期</th>
                <th>Sheet</th>
                <th>映射</th>
                <th>记录</th>
                <th>默认</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!filteredOverviewRows.length">
                <td colspan="10" class="empty-cell">无匹配项</td>
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
                <td>{{ row.versionDate || '—' }}</td>
                <td>{{ row.sheetName }}</td>
                <td>{{ row.mappingCount }}</td>
                <td>{{ row.recordCount }}</td>
                <td>{{ row.isDefault ? '是' : '' }}</td>
                <td>
                  <span class="status-pill" :class="row.statusClass">{{ row.statusText }}</span>
                </td>
                <td>
                  <button type="button" class="btn-link" @click.stop="openOverviewRow(row)">
                    {{ row.versionId ? '配置' : '去新建' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 步骤 3 -->
      <section class="config-card config-card-work">
        <header class="config-card-head">
          <span class="card-step">步骤 3</span>
          <div>
            <h3>版本设置与字段映射</h3>
            <p>选定<strong>配置类</strong>子类与版本后，配置 Excel 列到标准字段的映射。</p>
          </div>
        </header>

        <div class="config-card-body">
          <p v-if="step3Message" class="feedback step-feedback" :class="step3MessageType">
            {{ step3Message }}
          </p>
          <p v-if="!catalog.subtypes.length" class="empty-panel">
            请先完成步骤 1，添加至少一个子类。
          </p>
          <p
            v-else-if="activeSubtype && !isExcelStorageKind(activeSubtype.storageKind)"
            class="empty-panel"
          >
            当前选中的是还原类子类「{{ activeSubtype.name }}」，请使用上方还原类配置区；步骤 3 仅用于配置类。
          </p>

          <template v-else>
            <div class="work-context">
              <label class="field">
                <span class="label">当前子类</span>
                <select v-model="activeSubtypeCode" @change="onSubtypeChange">
                  <option v-for="st in excelSubtypes" :key="st.code" :value="st.code">
                    {{ st.name }}{{ st.enabled ? '' : '（未启用）' }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span class="label">子类名称</span>
                <input v-model="subtypeNameEdit" type="text" />
              </label>
              <label class="field">
                <span class="label">所属主类</span>
                <select v-model="subtypeModuleEdit">
                  <option v-for="m in catalog.modules" :key="m.code" :value="m.code">
                    {{ m.name }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span class="label">类型标签</span>
                <select v-model="subtypeCategoryEdit">
                  <option v-for="cat in categoryOptions" :key="cat.code" :value="cat.code">
                    {{ cat.label }}
                  </option>
                </select>
              </label>
              <label class="check-item enable-check">
                <input
                  type="checkbox"
                  :checked="activeSubtype?.enabled"
                  @change="toggleSubtypeEnabled($event.target.checked)"
                />
                启用该子类（导入前须启用）
              </label>
              <button type="button" class="btn" :disabled="saving" @click="saveSubtypeInfo">
                保存子类信息
              </button>
            </div>

            <template v-if="activeSubtype">
              <div v-if="activeSubtypeVersions.length" class="version-picker-bar">
                <label class="field">
                  <span class="label">当前配置版本</span>
                  <select :value="activeVersionId ?? ''" @change="onActiveVersionChange">
                    <option v-for="v in activeSubtypeVersions" :key="v.id" :value="v.id">
                      {{ v.versionLabel }}（Sheet: {{ v.sheetName || '—' }} · 映射
                      {{ v.mappingCount ?? 0 }}）
                      {{ v.isDefault ? '· 默认' : '' }}
                    </option>
                  </select>
                </label>
                <p class="muted version-picker-hint">
                  下方「版本设置」与「字段映射」均作用于所选版本；保存字段映射后，资料导入时按 Sheet
                  名匹配该版本。
                </p>
              </div>
              <p v-else class="muted version-picker-empty">
                当前子类尚无版本，请先在下方「3.1 新建版本」创建。
              </p>

              <div class="work-split">
                <div class="work-panel">
                  <h4>3.1 新建版本</h4>
                  <div class="form-grid-2">
                    <label class="field">
                      <span class="label">版本号</span>
                      <input v-model="newVersion.versionLabel" placeholder="如 v1 / 202601" />
                    </label>
                    <label class="field">
                      <span class="label">Sheet 名</span>
                      <input v-model="newVersion.sheetName" placeholder="Excel 中的 Sheet 名称" />
                    </label>
                    <label class="field">
                      <span class="label">版本日期</span>
                      <input v-model="newVersion.versionDate" type="date" />
                    </label>
                    <label class="check-item enable-check">
                      <input v-model="newVersion.isDefault" type="checkbox" />
                      设为默认版本
                    </label>
                  </div>
                  <button type="button" class="btn btn-primary" @click="addVersion">新建版本</button>
                  <p class="muted">
                    当前子类：{{ activeSubtype.name }}。若已有版本，新建时会复制上一版字段映射。
                  </p>

                  <template v-if="versionDetail">
                    <h4 class="panel-subhead">
                      3.2 版本设置
                      <code class="code-tag">{{ versionDetail.version.versionLabel }}</code>
                    </h4>
                    <div class="form-grid-2">
                      <label class="field">
                        <span class="label">Sheet 名</span>
                        <input v-model="versionForm.sheetName" type="text" />
                      </label>
                      <label class="field">
                        <span class="label">版本日期</span>
                        <input v-model="versionForm.versionDate" type="date" />
                      </label>
                      <label class="field">
                        <span class="label">表头行</span>
                        <input v-model.number="versionForm.headerRow" type="number" min="1" />
                      </label>
                      <label class="field">
                        <span class="label">数据起始行</span>
                        <input v-model.number="versionForm.dataStartRow" type="number" min="2" />
                      </label>
                      <label class="check-item enable-check">
                        <input v-model="versionForm.isDefault" type="checkbox" />
                        设为默认版本
                      </label>
                    </div>
                    <div class="inline-actions">
                      <button
                        type="button"
                        class="btn"
                        :disabled="saving"
                        @click="saveVersionSettings"
                      >
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
                        清空数据（{{ versionDetail.recordCount }}）
                      </button>
                    </div>
                  </template>
                  <p v-else class="empty-panel soft">请先新建版本，或在上方选择要配置的版本。</p>
                </div>

                <div class="work-panel mapping-panel">
                  <h4>
                    3.3 字段映射
                    <span v-if="versionDetail" class="muted">
                      · {{ versionDetail.version.versionLabel }}
                    </span>
                  </h4>
                  <template v-if="versionDetail">
                    <p class="muted">
                      标准字段共 {{ catalog.standardFields.length }} 个。
                      「默认筛选」会在查询该子类时预填筛选列（条件为包含、值为空，不实际过滤）。
                      <button type="button" class="btn-link" @click="setTab('fields')">
                        管理标准字段
                      </button>
                    </p>
                    <MappingRowsTable v-model="mappingRows" :fields="catalog.standardFields" />
                    <div class="inline-actions">
                      <button type="button" class="btn" @click="addMappingRow">添加映射</button>
                      <button
                        type="button"
                        class="btn btn-primary"
                        :disabled="saving"
                        @click="saveMappings"
                      >
                        保存字段映射
                      </button>
                    </div>
                    <p class="muted">
                      拖动 ⋮⋮ 调整顺序；勾选「必填」。映射数 &gt; 0 且子类已启用后，即可在「资料导入」中上传
                      Excel。
                    </p>
                  </template>
                  <p v-else class="empty-panel soft">选定版本后，在此配置 Excel 列与标准字段的对应关系。</p>
                </div>
              </div>
            </template>
          </template>
        </div>
      </section>

      <!-- 步骤 4 -->
      <section class="config-card">
        <header class="config-card-head">
          <span class="card-step">步骤 4</span>
          <div>
            <h3>启用并去导入</h3>
            <p>子类已启用、版本字段映射 &gt; 0 后，即可在「资料导入」上传 Excel。</p>
          </div>
        </header>
        <div class="config-card-body">
          <p v-if="hasReadyVersion" class="status success">
            已有可导入版本。请到「资料导入」选择对应子类与版本上传文件。
          </p>
          <p v-else class="muted">
            尚未就绪：请确认步骤 3 已保存字段映射，并勾选「启用该子类」。
          </p>
          <div class="inline-actions">
            <button type="button" class="btn btn-primary" @click="setTab('import')">
              去资料导入
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- 标签：标准字段 -->
    <div v-if="activeTab === 'fields'" class="tab-panel">
      <StandardFieldsPanel @changed="refreshCatalog" />
    </div>

    <!-- 标签：数据查看 -->
    <div v-if="activeTab === 'data'" class="tab-panel">
      <VersionDataPanel :catalog="catalog" :active="activeTab === 'data'" />
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StandardFieldsPanel from '../components/import/StandardFieldsPanel.vue';
import CodeValuesPanel from '../components/import/CodeValuesPanel.vue';
import VersionDataPanel from '../components/import/VersionDataPanel.vue';
import MappingRowsTable from '../components/import/MappingRowsTable.vue';
import { createMappingRow, toMappingPayload } from '../components/import/mapping-row.js';
import { MATERIAL_CATEGORIES, getCategoryLabel } from '../constants/materialCategories.js';
import {
  SUBTYPE_PARSE_KINDS,
  getParseKindHint,
} from '../constants/subtypeParseKinds.js';
import {
  IMPORT_TABS,
  resolveImportTabFromRoute,
  isExcelStorageKind,
} from '../constants/importRouting.js';
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
  importConversionScriptFile,
  listDatasets,
  listFormTemplates,
  listConversionScripts,
  listDocuments,
  deleteDocument,
  deleteConversionScript,
  saveVersionMappings,
  updateSubtype,
  updateSubtypeVersion,
  upsertModule,
} from '../api';

const VALID_TABS = IMPORT_TABS;

const route = useRoute();
const router = useRouter();

const catalog = ref({
  modules: [],
  standardFields: [],
  subtypes: [],
  categories: MATERIAL_CATEGORIES,
  storageKinds: [],
});
const importSubtypeCode = ref('');
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
const step1Message = ref('');
const step1MessageType = ref('');
const step2Message = ref('');
const step2MessageType = ref('');
const step3Message = ref('');
const step3MessageType = ref('');

function setStepMessage(step, type, message) {
  if (step === 1) {
    step1MessageType.value = type;
    step1Message.value = message;
  } else if (step === 2) {
    step2MessageType.value = type;
    step2Message.value = message;
  } else if (step === 3) {
    step3MessageType.value = type;
    step3Message.value = message;
  }
}

function clearStepMessage(step) {
  setStepMessage(step, '', '');
}

const file = ref(null);
const description = ref('');
const selectedVersionIds = ref([]);
const importing = ref(false);
const dragging = ref(false);
const importMessage = ref('');
const importMessageType = ref('');
const importResult = ref(null);

const formTemplateFile = ref(null);
const formTemplateModuleCode = ref('1104');
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

const conversionScriptFile = ref(null);
const conversionScriptModuleCode = ref('YBT');
const conversionScriptDragging = ref(false);
const conversionScriptImporting = ref(false);
const conversionScriptLoading = ref(false);
const conversionScriptMessage = ref('');
const conversionScriptMessageType = ref('');
const conversionScripts = ref([]);

const activeTab = ref(resolveImportTabFromRoute(route.query).tab);

const subtypeModuleEdit = ref('YBT');

const newModule = reactive({ code: '', name: '' });

const newSubtype = reactive({
  code: '',
  name: '',
  category: 'qa',
  moduleCode: 'YBT',
  storageKind: 'excel',
});

const parseKindOptions = computed(() => {
  if (catalog.value.creatableStorageKinds?.length) {
    return catalog.value.creatableStorageKinds;
  }
  return SUBTYPE_PARSE_KINDS.map(({ code, label }) => ({ code, label }));
});

const newSubtypeParseHint = computed(() => getParseKindHint(newSubtype.storageKind));

const newVersion = reactive({
  versionLabel: '',
  sheetName: '',
  versionDate: '',
  isDefault: false,
});

const versionForm = reactive({
  sheetName: '',
  versionDate: '',
  headerRow: 1,
  dataStartRow: 2,
  isDefault: false,
});

const filterSubtypeCode = ref('');
const filterVersionText = ref('');
const filterEnabledOnly = ref(false);
const filterReadyOnly = ref(false);

const excelSubtypes = computed(() =>
  catalog.value.subtypes.filter((st) => isExcelStorageKind(st.storageKind))
);

const importableSubtypes = computed(() => catalog.value.subtypes);

const importSubtypeGroups = computed(() => {
  const byModule = new Map();
  for (const st of importableSubtypes.value) {
    const code = st.moduleCode || 'YBT';
    if (!byModule.has(code)) {
      byModule.set(code, {
        code,
        name: st.moduleName || code,
        subtypes: [],
      });
    }
    byModule.get(code).subtypes.push(st);
  }
  return [...byModule.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
});

const selectedImportSubtype = computed(() =>
  catalog.value.subtypes.find((s) => s.code === importSubtypeCode.value)
);

const importStorageKind = computed(
  () => selectedImportSubtype.value?.storageKind || 'excel'
);

const activeSubtype = computed(() =>
  catalog.value.subtypes.find((s) => s.code === activeSubtypeCode.value)
);

const activeSubtypeVersions = computed(() => activeSubtype.value?.versions || []);

const totalVersionCount = computed(() =>
  catalog.value.subtypes.reduce((n, st) => n + (st.versions?.length || 0), 0)
);

const hasReadyVersion = computed(() =>
  catalog.value.subtypes.some(
    (st) => st.enabled && (st.versions || []).some((v) => (v.mappingCount || 0) > 0)
  )
);

const allOverviewRows = computed(() => {
  const rows = [];
  for (const st of excelSubtypes.value) {
    const versions = st.versions || [];
    if (!versions.length) {
      rows.push({
        rowKey: `${st.code}__empty`,
        subtypeCode: st.code,
        subtypeName: st.name,
        enabled: st.enabled,
        versionId: null,
        versionLabel: '—',
        versionDate: '—',
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
        versionDate: v.versionDate || '',
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

const importModuleFilter = ref('');

const versionOptions = computed(() =>
  excelSubtypes.value
    .filter((s) => s.enabled)
    .flatMap((s) =>
      (s.versions || [])
        .filter((v) => v.mappingCount > 0)
        .map((v) => ({
          id: v.id,
          moduleCode: s.moduleCode || 'OTHER',
          moduleName: s.moduleName || s.moduleCode || '其他',
          label: `${s.name} / ${v.versionLabel}（sheet: ${v.sheetName}）`,
        }))
    )
);

const importModuleTabs = computed(() => {
  const selected = new Set(selectedVersionIds.value);
  const byCode = new Map();
  for (const opt of versionOptions.value) {
    const prev = byCode.get(opt.moduleCode);
    if (prev) {
      prev.count += 1;
      if (selected.has(opt.id)) prev.selectedCount += 1;
    } else {
      byCode.set(opt.moduleCode, {
        code: opt.moduleCode,
        name: opt.moduleName,
        count: 1,
        selectedCount: selected.has(opt.id) ? 1 : 0,
      });
    }
  }
  const order = new Map(
    (catalog.value.modules || []).map((m, i) => [m.code, i])
  );
  return [...byCode.values()].sort((a, b) => {
    const ai = order.has(a.code) ? order.get(a.code) : 999;
    const bi = order.has(b.code) ? order.get(b.code) : 999;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name, 'zh');
  });
});

const filteredVersionOptions = computed(() => {
  const code = importModuleFilter.value;
  if (!code) return versionOptions.value;
  return versionOptions.value.filter((o) => o.moduleCode === code);
});

const formTemplateModules = computed(() => catalog.value.modules || []);

const conversionScriptModules = computed(() => catalog.value.modules || []);

watch(
  conversionScriptModules,
  (mods) => {
    if (!mods.length) {
      conversionScriptModuleCode.value = '';
      return;
    }
    if (!mods.some((m) => m.code === conversionScriptModuleCode.value)) {
      conversionScriptModuleCode.value = mods.find((m) => m.code === 'YBT')?.code || mods[0].code;
    }
  },
  { immediate: true }
);

watch(
  formTemplateModules,
  (mods) => {
    if (!mods.length) {
      formTemplateModuleCode.value = '';
      return;
    }
    if (!mods.some((m) => m.code === formTemplateModuleCode.value)) {
      formTemplateModuleCode.value = mods.find((m) => m.code === '1104')?.code || mods[0].code;
    }
  },
  { immediate: true }
);

watch(
  importModuleTabs,
  (tabs) => {
    if (!tabs.length) {
      importModuleFilter.value = '';
      return;
    }
    if (!tabs.some((t) => t.code === importModuleFilter.value)) {
      importModuleFilter.value = tabs[0].code;
    }
  },
  { immediate: true }
);

function selectAllFilteredVersions() {
  const ids = new Set(selectedVersionIds.value);
  for (const opt of filteredVersionOptions.value) ids.add(opt.id);
  selectedVersionIds.value = [...ids];
}

function clearFilteredVersions() {
  const drop = new Set(filteredVersionOptions.value.map((o) => o.id));
  selectedVersionIds.value = selectedVersionIds.value.filter((id) => !drop.has(id));
}

const enabledButNotReady = computed(() =>
  excelSubtypes.value
    .filter((s) => s.enabled)
    .filter((s) => {
      const versions = s.versions || [];
      if (!versions.length) return true;
      return !versions.some((v) => v.mappingCount > 0);
    })
    .map((s) => s.name)
);

function setTab(tab, { subtype } = {}) {
  if (!VALID_TABS.includes(tab)) return;
  activeTab.value = tab;
  const query = { tab };
  if (tab === 'import' && subtype) query.subtype = subtype;
  router.replace({ path: '/import', query });
}

function applyRouteImportQuery() {
  const resolved = resolveImportTabFromRoute(route.query);
  activeTab.value = resolved.tab;
  if (resolved.subtype) {
    importSubtypeCode.value = resolved.subtype;
  }
}

watch(
  () => route.query,
  () => {
    applyRouteImportQuery();
  }
);

watch(
  () => catalog.value.subtypes,
  (list) => {
    if (!list.length) return;
    if (
      importSubtypeCode.value &&
      list.some((s) => s.code === importSubtypeCode.value)
    ) {
      return;
    }
    const preferred =
      list.find((s) => s.code === route.query.subtype) ||
      list.find((s) => s.storageKind === 'excel' && s.enabled) ||
      list.find((s) => s.enabled) ||
      list[0];
    if (preferred) importSubtypeCode.value = preferred.code;
  },
  { immediate: true }
);

watch(selectedImportSubtype, (st) => {
  if (!st?.moduleCode) return;
  if (st.storageKind === 'form_template') {
    formTemplateModuleCode.value = st.moduleCode;
  }
  if (st.storageKind === 'script') {
    conversionScriptModuleCode.value = st.moduleCode;
  }
});

watch(activeSubtype, (st) => {
  subtypeNameEdit.value = st?.name || '';
  subtypeCategoryEdit.value = st?.category || 'norm';
  subtypeModuleEdit.value = st?.moduleCode || catalog.value.modules[0]?.code || 'YBT';
});

function moduleNameByCode(code) {
  return catalog.value.modules.find((m) => m.code === code)?.name || code || '—';
}

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
    const firstExcel = excelSubtypes.value[0];
    activeSubtypeCode.value = firstExcel?.code || catalog.value.subtypes[0].code;
  }

  const st = catalog.value.subtypes.find((s) => s.code === activeSubtypeCode.value);
  const versions = st?.versions || [];
  if (!versions.length) {
    if (activeVersionId.value) {
      activeVersionId.value = null;
      versionDetail.value = null;
      mappingRows.value = [];
    }
    return;
  }
  const stillSelected = versions.some((v) => v.id === activeVersionId.value);
  if (!stillSelected) {
    const preferred = versions.find((v) => v.isDefault) || versions[0];
    await selectVersion(preferred.id);
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
  clearStepMessage(3);
  const versions = activeSubtype.value?.versions || [];
  if (!versions.length) {
    activeVersionId.value = null;
    versionDetail.value = null;
    mappingRows.value = [];
    return;
  }
  const preferred =
    versions.find((v) => v.id === activeVersionId.value) ||
    versions.find((v) => v.isDefault) ||
    versions[0];
  await selectVersion(preferred.id);
}

async function onActiveVersionChange(event) {
  const id = Number(event.target.value);
  if (!id || id === activeVersionId.value) return;
  clearStepMessage(3);
  await selectVersion(id);
}

async function selectVersion(id) {
  activeVersionId.value = id;
  clearStepMessage(3);
  const detail = await getVersionDetail(id);
  versionDetail.value = detail;
  Object.assign(versionForm, {
    sheetName: detail.version.sheetName,
    versionDate: detail.version.versionDate || '',
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
      defaultFilter: m.defaultFilter,
    })
  );
}

async function addModule() {
  const code = newModule.code.trim().toUpperCase();
  const name = newModule.name.trim();
  if (!code || !name) {
    setStepMessage(1, 'error', '请填写主类 code 与名称');
    return;
  }
  saving.value = true;
  clearStepMessage(1);
  try {
    await upsertModule(code, { name, sortOrder: catalog.value.modules.length });
    newModule.code = '';
    newModule.name = '';
    await refreshCatalog();
    setStepMessage(1, 'success', `主类「${name}」已添加`);
  } catch (e) {
    setStepMessage(1, 'error', e.message || '添加失败');
  } finally {
    saving.value = false;
  }
}

async function addSubtype() {
  const code = newSubtype.code.trim();
  const name = newSubtype.name.trim();
  if (!code || !name) {
    setStepMessage(1, 'error', '请填写子类 code 与名称');
    return;
  }
  saving.value = true;
  clearStepMessage(1);
  const storageKind = newSubtype.storageKind;
  try {
    await createSubtype(code, {
      name,
      enabled: false,
      sortOrder: catalog.value.subtypes.length,
      category: newSubtype.category,
      moduleCode: newSubtype.moduleCode,
      storageKind,
    });
    newSubtype.code = '';
    newSubtype.name = '';
    newSubtype.category = 'qa';
    newSubtype.moduleCode = catalog.value.modules[0]?.code || 'YBT';
    newSubtype.storageKind = 'excel';
    await refreshCatalog();
    activeSubtypeCode.value = code;
    const successMsg = isExcelStorageKind(storageKind)
      ? `子类「${name}」已添加，请继续新建版本并保存映射`
      : `子类「${name}」已添加，启用后即可在「资料导入」上传文件`;
    setStepMessage(1, 'success', successMsg);
  } catch (e) {
    setStepMessage(1, 'error', e.message || '添加失败');
  } finally {
    saving.value = false;
  }
}

async function removeSubtype(st) {
  const versionCount = st.versions?.length || 0;
  const isExcel = isExcelStorageKind(st.storageKind);
  let warn = `确认删除子类「${st.name}」？`;
  if (isExcel && versionCount > 0) {
    warn = `子类「${st.name}」含 ${versionCount} 个版本及关联数据，删除后不可恢复，确认？`;
  } else if (!isExcel) {
    warn = `确认删除还原类子类「${st.name}」？若仍有资料需先在资料导入中删除。`;
  }
  if (!confirm(warn)) return;
  saving.value = true;
  clearStepMessage(1);
  try {
    await deleteSubtype(st.code);
    if (activeSubtypeCode.value === st.code) {
      activeVersionId.value = null;
      versionDetail.value = null;
      mappingRows.value = [];
      clearStepMessage(3);
    }
    await refreshCatalog();
    await refreshDatasets();
    setStepMessage(1, 'success', `已删除子类：${st.code}`);
  } catch (e) {
    setStepMessage(1, 'error', e.message || '删除失败');
  } finally {
    saving.value = false;
  }
}

async function saveSubtypeInfo() {
  if (!activeSubtype.value) return;
  saving.value = true;
  clearStepMessage(3);
  try {
    await updateSubtype(activeSubtypeCode.value, {
      name: subtypeNameEdit.value.trim() || activeSubtype.value.name,
      enabled: activeSubtype.value.enabled,
      sortOrder: activeSubtype.value.sortOrder,
      category: subtypeCategoryEdit.value,
      moduleCode: subtypeModuleEdit.value,
    });
    await refreshCatalog();
    setStepMessage(3, 'success', '子类信息已保存');
  } catch (e) {
    setStepMessage(3, 'error', e.message || '保存失败');
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
    setStepMessage(3, 'success', enabled ? '子类已启用' : '子类已停用');
  } catch (e) {
    setStepMessage(3, 'error', e.message || '保存失败');
  }
}

async function addVersion() {
  try {
    const hadPrevious = (activeSubtype.value?.versions?.length || 0) > 0;
    const { version } = await createSubtypeVersion(activeSubtypeCode.value, { ...newVersion });
    newVersion.versionLabel = '';
    newVersion.sheetName = '';
    newVersion.versionDate = '';
    newVersion.isDefault = false;
    await refreshCatalog();
    await selectVersion(version.id);
    const copied = versionDetail.value?.mappings?.length || 0;
    setStepMessage(
      3,
      'success',
      hadPrevious
        ? `版本已创建${copied ? `，已复制上一版本 ${copied} 条字段映射` : '（上一版本无映射可复制）'}`
        : '版本已创建'
    );
  } catch (e) {
    setStepMessage(3, 'error', e.message || '创建失败');
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
  clearStepMessage(2);
  if (row.versionId) {
    await selectVersion(row.versionId);
  } else {
    activeVersionId.value = null;
    versionDetail.value = null;
    mappingRows.value = [];
    setStepMessage(2, 'warn', `子类「${row.subtypeName}」尚无版本，请在下方新建版本并保存映射。`);
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
    setStepMessage(3, 'success', '版本已删除');
  } catch (e) {
    setStepMessage(3, 'error', e.message || '删除失败');
  }
}

async function saveVersionSettings() {
  saving.value = true;
  clearStepMessage(3);
  try {
    await updateSubtypeVersion(activeVersionId.value, {
      sheetName: versionForm.sheetName,
      versionDate: versionForm.versionDate,
      headerRow: versionForm.headerRow,
      dataStartRow: versionForm.dataStartRow,
      isDefault: versionForm.isDefault,
    });
    await refreshCatalog();
    await selectVersion(activeVersionId.value);
    setStepMessage(3, 'success', '版本设置已保存');
  } catch (e) {
    setStepMessage(3, 'error', e.message || '保存失败');
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
    setStepMessage(3, 'success', '数据已清空');
  } catch (e) {
    setStepMessage(3, 'error', e.message || '清空失败');
  }
}

function addMappingRow() {
  mappingRows.value.push(createMappingRow());
}

async function saveMappings() {
  saving.value = true;
  clearStepMessage(3);
  try {
    await saveVersionMappings(activeVersionId.value, toMappingPayload(mappingRows.value));
    await refreshCatalog();
    await selectVersion(activeVersionId.value);
    setStepMessage(3, 'success', '字段映射已保存');
  } catch (e) {
    setStepMessage(3, 'error', e.message || '保存失败');
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
  if (!formTemplateFile.value || !formTemplateModuleCode.value) return;
  formTemplateImporting.value = true;
  formTemplateMessage.value = '';
  formTemplateImportItems.value = [];
  try {
    const result = await importFormTemplateExcel(formTemplateFile.value, {
      moduleCode: formTemplateModuleCode.value,
      subtypeCode: selectedImportSubtype.value?.code,
    });
    formTemplateMessageType.value = 'success';
    formTemplateMessage.value = result.message || '导入成功';
    formTemplateImportItems.value = Array.isArray(result.items)
      ? result.items
      : result.reportCode
        ? [
            {
              id: result.id,
              reportCode: result.reportCode,
              versionLabel: result.versionLabel,
              rowCount: result.rowCount,
              colCount: result.colCount,
              importAction: result.importAction,
            },
          ]
        : [];
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
    const result = await importFillInstructionDocument(fillInstructionFile.value, {
      moduleCode: selectedImportSubtype.value?.moduleCode,
      subtypeCode: selectedImportSubtype.value?.code,
    });
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

function onConversionScriptFile(e) {
  conversionScriptFile.value = e.target.files?.[0] || null;
}

function onConversionScriptDrop(e) {
  conversionScriptDragging.value = false;
  const f = e.dataTransfer.files?.[0];
  if (f) conversionScriptFile.value = f;
}

async function refreshConversionScripts() {
  conversionScriptLoading.value = true;
  try {
    const { items } = await listConversionScripts();
    conversionScripts.value = items || [];
  } catch (e) {
    conversionScriptMessageType.value = 'error';
    conversionScriptMessage.value = e.message || '加载脚本列表失败';
  } finally {
    conversionScriptLoading.value = false;
  }
}

async function doConversionScriptImport() {
  if (!conversionScriptFile.value || !conversionScriptModuleCode.value) return;
  conversionScriptImporting.value = true;
  conversionScriptMessage.value = '';
  try {
    const result = await importConversionScriptFile(conversionScriptFile.value, {
      moduleCode: conversionScriptModuleCode.value,
      subtypeCode: selectedImportSubtype.value?.code,
    });
    conversionScriptMessageType.value = 'success';
    conversionScriptMessage.value = result.message || '导入成功';
    conversionScriptFile.value = null;
    await refreshConversionScripts();
  } catch (e) {
    conversionScriptMessageType.value = 'error';
    conversionScriptMessage.value = e.message || '导入失败';
  } finally {
    conversionScriptImporting.value = false;
  }
}

async function removeConversionScript(item) {
  if (!item?.id) return;
  if (!window.confirm(`确定删除脚本 ${item.sourceFileName}？`)) return;
  try {
    await deleteConversionScript(item.id);
    conversionScriptMessageType.value = 'success';
    conversionScriptMessage.value = `已删除 ${item.sourceFileName}`;
    await refreshConversionScripts();
  } catch (e) {
    conversionScriptMessageType.value = 'error';
    conversionScriptMessage.value = e.message || '删除失败';
  }
}

onMounted(async () => {
  applyRouteImportQuery();
  await refreshCatalog();
  await refreshDatasets();
  await refreshFormTemplates();
  await refreshFillInstructions();
  await refreshConversionScripts();
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

.import-subtype-picker {
  margin-bottom: 16px;
}

.import-subtype-hint {
  margin: 8px 0 0;
  font-size: 13px;
}

.import-kind-panel {
  margin-top: 4px;
}

.tag-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-subtle, #f1f5f9);
  font-size: 13px;
}

.tags-reference {
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

.field.compact {
  min-width: 160px;
}

.import-module-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 10px;
}

.import-module-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fff;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.import-module-tab:hover {
  color: var(--text);
  border-color: #93c5fd;
}

.import-module-tab.active {
  color: #1e40af;
  background: #eff6ff;
  border-color: #93c5fd;
  font-weight: 600;
}

.tab-count {
  color: var(--text-muted);
  font-weight: 500;
}

.import-module-tab.active .tab-count {
  color: #1d4ed8;
}

.tab-selected {
  color: #047857;
  font-size: 12px;
}

.version-checks-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
}

.version-checks-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.version-checks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px 12px;
  max-height: 260px;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fafafa;
}

/* —— 子类配置：流程化布局 —— */
.subtype-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.flow-guide {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
}

.flow-guide-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--text);
}

.flow-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.flow-steps li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
}

.flow-steps li.done {
  color: #047857;
}

.flow-steps li.current {
  color: var(--text);
  font-weight: 600;
}

.step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #374151;
  font-size: 12px;
  font-weight: 700;
}

.flow-steps li.done .step-no {
  background: #a7f3d0;
  color: #065f46;
}

.flow-steps li.current .step-no {
  background: #bfdbfe;
  color: #1e40af;
}

.flow-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.step-feedback {
  margin: 0 0 12px;
  padding: 8px 12px;
  font-size: 13px;
}

.config-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  overflow: hidden;
}

.config-card-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}

.card-step {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  padding: 3px 10px;
  line-height: 1.4;
  margin-top: 2px;
}

.config-card-head h3 {
  margin: 0 0 2px;
  font-size: 15px;
  font-weight: 600;
}

.config-card-head p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.config-card-body {
  padding: 16px;
}

.setup-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

@media (max-width: 960px) {
  .setup-grid {
    grid-template-columns: 1fr;
  }
}

.setup-block {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  background: #fafafa;
}

.setup-block h4,
.work-panel h4,
.block-title-row h4 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
}

.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  margin-bottom: 12px;
}

@media (max-width: 720px) {
  .form-grid-2 {
    grid-template-columns: 1fr;
  }
}

.block-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.block-title-row h4 {
  margin: 0;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  margin-bottom: 10px;
}

.overview-summary {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.overview-table tbody tr.no-version {
  background: #fffbeb;
}

.overview-table tbody tr,
.subtype-list-block tbody tr {
  cursor: pointer;
}

.overview-table tbody tr.selected,
.subtype-list-block tbody tr.selected {
  background: #eff6ff;
}

.work-context {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #f8fafc;
}

.work-context .field {
  min-width: 140px;
}

.enable-check {
  align-self: center;
  padding-bottom: 4px;
}

.version-picker-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-sm);
  background: #eff6ff;
}

.version-picker-bar .field {
  min-width: 280px;
  flex: 1;
}

.version-picker-hint,
.version-picker-empty {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12px;
}

.work-split {
  display: grid;
  grid-template-columns: minmax(300px, 0.85fr) minmax(360px, 1.15fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1100px) {
  .work-split {
    grid-template-columns: 1fr;
  }
}

.work-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  background: #fff;
  min-width: 0;
}

.panel-subhead {
  margin-top: 20px !important;
  padding-top: 14px;
  border-top: 1px dashed var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-panel {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: #fafafa;
}

.empty-panel.soft {
  margin-top: 12px;
  padding: 16px;
}

.mapping-panel {
  min-height: 200px;
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

.import-action-tag {
  display: inline-block;
  min-width: 2.5em;
  margin-right: 8px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}

.import-action-tag.created {
  color: #166534;
  background: #dcfce7;
}

.import-action-tag.replaced {
  color: #9a3412;
  background: #ffedd5;
}

.form-template-feedback {
  margin-bottom: 4px;
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
