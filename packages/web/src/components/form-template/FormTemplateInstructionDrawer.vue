<template>
  <aside v-if="open" class="instruction-drawer">
    <div class="instruction-header">
      <h3>填报说明</h3>
      <button type="button" class="btn-link" @click="$emit('close')">关闭</button>
    </div>

    <p v-if="loading" class="muted">加载说明…</p>
    <p v-else-if="error" class="instruction-error">{{ error }}</p>
    <template v-else-if="instruction">
      <p class="instruction-meta">
        {{ instruction.document?.docCode }}
        <span v-if="instruction.document?.reportCode">
          · 表样 {{ instruction.document.reportCode }}
        </span>
        · 指标 #{{ instruction.indicatorKey }}
      </p>
      <div class="instruction-title">{{ instruction.indicator?.text }}</div>
      <div v-for="(body, idx) in bodies" :key="idx" class="instruction-body">
        {{ body }}
      </div>
      <p v-if="!bodies.length" class="muted section-muted">该指标下暂无正文</p>
    </template>

    <section v-if="testifyRules.length" class="testify-rules-section">
      <div class="section-divider" />
      <h4 class="section-title">校验规则</h4>
      <article v-for="rule in testifyRules" :key="rule.id" class="testify-rule-card">
        <p class="testify-rule-meta">
          {{ rule.tableNo }}
          <span v-if="rule.tableName"> · {{ rule.tableName }}</span>
          <span v-if="rule.version"> · {{ rule.version }}</span>
        </p>
        <div class="testify-rule-item">{{ rule.dataItem }}</div>
        <p v-if="rule.checkCategory" class="testify-rule-category">{{ rule.checkCategory }}</p>
        <p v-if="rule.regRuleContent" class="testify-rule-content">{{ rule.regRuleContent }}</p>
        <p v-if="rule.testifyRule" class="testify-rule-raw">{{ rule.testifyRule }}</p>
      </article>
    </section>
  </aside>
</template>

<script setup>
defineProps({
  open: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  instruction: { type: Object, default: null },
  bodies: { type: Array, default: () => [] },
  testifyRules: { type: Array, default: () => [] },
});

defineEmits(['close']);
</script>

<style scoped>
.instruction-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(360px, 42%);
  z-index: 5;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 12px 14px;
}

.instruction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.instruction-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.instruction-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.instruction-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  line-height: 1.45;
}

.instruction-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 10px;
}

.instruction-error {
  font-size: 13px;
  color: #b91c1c;
  line-height: 1.5;
}

.section-muted {
  padding: 0;
  margin-bottom: 8px;
}

.testify-rules-section {
  margin-top: 4px;
}

.section-divider {
  height: 1px;
  background: var(--border);
  margin: 12px 0 10px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.testify-rule-card + .testify-rule-card {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

.testify-rule-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.testify-rule-item {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  margin-bottom: 6px;
}

.testify-rule-category {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.testify-rule-content {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.testify-rule-raw {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.muted {
  color: var(--text-muted);
  font-size: 13px;
}
</style>
