import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "1.5rem",
        fontFamily: "sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2.5rem" }}>🍕 พิซซ่า คาซ่า</h1>
      <p>ระบบสั่งพิซซ่าผ่าน QR Code</p>

      <nav style={{ display: "flex", gap: "1rem" }}>
        <Link
          href="/generate-qr"
          style={{
            padding: "0.75rem 1.5rem",
            border: "1px solid #333",
            borderRadius: "8px",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          สร้าง QR Code
        </Link>
        <Link
          href="/kitchen"
          style={{
            padding: "0.75rem 1.5rem",
            border: "1px solid #333",
            borderRadius: "8px",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          หน้าครัว
        </Link>
      </nav>
    </main>
  );
}
