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
};
