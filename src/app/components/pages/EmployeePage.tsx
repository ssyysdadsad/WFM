import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, Space, Typography, message, Tag, Drawer, Descriptions, InputNumber, Switch } from 'antd';
import { PlusOutlined, EditOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { useDict } from '@/app/hooks/useDict';
import { addEmployeeSkill, listEmployeeSkills } from '@/app/services/employee-skill.service';
import {
  listChannelOptions,
  listDepartmentOptions,
  listEmployeeRecords,
  listSkillOptions,
  saveEmployeeRecord,
} from '@/app/services/master-data.service';
import type {
  EmployeeFormValues,
  EmployeeRecord,
  EmployeeSkillFormValues,
  EmployeeSkillRecord,
  ReferenceOption,
} from '@/app/types/master-data';

export function EmployeePage() {
  const [data, setData] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const [departments, setDepartments] = useState<ReferenceOption[]>([]);
  const [channels, setChannels] = useState<ReferenceOption[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<EmployeeRecord | null>(null);
  const [employeeSkills, setEmployeeSkills] = useState<EmployeeSkillRecord[]>([]);
  const [skillModal, setSkillModal] = useState(false);
  const [skillForm] = Form.useForm();
  const [allSkills, setAllSkills] = useState<ReferenceOption[]>([]);
  const { items: statusItems } = useDict('employee_status');

  useEffect(() => {
    loadData();
    loadRefs();
  }, []);

  async function loadRefs() {
    try {
      const [departmentOptions, channelOptions, skillOptions] = await Promise.all([
        listDepartmentOptions(),
        listChannelOptions(),
        listSkillOptions(),
      ]);
      setDepartments(departmentOptions);
      setChannels(channelOptions);
      setAllSkills(skillOptions);
    } catch (error) {
      message.error(getErrorMessage(error, '加载员工关联数据失败'));
    }
  }

  async function loadData(keyword = search) {
    setLoading(true);
    try {
      const rows = await listEmployeeRecords(keyword);
      setData(rows);
    } catch (error) {
      message.error(getErrorMessage(error, '加载员工列表失败'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      const payload: EmployeeFormValues = {
        employeeNo: values.employee_no,
        fullName: values.full_name,
        mobileNumber: values.mobile_number,
        departmentId: values.department_id,
        channelId: values.channel_id,
        onboardDate: values.onboard_date ? dayjs(values.onboard_date).format('YYYY-MM-DD') : null,
        employeeStatusDictItemId: values.employee_status_dict_item_id ?? null,
        remark: values.remark ?? null,
      };
      await saveEmployeeRecord(payload, editing?.id);
      message.success(editing ? '更新成功' : '创建成功');
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '保存员工失败'));
    }
  }

  async function openDetail(record: EmployeeRecord) {
    setDetailRecord(record);
    setDetailOpen(true);
    try {
      const rows = await listEmployeeSkills(record.id);
      setEmployeeSkills(rows);
    } catch (error) {
      message.error(getErrorMessage(error, '加载员工技能失败'));
    }
  }

  async function addSkill() {
    try {
      if (!detailRecord) {
        return;
      }

      const values = await skillForm.validateFields();
      const payload: EmployeeSkillFormValues = {
        skillId: values.skill_id,
        skillLevel: values.skill_level,
        efficiencyCoefficient: values.efficiency_coefficient,
        isPrimary: values.is_primary,
        isEnabled: values.is_enabled,
      };
      await addEmployeeSkill(detailRecord.id, payload);
      message.success('技能添加成功');
      skillForm.resetFields();
      setSkillModal(false);
      const rows = await listEmployeeSkills(detailRecord.id);
      setEmployeeSkills(rows);
    } catch (error) {
      message.error(getErrorMessage(error, '添加员工技能失败'));
    }
  }

  const deptMap = useMemo(() => Object.fromEntries(departments.map((item) => [item.id, item.label])), [departments]);
  const chMap = useMemo(() => Object.fromEntries(channels.map((item) => [item.id, item.label])), [channels]);
  const statusMap = useMemo(() => Object.fromEntries(statusItems.map((item) => [item.id, item.itemName])), [statusItems]);
  const skillMap = useMemo(() => Object.fromEntries(allSkills.map((item) => [item.id, item.label])), [allSkills]);
  const levelMap: Record<number, string> = { 1: '初级', 2: '中级', 3: '高级' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>员工管理</Typography.Title>
        <Space>
          <Input.Search
            placeholder="搜索姓名"
            allowClear
            style={{ width: 200 }}
            onSearch={(value) => {
              setSearch(value);
              loadData(value);
            }}
            onChange={(event) => {
              if (!event.target.value) {
                setSearch('');
                loadData('');
              }
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>新增</Button>
        </Space>
      </div>
      <Table rowKey="id" loading={loading} dataSource={data} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: '工号', dataIndex: 'employeeNo', width: 80 },
          { title: '姓名', dataIndex: 'fullName', width: 80 },
          { title: '手机号', dataIndex: 'mobileNumber', width: 120 },
          { title: '部门', dataIndex: 'departmentId', width: 100, render: (value: string) => deptMap[value] || '-' },
          { title: '渠道', dataIndex: 'channelId', width: 100, render: (value: string) => chMap[value] || '-' },
          { title: '入职日期', dataIndex: 'onboardDate', width: 100 },
          { title: '状态', dataIndex: 'employeeStatusDictItemId', width: 80, render: (value?: string | null) => <Tag>{value ? statusMap[value] || '-' : '-'}</Tag> },
          { title: '操作', key: 'action', width: 120, render: (_: unknown, record: EmployeeRecord) => (
            <Space>
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => {
                setEditing(record);
                form.setFieldsValue({
                  employee_no: record.employeeNo,
                  full_name: record.fullName,
                  mobile_number: record.mobileNumber,
                  department_id: record.departmentId,
                  channel_id: record.channelId,
                  onboard_date: record.onboardDate ? dayjs(record.onboardDate) : undefined,
                  employee_status_dict_item_id: record.employeeStatusDictItemId ?? undefined,
                  remark: record.remark,
                });
                setModalOpen(true);
              }}>编辑</Button>
            </Space>
          )},
        ]}
      />

      <Modal title={editing ? '编辑员工' : '新增员工'} open={modalOpen} onOk={handleSave} onCancel={() => { setModalOpen(false); form.resetFields(); }} destroyOnClose width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="employee_no" label="工号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="full_name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="mobile_number" label="手机号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="department_id" label="部门" rules={[{ required: true }]}>
            <Select options={departments.map((item) => ({ label: item.label, value: item.id }))} placeholder="选择部门" />
          </Form.Item>
          <Form.Item name="channel_id" label="渠道" rules={[{ required: true }]}>
            <Select options={channels.map((item) => ({ label: item.label, value: item.id }))} placeholder="选择渠道" />
          </Form.Item>
          <Form.Item name="onboard_date" label="入职日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="employee_status_dict_item_id" label="状态">
            <Select options={statusItems.map((item) => ({ label: item.itemName, value: item.id }))} placeholder="选择状态" showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={`员工详情 - ${detailRecord?.fullName || ''}`} open={detailOpen} onClose={() => setDetailOpen(false)} width={600}>
        {detailRecord && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="工号">{detailRecord.employeeNo}</Descriptions.Item>
              <Descriptions.Item label="姓名">{detailRecord.fullName}</Descriptions.Item>
              <Descriptions.Item label="手机号">{detailRecord.mobileNumber}</Descriptions.Item>
              <Descriptions.Item label="部门">{deptMap[detailRecord.departmentId] || '-'}</Descriptions.Item>
              <Descriptions.Item label="渠道">{chMap[detailRecord.channelId] || '-'}</Descriptions.Item>
              <Descriptions.Item label="入职日期">{detailRecord.onboardDate || '-'}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Title level={5}>技能列表</Typography.Title>
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { skillForm.resetFields(); setSkillModal(true); }}>添加技能</Button>
            </div>
            <Table rowKey="id" size="small" dataSource={employeeSkills} pagination={false}
              columns={[
                { title: '技能', dataIndex: 'skillId', render: (value: string) => skillMap[value] || value?.substring(0, 8) },
                { title: '级别', dataIndex: 'skillLevel', render: (value: number) => <Tag color={value === 3 ? 'gold' : value === 2 ? 'blue' : 'default'}>{levelMap[value] || value}</Tag> },
                { title: '效率系数', dataIndex: 'efficiencyCoefficient' },
                { title: '主技能', dataIndex: 'isPrimary', render: (value: boolean) => value ? <Tag color="green">是</Tag> : '否' },
                { title: '状态', dataIndex: 'isEnabled', render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag> },
              ]}
            />
          </>
        )}
      </Drawer>

      <Modal title="添加技能" open={skillModal} onOk={addSkill} onCancel={() => setSkillModal(false)} destroyOnClose>
        <Form form={skillForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="skill_id" label="技能" rules={[{ required: true }]}>
            <Select options={allSkills.map((item) => ({ label: item.label, value: item.id }))} placeholder="选择技能" />
          </Form.Item>
          <Form.Item name="skill_level" label="技能级别" rules={[{ required: true }]}>
            <Select options={[{ label: '初级', value: 1 }, { label: '中级', value: 2 }, { label: '高级', value: 3 }]} />
          </Form.Item>
          <Form.Item name="efficiency_coefficient" label="效率系数" rules={[{ required: true }]} initialValue={1.0}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
          </Form.Item>
          <Form.Item name="is_primary" label="主技能" valuePropName="checked" initialValue={false}><Switch /></Form.Item>
          <Form.Item name="is_enabled" label="启用" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
