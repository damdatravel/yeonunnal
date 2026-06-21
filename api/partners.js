const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Code.gs(Apps Script) 웹훅 — 관리자 신원 확인(다중 관리자 지원) + 활동로그 기록용
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzG1GPR8OhMIeBeTFvt7gE5CGiyQx3ggnLiVIah9geT89m-_poYFEwmi9K--NZ0HxDKjg/exec';

// 입력된 비밀번호로 관리자 신원 확인 (마스터 또는 개별 등록 관리자, Code.gs의 admin_login에 위임)
async function verifyAdmin(adminPw) {
  if (!adminPw) return null;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'admin_login', password: adminPw })
    });
    const data = await res.json();
    if (data.result === 'success' && data.auth) {
      return { name: data.adminName || '관리자', isMaster: !!data.isMaster };
    }
  } catch (e) {
    // 검증 자체가 실패하면(네트워크 오류 등) 인증 실패로 처리
  }
  return null;
}

// 활동 기록 (실패해도 본 작업에 영향 없도록 결과를 기다리지 않음)
function logActivity(adminName, action, detail) {
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type: 'log_external_action', adminName, action, detail })
  }).catch(() => {});
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const { action, adminPw, status, id, grade } = body || {};

  // 관리자 신원 확인 — 마스터 비밀번호 또는 "관리자" 시트에 등록된 개별 비밀번호 모두 허용
  const admin = await verifyAdmin(adminPw);
  if (!admin) {
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
      const { data: before } = await supabase.from('partners').select('company').eq('id', id).single();
      const { error } = await supabase
        .from('partners')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      logActivity(admin.name, '협력사 상태 변경 → ' + status, before ? before.company : id);
      return res.status(200).json({ success: true });
    }

    if (action === 'updateGrade') {
      const { data: before } = await supabase.from('partners').select('company').eq('id', id).single();
      const { error } = await supabase
        .from('partners')
        .update({ grade })
        .eq('id', id);
      if (error) throw error;
      logActivity(admin.name, '협력사 등급 변경 → ' + grade, before ? before.company : id);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
