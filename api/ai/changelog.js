function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

async function verifyAdmin({ supabaseUrl, anonKey, accessToken }) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  };

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
  if (!userRes.ok) return { ok: false, reason: 'unauthorized' };
  const user = await userRes.json();
  const userId = user?.id;
  if (!userId) return { ok: false, reason: 'unauthorized' };

  const adminRes = await fetch(
    `${supabaseUrl}/rest/v1/admins?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers: { ...headers, Accept: 'application/json' } }
  );
  if (!adminRes.ok) return { ok: false, reason: 'admin_check_failed' };
  const rows = await adminRes.json();
  return { ok: Array.isArray(rows) && rows.length > 0, reason: 'not_admin' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) return json(res, 500, { error: 'Server missing DEEPSEEK_API_KEY' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json(res, 500, { error: 'Server missing Supabase env (SUPABASE_URL/ANON_KEY or VITE_*)' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!accessToken) return json(res, 401, { error: 'Missing Authorization bearer token' });

  const admin = await verifyAdmin({ supabaseUrl, anonKey, accessToken });
  if (!admin.ok) return json(res, 403, { error: 'Admin required' });

  const body = await readJson(req);
  const title = (body?.title || '').toString().trim();
  const locale = (body?.locale || '').toString().toLowerCase() === 'ar' ? 'ar' : 'en';

  if (!title) return json(res, 400, { error: 'Missing title' });
  if (title.length > 120) return json(res, 400, { error: 'Title too long' });

  const system =
    locale === 'ar'
      ? 'أنت مساعد لكتابة سجل تغييرات (Changelog) للعبة. أجب بـ JSON فقط بدون أي نص إضافي.'
      : 'You help write a product changelog for a game. Reply with JSON only (no extra text).';

  const user =
    locale === 'ar'
      ? `اكتب محتوى Changelog بناءً على العنوان التالي: "${title}".\n\nأرجع JSON بهذه المفاتيح فقط:\n- description: نص قصير\n- added: مصفوفة عناصر قصيرة\n- changed: مصفوفة عناصر قصيرة\n- fixed: مصفوفة عناصر قصيرة\n\nقيود:\n- لا تستخدم Markdown\n- عناصر القوائم قصيرة (<= 80 حرف)\n- إذا لا يوجد عناصر لقسم، اجعله []\n`
      : `Write a changelog entry from this title: "${title}".\n\nReturn JSON with ONLY these keys:\n- description: short text\n- added: array of short items\n- changed: array of short items\n- fixed: array of short items\n\nConstraints:\n- No markdown\n- List items are short (<= 80 chars)\n- If a section has no items, return []\n`;

  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  let content = null;
  try {
    const dsRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    const text = await dsRes.text();
    if (!dsRes.ok) {
      return json(res, 502, { error: 'DeepSeek error', status: dsRes.status, detail: text.slice(0, 300) });
    }

    let parsed = null;
    try {
      const obj = JSON.parse(text);
      content = obj?.choices?.[0]?.message?.content ?? null;
      parsed = typeof content === 'string' ? extractJsonObject(content) : null;
    } catch {
      // ignore
    }

    if (!parsed && typeof content === 'string') parsed = extractJsonObject(content);
    if (!parsed && typeof text === 'string') parsed = extractJsonObject(text);
    if (!parsed) return json(res, 502, { error: 'Invalid AI response (expected JSON)' });

    const out = {
      description: (parsed.description || '').toString(),
      added: Array.isArray(parsed.added) ? parsed.added.map((s) => (s || '').toString()) : [],
      changed: Array.isArray(parsed.changed) ? parsed.changed.map((s) => (s || '').toString()) : [],
      fixed: Array.isArray(parsed.fixed) ? parsed.fixed.map((s) => (s || '').toString()) : [],
    };

    return json(res, 200, out);
  } catch (e) {
    return json(res, 500, { error: 'Server error', detail: e?.message || String(e) });
  }
}

