const { contextBridge } = require('electron');

const apiBaseArg = process.argv.find((arg) => arg.startsWith('--api-base='));
const apiTokenArg = process.argv.find((arg) => arg.startsWith('--api-token='));

const apiBase = apiBaseArg ? apiBaseArg.slice('--api-base='.length) : '';
const apiToken = apiTokenArg ? apiTokenArg.slice('--api-token='.length) : '';

contextBridge.exposeInMainWorld('__BA_API_BASE__', apiBase);
contextBridge.exposeInMainWorld('__BA_API_TOKEN__', apiToken);
