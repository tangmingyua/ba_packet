<template>
  <section class="activate-page">
    <div class="home-logo">
      <div class="home-logo-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <span class="home-logo-text">Pocket BA</span>
    </div>

    <h1 class="activate-title">本机授权</h1>
    <p class="activate-hint">请将机器码发给管理员，获取授权码后在此激活。激活一次后本机记住。</p>

    <label class="activate-field">
      <span>本机机器码</span>
      <div class="activate-machine-row">
        <input :value="machineIdDisplay" type="text" readonly />
        <button type="button" class="btn" :disabled="!machineIdDisplay" @click="copyMachineId">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
    </label>

    <label class="activate-field">
      <span>授权码</span>
      <textarea v-model="code" rows="5" placeholder="粘贴管理员签发的授权码" spellcheck="false" />
    </label>

    <p v-if="error" class="activate-error">{{ error }}</p>

    <button type="button" class="btn btn-primary activate-submit" :disabled="submitting || !code.trim()" @click="submit">
      {{ submitting ? '激活中…' : '激活' }}
    </button>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { activateLicense } from '../api';
import { applyLicenseStatus, licenseInfo, refreshLicenseStatus } from '../composables/licenseGate.js';

const router = useRouter();
const code = ref('');
const error = ref('');
const submitting = ref(false);
const copied = ref(false);
const machineIdDisplay = ref('');

onMounted(async () => {
  try {
    const status = await refreshLicenseStatus();
    machineIdDisplay.value = status.machineIdDisplay || '';
    if (status.activated) {
      await router.replace('/');
    }
  } catch (e) {
    error.value = e.message || '无法读取本机授权状态';
  }
});

async function copyMachineId() {
  const text = machineIdDisplay.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    error.value = '复制失败，请手动选择机器码';
  }
}

async function submit() {
  error.value = '';
  submitting.value = true;
  try {
    const status = await activateLicense(code.value);
    applyLicenseStatus(status);
    if (licenseInfo.value?.activated) {
      await router.replace('/');
    }
  } catch (e) {
    error.value = e.message || '激活失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.activate-page {
  width: min(520px, calc(100% - 48px));
  margin: 0 auto;
  padding: 48px 0 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activate-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  text-align: center;
}

.activate-hint {
  margin: 0;
  color: var(--text-secondary);
  text-align: center;
  font-size: 13px;
  line-height: 1.6;
}

.activate-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  font-size: 13px;
  color: var(--text-secondary);
}

.activate-field input,
.activate-field textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text);
  padding: 8px 10px;
}

.activate-field input {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
}

.activate-field textarea {
  resize: vertical;
  min-height: 120px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.activate-machine-row {
  display: flex;
  gap: 8px;
}

.activate-machine-row input {
  flex: 1;
}

.activate-error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

.activate-submit {
  align-self: stretch;
  height: 40px;
}
</style>
