import { Table, Tag } from 'antd';
import type { ScheduleImportError } from '@/app/types/schedule-import';

export function ImportErrorTable({ errors }: { errors: ScheduleImportError[] }) {
  return (
    <Table
      rowKey={(record, index) => `${record.rowIndex}-${record.scheduleDate || ''}-${index}`}
      size="small"
      dataSource={errors}
      pagination={false}
      columns={[
        { title: '行号', dataIndex: 'rowIndex', width: 72 },
        { title: '工号', dataIndex: 'employeeNo', width: 100, render: (value?: string) => value || '-' },
        { title: '姓名', dataIndex: 'employeeName', width: 100, render: (value?: string) => value || '-' },
        { title: '日期', dataIndex: 'scheduleDate', width: 110, render: (value?: string) => value || '-' },
        { title: '编码', dataIndex: 'code', width: 90, render: (value?: string) => value ? <Tag>{value}</Tag> : '-' },
        { title: '错误信息', dataIndex: 'message' },
      ]}
    />
  );
}
