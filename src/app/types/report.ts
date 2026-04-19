export type DashboardOverview = {
  stats: {
    employees: number;
    projects: number;
    schedules: number;
    devices: number;
    departments: number;
    scenes: number;
    channels: number;
    skills: number;
  };
  projectStatusData: Array<{ name: string; value: number }>;
  deptEmployeeData: Array<{ name: string; count: number }>;
  recentSchedules: Array<{
    id: string;
    employeeName: string;
    scheduleDate: string;
    scheduleCodeName: string;
    plannedHours: number;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    content: string;
    publishedAt?: string | null;
    createdAt?: string | null;
  }>;
};

export type EmployeeProfileReportRow = {
  employeeId: string;
  employeeNo: string;
  fullName: string;
  avgDailyHours7d: number;
  avgDailyHours30d: number;
  avgShiftHours30d: number;
  avgWeeklyHours30d: number;
  totalHours: number;
  calculatedAt?: string | null;
};

export type TaskCompletionReportRow = {
  taskId: string;
  taskName: string;
  projectName?: string;
  plannedHours: number;
  scheduledHours: number;
  completionRate: number;
};

export type DeviceUsageReportRow = {
  deviceId: string;
  deviceName: string;
  usageDays: number;
  usageHours: number;
};

export type WorkHoursSummaryRow = {
  name: string;
  avgDailyHours7d: number;
  avgDailyHours30d: number;
  totalHours: number;
};
