const state = {
  menu: [],
  menuById: new Map(),
  cart: [],
  orders: [],
  combos: [],
  comboDrafts: {},
  selectedCategory: "ALL",
};

const menuGrid = document.getElementById("menuGrid");
const menuCategoryBar = document.getElementById("menuCategoryBar");
const comboQuickSection = document.getElementById("comboQuickSection");
const cartList = document.getElementById("cartList");
const totalEl = document.getElementById("total");
const messageEl = document.getElementById("message");
const submitOrderBtn = document.getElementById("submitOrderBtn");
const ordersEl = document.getElementById("orders");
const sourceSelect = document.getElementById("sourceSelect");

const currency = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
const RECENT_ORDER_LIMIT = 12;
const datetimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const STATUS_LABEL = {
  pending: "待處理",
  preparing: "製作中",
  ready: "可取餐",
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

const CATEGORY_LABEL = {
  ALL: "全部",
  DRINK: "飲料",
  MAIN: "主餐",
  RICE: "飯類",
  TOAST: "吐司",
  WRAP: "捲餅",
  NOODLE: "麵食",
  SALAD: "沙拉",
  SNACK: "點心",
  OTHER: "其他",
};

const CATEGORY_ORDER = ["DRINK", "MAIN", "RICE", "TOAST", "WRAP", "NOODLE", "SALAD", "SNACK", "OTHER"];
const TAG_CATEGORY_MAP = {
  DRINK: "DRINK",
  PASTA_RICE: "MAIN",
  RICE_SAUCE_DON: "RICE",
  JAM_TOAST: "TOAST",
  TOAST_EGG: "TOAST",
  WRAP: "WRAP",
  UDON: "NOODLE",
  SALAD: "SALAD",
  SNACK: "SNACK",
  TURNIP_CAKE: "SNACK",
};

function escapeHtml(value) {
  const text = String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/gi, "");
}

function formatMoney(value) {
  return currency.format(Number(value || 0));
}

function formatTaipeiTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return `${datetimeFormatter.format(parsed)} (UTC+8)`;
}

function summarizeOrderItems(items, maxShown = 3) {
  if (!Array.isArray(items) || !items.length) return "無品項";
  const shown = items.slice(0, maxShown).map((item) => {
    const note = item.note ? ` (${item.note})` : "";
    return `${item.menu_item_name} x${item.quantity}${note}`;
  });
  const hidden = items.length - shown.length;
  if (hidden > 0) {
    return `${shown.join(" / ")} +${hidden}項`;
  }
  return shown.join(" / ");
}

function byId(id) {
  return state.menuById.get(id) || null;
}

function mapTagToCategory(tag) {
  if (!tag) return null;
  return TAG_CATEGORY_MAP[tag] || null;
}

function detectCategory(name) {
  if (/\((M|L)\)\s*$/i.test(name)) return "DRINK";
  if (/(紅茶|奶茶|咖啡|豆漿|果汁|冬瓜|拿鐵|美式|百香|鳳梨|檸檬|飲)/.test(name)) return "DRINK";
  if (/(燉飯|義大利麵|丼飯|烏龍麵|飯|麵|醬汁)/.test(name)) return "MAIN";
  if (/(吐司)/.test(name)) return "TOAST";
  if (/(捲餅)/.test(name)) return "WRAP";
  if (/(沙拉)/.test(name)) return "SALAD";
  if (/(點心|薯餅|脆薯|荷包蛋|花蛤湯|地瓜|蘿蔔糕|雞條)/.test(name)) return "SNACK";
  return "OTHER";
}

function normalizeMenuItem(item) {
  const rawName = String(item.name || "").trim();
  let displayName = rawName;
  let taggedCategory = null;

  const bracketTag = rawName.match(/^\[([A-Z_]+)\]\s*(.+)$/);
  if (bracketTag) {
    taggedCategory = bracketTag[1];
    displayName = bracketTag[2].trim();
  }

  const category = mapTagToCategory(taggedCategory) || detectCategory(displayName);

  return {
    ...item,
    display_name: displayName || rawName,
    category,
  };
}

function sortMenu(items) {
  return [...items].sort((a, b) => {
    const aCat = CATEGORY_ORDER.indexOf(a.category);
    const bCat = CATEGORY_ORDER.indexOf(b.category);
    if (aCat !== bCat) return aCat - bCat;
    return a.id - b.id;
  });
}

function getCategoryStats() {
  const stats = new Map();
  state.menu.forEach((item) => {
    const current = stats.get(item.category) || 0;
    stats.set(item.category, current + 1);
  });
  return stats;
}

function renderCategoryBar() {
  const stats = getCategoryStats();
  const categories = CATEGORY_ORDER.filter((key) => stats.has(key));
  const allCount = state.menu.length;

  menuCategoryBar.innerHTML = "";
  const chips = [{ key: "ALL", count: allCount }, ...categories.map((key) => ({ key, count: stats.get(key) }))];

  chips.forEach((chip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-chip${state.selectedCategory === chip.key ? " active" : ""}`;
    button.textContent = `${CATEGORY_LABEL[chip.key] || chip.key} (${chip.count})`;
    button.addEventListener("click", () => {
      state.selectedCategory = chip.key;
      renderCategoryBar();
      renderMenu();
    });
    menuCategoryBar.appendChild(button);
  });
}

function renderMenu() {
  menuGrid.innerHTML = "";
  if (!state.menu.length) {
    menuGrid.innerHTML = '<div class="menu-empty">目前沒有可販售品項。</div>';
    return;
  }

  const rows =
    state.selectedCategory === "ALL"
      ? state.menu
      : state.menu.filter((item) => item.category === state.selectedCategory);

  if (!rows.length) {
    menuGrid.innerHTML = '<div class="menu-empty">這個分類目前沒有品項。</div>';
    return;
  }

  rows.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-item";
    card.innerHTML = `
      <span class="menu-item-category">${escapeHtml(CATEGORY_LABEL[item.category] || "其他")}</span>
      <strong class="menu-item-name">${escapeHtml(item.display_name)}</strong>
      <div class="menu-item-price">$${formatMoney(item.price)}</div>
      <button data-id="${item.id}" type="button">加入</button>
    `;
    card.querySelector("button").addEventListener("click", () => addToCart(item.id));
    menuGrid.appendChild(card);
  });
}

function findMenuItemForSideOption(sideName) {
  const target = normalizeLookup(sideName);
  if (!target) return null;

  const candidates = state.menu
    .map((item) => {
      const normalized = normalizeLookup(item.display_name);
      if (!normalized) return null;
      if (!normalized.includes(target) && !target.includes(normalized)) return null;
      let score = 0;
      if (item.category === "SNACK") score += 100;
      if (item.category === "SALAD") score += 40;
      score -= Math.abs(normalized.length - target.length);
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates.length ? candidates[0].item : null;
}

function ensureComboDraft(combo) {
  const key = String(combo.id);
  if (!state.comboDrafts[key]) {
    state.comboDrafts[key] = {
      drink_item_ids: [],
      side_codes: [],
    };
  }

  const draft = state.comboDrafts[key];
  if (!Array.isArray(draft.drink_item_ids)) draft.drink_item_ids = [];
  if (!Array.isArray(draft.side_codes)) draft.side_codes = [];

  const neededDrinkSlots = Number(combo.drink_choice_count || 0);
  while (draft.drink_item_ids.length < neededDrinkSlots) {
    draft.drink_item_ids.push(combo.eligible_drinks[draft.drink_item_ids.length]?.menu_item_id || "");
  }
  draft.drink_item_ids = draft.drink_item_ids.slice(0, neededDrinkSlots);
  return draft;
}

function applyCombo(combo) {
  const draft = ensureComboDraft(combo);
  const chosenDrinkIds = draft.drink_item_ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (chosenDrinkIds.length < combo.drink_choice_count) {
    messageEl.textContent = `請先選滿 ${combo.drink_choice_count} 杯飲料（${combo.name}）。`;
    return;
  }

  const selectedSideCodes = [...draft.side_codes];
  if (selectedSideCodes.length < combo.side_choice_count) {
    messageEl.textContent = `請先選滿 ${combo.side_choice_count} 個副餐（${combo.name}）。`;
    return;
  }

  const mappedSideIds = [];
  const unresolved = [];
  selectedSideCodes.forEach((code) => {
    const option = combo.side_options.find((side) => side.code === code);
    if (!option) return;
    const mapped = findMenuItemForSideOption(option.name);
    if (!mapped) {
      unresolved.push(option.name);
      return;
    }
    mappedSideIds.push(mapped.id);
  });

  if (unresolved.length) {
    messageEl.textContent = `副餐未對應到菜單：${unresolved.join("、")}，請手動加入。`;
    return;
  }

  const allIds = [...chosenDrinkIds, ...mappedSideIds];
  allIds.forEach((menuItemId) => addToCart(menuItemId, { render: false }));
  renderCart();
  messageEl.textContent = `已加入 ${combo.name}（${allIds.length} 項，單品計價）。`;
}

function renderComboQuick() {
  comboQuickSection.innerHTML = "";
  if (!state.combos.length) {
    comboQuickSection.style.display = "none";
    return;
  }
  comboQuickSection.style.display = "grid";

  const head = document.createElement("div");
  head.className = "combo-headline";
  head.innerHTML = "<strong>套餐快捷加入</strong><span>先選飲料/副餐，再一次加入購物車</span>";
  comboQuickSection.appendChild(head);

  state.combos.forEach((combo) => {
    const draft = ensureComboDraft(combo);
    const card = document.createElement("article");
    card.className = "combo-card";

    const sideRows = combo.side_options.map((option) => {
      const mapped = findMenuItemForSideOption(option.name);
      return {
        ...option,
        mappedMenuName: mapped ? mapped.display_name : null,
      };
    });

    card.innerHTML = `
      <div class="combo-title-row">
        <h3>${escapeHtml(combo.name)}</h3>
        <span class="combo-price">$${formatMoney(combo.bundle_price)}</span>
      </div>
      <div class="combo-meta">
        <span>飲料：${combo.drink_choice_count} 杯</span>
        <span>副餐：${combo.side_choice_count} 份</span>
      </div>
      <p class="combo-note">套餐規則輔助選擇，送單時目前仍以單品價格計算。</p>
      <div class="combo-controls"></div>
      <button class="combo-add-btn" type="button">加入 ${escapeHtml(combo.name)}</button>
    `;

    const controls = card.querySelector(".combo-controls");

    if (combo.drink_choice_count > 0) {
      const drinkWrap = document.createElement("div");
      drinkWrap.className = "combo-control-block";
      const title = document.createElement("p");
      title.className = "combo-control-title";
      title.textContent = `飲料選擇 (${combo.drink_choice_count})`;
      drinkWrap.appendChild(title);

      for (let i = 0; i < combo.drink_choice_count; i += 1) {
        const select = document.createElement("select");
        select.className = "combo-select";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = `選擇飲料 ${i + 1}`;
        select.appendChild(placeholder);

        combo.eligible_drinks.forEach((drink) => {
          const option = document.createElement("option");
          option.value = String(drink.menu_item_id);
          option.textContent = drink.menu_item_name;
          select.appendChild(option);
        });

        select.value = draft.drink_item_ids[i] ? String(draft.drink_item_ids[i]) : "";
        select.addEventListener("change", (evt) => {
          draft.drink_item_ids[i] = evt.target.value ? Number(evt.target.value) : "";
        });
        drinkWrap.appendChild(select);
      }
      controls.appendChild(drinkWrap);
    }

    if (combo.side_choice_count > 0) {
      const sideWrap = document.createElement("div");
      sideWrap.className = "combo-control-block";
      const title = document.createElement("p");
      title.className = "combo-control-title";
      title.textContent = `副餐選擇 (${combo.side_choice_count})`;
      sideWrap.appendChild(title);

      sideRows.forEach((option) => {
        const row = document.createElement("label");
        row.className = "combo-side-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = option.code;
        checkbox.checked = draft.side_codes.includes(option.code);
        checkbox.addEventListener("change", (evt) => {
          if (evt.target.checked) {
            if (draft.side_codes.length >= combo.side_choice_count) {
              evt.target.checked = false;
              messageEl.textContent = `${combo.name} 最多選 ${combo.side_choice_count} 個副餐。`;
              return;
            }
            draft.side_codes.push(option.code);
          } else {
            draft.side_codes = draft.side_codes.filter((code) => code !== option.code);
          }
        });

        const text = document.createElement("span");
        text.className = "combo-side-text";
        if (option.mappedMenuName) {
          text.textContent = `${option.code}. ${option.name} → ${option.mappedMenuName}`;
        } else {
          text.textContent = `${option.code}. ${option.name}（未對應商品）`;
          row.classList.add("unmapped");
        }

        row.appendChild(checkbox);
        row.appendChild(text);
        sideWrap.appendChild(row);
      });
      controls.appendChild(sideWrap);
    }

    card.querySelector(".combo-add-btn").addEventListener("click", () => applyCombo(combo));
    comboQuickSection.appendChild(card);
  });
}

function addToCart(menuItemId, options = {}) {
  const { render = true } = options;
  const existing = state.cart.find((line) => line.menu_item_id === menuItemId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ menu_item_id: menuItemId, quantity: 1 });
  }
  if (render) renderCart();
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
    cartList.innerHTML = '<li class="cart-empty">購物車目前是空的，請先加入品項。</li>';
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
        <strong class="cart-line-name">${escapeHtml(item.display_name || item.name)}</strong>
        <span class="cart-line-total">$${formatMoney(lineTotal)}</span>
      </div>
      <div class="cart-line-sub">
        <span class="cart-line-qty">數量 x${line.quantity}</span>
        <div class="cart-line-actions">
          <button data-op="plus" type="button" aria-label="增加數量">+</button>
          <button data-op="minus" type="button" aria-label="減少數量">-</button>
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

  state.orders.slice(0, RECENT_ORDER_LIMIT).forEach((order) => {
    const itemsText = summarizeOrderItems(order.items, 3);
    const itemCount = Array.isArray(order.items)
      ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      : 0;

    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-head">
        <h3 class="order-number">#${escapeHtml(order.order_number)}</h3>
        <div class="badge">${escapeHtml(STATUS_LABEL[order.status] || order.status)}</div>
      </div>
      <div class="order-meta">
        <span>來源 ${escapeHtml(SOURCE_LABEL[order.source] || order.source)}</span>
        <span>付款 ${escapeHtml(PAYMENT_LABEL[order.payment_status] || order.payment_status)}</span>
        <span>件數 ${itemCount}</span>
        <span>總額 $${formatMoney(order.total_amount)}</span>
        <span>台灣時間 ${formatTaipeiTime(order.created_at)}</span>
      </div>
      <div class="order-items">${escapeHtml(itemsText)}</div>
      <div class="order-actions"></div>
    `;

    const actionWrap = card.querySelector(".order-actions");
    if (["pending", "preparing", "ready"].includes(order.status)) {
      const amendBtn = document.createElement("button");
      amendBtn.textContent = "用購物車修改";
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
  if (!diff) return "沒有變更";
  const parts = [];
  if (Array.isArray(diff.added) && diff.added.length) parts.push(`新增 ${diff.added.length} 項`);
  if (Array.isArray(diff.removed) && diff.removed.length) parts.push(`移除 ${diff.removed.length} 項`);
  if (Array.isArray(diff.quantity_changed) && diff.quantity_changed.length) parts.push(`調整 ${diff.quantity_changed.length} 項`);
  return parts.length ? parts.join(" / ") : "沒有變更";
}

async function fetchMenu() {
  const res = await Auth.authFetch("/api/menu/items");
  if (!res.ok) throw new Error(await Auth.readErrorMessage(res));
  const rawRows = await res.json();
  state.menu = sortMenu(rawRows.map(normalizeMenuItem));
  state.menuById = new Map(state.menu.map((item) => [item.id, item]));
  renderCategoryBar();
  renderMenu();
}

async function fetchCombos() {
  const res = await Auth.authFetch("/api/menu/combos");
  if (!res.ok) throw new Error(await Auth.readErrorMessage(res));
  const rows = await res.json();
  state.combos = rows || [];
  renderComboQuick();
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
      items: buildCartItemsPayload(),
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
    messageEl.textContent = "購物車是空的，無法覆蓋訂單。";
    return;
  }

  messageEl.textContent = `正在覆蓋訂單 ${orderNumber}...`;
  try {
    const res = await Auth.authFetch(`/api/orders/${orderId}/amend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: buildCartItemsPayload() }),
    });
    if (!res.ok) throw new Error(await Auth.readErrorMessage(res));
    const payload = await res.json();
    messageEl.textContent = `覆蓋完成：${orderNumber}，${summarizeDiff(payload.diff)}`;
    await fetchRecentOrders();
  } catch (err) {
    messageEl.textContent = `覆蓋失敗：${String(err.message || err)}`;
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
      messageEl.textContent = "即時連線中斷，系統會自動重連。";
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
  await Promise.all([fetchMenu(), fetchCombos(), fetchRecentOrders()]);
  renderCart();
  setupWebsocket();
  setInterval(fetchRecentOrders, 30000);
}

bootstrap().catch((err) => {
  messageEl.textContent = `初始化失敗：${String(err.message || err)}`;
});
