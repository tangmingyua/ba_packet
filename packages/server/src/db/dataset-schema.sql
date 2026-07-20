-- 新模型：子类 / 版本 / 映射 / 数据集 / 数据行

CREATE TABLE IF NOT EXISTS standard_fields (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS modules (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subtypes (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'norm',
  module_code TEXT NOT NULL DEFAULT 'YBT',
  FOREIGN KEY (module_code) REFERENCES modules(code)
);

CREATE TABLE IF NOT EXISTS subtype_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subtype_code TEXT NOT NULL,
  version_label TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  header_row INTEGER NOT NULL DEFAULT 1,
  data_start_row INTEGER NOT NULL DEFAULT 2,
  is_default INTEGER NOT NULL DEFAULT 0,
  biz_key_fields TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE (subtype_code, version_label),
  FOREIGN KEY (subtype_code) REFERENCES subtypes(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subtype_version_id INTEGER NOT NULL,
  original_column TEXT NOT NULL,
  standard_field TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'TEXT',
  is_required INTEGER NOT NULL DEFAULT 0,
  is_default_display INTEGER NOT NULL DEFAULT 0,
  UNIQUE (subtype_version_id, original_column),
  UNIQUE (subtype_version_id, standard_field),
  FOREIGN KEY (subtype_version_id) REFERENCES subtype_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (standard_field) REFERENCES standard_fields(code)
);

CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  source_file_name TEXT,
  sheet_name TEXT NOT NULL,
  subtype_version_id INTEGER NOT NULL,
  file_hash TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subtype_version_id) REFERENCES subtype_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS data_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  subtype_version_id INTEGER NOT NULL,
  sheet_name TEXT,
  row_num INTEGER,
  biz_key TEXT,
  payload TEXT NOT NULL,
  std_subtype TEXT,
  std_version TEXT,
  std_data_item TEXT,
  std_category TEXT NOT NULL DEFAULT 'norm',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (subtype_version_id) REFERENCES subtype_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_data_records_version ON data_records(subtype_version_id);
CREATE INDEX IF NOT EXISTS idx_data_records_biz_key ON data_records(subtype_version_id, biz_key);
CREATE INDEX IF NOT EXISTS idx_data_records_data_item ON data_records(std_data_item);
CREATE INDEX IF NOT EXISTS idx_datasets_version ON datasets(subtype_version_id);
