# 企业排班系统管理后台

基于 **React + Refine + Ant Design + Supabase** 构建的企业排班系统管理后台。  
本仓库交付形态为 **Web 单页应用（SPA）**，前端静态资源构建后部署到 **OSS**，后端能力依赖 **Supabase BaaS** 提供。

## 1. 项目简介

本项目面向短期、项目制灵活用工场景，适用于会展、剧组、调研、动捕、非侵入式合作等业务类型，核心目标是建设一个支持：

- 项目 / 任务驱动排班
- 多渠道员工管理
- 技能级别与效率系数管理
- 月度矩阵排班
- Excel 月排班导入导出
- 班表发布与调班审批
- 工时统计与基础分析

的轻量级后台管理系统。

> 本仓库主要包含：
>
> - **管理后台 Web SPA**
> - **Supabase 数据库 / Auth / Storage / Edge Functions 配置与代码**
>
> 不包含微信小程序端代码，但后端数据模型与权限体系为三端共享设计。

---

## 2. 项目范围

### 本期包含
- 字典管理
- 场景管理
- 设备管理
- 项目 / 任务管理
- 任务绑定设备
- 部门 / 渠道 / 员工管理
- 技能管理
- 员工技能级别与效率系数维护
- 用工规则配置
- 排班版本管理
- 手工排班
- 模板排班
- Excel 月矩阵导入导出
- 调班申请与审批
- 工时统计与基础报表
- 公告管理

### 本期不包含
- 智能排班
- 自动推荐排班方案
- 请假审批模块
- 复杂考勤结算
- 薪资结算

---

## 3. 技术选型

## 3.1 前端技术栈

| 分类 | 技术 | 说明 |
|---|---|---|
| 前端框架 | React + TypeScript | 管理后台主技术栈 |
| 构建工具 | Vite | 快速开发与高性能构建 |
| CRUD 框架 | Refine Core | 资源化 CRUD、权限、表单、列表、路由整合 |
| 路由 | Refine Router | 基于 Refine 的资源路由组织 |
| UI 组件库 | Ant Design | 表格、表单、布局、弹窗、上传等后台能力 |
| 图表库 | Ant Design Charts | 统计报表、趋势图、柱状图、饼图等 |
| 数据请求 | Supabase JS SDK | 访问数据库、认证、存储、函数 |
| 状态与页面组织 | Refine + React Hooks | 页面级状态与资源管理 |

## 3.2 后端技术栈

| 分类 | 技术 | 说明 |
|---|---|---|
| BaaS 平台 | Supabase | 提供 PostgreSQL / Auth / Storage / Edge Functions |
| 数据库 | PostgreSQL | 核心业务数据存储 |
| 后端开发语言 | TypeScript | 用于 Supabase Edge Functions |
| 鉴权 | Supabase Auth | 登录、会话、身份认证 |
| 权限隔离 | RLS + 业务角色表 | 数据权限与角色权限共同控制 |
| 文件存储 | Supabase Storage | Excel 导入文件、导出文件、错误报告文件 |
| 服务函数 | Supabase Edge Functions | Excel 导入导出、批处理、审批发布等复杂逻辑 |

## 3.3 部署形态

| 层 | 方案 |
|---|---|
| 前端 | Vite 构建后的 `dist/` 静态资源 |
| 托管方式 | OSS 静态网站托管 |
| 访问加速 | 可选 CDN |
| 应用形态 | SPA 单页应用 |
| 后端 | Supabase 云服务 |

---

## 4. 架构说明

本项目采用 **前后端分离 + BaaS** 架构：

- 前端管理后台通过 **Supabase JS SDK** 直接访问受控数据
- 身份认证由 **Supabase Auth** 提供
- 数据表、视图、函数运行在 **Supabase PostgreSQL**
- Excel 导入导出、批量校验、班表发布等复杂逻辑通过 **Supabase Edge Functions（TypeScript）** 实现
- 前端构建产物部署到 **OSS**
- 通过 **RLS（Row Level Security）+ 业务角色权限** 实现管理员、部门负责人、员工的数据隔离

### 核心原则
- 常规 CRUD 优先走 Refine 资源化开发
- 复杂流程优先沉淀到 Supabase Edge Functions / SQL RPC
- 统计报表优先依赖数据库视图、聚合查询或 RPC，不在前端做重计算
- 敏感权限严格依赖后端策略，不仅靠前端按钮隐藏

---

## 5. 仓库结构建议

```text
.
├─ docs/
│  ├─ PRDa.md
│  └─ schema.md
├─ public/
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ constants/
│  ├─ hooks/
│  ├─ pages/
│  │  ├─ dashboard/
│  │  ├─ dict/
│  │  ├─ scene/
│  │  ├─ device/
│  │  ├─ project/
│  │  ├─ task/
│  │  ├─ department/
│  │  ├─ channel/
│  │  ├─ employee/
│  │  ├─ skill/
│  │  ├─ labor-rule/
│  │  ├─ schedule-version/
│  │  ├─ schedule/
│  │  ├─ shift-template/
│  │  ├─ schedule-import/
│  │  ├─ shift-change-request/
│  │  ├─ report/
│  │  └─ announcement/
│  ├─ providers/
│  │  ├─ auth-provider/
│  │  ├─ data-provider/
│  │  ├─ access-control-provider/
│  │  └─ notification-provider/
│  ├─ routes/
│  ├─ services/
│  ├─ types/
│  ├─ utils/
│  ├─ main.tsx
│  └─ App.tsx
├─ supabase/
│  ├─ migrations/
│  ├─ seed.sql
│  ├─ functions/
│  │  ├─ excel-import/
│  │  ├─ excel-export/
│  │  ├─ schedule-publish/
│  │  ├─ shift-change-approve/
│  │  └─ recalculate-work-metrics/
│  └─ config.toml
├─ .env.example
├─ vite.config.ts
├─ package.json
└─ README.md
```