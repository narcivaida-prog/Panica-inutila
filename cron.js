const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const resend = new Resend(process.env.RESEND_API_KEY);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: docs, error } = await supabase.from('documents').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const dueByUser = {};

  for (const doc of docs) {
    const expiry = new Date(doc.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((expiry - today) / 86400000);

    if (daysLeft > doc.reminder_days) continue;

    const lastNotified = doc.last_notified_at ? new Date(doc.last_notified_at) : null;
    const daysSinceNotified = lastNotified
      ? Math.round((today - lastNotified) / 86400000)
      : Infinity;
    if (daysSinceNotified < 3) continue;

    if (!dueByUser[doc.user_id]) dueByUser[doc.user_id] = [];
    dueByUser[doc.user_id].push({ ...doc, daysLeft });
  }

  const notifiedIds = [];

  for (const userId of Object.keys(dueByUser)) {
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
    if (userErr || !userData || !userData.user || !userData.user.email) continue;

    const items = dueByUser[userId];
    const rows = items
      .map((i) => {
        const status =
          i.daysLeft < 0
            ? `Expirat de ${Math.abs(i.daysLeft)} zile`
            : i.daysLeft === 0
            ? 'Expiră astăzi'
            : `${i.daysLeft} zile rămase`;
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(
          i.name
        )}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(
          i.category
        )}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${status}</td></tr>`;
      })
      .join('');

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: userData.user.email,
        subject: `${items.length} document(e) necesită atenție`,
        html: `<h2>Termene apropiate</h2><table cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px;">${rows}</table>`,
      });
      items.forEach((i) => notifiedIds.push(i.id));
    } catch (e) {
      console.error('Email send failed for user', userId, e);
    }
  }

  if (notifiedIds.length > 0) {
    await supabase
      .from('documents')
      .update({ last_notified_at: today.toISOString().slice(0, 10) })
      .in('id', notifiedIds);
  }

  return res.status(200).json({ checked: docs.length, notified: notifiedIds.length });
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
