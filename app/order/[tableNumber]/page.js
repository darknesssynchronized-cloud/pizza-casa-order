"use client";

import { use, useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

// ---------------------------------------------------------------------------
// ค่าคงที่ตัวเลือกพิซซ่า (ไม่มีตารางแยกในฐานข้อมูล — ดู CLAUDE.md)
// ---------------------------------------------------------------------------
const PIZZA_SIZES = [
  { id: "small", label: "เล็ก", priceModifier: -40 },
  { id: "medium", label: "กลาง", priceModifier: 0 },
  { id: "large", label: "ใหญ่", priceModifier: 70 },
];

const CRUST_OPTIONS = [
  { id: "regular", label: "ธรรมดา", priceModifier: 0 },
  { id: "thin", label: "บางกรอบ", priceModifier: 0 },
  { id: "cheese", label: "ขอบชีส", priceModifier: 59 },
];

const EXTRA_TOPPINGS = [
  { id: "mushroom", label: "เห็ด", price: 15 },
  { id: "egg", label: "ไข่ดาว", price: 15 },
  { id: "bacon", label: "เบคอน", price: 25 },
  { id: "olive", label: "มะกอก", price: 15 },
  { id: "corn", label: "ข้าวโพด", price: 15 },
  { id: "extra_cheese", label: "ชีสเพิ่ม", price: 25 },
];

const MAX_CART_LINES = 10;
const MAX_ITEM_QTY = 5;

const STATUS_STEPS = ["received", "preparing", "baking", "ready", "served"];
const STATUS_LABELS = {
  received: "รับออเดอร์แล้ว",
  preparing: "กำลังเตรียม",
  baking: "กำลังอบ",
  ready: "พร้อมเสิร์ฟ",
  served: "เสิร์ฟแล้ว",
};

function getItemType(categoryName) {
  if (!categoryName) return "snack";
  if (categoryName.includes("พิซซ่า")) return "pizza";
  if (categoryName.includes("เครื่องดื่ม")) return "drink";
  return "snack";
}

function formatBaht(amount) {
  return amount.toLocaleString("th-TH");
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export default function OrderPage({ params }) {
  // Next.js เวอร์ชันนี้ params เป็น Promise เสมอ ต้อง unwrap ด้วย use()
  const { tableNumber: tableNumberParam } = use(params);
  const tableNumber = Number(tableNumberParam);

  const [pageState, setPageState] = useState("loading"); // loading | not_found | open | closed
  const [session, setSession] = useState(null); // { id, table_number }

  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const [mainTab, setMainTab] = useState("menu"); // menu | tracking

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  const [customizeItem, setCustomizeItem] = useState(null); // menu item object
  const [simpleQty, setSimpleQty] = useState({}); // { [menuItemId]: qty }

  const [orders, setOrders] = useState([]);

  const [billOpen, setBillOpen] = useState(false);
  const [billLoading, setBillLoading] = useState(false);

  // ---------------------------------------------------------------------
  // 1. เช็ค session ของโต๊ะนี้
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      if (!Number.isInteger(tableNumber) || tableNumber <= 0) {
        setPageState("not_found");
        return;
      }
      const { data, error } = await supabase
        .from("sessions")
        .select("id, table_number, status")
        .eq("table_number", tableNumber)
        .eq("status", "open")
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setPageState("not_found");
        return;
      }
      setSession(data);
      setPageState("open");
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [tableNumber]);

  // ---------------------------------------------------------------------
  // 2. โหลดเมนู (เมื่อ session เปิดอยู่)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (pageState !== "open") return;

    async function loadMenu() {
      const { data: cats } = await supabase
        .from("menu_categories")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });

      const { data: items } = await supabase
        .from("menu_items")
        .select("id, category_id, name, description, base_price, image_url");

      setCategories(cats || []);
      setMenuItems(items || []);
      if (cats && cats.length > 0) {
        setActiveCategoryId(cats[0].id);
      }
    }

    loadMenu();
  }, [pageState]);

  // ---------------------------------------------------------------------
  // 5. โหลดออเดอร์ของ session นี้ + Realtime subscribe
  // ---------------------------------------------------------------------
  const upsertOrderLocal = useCallback((row) => {
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === row.id);
      let next;
      if (idx === -1) {
        next = [row, ...prev];
      } else {
        next = [...prev];
        next[idx] = row;
      }
      return next.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
    });
  }, []);

  useEffect(() => {
    if (pageState !== "open" || !session) return;

    async function loadOrders() {
      const { data } = await supabase
        .from("orders")
        .select("id, session_id, table_number, items, status, created_at")
        .eq("session_id", session.id)
        .order("created_at", { ascending: false });
      setOrders(data || []);
    }

    loadOrders();

    const channel = supabase
      .channel(`orders-session-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => upsertOrderLocal(payload.new)
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => upsertOrderLocal(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pageState, session, upsertOrderLocal]);

  // ---------------------------------------------------------------------
  // ตะกร้า
  // ---------------------------------------------------------------------
  function addPizzaToCart(menuItem, size, crust, toppings, quantity) {
    if (cart.length >= MAX_CART_LINES) {
      window.alert(`ตะกร้าเต็มแล้ว (สูงสุด ${MAX_CART_LINES} รายการ)`);
      return;
    }
    const unitPrice =
      menuItem.base_price +
      size.priceModifier +
      crust.priceModifier +
      toppings.reduce((sum, t) => sum + t.price, 0);

    const line = {
      cartLineId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "pizza",
      menuItemId: menuItem.id,
      name: menuItem.name,
      size,
      crust,
      toppings,
      quantity,
      unitPrice,
    };
    setCart((prev) => [...prev, line]);
    setCustomizeItem(null);
  }

  function addSimpleToCart(menuItem, type, quantity) {
    if (cart.length >= MAX_CART_LINES) {
      window.alert(`ตะกร้าเต็มแล้ว (สูงสุด ${MAX_CART_LINES} รายการ)`);
      return;
    }
    const line = {
      cartLineId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity,
      unitPrice: menuItem.base_price,
    };
    setCart((prev) => [...prev, line]);
    setSimpleQty((prev) => ({ ...prev, [menuItem.id]: 1 }));
  }

  function updateCartQty(cartLineId, delta) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.cartLineId === cartLineId
            ? {
                ...line,
                quantity: Math.min(
                  MAX_ITEM_QTY,
                  Math.max(1, line.quantity + delta)
                ),
              }
            : line
        )
    );
  }

  function removeCartLine(cartLineId) {
    setCart((prev) => prev.filter((line) => line.cartLineId !== cartLineId));
  }

  const cartTotal = cart.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );

  async function handleSubmitOrder() {
    if (cart.length === 0 || !session) return;
    setSubmitting(true);
    try {
      const items = cart.map((line) => {
        if (line.type === "pizza") {
          return {
            type: "pizza",
            name: line.name,
            size: line.size.label,
            crust: line.crust.label,
            toppings: line.toppings.map((t) => t.label),
            quantity: line.quantity,
            unit_price: line.unitPrice,
          };
        }
        return {
          type: line.type,
          name: line.name,
          quantity: line.quantity,
          unit_price: line.unitPrice,
        };
      });

      const { data, error } = await supabase
        .from("orders")
        .insert({
          session_id: session.id,
          table_number: session.table_number,
          items,
          status: "received",
        })
        .select("id, session_id, table_number, items, status, created_at")
        .single();

      if (error) throw error;

      if (data) upsertOrderLocal(data);
      setCart([]);
      setCartOpen(false);
      setToast("ส่งออเดอร์แล้ว");
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      console.error(err);
      window.alert("ส่งออเดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------
  // 6. เรียกเก็บเงิน
  // ---------------------------------------------------------------------
  const billTotal = orders.reduce((sum, order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    return (
      sum +
      items.reduce(
        (s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 0),
        0
      )
    );
  }, 0);

  async function handleConfirmBill() {
    if (!session) return;
    setBillLoading(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", session.id)
        .eq("status", "open");
      if (error) throw error;
      setBillOpen(false);
      setPageState("closed");
    } catch (err) {
      console.error(err);
      window.alert("ปิดโต๊ะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือแจ้งพนักงาน");
    } finally {
      setBillLoading(false);
    }
  }

  // ---------------------------------------------------------------------
  // Render: สถานะพิเศษ
  // ---------------------------------------------------------------------
  if (pageState === "loading") {
    return <FullScreenMessage text="กำลังโหลด..." />;
  }

  if (pageState === "not_found") {
    return (
      <FullScreenMessage text="โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงาน" />
    );
  }

  if (pageState === "closed") {
    return <FullScreenMessage text="ขอบคุณที่ใช้บริการ 🙏" emoji="🍕" />;
  }

  const itemsByCategory = menuItems.filter(
    (item) => item.category_id === activeCategoryId
  );

  return (
    <main style={styles.main}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>🍕 โต๊ะ {session.table_number}</span>
        <button style={styles.billButton} onClick={() => setBillOpen(true)}>
          เรียกเก็บเงิน
        </button>
      </div>

      {/* Main tabs */}
      <div style={styles.mainTabRow}>
        <button
          style={mainTab === "menu" ? styles.mainTabActive : styles.mainTab}
          onClick={() => setMainTab("menu")}
        >
          เมนู
        </button>
        <button
          style={
            mainTab === "tracking" ? styles.mainTabActive : styles.mainTab
          }
          onClick={() => setMainTab("tracking")}
        >
          ติดตามออเดอร์{orders.length > 0 ? ` (${orders.length})` : ""}
        </button>
      </div>

      {mainTab === "menu" && (
        <>
          <div style={styles.categoryTabRow}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                style={
                  cat.id === activeCategoryId
                    ? styles.categoryTabActive
                    : styles.categoryTab
                }
                onClick={() => setActiveCategoryId(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div style={styles.menuList}>
            {itemsByCategory.map((item) => {
              const category = categories.find((c) => c.id === item.category_id);
              const type = getItemType(category?.name);
              if (type === "pizza") {
                return (
                  <PizzaMenuCard
                    key={item.id}
                    item={item}
                    onSelect={() => setCustomizeItem(item)}
                  />
                );
              }
              return (
                <SimpleMenuCard
                  key={item.id}
                  item={item}
                  type={type}
                  qty={simpleQty[item.id] || 1}
                  onQtyChange={(q) =>
                    setSimpleQty((prev) => ({ ...prev, [item.id]: q }))
                  }
                  onAdd={(q) => addSimpleToCart(item, type, q)}
                />
              );
            })}
            {itemsByCategory.length === 0 && (
              <p style={styles.emptyText}>ยังไม่มีเมนูในหมวดนี้</p>
            )}
          </div>
        </>
      )}

      {mainTab === "tracking" && (
        <OrderTrackingList orders={orders} tableNumber={session.table_number} />
      )}

      {/* Floating cart bar */}
      {mainTab === "menu" && cart.length > 0 && (
        <button style={styles.cartBar} onClick={() => setCartOpen(true)}>
          🛒 ตะกร้า ({cart.length} รายการ) · ฿{formatBaht(cartTotal)}
        </button>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}

      {/* Pizza customize modal */}
      {customizeItem && (
        <PizzaCustomizeModal
          item={customizeItem}
          onClose={() => setCustomizeItem(null)}
          onAdd={addPizzaToCart}
        />
      )}

      {/* Cart modal */}
      {cartOpen && (
        <CartModal
          cart={cart}
          total={cartTotal}
          submitting={submitting}
          onUpdateQty={updateCartQty}
          onRemove={removeCartLine}
          onClose={() => setCartOpen(false)}
          onSubmit={handleSubmitOrder}
        />
      )}

      {/* Bill confirm modal */}
      {billOpen && (
        <BillConfirmModal
          total={billTotal}
          loading={billLoading}
          onCancel={() => setBillOpen(false)}
          onConfirm={handleConfirmBill}
        />
      )}
    </main>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function FullScreenMessage({ text, emoji }) {
  return (
    <main style={styles.fullScreenMessage}>
      {emoji && <div style={{ fontSize: "3rem" }}>{emoji}</div>}
      <p style={styles.fullScreenText}>{text}</p>
    </main>
  );
}

function PizzaMenuCard({ item, onSelect }) {
  return (
    <div style={styles.menuCard}>
      <MenuImage item={item} />
      <div style={styles.menuCardBody}>
        <p style={styles.menuName}>{item.name}</p>
        {item.description && (
          <p style={styles.menuDesc}>{item.description}</p>
        )}
        <p style={styles.menuPrice}>เริ่มต้น ฿{formatBaht(item.base_price)}</p>
        <button style={styles.selectButton} onClick={onSelect}>
          เลือกพิซซ่านี้
        </button>
      </div>
    </div>
  );
}

function SimpleMenuCard({ item, qty, onQtyChange, onAdd }) {
  return (
    <div style={styles.menuCard}>
      <MenuImage item={item} />
      <div style={styles.menuCardBody}>
        <p style={styles.menuName}>{item.name}</p>
        {item.description && (
          <p style={styles.menuDesc}>{item.description}</p>
        )}
        <p style={styles.menuPrice}>฿{formatBaht(item.base_price)}</p>
        <div style={styles.simpleAddRow}>
          <div style={styles.qtyStepper}>
            <button
              style={styles.qtyButton}
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
            >
              −
            </button>
            <span style={styles.qtyValue}>{qty}</span>
            <button
              style={styles.qtyButton}
              onClick={() => onQtyChange(Math.min(MAX_ITEM_QTY, qty + 1))}
            >
              +
            </button>
          </div>
          <button style={styles.addButton} onClick={() => onAdd(qty)}>
            เพิ่มลงตะกร้า
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuImage({ item }) {
  if (item.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={item.image_url} alt={item.name} style={styles.menuImage} />
    );
  }
  return (
    <div style={styles.menuImagePlaceholder}>
      {item.name ? item.name[0] : "🍽️"}
    </div>
  );
}

function PizzaCustomizeModal({ item, onClose, onAdd }) {
  const [sizeId, setSizeId] = useState("medium");
  const [crustId, setCrustId] = useState("regular");
  const [toppingIds, setToppingIds] = useState([]);
  const [quantity, setQuantity] = useState(1);

  const size = PIZZA_SIZES.find((s) => s.id === sizeId);
  const crust = CRUST_OPTIONS.find((c) => c.id === crustId);
  const toppings = EXTRA_TOPPINGS.filter((t) => toppingIds.includes(t.id));

  const unitPrice =
    item.base_price +
    size.priceModifier +
    crust.priceModifier +
    toppings.reduce((sum, t) => sum + t.price, 0);
  const total = unitPrice * quantity;

  function toggleTopping(id) {
    setToppingIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>{item.name}</p>
          <button style={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={styles.modalBody}>
          <p style={styles.optionGroupLabel}>ขนาด</p>
          <div style={styles.optionRow}>
            {PIZZA_SIZES.map((s) => (
              <button
                key={s.id}
                style={sizeId === s.id ? styles.optionChipActive : styles.optionChip}
                onClick={() => setSizeId(s.id)}
              >
                {s.label}
                {s.priceModifier !== 0 &&
                  ` (${s.priceModifier > 0 ? "+" : ""}${s.priceModifier})`}
              </button>
            ))}
          </div>

          <p style={styles.optionGroupLabel}>ขอบ</p>
          <div style={styles.optionRow}>
            {CRUST_OPTIONS.map((c) => (
              <button
                key={c.id}
                style={
                  crustId === c.id ? styles.optionChipActive : styles.optionChip
                }
                onClick={() => setCrustId(c.id)}
              >
                {c.label}
                {c.priceModifier !== 0 && ` (+${c.priceModifier})`}
              </button>
            ))}
          </div>

          <p style={styles.optionGroupLabel}>ท็อปปิ้งเพิ่ม</p>
          <div style={styles.optionRow}>
            {EXTRA_TOPPINGS.map((t) => (
              <button
                key={t.id}
                style={
                  toppingIds.includes(t.id)
                    ? styles.optionChipActive
                    : styles.optionChip
                }
                onClick={() => toggleTopping(t.id)}
              >
                {t.label} (+{t.price})
              </button>
            ))}
          </div>

          <p style={styles.optionGroupLabel}>จำนวน</p>
          <div style={styles.qtyStepper}>
            <button
              style={styles.qtyButton}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span style={styles.qtyValue}>{quantity}</span>
            <button
              style={styles.qtyButton}
              onClick={() => setQuantity((q) => Math.min(MAX_ITEM_QTY, q + 1))}
            >
              +
            </button>
          </div>
        </div>

        <div style={styles.modalFooter}>
          <p style={styles.modalTotal}>ราคารวม ฿{formatBaht(total)}</p>
          <button
            style={styles.primaryButton}
            onClick={() => onAdd(item, size, crust, toppings, quantity)}
          >
            เพิ่มลงตะกร้า
          </button>
        </div>
      </div>
    </div>
  );
}

function CartModal({ cart, total, submitting, onUpdateQty, onRemove, onClose, onSubmit }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>ตะกร้าของคุณ</p>
          <button style={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={styles.modalBody}>
          {cart.length === 0 && <p style={styles.emptyText}>ตะกร้าว่าง</p>}
          {cart.map((line) => (
            <div key={line.cartLineId} style={styles.cartLine}>
              <div style={{ flex: 1 }}>
                <p style={styles.cartLineName}>{line.name}</p>
                {line.type === "pizza" && (
                  <p style={styles.cartLineDetail}>
                    ไซส์{line.size.label} · ขอบ{line.crust.label}
                    {line.toppings.length > 0 &&
                      ` · ${line.toppings.map((t) => t.label).join(", ")}`}
                  </p>
                )}
                <p style={styles.cartLineDetail}>
                  ฿{formatBaht(line.unitPrice)} / ชิ้น
                </p>
              </div>
              <div style={styles.cartLineRight}>
                <div style={styles.qtyStepper}>
                  <button
                    style={styles.qtyButton}
                    onClick={() => onUpdateQty(line.cartLineId, -1)}
                  >
                    −
                  </button>
                  <span style={styles.qtyValue}>{line.quantity}</span>
                  <button
                    style={styles.qtyButton}
                    onClick={() => onUpdateQty(line.cartLineId, 1)}
                  >
                    +
                  </button>
                </div>
                <p style={styles.cartLineTotal}>
                  ฿{formatBaht(line.unitPrice * line.quantity)}
                </p>
                <button
                  style={styles.removeButton}
                  onClick={() => onRemove(line.cartLineId)}
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.modalFooter}>
          <p style={styles.modalTotal}>ยอดรวม ฿{formatBaht(total)}</p>
          <button
            style={{
              ...styles.primaryButton,
              opacity: cart.length === 0 || submitting ? 0.6 : 1,
            }}
            disabled={cart.length === 0 || submitting}
            onClick={onSubmit}
          >
            {submitting ? "กำลังส่ง..." : "ส่งออเดอร์"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderTrackingList({ orders }) {
  if (orders.length === 0) {
    return <p style={styles.emptyText}>ยังไม่มีออเดอร์ในรอบนี้</p>;
  }
  return (
    <div style={styles.trackingList}>
      {orders.map((order) => {
        const stepIndex = Math.max(0, STATUS_STEPS.indexOf(order.status));
        const items = Array.isArray(order.items) ? order.items : [];
        return (
          <div key={order.id} style={styles.orderCard}>
            <div style={styles.orderCardHeader}>
              <span style={styles.orderNumber}>ออเดอร์ #{order.id}</span>
              <span style={styles.orderTime}>{formatTime(order.created_at)}</span>
            </div>
            <p style={styles.orderItemsSummary}>
              {items.map((it) => `${it.name} x${it.quantity}`).join(", ")}
            </p>
            <div style={styles.progressRow}>
              {STATUS_STEPS.map((step, idx) => (
                <div key={step} style={styles.progressStep}>
                  <div
                    style={
                      idx <= stepIndex
                        ? styles.progressDotActive
                        : styles.progressDot
                    }
                  />
                  <span
                    style={
                      idx <= stepIndex
                        ? styles.progressLabelActive
                        : styles.progressLabel
                    }
                  >
                    {STATUS_LABELS[step]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BillConfirmModal({ total, loading, onCancel, onConfirm }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.confirmModal}>
        <p style={styles.modalTitle}>ยืนยันเรียกเก็บเงิน</p>
        <p style={styles.billTotal}>ยอดที่ต้องชำระ ฿{formatBaht(total)}</p>
        <div style={styles.confirmButtonRow}>
          <button style={styles.secondaryButton} onClick={onCancel} disabled={loading}>
            ยกเลิก
          </button>
          <button
            style={{ ...styles.dangerButton, opacity: loading ? 0.6 : 1 }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "กำลังปิดโต๊ะ..." : "ยืนยัน"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Styles
// ===========================================================================
const styles = {
  main: {
    minHeight: "100vh",
    fontFamily: "sans-serif",
    paddingBottom: "6rem",
    backgroundColor: "#fafafa",
  },
  fullScreenMessage: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "1rem",
    fontFamily: "sans-serif",
    textAlign: "center",
    padding: "2rem",
  },
  fullScreenText: {
    fontSize: "1.4rem",
    fontWeight: "bold",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem",
    backgroundColor: "#fff",
    borderBottom: "1px solid #eee",
    position: "sticky",
    top: 0,
    zIndex: 5,
  },
  headerTitle: {
    fontSize: "1.3rem",
    fontWeight: "bold",
  },
  billButton: {
    fontSize: "0.95rem",
    padding: "0.5rem 1rem",
    borderRadius: "20px",
    border: "none",
    backgroundColor: "#d32f2f",
    color: "#fff",
    cursor: "pointer",
  },
  mainTabRow: {
    display: "flex",
    backgroundColor: "#fff",
    borderBottom: "1px solid #eee",
  },
  mainTab: {
    flex: 1,
    padding: "0.9rem",
    fontSize: "1rem",
    border: "none",
    background: "none",
    color: "#888",
    cursor: "pointer",
    borderBottom: "3px solid transparent",
  },
  mainTabActive: {
    flex: 1,
    padding: "0.9rem",
    fontSize: "1rem",
    fontWeight: "bold",
    border: "none",
    background: "none",
    color: "#d32f2f",
    cursor: "pointer",
    borderBottom: "3px solid #d32f2f",
  },
  categoryTabRow: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.75rem 1rem",
    overflowX: "auto",
  },
  categoryTab: {
    padding: "0.5rem 1.1rem",
    borderRadius: "20px",
    border: "1px solid #ddd",
    backgroundColor: "#fff",
    color: "#555",
    fontSize: "0.95rem",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  categoryTabActive: {
    padding: "0.5rem 1.1rem",
    borderRadius: "20px",
    border: "1px solid #1a7f37",
    backgroundColor: "#1a7f37",
    color: "#fff",
    fontSize: "0.95rem",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  menuList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "0 1rem",
  },
  menuCard: {
    display: "flex",
    gap: "0.75rem",
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "0.75rem",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  menuImage: {
    width: "80px",
    height: "80px",
    objectFit: "cover",
    borderRadius: "8px",
    flexShrink: 0,
  },
  menuImagePlaceholder: {
    width: "80px",
    height: "80px",
    borderRadius: "8px",
    backgroundColor: "#f0d9b5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    flexShrink: 0,
  },
  menuCardBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  menuName: {
    fontWeight: "bold",
    fontSize: "1.05rem",
    margin: 0,
  },
  menuDesc: {
    fontSize: "0.85rem",
    color: "#777",
    margin: 0,
  },
  menuPrice: {
    fontSize: "0.95rem",
    fontWeight: "bold",
    color: "#1a7f37",
    margin: 0,
  },
  selectButton: {
    marginTop: "0.25rem",
    padding: "0.5rem",
    fontSize: "0.95rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#d32f2f",
    color: "#fff",
    cursor: "pointer",
  },
  simpleAddRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "0.25rem",
    flexWrap: "wrap",
  },
  qtyStepper: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  qtyButton: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    backgroundColor: "#fff",
    fontSize: "1.1rem",
    cursor: "pointer",
  },
  qtyValue: {
    minWidth: "1.5rem",
    textAlign: "center",
    fontSize: "1.05rem",
    fontWeight: "bold",
  },
  addButton: {
    padding: "0.5rem 0.9rem",
    fontSize: "0.9rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#1a7f37",
    color: "#fff",
    cursor: "pointer",
  },
  emptyText: {
    color: "#999",
    textAlign: "center",
    padding: "2rem 0",
  },
  cartBar: {
    position: "fixed",
    bottom: "1rem",
    left: "1rem",
    right: "1rem",
    padding: "1rem",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "#d32f2f",
    color: "#fff",
    fontSize: "1.05rem",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    zIndex: 10,
  },
  toast: {
    position: "fixed",
    top: "1rem",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#1a7f37",
    color: "#fff",
    padding: "0.75rem 1.5rem",
    borderRadius: "24px",
    fontSize: "1rem",
    zIndex: 20,
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 30,
  },
  modal: {
    width: "100%",
    maxWidth: "480px",
    maxHeight: "85vh",
    backgroundColor: "#fff",
    borderTopLeftRadius: "16px",
    borderTopRightRadius: "16px",
    display: "flex",
    flexDirection: "column",
  },
  confirmModal: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "#fff",
    borderRadius: "16px",
    padding: "1.5rem",
    margin: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    alignItems: "center",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem",
    borderBottom: "1px solid #eee",
  },
  modalTitle: {
    fontSize: "1.2rem",
    fontWeight: "bold",
    margin: 0,
  },
  closeButton: {
    border: "none",
    background: "none",
    fontSize: "1.3rem",
    cursor: "pointer",
    color: "#888",
  },
  modalBody: {
    padding: "1rem",
    overflowY: "auto",
    flex: 1,
  },
  optionGroupLabel: {
    fontWeight: "bold",
    marginTop: "0.75rem",
    marginBottom: "0.4rem",
  },
  optionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  optionChip: {
    padding: "0.5rem 0.9rem",
    borderRadius: "20px",
    border: "1px solid #ddd",
    backgroundColor: "#fff",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  optionChipActive: {
    padding: "0.5rem 0.9rem",
    borderRadius: "20px",
    border: "1px solid #d32f2f",
    backgroundColor: "#d32f2f",
    color: "#fff",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  modalFooter: {
    padding: "1rem",
    borderTop: "1px solid #eee",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
  },
  modalTotal: {
    fontSize: "1.15rem",
    fontWeight: "bold",
    margin: 0,
  },
  primaryButton: {
    padding: "0.85rem 1.5rem",
    fontSize: "1rem",
    fontWeight: "bold",
    borderRadius: "10px",
    border: "none",
    backgroundColor: "#1a7f37",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "0.75rem 1.25rem",
    fontSize: "1rem",
    borderRadius: "10px",
    border: "1px solid #333",
    backgroundColor: "#fff",
    cursor: "pointer",
  },
  dangerButton: {
    padding: "0.75rem 1.25rem",
    fontSize: "1rem",
    borderRadius: "10px",
    border: "none",
    backgroundColor: "#d32f2f",
    color: "#fff",
    cursor: "pointer",
  },
  confirmButtonRow: {
    display: "flex",
    gap: "1rem",
  },
  billTotal: {
    fontSize: "1.4rem",
    fontWeight: "bold",
  },
  cartLine: {
    display: "flex",
    gap: "0.75rem",
    padding: "0.75rem 0",
    borderBottom: "1px solid #f0f0f0",
  },
  cartLineName: {
    fontWeight: "bold",
    margin: 0,
  },
  cartLineDetail: {
    fontSize: "0.85rem",
    color: "#777",
    margin: "0.15rem 0 0 0",
  },
  cartLineRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "0.35rem",
  },
  cartLineTotal: {
    fontWeight: "bold",
    margin: 0,
  },
  removeButton: {
    border: "none",
    background: "none",
    color: "#d32f2f",
    fontSize: "0.85rem",
    cursor: "pointer",
    padding: 0,
  },
  trackingList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "0 1rem",
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "1rem",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  orderCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "0.4rem",
  },
  orderNumber: {
    fontWeight: "bold",
  },
  orderTime: {
    color: "#999",
    fontSize: "0.85rem",
  },
  orderItemsSummary: {
    fontSize: "0.9rem",
    color: "#555",
    marginBottom: "0.75rem",
  },
  progressRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  progressStep: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
    gap: "0.25rem",
  },
  progressDot: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "#ddd",
  },
  progressDotActive: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "#1a7f37",
  },
  progressLabel: {
    fontSize: "0.65rem",
    color: "#bbb",
    textAlign: "center",
  },
  progressLabelActive: {
    fontSize: "0.65rem",
    color: "#1a7f37",
    fontWeight: "bold",
    textAlign: "center",
  },
};
