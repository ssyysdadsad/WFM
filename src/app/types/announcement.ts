export type AnnouncementRecord = {
  id: string;
  title: string;
  announcementTypeDictItemId: string;
  content: string;
  visibilityScopeType: 'all' | 'role' | 'department' | 'custom';
  visibilityScopeConfig?: Record<string, any> | null;
  publishedByUserAccountId: string;
  publishedAt: string;
};

export type AnnouncementTypeOption = {
  id: string;
  itemName: string;
  itemCode: string;
};

export type AnnouncementFormValues = {
  title: string;
  announcementTypeDictItemId: string;
  content: string;
  visibilityScopeType: 'all' | 'role' | 'department' | 'custom';
  visibilityScopeConfig?: Record<string, any> | null;
  publishedAt: string;
};
