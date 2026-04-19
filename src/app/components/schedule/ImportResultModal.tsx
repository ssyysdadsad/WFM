import { Alert, Descriptions, Modal, Typography } from 'antd';
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
        </>
      )}
    </Modal>
  );
}
