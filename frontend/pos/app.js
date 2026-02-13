const state = {
  menu: [],
  cart: [],
  orders: [],
};

const menuGrid = document.getElementById("menuGrid");
const cartList = document.getElementById("cartList");
const totalEl = document.getElementById("total");
const messageEl = document.getElementById("message");
const submitOrderBtn = document.getElementById("submitOrderBtn");
const ordersEl = document.getElementById("orders");
const sourceSelect = document.getElementById("sourceSelect");

const currency = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
const datetimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABEL = {
  pending: "待處理",
  preparing: "製作中",
  ready: "待取餐",
  completed: "已完成",
  cancelled: "已取消",
};

const SOURCE_LABEL = {
  takeout: "外帶",
  dine_in: "內用",
  delivery: "外送",
};

const PAYMENT_LABEL = {
  unpaid: "未付款",
  paid: "已付款",
  refunded: "已退款",
};

function byId(id) {
  return state.menu.find((item) => item.id === id);
}

function formatMoney(value) {
  return currency.format(Number(value || 0));
}

function renderMenu() {
  menuGrid.innerHTML = "";
  if (!state.menu.length) {
    menuGrid.innerHTML = '<div class="menu-empty">目前沒有可販售品項。</div>';
    return;
  }

  state.menu.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-item";
    card.innerHTML = `
      <strong class="menu-item-name">${item.name}</strong>
      <div class="menu-item-price">$${formatMoney(item.price)}</div>
      <button data-id="${item.id}" type="button">加入</button>
    `;
    card.querySelector("button").addEventListener("click", () => addToCart(item.id));
    menuGrid.appendChild(card);
  });
}

function addToCart(menuItemId) {
  const existing = state.cart.find((line) => line.menu_item_id === menuItemId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ menu_item_id: menuItemId, quantity: 1 });
  }
  renderCart();
}

function updateQty(menuItemId, delta) {
  const line = state.cart.find((row) => row.menu_item_id === menuItemId);
  if (!line) return;
  line.quantity += delta;
  if (line.quantity <= 0) {
    state.cart = state.cart.filter((row) => row.menu_item_id !== menuItemId);
  }
  renderCart();
}

function renderCart() {
  cartList.innerHTML = "";
  let total = 0;

  if (!state.cart.length) {
    cartList.innerHTML = '<li class="cart-empty">購物車是空的，請先加入餐點。</li>';
  }

  state.cart.forEach((line) => {
    const item = byId(line.menu_item_id);
    if (!item) return;
    const lineTotal = item.price * line.quantity;
    total += lineTotal;

    const li = document.createElement("li");
    li.className = "cart-line";
    li.innerHTML = `
      <div class="cart-line-main">
        <strong class="cart-line-name">${item.name}</strong>
        <span class="cart-line-total">$${formatMoney(lineTotal)}</span>
      </div>
      <div class="cart-line-sub">
        <span class="cart-line-qty">數量 x${line.quantity}</span>
        <div class="cart-line-actions">
          <button data-op="plus" type="button" aria-label="增加數量">＋</button>
          <button data-op="minus" type="button" aria-label="減少數量">－</button>
        </div>
      </div>
    `;
    li.querySelector('[data-op="plus"]').addEventListener("click", () => updateQty(line.menu_item_id, 1));
    li.querySelector('[data-op="minus"]').addEventListener("click", () => updateQty(line.menu_item_id, -1));
    cartList.appendChild(li);
  });

  totalEl.textContent = formatMoney(total);
  submitOrderBtn.disabled = state.cart.length === 0;
  renderRecentOrders();
}

function renderRecentOrders() {
  ordersEl.innerHTML = "";
  if (!state.orders.length) {
    ordersEl.innerHTML = '<div class="orders-empty">目前沒有近期訂單。</div>';
    return;
  }

  state.orders.slice(0, 30).forEach((order) => {
    const itemsText = order.items
      .map((item) => `${item.menu_item_name} x${item.quantity}${item.note ? ` (${item.note})` : ""}`)
      .join("、");
    const createdAt = new Date(order.created_at);

    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-head">
        <h3 class="order-number">#${order.order_number}</h3>
        <div class="badge">${STATUS_LABEL[order.status] || order.status}</div>
      </div>
      <div class="order-meta">
        <span>來源 ${SOURCE_LABEL[order.source] || order.source}</span>
        <span>付款 ${PAYMENT_LABEL[order.payment_status] || order.payment_status}</span>
        <span>金額 $${formatMoney(order.total_amount)}</span>
        <span>時間 ${datetimeFormatter.format(createdAt)}</span>
      </div>
      <div class="order-items">${itemsText}</div>
      <div class="order-actions"></div>
    `;

    const actionWrap = card.querySelector(".order-actions");
    if (["pending", "preparing", "ready"].includes(order.status)) {
      const amendBtn = document.createElement("button");
      amendBtn.textContent = "用購物車改單";
      amendBtn.disabled = state.cart.length === 0;
      amendBtn.addEventListener("click", () => amendOrder(order.id, order.order_number));
      actionWrap.appendChild(amendBtn);
    }
    ordersEl.appendChild(card);
  });
}

function buildCartItemsPayload() {
  return state.cart.map((line) => ({
    menu_item_id: line.menu_item_id,
    quantity: line.quantity,
  }));
}

function summarizeDiff(diff) {
  if (!diff) return "內容已更新";
  const parts = [];
  if (Array.isArray(diff.added) && diff.added.length) parts.push(`新增 ${diff.added.length} 項`);
  if (Array.isArray(diff.removed) && diff.removed.length) parts.push(`刪除 ${diff.removed.length} 項`);
  if (Array.isArray(diff.quantity_changed) && diff.quantity_changed.length) parts.push(`調整 ${diff.quantity_changed.length} 項`);
  return parts.length ? parts.join(" / ") : "內容未變更";
}

async function fetchMenu() {
  const res = await Auth.authFetch("/api/menu/items");
  if (!res.ok) throw new Error(await Auth.readErrorMessage(res));
  state.menu = await res.json();
  renderMenu();
}

async function fetchRecentOrders() {
  const res = await Auth.authFetch("/api/orders?limit=50");
  if (!res.ok) throw new Error(await Auth.readErrorMessage(res));
  state.orders = await res.json();
  renderRecentOrders();
}

async function submitOrder() {
  if (!state.cart.length) return;
  messageEl.textContent = "送單中...";
  submitOrderBtn.disabled = true;

  try {
    const payload = {
      source: sourceSelect.value,
      auto_pay: true,
      items: state.cart.map((line) => ({
        menu_item_id: line.menu_item_id,
        quantity: line.quantity,
      })),
    };
    const res = await Auth.authFetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await Auth.readErrorMessage(res));

    const data = await res.json();
    messageEl.textContent = `訂單建立成功：${data.order_number}`;
    state.cart = [];
    renderCart();
    await fetchRecentOrders();
  } catch (err) {
    messageEl.textContent = `送單失敗：${String(err.message || err)}`;
  } finally {
    submitOrderBtn.disabled = state.cart.length === 0;
  }
}

async function amendOrder(orderId, orderNumber) {
  if (!state.cart.length) {
    messageEl.textContent = "購物車是空的，無法改單";
    return;
  }

  messageEl.textContent = `改單中：${orderNumber}...`;
  try {
    const res = await Auth.authFetch(`/api/orders/${orderId}/amend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: buildCartItemsPayload(),
      }),
    });
    if (!res.ok) throw new Error(await Auth.readErrorMessage(res));
    const payload = await res.json();
    messageEl.textContent = `改單成功：${orderNumber}（${summarizeDiff(payload.diff)}）`;
    await fetchRecentOrders();
  } catch (err) {
    messageEl.textContent = `改單失敗：${String(err.message || err)}`;
  }
}

function setupWebsocket() {
  Auth.connectEventSocket({
    onMessage: (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload.event && payload.event !== "connected") {
          fetchRecentOrders();
        }
      } catch (_) {
        // Ignore malformed payload.
      }
    },
    onDisconnected: () => {
      messageEl.textContent = "即時連線中斷，系統將自動重連...";
    },
    onConnected: () => {
      if (messageEl.textContent.startsWith("即時連線中斷")) {
        messageEl.textContent = "";
      }
    },
  });
}

submitOrderBtn.addEventListener("click", submitOrder);

async function bootstrap() {
  await Auth.ensureAuth(["staff", "manager", "owner"]);
  await Promise.all([fetchMenu(), fetchRecentOrders()]);
  renderCart();
  setupWebsocket();
  setInterval(fetchRecentOrders, 30000);
}

bootstrap().catch((err) => {
  messageEl.textContent = `初始化失敗：${String(err.message || err)}`;
});
