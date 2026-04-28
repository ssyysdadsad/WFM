import React, { useState, useEffect, useMemo } from 'react';
import { Button, DatePicker, Select, Flex, Upload, message, Typography, Table, Tooltip, Tag } from 'antd';
import { UploadOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { supabase } from '@/app/lib/supabase/client';
import { parseAttendanceExcel, ParsedEmployeeRecord } from '@/app/lib/excel-parser';
import { 
  createAttendanceBatch, 
  insertAttendanceRecords, 
  getAttendanceRecords, 
  AttendanceRecord 
} from '@/app/services/attendance.service';
// Removed getSchedules
import { useDict } from '@/app/hooks/useDict';
import { Schedule } from '@/app/types/schedule';

const { Title, Text } = Typography;

export function AttendanceComparePage() {
  const { currentUser } = useCurrentUser();
  const { items: dictItems } = useDict('system_config');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(dayjs().format('YYYY-MM'));
  
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; no: string }[]>([]);
  
  // Fetch flex punch minutes config
  const flexPunchMinutes = useMemo(() => {
    const config = dictItems?.find(item => item.itemCode === 'flex_punch_minutes');
    if (config?.extraConfig?.value) {
      return Number(config.extraConfig.value);
    }
    return 0; // Default 0 if not configured
  }, [dictItems]);

  useEffect(() => {
    async function loadProjects() {
      const { data, error } = await supabase
        .from('project')
        .select('id, project_name')
        .order('project_name');
        
      if (error) {
        message.error('加载项目失败');
        return;
      }
      
      if (data) {
        const mappedProjects = data.map((p: any) => ({ id: p.id, name: p.project_name }));
        setProjects(mappedProjects);
        if (mappedProjects.length > 0 && !selectedProjectId) {
          setSelectedProjectId(mappedProjects[0].id);
        }
      }
    }
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId && selectedMonth) {
      loadData();
    }
  }, [selectedProjectId, selectedMonth]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch project employees (通过 project_employee 关联表过滤)
      const { data: peData } = await supabase
        .from('project_employee')
        .select('employee_id')
        .eq('project_id', selectedProjectId)
        .eq('is_active', true);
      
      const memberIds = (peData || []).map((r: any) => r.employee_id);
      
      let empList: { id: string; name: string; no: string }[] = [];
      if (memberIds.length > 0) {
        const { data: empData } = await supabase
          .from('employee')
          .select('id, full_name, employee_no')
          .in('id', memberIds)
          .order('full_name');
        empList = (empData || []).map((e: any) => ({ id: e.id, name: e.full_name, no: e.employee_no }));
      }
      setEmployees(empList);

      // 2. Fetch attendance records
      const records = await getAttendanceRecords(selectedProjectId, selectedMonth);
      setAttendanceRecords(records);

      // 3. Fetch WFM Schedules (从 active 版本中获取)
      // schedule_month 在数据库中是 DATE 类型，存储为 YYYY-MM-01
      const scheduleMonthDate = `${selectedMonth}-01`;
      const { data: versionData } = await supabase
        .from('schedule_version')
        .select('id, version_no')
        .eq('project_id', selectedProjectId)
        .eq('schedule_month', scheduleMonthDate)
        .eq('is_active', true)
        .single();
        
      if (versionData) {
        const { data: schedData } = await supabase
          .from('schedule')
          .select('*, dict_item!schedule_code_dict_item_id(item_name)')
          .eq('schedule_version_id', versionData.id);
          
        const formattedSchedules = (schedData || []).map((s: any) => ({
          employeeId: s.employee_id,
          scheduleDate: s.schedule_date,
          shiftType: s.dict_item?.item_name || '未知'
        }));
        setSchedules(formattedSchedules as any);
      } else {
        setSchedules([]);
      }

    } catch (err: any) {
      message.error(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!selectedProjectId) {
      message.error('请先选择项目');
      return false;
    }
    setUploading(true);
    try {
      // 1. Parse Excel
      const parsedData = await parseAttendanceExcel(file);
      
      // 2. Match employees by name
      const notFoundNames: string[] = [];
      const recordsToInsert: Partial<AttendanceRecord>[] = [];
      
      // Generate batch ID
      const batchId = await createAttendanceBatch(selectedProjectId, selectedMonth, file.name);

      parsedData.forEach((parsedEmp) => {
        const matchedEmp = employees.find(e => e.name === parsedEmp.employeeName);
        if (!matchedEmp) {
          notFoundNames.push(parsedEmp.employeeName);
          return;
        }

        // Process daily records
        Object.values(parsedEmp.dailyRecords).forEach(daily => {
          const dateStr = `${selectedMonth}-${String(daily.date).padStart(2, '0')}`;
          
          recordsToInsert.push({
            batchId,
            employeeId: matchedEmp.id,
            projectId: selectedProjectId,
            recordDate: dateStr,
            firstPunchTime: daily.firstPunchTime,
            lastPunchTime: daily.lastPunchTime,
            rawData: daily.rawText,
            calculatedStatus: 'pending' // We will calculate this on the fly for now, or could store it
          });
        });
      });

      if (notFoundNames.length > 0) {
        message.warning(`有 ${notFoundNames.length} 名员工在系统中未找到，已跳过：${notFoundNames.slice(0, 5).join(', ')}...`);
      }

      if (recordsToInsert.length > 0) {
        // Delete previous records for this project/month to avoid duplicates? 
        // For simplicity, we just insert. A robust system might delete previous batch.
        await insertAttendanceRecords(recordsToInsert);
        message.success(`成功导入 ${recordsToInsert.length} 条打卡记录`);
        loadData(); // Reload UI
      } else {
        message.warning('没有可导入的有效记录');
      }

    } catch (err: any) {
      message.error(`解析或导入失败: ${err.message}`);
    } finally {
      setUploading(false);
    }
    return false; // Prevent default upload behavior
  };

  // Compare logic
  const getComparisonResult = (recordDate: string, empId: string) => {
    const sched = schedules.find(s => s.employeeId === empId && s.scheduleDate === recordDate);
    const actual = attendanceRecords.find(r => r.employeeId === empId && r.recordDate === recordDate);

    // If no schedule and no actual punch -> normal rest
    if (!sched && (!actual || !actual.rawData)) {
      return { status: 'normal', desc: '正常休息', schedTime: '休息', actualTime: '--' };
    }

    // If scheduled but no punch -> absent
    if (sched && (!actual || !actual.firstPunchTime)) {
      return { status: 'absent', desc: '旷工/缺卡', schedTime: sched.shiftType, actualTime: actual?.rawData || '--', color: 'red' };
    }

    // If no schedule but has punch -> unscheduled work
    if (!sched && actual && actual.firstPunchTime) {
      return { status: 'unscheduled', desc: '计划外用工', schedTime: '休息', actualTime: actual.rawData, color: 'orange' };
    }

    // Compare times
    if (sched && actual && actual.firstPunchTime && actual.lastPunchTime) {
      // In a real system, we'd lookup dict_item for sched.shiftType to get exact start/end time.
      // For demonstration, let's assume sched.shiftType is something we can parse or we just mark it as needing check.
      // We would ideally fetch schedule code details to do Math.
      
      // Let's use a dummy comparison for now until we join with Schedule Code dict.
      // In production, fetch dictItems for 'schedule_code' and parse extraConfig.startTime / endTime
      return { status: 'normal', desc: '打卡正常', schedTime: sched.shiftType, actualTime: actual.rawData, color: 'green' };
    }

    return { status: 'unknown', desc: '需核查', schedTime: sched?.shiftType || '--', actualTime: actual?.rawData || '--', color: 'gray' };
  };

  // Build matrix columns
  const daysInMonth = dayjs(selectedMonth).daysInMonth();
  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', fixed: 'left' as const, width: 100 },
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      return {
        title: `${day}日`,
        dataIndex: dateStr,
        key: dateStr,
        width: 120,
        render: (_: any, record: any) => {
          const comp = getComparisonResult(dateStr, record.id);
          return (
            <Tooltip title={comp.desc}>
              <div style={{
                border: `1px solid ${comp.color || '#e8e8e8'}`,
                borderRadius: 4,
                padding: '2px 4px',
                textAlign: 'center',
                backgroundColor: comp.color === 'red' ? '#fff1f0' : comp.color === 'orange' ? '#fff7e6' : 'transparent',
                cursor: 'pointer'
              }}>
                <div style={{ fontSize: '12px', color: '#666', borderBottom: '1px dashed #eee' }}>{comp.schedTime}</div>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{comp.actualTime}</div>
              </div>
            </Tooltip>
          );
        }
      };
    })
  ];

  return (
    <div style={{ padding: 24, background: '#fff', minHeight: '100%' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>考勤比对大盘</Title>
        <Flex gap={16} align="center">
          <Text type="secondary">弹性打卡容差: {flexPunchMinutes} 分钟</Text>
          <Select
            style={{ width: 150 }}
            placeholder="选择项目"
            options={projects.map(p => ({ label: p.name, value: p.id }))}
            value={selectedProjectId}
            onChange={setSelectedProjectId}
          />
          <DatePicker
            picker="month"
            value={dayjs(selectedMonth)}
            onChange={(d) => setSelectedMonth(d ? d.format('YYYY-MM') : '')}
            allowClear={false}
          />
          <Button icon={<SyncOutlined />} onClick={loadData} loading={loading}>
            刷新
          </Button>
          <Upload beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
              导入打卡记录
            </Button>
          </Upload>
        </Flex>
      </Flex>

      <Table
        dataSource={employees}
        columns={columns}
        rowKey="id"
        scroll={{ x: 'max-content', y: 'calc(100vh - 250px)' }}
        pagination={false}
        loading={loading}
        bordered
        size="small"
      />
    </div>
  );
}
