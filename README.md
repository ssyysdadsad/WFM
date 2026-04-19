
## WFM

WFM 是一个基于 `React + Vite + Ant Design + Supabase` 的排班管理后台。当前仓库已经从原型阶段推进到“共享后端优先”的正式联调阶段，覆盖以下能力：

- 模拟登录、路由守卫、菜单权限裁剪
- 字典管理服务化
- 主数据服务化
- 排班版本管理、排班矩阵、调班审批
- 公告管理、仪表盘与报表聚合
- Excel 导入导出闭环

## 目录概览

- `src/app/components/`
  - 页面与布局组件
- `src/app/services/`
  - 前端业务服务层，统一收口 PostgREST / RPC / Edge Function 调用
- `src/app/hooks/`
  - 当前用户、权限、字典、排班矩阵等业务 hook
- `src/app/types/`
  - 业务类型定义
- `src/app/lib/`
  - Supabase 客户端、错误映射、校验器、Excel 工具
- `src/tests/`
  - Vitest 单元与组件测试
- `e2e/`
  - Playwright 关键流程测试
- `supabase/migrations/`
  - 本地数据库迁移脚本
- `supabase/functions/`
  - 本地 Edge Functions 源码

## 本地运行

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

复制 `.env.example` 为 `.env.local`，至少补齐：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AUTH_MODE=mock
```

- `VITE_AUTH_MODE=mock`
  - 当前默认值，沿用模拟登录链路
- `VITE_AUTH_MODE=supabase`
  - 预留给后续真实 `Supabase Auth` 切换阶段

3. 启动开发服务器

```bash
npm run dev
```

4. 类型检查

```bash
npm run typecheck
```

5. 运行单元测试

```bash
npm test
```

6. 运行 E2E

```bash
npm run e2e
```

如需只回归排班版本导入/发布 UI 主链路，可执行：

```bash
npm run e2e:schedule-version
```

如需只回归调班审批页面的已处理幂等守卫，可执行：

```bash
npm run e2e:shift-change
```

7. 运行业务级 smoke

```bash
npm run smoke:business
```

- 需要在环境变量中提供真实账号：
  - `WFM_SMOKE_EMAIL` / `WFM_SMOKE_PASSWORD`
  - 或复用 `E2E_SUPABASE_EMAIL` / `E2E_SUPABASE_PASSWORD`
- 可选参数：
  - `WFM_SMOKE_PROJECT_ID`
  - `WFM_SMOKE_MONTH`
  - `WFM_SMOKE_SHIFT_CHANGE_REQUEST_ID`
- 脚本会执行：
  - 真实登录
  - Excel 导入新版本
  - 发布该版本
  - 导出该版本
  - 调班审批成功路径或已处理幂等守卫路径验证
- 结果会写入仓库根目录的 `tmp-business-smoke.json`

## 当前认证策略

- 当前前端使用 mock 登录打通：
  - 登录页
  - 路由守卫
  - 菜单权限
  - 页面内操作人上下文
- Supabase 客户端现已支持优先从环境变量读取 URL 和 anon key，便于后续切换真实认证与多环境配置。
- 真实 `Supabase Auth` 尚未切换为第一优先链路，因此当前部分 Edge Function 部署需要临时关闭 `verify_jwt` 才能与现有前端联调。后续接入真实 Auth 后，应恢复 JWT 校验。<mccoremem id="03fyn2tlmrzam2ij98d1olw10" />

## 已实现的 Supabase 能力

### 数据库迁移

已在仓库中沉淀：

- 权限种子与权限 RPC
- 字典约束
- 主数据约束
- 排班版本规则
- 排班矩阵约束与 RPC
- 调班审批规则
- 公告范围规则
- 报表视图与聚合 RPC
- Excel 导入批次规则
- Storage bucket / policy

### Edge Functions

已在仓库中提供源码：

- `schedule-publish`
- `shift-change-approve`
- `recalculate-work-metrics`
- `excel-import`
- `excel-export`

## 部署建议

### 数据库迁移

建议按 `supabase/migrations/` 文件名顺序执行，保证以下依赖顺序：

1. 基础权限与字典
2. 主数据约束
3. 排班版本与排班矩阵 RPC
4. 调班审批
5. 公告与报表
6. Excel 导入批次与 Storage

### Edge Functions

当前建议部署：

- `schedule-publish`
- `shift-change-approve`
- `recalculate-work-metrics`
- `excel-import`
- `excel-export`

在 mock 登录阶段：

- `schedule-publish`
- `shift-change-approve`
- `excel-import`
- `excel-export`

建议临时关闭 `verify_jwt`，否则前端匿名客户端无法直接调用。

## Excel 模板说明

当前导入模板采用首行表头格式：

```text
工号 | 姓名 | 部门 | 2026-04-01 | 2026-04-02 | ...
```

当前实现支持：

- 按工号或姓名匹配员工
- 按 `dict_item.item_code` 或 `item_name` 匹配排班编码
- 覆盖草稿版本
- 新建导入版本
- 导入结果与错误明细展示
- 按版本导出月矩阵 Excel

后续如需完全对齐线下模板，可继续补：

- 星期行
- 更严格单元格定位
- 错误报告文件持久化

## 测试现状

- Vitest：
  - 登录 smoke test
  - 字典扩展配置校验 test
  - Excel 解析/生成 test
- Playwright：
  - mock 登录与核心菜单导航骨架
  - 排班版本页面导入与发布主链路
  - 调班审批页面已处理记录幂等守卫
- 业务级 smoke：
  - `npm run smoke:business`
  - 覆盖真实登录、导入、发布、导出、调班审批联调

## 已知事项

- 目前仍有 Ant Design 弃用 warning：
  - `Space.direction`
  - `List`
- 打包后主 bundle 较大，后续可做按路由拆包。
  
