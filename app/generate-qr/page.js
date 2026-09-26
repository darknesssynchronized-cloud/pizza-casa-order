"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function GenerateQrPage() {
  const [origin, setOrigin] = useState("");
  const [tableNumberInput, setTableNumberInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // session ที่เปิดค้างอยู่แล้ว (สำหรับกล่องเตือน + กล่องยืนยัน)
  const [existingSession, setExistingSession] = useState(null); // { id, table_number, created_at }
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // ผลลัพธ์ session ที่เพิ่งสร้างสำเร็จ (สำหรับแสดง QR)
  const [qrResult, setQrResult] = useState(null); // { table_number }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function resetForm() {
    setTableNumberInput("");
    setError("");
    setExistingSession(null);
    setConfirmOpen(false);
    setQrResult(null);
    setCopied(false);
  }

  function parseTableNumber(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return { error: "กรุณากรอกเลขโต๊ะ" };
    const num = Number(trimmed);
    if (!Number.isInteger(num) || num <= 0) {
      return { error: "กรุณากรอกเลขโต๊ะเป็นตัวเลขจำนวนเต็มมากกว่า 0" };
    }
    return { value: num };
  }

  async function handleOpenTable(e) {
    e.preventDefault();
    setError("");
    setQrResult(null);

    const parsed = parseTableNumber(tableNumberInput);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const tableNumber = parsed.value;

    setLoading(true);
    try {
      // 1. เช็คก่อนว่ามี session เปิดค้างอยู่ที่โต๊ะนี้หรือไม่
      const { data: existing, error: findError } = await supabase
        .from("sessions")
        .select("id, table_number, created_at")
        .eq("table_number", tableNumber)
        .eq("status", "open")
        .maybeSingle();

      if (findError) throw findError;

      if (existing) {
        setExistingSession(existing);
        setLoading(false);
        return;
      }

      // 2. ไม่มี session ค้าง -> สร้างใหม่
      const { data: created, error: insertError } = await supabase
        .from("sessions")
        .insert({ table_number: tableNumber, status: "open" })
        .select("id, table_number, created_at")
        .single();

      if (insertError) throw insertError;

      setQrResult(created);
    } catch (err) {
      console.error(err);
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  function getElapsedMinutes(createdAt) {
    const createdMs = new Date(createdAt).getTime();
    const diffMs = Date.now() - createdMs;
    return Math.max(0, Math.floor(diffMs / 60000));
  }

  async function handleConfirmClose() {
    if (!existingSession) return;
    setClosing(true);
    setError("");
    try {
      // update พร้อมเช็คซ้ำว่า status ยังเป็น 'open' อยู่ กันกดปิดซ้ำซ้อน
      const { data, error: updateError } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", existingSession.id)
        .eq("status", "open")
        .select("id");

      if (updateError) throw updateError;

      if (!data || data.length === 0) {
        setError('โต๊ะนี้ถูกปิดไปแล้วโดยผู้อื่น กรุณากด "เปิดโต๊ะ" อีกครั้ง');
      }

      setConfirmOpen(false);
      setExistingSession(null);
    } catch (err) {
      console.error(err);
      setError("ปิดโต๊ะเดิมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setClosing(false);
    }
  }

  function handleCancelConfirm() {
    setConfirmOpen(false);
  }

  const orderUrl = qrResult ? `${origin}/order/${qrResult.table_number}` : "";
  const qrImageSrc = orderUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        orderUrl
      )}`
    : "";

  function handleCopyLink() {
    if (!orderUrl) return;
    navigator.clipboard
      .writeText(orderUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error(err));
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>🍕 เปิดโต๊ะลูกค้า</h1>

      {!qrResult && (
        <form onSubmit={handleOpenTable} style={styles.form}>
          <label style={styles.label} htmlFor="tableNumber">
            เลขโต๊ะ
          </label>
          <input
            id="tableNumber"
            type="number"
            inputMode="numeric"
            value={tableNumberInput}
            onChange={(e) => setTableNumberInput(e.target.value)}
            style={styles.input}
            placeholder="เช่น 12"
            disabled={loading || !!existingSession}
          />

          <button
            type="submit"
            style={{
              ...styles.primaryButton,
              opacity: loading || !!existingSession ? 0.6 : 1,
            }}
            disabled={loading || !!existingSession}
          >
            {loading ? "กำลังเปิดโต๊ะ..." : "เปิดโต๊ะ"}
          </button>

          {error && <p style={styles.errorText}>{error}</p>}
        </form>
      )}

      {existingSession && !confirmOpen && (
        <div style={styles.warningBox}>
          <p style={styles.warningText}>
            โต๊ะนี้มีลูกค้าอยู่ระหว่างสั่ง/ทานพิซซ่า กรุณาปิดโต๊ะเดิมก่อน
          </p>
          <button style={styles.dangerButton} onClick={() => setConfirmOpen(true)}>
            ปิดโต๊ะเดิม
          </button>
        </div>
      )}

      {existingSession && confirmOpen && (
        <div style={styles.confirmBox}>
          <p style={styles.confirmTitle}>ยืนยันปิดโต๊ะเดิม</p>
          <p style={styles.confirmDetail}>
            โต๊ะ {existingSession.table_number}
            <br />
            เปิดมาแล้ว {getElapsedMinutes(existingSession.created_at)} นาที
          </p>
          <div style={styles.confirmButtonRow}>
            <button
              style={styles.secondaryButton}
              onClick={handleCancelConfirm}
              disabled={closing}
            >
              ยกเลิก
            </button>
            <button
              style={{ ...styles.dangerButton, opacity: closing ? 0.6 : 1 }}
              onClick={handleConfirmClose}
              disabled={closing}
            >
              {closing ? "กำลังปิด..." : "ยืนยันปิดโต๊ะเดิม"}
            </button>
          </div>
        </div>
      )}

      {qrResult && (
        <div style={styles.qrBox}>
          {qrImageSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrImageSrc}
              alt={`QR code โต๊ะ ${qrResult.table_number}`}
              width={300}
              height={300}
            />
          )}
          <p style={styles.qrTableText}>โต๊ะ {qrResult.table_number}</p>
          <div style={styles.linkRow}>
            <span style={styles.linkText}>{orderUrl}</span>
            <button style={styles.copyButton} onClick={handleCopyLink}>
              {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
            </button>
          </div>
          <button style={styles.primaryButton} onClick={resetForm}>
            เปิดโต๊ะใหม่
          </button>
        </div>
      )}
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "2rem 1rem",
    fontFamily: "sans-serif",
    gap: "1.5rem",
  },
  title: {
    fontSize: "2rem",
    margin: 0,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    width: "100%",
    maxWidth: "360px",
  },
  label: {
    fontSize: "1.25rem",
    fontWeight: "bold",
  },
  input: {
    fontSize: "2rem",
    padding: "0.75rem",
    borderRadius: "8px",
    border: "2px solid #333",
    textAlign: "center",
  },
  primaryButton: {
    fontSize: "1.5rem",
    padding: "1rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#1a7f37",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryButton: {
    fontSize: "1.25rem",
    padding: "0.75rem 1.25rem",
    borderRadius: "8px",
    border: "2px solid #333",
    backgroundColor: "#fff",
    color: "#333",
    cursor: "pointer",
  },
  dangerButton: {
    fontSize: "1.25rem",
    padding: "0.75rem 1.25rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#d32f2f",
    color: "#fff",
    cursor: "pointer",
  },
  errorText: {
    color: "#d32f2f",
    fontSize: "1.1rem",
    fontWeight: "bold",
  },
  warningBox: {
    width: "100%",
    maxWidth: "360px",
    backgroundColor: "#fff3e0",
    border: "3px solid #f57c00",
    borderRadius: "12px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    alignItems: "center",
    textAlign: "center",
  },
  warningText: {
    fontSize: "1.3rem",
    fontWeight: "bold",
    color: "#e65100",
    margin: 0,
  },
  confirmBox: {
    width: "100%",
    maxWidth: "360px",
    backgroundColor: "#ffebee",
    border: "3px solid #d32f2f",
    borderRadius: "12px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    alignItems: "center",
    textAlign: "center",
  },
  confirmTitle: {
    fontSize: "1.4rem",
    fontWeight: "bold",
    color: "#b71c1c",
    margin: 0,
  },
  confirmDetail: {
    fontSize: "1.4rem",
    margin: 0,
    lineHeight: 1.6,
  },
  confirmButtonRow: {
    display: "flex",
    gap: "1rem",
  },
  qrBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    width: "100%",
    maxWidth: "360px",
  },
  qrTableText: {
    fontSize: "1.75rem",
    fontWeight: "bold",
    margin: 0,
  },
  linkRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  linkText: {
    fontSize: "1rem",
    wordBreak: "break-all",
  },
  copyButton: {
    fontSize: "0.9rem",
    padding: "0.4rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid #333",
    backgroundColor: "#f5f5f5",
    cursor: "pointer",
  },
};
