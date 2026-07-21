// Vercel Serverless Function — ส่งแจ้งเตือน LINE ผ่าน Messaging API (push ไปกลุ่ม)
// Token เก็บเป็น Environment Variable ฝั่ง server เท่านั้น ไม่หลุดถึง client
//
// ต้องตั้งค่า Environment Variables ใน Vercel (Settings → Environment Variables):
//   LINE_CHANNEL_ACCESS_TOKEN = <Channel access token จาก LINE Developers Console>
//   LINE_TARGET_ID            = <Group ID ที่จะส่งเข้า (ขึ้นต้นด้วย C...)>
//   FIREBASE_API_KEY          = AIzaSyDST4qYOlsdVUVjXL7KiMJtz2GXXCtEwTI  (ใช้ยืนยันผู้เรียก)

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token    = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const targetId = process.env.LINE_TARGET_ID;
    const apiKey   = process.env.FIREBASE_API_KEY;

    if (!token || !targetId) {
        return res.status(500).json({ error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN / LINE_TARGET_ID' });
    }

    try {
        const { idToken, text } = req.body || {};

        // ── ยืนยันว่าผู้เรียกเป็น user ที่ล็อกอินจริง (กันคนยิง endpoint สแปมกลุ่ม) ──
        if (!idToken) return res.status(401).json({ error: 'missing idToken' });
        if (apiKey) {
            const verify = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
            ).then(r => r.json());
            if (!verify.users || !verify.users.length) {
                return res.status(401).json({ error: 'invalid idToken' });
            }
        }

        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'missing text' });
        }

        // ── ส่งข้อความเข้า LINE ──
        const lineRes = await fetch(LINE_PUSH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                to: targetId,
                messages: [{ type: 'text', text: text.slice(0, 4900) }],
            }),
        });

        if (!lineRes.ok) {
            const errText = await lineRes.text();
            console.error('LINE push failed:', lineRes.status, errText);
            return res.status(502).json({ error: 'LINE push failed', detail: errText });
        }

        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('notify-line error:', e);
        return res.status(500).json({ error: e.message });
    }
}
