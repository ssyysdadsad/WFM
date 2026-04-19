# WFM 真实 Supabase Auth 切换清单

## 目标

- 在不打断现有 mock 登录联调链路的前提下，把后台认证逐步切换到真实 `Supabase Auth`
- 让前端会话、数据库 RLS、Edge Function JWT 校验保持一致
- 保留回退开关，确保切换期间可快速恢复到 mock 模式

## 当前基线

- 前端已具备：
  - 登录页
  - 路由守卫
  - 当前用户上下文
  - 权限菜单裁剪
- 当前用户侧函数部署策略：
  - `schedule-publish`
  - `shift-change-approve`
  - `excel-import`
  - `excel-export`
  - 以上函数当前为 `verify_jwt=false`
- 客户端已支持环境变量：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_AUTH_MODE`

## 切换前置条件

### 1. 账号映射方案定稿

- 推荐新增 `user_account.auth_user_id uuid unique`
- 要求：
  - 与 `auth.users.id` 一一映射
  - 历史 mock 账号可按用户名或手机号完成首次绑定
  - 后台权限仍以 `user_account / user_role / role_permission / permission` 为准

### 2. 数据库迁移

- 新增 migration：
  - `user_account.auth_user_id`
  - 唯一索引
  - 外键到 `auth.users(id)` 或通过触发器做弱绑定校验
- 如需支持自动建档：
  - 增加 `auth.users -> public.user_account` 同步触发器

### 3. RLS 策略切换

- 所有依赖匿名前端直连的表策略，需要补充 authenticated 策略
- 推荐基线：
  - 读取当前用户：`auth.uid() = user_account.auth_user_id`
  - 角色权限：通过 `rpc_get_current_user_permissions` 或安全视图统一读取
  - 写操作：只允许具备对应角色/权限的 authenticated 用户执行

## 前端改造顺序

### 阶段 A：保留 mock，增加真实会话读取

- `AuthProvider` 新增双模式：
  - `mock`
  - `supabase`
- `VITE_AUTH_MODE=mock` 时保持现状
- `VITE_AUTH_MODE=supabase` 时：
  - 读取 `supabase.auth.getSession()`
  - 监听 `supabase.auth.onAuthStateChange()`
  - 用 `auth.uid()` 对应的 `user_account` 拉取权限与用户资料

### 阶段 B：新增真实登录表单

- 登录页新增邮箱/手机号 + 密码表单
- 调用：
  - `supabase.auth.signInWithPassword`
- 保留 mock 入口，但仅在 `mock` 模式显示

### 阶段 C：权限装载切换

- 新增 `getCurrentUserBySession()` 服务
- 输入：
  - 当前 session user id
- 输出：
  - `CurrentUser`
  - `roles`
  - `permissions`
- mock 模式仍可复用当前 `CurrentUser` 结构，避免页面层改动

### 阶段 D：退出登录切换

- `logout()` 改为：
  - mock 模式清本地存储
  - supabase 模式调用 `supabase.auth.signOut()`

## Edge Function 收口

### 切换步骤

1. 前端真实登录已稳定
2. 前端调用函数时自动携带 authenticated JWT
3. 将以下函数恢复为 `verify_jwt=true`
   - `schedule-publish`
   - `shift-change-approve`
   - `excel-import`
   - `excel-export`
4. 函数内部优先从 JWT 解析操作者，再逐步去掉 `operator_user_account_id` 的前端显式透传

### 函数内建议

- 增加统一的 session user -> `user_account` 查找
- 把操作者审计字段统一写为数据库映射后的 `user_account.id`

## 测试清单

### 前端

- `mock` 模式登录、退出、路由守卫保持通过
- `supabase` 模式登录成功
- `supabase` 模式 token 失效后自动回登录页

### 数据库

- `auth_user_id` 唯一性
- 已登录用户只能读取自身资料
- 权限 RPC 与 session user 一致

### E2E

- 真实登录
- 登录后进入仪表盘
- 发布排班成功
- 调班审批成功
- Excel 导入导出成功

## 回退策略

- 任何阶段出现认证或 RLS 阻塞：
  - 前端环境变量切回 `VITE_AUTH_MODE=mock`
  - 用户侧函数继续保持 `verify_jwt=false`
  - 页面联调链路不受影响

## 建议执行顺序

1. 增加 `auth_user_id` migration
2. 补 authenticated RLS 与权限读取链路
3. 前端 `AuthProvider` 支持 `supabase` 模式
4. 登录页增加真实登录表单
5. 切换函数为 `verify_jwt=true`
6. 增加真实登录 E2E
