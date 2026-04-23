export type ScheduleVersionRecord = {
  id: string;
  projectId: string;
  scheduleMonth: string;
  versionNo: number;
  publishStatusDictItemId?: string | null;
  generationType: 'manual' | 'template' | 'excel';
  createdByUserAccountId?: string | null;
  publishedAt?: string | null;
  publishedByUserAccountId?: string | null;
  remark?: string | null;
  isActive?: boolean;
};

export type ScheduleVersionFormValues = {
  projectId: string;
  scheduleMonth: string;
  versionNo: number;
  generationType: 'manual' | 'template' | 'excel';
  publishStatusDictItemId?: string | null;
  remark?: string | null;
};

export type SchedulePublishPayload = {
  scheduleVersionId: string;
  operatorUserAccountId: string;
  createAnnouncement?: boolean;
  announcementTitle?: string;
};
