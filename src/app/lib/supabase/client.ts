import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey as fallbackPublicAnonKey } from '../../../../utils/supabase/info';

const fallbackSupabaseUrl = `https://${projectId}.supabase.co`;

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
export const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackPublicAnonKey;
export const authMode = import.meta.env.VITE_AUTH_MODE || 'mock';

export const supabase = createClient(supabaseUrl, publicAnonKey);
