import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sumHours(rows: Array<{ planned_hours?: number | null }>) {
  return rows.reduce((total, row) => total + Number(row.planned_hours || 0), 0);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { success: false, error_code: 'SERVER_CONFIG_MISSING', message: '缺少 Supabase 服务端配置' },
        { status: 500, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date();
    const last7Date = new Date(today);
    last7Date.setDate(today.getDate() - 7);
    const last30Date = new Date(today);
    last30Date.setDate(today.getDate() - 30);

    const [{ data: employees, error: employeeError }, { data: scheduleRows, error: scheduleError }] = await Promise.all([
      supabase.from('employee').select('id'),
      supabase.from('schedule').select('employee_id, schedule_date, planned_hours'),
    ]);

    if (employeeError || scheduleError) {
      return Response.json(
        {
          success: false,
          error_code: employeeError?.code || scheduleError?.code || 'LOAD_FAILED',
          message: employeeError?.message || scheduleError?.message || '加载重算数据失败',
        },
        { status: 400, headers: corsHeaders },
      );
    }

    for (const employee of employees || []) {
      const employeeSchedules = (scheduleRows || []).filter((row: any) => row.employee_id === employee.id);
      const rows7 = employeeSchedules.filter((row: any) => new Date(row.schedule_date) >= last7Date);
      const rows30 = employeeSchedules.filter((row: any) => new Date(row.schedule_date) >= last30Date);

      const totalHours = sumHours(employeeSchedules);
      const hours7 = sumHours(rows7);
      const hours30 = sumHours(rows30);
      const workedDays30 = new Set(rows30.map((row: any) => row.schedule_date)).size || 1;

      const payload = {
        employee_id: employee.id,
        avg_daily_hours_7d: Number((hours7 / 7).toFixed(2)),
        avg_daily_hours_30d: Number((hours30 / 30).toFixed(2)),
        avg_shift_hours_30d: Number((hours30 / workedDays30).toFixed(2)),
        avg_weekly_hours_30d: Number(((hours30 / 30) * 7).toFixed(2)),
        total_hours: Number(totalHours.toFixed(2)),
        calculated_at: new Date().toISOString(),
      };

      await supabase.from('employee_work_metric').upsert(payload, { onConflict: 'employee_id' });
    }

    return Response.json(
      {
        success: true,
        error_code: null,
        message: 'work metrics recalculated',
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error_code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
