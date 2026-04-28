/**
 * 调班申请类型：
 *  leave           - 请假：申请人当天班次 → 休
 *  direct_swap     - 直接换班：申请人(D1,X) ↔ 对方(D2,Y)，两人均非休且 X≠Y，可跨日期
 *  swap_with_payback - 互换调班：申请人(D1,非休)换对方(D1,休)，事后还班(D2)
 */
export type ShiftChangeRequestType = 'leave' | 'direct_swap' | 'swap_with_payback';

export type ShiftChangeRequestRecord = {
  id: string;
  requestType: ShiftChangeRequestType;
  applicantEmployeeId: string;
  targetEmployeeId?: string | null;
  originalScheduleId: string;       // 申请人在 D1 的排班记录
  targetScheduleId?: string | null; // 对方在 D2(direct_swap) 或 D1(swap_with_payback) 的排班记录
  paybackScheduleId?: string | null;// 还班日对方的排班记录 (swap_with_payback)
  targetDate?: string | null;        // 对方日期 D2（direct_swap 跨日期时不同于 D1）
  targetScheduleDateSnapshot?: string | null; // 对方日期快照
  targetShiftTypeDictItemId?: string | null;
  targetScheduleCodeDictItemId?: string | null;
  targetTaskId?: string | null;
  targetDeviceId?: string | null;
  reason: string;
  approvalStatusDictItemId: string;
  approverUserAccountId?: string | null;
  approverName?: string | null;
  approvedAt?: string | null;
  approvalComment?: string | null;
  createdAt?: string | null;
  // 对方确认相关
  peerStatus: 'pending_peer' | 'peer_approved' | 'peer_rejected' | 'not_required';
  peerRespondedAt?: string | null;
  paybackDate?: string | null;       // 还班日期 D2
  // Display fields (populated via JOIN)
  applicantName?: string;
  applicantDeptName?: string;
  applicantDepartmentId?: string | null;
  applicantLaborRelationDictItemId?: string | null;
  targetEmployeeName?: string;
  originalScheduleDate?: string;     // D1
  originalCodeName?: string;         // 申请人 D1 班次名
  originalPlannedHours?: number | null;
  targetCodeName?: string;           // 对方班次名（direct_swap: D2班次；swap_with_payback: D1休）
  paybackCodeName?: string | null;   // 还班日对方班次名 (swap_with_payback)
  projectName?: string;
  projectStartDate?: string;
  projectEndDate?: string;
  projectId?: string;
  scheduleVersionId?: string;
  statusName?: string;
  statusCode?: string;
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

export type AvailableReplacement = {
  employeeId: string;
  employeeName: string;
  departmentName: string;
  employeeNo: string;
  scheduleId: string;      // 对方的 schedule 记录 ID
  shiftCodeName?: string;  // 对方班次名
  shiftCodeId?: string;    // 对方班次 dict_item ID
  scheduleDate: string;    // 对方的日期
};
