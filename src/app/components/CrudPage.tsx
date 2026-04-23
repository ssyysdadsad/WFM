import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Space, Typography, message, Popconfirm, Tag, DatePicker, InputNumber, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { supabase } from './supabase';
import dayjs from 'dayjs';
import { getErrorMessage } from '@/app/lib/supabase/errors';

export interface ColumnConfig {
  key: string;
  title: string;
  type?: 'text' | 'number' | 'boolean' | 'select' | 'date' | 'textarea' | 'tag';
  options?: { label: string; value: any }[];
  required?: boolean;
  hideInTable?: boolean;
  hideInForm?: boolean;
  width?: number;
  initialValue?: any;
  render?: (value: any, record: any) => React.ReactNode;
  foreignTable?: string;
  foreignLabel?: string;
  /** 自动编码前缀。设置后新建时自动生成编码(隐藏输入框)，编辑时只读展示。格式: PREFIX-YYYYMMDD-XXXX */
  /** 如果关联表是 dict_item，可通过此项限制只查特定类型（对应 dict_type 的 type_code） */
  dictType?: string;
  /** 是否在工具栏显示筛选下拉框（支持 select 或 foreignTable） */
  filterable?: boolean;
}

function generateAutoCode(prefix: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${y}${m}${d}-${rand}`;
}

interface CrudPageProps {
  title: string;
  tableName: string;
  columns: ColumnConfig[];
  defaultSort?: string;
  searchField?: string;
  extraFilters?: Record<string, any>;
  selectQuery?: string;
  renderExtraFilters?: () => React.ReactNode;
  service?: {
    list: (options: {
      page: number;
      pageSize: number;
      search?: string;
      searchField?: string;
      defaultSort?: string;
      extraFilters?: Record<string, any>;
      selectQuery?: string;
    }) => Promise<{ data: any[]; total: number }>;
    save: (values: Record<string, any>, editingId?: string) => Promise<void>;
    loadForeignData?: (columns: ColumnConfig[]) => Promise<Record<string, any[]>>;
  };
}

export function CrudPage({ title, tableName, columns, defaultSort = 'created_at', searchField, extraFilters, selectQuery, renderExtraFilters, service }: CrudPageProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [form] = Form.useForm();
  const [foreignData, setForeignData] = useState<Record<string, any[]>>({});
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const loadForeignData = useCallback(async () => {
    if (service?.loadForeignData) {
      try {
        const results = await service.loadForeignData(columns);
        setForeignData(results);
      } catch (error) {
        message.error(getErrorMessage(error, '加载关联选项失败'));
      }
      return;
    }

    const foreignCols = columns.filter(c => c.foreignTable);
    const results: Record<string, any[]> = {};
    await Promise.all(
      foreignCols.map(async (col) => {
        let query = supabase.from(col.foreignTable!);
        if (col.foreignTable === 'dict_item' && col.dictType) {
          query = query.select(`id, ${col.foreignLabel || 'id'}, dict_type!inner(type_code)`).eq('dict_type.type_code', col.dictType);
        } else {
          query = query.select(`id, ${col.foreignLabel || 'id'}`);
        }
        const { data } = await query.limit(500);
        results[col.key] = data || [];
      })
    );
    setForeignData(results);
  }, [columns]);

  const loadData = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const combinedFilters: Record<string, any> = { ...extraFilters };
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          combinedFilters[k] = v;
        }
      });

      if (service) {
        const result = await service.list({
          page,
          pageSize,
          search,
          searchField,
          defaultSort,
          extraFilters: combinedFilters,
          selectQuery,
        });
        setData(result.data || []);
        setPagination(prev => ({ ...prev, current: page, pageSize, total: result.total || 0 }));
        return;
      }

      let query = supabase.from(tableName).select(selectQuery || '*', { count: 'exact' });
      
      if (Object.keys(combinedFilters).length > 0) {
        Object.entries(combinedFilters).forEach(([k, v]) => {
          query = query.eq(k, v);
        });
      }
      
      if (search && searchField) {
        query = query.ilike(searchField, `%${search}%`);
      }
      
      const { data, count, error } = await query
        .order(defaultSort, { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      
      if (error) {
        console.error(`Error loading ${tableName}:`, error);
        // If sort column doesn't exist, retry without sort
        if (error.message?.includes(defaultSort) || error.code === '42703') {
          console.warn(`Sort column "${defaultSort}" not found in "${tableName}", retrying without sort`);
          const retryQuery = supabase.from(tableName).select(selectQuery || '*', { count: 'exact' });
          if (Object.keys(combinedFilters).length > 0) Object.entries(combinedFilters).forEach(([k, v]) => { retryQuery.eq(k, v); });
          if (search && searchField) retryQuery.ilike(searchField, `%${search}%`);
          const retryRes = await retryQuery.range((page - 1) * pageSize, page * pageSize - 1);
          if (retryRes.error) {
            message.error(`加载失败: ${retryRes.error.message}`);
          } else {
            setData(retryRes.data || []);
            setPagination(prev => ({ ...prev, current: page, pageSize, total: retryRes.count || 0 }));
          }
        } else {
          message.error(`加载失败: ${error.message}`);
        }
      } else {
        setData(data || []);
        setPagination(prev => ({ ...prev, current: page, pageSize, total: count || 0 }));
      }
    } catch (e) {
      console.error(e);
      message.error(getErrorMessage(e, '加载数据失败'));
    } finally {
      setLoading(false);
    }
  }, [tableName, search, searchField, defaultSort, extraFilters, filters, selectQuery, service]);

  useEffect(() => {
    loadData();
    loadForeignData();
  }, [loadData, loadForeignData]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      // Convert date fields
      columns.forEach(col => {
        if (col.type === 'date' && values[col.key]) {
          values[col.key] = dayjs(values[col.key]).format('YYYY-MM-DD');
        }
      });
      // Auto-generate codes for new records
      if (!editing) {
        columns.forEach(col => {
          if (col.autoCode && !values[col.key]) {
            values[col.key] = generateAutoCode(col.autoCode);
          }
        });
      }


      if (service) {
        await service.save(values, editing?.id);
      } else {
        if (editing) {
          const { error } = await supabase.from(tableName).update(values).eq('id', editing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from(tableName).insert(values);
          if (error) throw error;
        }
      }
      message.success(editing ? '更新成功' : '创建成功');
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      loadData(pagination.current, pagination.pageSize);
    } catch (e: any) {
      if (e.errorFields) {
        // Validation error occurred, form handles the UI
        return;
      }
      message.error(getErrorMessage(e, '操作失败'));
    }
  };

  const openEdit = (record: any) => {
    setEditing(record);
    const formValues: any = {};
    columns.forEach(col => {
      if (!col.hideInForm) {
        if (col.type === 'date' && record[col.key]) {
          formValues[col.key] = dayjs(record[col.key]);
        } else {
          formValues[col.key] = record[col.key];
        }
      }
    });
    form.setFieldsValue(formValues);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleDelete = async (record: any) => {
    try {
      if (service) {
        // 如果 service 提供了 delete 方法则调用，否则直接用 supabase
        const svc = service as any;
        if (typeof svc.delete === 'function') {
          await svc.delete(record.id);
        } else {
          const { error } = await supabase.from(tableName).delete().eq('id', record.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from(tableName).delete().eq('id', record.id);
        if (error) throw error;
      }
      message.success('删除成功');
      loadData(pagination.current, pagination.pageSize);
    } catch (e) {
      message.error(getErrorMessage(e, '删除失败'));
    }
  };

  const tableColumns = columns
    .filter(c => !c.hideInTable)
    .map(col => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      width: col.width,
      ellipsis: true,
      render: col.render || ((value: any) => {
        if (col.type === 'boolean') return value ? <Tag color="green">是</Tag> : <Tag color="red">否</Tag>;
        if (col.type === 'tag') return value ? <Tag color="blue">{value}</Tag> : '-';
        if (col.type === 'select' && col.options) {
          const opt = col.options.find(o => o.value === value);
          return opt ? opt.label : value;
        }
        if (col.foreignTable && foreignData[col.key]) {
          const item = foreignData[col.key].find((f: any) => f.id === value);
          return item ? item[col.foreignLabel || 'id'] : (value ? String(value).substring(0, 8) : '-');
        }
        if (value === null || value === undefined) return '-';
        if (typeof value === 'string' && value.length > 50) return value.substring(0, 50) + '...';
        return String(value);
      }),
    }));

  tableColumns.push({
    title: '操作',
    key: 'action',
    dataIndex: 'action',
    width: 150,
    ellipsis: false,
    render: (_: any, record: any) => (
      <Space size={0}>
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
        <Popconfirm
          title="确认删除"
          description="删除后无法恢复，确认继续？"
          okText="删除"
          okType="danger"
          cancelText="取消"
          onConfirm={() => handleDelete(record)}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </Space>
    ),
  });

  const formItems = columns.filter(c => {
    if (c.hideInForm) return false;
    // autoCode 字段在创建模式下隐藏
    if (c.autoCode && !editing) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{title}</Typography.Title>
        <Space wrap>
          {columns.filter(c => c.filterable).map(col => {
            if (col.type === 'select' && col.options) {
              return (
                <Select
                  key={col.key}
                  placeholder={`按${col.title}筛选`}
                  allowClear
                  style={{ width: 150 }}
                  value={filters[col.key]}
                  onChange={v => setFilters(prev => ({ ...prev, [col.key]: v }))}
                  options={col.options}
                />
              );
            }
            if (col.foreignTable) {
              return (
                <Select
                  key={col.key}
                  placeholder={`按${col.title}筛选`}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 150 }}
                  value={filters[col.key]}
                  onChange={v => setFilters(prev => ({ ...prev, [col.key]: v }))}
                  options={(foreignData[col.key] || []).map((item: any) => ({
                    label: item[col.foreignLabel || 'id'],
                    value: item.id,
                  }))}
                />
              );
            }
            return null;
          })}
          {renderExtraFilters?.()}
          {searchField && (
            <Input.Search
              placeholder="搜索..."
              allowClear
              style={{ width: 200 }}
              onSearch={(v) => { setSearch(v); }}
              prefix={<SearchOutlined />}
            />
          )}
          <Button icon={<ReloadOutlined />} onClick={() => loadData(1, pagination.pageSize)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={tableColumns}
        size="small"
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <div style={{ padding: 24 }}><div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>暂无数据</div><Button type="link" icon={<PlusOutlined />} onClick={openCreate}>点击新增</Button></div> }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) => loadData(page, pageSize),
        }}
      />
      <Modal
        title={editing ? `编辑${title}` : `新增${title}`}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields(); }}
        width={800}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} scrollToFirstError={{ behavior: 'smooth', block: 'center' }}>
          <Row gutter={24}>
            {formItems.map(col => (
              <Col span={12} key={col.key}>
                <Form.Item
                  name={col.key}
                  label={col.title}
                  rules={col.required ? [{ required: true, message: `请输入${col.title}` }] : undefined}
                  initialValue={col.initialValue !== undefined ? col.initialValue : (col.type === 'boolean' ? true : undefined)}
                  {...(col.type === 'boolean' ? { valuePropName: 'checked' } : {})}
                >
                  {col.autoCode && editing ? (
                    <Input disabled style={{ color: '#333', backgroundColor: '#f5f5f5' }} />
                  ) : col.type === 'boolean' ? (
                    <Switch checkedChildren="是" unCheckedChildren="否" />
                  ) : col.type === 'select' ? (
                    <Select options={col.options} placeholder={`请选择${col.title}`} allowClear virtual={true} listHeight={250} />
                  ) : col.type === 'number' ? (
                    <InputNumber style={{ width: '100%' }} placeholder={`请输入${col.title}`} />
                  ) : col.type === 'date' ? (
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder={`请选择${col.title}`} />
                  ) : col.type === 'textarea' ? (
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={`请输入${col.title}`} />
                  ) : col.foreignTable ? (
                    <Select
                      placeholder={`请选择${col.title}`}
                      allowClear
                      showSearch
                      virtual={true}
                      listHeight={250}
                      optionFilterProp="label"
                      options={(foreignData[col.key] || []).map((item: any) => ({
                        label: item[col.foreignLabel || 'id'],
                        value: item.id,
                      }))}
                    />
                  ) : (
                    <Input placeholder={`请输入${col.title}`} maxLength={100} showCount={false} />
                  )}
                </Form.Item>
              </Col>
            ))}
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
