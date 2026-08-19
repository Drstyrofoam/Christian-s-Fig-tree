// Runs on a schedule (see vercel.json "crons"). Picks up to 2 active prayer
// points and emails them to everyone in the `subscribers` table via Resend.
//
// Required Vercel environment variables:
//   RESEND_API_KEY        - from https://resend.com (free tier is fine)
//   SUPABASE_URL           - same URL used in index.html
//   SUPABASE_KEY            - same publishable key used in index.html (RLS is
//                             already open, so the anon key is sufficient)
//   REMINDER_FROM_EMAIL    - e.g. "Fig Tree <onboarding@resend.dev>" until a
//                             custom domain is verified in Resend

export default async function handler(req, res) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM = process.env.REMINDER_FROM_EMAIL || 'Fig Tree <onboarding@resend.dev>';

    if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_API_KEY) {
      return res.status(500).json({ error: 'Missing required environment variables' });
    }

    const sbHeaders = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

    // 1. Get subscribers
    const subRes = await fetch(SUPABASE_URL + '/rest/v1/subscribers?select=email', { headers: sbHeaders });
    const subscribers = await subRes.json();
    if (!Array.isArray(subscribers) || !subscribers.length) {
      return res.status(200).json({ sent: 0, note: 'No subscribers yet' });
    }

    // 2. Get active (non-archived) prayer points
    const ppRes = await fetch(
      SUPABASE_URL + '/rest/v1/prayer_points?select=*&archived=eq.false&order=created_at.desc',
      { headers: sbHeaders }
    );
    const points = await ppRes.json();
    if (!Array.isArray(points) || !points.length) {
      return res.status(200).json({ sent: 0, note: 'No active prayer points' });
    }

    // 3. Pick up to 2 — prioritise "current" points closest to expiry, else random
    const sorted = [...points].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const chosen = sorted.slice(0, 2);

    const bodyHtml = chosen.map(p => {
      const person = p.person ? ' — ' + escapeHtml(p.person) : '';
      const detail = p.body ? '<br><span style="color:#5a7a9a;">' + escapeHtml(p.body) + '</span>' : '';
      return '<p style="margin:0 0 14px;"><strong>' + escapeHtml(p.title) + '</strong>' + person + detail + '</p>';
    }).join('');

    const html = '<div style="font-family:sans-serif;max-width:480px;">' +
      '<h2 style="color:#4a9eff;">Today\'s prayer points</h2>' + bodyHtml +
      '<p style="color:#5a7a9a;font-size:12px;">Christian\'s Fig Tree</p></div>';

    // 4. Send via Resend (one call per recipient to keep addresses private)
    let sent = 0;
    for (const s of subscribers) {
      if (!s.email) continue;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + RESEND_API_KEY },
        body: JSON.stringify({ from: FROM, to: s.email, subject: 'Your prayer reminder', html }),
      });
      if (r.ok) sent++;
    }

    return res.status(200).json({ sent, of: subscribers.length, points: chosen.length });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
