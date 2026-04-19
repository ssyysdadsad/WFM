# WFM 后台打通执行计划（基于现仓库与真实 Supabase 现状）

## Summary

- 目标：在不推翻现有 React + Ant Design + Supabase 原型仓库的前提下，把当前 Web 管理后台逐步升级为可联调、可回归、可沉淀共享后端能力的正式后台。
- 执行基线：
  - 以现有仓库真实结构为准，而不是完全按 `src/imports/readme.md` 的理想目录重建。
  - 以当前真实 Supabase `public` schema 为准，增量补充本地 `migrations / functions / types / services`。
  - 先使用“模拟登录”打通前台路由守卫、权限上下文和业务链路，再在后续阶段收口真实 `Supabase Auth` 绑定。
- 成功标准：
  - 页面层不再直接拼装复杂业务流程。
  - 复杂操作切换到服务层 + RPC / Edge Functions。
  - 关键数据库约束、RLS、业务函数、页面联调和测试脚本形成闭环。
  - 本地仓库具备可重复执行的迁移、类型、前端测试和 E2E 基础。

## Current State Analysis

### 1. 仓库实际结构

- 当前是 Vite + React SPA，入口文件真实存在：
  - `src/app/App.tsx`
  - `src/app/routes.tsx`
  - `src/app/components/Layout.tsx`
  - `src/main.tsx`
- 页面文件已覆盖主菜单，位于：
  - `src/app/components/DashboardPage.tsx`
  - `src/app/components/DictPage.tsx`
  - `src/app/components/pages/*.tsx`
- 当前没有以下正式分层目录：
  - `src/app/services/`
  - `src/app/types/`
  - `src/app/hooks/`
  - `src/app/lib/`
  - `src/tests/`
  - `supabase/migrations/`
- 当前 `supabase/functions/` 只有平台生成的占位函数：
  - `supabase/functions/server/index.tsx`
  - `supabase/functions/server/kv_store.tsx`

### 2. 前端代码现状

- 当前页面几乎都直接通过 `src/app/components/supabase.ts` 创建的 `supabase-js` 客户端访问底表。
- 直连表操作已确认存在于：
  - `src/app/components/CrudPage.tsx`
  - `src/app/components/DictPage.tsx`
  - `src/app/components/DashboardPage.tsx`
  - `src/app/components/pages/EmployeePage.tsx`
  - `src/app/components/pages/ScheduleVersionPage.tsx`
  - `src/app/components/pages/ScheduleMatrixPage.tsx`
  - `src/app/components/pages/ShiftChangePage.tsx`
  - `src/app/components/pages/ReportPage.tsx`
- `Layout.tsx` 顶部账号信息仍为固定“管理员”，没有真实会话、权限和路由守卫。
- `ScheduleVersionPage.tsx` 目前通过直接更新 `schedule_version` 完成“发布”。
- `ShiftChangePage.tsx` 目前通过直接更新 `shift_change_request` 完成审批。
- `ScheduleMatrixPage.tsx` 目前直接对 `schedule` 表做增删改批量写入，并把 `shift_type_dict_item_id` 直接等同于 `schedule_code_dict_item_id`。

### 3. 工程与测试现状

- `package.json` 只有 `dev` 和 `build` 两个脚本，没有测试脚本、lint 脚本和类型检查脚本。
- 仓库中未发现：
  - `vitest`
  - `playwright`
  - `@testing-library/*`
  - `tsconfig*.json`
  - lockfile
- `README.md` 仍是 Figma bundle 默认说明，没有当前项目落地运行、测试、迁移和环境文档。

### 4. 真实 Supabase 现状

- MCP 读取确认：真实项目 URL 为 `https://gtzbjvqqxsrffsvglula.supabase.co`。
- `public` schema 已存在业务表，且 RLS 已开启：
  - `dict_type`, `dict_item`
  - `scene`, `department`, `channel`
  - `employee`, `skill`, `employee_skill`
  - `labor_rule`
  - `project`, `task`, `device`, `task_device`
  - `shift_template`
  - `schedule_version`, `schedule`, `schedule_import_batch`
  - `shift_change_request`
  - `employee_work_metric`
  - `announcement`
  - `user_account`, `role`, `permission`, `user_role`, `role_permission`
- 数据库当前 migration 清单只有 1 条平台生成记录：
  - `20260417070838_create_kv_table_5ef9e54c`
- 远端 Edge Function 当前只有 1 个平台生成函数：
  - `make-server-5ef9e54c`

### 5. 与文档的关键差异

- `src/imports/readme.md` 描述了 Refine 风格的理想结构，但仓库当前并未使用 Refine，也没有对应 providers / resources / pages 分层。
- `src/imports/API接口文档.md` 规定登录最终走 `Supabase Auth`，但真实 `user_account` 表目前没有显式 `auth_user_id` 绑定字段。
- 用户已确认：本次执行顺序采用“先用模拟登录”，暂不把真实 `Supabase Auth` 绑定作为第一阶段阻塞项。

## Assumptions & Decisions

- 决策 1：沿用现有 `src/app/components` 与 `src/app/components/pages` 页面组织，不做大规模目录迁移。
- 决策 2：以“共享后端优先”为原则，但执行顺序调整为：
  - 先补前端工程分层与契约层
  - 再收口数据库函数与复杂流程
  - 最后补报表、导入导出和验收
- 决策 3：认证阶段先上“模拟登录 + 权限上下文 + 路由守卫”，不在第一阶段强绑真实 `Supabase Auth`。
- 决策 4：本地仓库先补齐对真实数据库的“反向收敛能力”：
  - 本地 `supabase/migrations/`
  - 本地 `supabase/functions/`
  - 本地生成类型
  - 数据服务层
- 决策 5：简单主数据继续允许走 PostgREST，但页面不再直接写查询和错误处理。
- 决策 6：复杂链路必须收口为：
  - 页面 -> hook / service -> RPC / Function
- 决策 7：所有新增后端能力都优先以“未来三端共享”为命名和返回结构约束。
- 假设 1：现有真实数据库表名与文档一致，当前缺的主要是本地 migration 落库、函数代码、服务层和测试体系。
- 假设 2：第一轮执行不做 Refine 重构；所有工作以当前 React Router + Ant Design 结构完成。
- 假设 3：如果后续真实登录要接入 `Supabase Auth`，将作为独立增量阶段，在已有模拟登录上下文之上切换。

## Proposed Changes

### 阶段 0：建立执行基座与契约同步

#### 目标

- 把当前“只有前端原型 + 真实远端库”状态，收口为“本地仓库可管理数据库与共享类型”的状态。

#### 具体修改

- 更新 `package.json`
  - 增加测试、类型检查、Supabase 相关脚本占位。
  - 增加 `vitest`、`@testing-library/react`、`playwright`、必要类型依赖。
- 新增 `tsconfig.json`
  - 为前端测试、路径别名和未来生成类型提供统一 TypeScript 配置。
- 新增 `src/app/types/database.ts`
  - 保存从真实 Supabase 生成的数据库类型。
- 新增 `src/app/lib/supabase/`
  - `client.ts`：复用现有客户端初始化。
  - `errors.ts`：统一把 PostgREST / RPC / Function 错误映射为业务错误。
  - `query.ts`：封装常用分页、筛选、排序。
- 调整 `src/app/components/supabase.ts`
  - 仅保留兼容导出，内部转发到新的 `src/app/lib/supabase/client.ts`，避免旧页面一次性全部报错。
- 新增目录：
  - `src/app/services/`
  - `src/app/hooks/`
  - `src/tests/`
  - `supabase/migrations/`
  - `supabase/functions/`

#### 先后顺序

1. 建立 TypeScript 配置和测试配置。
2. 生成数据库类型。
3. 抽出 Supabase 客户端与错误映射。
4. 为后续页面改造提供 service 骨架。

#### 验收

- 应用仍可正常启动。
- 新增基础 smoke test 可渲染 `App`。
- 旧页面可继续通过兼容客户端工作。

### 阶段 1：模拟登录、权限上下文与路由守卫

#### 目标

- 让现有后台先具备“可登录、可退出、按角色展示菜单和按钮”的正式骨架。

#### 具体修改

- 新增 `src/app/types/auth.ts`
  - 定义当前用户、角色、权限、菜单能力模型。
- 新增 `src/app/services/auth.service.ts`
  - 第一版采用 mock session。
  - 读取 `user_account / user_role / role_permission / permission` 组装权限数据。
- 新增 `src/app/hooks/useCurrentUser.ts`
  - 提供当前会话、切换角色、退出登录能力。
- 新增 `src/app/hooks/usePermission.ts`
  - 提供 `hasPermission()`、`hasModuleAccess()` 等判断。
- 新增 `src/app/components/auth/LoginPage.tsx`
  - 第一版为 mock 登录入口，允许按预置账号/角色进入。
- 新增 `src/app/components/auth/ProtectedRoute.tsx`
  - 保护路由，未登录跳转登录页。
- 更新 `src/app/App.tsx`
  - 注入 auth context。
- 更新 `src/app/routes.tsx`
  - 拆出登录页路由和受保护路由。
- 更新 `src/app/components/Layout.tsx`
  - 顶部显示真实当前账号名。
  - 菜单根据权限裁剪。

#### 数据库配套

- 新增 `supabase/migrations/20260417xxxx_permission_seed_baseline.sql`
  - 补齐缺失权限种子和菜单模块编码。
- 新增 `supabase/migrations/20260417xxxx_rpc_get_current_user_permissions.sql`
  - 为后续真实登录预留统一权限读取 RPC。

#### 验收

- 未登录无法进入主路由。
- 登录后顶部账号、菜单、页面访问控制生效。
- 权限 hook 能驱动按钮级可见性。

### 阶段 2：字典服务化与通用页面收口

#### 目标

- 把当前通用 CRUD 和字典管理从“页面直接写库”升级为“服务驱动 + 可复用字典缓存”。

#### 具体修改

- 新增 `src/app/types/dict.ts`
- 新增 `src/app/services/dict.service.ts`
  - 封装 `dict_type`、`dict_item` 的查询、保存、启停、JSON 解析校验。
- 新增 `src/app/hooks/useDict.ts`
  - 按 `type_code` 读取字典并带本地缓存。
- 更新 `src/app/components/DictPage.tsx`
  - 全部改为调用 `dict.service.ts`。
- 更新 `src/app/components/CrudPage.tsx`
  - 去除页面直连表逻辑。
  - 抽出最小通用能力：分页、搜索、表单保存、外键选项加载。
  - 不再负责复杂跨表模块。
- 新增 `src/app/lib/validators/dict.ts`
  - 校验 `extra_config`。

#### 数据库配套

- 新增 `supabase/migrations/20260417xxxx_dict_constraints.sql`
  - 补唯一约束、启停索引、关键字典项检查。

#### 验收

- 字典类型与字典项 CRUD 正常。
- `useDict` 可供其他模块复用。
- `extra_config` 错误不再直接显示数据库原始报错。

### 阶段 3：主数据模块按“简单/复杂”两类改造

#### 目标

- 让主数据模块可回归、可维护，并开始清理页面层跨表拼装逻辑。

#### 简单主数据

- 保持走通用页或薄页面：
  - `ScenePage.tsx`
  - `DepartmentPage.tsx`
  - `ChannelPage.tsx`
  - `SkillPage.tsx`
  - `LaborRulePage.tsx`

#### 复杂主数据

- 独立服务化改造：
  - `DevicePage.tsx`
  - `EmployeePage.tsx`
  - `ProjectPage.tsx`
  - `TaskPage.tsx`

#### 具体修改

- 新增 `src/app/types/master-data.ts`
- 新增 `src/app/services/master-data.service.ts`
  - 场景、部门、渠道、技能、员工、项目、任务、设备、任务设备统一收口。
- 新增 `src/app/services/employee-skill.service.ts`
  - 单独处理 `employee_skill` 的唯一性、主技能逻辑和详情页加载。
- 更新相关页面，去掉页面内直接 `supabase.from(...).insert/update/select`。

#### 数据库配套

- 新增 `supabase/migrations/20260417xxxx_master_data_constraints.sql`
  - 补齐主数据唯一约束、非负检查、索引。
- 新增 `supabase/migrations/20260417xxxx_task_device_rules.sql`
  - 保证 `task_device.device_id` 归属项目场景。
- 新增 `supabase/migrations/20260417xxxx_employee_skill_rules.sql`
  - 保证主技能唯一约束。

#### 验收

- 主数据页面均支持搜索、编辑、筛选、友好报错。
- 员工详情页技能维护通过服务层完成。
- 错误场景能正确拦截跨场景设备绑定和重复技能绑定。

### 阶段 4：排班版本正式化

#### 目标

- 把 `ScheduleVersionPage.tsx` 从直接改表升级为正式版本管理入口。

#### 具体修改

- 新增 `src/app/types/schedule-version.ts`
- 新增 `src/app/services/schedule-version.service.ts`
- 更新 `src/app/components/pages/ScheduleVersionPage.tsx`
  - 版本创建走服务层。
  - 发布动作改为调用 `schedule-publish` Function。
  - 页面显示发布状态、创建人、发布时间、备注。

#### 数据库配套

- 新增 `supabase/migrations/20260417xxxx_schedule_version_rules.sql`
  - 补月份约束、唯一约束、状态检查。
- 新增 `supabase/functions/schedule-publish/index.ts`
  - 校验版本状态、写 `published_at`、写 `published_by_user_account_id`。

#### 验收

- 同项目同月份版本号不能重复。
- 已发布版本不可重复覆盖。
- 页面不再直接更新 `schedule_version` 状态。

### 阶段 5：排班矩阵核心链路 RPC 化

#### 目标

- 把 `ScheduleMatrixPage.tsx` 从直写表模式升级为“矩阵查询 + 批量写入 + 冲突检查”的正式链路。

#### 具体修改

- 新增 `src/app/types/schedule.ts`
- 新增 `src/app/services/schedule.service.ts`
- 新增 `src/app/hooks/useScheduleMatrix.ts`
- 更新 `src/app/components/pages/ScheduleMatrixPage.tsx`
  - 页面只负责筛选、展示、单格交互和结果反馈。
  - 所有复杂业务写入与校验走 RPC。
- 第一轮仍保留现有交互体验：
  - 单格编辑
  - 刷班模式
  - 整行延续
  - 批量填充 / 批量清除

#### 数据库配套

- 新增 `supabase/migrations/20260417xxxx_schedule_constraints.sql`
  - 唯一约束、设备唯一、版本状态限制、跨表一致性。
- 新增 `supabase/migrations/20260417xxxx_rpc_get_schedule_matrix.sql`
- 新增 `supabase/migrations/20260417xxxx_rpc_bulk_upsert_schedule_cells.sql`
- 新增 `supabase/migrations/20260417xxxx_rpc_check_schedule_conflicts.sql`

#### 关键规则

- `schedule.project_id = schedule_version.project_id`
- 同人同日单版本唯一
- 同设备同日同班次单版本唯一
- `device_id` 必须来自项目场景
- `task_id` 必须属于项目
- 员工必须具备设备所需技能
- 已发布版本不可直接修改
- 修正当前“`shift_type_dict_item_id = schedule_code_dict_item_id`”的临时逻辑

#### 验收

- 页面不再直接对 `schedule` 表批量增删改。
- 冲突校验、技能校验、版本状态校验由 RPC 返回。
- 批量操作失败时可展示明确信息。

### 阶段 6：调班审批与公告联动

#### 目标

- 把审批和公告从原型 CRUD 升级为共享流程能力。

#### 调班审批

- 新增 `src/app/types/shift-change.ts`
- 新增 `src/app/services/shift-change.service.ts`
- 更新 `src/app/components/pages/ShiftChangePage.tsx`
  - 审批动作改调 `shift-change-approve` Function
- 新增 `supabase/functions/shift-change-approve/index.ts`
- 新增 `supabase/migrations/20260417xxxx_shift_change_rules.sql`

#### 公告管理

- 新增 `src/app/types/announcement.ts`
- 新增 `src/app/services/announcement.service.ts`
- 更新 `src/app/components/pages/AnnouncementPage.tsx`
  - 支持分类、发布时间、可见范围配置
- 新增 `supabase/migrations/20260417xxxx_announcement_visibility_rules.sql`

#### 联动

- `schedule-publish` Function 支持可选自动生成公告。

#### 验收

- 调班不能再通过页面直接改审批状态。
- 公告支持 `all / role / department / custom` 四类范围。
- 发布班表可选自动创建公告。

### 阶段 7：报表、工时画像与仪表盘聚合化

#### 目标

- 把 `DashboardPage.tsx` 和 `ReportPage.tsx` 从前端扫表统计切换为数据库聚合结果。

#### 具体修改

- 新增 `src/app/types/report.ts`
- 新增 `src/app/services/report.service.ts`
- 更新：
  - `src/app/components/DashboardPage.tsx`
  - `src/app/components/pages/ReportPage.tsx`
- 数据返回全部来自 RPC / 视图，而不是页面直接查多个表拼接。

#### 数据库配套

- 新增 `supabase/migrations/20260417xxxx_views_dashboard_and_reports.sql`
- 新增 `supabase/migrations/20260417xxxx_rpc_get_dashboard_overview.sql`
- 新增 `supabase/migrations/20260417xxxx_rpc_get_work_hours_summary.sql`
- 新增 `supabase/migrations/20260417xxxx_rpc_get_employee_profile_report.sql`
- 新增 `supabase/migrations/20260417xxxx_rpc_get_task_completion_report.sql`
- 新增 `supabase/migrations/20260417xxxx_rpc_get_device_usage_report.sql`
- 新增 `supabase/functions/recalculate-work-metrics/index.ts`

#### 验收

- 仪表盘不再在前端逐表 count 和映射。
- 报表筛选条件和数据口径由数据库侧统一定义。

### 阶段 8：Excel 导入导出闭环

#### 目标

- 完成最复杂的文件导入导出链路，并沉淀三端共享后端接口。

#### 具体修改

- 新增：
  - `src/app/components/pages/ScheduleImportPage.tsx` 或并入 `ScheduleVersionPage.tsx`
  - `src/app/components/schedule/ImportResultModal.tsx`
  - `src/app/components/schedule/ImportErrorTable.tsx`
  - `src/app/services/schedule-import.service.ts`
  - `src/app/services/schedule-export.service.ts`
- 新增 Edge Functions：
  - `supabase/functions/excel-import/index.ts`
  - `supabase/functions/excel-export/index.ts`
- 新增迁移：
  - `supabase/migrations/20260417xxxx_schedule_import_batch_rules.sql`
  - `supabase/migrations/20260417xxxx_storage_policies.sql`

#### 实现要点

- 解析标准月矩阵模板。
- 写入 `schedule_import_batch`。
- 生成草稿版本。
- 输出单元格级错误。
- 导出文件通过 Storage 管理。

#### 验收

- 28/29/30/31 天月份均可导出。
- 导入后 `schedule_version / schedule / schedule_import_batch` 数据闭环正确。

### 阶段 9：测试体系与总体验收

#### 目标

- 为前面各阶段补齐最小但有效的自动化保障，并完成最终联调。

#### 具体修改

- 新增：
  - `vitest.config.ts`
  - `playwright.config.ts`
  - `src/tests/setup.ts`
  - `src/tests/**/*.test.tsx`
  - `e2e/**/*.spec.ts`
- 补充 `README.md`
  - 说明开发、测试、迁移、环境变量和共享后端结构。

#### 推荐测试分层

- 前端单元/组件测试：
  - `App` 渲染
  - 路由守卫
  - 权限 hook
  - 关键服务错误映射
- 数据库/RPC 验证：
  - `get_current_user_permissions`
  - `get_schedule_matrix`
  - `bulk_upsert_schedule_cells`
  - `check_schedule_conflicts`
- E2E：
  - mock 登录
  - 主数据维护
  - 版本创建与发布
  - 矩阵编辑
  - 调班审批

#### 验收

- `npm test` 可运行基础测试。
- `npm run e2e` 可运行关键主流程。
- 数据库迁移可按顺序重放。

## 执行顺序与里程碑

### 里程碑 1：可维护骨架

- 阶段 0 + 阶段 1 + 阶段 2
- 产出：工程分层、模拟登录、权限上下文、字典服务、通用错误映射

### 里程碑 2：主数据与版本管理

- 阶段 3 + 阶段 4
- 产出：主数据服务化、排班版本正式发布链路

### 里程碑 3：排班闭环

- 阶段 5 + 阶段 6
- 产出：矩阵 RPC 化、调班审批 Function、公告联动

### 里程碑 4：统计与文件闭环

- 阶段 7 + 阶段 8 + 阶段 9
- 产出：报表聚合、Excel 导入导出、自动化测试与验收文档

## Verification Steps

### 1. 前端工程验证

- 应用构建成功。
- 关键页面路由可加载。
- 模拟登录、退出、菜单权限和页面守卫生效。

### 2. 数据库验证

- 本地 migration 按时间顺序可执行。
- 约束、索引、RLS、RPC、Functions 不破坏现有业务表和种子数据。

### 3. 页面联调验证

- 每完成一个模块，立即验证：
  - 列表加载
  - 新增/编辑
  - 搜索/筛选
  - 权限差异
  - 异常报错

### 4. 主流程验证

- 主流程 1：mock 登录 -> 字典 -> 主数据配置
- 主流程 2：创建排班版本 -> 矩阵排班 -> 冲突校验 -> 发布
- 主流程 3：调班申请记录 -> 后台审批 -> 班表更新
- 主流程 4：查看仪表盘与报表
- 主流程 5：Excel 导入 -> 草稿版本 -> 错误报告 -> 导出

### 5. 延后事项

- 真实 `Supabase Auth` 绑定改造不在第一轮阻塞范围内。
- 当 mock 登录链路稳定后，再单开增量阶段切换真实登录：
  - 账号映射策略
  - 登录页真实表单
  - token 注入
  - RLS 与前端会话对齐
