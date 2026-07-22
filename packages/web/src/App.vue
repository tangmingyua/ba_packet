<template>
  <div class="app">
    <aside class="sidebar">
      <button type="button" class="logo" @click="goHome">
        <div class="logo-mark">
          <svg viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div class="logo-text-wrap">
          <div class="logo-title">Pocket BA</div>
          <div class="logo-subtitle">口袋 BA</div>
        </div>
      </button>

      <nav class="sidebar-nav">
        <button
          v-for="item in searchNavItems"
          :key="item.id"
          type="button"
          class="nav-item"
          :class="{ active: isNavActive(item.id) }"
          @click="goSearch(item.id)"
        >
          <span class="nav-icon">
            <component :is="item.icon" />
          </span>
          {{ item.label }}
        </button>

        <router-link to="/import" class="nav-item" active-class="active">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          资料导入
        </router-link>

        <router-link to="/form-templates" class="nav-item" active-class="active">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </span>
          查看表样
        </router-link>

        <router-link to="/form-template-search" class="nav-item" active-class="active">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </span>
          表样搜索
        </router-link>

        <router-link to="/documents" class="nav-item" active-class="active">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </span>
          填报说明
        </router-link>

        <router-link to="/document-search" class="nav-item" active-class="active">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </span>
          说明搜索
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <template v-if="stats">
          资料 {{ stats.records ?? 0 }} 条<br />
          数据集 {{ stats.datasets ?? 0 }} 个
        </template>
        <template v-else>
          监管报送资料库<br />
          离线检索工具
        </template>
      </div>
    </aside>

    <main class="main">
      <header v-if="pageTitle" class="topbar">
        <div class="topbar-title">{{ pageTitle }}</div>
        <div v-if="showBackHome" class="topbar-actions">
          <button type="button" class="btn" @click="goHome">← 返回首页</button>
        </div>
      </header>

      <div class="content" :class="{ 'content-center': isHomeCenter }">
        <router-view @search-state="onSearchState" />
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, provide, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getHealth } from './api';

const route = useRoute();
const router = useRouter();
const stats = ref(null);
const searchLayoutActive = ref(false);
const searchPageTitle = ref('');
const homeResetSignal = ref(0);
const pendingHomeMode = ref(null);
provide('homeResetSignal', homeResetSignal);
provide('pendingHomeMode', pendingHomeMode);

const landingMode = ref('norm');

const isHomeCenter = computed(
  () => route.name === 'search' && !searchLayoutActive.value
);

const pageTitle = computed(() => {
  if (route.name === 'import') return '资料导入';
  if (route.name === 'formTemplates' || route.name === 'formTemplateDetail') return '1104 表样';
  if (route.name === 'formTemplateSearch') return '表样搜索（测试）';
  if (route.name === 'documents' || route.name === 'documentDetail') return '1104 填报说明';
  if (route.name === 'documentSearch') return '填报说明搜索';
  if (route.name === 'search' && searchLayoutActive.value) {
    return searchPageTitle.value || '查询结果';
  }
  return '';
});

const showBackHome = computed(
  () => route.name === 'search' && searchLayoutActive.value
);

const searchNavItems = [
  {
    id: 'norm',
    label: '查规范',
    icon: defineComponent({
      render() {
        return h('svg', { viewBox: '0 0 24 24' }, [
          h('path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }),
          h('path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }),
        ]);
      },
    }),
  },
  {
    id: 'qa',
    label: '查答疑',
    icon: defineComponent({
      render() {
        return h('svg', { viewBox: '0 0 24 24' }, [
          h('path', {
            d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
          }),
        ]);
      },
    }),
  },
  {
    id: 'aggregate',
    label: '聚合查询',
    icon: defineComponent({
      render() {
        return h('svg', { viewBox: '0 0 24 24' }, [
          h('circle', { cx: '11', cy: '11', r: '8' }),
          h('path', { d: 'M21 21l-4.35-4.35' }),
        ]);
      },
    }),
  },
];

function isNavActive(id) {
  if (route.name !== 'search') return false;
  if (searchLayoutActive.value) {
    const mode = route.query.mode || 'norm';
    return mode === id;
  }
  return landingMode.value === id;
}

function goSearch(mode) {
  pendingHomeMode.value = mode;
  router.push({ path: '/', query: {} });
  homeResetSignal.value += 1;
}

function goHome() {
  pendingHomeMode.value = null;
  router.push({ path: '/', query: {} });
  homeResetSignal.value += 1;
}

function onSearchState(payload) {
  if (typeof payload === 'boolean') {
    searchLayoutActive.value = payload;
    return;
  }
  searchLayoutActive.value = Boolean(payload?.layout);
  if (payload?.title) searchPageTitle.value = payload.title;
  if (payload?.landingMode) landingMode.value = payload.landingMode;
}

onMounted(async () => {
  try {
    stats.value = await getHealth();
  } catch {
    stats.value = null;
  }
});
</script>
