
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://mcphhwltttdagxjkofwy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hRX7jjakhYhgMDu6hTcYcA_LdZBEUwC';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
window.supabase = supabase;
