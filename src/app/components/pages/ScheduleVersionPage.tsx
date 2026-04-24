import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, Space, Typography, message, Tag, Checkbox, Input, Upload, Collapse, Popconfirm, Tooltip } from 'antd';
import {
  PlusOutlined, ReloadOutlined, SendOutlined, UploadOutlined, DownloadOutlined,
  DeleteOutlined, TableOutlined, UndoOutlined, RightOutlined, DownOutlined,
  CheckCircleFilled, ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import dayjs from 'dayjs';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { ImportResultModal } from '@/app/components/schedule/ImportResultModal';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { useDict } from '@/app/hooks/useDict';
import { listProjectOptions } from '@/app/services/master-data.service';
import { triggerScheduleExportDownload, exportScheduleExcel } from '@/app/services/schedule-export.service';
import { importScheduleExcel, listScheduleImportBatches } from '@/app/services/schedule-import.service';
import { buildScheduleImportTemplate } from '@/app/lib/schedule/excel';
import {
  createScheduleVersion,
  deleteScheduleVersion,
  getNextVersionNo,
  listPublishStatusOptions,
  listScheduleVersions,
  publishScheduleVersion,
  restoreScheduleVersion,
} from '@/app/services/schedule-version.service';
import type { ReferenceOption } from '@/app/types/master-data';
import type { ScheduleImportBatchRecord, ScheduleImportResult } from '@/app/types/schedule-import';
import type { ScheduleVersionRecord } from '@/app/types/schedule-version';

// ====== Group type ======
type VersionGroup = {
  key: string;  // projectId::month
  projectId: string;
  projectName: string;
  scheduleMonth: string;
  versions: ScheduleVersionRecord[];
  activeVersion: ScheduleVersionRecord | null;
  latestPublishedAt: string | null;
  totalCount: number;
  draftCount: number;
  publishedCount: number;
};

export function ScheduleVersionPage() {
  const { currentUser } = useCurrentUser();
  const { items: scheduleCodeItems } = useDict('schedule_code');
  const navigate = useNavigate();
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
  const [filterProject, setFilterProject] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterMonth, setFilterMonth] = useState<string | undefined>();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

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
      const projectId = values.project_id;
      const month = dayjs(values.schedule_month).startOf('month').format('YYYY-MM-DD');

      const nextVersionNo = await getNextVersionNo(projectId, month);
      const draftStatus = statusItems.find(s => s.code === 'draft' || s.label === '草稿');
      const defaultStatusId = draftStatus?.id || statusItems[0]?.id || null;

      await createScheduleVersion(
        {
          projectId,
          scheduleMonth: month,
          versionNo: nextVersionNo,
          generationType: 'manual',
          publishStatusDictItemId: defaultStatusId,
          remark: values.remark ?? null,
        },
        currentUser?.id,
      );
      message.success(`创建成功（版本号 v${nextVersionNo}）`);
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
      Modal.success({
        title: '发布成功',
        content: `版本已成功发布。${values.create_announcement ? '已自动创建公告。' : ''}`,
      });
      setPublishModalOpen(false);
      setPublishingVersion(null);
      publishForm.resetFields();
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '发布排班版本失败'));
    }
  }

  async function handleDelete(record: ScheduleVersionRecord) {
    try {
      await deleteScheduleVersion(record.id);
      message.success('已删除');
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '删除排班版本失败'));
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

  function goToMatrix(record: ScheduleVersionRecord) {
    navigate(`/schedule?projectId=${record.projectId}&versionId=${record.id}`);
  }

  const projMap = useMemo(() => Object.fromEntries(projects.map((item) => [item.id, item.label])), [projects]);
  const statusMap = useMemo(() => Object.fromEntries(statusItems.map((item) => [item.id, item.label])), [statusItems]);

  function isPublished(record: ScheduleVersionRecord) {
    const name = record.publishStatusDictItemId ? statusMap[record.publishStatusDictItemId] || '' : '';
    return !!(record.publishedAt || name.includes('发布') || name.includes('publish'));
  }

  function isActiveVersion(record: ScheduleVersionRecord) {
    return !!record.isActive;
  }

  // ====== Build grouped data ======
  const versionGroups = useMemo<VersionGroup[]>(() => {
    // Apply filters first
    const filtered = data.filter((row) => {
      if (filterProject && row.projectId !== filterProject) return false;
      if (filterStatus && row.publishStatusDictItemId !== filterStatus) return false;
      if (filterMonth && !row.scheduleMonth?.startsWith(filterMonth)) return false;
      return true;
    });

    // Group by projectId + scheduleMonth
    const map = new Map<string, ScheduleVersionRecord[]>();
    for (const v of filtered) {
      const month = v.scheduleMonth?.substring(0, 7) || 'unknown';
      const key = `${v.projectId}::${month}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }

    const groups: VersionGroup[] = [];
    for (const [key, versions] of map) {
      // Sort versions by versionNo descending
      versions.sort((a, b) => b.versionNo - a.versionNo);

      const active = versions.find(v => v.isActive) || null;
      const publishedVersions = versions.filter(v => isPublished(v));
      const draftVersions = versions.filter(v => !isPublished(v));
      const latestPub = publishedVersions.reduce<string | null>((latest, v) => {
        if (!v.publishedAt) return latest;
        if (!latest) return v.publishedAt;
        return v.publishedAt > latest ? v.publishedAt : latest;
      }, null);

      groups.push({
        key,
        projectId: versions[0].projectId,
        projectName: projMap[versions[0].projectId] || versions[0].projectId.substring(0, 8),
        scheduleMonth: versions[0].scheduleMonth?.substring(0, 7) || '',
        versions,
        activeVersion: active,
        latestPublishedAt: latestPub,
        totalCount: versions.length,
        draftCount: draftVersions.length,
        publishedCount: publishedVersions.length,
      });
    }

    // Sort groups: most recent month first
    groups.sort((a, b) => b.scheduleMonth.localeCompare(a.scheduleMonth));

    return groups;
  }, [data, filterProject, filterStatus, filterMonth, projMap, statusMap]);

  const hasFilter = !!(filterProject || filterStatus || filterMonth);
  const totalVersionCount = versionGroups.reduce((s, g) => s + g.totalCount, 0);

  const batchStatusColorMap: Record<string, string> = {
    pending: 'default', processing: 'processing', success: 'success',
    completed: 'success', completed_with_errors: 'warning', failed: 'error',
  };

  function toggleExpand(key: string) {
    setExpandedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  // ====== Render ======
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>排班版本管理</Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button icon={<UploadOutlined />} onClick={() => {
            importForm.setFieldsValue({
              project_id: filterProject,
              import_mode: 'cover_draft',
            });
            setImportFileList([]);
            setImportModalOpen(true);
          }}>导入 Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>新建版本</Button>
        </Space>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          allowClear
          placeholder="按项目筛选"
          style={{ width: 200 }}
          value={filterProject}
          onChange={(v) => setFilterProject(v)}
          options={projects.map((p) => ({ label: p.label, value: p.id }))}
          showSearch
          optionFilterProp="label"
        />
        <Select
          allowClear
          placeholder="按发布状态筛选"
          style={{ width: 150 }}
          value={filterStatus}
          onChange={(v) => setFilterStatus(v)}
          options={statusItems.map((s) => ({ label: s.label, value: s.id }))}
        />
        <DatePicker
          picker="month"
          allowClear
          placeholder="按月份筛选"
          style={{ width: 150 }}
          value={filterMonth ? dayjs(filterMonth + '-01') : null}
          onChange={(v) => setFilterMonth(v ? v.format('YYYY-MM') : undefined)}
        />
        {hasFilter && (
          <Button size="small" onClick={() => { setFilterProject(undefined); setFilterStatus(undefined); setFilterMonth(undefined); }}>清除筛选</Button>
        )}
        {hasFilter && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            已筛选 {totalVersionCount} 个版本 / {versionGroups.length} 个分组
          </Typography.Text>
        )}
      </div>

      {/* ====== Grouped Table ====== */}
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr 120px 200px 160px 200px',
          padding: '10px 16px',
          background: '#fafafa',
          borderBottom: '1px solid #f0f0f0',
          fontWeight: 600,
          fontSize: 13,
          color: '#666',
        }}>
          <div></div>
          <div>项目</div>
          <div>排班月份</div>
          <div>激活版本</div>
          <div>最近发布</div>
          <div>操作</div>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载中...</div>
        )}

        {!loading && versionGroups.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>暂无数据</div>
        )}

        {!loading && versionGroups.map((group) => {
          const isExpanded = expandedKeys.includes(group.key);
          return (
            <div key={group.key}>
              {/* ====== Group Main Row ====== */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 120px 200px 160px 200px',
                  padding: '12px 16px',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                  background: isExpanded ? '#f6f9ff' : '#fff',
                  transition: 'background 0.2s',
                  alignItems: 'center',
                }}
                onClick={() => toggleExpand(group.key)}
              >
                {/* Expand icon */}
                <div style={{ color: '#999', fontSize: 12 }}>
                  {isExpanded ? <DownOutlined /> : <RightOutlined />}
                </div>

                {/* Project name + version count */}
                <div>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{group.projectName}</span>
                  <Tag style={{ marginLeft: 8 }} color="default">{group.totalCount} 个版本</Tag>
                  {group.draftCount > 0 && (
                    <Tag color="orange">{group.draftCount} 草稿</Tag>
                  )}
                </div>

                {/* Month */}
                <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  {group.scheduleMonth}
                </div>

                {/* Active version */}
                <div>
                  {group.activeVersion ? (
                    <Tag color="green" icon={<CheckCircleFilled />} style={{ fontSize: 13 }}>
                      v{group.activeVersion.versionNo} · {group.activeVersion.generationType === 'manual' ? '手工' : group.activeVersion.generationType === 'template' ? '模板' : 'Excel'}
                    </Tag>
                  ) : (
                    <Tag color="default" icon={<ClockCircleOutlined />} style={{ color: '#999' }}>
                      无激活版本
                    </Tag>
                  )}
                </div>

                {/* Latest published time */}
                <div style={{ fontSize: 12, color: '#888' }}>
                  {group.latestPublishedAt
                    ? dayjs(group.latestPublishedAt).format('MM-DD HH:mm')
                    : '-'
                  }
                </div>

                {/* Actions */}
                <div onClick={e => e.stopPropagation()}>
                  <Space size={4}>
                    {group.activeVersion ? (
                      <Button type="primary" size="small" icon={<TableOutlined />} onClick={() => goToMatrix(group.activeVersion!)}>
                        查看矩阵
                      </Button>
                    ) : group.versions[0] ? (
                      <Button size="small" icon={<TableOutlined />} onClick={() => goToMatrix(group.versions[0])}>
                        去排班
                      </Button>
                    ) : null}
                  </Space>
                </div>
              </div>

              {/* ====== Expanded Sub-rows ====== */}
              {isExpanded && (
                <div style={{ background: '#fafbfe' }}>
                  {group.versions.map((record) => {
                    const pub = isPublished(record);
                    const active = isActiveVersion(record);
                    const isArchived = pub && !active;

                    return (
                      <div
                        key={record.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '40px 60px 90px 80px 100px 160px 1fr',
                          padding: '8px 16px',
                          borderBottom: '1px solid #f5f5f5',
                          alignItems: 'center',
                          fontSize: 13,
                          borderLeft: active ? '3px solid #52c41a' : '3px solid transparent',
                          background: active ? '#f6ffed' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        {/* indent */}
                        <div></div>

                        {/* Version No */}
                        <div>
                          <Tag style={{ fontWeight: active ? 600 : 400 }}>v{record.versionNo}</Tag>
                        </div>

                        {/* Generation type */}
                        <div>
                          <Tag color={record.generationType === 'excel' ? 'blue' : record.generationType === 'template' ? 'purple' : 'default'}>
                            {record.generationType === 'manual' ? '手工' : record.generationType === 'template' ? '模板' : 'Excel'}
                          </Tag>
                        </div>

                        {/* Status */}
                        <div>
                          {active ? (
                            <Tag color="green">✓ 生效</Tag>
                          ) : pub ? (
                            <Tag color="default">已归档</Tag>
                          ) : (
                            <Tag color="orange">草稿</Tag>
                          )}
                        </div>

                        {/* Remark */}
                        <div style={{ color: '#999', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {record.remark ? (
                            <Tooltip title={record.remark}>{record.remark}</Tooltip>
                          ) : '-'}
                        </div>

                        {/* Published time */}
                        <div style={{ color: '#888', fontSize: 12 }}>
                          {record.publishedAt ? dayjs(record.publishedAt).format('YYYY-MM-DD HH:mm') : '-'}
                        </div>

                        {/* Actions */}
                        <div>
                          <Space size={4}>
                            <Button
                              type={pub ? 'default' : 'primary'}
                              size="small"
                              icon={<TableOutlined />}
                              onClick={() => goToMatrix(record)}
                            >
                              {pub ? '查看矩阵' : '编辑排班'}
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              icon={<DownloadOutlined />}
                              loading={exportingId === record.id}
                              onClick={() => handleExport(record)}
                            >
                              导出
                            </Button>
                            {!pub && (
                              <Button type="link" size="small" icon={<SendOutlined />} onClick={() => openPublishModal(record)}>发布</Button>
                            )}
                            {isArchived && (
                              <Popconfirm
                                title="确认恢复此版本？"
                                description="恢复后将替换当前生效版本，使此版本成为新的生效版本。"
                                onConfirm={async () => {
                                  try {
                                    await restoreScheduleVersion(record.id);
                                    message.success('版本已恢复为当前生效版本');
                                    await loadData();
                                  } catch (error) {
                                    message.error(getErrorMessage(error, '恢复版本失败'));
                                  }
                                }}
                                okText="确认恢复"
                                cancelText="取消"
                              >
                                <Button type="link" size="small" icon={<UndoOutlined />} style={{ color: '#52c41a' }}>恢复激活</Button>
                              </Popconfirm>
                            )}
                            {!pub && (
                              <Popconfirm
                                title="确认删除此草稿版本？"
                                description="版本及其所有排班数据将被永久删除，不可恢复。"
                                onConfirm={() => handleDelete(record)}
                                okText="确认删除"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                              >
                                <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                              </Popconfirm>
                            )}
                          </Space>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 导入批次 — 折叠收纳 */}
      {batches.length > 0 && (
        <Collapse
          style={{ marginTop: 16 }}
          items={[{
            key: 'import-batches',
            label: <span>最近导入记录 <Tag>{batches.length}</Tag></span>,
            children: (
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
                  { title: '状态', dataIndex: 'processingStatus', render: (value: string) => {
                    const labelMap: Record<string, string> = {
                      pending: '等待中', processing: '处理中', success: '成功',
                      completed: '完成', completed_with_errors: '部分失败', failed: '失败',
                    };
                    return <Tag color={batchStatusColorMap[value]}>{labelMap[value] || value}</Tag>;
                  }},
                  { title: '完成时间', dataIndex: 'completedAt', render: (value?: string | null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
                ]}
              />
            ),
          }]}
        />
      )}

      {/* 新建版本弹窗 */}
      <Modal title="新建排班版本" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="project_id" label="项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select options={projects.map((item) => ({ label: item.label, value: item.id }))} placeholder="选择项目" showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="schedule_month" label="排班月份" rules={[{ required: true, message: '请选择月份' }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选，例如：4月正式排班" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            版本号将由系统自动编号，无需手动填写。
          </Typography.Text>
        </Form>
      </Modal>

      {/* 导入 Excel 弹窗 */}
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
          <Form.Item label="模板">
            <Button
              icon={<DownloadOutlined />}
              onClick={async () => {
                try {
                  const month = importForm.getFieldValue('schedule_month');
                  const monthStr = month ? dayjs(month).format('YYYY-MM-01') : dayjs().format('YYYY-MM-01');
                  const projectId = importForm.getFieldValue('project_id');
                  const projectLabel = projectId ? (projMap[projectId] || '项目') : '项目';
                  const exampleCodes = scheduleCodeItems
                    .filter(item => item.isEnabled)
                    .slice(0, 3)
                    .map(item => item.itemName);

                  // 查询项目下的员工和当前排班数据
                  let employeeRows: Array<{ employeeName: string; codesByDate: Record<string, string> }> | undefined;
                  if (projectId) {
                    const { supabase } = await import('@/app/lib/supabase/client');

                    // 查激活版本
                    const { data: versions } = await supabase
                      .from('schedule_version')
                      .select('id')
                      .eq('project_id', projectId)
                      .eq('is_active', true)
                      .limit(1);
                    const versionId = versions?.[0]?.id;

                    // 查项目关联的员工
                    const { data: projEmps } = await supabase
                      .from('project_employee')
                      .select('employee_id, employee:employee_id(id, full_name, employee_no)')
                      .eq('project_id', projectId);

                    // 查编码名称映射
                    const { data: dictItems } = await supabase
                      .from('dict_item')
                      .select('id, item_name');
                    const codeMap = new Map<string, string>((dictItems || []).map((d: any) => [d.id, d.item_name]));

                    if (projEmps && projEmps.length > 0) {
                      const empIds = projEmps.map((pe: any) => pe.employee_id);

                      // 如果有激活版本，查排班数据
                      let scheduleMap = new Map<string, Record<string, string>>();
                      if (versionId) {
                        const { data: schedules } = await supabase
                          .from('schedule')
                          .select('employee_id, schedule_date, schedule_code_dict_item_id')
                          .eq('schedule_version_id', versionId)
                          .in('employee_id', empIds);

                        (schedules || []).forEach((s: any) => {
                          if (!scheduleMap.has(s.employee_id)) scheduleMap.set(s.employee_id, {});
                          const codeName = codeMap.get(s.schedule_code_dict_item_id) || '';
                          if (codeName) scheduleMap.get(s.employee_id)![s.schedule_date] = codeName;
                        });
                      }

                      employeeRows = projEmps.map((pe: any) => ({
                        employeeName: pe.employee?.full_name || '未知',
                        codesByDate: scheduleMap.get(pe.employee_id) || {},
                      }));
                    }
                  }

                  const buffer = buildScheduleImportTemplate(monthStr, projectLabel, exampleCodes, employeeRows);
                  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                  const href = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = href;
                  a.download = `排班导入模板_${dayjs(monthStr).format('YYYY年M月')}.xlsx`;
                  a.click();
                  URL.revokeObjectURL(href);
                } catch (e) {
                  console.error('下载模板失败:', e);
                  message.error('下载模板失败');
                }
              }}
            >
              下载导入模板
            </Button>
          </Form.Item>
          <Typography.Text type="secondary">
            支持两种格式：① 项目排班表格式（标题行 / 日期数字行 / 星期行 / 姓名+排班码）② 旧格式（工号 | 姓名 | 部门 | 日期列）
          </Typography.Text>
        </Form>
      </Modal>

      {/* 发布确认弹窗 */}
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
          <Typography.Text type="warning" style={{ display: 'block', marginBottom: 16 }}>
            ⚠️ 发布后将替换当前生效的排班数据。旧版本的排班记录将被清除，员工小程序将同步显示新版本的排班。
          </Typography.Text>
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
