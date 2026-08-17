/**
 * 前端路由配置
 * 使用 Hash 模式，便于本地/Electron 离线部署
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import SearchView from '../views/SearchView.vue';
import ImportView from '../views/ImportView.vue';
import FormTemplateView from '../views/FormTemplateView.vue';
import DocumentView from '../views/DocumentView.vue';
import WordFaithfulView from '../views/WordFaithfulView.vue';
import ConversionScriptView from '../views/ConversionScriptView.vue';
import ActivateView from '../views/ActivateView.vue';
import { licenseActivated, licenseReady, refreshLicenseStatus } from '../composables/licenseGate.js';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/activate', name: 'activate', component: ActivateView },
    { path: '/', name: 'search', component: SearchView },
    { path: '/import', name: 'import', component: ImportView },
    { path: '/form-templates', name: 'formTemplates', component: FormTemplateView },
    { path: '/form-templates/:id', name: 'formTemplateDetail', component: FormTemplateView },
    { path: '/documents', name: 'documents', component: DocumentView },
    { path: '/documents/:id', name: 'documentDetail', component: DocumentView },
    { path: '/word-faithful', name: 'wordFaithful', component: WordFaithfulView },
    { path: '/word-faithful/:id', name: 'wordFaithfulDetail', component: WordFaithfulView },
    { path: '/conversion-scripts', name: 'conversionScripts', component: ConversionScriptView },
    {
      path: '/conversion-scripts/:id',
      name: 'conversionScriptDetail',
      component: ConversionScriptView,
    },
    { path: '/fields', redirect: { path: '/import', query: { tab: 'fields' } } },
  ],
});

router.beforeEach(async (to) => {
  if (!licenseReady.value) {
    try {
      await refreshLicenseStatus();
    } catch {
      if (to.name !== 'activate') return { name: 'activate' };
      return true;
    }
  }
  if (!licenseActivated.value && to.name !== 'activate') {
    return { name: 'activate' };
  }
  if (licenseActivated.value && to.name === 'activate') {
    return { name: 'search' };
  }
  return true;
});

export default router;

