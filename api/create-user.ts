import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { email, password, full_name, role } = req.body;

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing (URL or Service Role Key). Check Vercel Environment Variables.');
    }

    // Admin client to bypass email confirmation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. Create user in Auth
    const { data, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name }
    });

    if (authError) throw authError;

    if (data.user) {
      // 2. Update profile in database
      // Using upsert in case the trigger already created a skeleton profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ role, full_name })
        .eq('id', data.user.id);

      if (profileError) throw profileError;
    }

    return res.status(200).json({ success: true, user: data.user });
  } catch (error: any) {
    console.error('Serverless Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error' 
    });
  }
}
