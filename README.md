# พิซซ่า คาซ่า 🍕

ระบบสั่งพิซซ่าผ่าน QR Code — Next.js (App Router, JavaScript) + Supabase
deploy บน Vercel

> หมายเหตุสำหรับ AI/นักพัฒนาที่ทำงานต่อในโปรเจกต์นี้: อ่าน [`CLAUDE.md`](./CLAUDE.md)
> ก่อนเสมอ มีกติกาเรื่อง Dynamic Route params (Promise + `use()`) และ
> รายการค่าคงที่ของตัวเลือกพิซซ่าที่ต้องยึดตลอดทั้งโปรเจกต์

## เริ่มต้นใช้งาน

```bash
npm install
cp .env.local.example .env.local   # แล้วใส่ค่าจริงจาก Supabase
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

## Environment Variables

ตั้งค่าใน `.env.local` (สำหรับ local) และใน Vercel Project Settings →
Environment Variables (สำหรับ production):

| ชื่อตัวแปร | คำอธิบาย |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL ของโปรเจกต์ Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key ของโปรเจกต์ Supabase |

## โครงสร้างฐานข้อมูล (Supabase)

โปรเจกต์นี้อ้างอิงตารางที่มีอยู่แล้วใน Supabase (ไม่ได้สร้างในโค้ดนี้):

- `sessions` (id, table_number, status, created_at)
- `menu_categories` (id, name, sort_order)
- `menu_items` (id, category_id, name, description, base_price, image_url)
- `orders` (id, session_id, table_number, items เป็น jsonb, status, created_at)

ไซส์พิซซ่า / ตัวเลือกขอบ / ท็อปปิ้งเพิ่ม **ไม่มีตารางแยก** — เป็นค่าคงที่ใน
โค้ดฝั่งหน้าสั่งพิซซ่า (ดูรายละเอียดใน `CLAUDE.md`)

## Deploy บน Vercel

1. Push โปรเจกต์ขึ้น GitHub
2. Import โปรเจกต์ใน Vercel
3. ตั้งค่า Environment Variables ทั้งสองตัวด้านบนใน Vercel
4. Deploy — ทดสอบว่าสำเร็จได้จากหน้าแรก ซึ่งมีลิงก์ไป `/generate-qr`
   และ `/kitchen`

## โครงสร้างโปรเจกต์

```
pizza-casa/
├── app/
│   ├── layout.js
│   └── page.js
├── lib/
│   └── supabaseClient.js
├── next.config.js
├── package.json
├── .gitignore
├── .env.local.example
├── CLAUDE.md
└── README.md
```
