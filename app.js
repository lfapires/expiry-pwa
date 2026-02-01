import { listProducts, getProduct, upsertProduct, deleteProduct } from "./db.js";

const appEl = document.getElementById("app");
const btnAdd = document.getElementById("btnAdd");

const CATEGORIES = {
  "Medicamentos": ["Dores de cabeça","Febre","Alergias","Digestão","Outros"],
  "Alimentos": ["Laticínios","Carnes","Molhos","Sobras","Outros"],
  "Outros": ["Cosméticos","Suplementos","Limpeza","Outros"]
};

function uuid(){
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }

function addMonthsCalendar(date, months){
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function calcExpiry(openedAt, value, unit){
  const o = new Date(openedAt);
  if (unit === "days") return new Date(o.getTime() + value*24*60*60*1000);
  if (unit === "months30") return new Date(o.getTime() + value*30*24*60*60*1000);
  return addMonthsCalendar(o, value);
}

function daysRemaining(expiry){
  const t0 = startOfDay(new Date());
  const e0 = startOfDay(new Date(expiry));
  return Math.round((e0 - t0) / (24*60*60*1000));
}

function statusFor(days){
  if (days < 0) return ["bad", `Expirado há ${Math.abs(days)} dias`];
  if (days <= 3) return ["warn", days === 0 ? `Expira hoje` : `A expirar: ${days} dia(s)`];
  return ["ok", `Faltam ${days} dias`];
}

function groupByCategory(products){
  const out = {};
  for (const p of products){
    out[p.category] ??= [];
    out[p.category].push(p);
  }
  for (const k of Object.keys(out)){
    out[k].sort((a,b)=>a._days - b._days);
  }
  return out;
}

function setActiveTab(route){
  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.route === route);
  });
}

document.querySelectorAll(".tab").forEach(b=>{
  b.addEventListener("click", ()=> location.hash = b.dataset.route);
});

btnAdd.addEventListener("click", ()=> location.hash = "#/add");

// Registar SW (offline) — só depois do sw.js no passo 9
if ("serviceWorker" in navigator){
  // não faz mal ainda não existir, no passo 9 fica ativo
  navigator.serviceWorker.register("/sw.js").catch(()=>{});
}

window.addEventListener("hashchange", render);
render();

async function render(){
  const route = location.hash || "#/home";
  setActiveTab(route.startsWith("#/") ? route : "#/home");

  if (route.startsWith("#/detail/")){
    const id = route.split("/")[2];
    const p = await getProduct(id);
    return renderDetail(p);
  }
  if (route === "#/add") return renderForm(null);
  if (route.startsWith("#/edit/")){
    const id = route.split("/")[2];
    const p = await getProduct(id);
    return renderForm(p);
  }
  if (route === "#/scan") return renderScan();
  if (route === "#/settings") return renderSettings();

  return renderHome();
}

async function renderHome(){
  const products = (await listProducts()).map(p=>{
    const expiry = calcExpiry(p.openedAt, p.shelfLifeValue, p.shelfLifeUnit);
    const d = daysRemaining(expiry);
    return { ...p, _expiry: expiry, _days: d };
  });

  const grouped = groupByCategory(products);

  const cats = Object.keys(CATEGORIES);
  appEl.innerHTML = `
    ${cats.map(cat=>{
      const items = grouped[cat] || [];
      const urgent = items.filter(x=>x._days<=3).length;
      return `
        <section class="card">
          <div class="hrow">
            <div>
              <div class="h1">${cat}</div>
              <div class="small">${items.length} registo(s)</div>
            </div>
            <div class="row">
              ${urgent>0 ? `<span class="badge">${urgent} urgente</span>` : ``}
              <button class="btn" data-toggle="${cat}">Ver</button>
            </div>
          </div>
          <div class="list" id="list-${cssId(cat)}" style="display:none"></div>
        </section>
      `;
    }).join("")}
  `;

  appEl.querySelectorAll("[data-toggle]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const cat = btn.dataset.toggle;
      const listEl = document.getElementById(`list-${cssId(cat)}`);
      const open = listEl.style.display !== "none";
      listEl.style.display = open ? "none" : "flex";
      btn.textContent = open ? "Ver" : "Fechar";
      if (!open) fillList(listEl, (grouped[cat]||[]));
    });
  });
}

function fillList(listEl, items){
  listEl.innerHTML = items.length ? items.map(p=>{
    const [cls, txt] = statusFor(p._days);
    const thumb = p.photoDataUrl
      ? `<img alt="" src="${p.photoDataUrl}">`
      : `<span>📷</span>`;
    return `
      <div class="item" data-id="${p.id}">
        <div class="row">
          <div class="thumb">${thumb}</div>
          <div style="flex:1">
            <div class="hrow">
              <div class="h1" style="font-size:15px">${escapeHtml(p.name)}</div>
              <div class="status ${cls}">${txt}</div>
            </div>
            <div class="small">
              ${escapeHtml(p.subcategory || "—")}
              · Aberto em ${formatDate(p.openedAt)}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("") : `<div class="small muted">Sem registos.</div>`;

  listEl.querySelectorAll("[data-id]").forEach(el=>{
    el.addEventListener("click", ()=> location.hash = `#/detail/${el.dataset.id}`);
  });
}

function renderScan(){
  appEl.innerHTML = `
    <section class="card">
      <div class="h1">Scan</div>
      <p class="muted">Placeholder por agora. Na próxima fase integramos leitura de código (Android funciona muito bem com bibliotecas JS).</p>
      <button class="btn primary" id="goAdd">Registar manualmente</button>
    </section>
  `;
  document.getElementById("goAdd").onclick = ()=> location.hash = "#/add";
}

function renderSettings(){
  appEl.innerHTML = `
    <section class="card">
      <div class="h1">Definições</div>
      <div class="sep"></div>
      <div class="muted small">Nesta versão MVP, notificações push ficam para a próxima fase. A app já guarda dados localmente.</div>
    </section>
  `;
}

async function renderDetail(p){
  if (!p){
    appEl.innerHTML = `<section class="card"><div class="h1">Produto não encontrado</div></section>`;
    return;
  }

  const expiry = calcExpiry(p.openedAt, p.shelfLifeValue, p.shelfLifeUnit);
  const d = daysRemaining(expiry);
  const [cls, txt] = statusFor(d);

  appEl.innerHTML = `
    <section class="card">
      <div class="row">
        <div class="thumb" style="width:86px;height:86px;border-radius:18px">
          ${p.photoDataUrl ? `<img alt="" src="${p.photoDataUrl}">` : `<span>📷</span>`}
        </div>
        <div style="flex:1">
          <div class="h1">${escapeHtml(p.name)}</div>
          <div class="small muted">${escapeHtml(p.category)} · ${escapeHtml(p.subcategory || "—")}</div>
          <div class="status ${cls}" style="margin-top:6px">${txt}</div>
        </div>
      </div>

      <div class="sep"></div>

      <div class="kv"><span class="muted">Aberto em</span><span>${formatDate(p.openedAt)}</span></div>
      <div class="kv"><span class="muted">Expira em</span><span>${formatDate(expiry)}</span></div>

      ${p.usage ? `
        <div class="sep"></div>
        <div class="h2">📘 Modo de utilização</div>
        <div>${escapeHtml(p.usage)}</div>
      ` : ""}

      ${p.dosePlan?.enabled ? `
        <div class="sep"></div>
        <div class="h2">⏱️ Plano de toma</div>
        <div class="kv"><span class="muted">Dose</span><span>${escapeHtml(p.dosePlan.dose || "—")}</span></div>
        <div class="kv"><span class="muted">Frequência</span><span>${escapeHtml(p.dosePlan.freq || "—")}</span></div>
        <div class="kv"><span class="muted">Duração</span><span>${escapeHtml(p.dosePlan.duration || "—")}</span></div>
      ` : ""}

      <div class="sep"></div>

      <div class="row" style="gap:10px;flex-wrap:wrap">
        <button class="btn" id="edit">Editar</button>
        <button class="btn danger" id="del">Eliminar</button>
      </div>

      ${renderOptional(p)}
    </section>
  `;

  document.getElementById("edit").onclick = ()=> location.hash = `#/edit/${p.id}`;
  document.getElementById("del").onclick = async ()=>{
    if (confirm("Eliminar este produto?")) {
      await deleteProduct(p.id);
      location.hash = "#/home";
    }
  };
}

function renderOptional(p){
  const parts = [];
  if (p.lot) parts.push(`<div class="kv"><span class="muted">Lote</span><span>${escapeHtml(p.lot)}</span></div>`);
  if (p.store) parts.push(`<div class="kv"><span class="muted">Loja</span><span>${escapeHtml(p.store)}</span></div>`);
  if (p.price) parts.push(`<div class="kv"><span class="muted">Preço</span><span>${escapeHtml(p.price)} €</span></div>`);
  if (!parts.length) return "";
  return `<div class="sep"></div><div class="h2">Detalhes</div>${parts.join("")}`;
}

async function renderForm(p){
  const isEdit = !!p;
  const cat = p?.category || "Medicamentos";
  const subs = CATEGORIES[cat] || ["Outros"];

  appEl.innerHTML = `
    <section class="card">
      <div class="h1">${isEdit ? "Editar produto" : "Novo produto"}</div>
      <div class="sep"></div>

      <div class="field">
        <label class="small muted">Foto (1 por defeito)</label>
        <input type="file" id="photo" accept="image/*" />
      </div>

      <div class="field">
        <label class="small muted">Nome *</label>
        <input id="name" value="${escapeAttr(p?.name||"")}" placeholder="Ex: Iogurte natural" />
      </div>

      <div class="grid2">
        <div class="field">
          <label class="small muted">Categoria</label>
          <select id="category">
            ${Object.keys(CATEGORIES).map(c=>`<option ${c===cat?"selected":""}>${c}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="small muted">Subcategoria (opcional)</label>
          <select id="subcategory">
            <option value="">—</option>
            ${subs.map(s=>`<option ${(p?.subcategory||"")==s?"selected":""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label class="small muted">Data de abertura</label>
          <input type="date" id="openedAt" value="${toDateInput(p?.openedAt || new Date())}" />
        </div>
        <div class="field">
          <label class="small muted">Validade</label>
          <input type="number" id="lifeVal" min="1" value="${p?.shelfLifeValue ?? 7}" />
        </div>
      </div>

      <div class="field">
        <label class="small muted">Unidade</label>
        <select id="lifeUnit">
          <option value="days" ${p?.shelfLifeUnit==="days"?"selected":""}>Dias</option>
          <option value="months30" ${p?.shelfLifeUnit==="months30"?"selected":""}>Meses (30 dias)</option>
          <option value="monthsCalendar" ${p?.shelfLifeUnit==="monthsCalendar"?"selected":""}>Meses (calendário)</option>
        </select>
        <div class="small muted" id="preview"></div>
      </div>

      <div class="field">
        <label class="small muted">📘 Modo de utilização (opcional)</label>
        <textarea id="usage" placeholder="Ex: 1 comprimido após as refeições">${escapeHtml(p?.usage||"")}</textarea>
      </div>

      <div class="field">
        <label class="small muted">⏱️ Plano de toma (opcional)</label>
        <div class="row">
          <input type="checkbox" id="doseEnabled" ${p?.dosePlan?.enabled?"checked":""} />
          <span>Ativar plano de toma</span>
        </div>

        <div id="doseBox" style="display:${p?.dosePlan?.enabled?"block":"none"}">
          <div class="field">
            <label class="small muted">Dose</label>
            <input id="dose" value="${escapeAttr(p?.dosePlan?.dose||"")}" placeholder="Ex: 1 comprimido" />
          </div>
          <div class="field">
            <label class="small muted">Frequência</label>
            <select id="freq">
              ${["1× por dia","2× por dia","3× por dia","Personalizado"].map(v=>
                `<option ${p?.dosePlan?.freq===v?"selected":""}>${v}</option>`
              ).join("")}
            </select>
          </div>
          <div class="field">
            <label class="small muted">Duração</label>
            <select id="duration">
              ${["Enquanto durar o produto","Até data definida"].map(v=>
                `<option ${p?.dosePlan?.duration===v?"selected":""}>${v}</option>`
              ).join("")}
            </select>
          </div>
        </div>

        <div class="small muted">Nesta fase, “tomas” são informativas. Notificações automáticas ficam para a próxima fase.</div>
      </div>

      <details class="card" style="box-shadow:none;background:transparent;padding:0">
        <summary class="btn">Detalhes adicionais (facultativos)</summary>
        <div class="field"><label class="small muted">Lote</label><input id="lot" value="${escapeAttr(p?.lot||"")}" /></div>
        <div class="field"><label class="small muted">Loja de compra</label><input id="store" value="${escapeAttr(p?.store||"")}" /></div>
        <div class="field"><label class="small muted">Preço (€)</label><input id="price" value="${escapeAttr(p?.price||"")}" /></div>
      </details>

      <div class="sep"></div>
      <div class="row" style="gap:10px">
        <button class="btn primary" id="save">Guardar</button>
        <button class="btn" id="cancel">Cancelar</button>
      </div>
    </section>
  `;

  const categoryEl = document.getElementById("category");
  const subEl = document.getElementById("subcategory");
  const openedEl = document.getElementById("openedAt");
  const lifeValEl = document.getElementById("lifeVal");
  const lifeUnitEl = document.getElementById("lifeUnit");
  const previewEl = document.getElementById("preview");
  const doseEnabledEl = document.getElementById("doseEnabled");
  const doseBoxEl = document.getElementById("doseBox");

  categoryEl.onchange = () => {
    const c = categoryEl.value;
    const list = CATEGORIES[c] || ["Outros"];
    subEl.innerHTML = `<option value="">—</option>` + list.map(s=>`<option>${s}</option>`).join("");
  };

  doseEnabledEl.onchange = () => doseBoxEl.style.display = doseEnabledEl.checked ? "block" : "none";

  function updatePreview(){
    const exp = calcExpiry(openedEl.value, parseInt(lifeValEl.value||"1",10), lifeUnitEl.value);
    previewEl.textContent = `Expira a ${formatDate(exp)}.`;
  }
  [openedEl, lifeValEl, lifeUnitEl].forEach(el=> el.addEventListener("input", updatePreview));
  updatePreview();

  document.getElementById("cancel").onclick = ()=> location.hash = "#/home";

  document.getElementById("save").onclick = async ()=>{
    const name = document.getElementById("name").value.trim();
    if (!name) return alert("Nome é obrigatório.");

    const openedAt = document.getElementById("openedAt").value;
    const shelfLifeValue = Math.max(1, parseInt(document.getElementById("lifeVal").value || "1", 10));
    const shelfLifeUnit = document.getElementById("lifeUnit").value;

    const usage = document.getElementById("usage").value.trim();
    const lot = document.getElementById("lot")?.value.trim() || "";
    const store = document.getElementById("store")?.value.trim() || "";
    const price = document.getElementById("price")?.value.trim() || "";

    const dosePlan = {
      enabled: !!doseEnabledEl.checked,
      dose: (document.getElementById("dose")?.value || "").trim(),
      freq: (document.getElementById("freq")?.value || "").trim(),
      duration: (document.getElementById("duration")?.value || "").trim()
    };

    const photoFile = document.getElementById("photo").files?.[0] || null;
    let photoDataUrl = p?.photoDataUrl || "";

    if (photoFile){
      photoDataUrl = await fileToDataUrl(photoFile);
    }

    const product = {
      id: p?.id || uuid(),
      name,
      category: categoryEl.value,
      subcategory: subEl.value || "",
      openedAt,
      shelfLifeValue,
      shelfLifeUnit,
      usage,
      dosePlan,
      lot: lot || "",
      store: store || "",
      price: price || "",
      photoDataUrl,
      updatedAt: new Date().toISOString(),
      createdAt: p?.createdAt || new Date().toISOString()
    };

    await upsertProduct(product);
    location.hash = "#/home";
  };
}

function cssId(s){ return s.replace(/\s+/g,"-").toLowerCase(); }
function formatDate(d){
  const x = new Date(d);
  return x.toLocaleDateString("pt-PT", { day:"2-digit", month:"short", year:"numeric" });
}
function toDateInput(d){
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,"0");
  const dd = String(x.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function escapeHtml(s){ return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function escapeAttr(s){ return escapeHtml(s).replaceAll('"',"&quot;"); }

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = ()=> reject(r.error);
    r.readAsDataURL(file);
  });
}
