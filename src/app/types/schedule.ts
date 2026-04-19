import type { Dayjs } from 'dayjs';

export type ScheduleProjectOption = {
  id: string;
  projectName: string;
  projectCode?: string | null;
};

export type ScheduleVersionOption = {
  id: string;
  versionNo: number;
  scheduleMonth: string;
  generationType: string;
};

export type ScheduleDepartmentOption = {
  id: string;
  departmentName: string;
};

export type ScheduleEmployeeOption = {
  id: string;
  fullName: string;
  employeeNo?: string | null;
  departmentId?: string | null;
};

export type ScheduleCodeItem = {
  id: string;
  itemName: string;
  itemCode: string;
  extraConfig?: Record<string, any> | null;
  dictTypeId?: string | null;
  sortOrder?: number;
  isEnabled?: boolean;
};

export type ScheduleCellRecord = {
  id: string;
  scheduleVersionId: string;
  employeeId: string;
  departmentId?: string | null;
  projectId: string;
  taskId?: string | null;
  deviceId?: string | null;
  scheduleDate: string;
  shiftTypeDictItemId?: string | null;
  scheduleCodeDictItemId: string;
  plannedHours?: number | null;
  sourceType?: string | null;
  remark?: string | null;
};

export type ScheduleCellChange = {
  employeeId: string;
  departmentId?: string | null;
  projectId: string;
  taskId?: string | null;
  deviceId?: string | null;
  scheduleDate: string;
  shiftTypeDictItemId?: string | null;
  scheduleCodeDictItemId: string;
  plannedHours?: number | null;
  sourceType?: string | null;
  remark?: string | null;
};

export type ScheduleMatrixFilters = {
  selectedProject?: string;
  selectedVersion?: string;
  selectedMonth: Dayjs;
  selectedDept?: string;
};

export type ScheduleConflictResult = {
  success: boolean;
  message?: string;
  conflicts?: Array<{
    employeeId?: string;
    deviceId?: string;
    scheduleDate?: string;
    reason: string;
  }>;
};
