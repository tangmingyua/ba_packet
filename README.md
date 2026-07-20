# 监管报送资料检索

基于 **Vue 3 + Node.js + SQLite（sql.js）** 的本地离线资料检索工具。

## 功能

- 关键词搜索一表通资料（匹配 `数据项名称`）
- 输入联想（包含匹配、相关度排序、最多 10 条）
- 结果按报送标签页 + 报表名称分块展示（监管报送 | 集市左右分栏）
- Excel 导入，主键（表名 + 数据项名称）增量更新

## 数据格式

支持 `监管集市-YBT_血缘分析_*.xlsx` 类文件，自动识别含「血缘 / YBT」的工作表。

必填列：`表名`、`数据项名称`

## 开发

```bash
npm install
cd packages/server && npm install   # 若根目录 install 因 electron 失败
npm run test                        # 运行 AC 测试（28 项）
npm run dev                         # 启动 API + Web
```

- Web: http://localhost:5173
- API: http://127.0.0.1:39281

## 导入 Excel

```bash
# 将 Excel 放在项目根目录，或指定路径
npm run import:excel
npm run import:excel -- "D:\path\监管集市-YBT_血缘分析_0706_新.xlsx"
```

也可在 Web 端「资料导入」页面上传。

## 测试

```bash
npm run test -w @ba-packet/server
```

测试覆盖 Spec 中 AC-01 ~ AC-10（联想、搜索、导入 UPSERT、API 集成）。

## 数据库

轻量 SQLite 单文件：`packages/server/data/catalog.db`（可通过环境变量 `BA_DB_PATH` 指定）。

## 规格文档

见 [docs/specs/regulatory-search.md](docs/specs/regulatory-search.md)
