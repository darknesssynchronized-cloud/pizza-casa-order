"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const ACTIVE_STATUSES = ["received", "preparing", "baking", "ready"];

const NEXT_STATUS = {
  received: "preparing",
  preparing: "baking",
  baking: "ready",
  ready: "served",
};

const BUTTON_LABEL = {
  received: "เริ่มเตรียม",
  preparing: "เข้าเตาอบ",
  baking: "พร้อมเสิร์ฟ",
  ready: "เสิร์ฟแล้ว",
};

const CARD_COLOR = {
  received: { bg: "#ffffff", border: "#ccc", button: "#1a7f37" },
  preparing: { bg: "#fff9c4", border: "#f9a825", button: "#f9a825" },
  baking: { bg: "#ffe0b2", border: "#ef6c00", button: "#ef6c00" },
  ready: { bg: "#c8e6c9", border: "#2e7d32", button: "#2e7d32" },
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ItemLine({ item }) {
  if (item.type === "pizza") {
    const parts = [item.size, item.crust].filter(Boolean);
    return (
      <div style={styles.itemLine}>
        <p style={styles.itemName}>{item.name}</p>
        <p style={styles.itemDetail}>
          {parts.join(" · ")}
          {item.toppings && item.toppings.length > 0
            ? ` · ${item.toppings.join(", ")}`
            : ""}
        </p>
      </div>
    );
  }
  return (
    <div style={styles.itemLine}>
      <p style={styles.itemName}>
        {item.name} x{item.quantity}
      </p>
    </div>
  );
}

function OrderCard({ order, onAdvance }) {
  const colors = CARD_COLOR[order.status] || CARD_COLOR.received;
  const items = Array.isArray(order.items) ? order.items : [];
  const buttonLabel = BUTTON_LABEL[order.status] || "-";

  return (
    <div
      style={{
        ...styles.card,
        backgroundColor: colors.bg,
        borderColor: colors.border,
      }}
    >
      <div style={styles.cardHeader}>
        <span style={styles.tableNumber}>โต๊ะ {order.table_number}</span>
        <span style={styles.orderMeta}>
          #{order.id} · {formatTime(order.created_at)}
        </span>
      </div>

      <div style={styles.itemList}>
        {items.map((item, idx) => (
          <ItemLine key={idx} item={item} />
        ))}
      </div>

      <button
        style={{ ...styles.actionButton, backgroundColor: colors.button }}
        onClick={() => onAdvance(order)}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const upsertOrder = useCallback((row) => {
    setOrders((prev) => {
      if (!ACTIVE_STATUSES.includes(row.status)) {
        // served (หรือสถานะอื่นที่ไม่ต้องแสดง) -> เอาออกจากจอ
        return prev.filter((o) => o.id !== row.id);
      }
      const idx = prev.findIndex((o) => o.id === row.id);
      if (idx === -1) {
        // ออเดอร์ใหม่ -> ต่อท้ายรายการ (ใหม่ล่าสุดอยู่ท้ายกริด)
        return [...prev, row];
      }
      const next = [...prev];
      next[idx] = row;
      return next;
    });
  }, []);

  useEffect(() => {
    async function loadOrders() {
      const { data, error } = await supabase
        .from("orders")
        .select("id, session_id, table_number, items, status, created_at")
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setOrders(data);
      }
      setLoading(false);
    }

    loadOrders();

    const channel = supabase
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => upsertOrder(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => upsertOrder(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [upsertOrder]);

  async function handleAdvance(order) {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;
    const previousStatus = order.status;

    // อัปเดตหน้าจอทันที (optimistic) — ถ้าเป็น 'served' การ์ดจะหายไปเลย
    upsertOrder({ ...order, status: nextStatus });

    const { error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", order.id)
      .eq("status", previousStatus);

    if (error) {
      console.error(error);
      window.alert("เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      // คืนสถานะเดิมถ้าอัปเดตไม่สำเร็จ (ยกเว้นกรณี served ที่การ์ดหายไปแล้ว
      // จะดึงกลับมาไม่ได้ถ้าไม่มีข้อมูลเดิม แต่ previousStatus ยังอยู่ใน order)
      upsertOrder({ ...order, status: previousStatus });
    }
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>🍕 หน้าจอครัว — พิซซ่า คาซ่า</h1>
        <span style={styles.orderCount}>{orders.length} ออเดอร์</span>
      </header>

      {loading && <p style={styles.loadingText}>กำลังโหลด...</p>}

      {!loading && orders.length === 0 && (
        <p style={styles.emptyText}>ยังไม่มีออเดอร์ในขณะนี้</p>
      )}

      <div style={styles.grid}>
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} onAdvance={handleAdvance} />
        ))}
      </div>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    backgroundColor: "#212121",
    fontFamily: "sans-serif",
    padding: "1.5rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
  },
  headerTitle: {
    color: "#fff",
    fontSize: "2rem",
    margin: 0,
  },
  orderCount: {
    color: "#ccc",
    fontSize: "1.5rem",
    fontWeight: "bold",
  },
  loadingText: {
    color: "#fff",
    fontSize: "1.5rem",
    textAlign: "center",
  },
  emptyText: {
    color: "#999",
    fontSize: "1.75rem",
    textAlign: "center",
    marginTop: "3rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "1.25rem",
  },
  card: {
    borderRadius: "16px",
    border: "4px solid",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
  },
  cardHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  tableNumber: {
    fontSize: "2.25rem",
    fontWeight: "bold",
    lineHeight: 1.1,
  },
  orderMeta: {
    fontSize: "1.1rem",
    color: "#555",
  },
  itemList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  itemLine: {
    borderBottom: "1px solid rgba(0,0,0,0.1)",
    paddingBottom: "0.4rem",
  },
  itemName: {
    fontSize: "1.4rem",
    fontWeight: "bold",
    margin: 0,
  },
  itemDetail: {
    fontSize: "1.1rem",
    color: "#444",
    margin: "0.15rem 0 0 0",
  },
  actionButton: {
    marginTop: "0.5rem",
    padding: "1rem",
    fontSize: "1.4rem",
    fontWeight: "bold",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
  },
};
