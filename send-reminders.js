// Runs on a schedule (see vercel.json "crons"). Picks up to 2 active prayer
// points and sends them to everyone subscribed — by email (Resend) and/or
// browser push notification (web-push).
//
// Required Vercel environment variables:
//   RESEND_API_KEY        - from https://resend.com (free tier is fine)
//   SUPABASE_URL           - same URL used in index.html
//   SUPABASE_KEY            - same publishable key used in index.html (RLS is
//                             already open, so the anon key is sufficient)
//   REMINDER_FROM_EMAIL    - e.g. "Fig Tree <onboarding@resend.dev>" until a
//                             custom domain is verified in Resend
//   VAPID_PUBLIC_KEY       - must match the key hardcoded in index.html
//   VAPID_PRIVATE_KEY      - keep secret, only set as an env var

import webpush from 'web-push';

export default async function handler(req, res) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM = process.env.REMINDER_FROM_EMAIL || 'Fig Tree <onboarding@resend.dev>';
    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Missing required Supabase environment variables' });
    }

    const sbHeaders = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

    // Get active (non-archived) prayer points
    const ppRes = await fetch(
      SUPABASE_URL + '/rest/v1/prayer_points?select=*&archived=eq.false&order=created_at.desc',
      { headers: sbHeaders }
    );
    const points = await ppRes.json();
    if (!Array.isArray(points) || !points.length) {
      return res.status(200).json({ sent: 0, note: 'No active prayer points' });
    }

    // Pick up to 2 — oldest-first (closest to being forgotten)
    const sorted = [...points].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const chosen = sorted.slice(0, 2);
    const plainSummary = chosen.map(p => p.title + (p.person ? ' — ' + p.person : '')).join(' · ');

    let emailSent = 0, pushSent = 0;

    // ── EMAIL ──
    if (RESEND_API_KEY) {
      const subRes = await fetch(SUPABASE_URL + '/rest/v1/subscribers?select=email', { headers: sbHeaders });
      const subscribers = await subRes.json();
      if (Array.isArray(subscribers) && subscribers.length) {
        const bodyHtml = chosen.map(p => {
          const person = p.person ? ' — ' + escapeHtml(p.person) : '';
          const detail = p.body ? '<br><span style="color:#5a7a9a;">' + escapeHtml(p.body) + '</span>' : '';
          return '<p style="margin:0 0 14px;"><strong>' + escapeHtml(p.title) + '</strong>' + person + detail + '</p>';
        }).join('');
        const html = '<div style="font-family:sans-serif;max-width:480px;">' +
          '<h2 style="color:#4a9eff;">Today\'s prayer points</h2>' + bodyHtml +
          '<p style="color:#5a7a9a;font-size:12px;">Christian\'s Fig Tree</p></div>';

        for (const s of subscribers) {
          if (!s.email) continue;
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + RESEND_API_KEY },
            body: JSON.stringify({ from: FROM, to: s.email, subject: 'Your prayer reminder', html }),
          });
          if (r.ok) emailSent++;
        }
      }
    }

    // ── PUSH ──
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails('mailto:no-reply@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      const pushRes = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?select=id,subscription', { headers: sbHeaders });
      const pushSubs = await pushRes.json();
      if (Array.isArray(pushSubs)) {
        for (const row of pushSubs) {
          try {
            await webpush.sendNotification(
              row.subscription,
              JSON.stringify({ title: 'Prayer reminder', body: plainSummary })
            );
            pushSent++;
          } catch (e) {
            // Subscription likely expired/revoked — remove it so we stop retrying
            if (e.statusCode === 404 || e.statusCode === 410) {
              await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + row.id, {
                method: 'DELETE', headers: sbHeaders,
              });
            }
          }
        }
      }
    }

    return res.status(200).json({ emailSent, pushSent, points: chosen.length });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
