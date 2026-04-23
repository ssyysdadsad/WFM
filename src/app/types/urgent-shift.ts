export interface UrgentShiftRecord {
  id: string;
  title: string;
  shiftType: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  projectId: string | null;
  projectName?: string;
  skillId: string | null;
  skillName?: string;
  description: string | null;
  signupDeadline: string;
  status: 'open' | 'closed' | 'cancelled';
  createdByUserAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  // computed
  signupCount?: number;
  approvedCount?: number;
}

export interface UrgentShiftFormValues {
  title: string;
  shiftType: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  projectId: string;
  skillId?: string | null;
  description?: string;
  signupDeadline: string;
}

export interface UrgentShiftSignupRecord {
  id: string;
  urgentShiftId: string;
  employeeId: string;
  employeeName?: string;
  employeeNo?: string;
  departmentName?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  remark: string | null;
  approvalComment: string | null;
  approvedByUserAccountId: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface EligibleEmployee {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  departmentName: string;
  skills: string[];
  currentShift: string | null; // 当天排班（null=无排班，'休'=休息）
  laborWarnings?: LaborRuleWarning[]; // 用工规则警告
}

export interface LaborRuleWarning {
  ruleName: string;
  level: 'hard' | 'soft'; // 强制 / 建议
  message: string;
}

export interface EmployeeMessageRecord {
  id: string;
  employeeId: string;
  msgType: string;
  title: string;
  content: string | null;
  extraData: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}
