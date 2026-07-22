# ตั้งค่าแจ้งเตือน LINE (Messaging API) — เมื่อวิศวกรยื่นขออนุมัติ

> ⚠️ **LINE Notify ปิดบริการถาวรแล้ว (31 มี.ค. 2025)** ระบบนี้จึงใช้ **LINE Messaging API**
> ผ่าน LINE Official Account แทน — ส่งข้อความอัตโนมัติได้ฟรีตามโควตารายเดือน

โค้ดฝั่งแอปทำเสร็จแล้ว เหลือแค่ตั้งค่า credential 3 อย่างตามขั้นตอนด้านล่าง
เมื่อวิศวกร (role PROJECT) กดยื่นขออนุมัติ PO/DV ระบบจะยิงข้อความเข้ากลุ่ม LINE อัตโนมัติ

---

## 1. สร้าง LINE Official Account + เปิด Messaging API

1. เข้า https://developers.line.biz/console/ → เข้าสู่ระบบด้วยบัญชี LINE
2. สร้าง **Provider** (ชื่ออะไรก็ได้ เช่น "PMS 888")
3. สร้าง **Channel** แบบ **Messaging API**
4. ในแท็บ **Messaging API** ของ channel:
   - เลื่อนลงหา **Channel access token (long-lived)** → กด **Issue** → คัดลอกเก็บไว้
     👉 นี่คือค่า `LINE_CHANNEL_ACCESS_TOKEN`

## 2. หา Group ID ของกลุ่มที่จะรับแจ้งเตือน

Group ID ไม่ได้แสดงในแอป LINE ต้องดึงผ่าน webhook ครั้งเดียว:

1. เชิญ **Official Account** (bot) เข้ากลุ่ม LINE ที่ ADMIN/DEV อยู่รวมกัน
2. ในแท็บ Messaging API → เปิด **Use webhook** = ON และตั้ง **Webhook URL** ชั่วคราว
   (ใช้ https://webhook.site คัดลอก URL ที่ได้มาวางไว้ก่อน)
3. พิมพ์ข้อความอะไรก็ได้ในกลุ่ม → กลับไปดูที่ webhook.site
   จะเห็น JSON มี `"source": { "type": "group", "groupId": "Cxxxxxxxx..." }`
   👉 ค่า `groupId` (ขึ้นต้น `C`) คือ `LINE_TARGET_ID`
4. เสร็จแล้วปิด webhook ได้ (ระบบนี้ใช้แค่ push ไม่ต้องรับ webhook ถาวร)

> หมายเหตุ: ในแท็บ Messaging API อาจต้องปิด "Auto-reply messages" / "Greeting messages"
> เพื่อไม่ให้ OA ตอบข้อความอัตโนมัติกวนในกลุ่ม

## 3. ใส่ Environment Variables ใน Vercel

Vercel → เลือกโปรเจกต์ → **Settings → Environment Variables** เพิ่ม 3 ตัว
(เลือก Environment: Production + Preview):

| Key | Value |
|-----|-------|
| `LINE_CHANNEL_ACCESS_TOKEN` | token จากข้อ 1 |
| `LINE_TARGET_ID` | group ID จากข้อ 2 (ขึ้นต้น `C`) |
| `FIREBASE_API_KEY` | ค่าเดียวกับ `VITE_FIREBASE_API_KEY` ใน `.env` หรือ Firebase Console |

จากนั้น **Redeploy** โปรเจกต์ 1 ครั้งเพื่อให้ค่ามีผล

---

## เสร็จแล้ว — วิธีทำงาน

- วิศวกรกดยื่นขออนุมัติ PO/DV → ระบบยิงข้อความเข้ากลุ่ม LINE ทันที
- ถ้ายังไม่ตั้งค่า env หรือ LINE ล่ม → **การยื่นขออนุมัติยังทำงานปกติ** (แจ้ง LINE เป็นแบบ
  fire-and-forget ไม่บล็อกงานหลัก และไม่ทำให้ระบบ error)
- Token อยู่ฝั่ง server (Vercel) เท่านั้น ไม่หลุดถึงหน้าเว็บ
- Endpoint `/api/notify-line` ตรวจ Firebase ID token ของผู้เรียกก่อนส่ง — คนนอกยิงสแปมไม่ได้

## ทดสอบเร็ว (หลังตั้งค่า)

ให้วิศวกร (หรือ DEV เปิดโหมดอนุมัติในแผง "ตั้งค่าอนุมัติ" ก่อน) ลองยื่นขอเปิด PO 1 ใบ
แล้วดูว่ากลุ่ม LINE ได้รับข้อความหรือไม่ ถ้าไม่ได้ ให้ดู Vercel → Deployments →
Functions log ของ `/api/notify-line` จะบอก error (เช่น token ผิด หรือ bot ไม่ได้อยู่ในกลุ่ม)
