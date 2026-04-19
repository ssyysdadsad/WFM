import { supabase } from '@/app/lib/supabase/client';
import { AppError, toAppError } from '@/app/lib/supabase/errors';
import type { EmployeeSkillFormValues, EmployeeSkillRecord } from '@/app/types/master-data';

function mapEmployeeSkill(row: any): EmployeeSkillRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    skillId: row.skill_id,
    skillLevel: row.skill_level,
    efficiencyCoefficient: row.efficiency_coefficient,
    isPrimary: row.is_primary,
    isEnabled: row.is_enabled,
    certifiedAt: row.certified_at,
    remark: row.remark,
  };
}

export async function listEmployeeSkills(employeeId: string) {
  const { data, error } = await supabase
    .from('employee_skill')
    .select('*')
    .eq('employee_id', employeeId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw toAppError(error, '加载员工技能失败');
  }

  return (data ?? []).map(mapEmployeeSkill);
}

export async function addEmployeeSkill(employeeId: string, payload: EmployeeSkillFormValues) {
  if (payload.isPrimary) {
    const existingSkills = await listEmployeeSkills(employeeId);
    const hasPrimarySkill = existingSkills.some((item) => item.isPrimary && item.isEnabled);

    if (hasPrimarySkill) {
      throw new AppError('该员工已存在启用中的主技能，请先调整原主技能', 'VALIDATION_FAILED');
    }
  }

  const { error } = await supabase.from('employee_skill').insert({
    employee_id: employeeId,
    skill_id: payload.skillId,
    skill_level: payload.skillLevel,
    efficiency_coefficient: payload.efficiencyCoefficient,
    is_primary: payload.isPrimary ?? false,
    is_enabled: payload.isEnabled ?? true,
    certified_at: payload.certifiedAt ?? null,
    remark: payload.remark ?? null,
  });

  if (error) {
    throw toAppError(error, '添加员工技能失败');
  }
}
