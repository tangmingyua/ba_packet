import { initDb, closeDb } from '../src/db/database.js';
import { getDatasetCatalog } from '../src/services/dataset-config.js';

await initDb();
const left = getDatasetCatalog().subtypes.filter(
  (s) =>
    s.storageKind === 'form_template' &&
    (s.moduleCode === 'EAST' || s.code === 'EAST_FORM_TEMPLATE' || s.code === 'EAST_FORM_TPL')
);
console.log('Remaining EAST form_template subtypes:', left.length ? left : '(none)');
closeDb();
