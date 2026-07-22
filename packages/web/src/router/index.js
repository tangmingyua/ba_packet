/**
 * 前端路由配置
 * 使用 Hash 模式，便于本地/Electron 离线部署
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import SearchView from '../views/SearchView.vue';
import ImportView from '../views/ImportView.vue';
import FormTemplateView from '../views/FormTemplateView.vue';
import FormTemplateSearchView from '../views/FormTemplateSearchView.vue';
import DocumentView from '../views/DocumentView.vue';

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'search', component: SearchView },
    { path: '/import', name: 'import', component: ImportView },
    { path: '/form-templates', name: 'formTemplates', component: FormTemplateView },
    { path: '/form-templates/:id', name: 'formTemplateDetail', component: FormTemplateView },
    { path: '/form-template-search', name: 'formTemplateSearch', component: FormTemplateSearchView },
    { path: '/documents', name: 'documents', component: DocumentView },
    { path: '/documents/:id', name: 'documentDetail', component: DocumentView },
    { path: '/fields', redirect: { path: '/import', query: { tab: 'fields' } } },
  ],
});
