import { Alert, Descriptions, Divider, Modal, Typography } from 'antd';
import { ExclamationCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { ImportErrorTable } from '@/app/components/schedule/ImportErrorTable';
import type { ScheduleImportResult } from '@/app/types/schedule-import';

export function ImportResultModal({
  open,
  result,
  onClose,
}: {
  open: boolean;
  result: ScheduleImportResult | null;
  onClose: () => void;
}) {
  const warnings = result?.laborRuleWarnings;
  const hasWarnings = warnings && (warnings.hardViolations.length > 0 || warnings.softViolations.length > 0);

  return (
    <Modal
      title="导入结果"
      open={open}
      onCancel={onClose}
      onOk={onClose}
      width={920}
      destroyOnClose
    >
      {result && (
        <>
          <Alert
            type={result.failedRows > 0 ? 'warning' : 'success'}
            showIcon
            message={result.message || (result.failedRows > 0 ? '导入完成，存在部分错误' : '导入成功')}
            style={{ marginBottom: 16 }}
          />
          <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="导入成功">{result.importedRows}</Descriptions.Item>
            <Descriptions.Item label="导入失败">{result.failedRows}</Descriptions.Item>
            <Descriptions.Item label="目标版本">{result.scheduleVersionId || '-'}</Descriptions.Item>
          </Descriptions>
          {result.errors.length > 0 ? (
            <>
              <Typography.Title level={5}>错误明细</Typography.Title>
              <ImportErrorTable errors={result.errors} />
            </>
          ) : (
            <Typography.Text type="secondary">本次导入未发现错误。</Typography.Text>
          )}

          {/* Labor Rule Validation Results */}
          {hasWarnings && (
            <>
              <Divider />
              <Typography.Title level={5} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ExclamationCircleOutlined style={{ color: warnings.hardViolations.length > 0 ? '#ff4d4f' : '#faad14' }} />
                用工规则校验
              </Typography.Title>

              {warnings.hardViolations.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <Alert
                    type="error"
                    showIcon
                    message={`${warnings.hardViolations.length} 条硬约束违规（建议修正导入数据）`}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {warnings.hardViolations.map((v, i) => (
                      <div key={`hard-${i}`} style={{
                        padding: '6px 12px',
                        marginBottom: 4,
                        background: '#fff2f0',
                        borderRadius: 6,
                        borderLeft: '3px solid #ff4d4f',
                        fontSize: 13,
                      }}>
                        <div>{v.message}</div>
                        <div style={{ color: '#999', fontSize: 12 }}>规则：{v.ruleName}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {warnings.softViolations.length > 0 && (
                <div>
                  <Alert
                    type="warning"
                    showIcon
                    message={`${warnings.softViolations.length} 条软约束预警（建议关注）`}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {warnings.softViolations.map((v, i) => (
                      <div key={`soft-${i}`} style={{
                        padding: '6px 12px',
                        marginBottom: 4,
                        background: '#fffbe6',
                        borderRadius: 6,
                        borderLeft: '3px solid #faad14',
                        fontSize: 13,
                      }}>
                        <div>{v.message}</div>
                        <div style={{ color: '#999', fontSize: 12 }}>规则：{v.ruleName}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
