const ingredientBody = document.getElementById("ingredientBody");
const movementForm = document.getElementById("movementForm");
const movementMsg = document.getElementById("movementMsg");

const totalRevenue = document.getElementById("totalRevenue");
const totalOrders = document.getElementById("totalOrders");
const avgTicket = document.getElementById("avgTicket");
const inventoryValue = document.getElementById("inventoryValue");
const topItems = document.getElementById("topItems");
const lowStock = document.getElementById("lowStock");
const auditList = document.getElementById("auditList");

const fmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

function formatMoney(value) {
  return fmt.format(Number(value || 0));
}

function calcScrollState(container) {
  return {
    top: container.scrollTop,
    height: container.scrollHeight,
    nearTop: container.scrollTop <= 24,
  };
}

function restoreScrollState(container, prev) {
  if (!prev || prev.nearTop) return;
  const delta = container.scrollHeight - prev.height;
  container.scrollTop = Math.max(0, prev.top + delta);
}

function renderListStable({ container, signature, rows, emptyText, renderRow }) {
  if (container.dataset.signature === signature) return;
  const scrollState = calcScrollState(container);

  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = `<li>${emptyText}</li>`;
    container.dataset.signature = signature;
    restoreScrollState(container, scrollState);
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    fragment.appendChild(renderRow(row));
  });
  container.appendChild(fragment);
  container.dataset.signature = signature;
  restoreScrollState(container, scrollState);
}

async function fetchIngredients() {
  const res = await Auth.authFetch("/api/inventory/ingredients");
  if (!res.ok) throw new Error(await Auth.readErrorMessage(res));

  const rows = await res.json();
  ingredientBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const lowFlag = row.current_stock <= row.reorder_level ? " (低庫存)" : "";
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.name}${lowFlag}</td>
      <td>${row.unit}</td>
      <td>${formatMoney(row.current_stock)}</td>
      <td>${formatMoney(row.reorder_level)}</td>
      <td>${formatMoney(row.cost_per_unit)}</td>
    `;
    ingredientBody.appendChild(tr);
  });
}

async function submitMovement(evt) {
  evt.preventDefault();
  movementMsg.textContent = "送出中...";

  const payload = {
    ingredient_id: Number(document.getElementById("ingredientId").value),
    movement_type: document.getElementById("movementType").value,
    quantity: Number(document.getElementById("quantity").value),
    unit_cost: document.getElementById("unitCost").value ? Number(document.getElementById("unitCost").value) : null,
    reference: document.getElementById("reference").value || null,
  };

  const res = await Auth.authFetch("/api/inventory/movements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    movementMsg.textContent = `失敗：${await Auth.readErrorMessage(res)}`;
    return;
  }

  movementMsg.textContent = "異動已送出";
  movementForm.reset();
  await Promise.all([fetchIngredients(), fetchOverview()]);
}

async function fetchOverview() {
  const res = await Auth.authFetch("/api/analytics/overview");
  if (!res.ok) throw new Error(await Auth.readErrorMessage(res));
  const data = await res.json();

  totalRevenue.textContent = `$${formatMoney(data.total_revenue)}`;
  totalOrders.textContent = formatMoney(data.total_orders);
  avgTicket.textContent = `$${formatMoney(data.average_ticket)}`;
  inventoryValue.textContent = `$${formatMoney(data.inventory_value)}`;

  const topSignature = data.top_items
    .map((item) => `${item.menu_item_name}:${item.quantity}:${item.revenue}`)
    .join("|");
  renderListStable({
    container: topItems,
    signature: topSignature,
    rows: data.top_items,
    emptyText: "目前沒有資料",
    renderRow: (item) => {
      const li = document.createElement("li");
      li.textContent = `${item.menu_item_name}：${item.quantity} 份 / $${formatMoney(item.revenue)}`;
      return li;
    },
  });

  const lowStockSignature = data.low_stock
    .map((item) => `${item.ingredient_name}:${item.current_stock}:${item.reorder_level}`)
    .join("|");
  renderListStable({
    container: lowStock,
    signature: lowStockSignature,
    rows: data.low_stock,
    emptyText: "目前沒有低庫存項目",
    renderRow: (item) => {
      const li = document.createElement("li");
      li.textContent = `${item.ingredient_name}：${formatMoney(item.current_stock)} ${item.unit}（門檻 ${formatMoney(item.reorder_level)}）`;
      return li;
    },
  });
}

function formatAuditPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  const keys = Object.keys(payload).slice(0, 4);
  if (!keys.length) return "";
  return keys.map((key) => `${key}: ${JSON.stringify(payload[key])}`).join(" | ");
}

function auditActionLabel(action) {
  return (
    {
      "auth.login": "登入系統",
      "user.create": "新增使用者",
      "order.create": "建立訂單",
      "order.pay": "訂單付款",
      "order.amend": "訂單改單",
      "order.status.change": "訂單狀態變更",
      "menu.create": "新增菜單項目",
      "menu.update": "更新菜單項目",
      "menu.recipe.replace": "更新配方",
      "inventory.ingredient.create": "新增原料",
      "inventory.ingredient.update": "更新原料",
      "inventory.movement.create": "新增庫存異動",
    }[action] || action
  );
}

async function fetchAuditLogs() {
  const res = await Auth.authFetch("/api/audit/logs?limit=40");
  if (!res.ok) throw new Error(await Auth.readErrorMessage(res));

  const rows = await res.json();
  const signature = rows
    .map((row) => `${row.id}:${row.action}:${row.entity_type}:${row.entity_id || ""}:${row.created_at}`)
    .join("|");

  renderListStable({
    container: auditList,
    signature,
    rows,
    emptyText: "目前沒有稽核紀錄",
    renderRow: (row) => {
      const li = document.createElement("li");
      const payloadText = formatAuditPayload(row.payload);
      li.innerHTML = `
        <div><strong>${auditActionLabel(row.action)}</strong> | ${row.entity_type}${row.entity_id ? `#${row.entity_id}` : ""}</div>
        <div>${row.actor_username || "系統"}（${row.actor_role || "未知角色"}）</div>
        <div>${new Date(row.created_at).toLocaleString("zh-TW")}</div>
        ${payloadText ? `<small>${payloadText}</small>` : ""}
      `;
      return li;
    },
  });
}

movementForm.addEventListener("submit", submitMovement);

async function bootstrap() {
  await Auth.ensureAuth(["manager", "owner"]);
  await Promise.all([fetchIngredients(), fetchOverview(), fetchAuditLogs()]);
  setInterval(fetchOverview, 45000);
  setInterval(fetchAuditLogs, 30000);
}

bootstrap().catch((err) => {
  movementMsg.textContent = `初始化失敗：${String(err.message || err)}`;
});
