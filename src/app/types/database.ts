export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Array<{
    foreignKeyName: string;
    columns: string[];
    isOneToOne: boolean;
    referencedRelation: string;
    referencedColumns: string[];
  }>;
};

export type Database = {
  public: {
    Tables: {
      [key: string]: Table<Record<string, any>, Record<string, any>, Record<string, any>>;
      dict_type: Table<{
        id: string;
        type_code: string;
        type_name: string;
        description: string | null;
        extra_config: Json | null;
        sort_order: number;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>;
      dict_item: Table<{
        id: string;
        dict_type_id: string;
        item_code: string;
        item_name: string;
        description: string | null;
        extra_config: Json | null;
        sort_order: number;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>;
      employee: Table<{
        id: string;
        employee_no: string;
        full_name: string;
        mobile_number: string;
        channel_id: string;
        department_id: string;
        employee_status_dict_item_id: string;
        onboard_date: string;
        remark: string | null;
        created_at: string;
        updated_at: string;
      }>;
      user_account: Table<{
        id: string;
        username: string | null;
        password_hash: string | null;
        mobile_number: string | null;
        employee_id: string | null;
        account_source: string;
        wechat_openid: string | null;
        wechat_unionid: string | null;
        account_status: string;
        last_login_at: string | null;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>;
      role: Table<{
        id: string;
        role_code: string;
        role_name: string;
        role_scope: string;
        description: string | null;
        sort_order: number;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>;
      permission: Table<{
        id: string;
        permission_code: string;
        permission_name: string;
        platform_code: string;
        module_code: string;
        action_code: string;
        description: string | null;
        sort_order: number;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>;
      user_role: Table<{
        id: string;
        user_account_id: string;
        role_id: string;
        created_at: string;
        updated_at: string;
      }>;
      role_permission: Table<{
        id: string;
        role_id: string;
        permission_id: string;
        created_at: string;
        updated_at: string;
      }>;
    };
  };
};

export type PublicTables = Database['public']['Tables'];
