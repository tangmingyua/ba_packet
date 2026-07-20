/**
 * 前端路由配置
 * 使用 Hash 模式，便于本地/Electron 离线部署
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import SearchView from '../views/SearchView.vue';
import ImportView from '../views/ImportView.vue';

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'search', component: SearchView },
    { path: '/import', name: 'import', component: ImportView },
    { path: '/fields', redirect: { path: '/import', query: { tab: 'fields' } } },
  ],
});
