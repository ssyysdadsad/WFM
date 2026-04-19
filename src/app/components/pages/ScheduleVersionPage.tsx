import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, Space, Typography, message, Tag, InputNumber, Checkbox, Input, Upload, Card } from 'antd';
import { PlusOutlined, ReloadOutlined, SendOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { ImportResultModal } from '@/app/components/schedule/ImportResultModal';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { listProjectOptions } from '@/app/services/master-data.service';
import { triggerScheduleExportDownload, exportScheduleExcel } from '@/app/services/schedule-export.service';
import { importScheduleExcel, listScheduleImportBatches } from '@/app/services/schedule-import.service';
import {
  createScheduleVersion,
  listPublishStatusOptions,
  listScheduleVersions,
  publishScheduleVersion,
} from '@/app/services/schedule-version.service';
import type { ReferenceOption } from '@/app/types/master-data';
import type { ScheduleImportBatchRecord, ScheduleImportResult } from '@/app/types/schedule-import';
import type { ScheduleVersionRecord } from '@/app/types/schedule-version';

export function ScheduleVersionPage() {
  const { currentUser } = useCurrentUser();
  const [data, setData] = useState<ScheduleVersionRecord[]>([]);
  const [batches, setBatches] = useState<ScheduleImportBatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [publishForm] = Form.useForm();
  const [importForm] = Form.useForm();
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportingId, setExportingId] = useState<string>();
  const [publishingVersion, setPublishingVersion] = useState<ScheduleVersionRecord | null>(null);
  const [importFileList, setImportFileList] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<ScheduleImportResult | null>(null);
  const [projects, setProjects] = useState<ReferenceOption[]>([]);
  const [statusItems, setStatusItems] = useState<ReferenceOption[]>([]);

  useEffect(() => {
    loadData();
    loadRefs();
  }, []);

  async function loadRefs() {
    try {
      const [projectOptions, publishStatusOptions] = await Promise.all([
        listProjectOptions(),
        listPublishStatusOptions(),
      ]);
      setProjects(projectOptions);
      setStatusItems(publishStatusOptions);
    } catch (error) {
      message.error(getErrorMessage(error, '加载排班版本关联数据失败'));
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [rows, batchRows] = await Promise.all([
        listScheduleVersions(),
        listScheduleImportBatches(),
      ]);
      setData(rows);
      setBatches(batchRows);
    } catch (error) {
      message.error(getErrorMessage(error, '加载排班版本与导入批次失败'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const values = await form.validateFields();
      await createScheduleVersion(
        {
          projectId: values.project_id,
          scheduleMonth: dayjs(values.schedule_month).startOf('month').format('YYYY-MM-DD'),
          versionNo: values.version_no,
          generationType: values.generation_type,
          publishStatusDictItemId: values.publish_status_dict_item_id ?? null,
          remark: values.remark ?? null,
        },
        currentUser?.id,
      );
      message.success('创建成功');
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '创建排班版本失败'));
    }
  }

  function openPublishModal(record: ScheduleVersionRecord) {
    setPublishingVersion(record);
    publishForm.setFieldsValue({
      create_announcement: false,
      announcement_title: `${dayjs(record.scheduleMonth).format('M')}月排班已发布`,
    });
    setPublishModalOpen(true);
  }

  async function handlePublish() {
    try {
      if (!publishingVersion || !currentUser) {
        message.warning('缺少发布上下文');
        return;
      }

      const values = await publishForm.validateFields();
      await publishScheduleVersion({
        scheduleVersionId: publishingVersion.id,
        operatorUserAccountId: currentUser.id,
        createAnnouncement: values.create_announcement ?? false,
        announcementTitle: values.announcement_title ?? undefined,
      });
      message.success('发布成功');
      setPublishModalOpen(false);
      setPublishingVersion(null);
      publishForm.resetFields();
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '发布排班版本失败'));
    }
  }

  async function handleImport() {
    try {
      if (!currentUser?.id) {
        message.warning('当前未登录，无法导入');
        return;
      }

      const values = await importForm.validateFields();
      const file = importFileList[0]?.originFileObj as File | undefined;
      if (!file) {
        message.warning('请选择 Excel 文件');
        return;
      }

      setImporting(true);
      const result = await importScheduleExcel({
        file,
        projectId: values.project_id,
        scheduleMonth: dayjs(values.schedule_month).startOf('month').format('YYYY-MM-DD'),
        importMode: values.import_mode,
        operatorUserAccountId: currentUser.id,
      });
      setImportResult(result);
      setImportResultOpen(true);
      setImportModalOpen(false);
      importForm.resetFields();
      setImportFileList([]);
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '导入 Excel 失败'));
    } finally {
      setImporting(false);
    }
  }

  async function handleExport(record: ScheduleVersionRecord) {
    try {
      setExportingId(record.id);
      const result = await exportScheduleExcel({
        projectId: record.projectId,
        scheduleVersionId: record.id,
        scheduleMonth: record.scheduleMonth,
      });
      triggerScheduleExportDownload(result);
      message.success('导出成功');
    } catch (error) {
      message.error(getErrorMessage(error, '导出 Excel 失败'));
    } finally {
      setExportingId(undefined);
    }
  }

  const projMap = useMemo(() => Object.fromEntries(projects.map((item) => [item.id, item.label])), [projects]);
  const statusMap = useMemo(() => Object.fromEntries(statusItems.map((item) => [item.id, item.label])), [statusItems]);
  const batchStatusColorMap: Record<string, string> = {
    pending: 'default',
    processing: 'processing',
    success: 'success',
    completed: 'success',
    completed_with_errors: 'warning',
    failed: 'error',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>排班版本管理</Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button icon={<UploadOutlined />} onClick={() => {
            importForm.resetFields();
            importForm.setFieldsValue({
              import_mode: 'cover_draft',
              schedule_month: dayjs(),
            });
            setImportFileList([]);
            setImportModalOpen(true);
          }}>导入 Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>新建版本</Button>
        </Space>
      </div>
      <Table rowKey="id" loading={loading} dataSource={data} size="small"
        columns={[
          { title: '项目', dataIndex: 'projectId', render: (value: string) => projMap[value] || value?.substring(0, 8) },
          { title: '排班月份', dataIndex: 'scheduleMonth', render: (value: string) => value?.substring(0, 7) },
          { title: '版本号', dataIndex: 'versionNo' },
          { title: '生成方式', dataIndex: 'generationType', render: (value: string) => <Tag>{value === 'manual' ? '手工' : value === 'template' ? '模板' : 'Excel'}</Tag> },
          { title: '发布状态', dataIndex: 'publishStatusDictItemId', render: (value?: string | null) => {
            const name = value ? statusMap[value] || '-' : '-';
            const color = name.includes('发布') || name.includes('publish') ? 'green' : 'orange';
            return <Tag color={color}>{name}</Tag>;
          }},
          { title: '发布时间', dataIndex: 'publishedAt', render: (value?: string | null) => value?.substring(0, 16) || '-' },
          { title: '操作', key: 'action', render: (_: unknown, record: ScheduleVersionRecord) => (
            <Space>
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                loading={exportingId === record.id}
                onClick={() => handleExport(record)}
              >
                导出
              </Button>
              <Button type="link" size="small" icon={<SendOutlined />} onClick={() => openPublishModal(record)}>发布</Button>
            </Space>
          )},
        ]}
      />
      <Card size="small" title="最近导入批次" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={batches}
          columns={[
            { title: '项目', dataIndex: 'projectId', render: (value: string) => projMap[value] || value?.slice(0, 8) },
            { title: '月份', dataIndex: 'scheduleMonth', render: (value: string) => value?.substring(0, 7) || '-' },
            { title: '模式', dataIndex: 'importMode', render: (value: string) => value === 'cover_draft' ? '覆盖草稿' : '新建版本' },
            { title: '文件', dataIndex: 'sourceFileName', render: (value?: string | null) => value || '-' },
            { title: '成功', dataIndex: 'importedRows', width: 80 },
            { title: '失败', dataIndex: 'failedRows', width: 80 },
            { title: '状态', dataIndex: 'processingStatus', render: (value: string) => <Tag color={batchStatusColorMap[value]}>{value}</Tag> },
            { title: '完成时间', dataIndex: 'completedAt', render: (value?: string | null) => value?.substring(0, 16) || '-' },
          ]}
        />
      </Card>
      <Modal title="新建排班版本" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="project_id" label="项目" rules={[{ required: true }]}>
            <Select options={projects.map((item) => ({ label: item.label, value: item.id }))} placeholder="选择项目" />
          </Form.Item>
          <Form.Item name="schedule_month" label="排班月份" rules={[{ required: true }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="version_no" label="版本号" rules={[{ required: true }]} initialValue={1}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item name="generation_type" label="生成方式" rules={[{ required: true }]} initialValue="manual">
            <Select options={[{ label: '手工', value: 'manual' }, { label: '模板', value: 'template' }, { label: 'Excel', value: 'excel' }]} />
          </Form.Item>
          <Form.Item name="publish_status_dict_item_id" label="发布状态">
            <Select options={statusItems.map((item) => ({ label: item.label, value: item.id }))} placeholder="选择状态" showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="导入 Excel"
        open={importModalOpen}
        onOk={handleImport}
        confirmLoading={importing}
        onCancel={() => {
          setImportModalOpen(false);
          importForm.resetFields();
          setImportFileList([]);
        }}
        destroyOnClose
      >
        <Form form={importForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="project_id" label="项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select options={projects.map((item) => ({ label: item.label, value: item.id }))} placeholder="选择项目" />
          </Form.Item>
          <Form.Item name="schedule_month" label="排班月份" rules={[{ required: true, message: '请选择月份' }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="import_mode" label="导入模式" rules={[{ required: true, message: '请选择导入模式' }]}>
            <Select
              options={[
                { label: '覆盖草稿版本', value: 'cover_draft' },
                { label: '新建导入版本', value: 'new_version' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Excel 文件" required>
            <Upload
              accept=".xlsx,.xls"
              maxCount={1}
              beforeUpload={() => false}
              fileList={importFileList}
              onChange={({ fileList }) => setImportFileList(fileList)}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
          <Typography.Text type="secondary">
            模板表头格式：`工号 | 姓名 | 部门 | 2026-04-01 | 2026-04-02 ...`
          </Typography.Text>
        </Form>
      </Modal>
      <Modal
        title={`发布排班版本${publishingVersion ? ` - v${publishingVersion.versionNo}` : ''}`}
        open={publishModalOpen}
        onOk={handlePublish}
        onCancel={() => {
          setPublishModalOpen(false);
          setPublishingVersion(null);
          publishForm.resetFields();
        }}
        destroyOnClose
      >
        <Form form={publishForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="create_announcement" valuePropName="checked">
            <Checkbox>发布后自动创建公告</Checkbox>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.create_announcement !== currentValues.create_announcement}
          >
            {({ getFieldValue }) =>
              getFieldValue('create_announcement') ? (
                <Form.Item name="announcement_title" label="公告标题" rules={[{ required: true, message: '请输入公告标题' }]}>
                  <Input placeholder="请输入发布公告标题" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
      <ImportResultModal
        open={importResultOpen}
        result={importResult}
        onClose={() => {
          setImportResultOpen(false);
          setImportResult(null);
        }}
      />
    </div>
  );
}
