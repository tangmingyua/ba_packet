<template>
  <section class="detail-page">
    <router-link to="/" class="back-link">← 返回搜索</router-link>

    <p v-if="error" class="error">{{ error }}</p>

    <article v-if="field" class="detail-card">
      <header>
        <h2>{{ field.name_cn || '（无中文名）' }}</h2>
        <p class="en-name">{{ field.name_en }}</p>
      </header>

      <dl class="detail-grid">
        <div><dt>所属表</dt><dd>{{ field.table_name_cn }} ({{ field.table_db_name }})</dd></div>
        <div><dt>表编号</dt><dd>{{ field.table_id }}</dd></div>
        <div><dt>序号</dt><dd>{{ field.seq_no ?? '-' }}</dd></div>
        <div><dt>数据类型</dt><dd>{{ field.data_type || '-' }}</dd></div>
        <div><dt>主外键</dt><dd>{{ field.key_type || '-' }}</dd></div>
        <div><dt>字段分类</dt><dd>{{ field.field_category || '-' }}</dd></div>
        <div><dt>必填项说明</dt><dd>{{ field.mandatory_note || '-' }}</dd></div>
        <div><dt>桑坦德适用</dt><dd>{{ field.santander_applicable || '-' }}</dd></div>
        <div><dt>一表通适用</dt><dd>{{ field.ybt_applicable || '-' }}</dd></div>
        <div><dt>码值名称</dt><dd>{{ field.code_name || '-' }}</dd></div>
        <div><dt>码值长度</dt><dd>{{ field.code_length ?? '-' }}</dd></div>
      </dl>

      <section v-if="field.description" class="block">
        <h3>字段说明</h3>
        <pre>{{ field.description }}</pre>
      </section>

      <section v-if="field.reported_value" class="block">
        <h3>实际上报值</h3>
        <pre>{{ field.reported_value }}</pre>
      </section>

      <section v-if="field.code_detail" class="block">
        <h3>码值明细</h3>
        <pre>{{ field.code_detail }}</pre>
      </section>

      <section v-if="field.ybt_detail" class="block">
        <h3>一表通明细</h3>
        <pre>{{ field.ybt_detail }}</pre>
      </section>

      <section v-if="field.remark" class="block">
        <h3>备注说明</h3>
        <pre>{{ field.remark }}</pre>
      </section>
    </article>
  </section>
</template>

<script setup>
/**
 * 字段详情页（旧版元数据）
 * 展示 meta_fields 单条记录，当前路由未启用
 */
import { onMounted, ref, watch } from 'vue';
import { getField } from '../api';

const props = defineProps({
  id: {
    type: [String, Number],
    required: true,
  },
});

/** 字段详情数据 */
const field = ref(null);
/** 加载错误信息 */
const error = ref('');

/** 按 ID 拉取字段详情 */
async function loadField() {
  error.value = '';
  field.value = null;
  try {
    field.value = await getField(props.id);
  } catch (err) {
    error.value = err.message || '加载失败';
  }
}

onMounted(loadField);
watch(() => props.id, loadField);
</script>

<style scoped>
.back-link {
  display: inline-block;
  margin-bottom: 16px;
  color: #2563eb;
  text-decoration: none;
}

.detail-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
}

.detail-card h2 {
  margin: 0 0 4px;
}

.en-name {
  margin: 0 0 20px;
  color: #2563eb;
  font-family: Consolas, monospace;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
  margin: 0 0 24px;
}

.detail-grid div {
  display: grid;
  gap: 4px;
}

dt {
  font-size: 12px;
  color: #6b7280;
}

dd {
  margin: 0;
  word-break: break-word;
}

.block h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.block pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f9fafb;
  border-radius: 8px;
  padding: 12px 14px;
  line-height: 1.6;
  font-family: inherit;
}

.error {
  color: #dc2626;
}

@media (max-width: 768px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
