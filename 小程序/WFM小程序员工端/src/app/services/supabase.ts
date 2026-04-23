import { createClient } from '@supabase/supabase-js';

// Same Supabase project as the main WFM backend
const projectId = 'gtzbjvqqxsrffsvglula';
const publicAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0emJqdnFxeHNyZmZzdmdsdWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTA2MDYsImV4cCI6MjA5MTk2NjYwNn0.F24I7-E0TnyRIKcaW2U0pu2Wa-N_qprqVStmUCOfLno';

const SUPABASE_URL = `https://${projectId}.supabase.co`;

export const supabase = createClient(SUPABASE_URL, publicAnonKey);
