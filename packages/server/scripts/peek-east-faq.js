import { initDb, queryAll, queryOne, closeDb } from '../src/db/database.js';

await initDb();

const subtype = queryOne(
  "SELECT * FROM subtypes WHERE code = 'TO_EAST_FAQ' OR name LIKE '%EAST%'"
);
console.log('=== 子类 ===');
console.log(JSON.stringify(subtype, null, 2));

const versions = queryAll(
  "SELECT * FROM subtype_versions WHERE subtype_code = 'TO_EAST_FAQ' ORDER BY id"
);
console.log('\n=== 版本 ===');
console.log(JSON.stringify(versions, null, 2));

for (const v of versions) {
  const mappings = queryAll(
    'SELECT * FROM field_mappings WHERE subtype_version_id = ? ORDER BY id',
    [v.id]
  );
  const count = queryOne(
    'SELECT COUNT(*) AS c FROM data_records WHERE subtype_version_id = ?',
    [v.id]
  );
  console.log(`\n--- 版本 ${v.version_label} (id=${v.id}) 映射=${mappings.length} 记录=${count?.c}`);
  console.log(JSON.stringify(mappings, null, 2));
}

const records = queryAll(`
  SELECT r.id, r.row_num, r.sheet_name, r.std_data_item, r.std_version, r.payload, sv.version_label
  FROM data_records r
  JOIN subtype_versions sv ON sv.id = r.subtype_version_id
  WHERE sv.subtype_code = 'TO_EAST_FAQ'
  ORDER BY sv.id, r.row_num
  LIMIT 30
`);

console.log('\n=== 数据行 (前30条) ===');
for (const r of records) {
  let payload = r.payload;
  try {
    payload = JSON.parse(payload);
  } catch {
    // keep raw
  }
  console.log(
    JSON.stringify(
      {
        id: r.id,
        row: r.row_num,
        version: r.version_label,
        sheet: r.sheet_name,
        std_data_item: r.std_data_item,
        payload,
      },
      null,
      2
    )
  );
  console.log('---');
}

const total = queryOne(`
  SELECT COUNT(*) AS c
  FROM data_records r
  JOIN subtype_versions sv ON sv.id = r.subtype_version_id
  WHERE sv.subtype_code = 'TO_EAST_FAQ'
`);
console.log('\n总记录数:', total?.c);

closeDb();
