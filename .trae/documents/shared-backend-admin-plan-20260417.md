# WFM 后台打通实施计划

## Summary

- 目标：基于当前仓库已有的 Web 管理后台原型、`src/imports` 下的 PRD/架构/schema/API 文档，以及已落地的 Supabase 数据库，完成“共享后端优先”的后台打通方案。
- 范围：
  - 完成当前 `Web 管理后台` 的全链路打通。
  - 同步建设 `Supabase 数据层 / RLS / SQL RPC / Edge Functions / Storage`，作为后续管理端小程序与员工端小程序可复用的共享后端。
  - 本次不做小程序 UI 页面实现，但共享接口、权限模型、数据口径按三端共用设计一次到位。
- 交付原则：
  - 每完成一个功能模块，立即执行该模块的数据库校验、接口验证、页面联调和回归测试。
  - 优先把“直接操作底表”的原型代码收敛为“页面 -> 服务层 -> RPC/Functions/受控表访问”的正式链路。
  - 所有设计以现有文档与真实数据库为准，不推翻现有表模型。

## Current State Analysis

### 1. 文档与目标架构

- `src/imports/PRD.md`
  - 已完整定义业务边界、核心流程、字段口径、字典体系、Excel 导入导出、调班审批、报表与权限要求。
- `src/imports/readme.md`
  - 给出目标架构：`React + Supabase`，复杂流程优先走 `SQL RPC / Edge Functions`，统计优先走数据库聚合。
  - 给出建议目录，但当前仓库尚未形成该分层。
- `src/imports/schema.md`
  - 已给出完整表设计、约束、索引、跨表规则。
- `src/imports/API接口文档.md`
  - 已给出目标接口面：`PostgREST CRUD + RPC + Functions`。

### 2. 当前数据库状态

- 当前 Supabase `public` schema 已存在核心业务表：
  - `dict_type`, `dict_item`
  - `scene`, `department`, `channel`, `employee`, `skill`, `employee_skill`
  - `labor_rule`
  - `project`, `task`, `device`, `task_device`
  - `shift_template`
  - `schedule_version`, `schedule`, `schedule_import_batch`
  - `shift_change_request`
  - `employee_work_metric`
  - `announcement`
  - `user_account`, `role`, `permission`, `user_role`, `role_permission`
- 当前业务表已开启 `RLS`。
- 当前库中已有少量种子数据，可支持联调：
  - 1 个场景、1 个项目、2 个任务、2 台设备、3 名员工、1 个排班版本、6 条排班记录、1 条调班申请、2 条公告。

### 3. 当前前端状态

- 入口与路由：
  - `src/app/App.tsx`
  - `src/app/routes.tsx`
  - `src/app/components/Layout.tsx`
- 当前页面覆盖主菜单，但实现深度不一致：
  - 通用 CRUD：`src/app/components/CrudPage.tsx`
  - 字典：`src/app/components/DictPage.tsx`
  - 核心业务页：`src/app/components/pages/*.tsx`
  - 仪表盘：`src/app/components/DashboardPage.tsx`
- 当前页面以 `src/app/components/supabase.ts` 中的 `supabase-js` 直连表为主，缺少：
  - 服务层封装
  - 统一权限与错误处理
  - 复杂流程的 RPC/Functions 收口
  - 共享类型定义
  - 自动化测试体系

### 4. 当前主要差距

- 数据层差距：
  - 文档中的跨表规则、唯一约束、状态流转、RLS 策略需要逐项核实并补齐。
- 接口层差距：
  - `schema/API` 中提到的关键 RPC / Edge Functions 基本未在仓库中实现。
- 页面层差距：
  - 多数页面仅停留在原型 CRUD。
  - `ScheduleMatrixPage.tsx`、`ScheduleVersionPage.tsx`、`ShiftChangePage.tsx` 仍以直接改表为主，尚未切换到正式业务链路。
- 测试差距：
  - 当前仓库没有系统化的单元测试、集成测试、E2E 测试和数据库回归验证脚本。

## Assumptions & Decisions

- 决策 1：本次实施范围为“共享后端优先”。
  - Web 管理后台完整打通。
  - 小程序共享后端能力一次规划到位。
  - 小程序 UI 本次不做。
- 决策 2：不推翻现有 Supabase 表模型。
  - 仅通过 migration 对约束、索引、RLS、函数、视图做增量完善。
- 决策 3：页面层逐步从“直接操作底表”迁移为：
  - 简单主数据：页面 -> 服务层 -> PostgREST
  - 复杂流程：页面 -> 服务层 -> RPC / Edge Functions
- 决策 4：测试按模块跟进，不等全部开发完成后再统一测试。
- 决策 5：测试分 4 层：
  - 数据库结构/约束测试
  - RPC / Functions 接口测试
  - 页面组件与交互测试
  - 关键主流程 E2E 测试
- 假设 1：沿用现有 `src/app/components` 为页面目录，不做大规模页面迁移。
- 假设 2：新增更正式的代码层次，用于共享类型、服务、权限、测试支撑：
  - `src/app/services/`
  - `src/app/types/`
  - `src/app/hooks/`
  - `src/app/lib/`
  - `src/tests/`
  - `supabase/migrations/`
  - `supabase/functions/<function-name>/`
- 假设 3：认证与权限以 Supabase Auth + `user_account/role/permission` + RLS 为准，不另建自有登录体系。

## Proposed Changes

### A. 工程基础与分层收口

#### 计划新增/调整文件

- `package.json`
  - 增加测试与质量工具依赖与脚本。
- `src/app/components/supabase.ts`
  - 保留客户端初始化，但不再让页面直接拼业务流程。
- `src/app/lib/`
  - 新增请求封装、错误映射、日期/字典/状态工具函数。
- `src/app/services/`
  - 新增模块化服务层，统一调用 PostgREST / RPC / Functions。
- `src/app/types/`
  - 新增业务类型、接口入参与返回结构。
- `src/tests/`
  - 新增前端测试工具、测试数据、公共 mock。
- `supabase/migrations/`
  - 新增数据库约束、索引、RLS、RPC、视图迁移。
- `supabase/functions/`
  - 新增正式业务 Edge Functions。

#### 实施方式

- 建立统一目录和命名规则，避免继续把所有逻辑堆在页面组件中。
- 服务层按业务域拆分：
  - `dict.service.ts`
  - `master-data.service.ts`
  - `schedule.service.ts`
  - `report.service.ts`
  - `auth.service.ts`
- 错误统一映射为文档中的业务错误码，页面不直接展示原始数据库报错。

#### 测试

- 前端基础测试：
  - 安装并配置 `Vitest + React Testing Library`。
  - 增加基础 smoke test，验证应用可渲染、路由可加载。
- 类型与服务层测试：
  - 对服务层做 mock 测试，验证错误映射、参数转换、日期格式化正确。

### B. 认证、账号与权限体系

#### 目标

- 打通登录、会话、账号绑定、角色加载、页面访问控制、按钮权限控制、数据权限隔离。

#### 计划新增/调整文件

- 现有文件：
  - `src/app/App.tsx`
  - `src/app/routes.tsx`
  - `src/app/components/Layout.tsx`
- 新增文件：
  - `src/app/services/auth.service.ts`
  - `src/app/hooks/useCurrentUser.ts`
  - `src/app/hooks/usePermission.ts`
  - `src/app/components/auth/LoginPage.tsx`
  - `src/app/components/auth/ProtectedRoute.tsx`
  - `src/app/types/auth.ts`
  - `supabase/migrations/*_auth_rls.sql`
  - `supabase/migrations/*_permission_seed.sql`
  - `supabase/migrations/*_rpc_get_current_user_permissions.sql`

#### 实施方式

- 基于 Supabase Auth 建立登录流程。
- 登录后读取 `user_account -> user_role -> role_permission -> permission`。
- 页面路由级控制：
  - 未登录不可访问。
  - 无权限模块隐藏或禁用。
- 数据级控制：
  - 管理员：全局
  - 部门负责人：本部门
  - 员工：本人
- 将当前顶部“管理员”假数据替换为真实当前账号信息。

#### 测试

- 数据库测试：
  - 验证不同角色下 RLS 读取结果是否符合预期。
- 接口测试：
  - 验证 `get_current_user_permissions` RPC 返回角色与权限集合。
- 页面测试：
  - 验证未登录重定向、登录后菜单展示、无权限页面拦截。
- 回归测试：
  - 验证字典、项目、排班等页面在三种角色下的可见差异。

### C. 字典体系正式化

#### 目标

- 让字典管理成为所有业务模块的稳定基础，特别是 `schedule_code`、`shift_type`、状态字典与扩展配置。

#### 计划新增/调整文件

- 现有文件：
  - `src/app/components/DictPage.tsx`
- 新增文件：
  - `src/app/services/dict.service.ts`
  - `src/app/types/dict.ts`
  - `src/app/hooks/useDict.ts`
  - `supabase/migrations/*_dict_constraints.sql`
  - `supabase/migrations/*_dict_seed_update.sql`

#### 实施方式

- 将 `DictPage.tsx` 改为通过服务层访问。
- 增加字典类型过滤、启停、排序、JSON 扩展配置校验。
- 对关键字典增加业务校验：
  - `schedule_code.extra_config`
  - `shift_type.extra_config`
- 建立本地缓存/字典 hook，供项目、排班、调班、报表复用。

#### 测试

- 单元测试：
  - 校验 `extra_config` 解析与字段校验。
- 集成测试：
  - 新增/编辑/停用字典类型与字典项。
- 数据库测试：
  - 验证字典唯一约束、启停状态生效。

### D. 主数据模块打通

#### 覆盖功能

- 场景、设备、部门、渠道、员工、技能、员工技能、用工规则、项目、任务、任务设备绑定。

#### 计划新增/调整文件

- 现有页面：
  - `src/app/components/pages/ScenePage.tsx`
  - `src/app/components/pages/DevicePage.tsx`
  - `src/app/components/pages/DepartmentPage.tsx`
  - `src/app/components/pages/ChannelPage.tsx`
  - `src/app/components/pages/EmployeePage.tsx`
  - `src/app/components/pages/SkillPage.tsx`
  - `src/app/components/pages/LaborRulePage.tsx`
  - `src/app/components/pages/ProjectPage.tsx`
  - `src/app/components/pages/TaskPage.tsx`
  - `src/app/components/CrudPage.tsx`
- 新增文件：
  - `src/app/services/master-data.service.ts`
  - `src/app/types/master-data.ts`
  - `supabase/migrations/*_master_data_constraints.sql`
  - `supabase/migrations/*_task_device_rules.sql`
  - 如有必要：`supabase/migrations/*_view_project_context.sql`

#### 实施方式

- 重写 `CrudPage.tsx` 的适用边界：
  - 继续用于简单主数据。
  - 复杂模块由独立页面处理，不强行共用。
- 主数据页面统一补齐：
  - 搜索、分页、状态筛选、启停
  - 外键字段正确联动
  - 表单校验
  - 友好错误提示
- 重点处理跨表规则：
  - 项目必须关联场景
  - 设备必须属于场景且绑定技能
  - 任务必须属于项目
  - `task_device.device_id` 必须来自项目场景
  - `employee_skill` 唯一与主技能约束

#### 测试

- 数据库测试：
  - 验证主键、唯一约束、检查约束、FK、索引是否生效。
- 页面联调测试：
  - 每个模块完成后做新增、编辑、筛选、停用回归。
- 跨表规则测试：
  - 用错误场景验证 `task_device` 不能绑定非项目场景设备。
  - 验证员工技能唯一约束和主技能唯一约束。

### E. 排班版本管理

#### 目标

- 将排班版本从“原型表编辑”升级为正式的项目月度版本管理入口。

#### 计划新增/调整文件

- 现有页面：
  - `src/app/components/pages/ScheduleVersionPage.tsx`
- 新增文件：
  - `src/app/services/schedule-version.service.ts`
  - `src/app/types/schedule-version.ts`
  - `supabase/migrations/*_schedule_version_rules.sql`
  - `supabase/migrations/*_function_schedule_publish.sql`

#### 实施方式

- 版本创建逻辑统一走服务层。
- 草稿 / 已发布 / 重发版状态明确化。
- 发布动作不再直接 `update schedule_version`，改为调用 `schedule-publish` Function。
- 严格执行：
  - 已发布版本不得直接覆盖
  - 同项目同月份版本号唯一
  - 发布时写 `published_at`、`published_by_user_account_id`
  - 可选同步公告

#### 测试

- 数据库测试：
  - 唯一约束与月份字段约束。
- 接口测试：
  - 发布函数成功/失败路径。
- 页面测试：
  - 新建版本、查看版本、发布版本、重复发布拦截。

### F. 排班矩阵与排班明细核心链路

#### 目标

- 把当前最核心的 `ScheduleMatrixPage.tsx` 从“可编辑原型”升级为正式排班引擎前端。

#### 计划新增/调整文件

- 现有页面：
  - `src/app/components/pages/ScheduleMatrixPage.tsx`
- 新增文件：
  - `src/app/services/schedule.service.ts`
  - `src/app/types/schedule.ts`
  - `src/app/hooks/useScheduleMatrix.ts`
  - `supabase/migrations/*_schedule_constraints.sql`
  - `supabase/migrations/*_rpc_get_schedule_matrix.sql`
  - `supabase/migrations/*_rpc_bulk_upsert_schedule_cells.sql`
  - `supabase/migrations/*_rpc_check_schedule_conflicts.sql`

#### 实施方式

- 页面只负责：
  - 筛选条件
  - 矩阵展示
  - 单格编辑 / 刷班 / 批量填充
  - 冲突提示
- 复杂逻辑统一收口到 RPC：
  - 获取矩阵
  - 批量写入
  - 冲突校验
- 规则补齐：
  - 同人同日单版本唯一
  - 同设备同日同班次唯一
  - 设备必须归项目场景
  - 设备必须绑定到任务
  - 员工必须具备设备技能
  - Excel 基础导入允许 `task_id/device_id` 为空
  - 手工完整排班时强化 `task/device` 校验
- 修正当前原型中“`shift_type_dict_item_id` 直接等于 `schedule_code_dict_item_id`”这类不正式映射。

#### 测试

- RPC 测试：
  - 获取矩阵数据
  - 批量插入
  - 批量更新
  - 冲突校验
- 规则测试：
  - 技能不匹配、设备未绑定任务、重复排班、超出版本状态限制。
- 页面测试：
  - 单格编辑、刷班、批量填充、删除、刷新、部门过滤。
- E2E 测试：
  - 创建版本 -> 打开矩阵 -> 批量排班 -> 发布前预校验。

### G. Excel 导入导出

#### 目标

- 实现 PRD 中最重要的“标准 Excel 月矩阵”导入导出闭环。

#### 计划新增/调整文件

- 新增页面/组件：
  - `src/app/components/pages/ScheduleImportPage.tsx` 或并入 `ScheduleVersionPage.tsx`
  - `src/app/components/schedule/ImportResultModal.tsx`
  - `src/app/components/schedule/ImportErrorTable.tsx`
- 新增服务：
  - `src/app/services/schedule-import.service.ts`
  - `src/app/services/schedule-export.service.ts`
- 新增函数：
  - `supabase/functions/excel-import/index.ts`
  - `supabase/functions/excel-export/index.ts`
- 新增迁移：
  - `supabase/migrations/*_schedule_import_batch_rules.sql`
  - `supabase/migrations/*_storage_policies.sql`

#### 实施方式

- `excel-import`
  - 解析第一个 Sheet
  - 校验标题、日期、星期、A3=姓名、完整月矩阵结构
  - 根据 `schedule_code` 字典映射班次/工时
  - 写入 `schedule_import_batch`
  - 生成草稿版本
  - 返回错误定位到单元格
- `excel-export`
  - 按项目 + 月份 + 版本导出标准矩阵模板
  - 保持和线下模板一致
- 文件存储走 Supabase Storage：
  - 原始文件
  - 错误报告
  - 导出文件

#### 测试

- 函数测试：
  - 正常导入
  - 已发布版本覆盖拦截
  - 同名员工多条匹配报错
  - 空白单元格报错
  - 编码不存在报错
  - 星期不匹配报错
- 导出测试：
  - 28/29/30/31 天自然月格式正确。
- 页面联调：
  - 上传、预校验、错误报告查看、导出下载。
- 回归测试：
  - 导入后 `schedule_version / schedule / schedule_import_batch` 三表数据闭环正确。

### H. 调班申请与审批

#### 目标

- 按文档打通互换调班与直接变更两类流程。

#### 计划新增/调整文件

- 现有页面：
  - `src/app/components/pages/ShiftChangePage.tsx`
- 新增文件：
  - `src/app/services/shift-change.service.ts`
  - `src/app/types/shift-change.ts`
  - `supabase/functions/shift-change-approve/index.ts`
  - `supabase/migrations/*_shift_change_rules.sql`

#### 实施方式

- 审批动作不再直接改 `shift_change_request` 表。
- 改为调用 `shift-change-approve` Function 完成：
  - 状态流转校验
  - 目标班次/设备/任务合法性校验
  - 工时冲突校验
  - 审批通过后修改生效班表并保留历史
- Web 管理后台提供审批视图。
- 后续小程序可直接复用该审批 Function。

#### 测试

- 函数测试：
  - `swap` 成功/失败
  - `direct_change` 成功/失败
  - 已审批申请重复审批拦截
  - 技能不匹配/设备非法/任务状态非法
- 页面测试：
  - 审批列表、查看详情、通过、拒绝、状态刷新。

### I. 公告管理与发布联动

#### 目标

- 打通公告管理，并与班表发布形成联动通知机制。

#### 计划新增/调整文件

- 现有页面：
  - `src/app/components/pages/AnnouncementPage.tsx`
- 新增文件：
  - `src/app/services/announcement.service.ts`
  - `src/app/types/announcement.ts`
  - `supabase/migrations/*_announcement_visibility_rules.sql`

#### 实施方式

- 公告管理支持：
  - 分类
  - 发布时间
  - 可见范围配置
- 发布班表时可勾选自动生成公告。
- 公告范围设计按后续三端共享：
  - all
  - role
  - department
  - custom

#### 测试

- 页面测试：
  - 新增、编辑、筛选、范围配置。
- 数据权限测试：
  - 不同角色读取公告范围是否正确。
- 联动测试：
  - 发布班表触发公告创建。

### J. 仪表盘与报表体系

#### 目标

- 从当前简单统计升级为文档要求的基础报表与仪表盘。

#### 计划新增/调整文件

- 现有页面：
  - `src/app/components/DashboardPage.tsx`
  - `src/app/components/pages/ReportPage.tsx`
- 新增文件：
  - `src/app/services/report.service.ts`
  - `src/app/types/report.ts`
  - `supabase/migrations/*_views_dashboard_and_reports.sql`
  - `supabase/migrations/*_rpc_get_dashboard_overview.sql`
  - `supabase/migrations/*_rpc_get_work_hours_summary.sql`
  - `supabase/migrations/*_rpc_get_employee_profile_report.sql`
  - `supabase/migrations/*_rpc_get_task_completion_report.sql`
  - `supabase/migrations/*_rpc_get_device_usage_report.sql`
  - `supabase/functions/recalculate-work-metrics/index.ts`

#### 实施方式

- 仪表盘改为调用聚合 RPC，而不是页面自行扫表统计。
- 报表覆盖：
  - 排班明细表
  - 工时统计表
  - 员工工时画像报表
  - 任务完成报表
  - 设备使用报表
- `employee_work_metric` 改为通过定时/手动函数重算。

#### 测试

- RPC 测试：
  - 各报表数据返回结构与筛选条件。
- 数据口径测试：
  - 已发布班表工时统计
  - 任务完成率计算
  - 未绑定任务的 Excel 基础导入不进入任务报表
- 页面测试：
  - 图表与表格联动、筛选、空状态展示。

### K. 质量体系与验收闭环

#### 计划新增/调整文件

- `package.json`
- `vite.config.ts`
- 新增：
  - `vitest.config.ts`
  - `playwright.config.ts`
  - `src/tests/setup.ts`
  - `src/tests/**/*.test.ts(x)`
  - `e2e/**/*.spec.ts`
  - `supabase/tests/*.sql` 或 `supabase/tests/*.md`

#### 实施方式

- 建立 3 套测试流水：
  - 前端单元/组件测试
  - 后端函数与 RPC 验证
  - 浏览器级 E2E
- 关键 E2E 用例：
  - 登录与权限
  - 主数据新增编辑
  - 项目 -> 任务 -> 设备绑定
  - 排班版本创建与发布
  - 排班矩阵编辑
  - Excel 导入导出
  - 调班审批
  - 报表查看

#### 测试

- 这是测试体系本身，因此验收为：
  - `npm test` 可运行单元与组件测试
  - `npm run e2e` 可运行关键流程 E2E
  - Supabase 迁移后可执行数据库校验脚本

## 功能实施计划表

| 阶段 | 功能模块 | 实现内容 | 交付物 | 完成后立即执行的测试 |
| --- | --- | --- | --- | --- |
| 1 | 工程基础与分层 | 建立 services/types/hooks/lib/test 基础设施，统一错误处理 | 基础目录、服务层骨架、测试配置 | 应用 smoke test、服务层单元测试 |
| 2 | 认证与权限 | 登录、会话、菜单权限、路由守卫、RLS 对齐 | 登录页、权限 hooks、权限 RPC、RLS migration | 角色登录测试、RLS 测试、权限页面测试 |
| 3 | 字典体系 | 字典类型/字典项正式化，关键字典扩展配置校验 | 字典服务、字典 hook、字典迁移 | 字典 CRUD 测试、JSON 校验测试 |
| 4 | 主数据 1 | 场景、设备、技能、部门、渠道 | 页面改造、主数据服务、约束迁移 | 每个模块新增/编辑/停用回归、FK/唯一约束测试 |
| 5 | 主数据 2 | 员工、员工技能、用工规则、项目、任务、任务设备绑定 | 页面改造、跨表校验、服务层 | 员工技能唯一性测试、任务设备场景一致性测试 |
| 6 | 排班版本 | 版本创建、草稿/发布、重发版 | 排班版本服务、发布函数 | 版本唯一性测试、发布流程测试 |
| 7 | 排班矩阵 | 获取矩阵、单格编辑、批量写入、冲突校验 | 排班 RPC、矩阵页面重构 | 冲突测试、技能校验测试、矩阵交互 E2E |
| 8 | Excel 导入导出 | 标准模板导入导出、批次追溯、错误报告 | 两个 Edge Functions、导入页面 | 模板校验测试、错误定位测试、导入导出联调 |
| 9 | 调班审批 | 互换调班、直接变更、审批流 | 审批函数、审批页重构 | 审批状态流转测试、异常路径测试 |
| 10 | 公告管理 | 公告 CRUD、可见范围、发布联动 | 公告服务、可见性规则 | 可见范围测试、发布联动测试 |
| 11 | 仪表盘与报表 | 聚合统计、画像、任务/设备报表 | 统计 RPC、重算函数、报表页面 | 数据口径测试、图表与筛选回归 |
| 12 | 总体验收 | 全量回归、修复、文档补齐 | 验收清单、回归结果 | 全流程 E2E、关键角色回归、数据库迁移验证 |

## Verification Steps

### 1. 数据库层验证

- 使用 Supabase migration 顺序执行增量脚本。
- 校验：
  - 表结构未破坏现有数据
  - 唯一约束/检查约束/FK/索引/RLS 正常
  - RPC / Functions 可调用

### 2. 接口层验证

- 对每个 RPC / Function 编写输入输出验证用例：
  - 正常路径
  - 业务错误路径
  - 权限错误路径

### 3. 页面层验证

- 每个页面验证：
  - 列表加载
  - 搜索筛选
  - 新增编辑
  - 状态切换
  - 错误提示
  - 权限差异

### 4. 主流程验收

- 主流程 1：
  - 登录 -> 字典配置 -> 主数据配置 -> 创建项目 -> 创建设备与任务 -> 绑定任务设备
- 主流程 2：
  - 创建排班版本 -> 排班矩阵编辑 -> 冲突校验 -> 发布
- 主流程 3：
  - Excel 导入 -> 草稿版本生成 -> 错误报告查看 -> 导出
- 主流程 4：
  - 员工发起调班 -> 后台审批 -> 班表生效更新
- 主流程 5：
  - 查看仪表盘与报表 -> 验证统计口径

### 5. 验收标准

- Web 管理后台所有菜单从“可展示原型”升级为“可操作正式后台”。
- 共享后端能力满足未来小程序直接复用：
  - 认证
  - 权限
  - 排班
  - 调班
  - 公告
  - 报表
- 每个功能模块开发完成后都有对应测试记录，最终形成可重复执行的回归集。
