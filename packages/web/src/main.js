/**
 * Vue 应用入口
 */
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { bootstrapDesktopApi } from './bootstrapDesktopApi.js';
import './styles/main.css';

async function startApp() {
  await bootstrapDesktopApi();
  createApp(App).use(router).mount('#app');
}

startApp();
