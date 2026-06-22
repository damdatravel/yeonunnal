const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Code.gs(Apps Script) 웹훅 — 활동로그 기록용 (partners.js의 logActivity와 동일 패턴)
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzG1GPR8OhMIeBeTFvt7gE5CGiyQx3ggnLiVIah9geT89m-_poYFEwmi9K--NZ0HxDKjg/exec';

function logActivity(actorName, action, detail) {
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type: 'log_external_action', adminName: actorName, action, detail })
  }).catch(() => {});
}

// 협력사 본인 탈퇴 처리
// - 호출자는 자신의 Supabase 세션 access_token만 보내면 됨 (관리자 비밀번호로 우회 불가 — 본인 계정만 삭제 가능)
// - 1) partners 테이블 행 삭제  2) Auth 계정 삭제  3) 활동로그 기록
// - 구글시트(협력신청/참여신청/프로젝트공고)의 과거 행사 기록은 건드리지 않음 — 정산·분쟁 증빙용으로 별도 보관
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'missing token' });
  }

  // 토큰으로 본인 신원 확인
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'invalid session' });
  }
  const userId = userData.user.id;
  const userEmail = userData.user.email;

  try {
    // 0) 탈퇴 전 진행 중인 참여건 확인 (추천됨: 고객 선택 대기 중 / 최종선정됨: 행사 진행 확정)
    //    확인 자체가 실패하면(네트워크 오류 등) 안전하게 탈퇴를 막는다 — 확정 안 된 상태로 계정을 지우지 않기 위함
    let activeCheck;
    try {
      const checkRes = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'check_partner_active_jobs', email: userEmail })
      });
      activeCheck = await checkRes.json();
    } catch (e) {
      return res.status(503).json({ error: 'check_failed' });
    }
    if (activeCheck?.result !== 'success') {
      return res.status(503).json({ error: 'check_failed' });
    }
    if (activeCheck.hasActive) {
      return res.status(409).json({ error: 'active_jobs', activeProjects: activeCheck.activeProjects || [] });
    }

    // 로그용 업체명 확보 (실패해도 진행)
    let company = userEmail;
    try {
      const { data: partnerRow } = await supabase
        .from('partners')
        .select('company')
        .eq('id', userId)
        .single();
      if (partnerRow?.company) company = partnerRow.company;
    } catch (e) {}

    // 1) partners 테이블 행 삭제
    const { error: delRowErr } = await supabase.from('partners').delete().eq('id', userId);
    if (delRowErr) throw delRowErr;

    // 2) Auth 계정 삭제 — 이후 동일 이메일로 재가입 가능
    const { error: delAuthErr } = await supabase.auth.admin.deleteUser(userId);
    if (delAuthErr) throw delAuthErr;

    logActivity(`${company} (본인 탈퇴)`, '협력사 회원 탈퇴', userEmail);

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};