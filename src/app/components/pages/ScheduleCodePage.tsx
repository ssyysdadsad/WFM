import React, { useCallback, useEffect, useState } from 'react';
import {
  Typography, Button, Drawer, Form, Input, InputNumber, Select, Switch,
  TimePicker, Space, message, Tag, Popconfirm, Empty, Spin, Row, Col,
  Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  ClockCircleOutlined, CheckOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../supabase';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { invalidateDictCache } from '@/app/hooks/useDict';

/* ── 预设色板（与 DictPage 保持一致） ── */
const PRESET_COLORS = [
  { color: '#10B981', label: '翠绿' }, { color: '#34D399', label: '薄荷' },
  { color: '#6EE7B7', label: '浅绿' }, { color: '#DEF1EA', label: '淡青' },
  { color: '#3B82F6', label: '蔚蓝' }, { color: '#60A5FA', label: '天蓝' },
  { color: '#93C5FD', label: '浅蓝' }, { color: '#DBEAFE', label: '冰蓝' },
  { color: '#9CA3AF', label: '银灰' }, { color: '#D1D5DB', label: '浅灰' },
  { color: '#8B5CF6', label: '紫罗兰' }, { color: '#C4B5FD', label: '淡紫' },
  { color: '#F59E0B', label: '琥珀' }, { color: '#FCD34D', label: '金黄' },
  { color: '#FBBF24', label: '向日葵' }, { color: '#FDE68A', label: '淡黄' },
  { color: '#EF4444', label: '红色' }, { color: '#F87171', label: '浅红' },
  { color: '#FB923C', label: '橙色' }, { color: '#FDBA74', label: '浅橙' },
  { color: '#EC4899', label: '粉红' }, { color: '#F9A8D4', label: '浅粉' },
  { color: '#14B8A6', label: '青绿' }, { color: '#5EEAD4', label: '浅青' },
];

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function ColorPalettePicker({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const currentColor = typeof value === 'string' ? value : (value as any)?.toHexString?.() || '#10B981';
  const isPreset = PRESET_COLORS.some(p => p.color.toLowerCase() === currentColor.toLowerCase());
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
        padding: 8, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0', marginBottom: 8,
      }}>
        {PRESET_COLORS.map(p => {
          const selected = p.color.toLowerCase() === currentColor.toLowerCase();
          return (
            <Tooltip key={p.color} title={p.label} placement="top">
              <div
                onClick={() => onChange?.(p.color)}
                style={{
                  width: 28, height: 28, borderRadius: 6, background: p.color,
                  cursor: 'pointer', border: selected ? '2px solid #1677ff' : '1px solid rgba(0,0,0,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                  boxShadow: selected ? '0 0 0 2px rgba(22,119,255,0.2)' : 'none',
                }}
              >
                {selected && <CheckOutlined style={{ color: isLightColor(p.color) ? '#333' : '#fff', fontSize: 12 }} />}
              </div>
            </Tooltip>
          );
        })}
      </div>
      {!isPreset && <Tag color="gold" style={{ fontSize: 11 }}>自定义颜色</Tag>}
    </div>
  );
}

/* ── 类别映射 ── */
const CATEGORY_MAP: Record<string, { label: string; color: string; emoji: string }> = {
  work: { label: '工作', color: '#10B981', emoji: '💼' },
  rest: { label: '休息', color: '#9CA3AF', emoji: '😴' },
  leave: { label: '请假', color: '#F59E0B', emoji: '🏖️' },
  training: { label: '培训', color: '#8B5CF6', emoji: '📚' },
};

interface ScheduleCode {
  id: string;
  dictTypeId: string;
  itemCode: string;
  itemName: string;
  isEnabled: boolean;
  extraConfig: {
    color?: string;
    category?: string;
    start_time?: string;
    end_time?: string;
    standard_hours?: number;
    count_as_hours?: boolean;
    excel_code?: string;
    aliases?: string[];
    allow_empty_task?: boolean;
    allow_empty_device?: boolean;
  };
}

export function ScheduleCodePage() {
  const [codes, setCodes] = useState<ScheduleCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [dictTypeId, setDictTypeId] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      // 先获取 schedule_code 的 dict_type_id
      const { data: dt, error: dtErr } = await supabase
        .from('dict_type')
        .select('id')
        .eq('type_code', 'schedule_code')
        .single();
      if (dtErr || !dt) throw new Error('未找到排班编码字典类型');
      setDictTypeId(dt.id);

      const { data, error } = await supabase
        .from('dict_item')
        .select('*')
        .eq('dict_type_id', dt.id)
        .order('sort_order')
        .order('item_code');
      if (error) throw error;

      setCodes((data || []).map((r: any) => ({
        id: r.id,
        dictTypeId: r.dict_type_id,
        itemCode: r.item_code,
        itemName: r.item_name,
        isEnabled: r.is_enabled,
        extraConfig: r.extra_config || {},
      })));
    } catch (e) {
      message.error(getErrorMessage(e, '加载排班编码失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      category: 'work',
      count_as_hours: true,
      standard_hours: 8,
      start_time: dayjs('09:00', 'HH:mm'),
      end_time: dayjs('18:00', 'HH:mm'),
      color: '#10B981',
      allow_empty_task: true,
      allow_empty_device: true,
      is_enabled: true,
    });
    setDrawerOpen(true);
  };

  const openEdit = (code: ScheduleCode) => {
    setEditing(code);
    const ec = code.extraConfig;
    form.setFieldsValue({
      item_name: code.itemName,
      item_code: code.itemCode,
      excel_code: ec.excel_code || '',
      aliases: ec.aliases || [],
      category: ec.category || 'work',
      start_time: ec.start_time ? dayjs(ec.start_time, 'HH:mm') : null,
      end_time: ec.end_time ? dayjs(ec.end_time, 'HH:mm') : null,
      standard_hours: ec.standard_hours ?? 8,
      count_as_hours: ec.count_as_hours ?? true,
      color: ec.color || '#10B981',
      allow_empty_task: ec.allow_empty_task ?? true,
      allow_empty_device: ec.allow_empty_device ?? true,
      is_enabled: code.isEnabled,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!dictTypeId) return;
      setSaving(true);

      const extraConfig = {
        excel_code: values.excel_code || null,
        aliases: values.aliases || [],
        category: values.category || null,
        count_as_hours: values.count_as_hours,
        standard_hours: values.standard_hours,
        start_time: values.start_time ? values.start_time.format('HH:mm') : null,
        end_time: values.end_time ? values.end_time.format('HH:mm') : null,
        planned_hours: values.standard_hours,
        color: typeof values.color === 'string' ? values.color : (values.color?.toHexString() || '#10B981'),
        allow_empty_task: values.allow_empty_task,
        allow_empty_device: values.allow_empty_device,
      };

      const row = {
        dict_type_id: dictTypeId,
        item_code: editing ? values.item_code : (values.item_code || `SC_${Date.now().toString(36).toUpperCase()}`),
        item_name: values.item_name,
        extra_config: extraConfig,
        is_enabled: values.is_enabled,
      };

      if (editing) {
        const { error } = await supabase.from('dict_item').update(row).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dict_item').insert(row);
        if (error) throw error;
      }

      invalidateDictCache('schedule_code');
      message.success(editing ? '编码已更新' : '编码已创建');
      setDrawerOpen(false);
      await loadCodes();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(getErrorMessage(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (code: ScheduleCode) => {
    try {
      const { error } = await supabase.from('dict_item').delete().eq('id', code.id);
      if (error) throw error;
      invalidateDictCache('schedule_code');
      message.success(`已删除「${code.itemName}」`);
      await loadCodes();
    } catch (e) {
      message.error(getErrorMessage(e, '删除失败'));
    }
  };

  return (
    <div>
      {/* 顶栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>排班编码管理</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            定义排班矩阵中使用的班次编码，包括颜色、时间段和工时配置
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadCodes}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增编码</Button>
        </Space>
      </div>

      {/* 编码卡片网格 */}
      <Spin spinning={loading}>
        {codes.length === 0 && !loading ? (
          <Empty description="暂无排班编码" style={{ padding: 60 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建第一个编码</Button>
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {codes.map(code => {
              const ec = code.extraConfig;
              const color = ec.color || '#d9d9d9';
              const cat = CATEGORY_MAP[ec.category || ''] || { label: ec.category || '未分类', color: '#999', emoji: '📋' };
              const light = isLightColor(color);

              return (
                <Col key={code.id} xs={24} sm={12} md={8} lg={6} xl={6}>
                  <div
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: '1px solid #f0f0f0',
                      background: '#fff',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      position: 'relative',
                      opacity: code.isEnabled ? 1 : 0.5,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                      (e.currentTarget as HTMLDivElement).style.transform = 'none';
                    }}
                    onClick={() => openEdit(code)}
                  >
                    {/* 顶部色条 + 编码名 */}
                    <div style={{
                      background: color,
                      padding: '20px 16px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{
                        fontSize: 28,
                        fontWeight: 800,
                        color: light ? '#1a1a1a' : '#ffffff',
                        letterSpacing: 1,
                        textShadow: light ? 'none' : '0 1px 2px rgba(0,0,0,0.2)',
                      }}>
                        {code.itemName}
                      </div>
                      <div style={{
                        background: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.2)',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: light ? '#333' : '#fff',
                      }}>
                        {cat.emoji} {cat.label}
                      </div>
                    </div>

                    {/* 详细信息 */}
                    <div style={{ padding: '14px 16px 16px' }}>
                      {/* 时间段 */}
                      {ec.category !== 'rest' && ec.start_time && ec.end_time ? (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          marginBottom: 10, fontSize: 14, color: '#333',
                        }}>
                          <ClockCircleOutlined style={{ color: '#999', fontSize: 14 }} />
                          <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 15 }}>
                            {ec.start_time}
                          </span>
                          <span style={{ color: '#ccc' }}>—</span>
                          <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 15 }}>
                            {ec.end_time}
                          </span>
                        </div>
                      ) : (
                        <div style={{ marginBottom: 10, fontSize: 13, color: '#bbb' }}>
                          <ClockCircleOutlined style={{ marginRight: 6 }} />
                          不设时间
                        </div>
                      )}

                      {/* 工时 + 状态 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{
                          display: 'flex', alignItems: 'baseline', gap: 4,
                        }}>
                          <span style={{ fontSize: 22, fontWeight: 700, color: color }}>
                            {ec.standard_hours ?? 0}
                          </span>
                          <span style={{ fontSize: 12, color: '#999' }}>小时/天</span>
                        </div>
                        <Space size={4}>
                          {!code.isEnabled && <Tag color="red" style={{ margin: 0 }}>停用</Tag>}
                          {ec.count_as_hours === false && (
                            <Tooltip title="不计入工时统计">
                              <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>不计工时</Tag>
                            </Tooltip>
                          )}
                        </Space>
                      </div>

                      {/* 操作按钮 */}
                      <div style={{
                        display: 'flex', justifyContent: 'flex-end', gap: 4,
                        marginTop: 12, paddingTop: 10, borderTop: '1px solid #f5f5f5',
                      }}>
                        <Button
                          type="text" size="small" icon={<EditOutlined />}
                          onClick={e => { e.stopPropagation(); openEdit(code); }}
                        >
                          编辑
                        </Button>
                        <Popconfirm
                          title="确认删除"
                          description={`删除编码「${code.itemName}」？已排班记录不受影响。`}
                          onConfirm={e => { e?.stopPropagation(); handleDelete(code); }}
                          onCancel={e => e?.stopPropagation()}
                          okText="删除" okType="danger" cancelText="取消"
                        >
                          <Button
                            type="text" size="small" danger icon={<DeleteOutlined />}
                            onClick={e => e.stopPropagation()}
                          >
                            删除
                          </Button>
                        </Popconfirm>
                      </div>
                    </div>
                  </div>
                </Col>
              );
            })}
          </Row>
        )}
      </Spin>

      {/* 编辑/新增抽屉 */}
      <Drawer
        title={editing ? `编辑编码 — ${editing.itemName}` : '新增排班编码'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSave} loading={saving}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {/* 基本信息 */}
          <div style={{
            background: '#f5f7fa', borderRadius: 10, padding: 16, marginBottom: 20,
          }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: '#333' }}>
              基本信息
            </Typography.Text>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="item_name" label="编码名称" rules={[{ required: true, message: '请输入编码名称' }]}>
                  <Input placeholder="如 A1、B2、休" maxLength={20} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="category" label="类别" rules={[{ required: true }]}>
                  <Select options={[
                    { label: '💼 工作', value: 'work' },
                    { label: '😴 休息', value: 'rest' },
                    { label: '🏖️ 请假', value: 'leave' },
                    { label: '📚 培训', value: 'training' },
                  ]} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="excel_code" label="Excel识别码">
                  <Input placeholder="用于导入识别" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="is_enabled" label="状态" valuePropName="checked">
                  <Switch checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
              </Col>
            </Row>
            {editing && (
              <Form.Item name="item_code" label="系统编码" style={{ marginBottom: 0 }}>
                <Input disabled style={{ color: '#666', backgroundColor: '#eee', fontSize: 12 }} />
              </Form.Item>
            )}
          </div>

          {/* 时间与工时 */}
          <div style={{
            background: '#f5f7fa', borderRadius: 10, padding: 16, marginBottom: 20,
          }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: '#333' }}>
              ⏰ 时间与工时
            </Typography.Text>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="start_time" label="上班时间">
                  <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="开始" onChange={(val) => {
                    const endTime = form.getFieldValue('end_time');
                    if (val && endTime) {
                      const diff = endTime.diff(val, 'minute');
                      const hours = Math.round((diff > 0 ? diff : diff + 1440) / 30) * 0.5;
                      form.setFieldValue('standard_hours', hours);
                    }
                  }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="end_time" label="下班时间">
                  <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="结束" onChange={(val) => {
                    const startTime = form.getFieldValue('start_time');
                    if (startTime && val) {
                      const diff = val.diff(startTime, 'minute');
                      const hours = Math.round((diff > 0 ? diff : diff + 1440) / 30) * 0.5;
                      form.setFieldValue('standard_hours', hours);
                    }
                  }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="standard_hours" label="标准工时" rules={[{ required: true, message: '请输入' }]}>
                  <InputNumber min={0} max={24} step={0.5} style={{ width: '100%' }} addonAfter="h" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="count_as_hours" label="是否计入工时统计" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren="计入" unCheckedChildren="不计" />
            </Form.Item>
          </div>

          {/* 外观 */}
          <div style={{
            background: '#f5f7fa', borderRadius: 10, padding: 16, marginBottom: 20,
          }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: '#333' }}>
              🎨 显示颜色
            </Typography.Text>
            <Form.Item name="color" style={{ marginBottom: 0 }}>
              <ColorPalettePicker />
            </Form.Item>
          </div>

          {/* 高级设置 */}
          <div style={{
            background: '#f5f7fa', borderRadius: 10, padding: 16,
          }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: '#333' }}>
              ⚙️ 高级设置
            </Typography.Text>
            <Form.Item name="aliases" label="同义别名（回车添加）">
              <Select mode="tags" placeholder="例如: 早班, 捕1" open={false} />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="allow_empty_task" label="允许空任务" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="allow_empty_device" label="允许空设备" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
