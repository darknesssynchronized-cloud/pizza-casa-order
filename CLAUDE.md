# CLAUDE.md — บันทึกสำหรับ AI ที่ทำงานต่อในโปรเจกต์นี้

โปรเจกต์: **พิซซ่า คาซ่า** — ระบบสั่งพิซซ่าผ่าน QR Code
Stack: Next.js (App Router, JavaScript) + Supabase, deploy บน Vercel

## กติกาสำคัญที่ต้องยึดตลอดทั้งโปรเจกต์

### 1. Dynamic Route params เป็น Promise
โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ซึ่ง `params` (และ `searchParams`) ของ
Dynamic Route ถูกส่งมาเป็น **Promise** ไม่ใช่ object ตรง ๆ อีกต่อไป

ทุกครั้งที่สร้างหน้าใน dynamic segment (เช่น `app/order/[sessionId]/page.js`
ที่จะใช้สร้างหน้าสั่งพิซซ่าในขั้นตอนถัดไป) **ต้อง unwrap ด้วย `use()` จาก
React เสมอ** ห้ามเข้าถึง `params.xxx` ตรง ๆ

ตัวอย่างรูปแบบที่ถูกต้อง (client component):

```jsx
"use client";
import { use } from "react";

export default function Page({ params }) {
  const { sessionId } = use(params);
  // ...
}
```

หรือใน server component ที่เป็น `async function` สามารถ `await params` ได้
โดยตรง แต่ถ้าเป็น client component ต้องใช้ `use()` เท่านั้น

### 2. ตัวเลือกพิซซ่าเป็นค่าคงที่ในโค้ด ไม่ใช่ตารางฐานข้อมูล
ไซส์พิซซ่า, ตัวเลือกขอบ และท็อปปิ้งเพิ่ม **ไม่มีตารางแยกในฐานข้อมูล**
ให้เขียนเป็นรายการค่าคงที่ (เช่น array/object ใน JS) ไว้ในโค้ดของหน้าสั่ง
พิซซ่าโดยตรง เช่น:

```js
export const PIZZA_SIZES = [
  { id: "small", label: "เล็ก", priceModifier: 0 },
  { id: "medium", label: "กลาง", priceModifier: 50 },
  { id: "large", label: "ใหญ่", priceModifier: 100 },
];

export const CRUST_OPTIONS = [
  { id: "regular", label: "ธรรมดา" },
  { id: "thin", label: "บางกรอบ" },
  { id: "cheese", label: "ขอบชีส" },
];

export const EXTRA_TOPPINGS = [
  { id: "extra_cheese", label: "ชีสเพิ่ม", price: 30 },
  { id: "mushroom", label: "เห็ด", price: 20 },
  { id: "pepperoni", label: "เปปเปอโรนี", price: 30 },
];
```

เมื่อลูกค้าสั่ง ให้บันทึกตัวเลือกที่เลือกไว้ใน `orders.items` (jsonb)
โดยตรง ไม่ต้องอ้างอิง foreign key ไปยังตารางใด ๆ สำหรับตัวเลือกเหล่านี้

## โครงสร้างฐานข้อมูล Supabase (มีอยู่แล้ว — ใช้อ้างอิงเท่านั้น ห้ามสร้างใหม่)

- **sessions**: `id`, `table_number`, `status`, `created_at`
- **menu_categories**: `id`, `name`, `sort_order`
- **menu_items**: `id`, `category_id`, `name`, `description`, `base_price`, `image_url`
- **orders**: `id`, `session_id`, `table_number`, `items` (jsonb), `status`, `created_at`

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Client อยู่ที่ `lib/supabaseClient.js`

## หน้าที่ยังไม่ได้สร้าง (สำหรับขั้นตอนถัดไป)

- `/generate-qr` — สร้าง QR Code ต่อโต๊ะ
- `/kitchen` — หน้าจอครัวดูออเดอร์
- `/order/[sessionId]` — หน้าสั่งพิซซ่าของลูกค้า (จะใช้ dynamic route params
  ตามกติกาข้อ 1 ด้านบน)
