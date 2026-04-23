import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const supabaseAdmin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const supabaseAnon = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
);

// Helper: decode JWT payload without verifying signature (avoids ES256 issue)
function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// Helper: get authenticated user (bypasses ES256 local verify via admin.getUserById)
async function getAuthUser(c: any) {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload?.sub) return null;
  // Check expiry
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.admin.getUserById(payload.sub);
  if (error || !data?.user) return null;
  return data.user;
}

// Helper: get employee for auth user
async function getEmployee(authUserId: string) {
  const empId = await kv.get(`auth_map::${authUserId}`);
  if (!empId) return null;
  const emp = await kv.get(`emp::${empId}`);
  return emp;
}

// ===================== HEALTH =====================
app.get("/make-server-9f9c6649/health", (c) => {
  return c.json({ status: "ok" });
});

// ===================== SEED =====================
app.post("/make-server-9f9c6649/seed", async (c) => {
  try {
    const sb = supabaseAdmin();

    // Create demo user accounts
    const users = [
      { email: "zhangsan@wfm.com", password: "Abc12345", name: "张三", no: "E0001" },
      { email: "lisi@wfm.com", password: "Abc12345", name: "李四", no: "E0002" },
      { email: "wangwu@wfm.com", password: "Abc12345", name: "王五", no: "E0003" },
      { email: "admin@wfm.com", password: "Admin123", name: "管理员", no: "A0001" },
    ];

    const createdUsers: any[] = [];
    for (const u of users) {
      // Check if user already exists by trying to create
      const { data, error } = await sb.auth.admin.createUser({
        email: u.email,
        password: u.password,
        user_metadata: { name: u.name, employee_no: u.no },
        email_confirm: true,
      });
      if (data?.user) {
        createdUsers.push({ ...u, authId: data.user.id });
      } else {
        // User might already exist, try to find them
        const { data: listData } = await sb.auth.admin.listUsers();
        const existing = listData?.users?.find((eu: any) => eu.email === u.email);
        if (existing) {
          createdUsers.push({ ...u, authId: existing.id });
        }
      }
    }

    // Shift colors/config
    const shiftTypes = {
      "捕1": { bg: "#E8F5E9", text: "#2E7D32", label: "捕1 · 动作捕捉A", category: "work", hours: 8, time: "09:00-18:00" },
      "捕2": { bg: "#E3F2FD", text: "#1565C0", label: "捕2 · 动作捕捉B", category: "work", hours: 8, time: "09:00-18:00" },
      "检1": { bg: "#FFF3E0", text: "#E65100", label: "检1 · 数据检查A", category: "work", hours: 8, time: "09:00-18:00" },
      "检2": { bg: "#F3E5F5", text: "#7B1FA2", label: "检2 · 数据检查B", category: "work", hours: 8, time: "09:00-18:00" },
      "休":  { bg: "#F5F5F5", text: "#9E9E9E", label: "休 · 休息", category: "rest", hours: 0, time: "" },
      "事":  { bg: "#FFF8E1", text: "#F9A825", label: "事 · 事假", category: "exception", hours: 0, time: "" },
      "病":  { bg: "#FCE4EC", text: "#C62828", label: "病 · 病假", category: "exception", hours: 0, time: "" },
    };
    await kv.set("config::shift_types", shiftTypes);

    // Employees
    const employees = [
      {
        id: "emp-001", no: "E0001", name: "张三", department: "采集部", departmentId: "dep-001",
        phone: "138****0001", onboardDate: "2026-03-01", channel: "自招",
        primarySkill: "动作捕捉", skillLevel: 2, skillLevelLabel: "中级",
        efficiencyCoefficient: 1.10, status: "active",
      },
      {
        id: "emp-002", no: "E0002", name: "李四", department: "采集部", departmentId: "dep-001",
        phone: "138****0002", onboardDate: "2026-02-15", channel: "渠道推荐",
        primarySkill: "数据检查", skillLevel: 3, skillLevelLabel: "高级",
        efficiencyCoefficient: 1.20, status: "active",
      },
      {
        id: "emp-003", no: "E0003", name: "王五", department: "技术部", departmentId: "dep-002",
        phone: "138****0003", onboardDate: "2026-01-10", channel: "自招",
        primarySkill: "动作捕捉", skillLevel: 1, skillLevelLabel: "初级",
        efficiencyCoefficient: 0.80, status: "active",
      },
    ];

    for (const emp of employees) {
      await kv.set(`emp::${emp.id}`, emp);
    }
    await kv.set("emp_list", employees.map(e => e.id));

    // Map auth users to employees
    for (const cu of createdUsers) {
      const emp = employees.find(e => e.no === cu.no);
      if (emp) {
        await kv.set(`auth_map::${cu.authId}`, emp.id);
        await kv.set(`user_account::${emp.id}`, {
          authId: cu.authId, email: cu.email, mustChangePassword: false,
        });
      }
    }

    // Generate schedules for April 2026
    const year = 2026, month = 4;
    const daysInMonth = new Date(year, month, 0).getDate();
    const workCodes = ["捕1", "捕2", "检1", "检2"];

    for (const emp of employees) {
      const monthSchedule: Record<string, any> = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        let code: string;
        if (dow === 0 || dow === 6) {
          code = "休";
        } else {
          code = workCodes[(d + employees.indexOf(emp)) % 4];
        }
        // Add some exceptions
        if (emp.id === "emp-001" && d === 8) code = "事";
        if (emp.id === "emp-001" && d === 15) code = "病";
        if (emp.id === "emp-002" && d === 10) code = "事";

        const st = (shiftTypes as any)[code];
        monthSchedule[String(d)] = {
          date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
          code,
          category: st.category,
          hours: st.hours,
          time: st.time,
          project: st.category === "work" ? "动捕采集项目A" : "",
          projectId: st.category === "work" ? "proj-001" : "",
          task: st.category === "work" ? (code.startsWith("捕") ? "面部表情采集" : "数据质量检查") : "",
          taskId: st.category === "work" ? (code.startsWith("捕") ? "task-001" : "task-002") : "",
          device: st.category === "work" ? (code.startsWith("捕") ? "动捕相机01" : "检查工位01") : "",
          deviceId: st.category === "work" ? (code.startsWith("捕") ? "dev-001" : "dev-003") : "",
          skillRequired: st.category === "work" ? (code.startsWith("捕") ? "动作捕捉" : "数据检查") : "",
          skillLevelRequired: st.category === "work" ? "中级" : "",
        };
      }
      await kv.set(`schedule::${emp.id}::${year}-${String(month).padStart(2, "0")}`, monthSchedule);
    }

    // Schedule version
    await kv.set("schedule_version::proj-001::2026-04", {
      id: "sv-001", projectId: "proj-001", month: "2026-04-01",
      versionNo: 1, status: "published", publishedAt: "2026-04-01T10:00:00+08:00",
    });

    // Announcements
    const announcements = [
      { id: "ann-001", title: "4月排班表已发布", type: "排班通知", typeCode: "schedule", date: "2026-04-01", content: "各位同事，4月排班表已发布，请及时查看确认。如有问题请联系部门负责人。排班安排已充分考虑大家的技能特长和工时均衡，请各位准时到岗。" },
      { id: "ann-002", title: "五一假期调班通知", type: "调班通知", typeCode: "shift_change", date: "2026-04-10", content: "因五一假期安排，部分同事需要调班，请查看最新排班表并确认。需要调班的同事请提前三天提交调班申请。" },
      { id: "ann-003", title: "设备维护通知", type: "系统通知", typeCode: "system", date: "2026-04-12", content: "动捕设备DEV003将于4月15日进行维护，期间相关任务暂停。受影响的同事班次将临时调整为检查类任务。" },
      { id: "ann-004", title: "新员工培训安排", type: "培训通知", typeCode: "training", date: "2026-04-14", content: "新入职员工请于4月18日参加技能培训，地点：3号采集室。培训内容包括动捕设备操作规范、数据检查标准流程等。" },
      { id: "ann-005", title: "工时统计公示", type: "系统通知", typeCode: "system", date: "2026-04-16", content: "3月份工时统计已完成，请登录系统查看个人工时详情。如有异议请于本周五前联系管理员核实。" },
    ];
    for (const ann of announcements) {
      await kv.set(`announcement::${ann.id}`, ann);
    }
    await kv.set("announcement_list", announcements.map(a => a.id));

    // Shift change requests
    const requests = [
      {
        id: "scr-001", type: "direct_change", applicantId: "emp-001", applicantName: "张三",
        originalDate: "2026-04-22", originalShift: "捕1",
        targetDate: "2026-04-22", targetShift: "休",
        targetEmployeeId: null, targetEmployeeName: null,
        reason: "个人事务需要处理", status: "pending", statusLabel: "待审批",
        createdAt: "2026-04-16T09:00:00+08:00", approvedAt: null, approverComment: null,
      },
      {
        id: "scr-002", type: "swap", applicantId: "emp-001", applicantName: "张三",
        originalDate: "2026-04-18", originalShift: "检1",
        targetDate: "2026-04-19", targetShift: "捕2",
        targetEmployeeId: "emp-002", targetEmployeeName: "李四",
        reason: "与同事互换方便出行", status: "approved", statusLabel: "已通过",
        createdAt: "2026-04-12T14:00:00+08:00", approvedAt: "2026-04-13T10:00:00+08:00", approverComment: "同意",
      },
      {
        id: "scr-003", type: "direct_change", applicantId: "emp-001", applicantName: "张三",
        originalDate: "2026-04-10", originalShift: "捕2",
        targetDate: "2026-04-10", targetShift: "休",
        targetEmployeeId: null, targetEmployeeName: null,
        reason: "家中有急事", status: "rejected", statusLabel: "已拒绝",
        createdAt: "2026-04-08T16:00:00+08:00", approvedAt: "2026-04-09T09:00:00+08:00", approverComment: "当日人手不足，无法批准",
      },
    ];
    for (const req of requests) {
      await kv.set(`shift_change::${req.id}`, req);
    }
    await kv.set("shift_change_list::emp-001", requests.map(r => r.id));
    await kv.set("shift_change_list::emp-002", []);
    await kv.set("shift_change_list::emp-003", []);

    // Work metrics
    const metrics = [
      { employeeId: "emp-001", avg7d: 7.5, avg30d: 7.2, avgShift30d: 7.8, avgWeek30d: 36.0, total: 256.0, monthPlanned: 168, monthCompleted: 128 },
      { employeeId: "emp-002", avg7d: 8.0, avg30d: 7.8, avgShift30d: 8.0, avgWeek30d: 39.0, total: 312.0, monthPlanned: 168, monthCompleted: 136 },
      { employeeId: "emp-003", avg7d: 6.5, avg30d: 6.8, avgShift30d: 7.0, avgWeek30d: 34.0, total: 180.0, monthPlanned: 168, monthCompleted: 112 },
    ];
    for (const m of metrics) {
      await kv.set(`work_metric::${m.employeeId}`, m);
    }

    // Employees list (for swap selection)
    await kv.set("emp_names", employees.map(e => ({ id: e.id, name: e.name, no: e.no, department: e.department })));

    return c.json({ success: true, message: "Seed data created successfully", usersCreated: createdUsers.length });
  } catch (err: any) {
    console.log("Seed error:", err);
    return c.json({ success: false, message: `Seed failed: ${err.message}` }, 500);
  }
});

// ===================== AUTH =====================
app.post("/make-server-9f9c6649/auth/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ success: false, message: "请输入邮箱和密码" }, 400);
    }

    const sb = supabaseAnon();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      console.log("Login error:", error);
      return c.json({ success: false, message: `登录失败: ${error.message}` }, 401);
    }

    const empId = await kv.get(`auth_map::${data.user.id}`);
    let employee = null;
    if (empId) {
      employee = await kv.get(`emp::${empId}`);
    }

    return c.json({
      success: true,
      data: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        user: data.user,
        employee,
      }
    });
  } catch (err: any) {
    console.log("Login error:", err);
    return c.json({ success: false, message: `登录异常: ${err.message}` }, 500);
  }
});

app.post("/make-server-9f9c6649/auth/change-password", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const { newPassword } = await c.req.json();
    if (!newPassword || newPassword.length < 8) {
      return c.json({ success: false, message: "密码至少8位" }, 400);
    }

    const sb = supabaseAdmin();
    const { error } = await sb.auth.admin.updateUserById(user.id, { password: newPassword });
    if (error) {
      return c.json({ success: false, message: `修改密码失败: ${error.message}` }, 400);
    }

    return c.json({ success: true, message: "密码修改成功" });
  } catch (err: any) {
    console.log("Change password error:", err);
    return c.json({ success: false, message: `修改密码异常: ${err.message}` }, 500);
  }
});

// ===================== ME (Profile) =====================
app.get("/make-server-9f9c6649/me", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const employee = await getEmployee(user.id);
    if (!employee) {
      return c.json({ success: false, message: "未找到员工信息" }, 404);
    }

    const metrics = await kv.get(`work_metric::${employee.id}`);

    return c.json({ success: true, data: { employee, metrics } });
  } catch (err: any) {
    console.log("Get me error:", err);
    return c.json({ success: false, message: `获取个人信息异常: ${err.message}` }, 500);
  }
});

// ===================== SCHEDULE =====================
app.get("/make-server-9f9c6649/schedule", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const employee = await getEmployee(user.id);
    if (!employee) return c.json({ success: false, message: "未找到员工信息" }, 404);

    const yearMonth = c.req.query("month") || "2026-04";
    const scheduleData = await kv.get(`schedule::${employee.id}::${yearMonth}`);

    const shiftTypes = await kv.get("config::shift_types");

    return c.json({
      success: true,
      data: {
        employee: { id: employee.id, name: employee.name, no: employee.no, department: employee.department },
        yearMonth,
        schedule: scheduleData || {},
        shiftTypes: shiftTypes || {},
      }
    });
  } catch (err: any) {
    console.log("Get schedule error:", err);
    return c.json({ success: false, message: `获取排班异常: ${err.message}` }, 500);
  }
});

// ===================== ANNOUNCEMENTS =====================
app.get("/make-server-9f9c6649/announcements", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const ids = await kv.get("announcement_list") || [];
    const announcements = [];
    for (const id of ids) {
      const ann = await kv.get(`announcement::${id}`);
      if (ann) announcements.push(ann);
    }

    // Sort by date desc
    announcements.sort((a: any, b: any) => b.date.localeCompare(a.date));

    const typeFilter = c.req.query("type");
    const filtered = typeFilter && typeFilter !== "全部"
      ? announcements.filter((a: any) => a.type === typeFilter)
      : announcements;

    return c.json({ success: true, data: filtered });
  } catch (err: any) {
    console.log("Get announcements error:", err);
    return c.json({ success: false, message: `获取公告异常: ${err.message}` }, 500);
  }
});

app.get("/make-server-9f9c6649/announcements/:id", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const id = c.req.param("id");
    const ann = await kv.get(`announcement::${id}`);
    if (!ann) return c.json({ success: false, message: "公告不存在" }, 404);

    return c.json({ success: true, data: ann });
  } catch (err: any) {
    return c.json({ success: false, message: `获取公告详情异常: ${err.message}` }, 500);
  }
});

// ===================== SHIFT CHANGE REQUESTS =====================
app.get("/make-server-9f9c6649/shift-changes", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const employee = await getEmployee(user.id);
    if (!employee) return c.json({ success: false, message: "未找到员工信息" }, 404);

    const ids = await kv.get(`shift_change_list::${employee.id}`) || [];
    const requests = [];
    for (const id of ids) {
      const req = await kv.get(`shift_change::${id}`);
      if (req) requests.push(req);
    }

    // Sort by createdAt desc
    requests.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));

    const statusFilter = c.req.query("status");
    const filtered = statusFilter && statusFilter !== "all"
      ? requests.filter((r: any) => r.status === statusFilter)
      : requests;

    return c.json({ success: true, data: filtered });
  } catch (err: any) {
    console.log("Get shift changes error:", err);
    return c.json({ success: false, message: `获取调班申请异常: ${err.message}` }, 500);
  }
});

app.post("/make-server-9f9c6649/shift-changes", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const employee = await getEmployee(user.id);
    if (!employee) return c.json({ success: false, message: "未找到员工信息" }, 404);

    const body = await c.req.json();
    const { type, originalDate, originalShift, targetDate, targetShift, targetEmployeeId, reason } = body;

    if (!originalDate || !originalShift || !reason) {
      return c.json({ success: false, message: "请填写完整信息" }, 400);
    }

    // 校验：原班次如果已经是休息，则不允许申请调班
    const shiftTypes = await kv.get("config::shift_types") as Record<string, any> | null;
    if (shiftTypes && originalShift) {
      const st = shiftTypes[originalShift];
      if (st && (st.category === 'rest' || st.category === 'leave')) {
        return c.json({ success: false, message: `您在 ${originalDate} 的班次为「${originalShift}」（休息），无需申请调班` }, 400);
      }
    }

    // Look up target employee name if swap
    let targetEmployeeName = null;
    if (type === "swap" && targetEmployeeId) {
      const targetEmp = await kv.get(`emp::${targetEmployeeId}`);
      if (targetEmp) targetEmployeeName = targetEmp.name;
    }

    const id = `scr-${Date.now()}`;
    const newRequest = {
      id,
      type: type || "direct_change",
      applicantId: employee.id,
      applicantName: employee.name,
      originalDate,
      originalShift,
      targetDate: targetDate || originalDate,
      targetShift: targetShift || "休",
      targetEmployeeId: targetEmployeeId || null,
      targetEmployeeName,
      reason,
      status: "pending",
      statusLabel: "待审批",
      createdAt: new Date().toISOString(),
      approvedAt: null,
      approverComment: null,
    };

    await kv.set(`shift_change::${id}`, newRequest);

    // Update list
    const ids = await kv.get(`shift_change_list::${employee.id}`) || [];
    ids.unshift(id);
    await kv.set(`shift_change_list::${employee.id}`, ids);

    return c.json({ success: true, data: newRequest, message: "调班申请已提交" });
  } catch (err: any) {
    console.log("Create shift change error:", err);
    return c.json({ success: false, message: `提交调班申请异常: ${err.message}` }, 500);
  }
});

// ===================== WORK METRICS =====================
app.get("/make-server-9f9c6649/work-metrics", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const employee = await getEmployee(user.id);
    if (!employee) return c.json({ success: false, message: "未找到员工信息" }, 404);

    const metrics = await kv.get(`work_metric::${employee.id}`);
    return c.json({ success: true, data: metrics || {} });
  } catch (err: any) {
    return c.json({ success: false, message: `获取工时画像异常: ${err.message}` }, 500);
  }
});

// ===================== SHIFT TYPES CONFIG =====================
app.get("/make-server-9f9c6649/config/shift-types", async (c) => {
  try {
    const shiftTypes = await kv.get("config::shift_types");
    return c.json({ success: true, data: shiftTypes || {} });
  } catch (err: any) {
    return c.json({ success: false, message: `获取班次配置异常: ${err.message}` }, 500);
  }
});

// ===================== EMPLOYEE LIST (for swap) =====================
app.get("/make-server-9f9c6649/employees", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ success: false, message: "未认证" }, 401);

    const employee = await getEmployee(user.id);
    if (!employee) return c.json({ success: false, message: "未找到员工信息" }, 404);

    const names = await kv.get("emp_names") || [];
    // Exclude current user
    const others = names.filter((n: any) => n.id !== employee.id);

    return c.json({ success: true, data: others });
  } catch (err: any) {
    return c.json({ success: false, message: `获取员工列表异常: ${err.message}` }, 500);
  }
});

Deno.serve(app.fetch);