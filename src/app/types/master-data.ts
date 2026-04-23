export type ReferenceOption = {
  id: string;
  label: string;
  code?: string;
};

export type EmployeeRecord = {
  id: string;
  employeeNo: string;
  fullName: string;
  mobileNumber: string;
  departmentId: string;
  channelId: string;
  onboardDate?: string | null;
  employeeStatusDictItemId?: string | null;
  laborRelationDictItemId?: string | null;
  remark?: string | null;
};

export type EmployeeFormValues = {
  employeeNo: string;
  fullName: string;
  mobileNumber: string;
  departmentId: string;
  channelId: string;
  onboardDate?: string | null;
  employeeStatusDictItemId?: string | null;
  laborRelationDictItemId?: string | null;
  remark?: string | null;
};

export type EmployeeSkillRecord = {
  id: string;
  employeeId: string;
  skillId: string;
  skillLevel: number;
  efficiencyCoefficient: number;
  isPrimary: boolean;
  isEnabled: boolean;
  certifiedAt?: string | null;
  remark?: string | null;
};

export type EmployeeSkillFormValues = {
  skillId: string;
  skillLevel: number;
  efficiencyCoefficient: number;
  isPrimary?: boolean;
  isEnabled?: boolean;
  certifiedAt?: string | null;
  remark?: string | null;
};
