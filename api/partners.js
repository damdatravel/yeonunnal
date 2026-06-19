const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'damda2026!';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const { action, adminPw, status, id, grade } = body || {};

  // 관리자 비밀번호 확인 — 이 값을 모르면 키를 알아도 데이터에 접근 불가
  if (adminPw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    if (action === 'list') {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ partners: data });
    }

    if (action === 'updateStatus') {
      const { error } = await supabase
        .from('partners')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'updateGrade') {
      const { error } = await supabase
        .from('partners')
        .update({ grade })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
