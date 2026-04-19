# WFM 生产环境 API 接口文档

## 1. 文档说明

### 1.1 适用范围

本文档覆盖以下接口面：

- Supabase Auth 认证接口
- Supabase PostgREST 资源 CRUD 接口
- PostgreSQL SQL RPC 接口
- Supabase Edge Functions 流程接口

### 1.2 重要说明

- 当前仓库未包含真实后端实现代码、真实 Edge Function 代码和真实 SQL RPC 定义
- 字段名、数据类型、表关系、约束均按 `schema.md` 对齐
- 如果后续真实实现与本文档存在差异，应以运行中的 Supabase 项目实际行为为准

## 2. 基础信息

### 2.1 环境地址

| 环境        | Base URL                                         |
| --------- | ------------------------------------------------ |
| Auth      | `https://<project-ref>.supabase.co/auth/v1`      |
| PostgREST | `https://<project-ref>.supabase.co/rest/v1`      |
| Functions | `https://<project-ref>.supabase.co/functions/v1` |
| Storage   | `https://<project-ref>.supabase.co/storage/v1`   |

### 2.2 版本信息

- 当前版本：`v1`
- 发布日期：`2026-04-16`
- 版本策略：
  - Auth 固定走 Supabase `/auth/v1`
  - 数据资源固定走 `/rest/v1`
  - SQL RPC 固定走 `/rest/v1/rpc`
  - Edge Functions 固定走 `/functions/v1`

### 2.3 请求头

#### Auth 接口

| Header         | 必填 | 示例                      | 说明                   |
| -------------- | -- | ----------------------- | -------------------- |
| `apikey`       | 是  | `{{supabase_anon_key}}` | Supabase 项目 anon key |
| `Content-Type` | 是  | `application/json`      | 登录等 JSON 请求          |

#### PostgREST / RPC / Functions

| Header           | 必填 | 示例                        | 说明                    |
| ---------------- | -- | ------------------------- | --------------------- |
| `apikey`         | 是  | `{{supabase_anon_key}}`   | Supabase 项目 key       |
| `Authorization`  | 是  | `Bearer {{access_token}}` | 登录后 access token      |
| `Content-Type`   | 否  | `application/json`        | JSON 请求时必填            |
| `Prefer`         | 否  | `return=representation`   | PostgREST 返回写入结果      |
| `Accept-Profile` | 否  | `public`                  | 指定 schema，默认 `public` |

### 2.4 鉴权规则

| 接口面       | 鉴权方式                       | 说明                   |
| --------- | -------------------------- | -------------------- |
| Auth      | Supabase Auth              | 登录后获取 `access_token` |
| PostgREST | JWT + RLS                  | 所有资源均受 RLS 控制        |
| RPC       | JWT + RLS/SECURITY DEFINER | 按函数实现方式控制            |
| Functions | JWT + Server 校验            | 敏感流程必须二次校验业务权限       |

### 2.5 限流规则

> 当前仓库没有真实网关配置，以下为生产推荐基线，运维落地时应在网关或 WAF 配置。

| 接口分类             | 限流建议             |
| ---------------- | ---------------- |
| Auth 登录          | `5 次/分钟/IP`      |
| 普通 PostgREST 读接口 | `600 次/分钟/token` |
| 普通 PostgREST 写接口 | `120 次/分钟/token` |
| RPC 聚合接口         | `60 次/分钟/token`  |
| 发布/审批类 Functions | `20 次/分钟/token`  |
| Excel 导入导出       | `10 次/小时/token`  |

## 3. 通用规则

### 3.1 命名规则

- 表名：`snake_case` 单数
- 主键：`id`
- 外键：`<table_name>_id`
- 字典项引用：`*_dict_item_id`
- 布尔：`is_*`
- 备注：`remark`
- 描述：`description`

### 3.2 分页规则

PostgREST 列表接口统一使用：

| 参数       | 必填 | 类型      | 示例                | 说明                 |
| -------- | -- | ------- | ----------------- | ------------------ |
| `limit`  | 否  | integer | `20`              | 默认 `20`，建议最大 `100` |
| `offset` | 否  | integer | `0`               | 偏移量                |
| `order`  | 否  | string  | `created_at.desc` | 排序                 |
| `select` | 否  | string  | `*`               | 字段选择               |

### 3.3 过滤规则

| 类型 | 示例                             |
| -- | ------------------------------ |
| 等值 | `project_id=eq.{{project_id}}` |
| 模糊 | `project_name=ilike.*动捕*`      |
| 布尔 | `is_enabled=eq.true`           |
| IN | `id=in.(uuid1,uuid2)`          |
| 非空 | `published_at=not.is.null`     |

### 3.4 返回格式

#### Auth 接口

使用 Supabase 原生返回结构。

成功示例：

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1776339999,
  "refresh_token": "refresh_xxx",
  "user": {
    "id": "auth-user-id",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "admin@example.com"
  }
}
```

失败示例：

```json
{
  "code": 400,
  "error_code": "invalid_credentials",
  "msg": "Invalid login credentials"
}
```

#### PostgREST 资源接口

成功示例：

```json
[
  {
    "id": "7a111111-1111-1111-1111-111111111111",
    "project_code": "PRJ001",
    "project_name": "动捕采集项目A",
    "scene_id": "4a111111-1111-1111-1111-111111111111",
    "project_mode": "self_built",
    "start_date": "2026-04-01",
    "end_date": "2026-04-30",
    "owner_employee_id": "8a111111-1111-1111-1111-111111111111",
    "project_status_dict_item_id": "9a111111-1111-1111-1111-111111111111",
    "remark": "月度项目",
    "created_at": "2026-04-16T10:00:00+08:00",
    "updated_at": "2026-04-16T10:00:00+08:00"
  }
]
```

失败示例：

```json
{
  "code": "42501",
  "details": null,
  "hint": null,
  "message": "new row violates row-level security policy for table \"project\""
}
```

#### RPC / Functions

成功示例：

```json
{
  "success": true,
  "error_code": null,
  "message": "ok",
  "data": {}
}
```

失败示例：

```json
{
  "success": false,
  "error_code": "SCHEDULE_CONFLICT",
  "message": "同一设备同一日期同一班次存在冲突",
  "data": null
}
```

### 3.5 业务错误码

| 错误码                            | HTTP | 说明            |
| ------------------------------ | ---- | ------------- |
| `AUTH_UNAUTHORIZED`            | 401  | 未登录或 token 失效 |
| `AUTH_FORBIDDEN`               | 403  | 无业务权限         |
| `RLS_DENIED`                   | 403  | 被 RLS 策略拒绝    |
| `VALIDATION_FAILED`            | 400  | 参数校验失败        |
| `DICT_TYPE_MISMATCH`           | 400  | 字典项与目标字段类型不一致 |
| `RESOURCE_NOT_FOUND`           | 404  | 资源不存在         |
| `UNIQUE_CONFLICT`              | 409  | 唯一约束冲突        |
| `TASK_DEVICE_SCENE_CONFLICT`   | 409  | 设备不属于任务所在项目场景 |
| `SCHEDULE_CONFLICT`            | 409  | 排班冲突          |
| `SCHEDULE_PUBLISHED_LOCKED`    | 409  | 已发布版本不可直接修改   |
| `DEVICE_SKILL_MISMATCH`        | 422  | 员工不具备设备技能     |
| `DEVICE_TASK_RELATION_MISSING` | 422  | 设备未绑定到任务      |
| `APPROVAL_STATE_INVALID`       | 422  | 当前状态不可审批      |
| `IMPORT_TEMPLATE_INVALID`      | 422  | Excel 模板结构不合法 |
| `IMPORT_EMPLOYEE_NOT_UNIQUE`   | 422  | Excel 员工匹配失败  |
| `INTERNAL_ERROR`               | 500  | 系统异常          |

## 4. 资源接口目录

### 4.1 资源总表

| 资源                      | Path                             | 方法                | 鉴权                                       | 组件        |
| ----------------------- | -------------------------------- | ----------------- | ---------------------------------------- | --------- |
| `dict_type`             | `/rest/v1/dict_type`             | `GET/POST/PATCH`  | `admin`                                  | PostgREST |
| `dict_item`             | `/rest/v1/dict_item`             | `GET/POST/PATCH`  | `admin`                                  | PostgREST |
| `scene`                 | `/rest/v1/scene`                 | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `device`                | `/rest/v1/device`                | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `project`               | `/rest/v1/project`               | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `task`                  | `/rest/v1/task`                  | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `task_device`           | `/rest/v1/task_device`           | `GET/POST/DELETE` | `admin`                                  | PostgREST |
| `department`            | `/rest/v1/department`            | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `channel`               | `/rest/v1/channel`               | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `employee`              | `/rest/v1/employee`              | `GET/POST/PATCH`  | `admin/department_manager/employee:self` | PostgREST |
| `skill`                 | `/rest/v1/skill`                 | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `employee_skill`        | `/rest/v1/employee_skill`        | `GET/POST/PATCH`  | `admin/department_manager/employee:self` | PostgREST |
| `labor_rule`            | `/rest/v1/labor_rule`            | `GET/POST/PATCH`  | `admin`                                  | PostgREST |
| `shift_template`        | `/rest/v1/shift_template`        | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `schedule_version`      | `/rest/v1/schedule_version`      | `GET/POST/PATCH`  | `admin/department_manager`               | PostgREST |
| `schedule_import_batch` | `/rest/v1/schedule_import_batch` | `GET`             | `admin/department_manager`               | PostgREST |
| `schedule`              | `/rest/v1/schedule`              | `GET/POST/PATCH`  | `admin/department_manager/employee:self` | PostgREST |
| `shift_change_request`  | `/rest/v1/shift_change_request`  | `GET/POST/PATCH`  | `admin/department_manager/employee:self` | PostgREST |
| `announcement`          | `/rest/v1/announcement`          | `GET/POST/PATCH`  | `admin/department_manager/employee:self` | PostgREST |
| `employee_work_metric`  | `/rest/v1/employee_work_metric`  | `GET`             | `admin/department_manager/employee:self` | PostgREST |
| `user_account`          | `/rest/v1/user_account`          | `GET/POST/PATCH`  | `admin`                                  | PostgREST |
| `role`                  | `/rest/v1/role`                  | `GET/POST/PATCH`  | `admin`                                  | PostgREST |
| `permission`            | `/rest/v1/permission`            | `GET/POST/PATCH`  | `admin`                                  | PostgREST |
| `user_role`             | `/rest/v1/user_role`             | `GET/POST/DELETE` | `admin`                                  | PostgREST |
| `role_permission`       | `/rest/v1/role_permission`       | `GET/POST/DELETE` | `admin`                                  | PostgREST |

### 4.2 资源接口通用模板

#### 列表查询

- Path：`/rest/v1/<resource>`
- Method：`GET`

请求参数：

| 参数       | 必填 | 类型      | 示例                     | 说明    |
| -------- | -- | ------- | ---------------------- | ----- |
| `select` | 否  | string  | `*`                    | 字段选择  |
| `limit`  | 否  | integer | `20`                   | 分页大小  |
| `offset` | 否  | integer | `0`                    | 偏移量   |
| `order`  | 否  | string  | `created_at.desc`      | 排序    |
| 业务过滤     | 否  | string  | `project_id=eq.<uuid>` | 按字段过滤 |

#### 新增

- Path：`/rest/v1/<resource>`
- Method：`POST`
- Header：`Prefer: return=representation`

#### 更新

- Path：`/rest/v1/<resource>?id=eq.<id>`
- Method：`PATCH`
- Header：`Prefer: return=representation`

#### 删除

- 仅关系表建议支持物理删除
- 主数据建议停用，不建议物理删除

## 5. 关键资源字段清单

### 5.1 `project`

| 字段                            | 必填 | 类型     | 示例                                     |
| ----------------------------- | -- | ------ | -------------------------------------- |
| `project_code`                | 否  | string | `PRJ001`                               |
| `project_name`                | 是  | string | `动捕采集项目A`                              |
| `scene_id`                    | 是  | uuid   | `4a111111-1111-1111-1111-111111111111` |
| `project_mode`                | 是  | string | `self_built`                           |
| `start_date`                  | 是  | date   | `2026-04-01`                           |
| `end_date`                    | 是  | date   | `2026-04-30`                           |
| `owner_employee_id`           | 否  | uuid   | `8a111111-1111-1111-1111-111111111111` |
| `project_status_dict_item_id` | 是  | uuid   | `9a111111-1111-1111-1111-111111111111` |
| `remark`                      | 否  | text   | `月度项目`                                 |

新增示例：

```json
{
  "project_code": "PRJ001",
  "project_name": "动捕采集项目A",
  "scene_id": "4a111111-1111-1111-1111-111111111111",
  "project_mode": "self_built",
  "start_date": "2026-04-01",
  "end_date": "2026-04-30",
  "owner_employee_id": "8a111111-1111-1111-1111-111111111111",
  "project_status_dict_item_id": "9a111111-1111-1111-1111-111111111111",
  "remark": "月度项目"
}
```

### 5.2 `task`

| 字段                         | 必填 | 类型           | 示例                                     |
| -------------------------- | -- | ------------ | -------------------------------------- |
| `project_id`               | 是  | uuid         | `7a111111-1111-1111-1111-111111111111` |
| `task_code`                | 否  | string       | `TASK001`                              |
| `task_name`                | 是  | string       | `面部表情采集`                               |
| `target_total_hours`       | 是  | numeric(8,2) | `120.00`                               |
| `hours_per_shift`          | 是  | numeric(5,2) | `4.00`                                 |
| `target_efficiency_rate`   | 否  | numeric(4,2) | `0.80`                                 |
| `planned_start_date`       | 是  | date         | `2026-04-05`                           |
| `planned_end_date`         | 是  | date         | `2026-04-25`                           |
| `task_status_dict_item_id` | 是  | uuid         | `aa111111-1111-1111-1111-111111111111` |
| `remark`                   | 否  | text         | `核心任务`                                 |

### 5.3 `device`

| 字段                           | 必填 | 类型     | 示例                                     |
| ---------------------------- | -- | ------ | -------------------------------------- |
| `scene_id`                   | 是  | uuid   | `4a111111-1111-1111-1111-111111111111` |
| `device_code`                | 是  | string | `DEV001`                               |
| `device_name`                | 是  | string | `动捕相机01`                               |
| `skill_id`                   | 是  | uuid   | `bb111111-1111-1111-1111-111111111111` |
| `device_status_dict_item_id` | 是  | uuid   | `cc111111-1111-1111-1111-111111111111` |
| `remark`                     | 否  | text   | `主设备`                                  |

### 5.4 `employee`

| 字段                             | 必填 | 类型     | 示例                                     |
| ------------------------------ | -- | ------ | -------------------------------------- |
| `employee_no`                  | 是  | string | `E0001`                                |
| `full_name`                    | 是  | string | `张三`                                   |
| `mobile_number`                | 是  | string | `13800000001`                          |
| `channel_id`                   | 是  | uuid   | `dd111111-1111-1111-1111-111111111111` |
| `department_id`                | 是  | uuid   | `ee111111-1111-1111-1111-111111111111` |
| `onboard_date`                 | 是  | date   | `2026-04-01`                           |
| `employee_status_dict_item_id` | 是  | uuid   | `ff111111-1111-1111-1111-111111111111` |
| `remark`                       | 否  | text   | `新入职`                                  |

### 5.5 `employee_skill`

| 字段                       | 必填 | 类型           | 示例                                     |
| ------------------------ | -- | ------------ | -------------------------------------- |
| `employee_id`            | 是  | uuid         | `11111111-1111-1111-1111-111111111111` |
| `skill_id`               | 是  | uuid         | `bb111111-1111-1111-1111-111111111111` |
| `skill_level`            | 是  | smallint     | `2`                                    |
| `efficiency_coefficient` | 是  | numeric(5,2) | `1.10`                                 |
| `is_primary`             | 是  | boolean      | `true`                                 |
| `certified_at`           | 否  | date         | `2026-04-10`                           |
| `is_enabled`             | 是  | boolean      | `true`                                 |
| `remark`                 | 否  | text         | `主技能`                                  |

### 5.6 `schedule_version`

| 字段                             | 必填 | 类型          | 示例                                     |
| ------------------------------ | -- | ----------- | -------------------------------------- |
| `project_id`                   | 是  | uuid        | `7a111111-1111-1111-1111-111111111111` |
| `schedule_month`               | 是  | date        | `2026-04-01`                           |
| `version_no`                   | 是  | integer     | `4`                                    |
| `publish_status_dict_item_id`  | 是  | uuid        | `ab111111-1111-1111-1111-111111111111` |
| `generation_type`              | 是  | string      | `manual`                               |
| `created_by_user_account_id`   | 是  | uuid        | `ac111111-1111-1111-1111-111111111111` |
| `published_at`                 | 否  | timestamptz | `2026-04-16T10:00:00+08:00`            |
| `published_by_user_account_id` | 否  | uuid        | `ac111111-1111-1111-1111-111111111111` |
| `remark`                       | 否  | text        | `4月草稿`                                 |

### 5.7 `schedule`

| 字段                                | 必填 | 类型           | 示例                                     |
| --------------------------------- | -- | ------------ | -------------------------------------- |
| `schedule_version_id`             | 是  | uuid         | `ad111111-1111-1111-1111-111111111111` |
| `employee_id`                     | 是  | uuid         | `11111111-1111-1111-1111-111111111111` |
| `department_id`                   | 是  | uuid         | `ee111111-1111-1111-1111-111111111111` |
| `project_id`                      | 是  | uuid         | `7a111111-1111-1111-1111-111111111111` |
| `task_id`                         | 否  | uuid         | `ae111111-1111-1111-1111-111111111111` |
| `device_id`                       | 否  | uuid         | `af111111-1111-1111-1111-111111111111` |
| `schedule_date`                   | 是  | date         | `2026-04-16`                           |
| `shift_type_dict_item_id`         | 是  | uuid         | `b0111111-1111-1111-1111-111111111111` |
| `schedule_code_dict_item_id`      | 是  | uuid         | `b1111111-1111-1111-1111-111111111111` |
| `planned_hours`                   | 是  | numeric(5,2) | `8.00`                                 |
| `skill_id_snapshot`               | 否  | uuid         | `bb111111-1111-1111-1111-111111111111` |
| `skill_level_snapshot`            | 否  | smallint     | `2`                                    |
| `efficiency_coefficient_snapshot` | 否  | numeric(5,2) | `1.10`                                 |
| `source_type`                     | 是  | string       | `manual`                               |
| `schedule_import_batch_id`        | 否  | uuid         | `b2111111-1111-1111-1111-111111111111` |
| `remark`                          | 否  | string       | `手工调整`                                 |

### 5.8 `shift_change_request`

| 字段                                  | 必填 | 类型          | 示例                                     |
| ----------------------------------- | -- | ----------- | -------------------------------------- |
| `request_type`                      | 是  | string      | `direct_change`                        |
| `applicant_employee_id`             | 是  | uuid        | `11111111-1111-1111-1111-111111111111` |
| `target_employee_id`                | 否  | uuid        | `22222222-2222-2222-2222-222222222222` |
| `original_schedule_id`              | 是  | uuid        | `b3111111-1111-1111-1111-111111111111` |
| `target_schedule_id`                | 否  | uuid        | `b4111111-1111-1111-1111-111111111111` |
| `target_date`                       | 否  | date        | `2026-04-17`                           |
| `target_shift_type_dict_item_id`    | 否  | uuid        | `b0111111-1111-1111-1111-111111111111` |
| `target_schedule_code_dict_item_id` | 否  | uuid        | `b1111111-1111-1111-1111-111111111111` |
| `target_task_id`                    | 否  | uuid        | `ae111111-1111-1111-1111-111111111111` |
| `target_device_id`                  | 否  | uuid        | `af111111-1111-1111-1111-111111111111` |
| `reason`                            | 是  | string      | `个人事务调整`                               |
| `approval_status_dict_item_id`      | 是  | uuid        | `b5111111-1111-1111-1111-111111111111` |
| `approver_user_account_id`          | 否  | uuid        | `ac111111-1111-1111-1111-111111111111` |
| `approved_at`                       | 否  | timestamptz | `2026-04-16T15:00:00+08:00`            |
| `approval_comment`                  | 否  | string      | `同意`                                   |

### 5.9 `announcement`

| 字段                               | 必填 | 类型          | 示例                                     |
| -------------------------------- | -- | ----------- | -------------------------------------- |
| `title`                          | 是  | string      | `4月排班已发布`                              |
| `announcement_type_dict_item_id` | 是  | uuid        | `b6111111-1111-1111-1111-111111111111` |
| `content`                        | 是  | text        | `请各部门及时查看。`                            |
| `visibility_scope_type`          | 是  | string      | `all`                                  |
| `visibility_scope_config`        | 否  | jsonb       | `{"role_codes":["admin"]}`             |
| `published_by_user_account_id`   | 是  | uuid        | `ac111111-1111-1111-1111-111111111111` |
| `published_at`                   | 是  | timestamptz | `2026-04-16T12:00:00+08:00`            |

## 6. RPC 接口

### 6.1 当前用户权限

- Path：`/rest/v1/rpc/get_current_user_permissions`
- Method：`POST`
- 鉴权：`shared`
- 限流：`60 次/分钟/token`

请求体：无

成功示例：

```json
{
  "success": true,
  "error_code": null,
  "message": "ok",
  "data": {
    "user_account_id": "ac111111-1111-1111-1111-111111111111",
    "roles": ["admin"],
    "permissions": [
      "project.read",
      "project.write",
      "schedule.publish"
    ]
  }
}
```

### 6.2 项目可选设备

- Path：`/rest/v1/rpc/get_project_available_devices`
- Method：`POST`

请求参数：

| 字段           | 必填 | 类型   | 示例                                     |
| ------------ | -- | ---- | -------------------------------------- |
| `project_id` | 是  | uuid | `7a111111-1111-1111-1111-111111111111` |

### 6.3 覆盖保存任务设备关系

- Path：`/rest/v1/rpc/replace_task_devices`
- Method：`POST`

请求体：

```json
{
  "task_id": "ae111111-1111-1111-1111-111111111111",
  "device_ids": [
    "af111111-1111-1111-1111-111111111111",
    "af222222-2222-2222-2222-222222222222"
  ],
  "operator_user_account_id": "ac111111-1111-1111-1111-111111111111"
}
```

失败示例：

```json
{
  "success": false,
  "error_code": "TASK_DEVICE_SCENE_CONFLICT",
  "message": "设备不属于当前项目场景",
  "data": null
}
```

### 6.4 获取排班矩阵

- Path：`/rest/v1/rpc/get_schedule_matrix`
- Method：`POST`

请求参数：

| 字段                    | 必填 | 类型      | 示例                                     |
| --------------------- | -- | ------- | -------------------------------------- |
| `project_id`          | 是  | uuid    | `7a111111-1111-1111-1111-111111111111` |
| `schedule_month`      | 是  | date    | `2026-04-01`                           |
| `schedule_version_id` | 是  | uuid    | `ad111111-1111-1111-1111-111111111111` |
| `view_mode`           | 是  | string  | `month`                                |
| `week_index`          | 否  | integer | `2`                                    |
| `department_id`       | 否  | uuid    | `ee111111-1111-1111-1111-111111111111` |

成功示例：

```json
{
  "success": true,
  "error_code": null,
  "message": "ok",
  "data": {
    "project_id": "7a111111-1111-1111-1111-111111111111",
    "schedule_month": "2026-04-01",
    "schedule_version_id": "ad111111-1111-1111-1111-111111111111",
    "view_mode": "month",
    "employees": [
      {
        "employee_id": "11111111-1111-1111-1111-111111111111",
        "employee_no": "E0001",
        "full_name": "张三",
        "department_name": "采集部",
        "cells": [
          {
            "schedule_date": "2026-04-16",
            "schedule_code_item_code": "WORK_A",
            "planned_hours": 8.0,
            "computed_conflict": false
          }
        ]
      }
    ]
  }
}
```

### 6.5 批量编辑排班单元格

- Path：`/rest/v1/rpc/bulk_upsert_schedule_cells`
- Method：`POST`

请求体：

```json
{
  "schedule_version_id": "ad111111-1111-1111-1111-111111111111",
  "changes": [
    {
      "employee_id": "11111111-1111-1111-1111-111111111111",
      "department_id": "ee111111-1111-1111-1111-111111111111",
      "project_id": "7a111111-1111-1111-1111-111111111111",
      "task_id": "ae111111-1111-1111-1111-111111111111",
      "device_id": "af111111-1111-1111-1111-111111111111",
      "schedule_date": "2026-04-16",
      "shift_type_dict_item_id": "b0111111-1111-1111-1111-111111111111",
      "schedule_code_dict_item_id": "b1111111-1111-1111-1111-111111111111",
      "planned_hours": 8.0,
      "source_type": "manual",
      "remark": "手工修改"
    }
  ]
}
```

### 6.6 冲突校验

- Path：`/rest/v1/rpc/check_schedule_conflicts`
- Method：`POST`

请求体与 `bulk_upsert_schedule_cells` 一致。

### 6.7 报表类 RPC

| Path                                       | Method | 说明     |
| ------------------------------------------ | ------ | ------ |
| `/rest/v1/rpc/get_dashboard_overview`      | `POST` | 仪表盘统计  |
| `/rest/v1/rpc/get_work_hours_summary`      | `POST` | 工时汇总   |
| `/rest/v1/rpc/get_employee_profile_report` | `POST` | 员工画像报表 |
| `/rest/v1/rpc/get_task_completion_report`  | `POST` | 任务完成报表 |
| `/rest/v1/rpc/get_device_usage_report`     | `POST` | 设备使用报表 |

## 7. Functions 接口

### 7.1 发布班表

- Path：`/functions/v1/schedule-publish`
- Method：`POST`
- 鉴权：`admin / department_manager`
- 限流：`20 次/分钟/token`

请求参数：

| 字段                         | 必填 | 类型      | 示例                                     |
| -------------------------- | -- | ------- | -------------------------------------- |
| `schedule_version_id`      | 是  | uuid    | `ad111111-1111-1111-1111-111111111111` |
| `operator_user_account_id` | 是  | uuid    | `ac111111-1111-1111-1111-111111111111` |
| `create_announcement`      | 否  | boolean | `true`                                 |
| `announcement_title`       | 否  | string  | `4月排班已发布`                              |

成功示例：

```json
{
  "success": true,
  "error_code": null,
  "message": "schedule published",
  "data": {
    "schedule_version_id": "ad111111-1111-1111-1111-111111111111",
    "published_at": "2026-04-16T16:00:00+08:00"
  }
}
```

### 7.2 调班审批

- Path：`/functions/v1/shift-change-approve`
- Method：`POST`

请求参数：

| 字段                         | 必填 | 类型     | 示例                                     |
| -------------------------- | -- | ------ | -------------------------------------- |
| `shift_change_request_id`  | 是  | uuid   | `b7111111-1111-1111-1111-111111111111` |
| `action`                   | 是  | string | `approve`                              |
| `approval_comment`         | 否  | string | `同意`                                   |
| `operator_user_account_id` | 是  | uuid   | `ac111111-1111-1111-1111-111111111111` |

失败示例：

```json
{
  "success": false,
  "error_code": "APPROVAL_STATE_INVALID",
  "message": "当前调班申请已处理，不能重复审批",
  "data": null
}
```

### 7.3 重算工时画像

- Path：`/functions/v1/recalculate-work-metrics`
- Method：`POST`

请求体：

```json
{
  "employee_ids": [
    "11111111-1111-1111-1111-111111111111"
  ],
  "operator_user_account_id": "ac111111-1111-1111-1111-111111111111"
}
```

### 7.4 Excel 导入

- Path：`/functions/v1/excel-import`
- Method：`POST`
- Content-Type：`multipart/form-data`

表单字段：

| 字段                         | 必填 | 类型     | 示例                                     |
| -------------------------- | -- | ------ | -------------------------------------- |
| `file`                     | 是  | file   | `schedule-2026-04.xlsx`                |
| `project_id`               | 是  | uuid   | `7a111111-1111-1111-1111-111111111111` |
| `schedule_month`           | 是  | date   | `2026-04-01`                           |
| `import_mode`              | 是  | string | `cover_draft`                          |
| `operator_user_account_id` | 是  | uuid   | `ac111111-1111-1111-1111-111111111111` |

### 7.5 Excel 导出

- Path：`/functions/v1/excel-export`
- Method：`POST`

请求体：

```json
{
  "project_id": "7a111111-1111-1111-1111-111111111111",
  "schedule_month": "2026-04-01",
  "schedule_version_id": "ad111111-1111-1111-1111-111111111111",
  "operator_user_account_id": "ac111111-1111-1111-1111-111111111111"
}
```

## 8. 版本变更记录

| 版本       | 日期           | 变更内容                                           |
| -------- | ------------ | ---------------------------------------------- |
| `v1.0.0` | `2026-04-16` | 首次生成生产环境接口文档，按 `readme.md` 与 `schema.md` 对齐    |
| `v1.1.0` | `2026-04-16` | 拆分接口面为 Auth/PostgREST/RPC/Functions，补齐关系接口     |
| `v1.2.0` | `2026-04-16` | 增补限流、鉴权、成功失败示例、Mock 数据方案、Postman 与 OpenAPI 交付物 |

## 9. Mock 数据方案

### 9.1 目标

用于：

- 前端脱离后端独立开发
- 测试编写接口用例
- 运维演练导入导出与发布审批流程

### 9.2 Mock 原则

- UUID 使用固定前缀，保证跨接口可追溯
- 所有字段必须与 schema 字段名、类型一致
- 日期统一使用 `2026-04` 月份数据
- 字典数据先行，主数据与关系数据后置

### 9.3 推荐种子顺序

1. `dict_type`
2. `dict_item`
3. `scene`
4. `department`
5. `channel`
6. `skill`
7. `employee`
8. `employee_skill`
9. `user_account`
10. `role`
11. `permission`
12. `user_role`
13. `role_permission`
14. `project`
15. `task`
16. `device`
17. `task_device`
18. `shift_template`
19. `schedule_version`
20. `schedule`
21. `shift_change_request`
22. `employee_work_metric`
23. `announcement`
24. `schedule_import_batch`

### 9.4 Mock 技术方案

| 场景           | 推荐方案                                 |
| ------------ | ------------------------------------ |
| 前端本地联调       | `MSW` 或 `json-server`                |
| API 契约验证     | `Prism` + OpenAPI                    |
| Postman Mock | 基于 Postman Collection 创建 Mock Server |
| 测试环境伪数据      | 直接导入 Supabase Seed SQL               |

### 9.5 最小可用 Mock 数据集

- 1 个管理员账号
- 2 个部门
- 2 个渠道
- 4 个员工
- 3 个技能
- 1 个场景
- 1 个项目
- 2 个任务
- 3 台设备
- 1 个草稿排班版本
- 20 条排班记录
- 2 条调班申请
- 2 条公告

  <br />

