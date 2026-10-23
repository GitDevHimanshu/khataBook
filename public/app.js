/* ─────────────────────────────────────────
   Khata — app.js
   Worker wage & attendance ledger app.
   Data persisted in MongoDB via REST API.
   S.cur (selected worker) is UI state only.
───────────────────────────────────────── */

const $ = id => document.getElementById(id);
const today = new Date();
const iso = d =>
  d.getFullYear() +
  "-" +
  String(d.getMonth() + 1).padStart(2, "0") +
  "-" +
  String(d.getDate()).padStart(2, "0");

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/* ── App state ── */
let S = { workers: [], cur: null, bill: [] },
  tab = "home",
  mode = "P",
  M = iso(today).slice(0, 7),
  sh = null,
  armed = null,
  msg = "";

/* ── Network & Sync status tracker ── */
let pendingReqs = 0;
let syncTimer = null;

function setNetStatus(status, label) {
  const el = $("netStatus");
  const txt = $("netTxt");
  if (!el || !txt) return;
  el.className = `net-pill ${status}`;
  txt.textContent = label;
}

window.addEventListener("online", () => {
  if (pendingReqs === 0) setNetStatus("online", "Cloud");
});

window.addEventListener("offline", () => {
  setNetStatus("offline", "Offline");
});

/* ── API helper ── */
const api = {
  async req(method, path, body) {
    pendingReqs++;
    setNetStatus("syncing", "Syncing...");
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    try {
      const r = await fetch(path, opts);
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(txt || r.statusText);
      }
      const data = await r.json();
      pendingReqs = Math.max(0, pendingReqs - 1);
      if (pendingReqs === 0) {
        setNetStatus("saved", "Saved ✓");
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
          if (navigator.onLine && pendingReqs === 0) setNetStatus("online", "Cloud");
        }, 1500);
      }
      return data;
    } catch (err) {
      pendingReqs = Math.max(0, pendingReqs - 1);
      if (!navigator.onLine) {
        setNetStatus("offline", "Offline");
      } else {
        setNetStatus("error", "Error");
      }
      throw err;
    }
  },
  get:  path        => api.req("GET",    path),
  post: (path, body) => api.req("POST",   path, body),
  put:  (path, body) => api.req("PUT",    path, body ?? {}),
  del:  path        => api.req("DELETE", path),
};

/* ── Formatting helpers ── */
const money = n => "₹" + Math.round(n).toLocaleString("en-IN");
const esc = s =>
  String(s ?? "").replace(
    /[&<>"]/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
const fmtD = d =>
  new Date(d + "T00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/* ── Attendance weights ── */
const W = { P: 1, H: 0.5, A: 0 };

/* ── Current worker ── */
const cw = () => S.workers.find(w => w.id === S.cur) || null;

/* ── Rate lookup (supports historical rates) ── */
function rateFor(w, k, e) {
  let r = null;
  if (w.rates)
    for (const x of w.rates)
      if (x.from <= k && (!r || x.from >= r.from)) r = x;
  return r ? r.rate : e ? e.r : +w.rate || 0;
}

/* ── Compute earned days & wages for a period prefix ── */
function earned(w, p) {
  let d = 0,
    t = 0;
  for (const k in w.att) {
    if (p && !k.startsWith(p)) continue;
    const e = w.att[k];
    d += W[e.s];
    t += W[e.s] * rateFor(w, k, e);
  }
  return { d, w: t };
}

const sumL = (a, p) =>
  a.filter(x => !p || x.date.startsWith(p)).reduce((t, x) => t + x.amt, 0);

const balance = w =>
  earned(w).w + (w.openPay || 0) - (w.openAdv || 0) - sumL(w.adv) - sumL(w.pay);

const owed = () =>
  S.bill.filter(b => !b.paid).reduce((t, b) => t + b.amt, 0);

const cls = n => (n >= 0 ? "good" : "bad");

/* ── Navigation tabs ── */
const NAV = [
  ["home", "👥", "Workers"],
  ["att",  "📅", "Attendance"],
  ["adv",  "💸", "Advances"],
  ["pay",  "💰", "Payments"],
  ["bill", "🧾", "Payables"],
];

/* ════════════════════════════════════════
   View renderers — return HTML strings
════════════════════════════════════════ */

function home() {
  const tot = S.workers.reduce((t, w) => t + balance(w), 0);
  return `<div class="card hero"><small>Total wages due to all workers</small><b>${money(tot)}</b></div>
  <div class="two"><div class="mini"><small>Workers</small><b>${S.workers.length}</b></div><div class="mini"><small>Payables I owe</small><b class="${owed() ? "bad" : ""}">${money(owed())}</b></div></div>
  ${
    S.workers.length
      ? S.workers
          .map(
            w => `<button class="wk" data-act="open" data-id="${w.id}">
        <div class="av">${esc(w.name.trim().charAt(0).toUpperCase() || "?")}</div>
        <div class="nm"><b>${esc(w.name)}</b><small>${money(w.rate)}/day · ${earned(w, M).d} days this month</small></div>
        <div style="text-align:right"><div class="amt ${cls(balance(w))}">${money(balance(w))}</div><small>due</small></div>
      </button>`
          )
          .join("")
      : '<div class="empty">No workers yet.<br>Add your first worker to start.</div>'
  }
  <button class="btn" data-act="addw">+ Add worker</button>`;
}

function head(w) {
  const em = earned(w, M),
    b = balance(w);
  return `<div class="card hero">
    <div style="display:flex;justify-content:space-between;align-items:start">
      <div><small>${esc(w.name)} · ${money(w.rate)}/day</small><br><small>Wages still due</small></div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="ib wa-btn" data-act="wa" data-id="${w.id}" aria-label="Share WhatsApp Slip" title="Send Slip via WhatsApp">
          <svg viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.11 7.43C8.94 7.43 8.68 7.5 8.45 7.74C8.22 8 7.56 8.62 7.56 9.87C7.56 11.13 8.48 12.33 8.61 12.5C8.74 12.67 10.42 15.27 13 16.38C13.62 16.65 14.1 16.81 14.48 16.93C15.1 17.13 15.66 17.1 16.11 17.03C16.61 16.96 17.65 16.4 17.86 15.8C18.08 15.2 18.08 14.69 18.01 14.58C17.95 14.47 17.79 14.4 17.53 14.27C17.27 14.14 15.99 13.51 15.75 13.43C15.52 13.34 15.35 13.3 15.18 13.56C15 13.82 14.5 14.4 14.35 14.58C14.2 14.75 14.05 14.77 13.79 14.64C13.53 14.51 12.7 14.24 11.72 13.37C10.95 12.69 10.43 11.84 10.28 11.59C10.13 11.33 10.26 11.19 10.39 11.06C10.51 10.95 10.65 10.76 10.79 10.6C10.92 10.43 10.96 10.31 11.05 10.13C11.14 9.96 11.09 9.81 11.03 9.68C10.96 9.55 10.45 8.3 10.24 7.79C10.03 7.28 9.82 7.36 9.66 7.35C9.52 7.35 9.35 7.43 9.11 7.43Z"/></svg>
          Slip
        </button>
        <button class="ib" data-act="editw" aria-label="Edit worker" style="width:auto;padding:0 12px;font-size:14px">✎ Edit</button>
      </div>
    </div>
    <b>${money(b)}</b>
  </div>
  <div class="two">
    <div class="mini"><small>Days this month</small><b>${em.d}</b></div>
    <div class="mini"><small>Earned this month</small><b>${money(em.w)}</b></div>
    <div class="mini"><small>Advances this month</small><b>${money(sumL(w.adv, M))}</b></div>
    <div class="mini"><small>Paid this month</small><b>${money(sumL(w.pay, M))}</b></div>
  </div>`;
}

/* ── Share worker monthly slip on WhatsApp ── */
function sendWorkerSlip(w) {
  const [y, mo] = M.split("-").map(Number);
  const monthName = new Date(y, mo - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const em = earned(w, M);
  const advMonth = sumL(w.adv, M);
  const payMonth = sumL(w.pay, M);
  const bal = balance(w);

  const text =
    `*📋 KHATA WORKER SLIP*\n` +
    `👤 *Worker:* ${w.name}\n` +
    `📅 *Month:* ${monthName}\n` +
    `💰 *Wage Rate:* ${money(w.rate)}/day\n` +
    `──────────────────\n` +
    `• *Days Worked:* ${em.d} days\n` +
    `• *Earned this Month:* ${money(em.w)}\n` +
    `• *Advances Taken:* -${money(advMonth)}\n` +
    `• *Payments Made:* -${money(payMonth)}\n` +
    `──────────────────\n` +
    `*📊 Total Balance Due:* *${money(bal)}*\n\n` +
    `_Generated from Khata_`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

const need = () =>
  '<div class="empty">Add a worker first.</div><button class="btn" data-act="addw">+ Add worker</button>';

function att() {
  const w = cw();
  if (!w) return need();
  const [y, mo] = M.split("-").map(Number),
    first = new Date(y, mo - 1, 1).getDay(),
    n = new Date(y, mo, 0).getDate(),
    t = iso(today);
  let h =
    ["S", "M", "T", "W", "T", "F", "S"]
      .map(d => `<div class="dw">${d}</div>`)
      .join("") + "<div></div>".repeat(first);
  for (let d = 1; d <= n; d++) {
    const k = M + "-" + String(d).padStart(2, "0"),
      e = w.att[k];
    h += `<button class="day ${e ? e.s : ""} ${k === t ? "T" : ""}" data-act="day" data-v="${k}" aria-label="${fmtD(k)}">${d}<i>${e ? (e.s === "H" ? "½" : e.s) : ""}</i></button>`;
  }
  return (
    head(w) +
    `<div class="chips">${[
      ["P", "Present"],
      ["H", "Half day"],
      ["A", "Absent"],
      ["C", "Clear"],
    ]
      .map(
        ([k, l]) =>
          `<button data-act="mode" data-v="${k}" aria-pressed="${mode === k}">${l}</button>`
      )
      .join("")}</div>
  <div class="card"><div class="cal">${h}</div></div>
  <p class="sm" style="text-align:center">Pick a status, then tap dates. Half day pays ½ wage.</p>`
  );
}

function ledger(kind, label) {
  const w = cw();
  if (!w) return need();
  const it = w[kind]
    .filter(x => x.date.startsWith(M))
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    head(w) +
    `<div class="card"><b>${label}s in this month · ${money(it.reduce((t, x) => t + x.amt, 0))}</b>${
      it.length
        ? it
            .map(
              x => `<div class="row">
          <div>${fmtD(x.date)}<div class="sm">${esc(x.note)}</div></div>
          <div><span class="amt">${money(x.amt)}</span> <button class="x" data-act="del" data-id="${x.id}">${armed === x.id ? "Sure?" : "✕"}</button></div>
        </div>`
            )
            .join("")
        : `<div class="empty">No ${label.toLowerCase()}s this month.</div>`
    }</div>`
  );
}

function bills() {
  const t = iso(today),
    it = [...S.bill].sort((a, b) => a.paid - b.paid || a.due.localeCompare(b.due));
  return `<div class="card hero"><small>Total payables still owed</small><b>${money(owed())}</b></div>
  <div class="card">${
    it.length
      ? it
          .map(b => {
            const late = !b.paid && b.due < t;
            return `<div class="row">
          <div><b>${esc(b.who)}</b><div class="sm">Due ${fmtD(b.due)}</div>
          <span class="pill ${b.paid ? "p-paid" : late ? "p-late" : "p-due"}">${b.paid ? "Paid" : late ? "Overdue" : "Due"}</span></div>
          <div style="text-align:right"><div class="amt">${money(b.amt)}</div>
          <button class="x" style="color:var(--pri2)" data-act="tog" data-id="${b.id}">${b.paid ? "Mark unpaid" : "Mark paid"}</button>
          <button class="x" data-act="delb" data-id="${b.id}">${armed === b.id ? "Sure?" : "✕"}</button></div>
        </div>`;
          })
          .join("")
      : '<div class="empty">Nothing to pay.</div>'
  }</div>`;
}

/* ── Form field helper ── */
const fld = (id, l, t, v, ph) =>
  `<div class="f"><label for="${id}">${l}</label><input id="${id}" type="${t || "text"}" ${
    t === "number" ? 'min="0" inputmode="decimal"' : ""
  } value="${esc(v ?? "")}" placeholder="${ph || ""}"></div>`;

/* ── Bottom sheet HTML ── */
function sheet() {
  if (!sh) return "";
  let b = "";

  if (sh.t === "worker") {
    const w = sh.id ? S.workers.find(x => x.id === sh.id) : null;
    b = `<h2>${w ? "Edit worker" : "New worker"}</h2>
      ${fld("s-name", "Name", "text", w?.name, "e.g. Ramesh")}
      ${
        w
          ? `<div class="f"><label>Daily wage</label><div class="row" style="padding:4px 0"><b>${money(w.rate)} / day</b><button class="btn alt" style="width:auto;padding:9px 14px" data-act="raise">📈 Increase salary</button></div></div>`
          : fld("s-rate", "Daily wage (₹)", "number", "")
      }
      <div class="g2">${fld("s-oadv", "Opening advance (₹)", "number", w?.openAdv || "", "Already given")}${fld("s-opay", "Opening payable (₹)", "number", w?.openPay || "", "Wages owed")}</div>
      <div class="sm" style="margin-bottom:12px">Opening advance = money already given before using this app. Opening payable = wages you already owed.</div>
      <div class="stack"><button class="btn" data-act="savew">Save</button>${w ? `<button class="btn alt" style="background:#25d366;color:#fff;border-color:#25d366;display:flex;align-items:center;justify-content:center;gap:6px" data-act="wa" data-id="${w.id}">💬 Share WhatsApp Slip</button><button class="btn red" data-act="delw">Delete worker</button>` : ""}</div>`;
  } else if (sh.t === "raise") {
    const w = S.workers.find(x => x.id === sh.id),
      hist = (w.rates || []).filter(x => x.from > "0001");
    b = `<h2>Increase salary · ${esc(w.name)}</h2>
      <div class="sm" style="margin-bottom:10px">Current wage: <b>${money(w.rate)} / day</b>. The new wage applies from the date you choose. Earlier days keep their old wage.</div>
      <div class="g2">${fld("s-rate", "New daily wage (₹)", "number", "")}${fld("s-from", "Effective from", "date", iso(today))}</div>
      <div class="stack"><button class="btn" data-act="saver">Save new wage</button><button class="btn alt" data-act="editw">Back</button></div>
      ${
        hist.length
          ? `<div class="card" style="margin:14px 0 0;padding:4px 12px;background:var(--bg)"><b class="sm">Wage history</b>${hist
              .map(
                x => `<div class="row"><div>From ${fmtD(x.from)}</div><div><span class="amt">${money(x.rate)}</span> <button class="x" data-act="delr" data-v="${x.from}">${armed === "r" + x.from ? "Sure?" : "✕"}</button></div></div>`
              )
              .join("")}</div>`
          : ""
      }`;
  } else if (sh.t === "entry") {
    const l = sh.k === "adv" ? "advance" : "payment";
    b = `<h2>Add ${l}</h2>
      <div class="g2">${fld("s-date", "Date", "date", iso(today))}${fld("s-amt", "Amount (₹)", "number", "")}</div>
      ${fld("s-note", "Note (optional)", "text", "")}
      <button class="btn" data-act="savee">Save ${l}</button>`;
  } else if (sh.t === "bill") {
    b = `<h2>Add payable</h2>
      ${fld("s-who", "Pay to", "text", "", "Shop, supplier, landlord…")}
      <div class="g2">${fld("s-amt", "Amount (₹)", "number", "")}${fld("s-due", "Due date", "date", iso(today))}</div>
      <button class="btn" data-act="saveb">Save payable</button>`;
  } else {
    b = `<h2>Backup &amp; data</h2>
      <div class="stack">
        <button class="btn" data-act="bak">Save backup to phone</button>
        <button class="btn alt" data-act="rst">Restore backup</button>
        <button class="btn alt" data-act="exp">Export CSV</button>
        <button class="btn red" data-act="clr">Clear all data</button>
      </div>
      <p class="sm" id="msg">${
        esc(msg) ||
        "Records save automatically to MongoDB. Save a backup file now and then; it goes to your Downloads folder."
      }</p>`;
  }

  return `<div class="back" data-act="close"></div><div class="panel" role="dialog">${b}</div>`;
}

/* ════════════════════════════════════════
   Main render function
════════════════════════════════════════ */
function render() {
  $("wsel").innerHTML = S.workers.length
    ? S.workers
        .map(
          w =>
            `<option value="${w.id}" ${w.id === S.cur ? "selected" : ""}>${esc(w.name)}</option>`
        )
        .join("")
    : "<option>No workers yet</option>";
  $("wsel").disabled = !S.workers.length;

  const [y, mo] = M.split("-").map(Number);
  $("ml").textContent = new Date(y, mo - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });

  $("view").innerHTML =
    tab === "home"
      ? home()
      : tab === "att"
      ? att()
      : tab === "adv"
      ? ledger("adv", "Advance")
      : tab === "pay"
      ? ledger("pay", "Payment")
      : bills();

  $("nav").innerHTML = NAV.map(
    ([k, i, l]) =>
      `<button data-act="tab" data-v="${k}" aria-current="${k === tab}"><span>${i}</span>${l}</button>`
  ).join("");

  $("fabw").innerHTML =
    (tab === "adv" || tab === "pay") && cw()
      ? `<button class="fab" data-act="adde">+ Add ${tab === "adv" ? "advance" : "payment"}</button>`
      : tab === "bill"
      ? '<button class="fab" data-act="addb">+ Add payable</button>'
      : "";

  $("sheet").innerHTML = sheet();
}

/* ── Helpers ── */
const num = id => Math.max(0, +$(id).value || 0);
const shiftM = n => {
  const [y, m] = M.split("-").map(Number),
    d = new Date(y, m - 1 + n, 1);
  M = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  armed = null;
  render();
};

function dl(name, text, type) {
  const b = new Blob([text], { type }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

let toastTimer = null;
const note = t => {
  msg = t;
  const m = $("msg");
  if (m) m.textContent = t;
  const toast = $("toast");
  if (toast) {
    toast.textContent = t;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }
};

/* ════════════════════════════════════════
   Event delegation — single async click handler
   Optimistic updates: S is updated locally
   first, then the API call persists to MongoDB.
════════════════════════════════════════ */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const a  = el.dataset.act,
        id = el.dataset.id,
        v  = el.dataset.v,
        w  = cw();

  try {
    /* ── Pure UI state — no API ── */
    if (a === "tab")   { tab = v; armed = null; render(); }
    else if (a === "open")  { S.cur = id; tab = "att"; render(); }
    else if (a === "mode")  { mode = v; render(); }
    else if (a === "mp")    shiftM(-1);
    else if (a === "mnx")   shiftM(1);
    else if (a === "addw")  { sh = { t: "worker" }; render(); }
    else if (a === "editw") { sh = { t: "worker", id: S.cur }; render(); }
    else if (a === "wa")    { const target = S.workers.find(x => x.id === (id || S.cur)); if (target) sendWorkerSlip(target); }
    else if (a === "adde")  { sh = { t: "entry", k: tab }; render(); }
    else if (a === "addb")  { sh = { t: "bill" }; render(); }
    else if (a === "menu")  { sh = { t: "menu" }; msg = ""; render(); }
    else if (a === "close") { sh = null; armed = null; render(); }
    else if (a === "raise") { sh = { t: "raise", id: S.cur }; armed = null; render(); }

    /* ── Attendance ── */
    else if (a === "day") {
      const e2 = w.att[v];
      if (mode === "C") {
        delete w.att[v];
        render();
        await api.del(`/api/workers/${w.id}/attendance/${v}`);
      } else {
        const entry = { s: mode, r: e2 ? e2.r : rateFor(w, v, null) };
        if (e2) e2.s = mode; else w.att[v] = entry;
        render();
        await api.put(`/api/workers/${w.id}/attendance/${v}`, entry);
      }
    }

    /* ── Save / create worker ── */
    else if (a === "savew") {
      const n = $("s-name").value.trim();
      if (!n) { $("s-name").focus(); return; }
      const d = { name: n, openAdv: num("s-oadv"), openPay: num("s-opay") };
      if (sh.id) {
        const wid = sh.id;
        Object.assign(S.workers.find(x => x.id === wid), d);
        sh = null; render();
        await api.put(`/api/workers/${wid}`, d);
      } else {
        const nid  = uid();
        const rate = num("s-rate");
        S.workers.push(Object.assign({ id: nid, att: {}, adv: [], pay: [], rate }, d));
        S.cur = nid; tab = "att"; sh = null; render();
        await api.post("/api/workers", { id: nid, rate, ...d });
      }
    }

    /* ── Save new salary rate ── */
    else if (a === "saver") {
      const nr = num("s-rate"), fr = $("s-from").value;
      if (!nr || !fr) { (nr ? $("s-from") : $("s-rate")).focus(); return; }
      const wid = sh.id;
      const x   = S.workers.find(q => q.id === wid);
      if (!x.rates) x.rates = [{ from: "0000-01-01", rate: +x.rate || 0 }];
      x.rates = x.rates.filter(q => q.from !== fr);
      x.rates.push({ from: fr, rate: nr });
      x.rates.sort((p, q) => p.from.localeCompare(q.from));
      x.rate = x.rates[x.rates.length - 1].rate;
      sh = null; render();
      await api.post(`/api/workers/${wid}/rates`, { from: fr, rate: nr });
    }

    /* ── Delete a salary rate entry ── */
    else if (a === "delr") {
      if (armed !== "r" + v) { armed = "r" + v; render(); return; }
      const wid = sh.id;
      const x   = S.workers.find(q => q.id === wid);
      x.rates   = x.rates.filter(q => q.from !== v);
      if (x.rates.length < 2) {
        x.rate = x.rates[0] ? x.rates[0].rate : x.rate;
        delete x.rates;
      } else {
        x.rate = x.rates[x.rates.length - 1].rate;
      }
      armed = null; render();
      await api.del(`/api/workers/${wid}/rates/${v}`);
    }

    /* ── Delete worker ── */
    else if (a === "delw") {
      if (armed !== "dw") { armed = "dw"; el.textContent = "Tap again to delete"; return; }
      const wid = sh.id;
      S.workers = S.workers.filter(x => x.id !== wid);
      S.cur = S.workers[0] ? S.workers[0].id : null;
      tab = "home"; sh = null; armed = null; render();
      await api.del(`/api/workers/${wid}`);
    }

    /* ── Save advance or payment entry ── */
    else if (a === "savee") {
      const amt = num("s-amt"), d = $("s-date").value;
      if (!amt || !d) { $("s-amt").focus(); return; }
      const entry  = { id: uid(), date: d, amt, note: $("s-note").value.trim() };
      const kind   = sh.k;                              // "adv" | "pay"
      const wid    = w.id;
      w[kind].push(entry);
      sh = null; render();
      const route = kind === "adv" ? "advances" : "payments";
      await api.post(`/api/workers/${wid}/${route}`, entry);
    }

    /* ── Save bill ── */
    else if (a === "saveb") {
      const n = $("s-who").value.trim(), amt = num("s-amt");
      if (!n || !amt) { (n ? $("s-amt") : $("s-who")).focus(); return; }
      const bill = { id: uid(), who: n, amt, due: $("s-due").value || iso(today), paid: false };
      S.bill.push(bill);
      sh = null; render();
      await api.post("/api/bills", bill);
    }

    /* ── Delete advance or payment ── */
    else if (a === "del") {
      if (armed !== id) { armed = id; render(); return; }
      const kind = tab;          // "adv" | "pay"
      const wid  = w.id;
      w[kind] = w[kind].filter(x => x.id !== id);
      armed = null; render();
      const route = kind === "adv" ? "advances" : "payments";
      await api.del(`/api/workers/${wid}/${route}/${id}`);
    }

    /* ── Toggle bill paid ── */
    else if (a === "tog") {
      const b = S.bill.find(q => q.id === id);
      b.paid = !b.paid;
      render();
      await api.put(`/api/bills/${id}/toggle`);
    }

    /* ── Delete bill ── */
    else if (a === "delb") {
      if (armed !== id) { armed = id; render(); return; }
      S.bill = S.bill.filter(x => x.id !== id);
      armed = null; render();
      await api.del(`/api/bills/${id}`);
    }

    /* ── Backup — download from server ── */
    else if (a === "bak") {
      const data = await api.get("/api/backup");
      dl(
        "khata-backup-" + iso(today) + ".json",
        JSON.stringify(data, null, 2),
        "application/json"
      );
      note("Backup saved: khata-backup-" + iso(today) + ".json (Downloads folder).");
    }

    /* ── Restore — open file picker ── */
    else if (a === "rst") { $("file").click(); }

    /* ── Export CSV (client-side, no API needed) ── */
    else if (a === "exp") {
      const rows = [["Worker", "Type", "Date", "Detail", "Amount"]];
      S.workers.forEach(x => {
        if (x.openAdv) rows.push([x.name, "Opening advance", "", "", x.openAdv]);
        if (x.openPay) rows.push([x.name, "Opening payable", "", "", x.openPay]);
        Object.keys(x.att)
          .sort()
          .forEach(k =>
            rows.push([x.name, "Attendance", k, x.att[k].s, W[x.att[k].s] * rateFor(x, k, x.att[k])])
          );
        x.adv.forEach(r => rows.push([x.name, "Advance",  r.date, r.note, r.amt]));
        x.pay.forEach(r => rows.push([x.name, "Payment",  r.date, r.note, r.amt]));
      });
      S.bill.forEach(r =>
        rows.push(["", "Payable", r.due, r.who + (r.paid ? " (paid)" : ""), r.amt])
      );
      dl(
        "khata-" + iso(today) + ".csv",
        rows.map(r => r.map(c => '"' + String(c ?? "").replace(/"/g, '""') + '"').join(",")).join("\n"),
        "text/csv"
      );
      note("CSV saved to your Downloads folder.");
    }

    /* ── Clear all data ── */
    else if (a === "clr") {
      if (armed !== "all") { armed = "all"; el.textContent = "Tap again to erase everything"; return; }
      S = { workers: [], cur: null, bill: [] };
      armed = null; sh = null; tab = "home"; render();
      await api.del("/api/data");
    }

  } catch (err) {
    note("Error: " + err.message);
  }
});

/* ── Worker selector ── */
$("wsel").onchange = () => {
  S.cur = $("wsel").value;
  render();
};

/* ── File restore ── */
$("file").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.workers)) throw new Error("Invalid format");
      await api.post("/api/restore", d);
      const [workers, bill] = await Promise.all([
        api.get("/api/workers"),
        api.get("/api/bills"),
      ]);
      S.workers = workers;
      S.bill    = bill;
      S.cur     = S.workers[0] ? S.workers[0].id : null;
      tab = "home"; sh = null; render();
    } catch (x) {
      sh = { t: "menu" };
      render();
      note("That file is not a valid Khata backup.");
    }
  };
  r.readAsText(f);
  e.target.value = "";
};

/* ════════════════════════════════════════
   Boot — load all data from MongoDB
════════════════════════════════════════ */
async function boot() {
  setNetStatus("syncing", "Connecting...");
  try {
    const [workers, bill] = await Promise.all([
      api.get("/api/workers"),
      api.get("/api/bills"),
    ]);
    S.workers = workers;
    S.bill    = bill;
    if (S.workers.length) S.cur = S.workers[0].id;
    setNetStatus("online", "Cloud");
  } catch (err) {
    setNetStatus("offline", "Offline");
    note("⚠️ Cannot connect to server. Make sure the server is running.");
  }
  if (S.cur && cw()) tab = "att";
  render();
}

boot();
