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

-- 1104 表样（矩阵结构，整表一条）
CREATE TABLE IF NOT EXISTS form_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_code TEXT NOT NULL,
  report_title TEXT,
  version_label TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  source_file_name TEXT,
  file_hash TEXT,
  matrix_json TEXT NOT NULL,
  merges_json TEXT NOT NULL DEFAULT '[]',
  row_count INTEGER NOT NULL DEFAULT 0,
  col_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (report_code, version_label)
);

CREATE INDEX IF NOT EXISTS idx_form_templates_report ON form_templates(report_code);

-- 1104 表样可搜索单元格索引（导入时从 matrix 提取，搜索不解析 JSON）
CREATE TABLE IF NOT EXISTS form_template_cells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  row_index INTEGER NOT NULL,
  col_index INTEGER NOT NULL,
  cell_text TEXT NOT NULL,
  cell_kind TEXT NOT NULL DEFAULT 'header',
  searchable INTEGER NOT NULL DEFAULT 1,
  reserve_1 TEXT,
  reserve_2 TEXT,
  FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE,
  UNIQUE (template_id, row_index, col_index)
);

CREATE INDEX IF NOT EXISTS idx_ftc_template ON form_template_cells(template_id);
CREATE INDEX IF NOT EXISTS idx_ftc_searchable ON form_template_cells(template_id, searchable);

-- 1104 合并填报说明 Word（按 G 表拆分存储）
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_code TEXT NOT NULL,
  doc_title TEXT,
  version_label TEXT NOT NULL DEFAULT '',
  module_code TEXT NOT NULL DEFAULT '1104',
  source_file_name TEXT,
  file_hash TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (doc_code, version_label)
);

CREATE TABLE IF NOT EXISTS document_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  parent_id INTEGER,
  node_kind TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  path TEXT,
  indicator_no INTEGER,
  indicator_key TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES document_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_nodes_doc ON document_nodes(document_id);
CREATE INDEX IF NOT EXISTS idx_document_nodes_indicator ON document_nodes(document_id, indicator_no);
CREATE INDEX IF NOT EXISTS idx_document_nodes_indicator_key ON document_nodes(document_id, indicator_key);

CREATE TABLE IF NOT EXISTS report_doc_mapping (
  report_code TEXT NOT NULL,
  version_label TEXT NOT NULL DEFAULT '',
  document_id INTEGER NOT NULL,
  doc_code TEXT NOT NULL,
  PRIMARY KEY (report_code, version_label),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_doc_mapping_doc ON report_doc_mapping(document_id);
