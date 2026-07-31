<template>
  <div class="app">
    <aside class="sidebar sidebar-minimal">
      <button type="button" class="logo logo-compact" title="返回查询首页" @click="goHome">
        <div class="logo-mark">
          <svg viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
      </button>

      <div class="sidebar-spacer" />

      <router-link
        to="/import"
        class="sidebar-import-btn"
        active-class="active"
        title="资料导入"
      >
        <span class="sidebar-import-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>
        <span class="sidebar-import-label">资料导入</span>
      </router-link>
    </aside>

    <main class="main">
      <header v-if="showTopbar" class="topbar">
        <div class="topbar-title">{{ pageTitle }}</div>
      </header>

      <div
        class="content"
        :class="{
          'content-search-landing': isSearchLanding,
          'content-search-results': isSearchResults,
          'content-fill': isFillPage,
        }"
      >
        <router-view @search-state="onSearchState" />
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const searchLayoutActive = ref(false);
const searchPageTitle = ref('');
const homeResetSignal = ref(0);
const pendingHomeMode = ref(null);
provide('homeResetSignal', homeResetSignal);
provide('pendingHomeMode', pendingHomeMode);
provide('goHome', goHome);

const landingMode = ref('aggregate');

const isSearchLanding = computed(
  () => route.name === 'search' && !searchLayoutActive.value
);

const isSearchResults = computed(
  () => route.name === 'search' && searchLayoutActive.value
);

const isFillPage = computed(() =>
  route.name === 'conversionScripts' || route.name === 'conversionScriptDetail'
);

const pageTitle = computed(() => {
  if (route.name === 'import') return '资料导入';
  if (route.name === 'formTemplates' || route.name === 'formTemplateDetail') return '表样';
  if (route.name === 'conversionScripts' || route.name === 'conversionScriptDetail') {
    return 'SQL 转换脚本';
  }
  return '';
});

const showTopbar = computed(
  () => Boolean(pageTitle.value) && route.name !== 'search'
);

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

watch(
  () => route.name,
  (name) => {
    if (name !== 'search') {
      searchLayoutActive.value = false;
      searchPageTitle.value = '';
    }
  }
);
</script>
