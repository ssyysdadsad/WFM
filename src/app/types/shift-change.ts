export type ShiftChangeRequestRecord = {
  id: string;
  requestType: 'swap' | 'direct_change';
  applicantEmployeeId: string;
  targetEmployeeId?: string | null;
  originalScheduleId: string;
  targetScheduleId?: string | null;
  targetDate?: string | null;
  targetShiftTypeDictItemId?: string | null;
  targetScheduleCodeDictItemId?: string | null;
  targetTaskId?: string | null;
  targetDeviceId?: string | null;
  reason: string;
  approvalStatusDictItemId: string;
  approverUserAccountId?: string | null;
  approvedAt?: string | null;
  approvalComment?: string | null;
  createdAt?: string | null;
  // Display fields (populated via JOIN)
  applicantName?: string;
  applicantDeptName?: string;
  applicantDepartmentId?: string | null;
  applicantLaborRelationDictItemId?: string | null;
  targetEmployeeName?: string;
  originalScheduleDate?: string;
  originalCodeName?: string;
  originalPlannedHours?: number | null;
  targetCodeName?: string;
  projectName?: string;
  projectStartDate?: string;
  projectEndDate?: string;
  projectId?: string;
  scheduleVersionId?: string;
  statusName?: string;
  statusCode?: string;
  // For replacement assignment (direct_change)
  replacementEmployeeId?: string | null;
};

export type ApprovalStatusOption = {
  id: string;
  itemCode: string;
  itemName: string;
};

export type ShiftChangeApprovePayload = {
  shiftChangeRequestId: string;
  action: 'approve' | 'reject';
  approvalComment?: string;
  operatorUserAccountId: string;
  // For direct_change: the replacement employee selected by scheduler
  replacementEmployeeId?: string;
};

export type AvailableReplacement = {
  employeeId: string;
  employeeName: string;
  departmentName: string;
  employeeNo: string;
};
