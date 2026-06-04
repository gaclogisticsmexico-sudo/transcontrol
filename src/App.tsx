import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

const genId = () => Math.random().toString(36).slice(2, 10);
const ADMIN_PASS = "admin123";
const COORD_PASS = "coord123";

const CARGO = [
  { v: "general", l: "General" }, { v: "refrigerado", l: "Refrigerado" }, { v: "peligroso", l: "Peligroso" },
];
const BILLING = [
  { v: "sin_facturar", l: "Sin facturar", c: "bgr" },
  { v: "facturado", l: "Facturado", c: "ba" },
  { v: "pagado", l: "Pagado", c: "bg" },
  { v: "complemento", l: "Complemento emitido", c: "bb" },
];
const EXP_CATS = ["Combustible", "Mantenimiento", "Peajes", "Viáticos", "Seguro", "Comisión", "Otro"];
const TRIP_EXP_CATS = ["Comisión", "Combustible", "Casetas", "Llantas / Mecánico", "Pensión / Estadía", "Viáticos", "Seguro", "Otro"];
const CHECKLIST = [
  { id: "luces_del", l: "Luces delanteras" }, { id: "luces_tra", l: "Luces traseras/stop" },
  { id: "frenos", l: "Frenos" }, { id: "neum", l: "Neumáticos/presión" },
  { id: "aceite", l: "Nivel de aceite" }, { id: "agua", l: "Nivel de agua/refrigerante" },
  { id: "bateria", l: "Batería" }, { id: "esp_iz", l: "Espejo izquierdo" },
  { id: "esp_de", l: "Espejo derecho" }, { id: "esp_re", l: "Espejo retrovisor" },
  { id: "limp", l: "Limpiaparabrisas" }, { id: "cintu", l: "Cinturón de seguridad" },
  { id: "extin", l: "Extintor" }, { id: "botiq", l: "Botiquín" },
  { id: "docs", l: "Documentación vigente" }, { id: "clean", l: "Limpieza general" },
];
const DEF_VEHICLES = [
  { id: "v1", plates: "ABC-123-A", model: "Kenworth T680", year: "2021", active: true },
  { id: "v2", plates: "XYZ-456-B", model: "Freightliner Cascadia", year: "2019", active: true },
  { id: "v3", plates: "LMN-789-C", model: "International LT", year: "2022", active: true },
];
const DEF_DRIVERS = [
  { id: "d1", name: "Juan Pérez", license: "L-001", active: true },
  { id: "d2", name: "Carlos Gómez", license: "L-002", active: true },
  { id: "d3", name: "Roberto Sánchez", license: "L-003", active: true },
];
const DEF_RS = [
  { id: "rs1", name: "Transportes Norte S.A. de C.V.", rfc: "TNO123456AAA", short: "Trans. Norte", active: true },
  { id: "rs2", name: "Logística Express S.A. de C.V.", rfc: "LEX987654BBB", short: "Log. Express", active: true },
];

const fmt$ = v => "$" + Number(v || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = s => s ? new Date(s + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const nowMon = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
const daysSince = s => s ? Math.floor((Date.now() - new Date(s + "T12:00:00").getTime()) / 864e5) : null;
const readB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN — SOLO EDITA ESTE BLOQUE
// ═══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyACRDH0D8NhfR3wQKqCKUDbMEBE9RPIG9g",
  authDomain: "transcontrol-98e42.firebaseapp.com",
  projectId: "transcontrol-98e42",
  storageBucket: "transcontrol-98e42.firebasestorage.app",
  messagingSenderId: "136222746567",
  appId: "1:136222746567:web:d045051138d79918545be2"
};
// email (minúsculas) → rol + nombre
const USUARIOS = {
  "alan@transcontrol.com":         { rol: "admin",  nombre: "Alan Garcia" },
  "cris@transcontrol.com":         { rol: "coord",  nombre: "Cristian Ramos" },
  "javier@transcontrol.com":       { rol: "chofer", nombre: "Javier Ramos Roman",              id: "d1" },
  "edgar@transcontrol.com":        { rol: "chofer", nombre: "Edgar Sebastian Garcia Hernandez", id: "d2" },
  "tonatiuh@transcontrol.com":     { rol: "chofer", nombre: "Tonatiuh Sanchez Lopez",           id: "d3" },
  "crisoperador@transcontrol.com": { rol: "chofer", nombre: "Cristian Ramos Garcia",            id: "d4" },
};
// ═══════════════════════════════════════════════════════════════

// Firebase — solo Firestore y Auth (no se necesita Storage)
const fbApp = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const sk = k => k.replace(/[:.]/g, "_");

// Comprime imágenes antes de guardar en Firestore (mantiene archivos bajo 800KB)
async function compressImg(dataUrl, maxDim = 1200, quality = 0.75) {
  if (!dataUrl.startsWith("data:image")) return dataUrl; // PDFs: no comprimir
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      res(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

async function ld(k, d) {
  try { const s = await getDoc(doc(db, "tc", sk(k))); return s.exists() ? s.data().v : d; } catch { return d; }
}
async function sv(k, v) {
  try { await setDoc(doc(db, "tc", sk(k)), { v, t: Date.now() }); } catch(e) { console.error("sv:", k, e.message); }
}
async function ldPh(id, t) {
  try { const s = await getDoc(doc(db, "ph", `${sk(id)}_${t}`)); return s.exists() ? s.data().v : null; } catch { return null; }
}
async function svPh(id, t, b64) {
  try {
    const compressed = await compressImg(b64);
    // Firestore doc limit ~1MB — warn if PDF is too large
    if (compressed.length > 900000) {
      alert(`El archivo es demasiado grande (${Math.round(compressed.length/1024)}KB). El límite es ~700KB. Intenta comprimir el PDF antes de subirlo.`);
      return;
    }
    await setDoc(doc(db, "ph", `${sk(id)}_${t}`), { v: compressed, t: Date.now() });
  } catch(e) { console.error("svPh:", e.message); }
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d1117;--bg2:#161b22;--bg3:#1c2333;--border:#30363d;--txt:#e6edf3;--txt2:#8b949e;--amber:#f59e0b;--amber2:#fbbf24;--red:#ef4444;--green:#22c55e;--blue:#3b82f6;--cyan:#06b6d4;--purple:#a855f7;--r:8px}
body{background:var(--bg);color:var(--txt);font-family:'Barlow',sans-serif;font-size:15px}#root{min-height:100vh}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:var(--r);border:none;cursor:pointer;font-family:'Barlow',sans-serif;font-size:14px;font-weight:600;transition:all .15s;white-space:nowrap}
.btn-a{background:var(--amber);color:#0d1117}.btn-a:hover{background:var(--amber2)}
.btn-g{background:transparent;color:var(--txt2);border:1px solid var(--border)}.btn-g:hover{border-color:var(--amber);color:var(--amber)}
.btn-r{background:var(--red);color:#fff}.btn-r:hover{opacity:.85}
.btn-gr{background:var(--green);color:#0d1117}.btn-gr:hover{opacity:.85}
.btn-b{background:var(--blue);color:#fff}.btn-b:hover{opacity:.85}
.btn-sm{padding:5px 10px;font-size:13px}
.field{display:flex;flex-direction:column;gap:4px}
.field label{font-size:12px;color:var(--txt2);font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.field input,.field select,.field textarea{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--txt);font-family:'Barlow',sans-serif;font-size:14px;padding:9px 12px;outline:none;transition:border-color .15s;width:100%}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--amber)}
.field textarea{resize:vertical;min-height:80px}.field select option{background:var(--bg3)}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px}
.card-click{cursor:pointer;transition:border-color .15s}.card-click:hover{border-color:var(--amber)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:640px){.g2,.g3,.g4{grid-template-columns:1fr}}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:700;letter-spacing:.03em}
.ba{background:#f59e0b22;color:var(--amber);border:1px solid #f59e0b44}
.br{background:#ef444422;color:var(--red);border:1px solid #ef444444}
.bg{background:#22c55e22;color:var(--green);border:1px solid #22c55e44}
.bb{background:#3b82f622;color:var(--blue);border:1px solid #3b82f644}
.bc{background:#06b6d422;color:var(--cyan);border:1px solid #06b6d444}
.bgr{background:#8b949e22;color:var(--txt2);border:1px solid #8b949e44}
.bpu{background:#a855f722;color:var(--purple);border:1px solid #a855f744}
.nav-bot{position:fixed;bottom:0;left:0;right:0;background:var(--bg2);border-top:1px solid var(--border);display:flex;z-index:100}
.nb-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;cursor:pointer;border:none;background:none;color:var(--txt2);font-size:11px;font-family:'Barlow',sans-serif;transition:color .15s}
.nb-item.act{color:var(--amber)}
.nav-tabs{display:flex;gap:2px;overflow-x:auto;padding:0 16px;border-bottom:1px solid var(--border);background:var(--bg2);scrollbar-width:none}
.nav-tabs::-webkit-scrollbar{display:none}
.ntab{padding:10px 14px;border:none;background:none;color:var(--txt2);cursor:pointer;font-family:'Barlow',sans-serif;font-size:14px;font-weight:600;border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s}
.ntab.act{color:var(--amber);border-bottom-color:var(--amber)}.ntab:hover:not(.act){color:var(--txt)}
.page{padding:16px;padding-bottom:80px;max-width:900px;margin:0 auto}
.ap{padding:16px;max-width:1100px;margin:0 auto}
.chk-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer}
.chk-row:last-child{border-bottom:none}
.chk-box{width:20px;height:20px;border-radius:4px;border:2px solid var(--border);display:flex;align-items:center;justify-content:flex-start;padding-left:2px;flex-shrink:0;transition:all .15s}
.chk-box.on{background:var(--green);border-color:var(--green)}
.kpi{text-align:center}
.kv{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:800;color:var(--amber)}
.kl{font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.hdr{background:var(--bg2);border-bottom:1px solid var(--border);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.logo{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:var(--amber);letter-spacing:.05em}
.stitle{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;letter-spacing:.04em;color:var(--txt);margin-bottom:12px}
.txt2{color:var(--txt2)}.tsm{font-size:13px}
.mt4{margin-top:4px}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}
.mb4{margin-bottom:4px}.mb8{margin-bottom:8px}.mb12{margin-bottom:12px}.mb16{margin-bottom:16px}
.flex{display:flex}.fcol{display:flex;flex-direction:column}
.aic{align-items:center}.jb{justify-content:space-between}.wrap{flex-wrap:wrap}
.gap4{gap:4px}.gap8{gap:8px}.gap12{gap:12px}.gap16{gap:16px}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;padding:8px 10px;color:var(--txt2);text-transform:uppercase;font-size:11px;letter-spacing:.05em;border-bottom:1px solid var(--border);font-weight:700}
.tbl td{padding:8px 10px;border-bottom:1px solid var(--border)}.tbl tr:hover td{background:#ffffff06}
.prog{background:var(--border);border-radius:99px;height:8px;overflow:hidden}
.progf{height:100%;border-radius:99px;background:var(--amber);transition:width .3s}
.inp-in{background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--txt);font-family:'Barlow',sans-serif;font-size:13px;padding:4px 8px;width:110px;outline:none}
.inp-in:focus{border-color:var(--amber)}
.empty{text-align:center;padding:48px 16px;color:var(--txt2)}
.toast{background:var(--green);color:#0d1117;padding:8px 16px;text-align:center;font-weight:700;font-size:14px}
.alert-box{border:1px solid #ef444444;background:#ef444411;border-radius:var(--r);padding:10px 12px}
.warn-box{border:1px solid #f59e0b44;background:#f59e0b11;border-radius:var(--r);padding:10px 12px}
.ok-box{border:1px solid #22c55e44;background:#22c55e11;border-radius:var(--r);padding:10px 12px}
.rs-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;background:#a855f722;color:var(--purple);border:1px solid #a855f744}
.sec-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.sec-hdr{padding:12px 16px;border-bottom:1px solid var(--border);font-weight:700;display:flex;align-items:center;justify-content:space-between}
.sec-body{padding:16px}
.pill-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.pill-tab{padding:5px 14px;border-radius:99px;border:1px solid var(--border);background:transparent;color:var(--txt2);cursor:pointer;font-family:'Barlow',sans-serif;font-size:13px;font-weight:600;transition:all .15s}
.pill-tab.act{background:var(--amber);border-color:var(--amber);color:#0d1117}
.instr-card{border:2px solid var(--amber);background:#f59e0b08;border-radius:var(--r);padding:14px}
.avail-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)}
.avail-row:last-child{border-bottom:none}
.tercerizado-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
@media(max-width:640px){.tercerizado-split{grid-template-columns:1fr}}
.split-box{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px}
`;

const IC = {
  home:"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  plus:"M12 5v14M5 12h14",list:"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  check:"M20 6L9 17l-5-5",
  truck:["M1 3h15v13H1z","M16 8h4l3 3v5h-7V8z","M5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z","M18.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"],
  wrench:"M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  eye:["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z","M12 9a3 3 0 100 6 3 3 0 000-6z"],
  logout:["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4","M16 17l5-5-5-5","M21 12H9"],
  trash:["M3 6h18","M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6","M10 11v6M14 11v6M9 6V4h6v2"],
  send:["M22 2L11 13","M22 2L15 22l-4-9-9-4 20-7z"],
  img:["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4","M17 8l-5-5-5 5","M12 3v12"],
  x:"M18 6L6 18M6 6l12 12",
  money:"M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  bar:"M18 20V10M12 20V4M6 20v-6",
  user:["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2","M12 11a4 4 0 100-8 4 4 0 000 8"],
  settings:["M12 15a3 3 0 100-6 3 3 0 000 6z","M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"],
};

function Ico({ path, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {Array.isArray(path) ? path.map((p, i) => <path key={i} d={p} />) : <path d={path} />}
    </svg>
  );
}
function Field({ label, children }) { return <div className="field">{label && <label>{label}</label>}{children}</div>; }
function CargoBadge({ v }) { const cls = v === "general" ? "bb" : v === "refrigerado" ? "bc" : "br"; return <span className={`badge ${cls}`}>{CARGO.find(c => c.v === v)?.l || v}</span>; }
function BillingBadge({ v, mp }) {
  if (v === "pagado" && mp === "PPD") return <span className="badge bg">✓ Pagado c/Complemento</span>;
  if (v === "pagado") return <span className="badge bg">✓ Pagado</span>;
  if (v === "facturado" && mp === "PPD") return <span className="badge ba">📋 PPD — Pdte. complemento</span>;
  if (v === "facturado" && mp === "PUE") return <span className="badge ba">💳 PUE — Pdte. pago</span>;
  if (v === "facturado") return <span className="badge ba">Facturado</span>;
  if (v === "sin_factura") return <span className="badge bgr">Sin factura</span>;
  return <span className="badge bgr">Sin facturar</span>;
}
function RSBadge({ id, razones }) { const rs = razones?.find(r => r.id === id); return rs ? <span className="rs-pill">🏢 {rs.short}</span> : null; }
function Empty({ title, sub }) { return <div className="empty"><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div><div className="tsm">{sub}</div></div>; }
function ChkBox({ checked, onChange }) {
  return <div className={`chk-box ${checked ? "on" : ""}`} style={{ cursor: "pointer" }} onClick={onChange}>{checked && <Ico path={IC.check} size={13} />}</div>;
}

function PhotoBtn({ label, photoKey, compact = false, onLoad }) {
  const [ph, setPh] = useState(null);
  const [show, setShow] = useState(false);
  const ref = useRef();
  useEffect(() => {
    (async () => { const r = await ldPh(photoKey[0], photoKey[1]); if (r) { setPh(r); if (onLoad) onLoad(r); } })();
  }, []);
  const upload = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const b64 = await readB64(f); await svPh(photoKey[0], photoKey[1], b64); setPh(b64); if (onLoad) onLoad(b64); } catch {}
  };
  return (
    <div>
      <input type="file" accept="image/*,application/pdf" ref={ref} style={{ display: "none" }} onChange={upload} />
      {show && ph && (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShow(false)}>
          {ph.startsWith("data:image") ? <img src={ph} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }} onClick={e => e.stopPropagation()} />
            : <div className="card" style={{ padding: 24, textAlign: "center" }} onClick={e => e.stopPropagation()}><div style={{ fontSize: 48, marginBottom: 12 }}>📄</div><div style={{ marginBottom: 16 }}>Archivo PDF cargado</div><a href={ph} download="doc.pdf" className="btn btn-a">Descargar</a></div>}
        </div>
      )}
      <div className="flex gap4 wrap">
        <button className={`btn btn-g ${compact ? "btn-sm" : ""}`} onClick={() => ref.current.click()}><Ico path={IC.img} size={14} /> {ph ? "Cambiar" : `📎 ${label}`}</button>
        {ph && <button className={`btn btn-b ${compact ? "btn-sm" : ""}`} onClick={() => setShow(true)}><Ico path={IC.eye} size={14} /> Ver</button>}
      </div>
    </div>
  );
}

// TripForm — RS hidden when chofer (isChofer=true), shown for admin/coord
const loadJSZip = () => new Promise(res => {
  if (window.JSZip) return res(window.JSZip);
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  s.onload = () => res(window.JSZip);
  document.head.appendChild(s);
});

async function downloadClientZip(client, month, clientTrips) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const folder = zip.folder(`${client.replace(/[^a-zA-Z0-9]/g, "_")}_${month}`);
  for (const t of clientTrips) {
    const name = `${t.date}_${t.origin.slice(0,8)}-${t.destination.slice(0,8)}`.replace(/[^a-zA-Z0-9-_]/g, "_");
    const sub = folder.folder(name);
    for (const [type, label] of [["delivery","comprobante_entrega"],["patio","patio_regulador"],["invoice","factura"],["payment","comprobante_pago"]]) {
      const ph = await ldPh(t.id, type);
      if (ph && ph.includes(",")) {
        const [hdr, data] = ph.split(",");
        const ext = hdr.includes("pdf") ? "pdf" : hdr.includes("png") ? "png" : "jpg";
        sub.file(`${label}.${ext}`, data, { base64: true });
      }
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `${client.replace(/[^a-zA-Z0-9]/g, "_")}_${month}.zip`;
  a.click(); URL.revokeObjectURL(url);
}


function TripForm({ drivers, vehicles, razones, clients, currentDriver, isChofer, gpsOrigin, gpsDestination, gpsVehicleId, onSave, onCancel }) {
  const [f, setF] = useState({
    date: today(), origin: gpsOrigin || "", destination: gpsDestination || "", departTime: "", arriveTime: "",
    cargo: "general", vehicleId: gpsVehicleId || vehicles[0]?.id || "", driverId: currentDriver?.id || drivers[0]?.id || "",
    client: "", docNum: "", notes: "", razonSocialId: isChofer ? "" : (razones[0]?.id || ""), patioReg: false,
    endKm: "", tripStatus: "completado",
    originModified: false, destinationModified: false,
  });
  const [tmpId] = useState(genId);
  const [tripExps, setTripExps] = useState([]);
  const [newExp, setNewExp] = useState({ desc: "", amount: "" });
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const setGPS = k => e => setF(p => ({ ...p, [k]: e.target.value, [`${k}Modified`]: !!(gpsOrigin || gpsDestination) }));
  const addExp = () => {
    const a = parseFloat(newExp.amount);
    if (!newExp.desc || isNaN(a) || a <= 0) return;
    setTripExps(p => [...p, { id: genId(), desc: newExp.desc, amount: a }]);
    setNewExp({ desc: "", amount: "" });
  };
  const submit = () => {
    if (!f.origin || !f.destination || !f.client || !f.vehicleId) { alert("Completa: Origen, Destino, Cliente y Unidad"); return; }
    onSave({ ...f, id: tmpId, amount: 0, billingStatus: "sin_facturar", paymentMethod: "", tripExpenses: tripExps, gpsMode: !!(gpsOrigin || gpsDestination), createdAt: new Date().toISOString() });
  };
  return (
    <div>
      <div className="g2 mb12">
        <Field label="Fecha *"><input type="date" value={f.date} onChange={set("date")} /></Field>
        {!isChofer && <Field label="Razón Social"><select value={f.razonSocialId} onChange={set("razonSocialId")}>{razones.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.short}</option>)}</select></Field>}
        <Field label="Conductor *">
          {currentDriver ? <input readOnly value={currentDriver.name} style={{ opacity: .7 }} />
            : <select value={f.driverId} onChange={set("driverId")}>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
        </Field>
        <Field label="Unidad *"><select value={f.vehicleId} onChange={set("vehicleId")}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plates} — {v.model}</option>)}</select></Field>
        <div>
          <Field label="Origen *">
            <input placeholder="Ciudad de salida" value={f.origin} onChange={gpsOrigin ? setGPS("origin") : set("origin")} />
          </Field>
          {gpsOrigin && f.origin !== gpsOrigin && <span className="tsm" style={{ color: "var(--amber)" }}>✏️ Modificado</span>}
          {gpsOrigin && f.origin === gpsOrigin && <span className="tsm" style={{ color: "var(--green)" }}>📍 GPS</span>}
        </div>
        <div>
          <Field label="Destino *">
            <input placeholder="Ciudad de llegada" value={f.destination} onChange={gpsDestination ? setGPS("destination") : set("destination")} />
          </Field>
          {gpsDestination && f.destination !== gpsDestination && <span className="tsm" style={{ color: "var(--amber)" }}>✏️ Modificado</span>}
          {gpsDestination && f.destination === gpsDestination && <span className="tsm" style={{ color: "var(--green)" }}>📍 GPS</span>}
        </div>
        <Field label="Hora de salida"><input type="time" value={f.departTime} onChange={set("departTime")} /></Field>
        <Field label="Hora de llegada"><input type="time" value={f.arriveTime} onChange={set("arriveTime")} /></Field>
        <Field label="Tipo de mercancía"><select value={f.cargo} onChange={set("cargo")}>{CARGO.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Field>
        <Field label="Cliente *">
          {clients && clients.filter(c => c.active !== false).length > 0 ? (
            <select value={f.client} onChange={e => {
              const name = e.target.value;
              const sel = (clients||[]).find(c => c.name === name);
              setF(p => ({ ...p, client: name, razonSocialId: sel?.razonSocialId || p.razonSocialId }));
            }}>
              <option value="">-- Seleccionar cliente --</option>
              {clients.filter(c => c.active !== false).map(c => <option key={c.id} value={c.name}>{c.name}{c.rfc ? ` · ${c.rfc}` : ""}</option>)}
            </select>
          ) : (
            <input placeholder="Sin clientes dados de alta (ver Configuración)" value={f.client} onChange={set("client")} />
          )}
        </Field>
        <Field label="No. Carta Porte / Factura"><input placeholder="CP-2025-001" value={f.docNum} onChange={set("docNum")} /></Field>
        <Field label="Odómetro al llegar (km)"><input type="number" placeholder="Ej: 125430" value={f.endKm} onChange={set("endKm")} /></Field>
      </div>
      <Field label="Observaciones"><textarea placeholder="Incidencias, demoras..." value={f.notes} onChange={set("notes")} /></Field>
      <div className="card" style={{ background: f.tripStatus === "en_curso" ? "#f59e0b11" : "var(--bg3)", border: `1px solid ${f.tripStatus === "en_curso" ? "var(--amber)" : "var(--border)"}`, marginBottom: 12 }}>
        <div className="flex aic gap10">
          <ChkBox checked={f.tripStatus === "en_curso"} onChange={() => setF(p => ({ ...p, tripStatus: p.tripStatus === "en_curso" ? "completado" : "en_curso" }))} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>🔄 Viaje no concluido</div>
            <div className="tsm txt2">Actívalo si otro chofer u otra unidad continuará el viaje. Quedará disponible para que alguien lo retome.</div>
          </div>
        </div>
      </div>
      <div className="card mt12 mb12">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>📷 Comprobantes</div>
        <div className="g2 gap8">
          <div><div className="tsm txt2 mb4">Comprobante de entrega</div><PhotoBtn label="Subir comprobante" photoKey={[tmpId, "delivery"]} /></div>
          <div>
            <div className="flex aic gap8 mb8">
              <ChkBox checked={f.patioReg} onChange={() => setF(p => ({ ...p, patioReg: !p.patioReg }))} />
              <span className="tsm txt2">Aplica patio regulador</span>
            </div>
            {f.patioReg && <PhotoBtn label="Comprobante patio" photoKey={[tmpId, "patio"]} />}
          </div>
        </div>
      </div>
      <div className="card mb12">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>💸 Gastos del viaje (comisiones, extras)</div>
        <div className="flex gap8 mb8 wrap">
          <div style={{ flex: 2, minWidth: 140 }}><Field label="Descripción"><input placeholder="Comisión, caseta extra..." value={newExp.desc} onChange={e => setNewExp(p => ({ ...p, desc: e.target.value }))} /></Field></div>
          <div style={{ flex: 1, minWidth: 90 }}><Field label="Monto $"><input type="number" placeholder="0.00" value={newExp.amount} onChange={e => setNewExp(p => ({ ...p, amount: e.target.value }))} onKeyDown={e => e.key === "Enter" && addExp()} /></Field></div>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button className="btn btn-a btn-sm" onClick={addExp}><Ico path={IC.plus} size={14} /></button></div>
        </div>
        {tripExps.length > 0 && (
          <div className="fcol gap4">
            {tripExps.map(e => (
              <div key={e.id} className="flex aic jb tsm" style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{e.desc}</span>
                <div className="flex gap8 aic"><span style={{ color: "var(--red)", fontWeight: 700 }}>{fmt$(e.amount)}</span><button className="btn btn-g btn-sm" onClick={() => setTripExps(p => p.filter(x => x.id !== e.id))}><Ico path={IC.x} size={12} /></button></div>
              </div>
            ))}
            <div className="flex jb tsm mt4"><span className="txt2">Total gastos:</span><span style={{ color: "var(--red)", fontWeight: 700 }}>{fmt$(tripExps.reduce((s, e) => s + e.amount, 0))}</span></div>
          </div>
        )}
      </div>
      <div className="flex gap8"><button className="btn btn-a" onClick={submit}><Ico path={IC.check} size={16} /> Registrar Viaje</button>{onCancel && <button className="btn btn-g" onClick={onCancel}>Cancelar</button>}</div>
    </div>
  );
}

function InspectionForm({ vehicles, currentDriver, onSave, onCancel }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || "");
  const [checks, setChecks] = useState({});
  const [issues, setIssues] = useState("");
  const [date, setDate] = useState(today());
  const toggle = id => setChecks(p => ({ ...p, [id]: !p[id] }));
  const cnt = CHECKLIST.filter(i => checks[i.id]).length;
  const submit = () => onSave({ id: genId(), vehicleId, driverId: currentDriver?.id || "", driverName: currentDriver?.name || "", date, checks, issues, passedCount: cnt, totalCount: CHECKLIST.length, resolved: false, createdAt: new Date().toISOString() });
  return (
    <div>
      <div className="g2 mb12">
        <Field label="Fecha"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Unidad"><select value={vehicleId} onChange={e => setVehicleId(e.target.value)}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plates} — {v.model}</option>)}</select></Field>
      </div>
      <div className="card mb12">
        <div className="flex aic jb mb8"><span style={{ fontWeight: 700 }}>Checklist</span><span className="tsm txt2">{cnt}/{CHECKLIST.length}</span></div>
        <div className="prog mb12"><div className="progf" style={{ width: `${(cnt / CHECKLIST.length) * 100}%` }} /></div>
        {CHECKLIST.map(item => (
          <div key={item.id} className="chk-row" onClick={() => toggle(item.id)}>
            <ChkBox checked={!!checks[item.id]} onChange={() => toggle(item.id)} /><span>{item.l}</span>
          </div>
        ))}
      </div>
      <Field label="Fallas, ruidos o anomalías"><textarea placeholder="Describe fallas o condiciones anormales..." value={issues} onChange={e => setIssues(e.target.value)} style={{ minHeight: 90 }} /></Field>
      <div className="flex gap8 mt16">
        <button className="btn btn-a" onClick={submit}><Ico path={IC.check} size={16} /> Guardar Inspección</button>
        {onCancel && <button className="btn btn-g" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}

// Outsourced: two sides — CLIENT (income) + PROVIDER (expense)
function OutsourcedForm({ razones, clients, providers, onSave, onCancel }) {
  const [f, setF] = useState({
    date: today(), origin: "", destination: "", cargo: "general", notes: "", razonSocialId: razones[0]?.id || "",
    client: "", clientAmount: "", clientPaymentMethod: "transferencia", clientInvoiceNum: "", clientBillingStatus: "sin_facturar",
    provider: "", providerAmount: "", providerPaymentMethod: "transferencia", providerInvoiceNum: "", dueDate: "",
  });
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const submit = () => {
    if (!f.provider || !f.client || !f.origin || !f.destination) { alert("Completa: Proveedor, Cliente, Origen y Destino"); return; }
    onSave({ ...f, id: genId(), clientAmount: parseFloat(f.clientAmount) || 0, providerAmount: parseFloat(f.providerAmount) || 0, paid: false, paidDate: null, createdAt: new Date().toISOString() });
  };
  return (
    <div>
      <div className="g2 mb12">
        <Field label="Fecha *"><input type="date" value={f.date} onChange={set("date")} /></Field>
        <Field label="Razón Social"><select value={f.razonSocialId} onChange={set("razonSocialId")}>{razones.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.short}</option>)}</select></Field>
        <Field label="Origen *"><input placeholder="Ciudad de origen" value={f.origin} onChange={set("origin")} /></Field>
        <Field label="Destino *"><input placeholder="Ciudad de destino" value={f.destination} onChange={set("destination")} /></Field>
        <Field label="Tipo de mercancía"><select value={f.cargo} onChange={set("cargo")}>{CARGO.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Field>
      </div>
      <div className="tercerizado-split mb12">
        <div className="split-box" style={{ borderTop: "2px solid var(--green)" }}>
          <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: 10 }}>💚 Lo que cobramos al cliente</div>
          <div className="fcol gap8">
            <Field label="Cliente *">
              {clients && clients.filter(c => c.active !== false).length > 0 ? (
                <select value={f.client} onChange={set("client")}>
                  <option value="">-- Seleccionar cliente --</option>
                  {clients.filter(c => c.active !== false).map(c => <option key={c.id} value={c.name}>{c.name}{c.rfc ? ` · ${c.rfc}` : ""}</option>)}
                </select>
              ) : (
                <input placeholder="Nombre del cliente" value={f.client} onChange={set("client")} />
              )}
            </Field>
            <Field label="Precio al cliente ($)"><input type="number" placeholder="0.00" value={f.clientAmount} onChange={set("clientAmount")} /></Field>
            <Field label="Forma de pago del cliente">
              <select value={f.clientPaymentMethod} onChange={set("clientPaymentMethod")}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select>
            </Field>
            <Field label="No. de nuestra factura al cliente"><input placeholder="F-2025-001" value={f.clientInvoiceNum} onChange={set("clientInvoiceNum")} /></Field>
          </div>
        </div>
        <div className="split-box" style={{ borderTop: "2px solid var(--red)" }}>
          <div style={{ fontWeight: 700, color: "var(--red)", marginBottom: 10 }}>🔴 Lo que nos cobra el proveedor</div>
          <div className="fcol gap8">
            <Field label="Proveedor / Transportista *">
              {providers && providers.filter(p => p.active !== false).length > 0 ? (
                <select value={f.provider} onChange={set("provider")}>
                  <option value="">-- Seleccionar proveedor --</option>
                  {providers.filter(p => p.active !== false).map(p => <option key={p.id} value={p.name}>{p.name}{p.rfc ? ` · ${p.rfc}` : ""}</option>)}
                </select>
              ) : (
                <input placeholder="Nombre del proveedor (o agrégalo en Configuración)" value={f.provider} onChange={set("provider")} />
              )}
            </Field>
            <Field label="Costo del proveedor ($)"><input type="number" placeholder="0.00" value={f.providerAmount} onChange={set("providerAmount")} /></Field>
            <Field label="Forma de pago al proveedor">
              <select value={f.providerPaymentMethod} onChange={set("providerPaymentMethod")}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select>
            </Field>
            <Field label="No. factura del proveedor"><input placeholder="FAC-2025-001" value={f.providerInvoiceNum} onChange={set("providerInvoiceNum")} /></Field>
            <Field label="Fecha límite de pago al proveedor"><input type="date" value={f.dueDate} onChange={set("dueDate")} /></Field>
          </div>
        </div>
      </div>
      <Field label="Notas"><textarea placeholder="Condiciones, detalles del servicio..." value={f.notes} onChange={set("notes")} /></Field>
      <div className="flex gap8 mt16">
        <button className="btn btn-a" onClick={submit}><Ico path={IC.check} size={16} /> Registrar Tercerizado</button>
        {onCancel && <button className="btn btn-g" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}

function DriverSelector({ info, onSelect }) {
  const [sel, setSel] = useState("");
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div className="logo" style={{fontSize:38,marginBottom:6}}>⬡ TRANSCONTROL</div>
          <div className="txt2 tsm">Sistema Integral de Gestión de Transporte</div>
        </div>
        <div className="card">
          <div className="stitle mb4">Selecciona tu perfil</div>
          <div className="tsm txt2 mb16">Hola <strong>{info.userInfo.nombre}</strong>. Elige tu nombre de la lista para que tus viajes queden registrados correctamente. Solo se pide una vez.</div>
          <Field label="¿Cuál es tu nombre en el sistema?">
            <select value={sel} onChange={e => setSel(e.target.value)}>
              <option value="">-- Selecciona tu nombre --</option>
              {info.availableDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <button className="btn btn-a mt16" style={{justifyContent:"center",width:"100%"}}
            onClick={() => { const d = info.availableDrivers.find(x => x.id === sel); if (d) onSelect(d); }}
            disabled={!sel}>
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const login = async () => {
    if (!email || !pass) { setErr("Ingresa tu correo y contraseña"); return; }
    setLoading(true); setErr("");
    try { await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pass); }
    catch { setErr("Correo o contraseña incorrectos"); setLoading(false); }
  };
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div className="logo" style={{fontSize:38,marginBottom:6}}>⬡ TRANSCONTROL</div>
          <div className="txt2 tsm">Sistema Integral de Gestión de Transporte</div>
        </div>
        <div className="card">
          <div className="fcol gap8">
            <Field label="Correo electrónico">
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="correo@empresa.com" onKeyDown={e=>e.key==="Enter"&&login()}/>
            </Field>
            <Field label="Contraseña">
              <input type="password" value={pass} onChange={e=>{setPass(e.target.value);setErr("");}} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&login()}/>
            </Field>
            {err&&<div style={{color:"var(--red)",fontSize:13}}>{err}</div>}
            <button className="btn btn-a mt8" style={{justifyContent:"center"}} onClick={login} disabled={loading}>
              {loading?"Entrando...":"Iniciar sesión"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverStatusPanel({ driver, instant, vehicles, onUpdateInstant, onGPSTripEnd }) {
  const [showSelect, setShowSelect] = useState(false);
  const [selV, setSelV] = useState(vehicles[0]?.id || "");
  const [locating, setLocating] = useState(false);
  const isBusy = (instant.drivers || []).includes(driver.id) && !(instant.freeD || []).includes(driver.id);
  const curVId = (instant.currentVehicle || {})[driver.id];
  const curV = vehicles.find(v => v.id === curVId);
  const startData = (instant.tripStart || {})[driver.id];

  const getLocation = () => new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&accept-language=es`);
          const d = await r.json();
          const a = d.address || {};
          const colonia   = a.suburb || a.neighbourhood || a.quarter || a.residential || "";
          const delegacion = a.city_district || a.borough || a.municipality || a.county || "";
          const ciudad    = a.city || a.town || a.village || a.state_district || "";
          const parts = [colonia, delegacion, ciudad].filter(Boolean);
          const address = parts.length ? parts.join(", ") : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setLocating(false);
          resolve({ lat, lng, address });
        } catch {
          setLocating(false);
          resolve({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
        }
      },
      () => { setLocating(false); resolve(null); },
      { timeout: 8000, maximumAge: 60000 }
    );
  });

  const startTrip = async () => {
    if (!selV) return;
    setLocating(true);
    const loc = await getLocation();
    onUpdateInstant({
      ...instant,
      vehicles: [...new Set([...(instant.vehicles||[]), selV])],
      drivers: [...new Set([...(instant.drivers||[]), driver.id])],
      freeV: (instant.freeV||[]).filter(id => id !== selV),
      freeD: (instant.freeD||[]).filter(id => id !== driver.id),
      currentVehicle: { ...(instant.currentVehicle||{}), [driver.id]: selV },
      tripStart: { ...(instant.tripStart||{}), [driver.id]: { ...(loc||{}), vehicleId: selV, timestamp: new Date().toISOString() } }
    });
    setShowSelect(false);
  };

  const endTrip = async () => {
    setLocating(true);
    const endLoc = await getLocation();
    onUpdateInstant({
      ...instant,
      vehicles: (instant.vehicles||[]).filter(id => id !== curVId),
      drivers: (instant.drivers||[]).filter(id => id !== driver.id),
      freeD: (instant.freeD||[]).filter(id => id !== driver.id),
      freeV: (instant.freeV||[]).filter(id => id !== curVId),
      currentVehicle: { ...(instant.currentVehicle||{}), [driver.id]: null },
    });
    // Offer GPS trip creation
    if (onGPSTripEnd) onGPSTripEnd({ startData, endLoc, vehicleId: curVId });
  };

  return (
    <div className="card mb16" style={{ borderLeft: `4px solid ${isBusy ? "var(--red)" : "var(--green)"}`, background: isBusy ? "#ef444408" : "#22c55e08" }}>
      <div className="flex aic jb">
        <div>
          <div className="tsm txt2 mb4">Mi estado actual</div>
          <span className={`badge ${isBusy ? "br" : "bg"}`} style={{ fontSize: 14, padding: "6px 12px" }}>
            {isBusy ? "🔴 En viaje" : "🟢 Disponible"}
          </span>
          {isBusy && curV && <div className="tsm txt2 mt6">🚛 {curV.plates} — {curV.model}</div>}
          {isBusy && startData?.address && <div className="tsm txt2">📍 Inicio: {startData.address}</div>}
        </div>
        {locating ? <div className="tsm txt2">📍 Obteniendo ubicación...</div>
          : !isBusy
            ? <button className="btn btn-r" style={{ padding: "10px 16px", fontWeight: 700 }} onClick={() => setShowSelect(!showSelect)}>🚛 Iniciar viaje</button>
            : <button className="btn btn-gr" style={{ padding: "10px 16px", fontWeight: 700 }} onClick={endTrip}>✅ Finalizar viaje</button>
        }
      </div>
      {showSelect && !isBusy && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div className="tsm txt2 mb8">📍 Se registrará tu ubicación actual como punto de inicio.</div>
          <div className="flex gap8 aic">
            <div style={{ flex: 1 }}>
              <div className="tsm txt2 mb4">Selecciona la unidad:</div>
              <select value={selV} onChange={e => setSelV(e.target.value)} style={{ width: "100%" }}>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plates} — {v.model}</option>)}
              </select>
            </div>
            <div className="flex gap4 aic" style={{ marginTop: 20 }}>
              <button className="btn btn-r" onClick={startTrip}>Confirmar</button>
              <button className="btn btn-g" onClick={() => setShowSelect(false)}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChoferHome({ driver, trips, inspections, instructions, availableRelays, vehicles, instant, statusRequests, onNav, onAck, onRelay, onUpdateInstant, onUpdStatusRequest, onGPSTripEnd }) {
  const td = today(); const mk = nowMon();
  const my = trips.filter(t => t.driverId === driver.id);
  const pending = instructions.filter(i => i.driverId === driver.id && !i.ack);
  const lastIns = [...inspections.filter(i => i.driverId === driver.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <div className="page">
      {pending.length > 0 && (
        <div className="mb16">
          <div className="stitle" style={{ color: "var(--amber)" }}>📋 Instrucciones pendientes ({pending.length})</div>
          {pending.map(ins => (
            <div key={ins.id} className="instr-card mb8">
              <div className="flex aic jb mb8">
                <span style={{ fontWeight: 700, color: "var(--amber)" }}>{fmtDate(ins.date)}{ins.startTime ? ` · ${ins.startTime}` : ""}</span>
                <button className="btn btn-a btn-sm" onClick={() => onAck(ins.id)}>✓ Enterado</button>
              </div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{ins.pickup} → {ins.destination}</div>
              {ins.vehiclePlate && <div className="tsm txt2 mb4">🚛 Unidad: {ins.vehiclePlate}</div>}
              {ins.client && <div className="tsm txt2 mb4">👤 Cliente: {ins.client}</div>}
              {ins.cargo && <div className="tsm txt2 mb4">📦 {CARGO.find(c => c.v === ins.cargo)?.l}</div>}
              {ins.notes && <div className="tsm mt8">{ins.notes}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="mb16">
        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 26, fontWeight: 800 }}>¡Hola, {driver.name.split(" ")[0]}! 👋</div>
        <div className="txt2 tsm">{new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</div>
      </div>
      <div className="g3 mb16">
        <div className="card kpi"><div className="kv">{my.filter(t => t.date === td).length}</div><div className="kl">Hoy</div></div>
        <div className="card kpi"><div className="kv">{my.filter(t => t.date.startsWith(mk)).length}</div><div className="kl">Este mes</div></div>
        <div className="card kpi"><div className="kv">{my.length}</div><div className="kl">Total</div></div>
      </div>
      {/* Pending status requests from coordinator */}
      {(statusRequests||[]).filter(r => r.driverId === driver.id && r.status === "pending").map(req => (
        <div key={req.id} className="card mb12" style={{ borderLeft: "4px solid var(--amber)", background: "#f59e0b0a" }}>
          <div className="flex gap8 mb8">
            <span style={{ fontSize: 24 }}>📩</span>
            <div>
              <div style={{ fontWeight: 700 }}>Solicitud del coordinador</div>
              <div className="tsm txt2">{req.message}</div>
            </div>
          </div>
          <div className="flex gap8">
            <button className="btn btn-gr" style={{ flex: 1, justifyContent: "center" }}
              onClick={() => onUpdStatusRequest(req.id, { status: "confirmed", respondedAt: new Date().toISOString() })}>
              ✅ Confirmar
            </button>
            <button className="btn btn-g" style={{ flex: 1, justifyContent: "center", color: "var(--red)", borderColor: "var(--red)" }}
              onClick={() => onUpdStatusRequest(req.id, { status: "rejected", respondedAt: new Date().toISOString() })}>
              ❌ No, sigo ocupado
            </button>
          </div>
        </div>
      ))}
      {/* Driver status panel */}
      {instant && onUpdateInstant && (
        <DriverStatusPanel driver={driver} instant={instant} vehicles={vehicles} onUpdateInstant={onUpdateInstant} onGPSTripEnd={onGPSTripEnd} />
      )}
      {availableRelays && availableRelays.length > 0 && (
        <div className="mb16">
          <div className="stitle" style={{ color: "var(--amber)" }}>🔄 Viajes en curso ({availableRelays.length})</div>
          {availableRelays.map(t => {
            const v = vehicles.find(x => x.id === t.vehicleId);
            const isOwn = t.driverId === driver?.id;
            return (
              <div key={t.id} className="card mb8" style={{ borderLeft: `3px solid ${isOwn ? "var(--green)" : "var(--amber)"}` }}>
                <div className="flex aic jb mb6">
                  <span className={`badge ${isOwn ? "bg" : "ba"}`}>{isOwn ? "✋ Mi viaje" : "🔄 Relevo disponible"}</span>
                  <span className="tsm txt2">{fmtDate(t.date)}</span>
                </div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.origin} → {t.destination}</div>
                <div className="tsm txt2 mb8">
                  {t.client && <span>🤝 {t.client} · </span>}
                  {v && <span>🚛 {v.plates} · </span>}
                  {(t.legs || []).length > 0 && <span>{t.legs.length} tramo(s) previo(s)</span>}
                </div>
                <button className="btn btn-a btn-sm" onClick={() => onRelay(t)}>
                  {isOwn ? "✅ Retomar y completar mi viaje" : "🔄 Continuar este viaje"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="stitle">Acciones rápidas</div>
      <div className="g2 mb16">
        <div className="card card-click" style={{ borderColor: "#f59e0b44" }} onClick={() => onNav("nuevo")}>
          <div style={{ color: "var(--amber)", marginBottom: 6 }}><Ico path={IC.plus} size={28} /></div>
          <div style={{ fontWeight: 700 }}>Registrar Viaje</div><div className="txt2 tsm">Nuevo viaje realizado</div>
        </div>
        <div className="card card-click" style={{ borderColor: "#22c55e44" }} onClick={() => onNav("inspeccion")}>
          <div style={{ color: "var(--green)", marginBottom: 6 }}><Ico path={IC.wrench} size={28} /></div>
          <div style={{ fontWeight: 700 }}>Inspección</div><div className="txt2 tsm">Revisión de unidad</div>
        </div>
      </div>
      {lastIns && (
        <>
          <div className="stitle">Última Inspección</div>
          <div className="card">
            <div className="flex aic jb mb8">
              <span className="tsm txt2">{fmtDate(lastIns.date)}</span>
              <span className={`badge ${lastIns.issues && !lastIns.resolved ? "ba" : "bg"}`}>{lastIns.issues && !lastIns.resolved ? "Con observaciones" : "Sin novedades"}</span>
            </div>
            <div className="prog mb4"><div className="progf" style={{ width: `${(lastIns.passedCount / lastIns.totalCount) * 100}%` }} /></div>
            <div className="tsm txt2">{lastIns.passedCount}/{lastIns.totalCount} puntos verificados</div>
          </div>
        </>
      )}
    </div>
  );
}

function ChoferMisViajes({ driver, trips, vehicles }) {
  const [expanded, setExpanded] = useState({});
  const toggle = id => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const my = [...trips.filter(t =>
    t.driverId === driver.id || (t.legs || []).some(l => l.driverId === driver.id)
  )].sort((a, b) => b.date.localeCompare(a.date));
  if (!my.length) return <div className="page"><Empty title="Sin viajes registrados" sub="Tus viajes aparecerán aquí" /></div>;
  return (
    <div className="page">
      <div className="stitle">Mis Viajes ({my.length})</div>
      <div className="fcol gap8">
        {my.map(t => {
          const v = vehicles.find(x => x.id === t.vehicleId);
          const te = (t.tripExpenses || []).reduce((s, e) => s + e.amount, 0);
          const legs = t.legs || [];
          const isRelay = t.driverId !== driver.id;
          const isExp = expanded[t.id];
          return (
            <div key={t.id} className="card">
              {/* Header row — always visible */}
              <div className="flex aic jb mb6" onClick={() => toggle(t.id)} style={{ cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{t.origin} → {t.destination}</div>
                  <div className="tsm txt2">{fmtDate(t.date)}{t.client ? ` · 🤝 ${t.client}` : ""}</div>
                </div>
                <div className="flex gap6 aic">
                  {isRelay && <span className="badge ba">🔄 Relevo</span>}
                  {t.tripStatus === "en_curso" && <span className="badge br">En curso</span>}
                  <CargoBadge v={t.cargo} />
                  <span style={{ color: "var(--txt2)", fontSize: 13 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Collapsed summary */}
              {!isExp && (
                <div className="flex gap8 wrap tsm txt2">
                  {v && <span>🚛 {v.plates}</span>}
                  {t.departTime && <span>🕐 {t.departTime}{t.arriveTime ? `–${t.arriveTime}` : ""}</span>}
                  {te > 0 && <span style={{ color: "var(--amber)" }}>💸 {fmt$(te)}</span>}
                </div>
              )}

              {/* Expanded panel */}
              {isExp && (
                <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  {/* Legs */}
                  {legs.length > 0 && (
                    <div className="fcol gap3 mb10">
                      <div className="tsm txt2" style={{ fontWeight: 700 }}>Tramos:</div>
                      <div className="flex aic gap6 tsm">
                        <span>🧑‍✈️</span>
                        <span style={{ fontWeight: t.driverId === driver.id ? 700 : 400 }}>
                          {t.driverId === driver.id ? "Tú (inicio)" : "Chofer inicial"}{t.departTime ? ` · ${t.departTime}` : ""}{t.arriveTime ? `–${t.arriveTime}` : ""}
                        </span>
                        {v && <span className="txt2">· 🚛 {v.plates}</span>}
                      </div>
                      {legs.map(leg => {
                        const lv = vehicles.find(x => x.id === leg.vehicleId);
                        const isMe = leg.driverId === driver.id;
                        return (
                          <div key={leg.id} className="flex aic gap6 tsm">
                            <span>🔄</span>
                            <span style={{ fontWeight: isMe ? 700 : 400 }}>
                              {isMe ? "Tú (relevo)" : leg.driverName || "Otro chofer"}{leg.startTime ? ` · ${leg.startTime}` : ""}
                            </span>
                            {lv && <span className="txt2">· 🚛 {lv.plates}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Vehicle and basic info */}
                  <div className="g2 mb10 tsm txt2">
                    {v && <span>🚛 {v.plates} — {v.model}</span>}
                    {t.departTime && <span>🕐 {t.departTime}{t.arriveTime ? ` → ${t.arriveTime}` : ""}</span>}
                    {t.docNum && <span>📄 {t.docNum}</span>}
                    {te > 0 && <span style={{ color: "var(--amber)" }}>💸 Gastos: {fmt$(te)}</span>}
                  </div>

                  {/* 📷 Photos */}
                  <div style={{ background: "var(--bg3)", borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
                    <div className="tsm" style={{ fontWeight: 700, marginBottom: 8 }}>📷 Fotos del viaje</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
                      <div>
                        <div className="tsm txt2 mb4">Comprobante entrega</div>
                        <PhotoBtn label="Ver/subir" photoKey={[t.id, "delivery"]} compact />
                      </div>
                      <div>
                        <div className="tsm txt2 mb4">Patio regulador</div>
                        <PhotoBtn label="Ver/subir" photoKey={[t.id, "patio"]} compact />
                      </div>
                      <div>
                        <div className="tsm txt2 mb4">Carta porte</div>
                        <PhotoBtn label="Ver/subir" photoKey={[t.id, "cartaporte"]} compact />
                      </div>
                    </div>
                  </div>

                  {t.notes && <div className="tsm mt4" style={{ color: "var(--amber)", background: "#f59e0b11", padding: "6px 8px", borderRadius: 6 }}>⚠ {t.notes}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChoferMisInspecciones({ driver, inspections, vehicles }) {
  const mine = [...inspections.filter(i => i.driverId === driver.id)].sort((a, b) => b.date.localeCompare(a.date));
  if (!mine.length) return <div className="page"><Empty title="Sin inspecciones" sub="Aparecerán aquí" /></div>;
  return (
    <div className="page">
      <div className="stitle">Mis Inspecciones ({mine.length})</div>
      <div className="fcol gap8">
        {mine.map(ins => {
          const v = vehicles.find(x => x.id === ins.vehicleId);
          const pct = Math.round((ins.passedCount / ins.totalCount) * 100);
          const pc = pct === 100 ? "var(--green)" : pct >= 75 ? "var(--amber)" : "var(--red)";
          return (
            <div key={ins.id} className="card">
              <div className="flex aic jb mb8">
                <span className="tsm txt2">{fmtDate(ins.date)}</span>
                <div className="flex gap4 aic"><span className={`badge ${pct === 100 ? "bg" : pct >= 75 ? "ba" : "br"}`}>{pct}%</span>{ins.resolved && <span className="badge bg">✓ Resuelto</span>}</div>
              </div>
              {v && <div style={{ fontWeight: 700, marginBottom: 6 }}>{v.plates} — {v.model}</div>}
              <div className="prog mb8"><div className="progf" style={{ width: `${pct}%`, background: pc }} /></div>
              <div className="tsm txt2">{ins.passedCount}/{ins.totalCount} puntos OK</div>
              {ins.issues && <div className="tsm mt8" style={{ color: ins.resolved ? "var(--txt2)" : "var(--red)", background: ins.resolved ? "var(--bg3)" : "#ef444411", padding: "6px 8px", borderRadius: 6 }}>{ins.resolved ? "✓ Resuelto: " : "🔧 "}{ins.issues}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TripContinueForm({ trip, vehicles, currentDriver, onSave, onCancel }) {
  const av = vehicles.filter(v => v.active);
  const isOwn = trip.driverId === currentDriver?.id;
  const [f, setF] = useState({
    vehicleId: av[0]?.id || "",
    date: today(),
    startTime: "",
    notes: "",
    endKm: "",
    markComplete: true,
  });
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  return (
    <div className="card">
      <div className="stitle mb8">{isOwn ? "✅ Retomar mi viaje" : "🔄 Continuar viaje"}</div>
      <div className="card mb12" style={{ background: "var(--bg3)" }}>
        <div className="tsm txt2 mb2">{isOwn ? "Tu viaje incompleto:" : "Viaje original:"}</div>
        <div style={{ fontWeight: 700 }}>{trip.origin} → {trip.destination}</div>
        <div className="tsm txt2">{fmtDate(trip.date)} · {trip.client}</div>
        {isOwn && <div className="tsm mt4" style={{ color: "var(--green)" }}>✋ Tú iniciaste este viaje — puedes retomarlo y completarlo.</div>}
      </div>
      <div className="g2 mb8">
        <Field label="Mi unidad *"><select value={f.vehicleId} onChange={set("vehicleId")}>{av.map(v => <option key={v.id} value={v.id}>{v.plates} — {v.model}</option>)}</select></Field>
        <Field label="Fecha de mi tramo"><input type="date" value={f.date} onChange={set("date")} /></Field>
      </div>
      <Field label="Hora de inicio (opcional)"><input type="time" value={f.startTime} onChange={set("startTime")} /></Field>
      <Field label="Odómetro al entregar (km)"><input type="number" placeholder="Ej: 128450" value={f.endKm} onChange={set("endKm")} /></Field>
      <Field label="Notas del tramo"><textarea placeholder="Punto de entrega, incidencias..." value={f.notes} onChange={set("notes")} rows={2} /></Field>
      <div className="card mb12" style={{ background: f.markComplete ? "#22c55e11" : "#f59e0b11", border: `1px solid ${f.markComplete ? "var(--green)" : "var(--amber)"}` }}>
        <div className="flex aic gap10">
          <ChkBox checked={f.markComplete} onChange={() => setF(p => ({ ...p, markComplete: !p.markComplete }))} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{f.markComplete ? "✅ Marcar viaje como completado" : "🔄 El viaje continúa en curso"}</div>
            <div className="tsm txt2">{f.markComplete ? "El viaje queda cerrado al guardar." : "Otro chofer podrá retomarlo después."}</div>
          </div>
        </div>
      </div>
      <div className="flex gap8">
        <button className="btn btn-a" style={{ flex: 1, justifyContent: "center" }}
          onClick={() => {
            if (!f.vehicleId) return;
            const leg = { id: genId(), driverId: currentDriver.id, driverName: currentDriver.name, vehicleId: f.vehicleId, date: f.date, startTime: f.startTime, endKm: f.endKm, notes: f.notes };
            onSave(trip.id, { legs: [...(trip.legs || []), leg], tripStatus: f.markComplete ? "completado" : "en_curso" });
          }}>
          {f.markComplete ? "✅ Guardar y completar" : "🔄 Guardar tramo"}
        </button>
        <button className="btn btn-g" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function ChoferApp({ driver, trips, inspections, vehicles, drivers, razones, clients, instructions, instant, statusRequests, onAdd, onUpdate, onAddIns, onAck, onUpdateInstant, onUpdStatusRequest, onLogout }) {
  const [view, setView] = useState("home");
  const [toast, setToast] = useState("");
  const [relayTrip, setRelayTrip] = useState(null);
  const [gpsTrip, setGpsTrip] = useState(null); // Pre-filled GPS trip data
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const av = vehicles.filter(v => v.active);
  const pending = instructions.filter(i => i.driverId === driver.id && !i.ack).length;
  // Trips in progress available to continue — includes own trips AND others'
  // Excludes trips where this driver already added a relay leg
  const availableRelays = trips.filter(t =>
    t.tripStatus === "en_curso" &&
    !(t.legs || []).find(l => l.driverId === driver?.id)
  );
  const navTabs = [
    { id: "home", icon: IC.home, lbl: "Inicio" }, { id: "nuevo", icon: IC.plus, lbl: "Viaje" },
    { id: "inspeccion", icon: IC.wrench, lbl: "Inspección" }, { id: "viajes", icon: IC.list, lbl: "Mis Viajes" },
    { id: "mis-ins", icon: IC.eye, lbl: "Mis Insp." },
  ];
  return (
    <div>
      <div className="hdr">
        <div className="logo">⬡ TRANSCONTROL</div>
        <div className="flex aic gap8">
          {pending > 0 && <span className="badge ba">📋 {pending}</span>}
          {availableRelays.length > 0 && <span className="badge br">🔄 {availableRelays.length}</span>}
          <span className="tsm txt2">{driver.name}</span>
          <button className="btn btn-g btn-sm" onClick={onLogout}><Ico path={IC.logout} size={14} /></button>
        </div>
      </div>
      {toast && <div className="toast">✓ {toast}</div>}
      {view === "home" && <ChoferHome driver={driver} trips={trips} inspections={inspections} instructions={instructions}
        availableRelays={availableRelays} vehicles={vehicles} instant={instant} statusRequests={statusRequests}
        onNav={setView} onAck={onAck} onRelay={t => { setRelayTrip(t); setView("relay"); }}
        onUpdateInstant={onUpdateInstant} onUpdStatusRequest={onUpdStatusRequest}
        onGPSTripEnd={gpsData => { setGpsTrip(gpsData); setView("nuevo"); }} />}
      {view === "relay" && relayTrip && (
        <div className="page">
          <TripContinueForm trip={relayTrip} vehicles={av} currentDriver={driver}
            onSave={(id, patch) => { onUpdate(id, patch); showToast("Tramo guardado"); setRelayTrip(null); setView("home"); }}
            onCancel={() => { setRelayTrip(null); setView("home"); }} />
        </div>
      )}
      {view === "nuevo" && (
        <div className="page">
          {gpsTrip && (
            <div className="card mb12" style={{ borderLeft: "4px solid var(--green)", background: "#22c55e08" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>📍 Viaje registrado por GPS</div>
              <div className="tsm txt2">Origen: {gpsTrip.startData?.address || "Sin GPS"}</div>
              <div className="tsm txt2">Destino: {gpsTrip.endLoc?.address || "Sin GPS"}</div>
              <div className="tsm txt2 mt4">Los campos de origen y destino están pre-llenados. Puedes editarlos — quedarán marcados como "Modificado".</div>
            </div>
          )}
          <div className="stitle mb12">Registrar Nuevo Viaje</div>
          <TripForm drivers={drivers} vehicles={av} razones={razones} clients={clients} currentDriver={driver} isChofer={true}
            gpsOrigin={gpsTrip?.startData?.address} gpsDestination={gpsTrip?.endLoc?.address} gpsVehicleId={gpsTrip?.vehicleId}
            onSave={t => { onAdd(t); showToast("Viaje registrado"); setGpsTrip(null); setView("home"); }}
            onCancel={() => { setGpsTrip(null); setView("home"); }} />
        </div>
      )}
      {view === "inspeccion" && (
        <div className="page"><div className="stitle mb12">Inspección Físico-Mecánica</div>
          <InspectionForm vehicles={av} currentDriver={driver}
            onSave={i => { onAddIns(i); showToast("Inspección guardada"); setView("home"); }}
            onCancel={() => setView("home")} />
        </div>
      )}
      {view === "viajes" && <ChoferMisViajes driver={driver} trips={trips} vehicles={vehicles} />}
      {view === "mis-ins" && <ChoferMisInspecciones driver={driver} inspections={inspections} vehicles={vehicles} />}
      <nav className="nav-bot">
        {navTabs.map(t => (
          <button key={t.id} className={`nb-item ${view === t.id ? "act" : ""}`} onClick={() => setView(t.id)}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {Array.isArray(t.icon) ? t.icon.map((p, i) => <path key={i} d={p} />) : <path d={t.icon} />}
            </svg>
            {t.lbl}
          </button>
        ))}
      </nav>
    </div>
  );
}

// Inspections view shared between admin and coordinator
function InspectionsView({ inspections, vehicles, drivers, onResolve, onDelete }) {
  const [fv, setFv] = useState(""); const [onlyI, setOnlyI] = useState(false);
  const [delId, setDelId] = useState(null);
  const filtered = inspections.filter(i => {
    if (fv && i.vehicleId !== fv) return false;
    if (onlyI && (!i.issues || i.resolved)) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const gv = id => vehicles.find(v => v.id === id); const gd = id => drivers.find(d => d.id === id);
  return (
    <div>
      <div className="card mb12">
        <div className="flex gap8 wrap aic">
          <div style={{ flex: 1, minWidth: 160 }}><Field label="Unidad"><select value={fv} onChange={e => setFv(e.target.value)}><option value="">Todas</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plates}</option>)}</select></Field></div>
          <div className="flex aic gap8" style={{ marginTop: 20 }}>
            <ChkBox checked={onlyI} onChange={() => setOnlyI(p => !p)} />
            <label className="tsm" style={{ cursor: "pointer" }} onClick={() => setOnlyI(p => !p)}>Solo con fallas activas</label>
          </div>
        </div>
        <div className="tsm txt2 mt8">{filtered.length} inspecciones</div>
      </div>
      {filtered.length === 0 ? <Empty title="Sin inspecciones" sub="Ajusta los filtros" /> : (
        <div className="fcol gap8">
          {filtered.map(ins => {
            const v = gv(ins.vehicleId); const d = gd(ins.driverId);
            const pct = Math.round((ins.passedCount / ins.totalCount) * 100);
            const pc = pct === 100 ? "var(--green)" : pct >= 75 ? "var(--amber)" : "var(--red)";
            const failed = CHECKLIST.filter(item => !ins.checks[item.id]);
            const hasActiveIssue = ins.issues && !ins.resolved;
            // Can delete: inspections without issues anytime, or with issues only after resolved
            const canDelete = !ins.issues || ins.resolved;
            return (
              <div key={ins.id} className="card" style={{ borderLeft: `3px solid ${hasActiveIssue ? "var(--red)" : ins.resolved ? "var(--green)" : "var(--border)"}` }}>
                <div className="flex aic jb mb8">
                  <div className="flex aic gap8 wrap">
                    <span style={{ fontWeight: 700 }}>{v?.plates || "—"}</span>
                    <span className="tsm txt2">{v?.model}</span>
                  </div>
                  <div className="flex gap8 aic">
                    <span className="tsm txt2">{fmtDate(ins.date)}</span>
                    <span className={`badge ${pct === 100 ? "bg" : pct >= 75 ? "ba" : "br"}`}>{pct}%</span>
                    {ins.resolved && <span className="badge bg">✓ Resuelto</span>}
                    {onDelete && (
                      delId === ins.id ? (
                        <div className="flex gap4 aic">
                          <span className="tsm" style={{ color: "var(--red)" }}>¿Eliminar?</span>
                          <button className="btn btn-r btn-sm" onClick={() => { onDelete(ins.id); setDelId(null); }}>Sí</button>
                          <button className="btn btn-g btn-sm" onClick={() => setDelId(null)}>No</button>
                        </div>
                      ) : (
                        <button className="btn btn-g btn-sm" title={canDelete ? "Eliminar inspección" : "Resuelve la falla primero"}
                          style={{ opacity: canDelete ? 1 : 0.4, cursor: canDelete ? "pointer" : "not-allowed" }}
                          onClick={() => canDelete && setDelId(ins.id)}>
                          <Ico path={IC.trash} size={14} />
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="flex aic gap8 mb8">
                  <div className="prog" style={{ flex: 1 }}><div className="progf" style={{ width: `${pct}%`, background: pc }} /></div>
                  <span className="tsm txt2">{ins.passedCount}/{ins.totalCount}</span>
                </div>
                {d && <div className="tsm txt2 mb8">Conductor: {d.name}</div>}
                {failed.length > 0 && <div className="flex gap4 wrap mb8">{failed.map(item => <span key={item.id} className="badge br">{item.l}</span>)}</div>}
                {ins.issues && (
                  <div>
                    <div className="tsm mb8" style={{ color: ins.resolved ? "var(--txt2)" : "var(--red)", background: ins.resolved ? "var(--bg3)" : "#ef444411", padding: "6px 8px", borderRadius: 6 }}>
                      {ins.resolved ? "✓ Falla resuelta: " : "🔧 "}{ins.issues}
                    </div>
                    {!ins.resolved && onResolve && (
                      <button className="btn btn-gr btn-sm" onClick={() => onResolve(ins.id)}>✓ Marcar como resuelto</button>
                    )}
                    {ins.resolved && ins.resolvedAt && <div className="tsm txt2">Resuelto el {fmtDate(ins.resolvedAt)}</div>}
                    {hasActiveIssue && onDelete && <div className="tsm txt2 mt4">⚠ Marca como resuelto antes de poder eliminar</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Coordinator availability with INSTANT toggle
function CoordAvailability({ vehicles, drivers, schedule, instant, onUpdateInstant, onAddStatusRequest }) {
  const td = today();
  const schedSlots = schedule.filter(s => s.date === td);
  const schedBusyV = schedSlots.map(s => s.vehicleId);
  const schedBusyD = schedSlots.map(s => s.driverId);
  const freeV = instant.freeV || []; const freeD = instant.freeD || [];
  const instV = instant.vehicles || []; const instD = instant.drivers || [];

  // A unit is BUSY if: (in instant OR in schedule) AND not force-freed
  const isBusyV = id => (instV.includes(id) || schedBusyV.includes(id)) && !freeV.includes(id);
  const isBusyD = id => (instD.includes(id) || schedBusyD.includes(id)) && !freeD.includes(id);

  // Binary toggle: if busy → make free; if free → make busy
  const toggleV = id => {
    let u;
    if (isBusyV(id)) {
      // Make free: remove from instant, add to freeV if needed to override schedule
      const newInst = instV.filter(x => x !== id);
      const newFreeV = schedBusyV.includes(id) ? [...new Set([...freeV, id])] : freeV.filter(x => x !== id);
      u = { ...instant, vehicles: newInst, freeV: newFreeV };
    } else {
      // Make busy: remove from freeV, add to instant
      const newFreeV = freeV.filter(x => x !== id);
      const newInst = [...new Set([...instV, id])];
      u = { ...instant, vehicles: newInst, freeV: newFreeV };
    }
    onUpdateInstant(u);
  };
  const toggleD = id => {
    let u;
    if (isBusyD(id)) {
      const newInst = instD.filter(x => x !== id);
      const newFreeD = schedBusyD.includes(id) ? [...new Set([...freeD, id])] : freeD.filter(x => x !== id);
      u = { ...instant, drivers: newInst, freeD: newFreeD };
    } else {
      const newFreeD = freeD.filter(x => x !== id);
      const newInst = [...new Set([...instD, id])];
      u = { ...instant, drivers: newInst, freeD: newFreeD };
    }
    onUpdateInstant(u);
  };

  return (
    <div className="page">
      <div className="stitle">Disponibilidad de Hoy — {fmtDate(td)}</div>
      <div className="g2 mb16">
        <div>
          <div className="stitle" style={{ fontSize: 15 }}>🚛 Unidades</div>
          <div className="card">
            {vehicles.filter(v => v.active).map(v => {
              const busy = isBusyV(v.id);
              const slot = schedSlots.find(s => s.vehicleId === v.id);
              const isInstant = instV.includes(v.id) && !freeV.includes(v.id);
              const isForceFree = freeV.includes(v.id);
              const isSched = schedBusyV.includes(v.id) && !freeV.includes(v.id);
              return (
                <div key={v.id} className="avail-row">
                  <div>
                    <div style={{ fontWeight: 700 }}>{v.plates}</div>
                    <div className="tsm txt2">{v.model}</div>
                    {isSched && slot && <div className="tsm txt2">📅 {slot.startTime}–{slot.endTime}{slot.client ? ` · ${slot.client}` : ""}</div>}
                    {isInstant && <div className="tsm" style={{ color: "var(--red)" }}>🔴 Ocupado manualmente</div>}
                    {isForceFree && <div className="tsm" style={{ color: "var(--green)" }}>🟢 Liberado manualmente (override horario)</div>}
                  </div>
                  <div className="flex gap4 aic">
                    <span className={`badge ${busy ? "br" : "bg"}`}>{busy ? "Ocupado" : "Libre"}</span>
                    <button className={`btn btn-sm ${busy ? "btn-gr" : "btn-r"}`} onClick={() => toggleV(v.id)}>
                      {busy ? "✓ Liberar" : "Ocupar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="stitle" style={{ fontSize: 15 }}>👤 Conductores</div>
          <div className="card">
            {drivers.filter(d => d.active).map(d => {
              const busy = isBusyD(d.id);
              const slot = schedSlots.find(s => s.driverId === d.id);
              const isInstant = instD.includes(d.id) && !freeD.includes(d.id);
              const isForceFree = freeD.includes(d.id);
              const isSched = schedBusyD.includes(d.id) && !freeD.includes(d.id);
              return (
                <div key={d.id} className="avail-row">
                  <div>
                    <div style={{ fontWeight: 700 }}>{d.name}</div>
                    <div className="tsm txt2">{d.license}</div>
                    {isSched && slot && <div className="tsm txt2">📅 {slot.startTime}–{slot.endTime}</div>}
                    {isInstant && <div className="tsm" style={{ color: "var(--red)" }}>🔴 Ocupado manualmente</div>}
                    {isForceFree && <div className="tsm" style={{ color: "var(--green)" }}>🟢 Liberado manualmente</div>}
                    {(instant.currentVehicle||{})[d.id] && (() => { const cv = vehicles.find(v=>v.id===(instant.currentVehicle||{})[d.id]); return cv ? <div className="tsm" style={{color:"var(--red)"}}>🚛 {cv.plates} (iniciado por chofer)</div> : null; })()}
                  </div>
                  <div className="flex gap4 aic wrap">
                    <span className={`badge ${busy ? "br" : "bg"}`}>{busy ? "Ocupado" : "Libre"}</span>
                    <button className={`btn btn-sm ${busy ? "btn-gr" : "btn-r"}`} onClick={() => toggleD(d.id)}>
                      {busy ? "✓ Liberar" : "Ocupar"}
                    </button>
                    {onAddStatusRequest && (
                      <button className="btn btn-g btn-sm" title="Solicitar confirmación al chofer"
                        onClick={() => onAddStatusRequest({
                          id: genId(), driverId: d.id, vehicleId: (instant.currentVehicle||{})[d.id] || null,
                          requestedAction: busy ? "free" : "busy",
                          message: busy ? `El coordinador solicita que confirmes que ya terminaste tu viaje y estás disponible.` : `El coordinador solicita que confirmes que estás en servicio (ocupado).`,
                          status: "pending", requestedAt: new Date().toISOString()
                        })}>
                        📩
                      </button>
                    )}
                    {d.phone && (() => {
                      const msg = encodeURIComponent(`*TransControl* 🚛\nHola ${d.name}, el coordinador te solicita que abras la app y confirmes tu estado de disponibilidad.\n\n${busy ? "¿Ya terminaste tu viaje y estás disponible?" : "¿Estás actualmente en servicio?"}`);
                      return (
                        <a href={`https://wa.me/521${d.phone}?text=${msg}`} target="_blank" rel="noreferrer" className="btn btn-g btn-sm" title="Enviar WhatsApp al chofer" style={{ textDecoration: "none" }}>
                          💬
                        </a>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoordSchedule({ vehicles, drivers, razones, schedule, instructions, onSaveSchedule, onSaveInstructions }) {
  const [selDate, setSelDate] = useState(today());
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ vehicleId: vehicles[0]?.id || "", driverId: drivers[0]?.id || "", startTime: "08:00", endTime: "18:00", client: "", origin: "", destination: "", cargo: "general", notes: "", razonSocialId: razones[0]?.id || "" });
  const slots = schedule.filter(s => s.date === selDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const addSlot = () => {
    if (!f.vehicleId || !f.driverId) return;
    const slot = { ...f, id: genId(), date: selDate, createdAt: new Date().toISOString() };
    onSaveSchedule([...schedule, slot]);
    // Auto-generate instruction to driver
    const v = vehicles.find(x => x.id === f.vehicleId);
    const lines = [
      `📋 Viaje programado para el ${fmtDate(selDate)}`,
      `🚛 Unidad: ${v?.plates || ""} ${v?.model ? `(${v.model})` : ""}`,
      f.origin || f.destination ? `📍 ${f.origin ? f.origin : ""}${f.origin && f.destination ? " → " : ""}${f.destination ? f.destination : ""}` : null,
      `🕐 Horario: ${f.startTime} – ${f.endTime}`,
      f.client ? `🤝 Cliente: ${f.client}` : null,
      f.notes ? `📝 ${f.notes}` : null,
    ].filter(Boolean).join("\n");
    if (onSaveInstructions) {
      onSaveInstructions([...(instructions || []), { id: genId(), driverId: f.driverId, vehicleId: f.vehicleId, text: lines, date: today(), ack: false, fromSchedule: true }]);
    }
    setShowForm(false);
  };
  const delSlot = id => onSaveSchedule(schedule.filter(s => s.id !== id));
  return (
    <div className="page">
      <div className="flex aic jb mb12"><div className="stitle" style={{ margin: 0 }}>📅 Programar Unidades</div><button className="btn btn-a btn-sm" onClick={() => setShowForm(!showForm)}><Ico path={IC.plus} size={14} /> Asignar</button></div>
      <div className="card mb12"><Field label="Día"><input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} /></Field></div>
      {showForm && (
        <div className="card mb12">
          <div className="flex aic jb mb12"><span style={{ fontWeight: 700 }}>Nueva Asignación</span><button className="btn btn-g btn-sm" onClick={() => setShowForm(false)}>✕</button></div>
          <div className="g2 mb8">
            <Field label="Unidad"><select value={f.vehicleId} onChange={set("vehicleId")}>{vehicles.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.plates} — {v.model}</option>)}</select></Field>
            <Field label="Conductor"><select value={f.driverId} onChange={set("driverId")}>{drivers.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Inicio"><input type="time" value={f.startTime} onChange={set("startTime")} /></Field>
            <Field label="Fin"><input type="time" value={f.endTime} onChange={set("endTime")} /></Field>
            <Field label="Origen"><input placeholder="Ciudad de origen" value={f.origin || ""} onChange={set("origin")} /></Field>
            <Field label="Destino"><input placeholder="Ciudad destino" value={f.destination || ""} onChange={set("destination")} /></Field>
            <Field label="Cliente"><input placeholder="Cliente del servicio" value={f.client} onChange={set("client")} /></Field>
            <Field label="Tipo de servicio"><select value={f.cargo} onChange={set("cargo")}>{CARGO.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Field>
            <Field label="Razón Social"><select value={f.razonSocialId} onChange={set("razonSocialId")}>{razones.map(r => <option key={r.id} value={r.id}>{r.short}</option>)}</select></Field>
          </div>
          <Field label="Notas / instrucciones adicionales"><textarea placeholder="Info del servicio, indicaciones especiales..." value={f.notes} onChange={set("notes")} /></Field>
          <div className="tsm txt2 mt8 mb12" style={{ background: "var(--bg3)", padding: "8px 10px", borderRadius: 6 }}>
            💡 Al guardar se enviará automáticamente una instrucción al conductor con todos estos datos.
          </div>
          <button className="btn btn-a mt4" onClick={addSlot}><Ico path={IC.check} size={14} /> Guardar y notificar al conductor</button>
          {(() => {
            const selDriver = drivers.find(d => d.id === f.driverId);
            if (!selDriver?.phone) return <div className="tsm txt2 mt6">💡 Agrega el número de WhatsApp del conductor en Configuración para enviarle el viaje también por WhatsApp.</div>;
            const msg = encodeURIComponent(`*TransControl* 🚛\nHola ${selDriver.name}, tienes un viaje asignado:\n📅 ${f.date || "Fecha por confirmar"}\n🕐 ${f.startTime} – ${f.endTime}\n${f.origin ? `📍 ${f.origin} → ${f.destination}` : ""}\n${f.client ? `🤝 Cliente: ${f.client}` : ""}\n${f.notes ? `📝 ${f.notes}` : ""}\n\nAbre la app para ver los detalles y confirmar.`);
            return (
              <a href={`https://wa.me/521${selDriver.phone}?text=${msg}`} target="_blank" rel="noreferrer"
                className="btn btn-g mt6" style={{ textDecoration: "none", justifyContent: "center" }}>
                💬 Enviar también por WhatsApp
              </a>
            );
          })()}
        </div>
      )}
      {slots.length === 0 ? <div className="card"><Empty title="Sin asignaciones este día" sub="Agrega asignaciones de unidades" /></div> : (
        <div className="fcol gap8">
          {slots.map(s => {
            const v = vehicles.find(x => x.id === s.vehicleId); const d = drivers.find(x => x.id === s.driverId); const rs = razones.find(x => x.id === s.razonSocialId);
            return (
              <div key={s.id} className="card" style={{ borderLeft: "3px solid var(--amber)" }}>
                <div className="flex aic jb mb8">
                  <div className="flex aic gap8">
                    <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 18, fontWeight: 800, color: "var(--amber)" }}>{s.startTime} — {s.endTime}</span>
                    {rs && <span className="rs-pill">{rs.short}</span>}
                    {s.cargo && <CargoBadge v={s.cargo} />}
                  </div>
                  <button className="btn btn-g btn-sm" onClick={() => delSlot(s.id)}><Ico path={IC.trash} size={14} /></button>
                </div>
                <div className="g2 tsm txt2">
                  <div>🚛 <strong style={{ color: "var(--txt)" }}>{v?.plates}</strong> {v?.model}</div>
                  <div>👤 <strong style={{ color: "var(--txt)" }}>{d?.name}</strong></div>
                </div>
                {s.client && <div className="tsm txt2 mt4">📦 {s.client}</div>}
                {s.notes && <div className="tsm mt8">{s.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CoordInstructions({ vehicles, drivers, razones, instructions, onSaveInstructions }) {
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ driverId: drivers[0]?.id || "", vehicleId: vehicles[0]?.id || "", date: today(), startTime: "08:00", pickup: "", destination: "", cargo: "general", client: "", notes: "", razonSocialId: razones[0]?.id || "" });
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const addIns = () => {
    if (!f.driverId || !f.pickup || !f.destination) { alert("Completa: Conductor, Origen y Destino"); return; }
    const v = vehicles.find(x => x.id === f.vehicleId);
    onSaveInstructions([...instructions, { ...f, id: genId(), ack: false, vehiclePlate: v?.plates, createdAt: new Date().toISOString() }]);
    setShowForm(false);
  };
  const del = id => onSaveInstructions(instructions.filter(i => i.id !== id));
  const sorted = [...instructions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="page">
      <div className="flex aic jb mb12"><div className="stitle" style={{ margin: 0 }}>📨 Instrucciones a Conductores</div><button className="btn btn-a btn-sm" onClick={() => setShowForm(!showForm)}><Ico path={IC.plus} size={14} /> Nueva</button></div>
      {showForm && (
        <div className="card mb12">
          <div className="flex aic jb mb12"><span style={{ fontWeight: 700 }}>Nueva Instrucción</span><button className="btn btn-g btn-sm" onClick={() => setShowForm(false)}>✕</button></div>
          <div className="g2 mb8">
            <Field label="Conductor *"><select value={f.driverId} onChange={set("driverId")}>{drivers.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Unidad"><select value={f.vehicleId} onChange={set("vehicleId")}>{vehicles.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.plates} — {v.model}</option>)}</select></Field>
            <Field label="Fecha *"><input type="date" value={f.date} onChange={set("date")} /></Field>
            <Field label="Hora de inicio"><input type="time" value={f.startTime} onChange={set("startTime")} /></Field>
            <Field label="Punto de inicio *"><input placeholder="¿Dónde presentarse?" value={f.pickup} onChange={set("pickup")} /></Field>
            <Field label="Destino *"><input placeholder="A dónde llevar la carga" value={f.destination} onChange={set("destination")} /></Field>
            <Field label="Cliente"><input placeholder="Nombre del cliente" value={f.client} onChange={set("client")} /></Field>
            <Field label="Tipo de servicio"><select value={f.cargo} onChange={set("cargo")}>{CARGO.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Field>
          </div>
          <Field label="Instrucciones adicionales"><textarea placeholder="Contacto, especificaciones, requerimientos especiales..." value={f.notes} onChange={set("notes")} /></Field>
          <button className="btn btn-a mt12" onClick={addIns}><Ico path={IC.send} size={14} /> Enviar instrucción</button>
        </div>
      )}
      {!sorted.length ? <div className="card"><Empty title="Sin instrucciones" sub="Las instrucciones enviadas aparecerán aquí" /></div> : (
        <div className="fcol gap8">
          {sorted.map(ins => {
            const d = drivers.find(x => x.id === ins.driverId); const v = vehicles.find(x => x.id === ins.vehicleId);
            return (
              <div key={ins.id} className="card" style={{ borderLeft: `3px solid ${ins.ack ? "var(--green)" : "var(--amber)"}` }}>
                <div className="flex aic jb mb8">
                  <div className="flex aic gap8"><span style={{ fontWeight: 700 }}>{d?.name || "—"}</span><span className={`badge ${ins.ack ? "bg" : "ba"}`}>{ins.ack ? "✓ Enterado" : "Pendiente"}</span></div>
                  <div className="flex gap4 aic"><span className="tsm txt2">{fmtDate(ins.date)}</span><button className="btn btn-g btn-sm" onClick={() => del(ins.id)}><Ico path={IC.trash} size={14} /></button></div>
                </div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{ins.pickup} → {ins.destination}</div>
                <div className="flex gap8 tsm txt2 wrap">
                  {v && <span>🚛 {v.plates}</span>}{ins.startTime && <span>🕐 {ins.startTime}</span>}
                  {ins.client && <span>👤 {ins.client}</span>}
                </div>
                {ins.notes && <div className="tsm mt8">{ins.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CoordProviderForm({ providers, onSaveProviders }) {
  const [np, setNp] = useState({ name: "", rfc: "", paymentMethod: "transferencia" });
  const add = () => {
    if (!np.name.trim()) return;
    onSaveProviders([...(providers || []), { id: genId(), name: np.name.trim(), rfc: np.rfc.trim(), paymentMethod: np.paymentMethod, active: true }]);
    setNp({ name: "", rfc: "", paymentMethod: "transferencia" });
  };
  return (
    <div className="flex gap8 wrap">
      <div style={{ flex: 2, minWidth: 160 }}><Field label="Nombre *"><input value={np.name} onChange={e => setNp(p => ({ ...p, name: e.target.value }))} placeholder="Nombre del proveedor" onKeyDown={e => e.key === "Enter" && add()} /></Field></div>
      <div style={{ flex: 1, minWidth: 100 }}><Field label="RFC"><input value={np.rfc} onChange={e => setNp(p => ({ ...p, rfc: e.target.value }))} placeholder="RFC" /></Field></div>
      <div style={{ flex: 1, minWidth: 120 }}><Field label="Forma de pago"><select value={np.paymentMethod} onChange={e => setNp(p => ({ ...p, paymentMethod: e.target.value }))}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></Field></div>
      <div style={{ display: "flex", alignItems: "flex-end" }}><button className="btn btn-a" onClick={add}><Ico path={IC.plus} size={14} /> Agregar</button></div>
    </div>
  );
}

function CoordClientForm({ clients, onSaveClients }) {
  const [nc, setNc] = useState({ name: "", rfc: "" });
  const add = () => {
    if (!nc.name.trim()) return;
    onSaveClients([...(clients || []), { id: genId(), name: nc.name.trim(), rfc: nc.rfc.trim(), active: true }]);
    setNc({ name: "", rfc: "" });
  };
  return (
    <div className="flex gap8 wrap">
      <div style={{ flex: 2, minWidth: 160 }}><Field label="Nombre del cliente *"><input value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la empresa" onKeyDown={e => e.key === "Enter" && add()} /></Field></div>
      <div style={{ flex: 1, minWidth: 130 }}><Field label="RFC (opcional)"><input value={nc.rfc} onChange={e => setNc(p => ({ ...p, rfc: e.target.value }))} placeholder="RFC" /></Field></div>
      <div style={{ display: "flex", alignItems: "flex-end" }}><button className="btn btn-a" onClick={add}><Ico path={IC.plus} size={14} /> Agregar</button></div>
    </div>
  );
}

function CoordGastosViaje({ trips, onUpdate }) {
  const [expandedTrips, setExpandedTrips] = useState({});
  const [showAll, setShowAll] = useState(false);
  const toggleTrip = id => setExpandedTrips(p => ({ ...p, [id]: !p[id] }));
  const sorted = [...trips].sort((a, b) => b.date.localeCompare(a.date));
  const withPending = sorted.filter(t => {
    if (t.noExtraExpenses) return false;
    const exp = t.tripExpenses || [];
    return exp.some(e => e.paid !== true) || exp.length === 0;
  });
  const displayed = showAll ? sorted : withPending;
  return (
    <div>
      <div className="pill-tabs mb12" style={{ margin: 0 }}>
        <button className={`pill-tab ${!showAll ? "act" : ""}`} onClick={() => setShowAll(false)}>Pendientes ({withPending.length})</button>
        <button className={`pill-tab ${showAll ? "act" : ""}`} onClick={() => setShowAll(true)}>Todos ({sorted.length})</button>
      </div>
      <div className="fcol gap4">
        {displayed.slice(0, 50).map(t => {
          const expenses = t.tripExpenses || [];
          const pendCount = expenses.filter(e => e.paid !== true).length;
          const allPaid = expenses.length > 0 && expenses.every(e => e.paid === true);
          const isExp = expandedTrips[t.id];
          const status = t.noExtraExpenses ? "sin-extras" : allPaid ? "pagado" : pendCount > 0 ? "pendiente" : "sin-gastos";
          const statusColor = status === "sin-extras" || status === "pagado" ? "var(--green)" : status === "pendiente" ? "var(--amber)" : "var(--txt2)";
          const statusLabel = status === "sin-extras" ? "✓ Sin extras" : status === "pagado" ? "✓ Todo pagado" : status === "pendiente" ? `${pendCount} pendiente(s)` : "Sin gastos";
          return (
            <div key={t.id} className="card" style={{ padding: "10px 12px", borderLeft: `3px solid ${statusColor}` }}>
              <div className="flex aic jb" onClick={() => toggleTrip(t.id)} style={{ cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.origin} → {t.destination}</div>
                  <div className="tsm txt2">{fmtDate(t.date)}{t.client ? ` · 🤝 ${t.client}` : ""}</div>
                </div>
                <div className="flex gap6 aic">
                  <span className="tsm" style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
                  {!t.noExtraExpenses && (
                    <button className="btn btn-g btn-sm" title="Marcar sin gastos extras"
                      onClick={e => { e.stopPropagation(); onUpdate(t.id, { noExtraExpenses: true }); }}
                      style={{ fontSize: 11 }}>✓ Sin extras</button>
                  )}
                  <span style={{ color: "var(--txt2)", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExp && !t.noExtraExpenses && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <TripExpensesManager trip={t} onUpdate={onUpdate} />
                </div>
              )}
              {isExp && t.noExtraExpenses && (
                <div className="flex aic gap8 mt8">
                  <div className="tsm txt2">✓ Marcado sin gastos extras</div>
                  <button className="btn btn-g btn-sm" style={{ fontSize: 11 }} onClick={() => onUpdate(t.id, { noExtraExpenses: false })}>↩ Reactivar</button>
                </div>
              )}
            </div>
          );
        })}
        {displayed.length === 0 && <Empty title="Sin viajes pendientes" sub="Todos los viajes tienen sus gastos resueltos 🎉" />}
      </div>
    </div>
  );
}

function CoordApp({ vehicles, drivers, razones, clients, providers, trips, outsourced, schedule, instructions, inspections, instant, onSaveSchedule, onSaveInstructions, onUpdateInstant, onResolveInspection, onDeleteInspection, onSaveVehicles, onSaveClients, onSaveProviders, onAddOut, onUpdateOut, onDeleteOut, onUpdate, onAddStatusRequest, onLogout }) {
  const [tab, setTab] = useState("avail");
  const pending = instructions.filter(i => !i.ack).length;
  const activeIssues = inspections.filter(i => i.issues && !i.resolved).length;
  const pendingExpenses = trips.reduce((s, t) => s + (t.tripExpenses || []).filter(e => e.paid !== true).length, 0);
  const tabs = [
    { id: "avail", l: "🟢 Disponibilidad" }, { id: "sched", l: "📅 Programar" },
    { id: "instrs", l: `📨 Instrucciones${pending > 0 ? ` (${pending})` : ""}` },
    { id: "inspect", l: `🔧 Inspecciones${activeIssues > 0 ? ` (${activeIssues})` : ""}` },
    { id: "tercerizados", l: "🔗 Tercerizados" },
    { id: "gastos-viaje", l: `💸 Gastos viajes${pendingExpenses > 0 ? ` (${pendingExpenses})` : ""}` },
    { id: "odometro", l: "🛣️ Odómetro" },
    { id: "clientes", l: "🤝 Clientes" },
    { id: "proveedores", l: "🚛 Proveedores" },
  ];
  return (
    <div>
      <div className="hdr">
        <div className="logo">⬡ TRANSCONTROL</div>
        <div className="flex aic gap8"><span className="badge bpu">Coordinador</span><button className="btn btn-g btn-sm" onClick={onLogout}><Ico path={IC.logout} size={14} /> Salir</button></div>
      </div>
      <div className="nav-tabs">{tabs.map(t => <button key={t.id} className={`ntab ${tab === t.id ? "act" : ""}`} onClick={() => setTab(t.id)}>{t.l}</button>)}</div>
      {tab === "avail" && <CoordAvailability vehicles={vehicles} drivers={drivers} schedule={schedule} instant={instant} onUpdateInstant={onUpdateInstant} onAddStatusRequest={onAddStatusRequest} />}
      {tab === "sched" && <CoordSchedule vehicles={vehicles} drivers={drivers} razones={razones} schedule={schedule} instructions={instructions} onSaveSchedule={onSaveSchedule} onSaveInstructions={onSaveInstructions} />}
      {tab === "instrs" && <CoordInstructions vehicles={vehicles} drivers={drivers} razones={razones} instructions={instructions} onSaveInstructions={onSaveInstructions} />}
      {tab === "inspect" && <div className="page"><div className="stitle">Inspecciones Físico-Mecánicas</div><InspectionsView inspections={inspections} vehicles={vehicles} drivers={drivers} onResolve={onResolveInspection} onDelete={onDeleteInspection} /></div>}
      {tab === "tercerizados" && <AdminTercerizados outsourced={outsourced} razones={razones} clients={clients} providers={providers} onAdd={onAddOut} onUpdate={onUpdateOut} onDelete={onDeleteOut} />}
      {tab === "gastos-viaje" && (
        <div className="page">
          <div className="flex aic jb mb12">
            <div className="stitle" style={{ margin: 0 }}>💸 Gastos de Viajes</div>
            <div className="tsm txt2">{pendingExpenses} pendiente(s)</div>
          </div>
          <CoordGastosViaje trips={trips} onUpdate={onUpdate} />
        </div>
      )}
      {tab === "odometro" && <AdminOdometro trips={trips} vehicles={vehicles} onSaveVehicles={onSaveVehicles} />}
      {tab === "clientes" && (
        <div className="page">
          <div className="stitle">🤝 Catálogo de Clientes</div>
          <div className="card mb12">
            <div className="tsm txt2 mb8">Agrega clientes para que los choferes los seleccionen al registrar un viaje.</div>
            <CoordClientForm clients={clients} onSaveClients={onSaveClients} />
          </div>
          <div className="fcol gap8">
            {(!clients || clients.length === 0) ? <div className="card"><Empty title="Sin clientes" sub="Agrega el primer cliente arriba" /></div> :
              (clients || []).map(c => (
                <div key={c.id} className="card flex aic jb">
                  <div><div style={{ fontWeight: 700 }}>{c.name}</div>{c.rfc && <div className="tsm txt2">RFC: {c.rfc}</div>}</div>
                  <button className={`btn btn-sm ${c.active !== false ? "btn-g" : "btn-a"}`}
                    onClick={() => onSaveClients((clients||[]).map(x => x.id === c.id ? { ...x, active: x.active === false } : x))}>
                    {c.active !== false ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ))
            }
          </div>
        </div>
      )}
      {tab === "proveedores" && (
        <div className="page">
          <div className="stitle">🚛 Catálogo de Proveedores</div>
          <div className="card mb12">
            <div className="tsm txt2 mb8">Proveedores disponibles para seleccionar en Viajes Tercerizados.</div>
            <CoordProviderForm providers={providers} onSaveProviders={onSaveProviders} />
          </div>
          <div className="fcol gap8">
            {(!providers || providers.length === 0) ? <div className="card"><Empty title="Sin proveedores" sub="Agrega el primer proveedor arriba" /></div> :
              (providers || []).map(p => (
                <div key={p.id} className="card flex aic jb">
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div className="tsm txt2">{[p.rfc && `RFC: ${p.rfc}`, p.paymentMethod && `Pago: ${p.paymentMethod}`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button className={`btn btn-sm ${p.active !== false ? "btn-g" : "btn-a"}`}
                    onClick={() => onSaveProviders((providers||[]).map(x => x.id === p.id ? { ...x, active: x.active === false } : x))}>
                    {p.active !== false ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ))
            }
          </div>
        </div>
      )}
      {tab === "clientes" && (
        <div className="page">
          <div className="stitle">🤝 Catálogo de Clientes</div>
          <div className="card mb12">
            <div className="tsm txt2 mb8">Agrega clientes para que los choferes los seleccionen al registrar un viaje.</div>
            <CoordClientForm clients={clients} onSaveClients={onSaveClients} />
          </div>
          <div className="fcol gap8">
            {(!clients || clients.length === 0) ? <div className="card"><Empty title="Sin clientes" sub="Agrega el primer cliente arriba" /></div> :
              (clients || []).map(c => (
                <div key={c.id} className="card flex aic jb">
                  <div><div style={{ fontWeight: 700 }}>{c.name}</div>{c.rfc && <div className="tsm txt2">RFC: {c.rfc}</div>}</div>
                  <button className={`btn btn-sm ${c.active !== false ? "btn-g" : "btn-a"}`}
                    onClick={() => onSaveClients((clients||[]).map(x => x.id === c.id ? { ...x, active: x.active === false } : x))}>
                    {c.active !== false ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD HELPERS ───────────────────────────────────────────────────────
function exportCSV(rows, filename) {
  const esc = v => String(v).replace(/"/g, '""');
  const csv = rows.map(r => r.map(v => `"${esc(v)}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function SmartAlerts({ trips, outsourced, inspections, vehicles, expenses }) {
  const alerts = [];
  const mk = nowMon();
  const sinCompl = trips.filter(t => t.billingStatus === "pagado" && t.paidDate && daysSince(t.paidDate) > 5);
  if (sinCompl.length) alerts.push({ type: "warn", msg: `${sinCompl.length} servicio(s) pagado(s) sin complemento SAT (>5 días)` });
  const clients60 = [...new Set(trips.filter(t => (t.billingStatus||"sin_facturar") !== "pagado" && (t.billingStatus||"sin_facturar") !== "complemento" && t.amount > 0 && daysSince(t.date) > 60).map(t => t.client))];
  if (clients60.length) alerts.push({ type: "red", msg: `${clients60.length} cliente(s) con adeudo >60 días: ${clients60.slice(0,3).join(", ")}${clients60.length>3?"...":""}` });
  const sinMonto = trips.filter(t => t.date.startsWith(mk) && !t.amount);
  if (sinMonto.length) alerts.push({ type: "warn", msg: `${sinMonto.length} servicio(s) del mes sin monto asignado` });
  const tercVenc = outsourced.filter(o => !o.paid && o.dueDate && daysSince(o.dueDate) > 0);
  if (tercVenc.length) alerts.push({ type: "red", msg: `${tercVenc.length} pago(s) vencidos a proveedores — ${fmt$(tercVenc.reduce((s,o)=>s+(o.providerAmount||0),0))}` });
  const tercProx = outsourced.filter(o => !o.paid && o.dueDate && daysSince(o.dueDate)<=0 && daysSince(o.dueDate)>-7);
  if (tercProx.length) alerts.push({ type: "warn", msg: `${tercProx.length} pago(s) a proveedores vencen esta semana` });
  const vFallas = vehicles.filter(v => { const li = inspections.filter(i=>i.vehicleId===v.id).sort((a,b)=>b.date.localeCompare(a.date))[0]; return li && li.issues && !li.resolved; });
  if (vFallas.length) alerts.push({ type: "red", msg: `${vFallas.length} unidad(es) con falla activa: ${vFallas.map(v=>v.plates).join(", ")}` });
  const vSinIns = vehicles.filter(v=>v.active).filter(v => { const li = inspections.filter(i=>i.vehicleId===v.id).sort((a,b)=>b.date.localeCompare(a.date))[0]; return !li || daysSince(li.date)>30; });
  if (vSinIns.length) alerts.push({ type: "warn", msg: `${vSinIns.length} unidad(es) sin inspección >30 días: ${vSinIns.map(v=>v.plates).join(", ")}` });
  const sinFactMes = trips.filter(t => t.date.startsWith(mk) && (t.billingStatus||"sin_facturar")==="sin_facturar" && t.amount > 0);
  if (sinFactMes.length) alerts.push({ type: "warn", msg: `${sinFactMes.length} servicio(s) del mes sin facturar` });

  // ── Anomaly detection: compare current month expenses to 3-month average ──
  if (expenses && expenses.length) {
    const avgBycat = {};
    for (let i = 1; i <= 3; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const pm = d.toISOString().slice(0, 7);
      expenses.filter(e => e.month === pm).forEach(e => {
        avgBycat[e.cat] = (avgBycat[e.cat] || 0) + e.amount / 3;
      });
    }
    const curBycat = {};
    expenses.filter(e => e.month === mk).forEach(e => {
      curBycat[e.cat] = (curBycat[e.cat] || 0) + e.amount;
    });
    for (const [cat, avg] of Object.entries(avgBycat)) {
      const cur = curBycat[cat] || 0;
      if (avg > 500 && cur > avg * 1.3) {
        alerts.push({ type: "warn", msg: `⚠ Gasto inusual en "${cat}": ${fmt$(cur)} este mes vs promedio ${fmt$(Math.round(avg))} (+${Math.round((cur/avg-1)*100)}%)` });
      }
    }
  }

  // ── Odometer maintenance alerts ──
  vehicles.filter(v => v.active && v.maintenanceKm && Number(v.maintenanceKm) > 0).forEach(v => {
    const vTrips = trips.filter(t => t.vehicleId === v.id && t.endKm).sort((a, b) => Number(b.endKm) - Number(a.endKm));
    const curKm = vTrips[0] ? Number(vTrips[0].endKm) : 0;
    const lastMaintKm = Number(v.lastMaintenanceKm || 0);
    const interval = Number(v.maintenanceKm);
    const kmSince = curKm - lastMaintKm;
    if (curKm > 0 && kmSince >= interval) {
      alerts.push({ type: "red", msg: `🔧 ${v.plates}: mantenimiento VENCIDO — ${kmSince.toLocaleString()} km desde último servicio (intervalo: ${interval.toLocaleString()} km)` });
    } else if (curKm > 0 && kmSince >= interval * 0.85) {
      alerts.push({ type: "warn", msg: `🔧 ${v.plates}: mantenimiento próximo — ${kmSince.toLocaleString()} km / ${interval.toLocaleString()} km (${Math.round((kmSince/interval)*100)}%)` });
    }
  });

  if (!alerts.length) return <div className="ok-box mb12 flex aic gap8"><span style={{fontSize:20}}>✅</span><span style={{fontWeight:700}}>Todo en orden — sin alertas críticas</span></div>;
  return (
    <div className="mb12">
      <div className="stitle">🔔 Alertas Inteligentes</div>
      <div className="fcol" style={{gap:6}}>
        {alerts.map((a,i) => (
          <div key={i} className={a.type==="red"?"alert-box":"warn-box"} style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18,flexShrink:0}}>{a.type==="red"?"🔴":"⚠️"}</span>
            <span className="tsm">{a.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ trips, expenses, outsourced, selRS }) {
  const data = [];
  for (let i=5; i>=0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    const mk = d.toISOString().slice(0,7);
    const lbl = d.toLocaleDateString("es-MX",{month:"short",year:"2-digit"});
    const ft = trips.filter(t => t.date.startsWith(mk) && (selRS==="all"||t.razonSocialId===selRS));
    const fo = outsourced.filter(o => o.date.startsWith(mk) && (selRS==="all"||o.razonSocialId===selRS));
    const ing = ft.reduce((s,t)=>s+(t.amount||0),0)+fo.reduce((s,o)=>s+(o.clientAmount||0),0);
    const gas = expenses.filter(e=>e.month===mk&&(selRS==="all"||e.razonSocialId===selRS)).reduce((s,e)=>s+e.amount,0)
      +ft.reduce((s,t)=>s+(t.tripExpenses||[]).reduce((a,x)=>a+x.amount,0),0)
      +fo.reduce((s,o)=>s+(o.providerAmount||0),0);
    data.push({mes:lbl,Ingresos:Math.round(ing),Gastos:Math.round(gas),Utilidad:Math.round(ing-gas)});
  }
  const fmtK = v => v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`;
  return (
    <div className="card mb12">
      <div className="stitle" style={{fontSize:15,marginBottom:12}}>📈 Tendencia 6 meses</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{top:0,right:8,left:0,bottom:0}}>
          <XAxis dataKey="mes" tick={{fill:"#8b949e",fontSize:11}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:"#8b949e",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={fmtK}/>
          <Tooltip formatter={v=>fmt$(v)} contentStyle={{background:"#1c2333",border:"1px solid #30363d",borderRadius:6,fontSize:12}} labelStyle={{color:"#e6edf3",fontWeight:700}}/>
          <Legend wrapperStyle={{fontSize:12,color:"#8b949e"}}/>
          <Bar dataKey="Ingresos" fill="#22c55e" radius={[3,3,0,0]}/>
          <Bar dataKey="Gastos" fill="#ef4444" radius={[3,3,0,0]}/>
          <Bar dataKey="Utilidad" fill="#f59e0b" radius={[3,3,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AgingCartera({ trips, selRS }) {
  const ft = trips.filter(t => (t.billingStatus||"sin_facturar")!=="pagado" && (t.billingStatus||"sin_facturar")!=="complemento" && t.amount>0 && (selRS==="all"||t.razonSocialId===selRS));
  const buckets = [{l:"0–30d",min:0,max:30,c:"var(--green)"},{l:"31–60d",min:31,max:60,c:"var(--amber)"},{l:"61–90d",min:61,max:90,c:"#f97316"},{l:"+90d",min:91,max:9999,c:"var(--red)"}];
  const data = buckets.map(b => { const items=ft.filter(t=>{const d=daysSince(t.date);return d!==null&&d>=b.min&&d<=b.max;}); return {...b,count:items.length,total:items.reduce((s,t)=>s+t.amount,0)}; });
  const grand = data.reduce((s,b)=>s+b.total,0);
  if (!grand) return null;
  return (
    <div className="card mb12">
      <div className="flex aic jb mb12">
        <div className="stitle" style={{fontSize:15,margin:0}}>📋 Aging de cartera</div>
        <span style={{fontWeight:800,color:"var(--amber)",fontSize:18}}>{fmt$(grand)}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {data.map(b=>(
          <div key={b.l} style={{background:"var(--bg3)",borderRadius:6,padding:10,borderTop:`3px solid ${b.c}`}}>
            <div style={{fontFamily:"'Barlow Condensed'",fontSize:22,fontWeight:800,color:b.c}}>{fmt$(b.total)}</div>
            <div className="tsm txt2">{b.l}</div>
            <div className="tsm txt2">{b.count} serv.</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDashboard({ trips, vehicles, drivers, expenses, outsourced, razones, inspections }) {
  const [selRS, setSelRS] = useState("all");
  const mk = nowMon();
  const ft = trips.filter(t => selRS==="all"||t.razonSocialId===selRS);
  const mt = ft.filter(t => t.date.startsWith(mk));
  const outFilt = outsourced.filter(o => (selRS==="all"||o.razonSocialId===selRS)&&o.date.startsWith(mk));
  const income = mt.reduce((s,t)=>s+(t.amount||0),0)+outFilt.reduce((s,o)=>s+(o.clientAmount||0),0);
  const exps = expenses.filter(e=>e.month===mk&&(selRS==="all"||e.razonSocialId===selRS)).reduce((s,e)=>s+e.amount,0)
    +mt.reduce((s,t)=>s+(t.tripExpenses||[]).reduce((a,x)=>a+x.amount,0),0)
    +outFilt.reduce((s,o)=>s+(o.providerAmount||0),0);
  const profit = income-exps;
  const collected = mt.filter(t=>(t.billingStatus||"sin_facturar")==="complemento"||(t.billingStatus||"sin_facturar")==="pagado").reduce((s,t)=>s+(t.amount||0),0);
  const dStats = drivers.map(d=>({...d,cnt:ft.filter(t=>t.driverId===d.id&&t.date.startsWith(mk)).length})).sort((a,b)=>b.cnt-a.cnt);
  const maxC = dStats[0]?.cnt||1;
  const clientStats = [...new Set(mt.map(t=>t.client).filter(Boolean))].map(c=>({c,total:mt.filter(t=>t.client===c).reduce((s,t)=>s+(t.amount||0),0),count:mt.filter(t=>t.client===c).length})).sort((a,b)=>b.total-a.total).slice(0,5);
  return (
    <div className="ap">
      <div className="flex aic jb mb12 wrap gap8">
        <div className="stitle" style={{margin:0}}>Dashboard — {new Date().toLocaleDateString("es-MX",{month:"long",year:"numeric"})}</div>
        <div className="pill-tabs" style={{margin:0}}>
          <button className={`pill-tab ${selRS==="all"?"act":""}`} onClick={()=>setSelRS("all")}>Global</button>
          {razones.filter(r=>r.active).map(r=><button key={r.id} className={`pill-tab ${selRS===r.id?"act":""}`} onClick={()=>setSelRS(r.id)}>{r.short}</button>)}
        </div>
      </div>
      <SmartAlerts trips={trips} outsourced={outsourced} inspections={inspections} vehicles={vehicles} expenses={expenses}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:12}}>
        <div className="card kpi"><div className="kv">{mt.length+outFilt.length}</div><div className="kl">Servicios</div></div>
        <div className="card kpi"><div className="kv">{fmt$(income)}</div><div className="kl">Ingresos</div></div>
        <div className="card kpi"><div className="kv" style={{color:"var(--green)"}}>{fmt$(collected)}</div><div className="kl">Cobrado</div></div>
        <div className="card kpi" style={{borderColor:income-collected>0?"#f59e0b44":"#22c55e44"}}><div className="kv" style={{color:income-collected>0?"var(--amber)":"var(--green)"}}>{fmt$(income-collected)}</div><div className="kl">Por cobrar</div></div>
        <div className="card kpi"><div className="kv" style={{color:"var(--red)"}}>{fmt$(exps)}</div><div className="kl">Gastos</div></div>
        <div className="card kpi" style={{borderColor:profit>=0?"#22c55e44":"#ef444444"}}><div className="kv" style={{color:profit>=0?"var(--green)":"var(--red)"}}>{fmt$(profit)}</div><div className="kl">Utilidad</div></div>
      </div>
      <TrendChart trips={trips} expenses={expenses} outsourced={outsourced} selRS={selRS}/>
      <AgingCartera trips={trips} selRS={selRS}/>
      <div className="g2" style={{gap:16}}>
        <div>
          <div className="stitle">Conductores este mes</div>
          <div className="card mb12">
            {dStats.map(d=>(
              <div key={d.id} style={{marginBottom:14}}>
                <div className="flex aic jb mb4"><span style={{fontWeight:600}}>{d.name}</span><span className="tsm txt2">{d.cnt} viajes</span></div>
                <div className="prog"><div className="progf" style={{width:`${(d.cnt/maxC)*100}%`}}/></div>
              </div>
            ))}
          </div>
          <div className="stitle">Top clientes del mes</div>
          <div className="card">
            {!clientStats.length?<div className="tsm txt2">Sin datos este mes</div>:clientStats.map((c,i)=>(
              <div key={c.c} className="flex aic jb" style={{padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                <div className="flex aic gap8">
                  <span style={{fontFamily:"'Barlow Condensed'",fontWeight:800,fontSize:18,color:"var(--amber)",width:24}}>{i+1}</span>
                  <div><div style={{fontWeight:600,fontSize:14}}>{c.c}</div><div className="tsm txt2">{c.count} servicio(s)</div></div>
                </div>
                <span style={{color:"var(--green)",fontWeight:700}}>{fmt$(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="stitle">Por Razón Social</div>
          {razones.filter(r=>r.active).map(r=>{
            const rT=trips.filter(t=>t.razonSocialId===r.id&&t.date.startsWith(mk));
            const rO=outsourced.filter(o=>o.razonSocialId===r.id&&o.date.startsWith(mk));
            const rI=rT.reduce((s,t)=>s+(t.amount||0),0)+rO.reduce((s,o)=>s+(o.clientAmount||0),0);
            const rE=expenses.filter(e=>e.razonSocialId===r.id&&e.month===mk).reduce((s,e)=>s+e.amount,0)+rT.reduce((s,t)=>s+(t.tripExpenses||[]).reduce((a,x)=>a+x.amount,0),0)+rO.reduce((s,o)=>s+(o.providerAmount||0),0);
            const pct=rI>0?Math.round(((rI-rE)/rI)*100):0;
            return (
              <div key={r.id} className="card mb8">
                <div className="flex aic jb mb8"><span className="rs-pill">{r.short}</span><span className="tsm txt2">{rT.length+rO.length} servicios</span></div>
                <div className="g3 tsm mb8">
                  <div><div style={{color:"var(--green)",fontWeight:700}}>{fmt$(rI)}</div><div className="txt2">Ingresos</div></div>
                  <div><div style={{color:"var(--red)",fontWeight:700}}>{fmt$(rE)}</div><div className="txt2">Gastos</div></div>
                  <div><div style={{color:rI-rE>=0?"var(--green)":"var(--red)",fontWeight:700}}>{fmt$(rI-rE)}</div><div className="txt2">Utilidad</div></div>
                </div>
                <div className="flex aic jb tsm txt2 mb4"><span>Margen neto</span><span style={{fontWeight:700,color:pct>=15?"var(--green)":pct>=5?"var(--amber)":"var(--red)"}}>{pct}%</span></div>
                <div className="prog"><div className="progf" style={{width:`${Math.max(0,Math.min(100,pct))}%`,background:pct>=15?"var(--green)":pct>=5?"var(--amber)":"var(--red)"}}/></div>
              </div>
            );
          })}
          <div className="stitle mt12">Utilización de flota hoy</div>
          <div className="card">{(()=>{
            const td=today();const av=vehicles.filter(v=>v.active);
            const wk=[...new Set(trips.filter(t=>t.date===td).map(t=>t.vehicleId))].length;
            const pct=av.length>0?Math.round((wk/av.length)*100):0;
            return (<div>
              <div className="flex aic jb mb8"><span className="tsm txt2">{wk}/{av.length} unidades trabajando hoy</span><span style={{fontWeight:800,color:pct>=70?"var(--green)":pct>=40?"var(--amber)":"var(--red)"}}>{pct}%</span></div>
              <div className="prog"><div className="progf" style={{width:`${pct}%`,background:pct>=70?"var(--green)":pct>=40?"var(--amber)":"var(--red)"}}/></div>
              <div className="tsm txt2 mt8">Meta recomendada: &gt;70% de utilización</div>
            </div>);
          })()}</div>
        </div>
      </div>
    </div>
  );
}

function TripExpensesManager({ trip, onUpdate }) {
  const [newE, setNewE] = useState({ cat: "Comisión", desc: "", amount: "", paid: false, paymentMethod: "transferencia" });
  const [payingId, setPayingId] = useState(null);
  const [payMethod, setPayMethod] = useState("transferencia");
  const [delEId, setDelEId] = useState(null);
  const expenses = trip.tripExpenses || [];
  const save = patch => onUpdate(trip.id, patch);
  const addE = () => {
    const amt = parseFloat(newE.amount);
    if (!newE.desc || isNaN(amt) || amt <= 0) return;
    save({ tripExpenses: [...expenses, { id: genId(), cat: newE.cat, desc: newE.desc, amount: amt, paid: newE.paid, paymentMethod: newE.paid ? newE.paymentMethod : "", paidDate: newE.paid ? today() : null }] });
    setNewE({ cat: "Comisión", desc: "", amount: "", paid: false, paymentMethod: "transferencia" });
  };
  const markPaid = id => { save({ tripExpenses: expenses.map(e => e.id === id ? { ...e, paid: true, paidDate: today(), paymentMethod: payMethod } : e) }); setPayingId(null); };
  const delE = id => { save({ tripExpenses: expenses.filter(e => e.id !== id) }); setDelEId(null); };
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const pending = expenses.filter(e => e.paid !== true).reduce((s, e) => s + e.amount, 0);
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div className="flex aic jb mb8">
        <div style={{ fontWeight: 700, fontSize: 14 }}>💸 Gastos del viaje</div>
        {total > 0 && <span className="tsm txt2">{fmt$(total)} total{pending > 0 ? ` · ` : " · "}<span style={{ color: pending > 0 ? "var(--amber)" : "var(--green)" }}>{pending > 0 ? `${fmt$(pending)} pendiente` : "✓ todo pagado"}</span></span>}
      </div>
      {expenses.length === 0 && <div className="tsm txt2 mb8">Sin gastos registrados en este viaje.</div>}
      {expenses.map(e => (
        <div key={e.id} className="flex aic jb" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{e.desc}</div>
            <div className="tsm txt2">{e.cat} · <strong>{fmt$(e.amount)}</strong></div>
            {e.paid === true
              ? <div className="tsm" style={{ color: "var(--green)" }}>✓ Pagado{e.paidDate ? ` ${fmtDate(e.paidDate)}` : ""}{e.paymentMethod ? ` · ${e.paymentMethod}` : ""}</div>
              : payingId === e.id
                ? <div className="flex gap4 aic mt4">
                    <select value={payMethod} onChange={ev => setPayMethod(ev.target.value)} style={{ fontSize: 12, padding: "4px 6px" }}>
                      <option value="transferencia">🏦 Transferencia</option>
                      <option value="efectivo">💵 Efectivo</option>
                      <option value="cheque">📝 Cheque</option>
                    </select>
                    <button className="btn btn-gr btn-sm" onClick={() => markPaid(e.id)}>✓ Pagar</button>
                    <button className="btn btn-g btn-sm" onClick={() => setPayingId(null)}>✕</button>
                  </div>
                : <button className="btn btn-a btn-sm mt4" onClick={() => { setPayingId(e.id); setPayMethod("transferencia"); }}>Marcar pagado</button>
            }
          </div>
          <div className="flex gap4 aic ml8">
            <span className={`badge ${e.paid === true ? "bg" : "ba"}`}>{e.paid === true ? "✓ Pagado" : "Pendiente"}</span>
            {delEId === e.id
              ? <div className="flex gap4"><span className="tsm" style={{ color: "var(--red)" }}>¿Eliminar?</span><button className="btn btn-r btn-sm" onClick={() => delE(e.id)}>Sí</button><button className="btn btn-g btn-sm" onClick={() => setDelEId(null)}>No</button></div>
              : <button className="btn btn-g btn-sm" onClick={() => setDelEId(e.id)}>🗑</button>
            }
          </div>
        </div>
      ))}
      <div className="mt12" style={{ background: "var(--bg3)", borderRadius: 6, padding: 12 }}>
        <div className="tsm txt2 mb8" style={{ fontWeight: 700 }}>+ Agregar gasto al viaje</div>
        <div className="g2 mb6">
          <Field label="Categoría"><select value={newE.cat} onChange={e => setNewE(p => ({ ...p, cat: e.target.value }))}>{TRIP_EXP_CATS.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Descripción *"><input placeholder="Ej: Comisión del flete" value={newE.desc} onChange={e => setNewE(p => ({ ...p, desc: e.target.value }))} onKeyDown={e => e.key === "Enter" && addE()} /></Field>
        </div>
        <div className="g2 mb8">
          <Field label="Monto ($) *"><input type="number" placeholder="0.00" value={newE.amount} onChange={e => setNewE(p => ({ ...p, amount: e.target.value }))} /></Field>
          <Field label="Forma de pago"><select value={newE.paymentMethod} onChange={e => setNewE(p => ({ ...p, paymentMethod: e.target.value }))}><option value="transferencia">🏦 Transferencia</option><option value="efectivo">💵 Efectivo</option><option value="cheque">📝 Cheque</option></select></Field>
        </div>
        <div className="flex aic gap8 mb10">
          <ChkBox checked={newE.paid} onChange={() => setNewE(p => ({ ...p, paid: !p.paid }))} />
          <span className="tsm">Ya fue pagado al registrar</span>
        </div>
        <button className="btn btn-a btn-sm" onClick={addE}><Ico path={IC.plus} size={14} /> Agregar gasto</button>
      </div>
    </div>
  );
}

// ─── IVA HELPERS ─────────────────────────────────────────────────────────────
function ivaTotal(base, sinFactura, retention) {
  if (!base || sinFactura) return base || 0;
  return base * (retention ? 1.12 : 1.16);
}

function IVACalc({ base, sinFactura, retention, label = "Total a cobrar" }) {
  if (!base || base <= 0) return null;
  if (sinFactura) return (
    <div className="tsm" style={{ color: "var(--txt2)", padding: "4px 0" }}>💵 Sin factura — sin IVA ni retención</div>
  );
  const iva = base * 0.16;
  const ret = retention ? base * 0.04 : 0;
  const total = base + iva - ret;
  return (
    <div style={{ background: "var(--bg3)", borderRadius: 6, padding: "10px 12px", fontSize: 13, marginTop: 6 }}>
      <div className="flex jb mb4"><span className="txt2">Subtotal (sin IVA):</span><span>{fmt$(base)}</span></div>
      <div className="flex jb mb4"><span className="txt2">+ IVA 16%:</span><span>{fmt$(iva)}</span></div>
      {retention && <div className="flex jb mb4"><span style={{ color: "var(--amber)" }}>− Retención IVA 4%:</span><span style={{ color: "var(--amber)" }}>({fmt$(ret)})</span></div>}
      <div className="flex jb" style={{ fontWeight: 800, borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 2 }}>
        <span>{label}:</span>
        <span style={{ color: "var(--green)", fontSize: 15 }}>{fmt$(total)}</span>
      </div>
    </div>
  );
}

function IVAToggles({ sinFactura, retention, onToggleSF, onToggleRet }) {
  return (
    <div className="fcol gap4 mt8">
      <div className="flex aic gap8 tsm">
        <ChkBox checked={!!sinFactura} onChange={onToggleSF} />
        <span>Sin factura / Efectivo (sin IVA)</span>
      </div>
      {!sinFactura && (
        <div className="flex aic gap8 tsm">
          <ChkBox checked={!!retention} onChange={onToggleRet} />
          <span>Retención de IVA 4% (cliente retiene)</span>
        </div>
      )}
    </div>
  );
}

function BillingPanel({ trip, onUpdate }) {
  const [invNum, setInvNum] = useState(trip.invoiceNumber || "");
  const [pendingMethod, setPendingMethod] = useState(false); // show PPD/PUE after PDF upload
  const save = patch => onUpdate(trip.id, patch);
  const bs = trip.billingStatus || "sin_facturar";
  const mp = trip.metodoPago || "";
  const selectMethod = method => {
    save({ billingStatus: "facturado", metodoPago: method, ...(invNum ? { invoiceNumber: invNum } : {}) });
    setPendingMethod(false);
  };
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: 14, marginTop: 8 }}>
      <div className="stitle" style={{ fontSize: 15, marginBottom: 10 }}>💰 Cobranza y facturación SAT</div>

      {/* IVA breakdown */}
      {trip.amount > 0 && (
        <div className="mb12">
          <IVAToggles sinFactura={trip.sinFactura} retention={trip.ivaRetention}
            onToggleSF={() => save({ sinFactura: !trip.sinFactura, ivaRetention: false })}
            onToggleRet={() => save({ ivaRetention: !trip.ivaRetention })} />
          <IVACalc base={trip.amount} sinFactura={trip.sinFactura} retention={trip.ivaRetention} label="Total a cobrar" />
        </div>
      )}

      {/* Forma de pago operativa */}
      <Field label="Forma de pago" style={{ marginBottom: 12 }}>
        <select value={trip.paymentMethod || ""} onChange={e => save({ paymentMethod: e.target.value })}>
          <option value="">Sin definir</option>
          <option value="efectivo">💵 Efectivo</option>
          <option value="transferencia">🏦 Transferencia</option>
          <option value="cheque">📝 Cheque</option>
        </select>
      </Field>

      {/* Estado actual */}
      <div className="flex aic gap8 mb12">
        <BillingBadge v={bs} mp={mp} />
        {mp && <span className="tsm txt2">Método SAT: <strong>{mp}</strong></span>}
      </div>

      {/* ── SIN FACTURAR: subir factura PDF dispara PPD/PUE ── */}
      {(bs === "sin_facturar" || bs === "sin_factura") && (
        <div className="fcol gap8">
          <Field label="No. Factura / Folio CFDI (opcional)">
            <input value={invNum} onChange={e => setInvNum(e.target.value)} placeholder="F-2025-001" />
          </Field>

          {/* Subir factura = paso 1 */}
          {!pendingMethod && (
            <div className="card" style={{ background: "var(--bg)" }}>
              <div className="tsm txt2 mb8" style={{ fontWeight: 700 }}>📎 Subir factura CFDI (PDF)</div>
              <PhotoBtn label="Subir factura PDF" photoKey={[trip.id, "invoice"]} compact
                onLoad={() => setPendingMethod(true)} />
              <div className="tsm txt2 mt6">Al subir el PDF se pedirá seleccionar PPD o PUE.</div>
            </div>
          )}

          {/* Seleccionar PPD/PUE = paso 2, aparece tras subir */}
          {pendingMethod && (
            <div className="card" style={{ background: "#22c55e0a", border: "1px solid var(--green)" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ Factura subida — ¿Método de pago SAT?</div>
              <div className="tsm txt2 mb12">Selecciona cómo va a pagar el cliente según el CFDI emitido:</div>
              <div className="flex gap8 wrap">
                <button className="btn btn-a" style={{ flex: 1, justifyContent: "center" }} onClick={() => selectMethod("PPD")}>
                  📋 PPD — Pago diferido<br/><span style={{ fontWeight: 400, fontSize: 11 }}>El cliente pagará después</span>
                </button>
                <button className="btn btn-b" style={{ flex: 1, justifyContent: "center" }} onClick={() => selectMethod("PUE")}>
                  💳 PUE — Una exhibición<br/><span style={{ fontWeight: 400, fontSize: 11 }}>Pago inmediato o ya pagó</span>
                </button>
              </div>
              <button className="btn btn-g btn-sm mt8" onClick={() => setPendingMethod(false)}>↩ Cancelar</button>
            </div>
          )}

          <button className="btn btn-g btn-sm" onClick={() => save({ billingStatus: "sin_factura" })}>💵 Sin factura / Efectivo</button>
        </div>
      )}

      {/* ── FACTURADO PPD: pendiente de complemento ── */}
      {bs === "facturado" && mp === "PPD" && (
        <div className="fcol gap8">
          <div className="card" style={{ background: "#f59e0b0a", border: "1px solid var(--amber)" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 Pendiente: Complemento de pago</div>
            <div className="tsm txt2 mb8">Sube el complemento SAT cuando el cliente realice el pago.</div>
            <div className="tsm txt2 mb4">Complemento de pago SAT</div>
            <PhotoBtn label="Subir complemento" photoKey={[trip.id, "complemento"]} compact
              onLoad={() => save({ billingStatus: "pagado", paidDate: today(), complementoSubido: true })} />
          </div>
          <div className="flex gap4 wrap">
            <button className="btn btn-gr btn-sm" onClick={() => save({ billingStatus: "pagado", paidDate: today(), complementoSubido: true })}>
              ✓ Marcar pagado c/Complemento
            </button>
            <button className="btn btn-g btn-sm" onClick={() => save({ billingStatus: "sin_facturar", metodoPago: "" })}>↩ Revertir</button>
          </div>
        </div>
      )}

      {/* ── FACTURADO PUE: pendiente de comprobante ── */}
      {bs === "facturado" && mp === "PUE" && (
        <div className="fcol gap8">
          <div className="card" style={{ background: "#3b82f60a", border: "1px solid var(--blue)" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>💳 Pendiente: Comprobante de pago</div>
            <div className="tsm txt2 mb4">Comprobante de pago del cliente</div>
            <PhotoBtn label="Subir comprobante" photoKey={[trip.id, "payment"]} compact
              onLoad={() => save({ billingStatus: "pagado", paidDate: today() })} />
          </div>
          <div className="flex gap4 wrap">
            <button className="btn btn-gr btn-sm" onClick={() => save({ billingStatus: "pagado", paidDate: today() })}>✓ Marcar pagado</button>
            <button className="btn btn-g btn-sm" onClick={() => save({ billingStatus: "sin_facturar", metodoPago: "" })}>↩ Revertir</button>
          </div>
        </div>
      )}

      {/* ── PAGADO ── */}
      {bs === "pagado" && (
        <div className="fcol gap8">
          <div className="card" style={{ background: "#22c55e0a", border: "1px solid var(--green)" }}>
            <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: 4 }}>
              ✓ {mp === "PPD" ? "Pagado con complemento emitido" : "Pagado"}
            </div>
            {trip.paidDate && <div className="tsm txt2">Fecha: {fmtDate(trip.paidDate)}</div>}
          </div>
          <button className="btn btn-g btn-sm" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}
            onClick={() => save({ billingStatus: "facturado", paidDate: null })}>↩ Revertir pago</button>
        </div>
      )}

      {/* Folio CFDI editable */}
      {bs !== "sin_facturar" && bs !== "sin_factura" && (
        <div className="mt12">
          <Field label="No. Factura / Folio CFDI">
            <div className="flex gap4">
              <input value={invNum} onChange={e => setInvNum(e.target.value)} placeholder="F-2025-001" style={{ flex: 1 }} />
              <button className="btn btn-g btn-sm" onClick={() => save({ invoiceNumber: invNum })}>✓</button>
            </div>
          </Field>
        </div>
      )}

      {/* Documentos siempre disponibles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div><div className="tsm txt2 mb4">Carta Porte</div><PhotoBtn label="Ver/subir" photoKey={[trip.id, "cartaporte"]} compact /></div>
        <div><div className="tsm txt2 mb4">Comprobante entrega</div><PhotoBtn label="Ver/subir" photoKey={[trip.id, "delivery"]} compact /></div>
        <div><div className="tsm txt2 mb4">Factura CFDI</div><PhotoBtn label="Ver/subir" photoKey={[trip.id, "invoice"]} compact /></div>
        {mp === "PPD" && <div><div className="tsm txt2 mb4">Complemento SAT</div><PhotoBtn label="Ver/subir" photoKey={[trip.id, "complemento"]} compact /></div>}
        {mp === "PUE" && <div><div className="tsm txt2 mb4">Comprobante pago</div><PhotoBtn label="Ver/subir" photoKey={[trip.id, "payment"]} compact /></div>}
      </div>

      {(trip.tripExpenses || []).length > 0 && (
        <div className="mt8 pt8" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="tsm txt2 mb4">Gastos del viaje:</div>
          {trip.tripExpenses.map(e => <div key={e.id} className="flex aic jb tsm" style={{ padding: "2px 0" }}><span>{e.desc}</span><span style={{ color: "var(--red)" }}>{fmt$(e.amount)}</span></div>)}
        </div>
      )}
    </div>
  );
}

function AdminViajes({ trips, vehicles, drivers, razones, clients, onUpdate, onDelete, onAdd }) {
  const [filt, setFilt] = useState({ month: nowMon(), driverId: "", vehicleId: "", rsId: "", status: "" });
  const [editAmt, setEditAmt] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [delTripId, setDelTripId] = useState(null);
  const setF = k => e => setFilt(p => ({ ...p, [k]: e.target.value }));
  const filtered = trips.filter(t => {
    if (filt.month && !t.date.startsWith(filt.month)) return false;
    if (filt.driverId && t.driverId !== filt.driverId) return false;
    if (filt.vehicleId && t.vehicleId !== filt.vehicleId) return false;
    if (filt.rsId && t.razonSocialId !== filt.rsId) return false;
    if (filt.status && (t.billingStatus || "sin_facturar") !== filt.status) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const gd = id => drivers.find(d => d.id === id); const gv = id => vehicles.find(v => v.id === id);
  const totalInc = filtered.reduce((s, t) => s + (t.amount || 0), 0);
  const [savedId, setSavedId] = useState(null);
  const saveAmt = id => { const v = parseFloat(editAmt[id] || 0); if (!isNaN(v)) { onUpdate(id, { amount: v }); setSavedId(id); setTimeout(() => setSavedId(null), 2000); } setEditAmt(p => { const n = { ...p }; delete n[id]; return n; }); };
  return (
    <div className="ap">
      <div className="flex aic jb mb12"><div className="stitle" style={{ margin: 0 }}>Registro de Viajes</div><button className="btn btn-a btn-sm" onClick={() => setShowForm(!showForm)}><Ico path={IC.plus} size={14} /> Nuevo</button></div>
      {showForm && (
        <div className="card mb16">
          <div className="flex aic jb mb12"><span style={{ fontWeight: 700 }}>Registrar Viaje</span><button className="btn btn-g btn-sm" onClick={() => setShowForm(false)}>✕</button></div>
          <TripForm drivers={drivers} vehicles={vehicles.filter(v => v.active)} razones={razones} clients={clients} currentDriver={null} isChofer={false}
            onSave={t => { onAdd(t); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}
      <div className="card mb12">
        <div className="flex gap8 wrap">
          <div style={{ flex: 1, minWidth: 120 }}><Field label="Mes"><input type="month" value={filt.month} onChange={setF("month")} /></Field></div>
          <div style={{ flex: 1, minWidth: 120 }}><Field label="Conductor"><select value={filt.driverId} onChange={setF("driverId")}><option value="">Todos</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></div>
          <div style={{ flex: 1, minWidth: 120 }}><Field label="Unidad"><select value={filt.vehicleId} onChange={setF("vehicleId")}><option value="">Todas</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plates}</option>)}</select></Field></div>
          <div style={{ flex: 1, minWidth: 120 }}><Field label="R. Social"><select value={filt.rsId} onChange={setF("rsId")}><option value="">Todas</option>{razones.map(r => <option key={r.id} value={r.id}>{r.short}</option>)}</select></Field></div>
          <div style={{ flex: 1, minWidth: 120 }}><Field label="Estado"><select value={filt.status} onChange={setF("status")}><option value="">Todos</option>{BILLING.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}</select></Field></div>
        </div>
        <div className="flex gap12 mt8 wrap tsm">
          <span className="txt2">{filtered.length} viajes</span>
          <span>Ingresos: <strong style={{ color: "var(--green)" }}>{fmt$(totalInc)}</strong></span>
          <span className="txt2">Sin facturar: {filtered.filter(t => (t.billingStatus || "sin_facturar") === "sin_facturar").length}</span>
        </div>
      </div>
      {!filtered.length ? <Empty title="Sin viajes" sub="Ajusta los filtros" /> : (
        <div className="fcol gap8">
          {filtered.map(t => {
            const d = gd(t.driverId); const v = gv(t.vehicleId);
            const editing = editAmt[t.id] !== undefined; const isExp = expandedId === t.id;
            const te = (t.tripExpenses || []).reduce((s, e) => s + e.amount, 0);
            const legs = t.legs || [];
            const allDriverNames = [d?.name || "—", ...legs.map(l => l.driverName || gd(l.driverId)?.name || "—")].filter((n, i, a) => a.indexOf(n) === i);
            return (
              <div key={t.id} className="card">
                <div className="flex aic jb mb8 wrap gap4">
                  <div className="flex gap4 aic wrap">
                    <span className="tsm txt2">{fmtDate(t.date)}</span>
                    <CargoBadge v={t.cargo} /><BillingBadge v={t.billingStatus || "sin_facturar"} mp={t.metodoPago} />
                    <RSBadge id={t.razonSocialId} razones={razones} />
                    {t.tripStatus === "en_curso" && <span className="badge br">🔄 En curso</span>}
                    {legs.length > 0 && <span className="badge ba">🔄 {legs.length + 1} tramos</span>}
                    {t.paymentMethod && <span className="badge bgr">{t.paymentMethod === "efectivo" ? "💵" : "🏦"} {t.paymentMethod}</span>}
                  </div>
                  {delTripId === t.id ? (
                    <div className="flex gap4 aic">
                      <span className="tsm" style={{ color: "var(--red)" }}>¿Eliminar?</span>
                      <button className="btn btn-r btn-sm" onClick={() => { onDelete(t.id); setDelTripId(null); }}>Sí</button>
                      <button className="btn btn-g btn-sm" onClick={() => setDelTripId(null)}>No</button>
                    </div>
                  ) : (
                    <button className="btn btn-g btn-sm" onClick={() => setDelTripId(t.id)}><Ico path={IC.trash} size={14} /></button>
                  )}
                </div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.origin} → {t.destination}</div>
                <div className="flex gap8 wrap tsm txt2 mb6">
                  {t.client && <span>🤝 {t.client}</span>}
                  {t.docNum && <span>📄 {t.docNum}</span>}{t.invoiceNumber && <span>🧾 {t.invoiceNumber}</span>}
                </div>
                {/* Show drivers and vehicles per leg */}
                <div className="fcol gap3 mb8">
                  <div className="flex aic gap6 tsm">
                    <span>🧑‍✈️</span>
                    <span style={{ fontWeight: 600 }}>{d?.name || "—"}</span>
                    {v && <span className="txt2">· 🚛 {v.plates}</span>}
                    <span className="txt2">· {fmtDate(t.date)}{t.departTime ? ` ${t.departTime}` : ""}{t.arriveTime ? ` → ${t.arriveTime}` : ""}</span>
                    <span className="badge bg" style={{ fontSize: 10 }}>Inicio</span>
                  </div>
                  {legs.map((leg, li) => {
                    const lv = gv(leg.vehicleId);
                    const ld2 = gd(leg.driverId);
                    return (
                      <div key={leg.id} className="flex aic gap6 tsm">
                        <span>🔄</span>
                        <span style={{ fontWeight: 600 }}>{leg.driverName || ld2?.name || "—"}</span>
                        {lv && <span className="txt2">· 🚛 {lv.plates}</span>}
                        <span className="txt2">· {fmtDate(leg.date)}{leg.startTime ? ` ${leg.startTime}` : ""}</span>
                        {leg.notes && <span className="txt2">· {leg.notes}</span>}
                        <span className={`badge ${li === legs.length - 1 && t.tripStatus === "completado" ? "bg" : "ba"}`} style={{ fontSize: 10 }}>
                          {li === legs.length - 1 && t.tripStatus === "completado" ? "Fin" : `Tramo ${li + 2}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex aic gap8 wrap">
                  {editing ? (
                    <div className="fcol gap4" style={{ flex: 1 }}>
                      <div className="flex gap4 aic">
                        <input className="inp-in" type="number" placeholder="Subtotal sin IVA" value={editAmt[t.id]} onChange={e => setEditAmt(p => ({ ...p, [t.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && saveAmt(t.id)} autoFocus style={{ flex: 1 }} />
                        <button className={`btn btn-sm ${savedId === t.id ? "btn-gr" : "btn-gr"}`}
                        onClick={() => saveAmt(t.id)}
                        style={{ minWidth: savedId === t.id ? 80 : 32, justifyContent: "center", background: savedId === t.id ? "var(--green)" : "" }}>
                        {savedId === t.id ? "✓ Guardado" : "✓"}
                      </button>
                        <button className="btn btn-g btn-sm" onClick={() => setEditAmt(p => { const n={...p}; delete n[t.id]; return n; })}>✕</button>
                      </div>
                      <IVAToggles sinFactura={t.sinFactura} retention={t.ivaRetention}
                        onToggleSF={() => onUpdate(t.id, { sinFactura: !t.sinFactura, ivaRetention: false })}
                        onToggleRet={() => onUpdate(t.id, { ivaRetention: !t.ivaRetention })} />
                      <IVACalc base={parseFloat(editAmt[t.id]||0)} sinFactura={t.sinFactura} retention={t.ivaRetention} />
                    </div>
                  ) : (
                    <div className="fcol gap2" style={{ flex: 1 }}>
                      <span style={{ cursor: "pointer", color: t.amount ? "var(--green)" : "var(--txt2)", fontWeight: t.amount ? 700 : 400 }}
                        onClick={() => setEditAmt(p => ({ ...p, [t.id]: String(t.amount || "") }))}>
                        {t.amount ? (
                          <span>{fmt$(t.amount)} <span className="tsm txt2">subtotal
                            {!t.sinFactura && <> · Total: <strong style={{ color: "var(--green)" }}>{fmt$(ivaTotal(t.amount, t.sinFactura, t.ivaRetention))}</strong>{t.ivaRetention ? " (c/ret.)" : " +IVA"}</>}
                          </span></span>
                        ) : <span className="tsm">+ Subtotal del servicio</span>}
                      </span>
                    </div>
                  )}
                  {te > 0 && <span className="tsm" style={{ color: "var(--red)" }}>- {fmt$(te)} gastos</span>}
                  <button className="btn btn-g btn-sm" style={{ marginLeft: "auto" }} onClick={() => setExpandedId(isExp ? null : t.id)}>{isExp ? "▲ Cerrar" : "💰 Cobranza"}</button>
                </div>
                {isExp && (
                  <div>
                    <BillingPanel trip={t} onUpdate={onUpdate} />
                    <TripExpensesManager trip={t} onUpdate={onUpdate} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminClientes({ trips, razones }) {
  const [selRS, setSelRS] = useState("all"); const [search, setSearch] = useState("");
  const [dlMonth, setDlMonth] = useState(nowMon()); const [downloading, setDownloading] = useState(null);
  const ft = trips.filter(t => selRS === "all" || t.razonSocialId === selRS);
  const clients = [...new Set(ft.map(t => t.client).filter(Boolean))].sort().filter(c => c.toLowerCase().includes(search.toLowerCase()));
  const handleDownload = async (client) => {
    setDownloading(client);
    const clientTrips = ft.filter(t => t.client === client && t.date.startsWith(dlMonth));
    if (!clientTrips.length) { alert("No hay viajes en ese mes para este cliente."); setDownloading(null); return; }
    await downloadClientZip(client, dlMonth, clientTrips);
    setDownloading(null);
  };
  return (
    <div className="ap">
      <div className="flex aic jb mb12 wrap gap8">
        <div className="stitle" style={{ margin: 0 }}>Clientes & Cobranza</div>
        <div className="pill-tabs" style={{ margin: 0 }}>
          <button className={`pill-tab ${selRS === "all" ? "act" : ""}`} onClick={() => setSelRS("all")}>Todas</button>
          {razones.filter(r => r.active).map(r => <button key={r.id} className={`pill-tab ${selRS === r.id ? "act" : ""}`} onClick={() => setSelRS(r.id)}>{r.short}</button>)}
        </div>
      </div>
      <div className="card mb12">
        <div className="g2 gap8">
          <Field label="Buscar cliente"><input placeholder="Nombre del cliente..." value={search} onChange={e => setSearch(e.target.value)} /></Field>
          <Field label="Mes para descargar carpeta">
            <div className="flex gap4"><input type="month" value={dlMonth} onChange={e => setDlMonth(e.target.value)} style={{ flex: 1 }} /></div>
          </Field>
        </div>
      </div>
      {!clients.length ? <Empty title="Sin clientes" sub="No hay servicios registrados" /> : (
        <div className="fcol gap12">
          {clients.map(client => {
            const ct = ft.filter(t => t.client === client);
            const total = ct.reduce((s, t) => s + (t.amount || 0), 0);
            const paid = ct.filter(t => (t.billingStatus || "sin_facturar") === "pagado").reduce((s, t) => s + t.amount, 0);
            const ov30 = ct.filter(t => (t.billingStatus || "sin_facturar") !== "pagado" && t.amount > 0 && daysSince(t.date) > 30);
            return (
              <div key={client} className="sec-card">
                <div className="sec-hdr">
                  <div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 800 }}>{client}</div><div className="tsm txt2">{ct.length} servicios</div></div>
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div><div style={{ fontWeight: 800, color: "var(--green)", fontSize: 18 }}>{fmt$(total)}</div>{total - paid > 0 && <div className="tsm" style={{ color: "var(--amber)" }}>Por cobrar: {fmt$(total - paid)}</div>}</div>
                    <button className="btn btn-b btn-sm" onClick={() => handleDownload(client)} disabled={downloading === client}>
                      {downloading === client ? "⏳ Generando..." : "📁 Descargar carpeta"}
                    </button>
                  </div>
                </div>
                <div className="sec-body">
                  {ov30.length > 0 && <div className="alert-box mb12"><span style={{ fontWeight: 700, color: "var(--red)" }}>⚠ {ov30.length} servicio(s) con más de 30 días sin pagar</span></div>}
                  <div className="flex gap8 mb12 wrap">
                    <span className="badge bgr">Sin facturar: {ct.filter(t => (t.billingStatus || "sin_facturar") === "sin_facturar").length}</span>
                    <span className="badge ba">Facturado: {ct.filter(t => (t.billingStatus || "sin_facturar") === "facturado").length}</span>
                    <span className="badge bg">Pagado: {ct.filter(t => (t.billingStatus || "sin_facturar") === "pagado").length}</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead><tr><th>Fecha</th><th>Ruta</th><th>Monto</th><th>Estado</th><th>Folio</th><th>Días</th></tr></thead>
                      <tbody>
                        {ct.sort((a, b) => b.date.localeCompare(a.date)).map(t => {
                          const dias = daysSince(t.date);
                          const venc = (t.billingStatus || "sin_facturar") !== "pagado" && t.amount > 0 && dias > 30;
                          return (
                            <tr key={t.id} style={{ background: venc ? "#ef444408" : "transparent" }}>
                              <td style={{ whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                              <td className="tsm">{t.origin} → {t.destination}</td>
                              <td><strong style={{ color: "var(--green)" }}>{t.amount ? fmt$(t.amount) : "—"}</strong></td>
                              <td><BillingBadge v={t.billingStatus || "sin_facturar"} mp={t.metodoPago} /></td>
                              <td className="tsm txt2">{t.invoiceNumber || "—"}</td>
                              <td className="tsm" style={{ color: venc ? "var(--red)" : "var(--txt2)" }}>{dias !== null ? `${dias}d` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminTercerizados({ outsourced, razones, clients, onAdd, onUpdate, onDelete }) {
  const [filt, setFilt] = useState({ rsId: "", provPaid: "", clientBs: "", month: nowMon() });
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [delOutId, setDelOutId] = useState(null);
  const setF = k => e => setFilt(p => ({ ...p, [k]: e.target.value }));
  const filtered = outsourced.filter(o => {
    if (filt.rsId && o.razonSocialId !== filt.rsId) return false;
    if (filt.provPaid === "paid" && !o.paid) return false;
    if (filt.provPaid === "unpaid" && o.paid) return false;
    if (filt.clientBs && (o.clientBillingStatus || "sin_facturar") !== filt.clientBs) return false;
    if (filt.month && !o.date.startsWith(filt.month)) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const unpaidProv = filtered.filter(o => !o.paid);
  const overdue = unpaidProv.filter(o => o.dueDate && daysSince(o.dueDate) > 0);
  const soon = unpaidProv.filter(o => o.dueDate && daysSince(o.dueDate) <= 0 && daysSince(o.dueDate) > -7);
  const totalClientIncome = filtered.reduce((s, o) => s + (o.clientAmount || 0), 0);
  const totalProvCost = filtered.reduce((s, o) => s + (o.providerAmount || 0), 0);
  const margin = totalClientIncome - totalProvCost;
  return (
    <div className="ap">
      <div className="flex aic jb mb12"><div className="stitle" style={{ margin: 0 }}>Viajes Tercerizados</div><button className="btn btn-a btn-sm" onClick={() => setShowForm(!showForm)}><Ico path={IC.plus} size={14} /> Nuevo</button></div>
      {showForm && (
        <div className="card mb12">
          <div className="flex aic jb mb12"><span style={{ fontWeight: 700 }}>Registrar Tercerizado</span><button className="btn btn-g btn-sm" onClick={() => setShowForm(false)}>✕</button></div>
          <OutsourcedForm razones={razones} clients={clients} onSave={o => { onAdd(o); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}
      {(overdue.length > 0 || soon.length > 0) && (
        <div className="g2 mb12">
          {overdue.length > 0 && <div className="alert-box"><div style={{ fontWeight: 700, color: "var(--red)" }}>🔴 {overdue.length} pago(s) al proveedor vencidos</div><div style={{ fontSize: 20, fontWeight: 800, color: "var(--red)" }}>{fmt$(overdue.reduce((s, o) => s + o.providerAmount, 0))}</div></div>}
          {soon.length > 0 && <div className="warn-box"><div style={{ fontWeight: 700, color: "var(--amber)" }}>⚠ {soon.length} pago(s) por vencer esta semana</div></div>}
        </div>
      )}
      <div className="card mb12">
        <div className="flex gap8 wrap">
          <div style={{ flex: 1, minWidth: 120 }}><Field label="Mes"><input type="month" value={filt.month} onChange={setF("month")} /></Field></div>
          <div style={{ flex: 1, minWidth: 120 }}><Field label="R. Social"><select value={filt.rsId} onChange={setF("rsId")}><option value="">Todas</option>{razones.map(r => <option key={r.id} value={r.id}>{r.short}</option>)}</select></Field></div>
          <div style={{ flex: 1, minWidth: 120 }}><Field label="Pago proveedor"><select value={filt.provPaid} onChange={setF("provPaid")}><option value="">Todos</option><option value="paid">Pagados</option><option value="unpaid">Sin pagar</option></select></Field></div>
          <div style={{ flex: 1, minWidth: 120 }}><Field label="Cobro cliente"><select value={filt.clientBs} onChange={setF("clientBs")}><option value="">Todos</option>{BILLING.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}</select></Field></div>
        </div>
        <div className="flex gap12 mt8 tsm wrap">
          <span className="txt2">{filtered.length} tercerizados</span>
          <span>Ingreso cliente: <strong style={{ color: "var(--green)" }}>{fmt$(totalClientIncome)}</strong></span>
          <span>Costo proveedor: <strong style={{ color: "var(--red)" }}>{fmt$(totalProvCost)}</strong></span>
          <span>Margen: <strong style={{ color: margin >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(margin)}</strong></span>
        </div>
      </div>
      {filtered.length === 0 ? <Empty title="Sin tercerizados" sub="Registra viajes realizados con proveedores" /> : (
        <div className="fcol gap8">
          {filtered.map(o => {
            const dias = o.dueDate ? daysSince(o.dueDate) : null;
            const isOver = !o.paid && dias !== null && dias > 0;
            const isSoon = !o.paid && dias !== null && dias <= 0 && dias > -7;
            const rs = razones.find(r => r.id === o.razonSocialId);
            const isExp = expandedId === o.id;
            const clientBS = o.clientBillingStatus || "sin_facturar";
            return (
              <div key={o.id} className="card" style={{ borderLeft: `3px solid ${isOver ? "var(--red)" : isSoon ? "var(--amber)" : "var(--border)"}` }}>
                <div className="flex aic jb mb8 wrap gap4">
                  <div className="flex gap4 aic wrap">
                    <span className="tsm txt2">{fmtDate(o.date)}</span>
                    {rs && <span className="rs-pill">{rs.short}</span>}
                    {o.cargo && <CargoBadge v={o.cargo} />}
                  </div>
                  <div className="flex gap4">
                    <button className="btn btn-g btn-sm" onClick={() => setExpandedId(isExp ? null : o.id)}>{isExp ? "▲" : "💰 Detalle"}</button>
                  {delOutId === o.id ? (
                    <div className="flex gap4 aic">
                      <span className="tsm" style={{ color: "var(--red)" }}>¿Eliminar?</span>
                      <button className="btn btn-r btn-sm" onClick={() => { onDelete(o.id); setDelOutId(null); }}>Sí</button>
                      <button className="btn btn-g btn-sm" onClick={() => setDelOutId(null)}>No</button>
                    </div>
                  ) : (
                    <button className="btn btn-g btn-sm" onClick={() => setDelOutId(o.id)}><Ico path={IC.trash} size={14} /></button>
                  )}
                  </div>
                </div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{o.origin} → {o.destination}</div>
                <div className="tercerizado-split">
                  <div style={{ background: "#22c55e0a", border: "1px solid #22c55e33", borderRadius: 6, padding: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", marginBottom: 4, textTransform: "uppercase" }}>💚 Cobro al cliente</div>
                    <div style={{ fontWeight: 700, color: "var(--green)" }}>{fmt$(o.clientAmount || 0)} <span className="tsm" style={{ fontWeight: 400 }}>subtotal</span></div>
                    {o.clientAmount > 0 && !o.clientSinFactura && <div className="tsm" style={{ color: "var(--green)" }}>Total: {fmt$(ivaTotal(o.clientAmount, o.clientSinFactura, o.clientIvaRetention))}{o.clientIvaRetention ? " (c/ret.)" : " +IVA"}</div>}
                    {o.clientSinFactura && <div className="tsm txt2">💵 Sin factura</div>}
                    <div className="tsm txt2">{o.client || "—"}</div>
                    <BillingBadge v={clientBS} mp={o.clientMetodoPago} />
                    {o.clientInvoiceNum && <div className="tsm txt2">🧾 {o.clientInvoiceNum}</div>}
                  </div>
                  <div style={{ background: "#ef44440a", border: "1px solid #ef444433", borderRadius: 6, padding: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", marginBottom: 4, textTransform: "uppercase" }}>🔴 Costo del proveedor</div>
                    <div style={{ fontWeight: 700, color: "var(--red)" }}>{fmt$(o.providerAmount || 0)} <span className="tsm" style={{ fontWeight: 400 }}>subtotal</span></div>
                    {o.providerAmount > 0 && !o.providerSinFactura && <div className="tsm" style={{ color: "var(--red)" }}>Total: {fmt$(ivaTotal(o.providerAmount, o.providerSinFactura, o.providerIvaRetention))}{o.providerIvaRetention ? " (c/ret.)" : " +IVA"}</div>}
                    {o.providerSinFactura && <div className="tsm txt2">💵 Sin factura</div>}
                    <div className="tsm txt2">{o.provider || "—"}</div>
                    <span className={`badge ${o.paid ? "bg" : isOver ? "br" : "ba"}`}>{o.paid ? "Pagado" : isOver ? `Vencido ${dias}d` : isSoon ? "Vence pronto" : "Pendiente"}</span>
                    {o.providerInvoiceNum && <div className="tsm txt2">🧾 {o.providerInvoiceNum}</div>}
                    {o.dueDate && <div className="tsm txt2">Vence: {fmtDate(o.dueDate)}</div>}
                  </div>
                </div>
                {isExp && (
                  <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: 14, marginTop: 8 }}>
                    <div className="g2 mb12">
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: 8 }}>💚 Lado cliente</div>
                        <div className="fcol gap8">
                          <IVAToggles sinFactura={o.clientSinFactura} retention={o.clientIvaRetention}
                            onToggleSF={() => onUpdate(o.id, { clientSinFactura: !o.clientSinFactura, clientIvaRetention: false })}
                            onToggleRet={() => onUpdate(o.id, { clientIvaRetention: !o.clientIvaRetention })} />
                          <IVACalc base={o.clientAmount} sinFactura={o.clientSinFactura} retention={o.clientIvaRetention} label="Total a cobrar al cliente" />
                          <Field label="Estado de cobro al cliente">
                            <select value={clientBS} onChange={e => onUpdate(o.id, { clientBillingStatus: e.target.value })}>
                              {BILLING.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}
                            </select>
                          </Field>
                          {clientBS === "pagado" && <button className="btn btn-g btn-sm" style={{ color: "var(--amber)", borderColor: "var(--amber)" }} onClick={() => onUpdate(o.id, { clientBillingStatus: "facturado" })}>↩ Revertir cobro</button>}
                          <div><div className="tsm txt2 mb4">Nuestra factura al cliente</div><PhotoBtn label="Subir factura" photoKey={[o.id, "clientInvoice"]} compact /></div>
                          <div><div className="tsm txt2 mb4">Comprobante de pago del cliente</div><PhotoBtn label="Subir comprobante" photoKey={[o.id, "clientPayment"]} compact onLoad={() => { if (clientBS !== "pagado") onUpdate(o.id, { clientBillingStatus: "pagado" }); }} /></div>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--red)", marginBottom: 8 }}>🔴 Lado proveedor</div>
                        <div className="fcol gap8">
                          <IVAToggles sinFactura={o.providerSinFactura} retention={o.providerIvaRetention}
                            onToggleSF={() => onUpdate(o.id, { providerSinFactura: !o.providerSinFactura, providerIvaRetention: false })}
                            onToggleRet={() => onUpdate(o.id, { providerIvaRetention: !o.providerIvaRetention })} />
                          <IVACalc base={o.providerAmount} sinFactura={o.providerSinFactura} retention={o.providerIvaRetention} label="Total a pagar al proveedor" />
                          <div className="flex gap4 wrap">
                            {!o.paid ? <button className="btn btn-gr btn-sm" onClick={() => onUpdate(o.id, { paid: true, paidDate: today() })}>✓ Marcar pagado al proveedor</button>
                              : <button className="btn btn-g btn-sm" style={{ color: "var(--amber)", borderColor: "var(--amber)" }} onClick={() => onUpdate(o.id, { paid: false, paidDate: null })}>↩ Revertir pago</button>}
                          </div>
                          {o.paid && o.paidDate && <div className="tsm txt2">Pagado: {fmtDate(o.paidDate)}</div>}
                          <div><div className="tsm txt2 mb4">Factura del proveedor</div><PhotoBtn label="Subir factura" photoKey={[o.id, "providerInvoice"]} compact /></div>
                          <div><div className="tsm txt2 mb4">Comprobante de pago al proveedor</div><PhotoBtn label="Subir comprobante" photoKey={[o.id, "providerPayment"]} compact onLoad={() => { if (!o.paid) onUpdate(o.id, { paid: true, paidDate: today() }); }} /></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminFinanciero({ trips, expenses, outsourced, razones, onSaveExpenses }) {
  const [mk, setMk] = useState(nowMon());
  const [selRS, setSelRS] = useState(razones[0]?.id || "");
  const [newE, setNewE] = useState({ cat: "Combustible", desc: "", amount: "" });
  const mt = trips.filter(t => t.date.startsWith(mk) && t.razonSocialId === selRS);
  const tripInc = mt.reduce((s, t) => s + (t.amount || 0), 0);
  const outFiltered = outsourced.filter(o => o.razonSocialId === selRS && o.date.startsWith(mk));
  const outInc = outFiltered.reduce((s, o) => s + (o.clientAmount || 0), 0);
  const income = tripInc + outInc;
  const tripExp = mt.reduce((s, t) => s + (t.tripExpenses || []).reduce((a, x) => a + x.amount, 0), 0);
  const outExp = outFiltered.reduce((s, o) => s + (o.providerAmount || 0), 0);
  const rsExps = expenses.filter(e => e.razonSocialId === selRS && e.month === mk);
  const opExp = rsExps.reduce((s, e) => s + e.amount, 0);
  const totalExps = opExp + tripExp + outExp;
  const profit = income - totalExps;
  const addExp = () => {
    const amt = parseFloat(newE.amount);
    if (!newE.desc || isNaN(amt) || amt <= 0) return;
    onSaveExpenses([...expenses, { id: genId(), razonSocialId: selRS, month: mk, cat: newE.cat, desc: newE.desc, amount: amt, createdAt: new Date().toISOString() }]);
    setNewE(p => ({ ...p, desc: "", amount: "" }));
  };
  const delExp = id => onSaveExpenses(expenses.filter(e => e.id !== id));
  const byCat = EXP_CATS.map(c => ({ c, total: rsExps.filter(e => e.cat === c).reduce((s, e) => s + e.amount, 0) })).filter(x => x.total > 0);
  const rs = razones.find(r => r.id === selRS);
  return (
    <div className="ap">
      <div className="flex aic jb mb12 wrap gap8">
        <div className="stitle" style={{ margin: 0 }}>Financiero</div>
        <div className="flex gap8 wrap aic">
          <div className="pill-tabs" style={{ margin: 0 }}>{razones.filter(r => r.active).map(r => <button key={r.id} className={`pill-tab ${selRS === r.id ? "act" : ""}`} onClick={() => setSelRS(r.id)}>{r.short}</button>)}</div>
          <input type="month" value={mk} onChange={e => setMk(e.target.value)} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--r)", color: "var(--txt)", padding: "6px 10px", fontFamily: "Barlow", outline: "none" }} />
        </div>
      </div>
      {rs && <div className="tsm txt2 mb12">📊 <strong>{rs.name}</strong> · RFC: {rs.rfc}</div>}
      <div className="flex jb mb12 wrap gap8">
        <div /></div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-g btn-sm" onClick={() => {
          const rows = [["Fecha","Tipo","Descripción","Categoría","Ingreso","Gasto"],
            ...mt.map(t => [t.date, "Viaje propio", `${t.origin}→${t.destination} (${t.client})`, "Ingreso", t.amount||0, (t.tripExpenses||[]).reduce((s,e)=>s+e.amount,0)]),
            ...rsExps.map(e => [e.createdAt?.slice(0,10)||mk, "Gasto operativo", e.desc, e.cat, 0, e.amount]),
            ...outFiltered.map(o => [o.date, "Tercerizado-ingreso", `${o.origin}→${o.destination} (${o.client})`, "Flete cobrado", o.clientAmount||0, 0]),
            ...outFiltered.map(o => [o.date, "Tercerizado-gasto", `Proveedor: ${o.provider}`, "Flete pagado", 0, o.providerAmount||0]),
          ];
          exportCSV(rows, `financiero_${rs?.short||"global"}_${mk}.csv`);
        }}>📤 Exportar CSV para contador</button>
      </div>
      <div className="g4 mb12">
        <div className="card kpi"><div className="kv">{fmt$(income)}</div><div className="kl">Ingresos totales</div></div>
        <div className="card kpi"><div className="kv" style={{ color: "var(--red)" }}>{fmt$(totalExps)}</div><div className="kl">Gastos totales</div></div>
        <div className="card kpi" style={{ borderColor: profit >= 0 ? "#22c55e44" : "#ef444444" }}><div className="kv" style={{ color: profit >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(profit)}</div><div className="kl">Utilidad neta</div></div>
        <div className="card kpi"><div className="kv">{mt.length + outFiltered.length}</div><div className="kl">Servicios</div></div>
      </div>
      {/* Pending alerts */}
      {(() => {
        const pendIncome = mt.filter(t => (t.billingStatus || "sin_facturar") !== "pagado" && t.amount > 0);
        const pendClientOut = outFiltered.filter(o => (o.clientBillingStatus || "sin_facturar") !== "pagado" && (o.clientAmount || 0) > 0);
        const pendProvOut = outFiltered.filter(o => !o.paid && (o.providerAmount || 0) > 0);
        const pendIncomeTotal = pendIncome.reduce((s, t) => s + t.amount, 0) + pendClientOut.reduce((s, o) => s + (o.clientAmount || 0), 0);
        const pendExpTotal = pendProvOut.reduce((s, o) => s + (o.providerAmount || 0), 0);
        if (!pendIncomeTotal && !pendExpTotal) return null;
        return (
          <div className="g2 mb12">
            {pendIncomeTotal > 0 && <div className="warn-box">
              <div className="tsm txt2 mb4">💰 Ingresos pendientes de cobro</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "var(--amber)" }}>{fmt$(pendIncomeTotal)}</div>
              <div className="tsm txt2">{pendIncome.length + pendClientOut.length} servicio(s) sin pagar</div>
            </div>}
            {pendExpTotal > 0 && <div className="alert-box">
              <div className="tsm txt2 mb4">🔴 Tercerizados pendientes de pago</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "var(--red)" }}>{fmt$(pendExpTotal)}</div>
              <div className="tsm txt2">{pendProvOut.length} proveedor(es) por pagar</div>
            </div>}
          </div>
        );
      })()}
      <div className="card mb12">
        <div className="stitle" style={{ fontSize: 14, marginBottom: 8 }}>Desglose de ingresos y gastos</div>
        {[["Ingresos viajes propios", tripInc, true], ["Ingresos tercerizados (cliente)", outInc, true], ["Gastos operativos", opExp, false], ["Gastos por viaje", tripExp, false], ["Costo tercerizados (proveedor)", outExp, false]].map(([l, v, isInc]) => (
          <div key={l} className="flex aic jb tsm" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <span>{l}</span><span style={{ color: isInc ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{fmt$(v)}</span>
          </div>
        ))}
      </div>
      <div className="g2" style={{ gap: 16 }}>
        <div>
          <div className="stitle">Agregar Gasto Operativo</div>
          <div className="card fcol gap8">
            <Field label="Categoría"><select value={newE.cat} onChange={e => setNewE(p => ({ ...p, cat: e.target.value }))}>{EXP_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Descripción"><input placeholder="Ej: Diesel ruta norte" value={newE.desc} onChange={e => setNewE(p => ({ ...p, desc: e.target.value }))} /></Field>
            <Field label="Monto ($)"><input type="number" placeholder="0.00" value={newE.amount} onChange={e => setNewE(p => ({ ...p, amount: e.target.value }))} onKeyDown={e => e.key === "Enter" && addExp()} /></Field>
            <button className="btn btn-a" onClick={addExp}><Ico path={IC.plus} size={14} /> Agregar</button>
          </div>
          {byCat.length > 0 && <div className="mt12"><div className="stitle" style={{ fontSize: 14 }}>Por categoría</div><div className="card">{byCat.map(x => <div key={x.c} className="flex aic jb tsm" style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}><span>{x.c}</span><span style={{ color: "var(--red)", fontWeight: 700 }}>{fmt$(x.total)}</span></div>)}</div></div>}
        </div>
        <div>
          <div className="stitle">Gastos Operativos ({rsExps.length})</div>
          {!rsExps.length ? <div className="card"><Empty title="Sin gastos" sub="Agrega gastos del mes" /></div> : (
            <div className="fcol gap8">
              {rsExps.map(e => (
                <div key={e.id} className="card flex aic jb">
                  <div><div className="tsm txt2">{e.cat}</div><div style={{ fontWeight: 600 }}>{e.desc}</div></div>
                  <div className="flex aic gap8"><span style={{ color: "var(--red)", fontWeight: 700 }}>{fmt$(e.amount)}</span><button className="btn btn-g btn-sm" onClick={() => delExp(e.id)}><Ico path={IC.trash} size={14} /></button></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminConductores({ trips, drivers, vehicles, razones }) {
  const [selRS, setSelRS] = useState("all"); const mk = nowMon();
  const ft = trips.filter(t => selRS === "all" || t.razonSocialId === selRS);
  const stats = drivers.map(d => {
    const dt = ft.filter(t => t.driverId === d.id);
    const byCargo = CARGO.map(c => ({ ...c, cnt: dt.filter(t => t.cargo === c.v).length }));
    const uvs = [...new Set(dt.map(t => t.vehicleId))].map(id => vehicles.find(v => v.id === id)?.plates).filter(Boolean);
    return { ...d, tripCount: dt.length, monthCnt: dt.filter(t => t.date.startsWith(mk)).length, income: dt.reduce((s, t) => s + (t.amount || 0), 0), byCargo, uvs };
  });
  return (
    <div className="ap">
      <div className="flex aic jb mb12">
        <div className="stitle" style={{ margin: 0 }}>Conductores</div>
        <div className="pill-tabs" style={{ margin: 0 }}>
          <button className={`pill-tab ${selRS === "all" ? "act" : ""}`} onClick={() => setSelRS("all")}>Global</button>
          {razones.filter(r => r.active).map(r => <button key={r.id} className={`pill-tab ${selRS === r.id ? "act" : ""}`} onClick={() => setSelRS(r.id)}>{r.short}</button>)}
        </div>
      </div>
      <div className="g2" style={{ gap: 12 }}>
        {stats.map(d => (
          <div key={d.id} className="card">
            <div className="flex aic jb mb12">
              <div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 800 }}>{d.name}</div><div className="tsm txt2">Lic: {d.license}</div></div>
              <span className={`badge ${d.active ? "bg" : "bgr"}`}>{d.active ? "Activo" : "Inactivo"}</span>
            </div>
            <div className="g2 mb8" style={{ gap: 8 }}>
              <div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 26, fontWeight: 800, color: "var(--amber)" }}>{d.tripCount}</div><div className="tsm txt2">Viajes totales</div></div>
              <div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 18, fontWeight: 800, color: "var(--green)" }}>{fmt$(d.income)}</div><div className="tsm txt2">Ingresos</div></div>
            </div>
            <div className="tsm txt2 mb8">Este mes: <strong style={{ color: "var(--amber)" }}>{d.monthCnt}</strong> viajes</div>
            <div className="flex gap4 wrap mb8">{d.byCargo.filter(c => c.cnt > 0).map(c => <span key={c.v} className={`badge ${c.v === "general" ? "bb" : c.v === "refrigerado" ? "bc" : "br"}`}>{c.l}: {c.cnt}</span>)}</div>
            {d.uvs.length > 0 && <div className="tsm txt2">🚛 {d.uvs.join(", ")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminUnidades({ trips, inspections, vehicles }) {
  const mk = nowMon();
  const stats = vehicles.map(v => {
    const vt = trips.filter(t => t.vehicleId === v.id);
    const vi = [...inspections.filter(i => i.vehicleId === v.id)].sort((a, b) => b.date.localeCompare(a.date));
    return { ...v, tripTotal: vt.length, tripMonth: vt.filter(t => t.date.startsWith(mk)).length, income: vt.reduce((s, t) => s + (t.amount || 0), 0), lastIns: vi[0], insCount: vi.length };
  });
  return (
    <div className="ap">
      <div className="stitle">Unidades</div>
      <div className="g2" style={{ gap: 12 }}>
        {stats.map(v => {
          const li = v.lastIns;
          const pct = li ? Math.round((li.passedCount / li.totalCount) * 100) : null;
          const pc = pct === null ? null : pct === 100 ? "var(--green)" : pct >= 75 ? "var(--amber)" : "var(--red)";
          const hasActiveIssue = li && li.issues && !li.resolved;
          const bc = !li ? "bgr" : hasActiveIssue ? "br" : "bg";
          const lbl = !li ? "Sin inspección" : hasActiveIssue ? "Con fallas" : li?.issues && li?.resolved ? "Falla resuelta" : "OK";
          return (
            <div key={v.id} className="card">
              <div className="flex aic jb mb12">
                <div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, fontWeight: 800 }}>{v.plates}</div><div className="tsm txt2">{v.model} · {v.year}</div></div>
                <span className={`badge ${bc}`}>{lbl}</span>
              </div>
              <div className="g2 mb8" style={{ gap: 8 }}>
                <div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 26, fontWeight: 800, color: "var(--amber)" }}>{v.tripTotal}</div><div className="tsm txt2">Viajes totales</div></div>
                <div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 18, fontWeight: 800, color: "var(--green)" }}>{fmt$(v.income)}</div><div className="tsm txt2">Ingresos</div></div>
              </div>
              <div className="tsm txt2 mb8">Este mes: <strong style={{ color: "var(--amber)" }}>{v.tripMonth}</strong> viajes</div>
              {li && (
                <div>
                  <div className="flex aic jb tsm txt2 mb4"><span>Última insp: {fmtDate(li.date)}</span><span>{pct}%</span></div>
                  <div className="prog mb8"><div className="progf" style={{ width: `${pct}%`, background: pc }} /></div>
                  {li.issues && <div className="tsm" style={{ color: hasActiveIssue ? "var(--red)" : "var(--txt2)", background: hasActiveIssue ? "#ef444411" : "var(--bg3)", padding: "6px 8px", borderRadius: 6 }}>{li.resolved ? "✓ Resuelto: " : "🔧 "}{li.issues}</div>}
                </div>
              )}
              <div className="tsm txt2 mt8">{v.insCount} inspecciones</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminConfig({ trips, vehicles, drivers, clients, providers, razones, onSaveVehicles, onSaveDrivers, onSaveClients, onSaveProviders, onSaveRazones }) {
  const [nv, setNv] = useState({ plates: "", model: "", year: "" });
  const [nd, setNd] = useState({ name: "", license: "", phone: "" });
  const [nc, setNc] = useState({ name: "", rfc: "" });
  const [np, setNp] = useState({ name: "", rfc: "", paymentMethod: "transferencia" });
  const [nr, setNr] = useState({ name: "", rfc: "", short: "" });
  const [delId, setDelId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const startEdit = (id, data) => { setEditId(id); setEditData({ ...data }); };
  const cancelEdit = () => { setEditId(null); setEditData({}); };
  const ed = k => e => setEditData(p => ({ ...p, [k]: e.target.value }));
  const addV = () => { if (!nv.plates || !nv.model) return; onSaveVehicles([...vehicles, { id: genId(), ...nv, active: true }]); setNv({ plates: "", model: "", year: "" }); };
  const addD = () => { if (!nd.name) return; onSaveDrivers([...drivers, { id: genId(), ...nd, active: true }]); setNd({ name: "", license: "", phone: "" }); };
  const addC = () => { if (!nc.name) return; onSaveClients([...(clients||[]), { id: genId(), ...nc, active: true }]); setNc({ name: "", rfc: "" }); };
  const addP = () => { if (!np.name.trim()) return; onSaveProviders([...(providers||[]), { id: genId(), ...np, active: true }]); setNp({ name: "", rfc: "", paymentMethod: "transferencia" }); };
  const addR = () => { if (!nr.name || !nr.short) return; onSaveRazones([...razones, { id: genId(), ...nr, active: true }]); setNr({ name: "", rfc: "", short: "" }); };

  // Inline confirm delete buttons
  const DelBtn = ({ uid, onConfirm }) => delId === uid ? (
    <div className="flex gap4 aic">
      <span className="tsm" style={{ color: "var(--red)" }}>¿Eliminar?</span>
      <button className="btn btn-r btn-sm" onClick={() => { onConfirm(); setDelId(null); }}>Sí</button>
      <button className="btn btn-g btn-sm" onClick={() => setDelId(null)}>No</button>
    </div>
  ) : (
    <button className="btn btn-g btn-sm" title="Eliminar" onClick={() => setDelId(uid)}>🗑</button>
  );
  return (
    <div className="ap">
      <div className="g2" style={{ gap: 16, marginBottom: 24 }}>
        <div>
          <div className="stitle">Unidades</div>
          <div className="card mb12 fcol gap8">
            <Field label="Placas *"><input value={nv.plates} onChange={e => setNv(p => ({ ...p, plates: e.target.value }))} placeholder="ABC-123-A" /></Field>
            <Field label="Modelo *"><input value={nv.model} onChange={e => setNv(p => ({ ...p, model: e.target.value }))} placeholder="Kenworth T680" /></Field>
            <Field label="Año"><input value={nv.year} onChange={e => setNv(p => ({ ...p, year: e.target.value }))} placeholder="2024" /></Field>
            <Field label="Intervalo mantenimiento (km)"><input type="number" value={nv.maintenanceKm || ""} onChange={e => setNv(p => ({ ...p, maintenanceKm: e.target.value }))} placeholder="Ej: 10000" /></Field>
            <Field label="Km en último mantenimiento"><input type="number" value={nv.lastMaintenanceKm || ""} onChange={e => setNv(p => ({ ...p, lastMaintenanceKm: e.target.value }))} placeholder="Lectura actual del odómetro" /></Field>
            <button className="btn btn-a" onClick={addV}><Ico path={IC.plus} size={14} /> Agregar</button>
          </div>
          <div className="fcol gap8">{vehicles.map(v => {
            const vTrips = trips ? trips.filter(t => t.vehicleId === v.id && t.endKm).sort((a,b)=>Number(b.endKm)-Number(a.endKm)) : [];
            const curKm = vTrips[0] ? Number(vTrips[0].endKm) : 0;
            const lastMaint = Number(v.lastMaintenanceKm || 0);
            const interval = Number(v.maintenanceKm || 0);
            const kmSince = curKm - lastMaint;
            const pct = interval > 0 && curKm > 0 ? Math.min(100, Math.round((kmSince/interval)*100)) : 0;
            const maintColor = pct >= 100 ? "var(--red)" : pct >= 85 ? "var(--amber)" : "var(--green)";
            return (
              <div key={v.id} className="card">
                {editId === v.id ? (
                  <div className="fcol gap6">
                    <div className="g2">
                      <Field label="Placas *"><input value={editData.plates||""} onChange={ed("plates")} /></Field>
                      <Field label="Modelo"><input value={editData.model||""} onChange={ed("model")} /></Field>
                      <Field label="Año"><input value={editData.year||""} onChange={ed("year")} /></Field>
                      <Field label="Km mantenimiento"><input type="number" value={editData.maintenanceKm||""} onChange={ed("maintenanceKm")} placeholder="30000" /></Field>
                    </div>
                    <div className="flex gap4">
                      <button className="btn btn-a btn-sm" onClick={() => { onSaveVehicles(vehicles.map(x=>x.id===v.id?{...x,...editData,maintenanceKm:Number(editData.maintenanceKm)||0}:x)); cancelEdit(); }}>✓ Guardar</button>
                      <button className="btn btn-g btn-sm" onClick={cancelEdit}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex aic jb mb8">
                      <div><div style={{ fontWeight: 700 }}>{v.plates}</div><div className="tsm txt2">{v.model} · {v.year}</div></div>
                      <div className="flex gap4">
                        <button className="btn btn-g btn-sm" onClick={() => startEdit(v.id, v)}>✏️</button>
                        <button className={`btn btn-sm ${v.active?"btn-g":"btn-a"}`} onClick={() => onSaveVehicles(vehicles.map(x=>x.id===v.id?{...x,active:!x.active}:x))}>{v.active?"Desactivar":"Activar"}</button>
                        <DelBtn uid={`v:${v.id}`} onConfirm={() => onSaveVehicles(vehicles.filter(x=>x.id!==v.id))} />
                      </div>
                    </div>
                    {interval > 0 && (
                      <div>
                        <div className="flex aic jb tsm txt2 mb4">
                          <span>Mantenimiento: {kmSince > 0 ? `${kmSince.toLocaleString()} / ${interval.toLocaleString()} km` : `Intervalo: ${interval.toLocaleString()} km`}</span>
                          <span style={{ fontWeight:700, color:maintColor }}>{pct}%</span>
                        </div>
                        <div className="prog mb8"><div className="progf" style={{width:`${pct}%`,background:maintColor}}/></div>
                        {curKm > 0 && <div className="tsm txt2 mb4">Odómetro actual: <strong>{curKm.toLocaleString()} km</strong></div>}
                        <button className="btn btn-gr btn-sm" onClick={() => {
                          const km = prompt(`Km del odómetro al momento del mantenimiento (actual ~${curKm.toLocaleString()})?`);
                          if (km && !isNaN(Number(km))) onSaveVehicles(vehicles.map(x=>x.id===v.id?{...x,lastMaintenanceKm:Number(km)}:x));
                        }}>✓ Registrar mantenimiento realizado</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}</div>
        </div>
        <div>
          <div className="stitle">Conductores</div>
          <div className="card mb12 fcol gap8">
            <Field label="Nombre *"><input value={nd.name} onChange={e => setNd(p => ({ ...p, name: e.target.value }))} placeholder="Nombre completo" /></Field>
            <Field label="No. Licencia"><input value={nd.license} onChange={e => setNd(p => ({ ...p, license: e.target.value }))} placeholder="L-001" /></Field>
            <Field label="📱 WhatsApp (10 dígitos)"><input type="tel" value={nd.phone} onChange={e => setNd(p => ({ ...p, phone: e.target.value.replace(/\D/g,'') }))} placeholder="5512345678" maxLength={10} /></Field>
            <div className="tsm txt2">El número se usa para enviarle mensajes de WhatsApp desde la app</div>
            <button className="btn btn-a" onClick={addD}><Ico path={IC.plus} size={14} /> Agregar</button>
          </div>
          <div className="fcol gap8">{drivers.map(d => (
            <div key={d.id} className="card">
              {editId === d.id ? (
                <div className="fcol gap6">
                  <Field label="Nombre *"><input value={editData.name||""} onChange={ed("name")} /></Field>
                  <Field label="No. Licencia"><input value={editData.license||""} onChange={ed("license")} placeholder="L-001" /></Field>
                  <Field label="📱 WhatsApp (10 dígitos)"><input type="tel" value={editData.phone||""} onChange={e => setEditData(p=>({...p,phone:e.target.value.replace(/\D/g,'')}))} placeholder="5512345678" maxLength={10} /></Field>
                  <div className="flex gap4">
                    <button className="btn btn-a btn-sm" onClick={() => { onSaveDrivers(drivers.map(x=>x.id===d.id?{...x,...editData}:x)); cancelEdit(); }}>✓ Guardar</button>
                    <button className="btn btn-g btn-sm" onClick={cancelEdit}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex aic jb">
                  <div>
                    <div style={{ fontWeight: 700 }}>{d.name}</div>
                    <div className="tsm txt2">Lic: {d.license || "Sin licencia"}{d.phone ? ` · 📱 ${d.phone}` : " · Sin WhatsApp"}</div>
                  </div>
                  <div className="flex gap4">
                    <button className="btn btn-g btn-sm" onClick={() => startEdit(d.id, d)}>✏️</button>
                    <button className={`btn btn-sm ${d.active ? "btn-g" : "btn-a"}`} onClick={() => onSaveDrivers(drivers.map(x => x.id === d.id ? { ...x, active: !x.active } : x))}>{d.active ? "Desactivar" : "Activar"}</button>
                    <DelBtn uid={`d:${d.id}`} onConfirm={() => onSaveDrivers(drivers.filter(x => x.id !== d.id))} />
                  </div>
                </div>
              )}
            </div>
          ))}</div>
        </div>
      </div>

      {/* ── CATÁLOGO DE CLIENTES ── */}
      <div className="mt16 mb16">
        <div className="stitle">🤝 Catálogo de Clientes</div>
        <div className="card mb12">
          <div className="tsm txt2 mb8">Asigna cada cliente a una Razón Social para que los viajes se clasifiquen automáticamente.</div>
          <div className="g2 mb8">
            <Field label="Nombre del cliente *"><input value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la empresa" onKeyDown={e => e.key === "Enter" && addC()} /></Field>
            <Field label="RFC (opcional)"><input value={nc.rfc} onChange={e => setNc(p => ({ ...p, rfc: e.target.value }))} placeholder="RFC del cliente" /></Field>
            <Field label="Razón Social (RS asignada)">
              <select value={nc.razonSocialId||""} onChange={e => setNc(p => ({ ...p, razonSocialId: e.target.value }))}>
                <option value="">Sin asignar</option>
                {razones.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.short}</option>)}
              </select>
            </Field>
          </div>
          <button className="btn btn-a" onClick={addC}><Ico path={IC.plus} size={14} /> Agregar cliente</button>
        </div>
        {(!clients || clients.length === 0) ? (
          <div className="card"><div className="tsm txt2" style={{ textAlign: "center", padding: 12 }}>Sin clientes dados de alta. Agrega clientes para que los choferes los seleccionen.</div></div>
        ) : (
          <div className="fcol gap8">
            {(clients || []).map(c => (
              <div key={c.id} className="card">
                {editId === c.id ? (
                  <div className="fcol gap6">
                    <Field label="Nombre *"><input value={editData.name||""} onChange={ed("name")} /></Field>
                    <Field label="RFC"><input value={editData.rfc||""} onChange={ed("rfc")} /></Field>
                    <Field label="Razón Social">
                      <select value={editData.razonSocialId||""} onChange={ed("razonSocialId")}>
                        <option value="">Sin asignar</option>
                        {razones.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.short}</option>)}
                      </select>
                    </Field>
                    <div className="flex gap4">
                      <button className="btn btn-a btn-sm" onClick={() => { onSaveClients((clients||[]).map(x=>x.id===c.id?{...x,...editData}:x)); cancelEdit(); }}>✓ Guardar</button>
                      <button className="btn btn-g btn-sm" onClick={cancelEdit}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex aic jb">
                    <div>
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      <div className="tsm txt2">
                        {c.rfc && `RFC: ${c.rfc} · `}
                        {c.razonSocialId ? <span className="rs-pill">{razones.find(r=>r.id===c.razonSocialId)?.short || "—"}</span> : <span style={{color:"var(--amber)"}}>⚠ Sin RS asignada</span>}
                      </div>
                    </div>
                    <div className="flex gap4">
                      <button className="btn btn-g btn-sm" onClick={() => startEdit(c.id, c)}>✏️</button>
                      <button className={`btn btn-sm ${c.active !== false ? "btn-g" : "btn-a"}`}
                        onClick={() => onSaveClients((clients||[]).map(x => x.id === c.id ? { ...x, active: x.active === false } : x))}>
                        {c.active !== false ? "Desactivar" : "Activar"}
                      </button>
                      <DelBtn uid={`c:${c.id}`} onConfirm={() => onSaveClients((clients||[]).filter(x => x.id !== c.id))} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CATÁLOGO DE PROVEEDORES ── */}
      <div className="mt16 mb16">
        <div className="stitle">🚛 Catálogo de Proveedores</div>
        <div className="card mb12">
          <div className="tsm txt2 mb8">Los proveedores dados de alta se podrán seleccionar en Viajes Tercerizados. Evita duplicados en cuentas por pagar.</div>
          <div className="g2 mb8">
            <Field label="Nombre del proveedor *"><input value={np.name} onChange={e => setNp(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la empresa" onKeyDown={e => e.key === "Enter" && addP()} /></Field>
            <Field label="RFC (opcional)"><input value={np.rfc} onChange={e => setNp(p => ({ ...p, rfc: e.target.value }))} placeholder="RFC del proveedor" /></Field>
          </div>
          <Field label="Forma de pago habitual" style={{ marginBottom: 8 }}>
            <select value={np.paymentMethod} onChange={e => setNp(p => ({ ...p, paymentMethod: e.target.value }))}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
            </select>
          </Field>
          <button className="btn btn-a mt8" onClick={addP}><Ico path={IC.plus} size={14} /> Agregar proveedor</button>
        </div>
        {(!providers || providers.length === 0) ? (
          <div className="card"><div className="tsm txt2" style={{ textAlign: "center", padding: 12 }}>Sin proveedores dados de alta. Agrégalos para usarlos en tercerizados.</div></div>
        ) : (
          <div className="fcol gap8">
            {(providers || []).map(p => (
              <div key={p.id} className="card">
                {editId === p.id ? (
                  <div className="fcol gap6">
                    <Field label="Nombre *"><input value={editData.name||""} onChange={ed("name")} /></Field>
                    <Field label="RFC"><input value={editData.rfc||""} onChange={ed("rfc")} /></Field>
                    <Field label="Forma de pago">
                      <select value={editData.paymentMethod||"transferencia"} onChange={ed("paymentMethod")}>
                        <option value="transferencia">Transferencia</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </Field>
                    <div className="flex gap4">
                      <button className="btn btn-a btn-sm" onClick={() => { onSaveProviders((providers||[]).map(x=>x.id===p.id?{...x,...editData}:x)); cancelEdit(); }}>✓ Guardar</button>
                      <button className="btn btn-g btn-sm" onClick={cancelEdit}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex aic jb">
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div className="tsm txt2">{[p.rfc && `RFC: ${p.rfc}`, p.paymentMethod && `Pago: ${p.paymentMethod}`].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="flex gap4">
                      <button className="btn btn-g btn-sm" onClick={() => startEdit(p.id, p)}>✏️</button>
                      <button className={`btn btn-sm ${p.active !== false ? "btn-g" : "btn-a"}`}
                        onClick={() => onSaveProviders((providers||[]).map(x => x.id === p.id ? { ...x, active: x.active === false } : x))}>
                        {p.active !== false ? "Desactivar" : "Activar"}
                      </button>
                      <DelBtn uid={`p:${p.id}`} onConfirm={() => onSaveProviders((providers||[]).filter(x => x.id !== p.id))} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="stitle">Razones Sociales</div>
        <div className="card mb12">
          <div className="g3 mb8">
            <Field label="Nombre completo *"><input value={nr.name} onChange={e => setNr(p => ({ ...p, name: e.target.value }))} placeholder="Empresa S.A. de C.V." /></Field>
            <Field label="Nombre corto *"><input value={nr.short} onChange={e => setNr(p => ({ ...p, short: e.target.value }))} placeholder="Empresa SA" /></Field>
            <Field label="RFC"><input value={nr.rfc} onChange={e => setNr(p => ({ ...p, rfc: e.target.value }))} placeholder="EMP123456AAA" /></Field>
          </div>
          <button className="btn btn-a" onClick={addR}><Ico path={IC.plus} size={14} /> Agregar Razón Social</button>
        </div>
        <div className="fcol gap8">{razones.map(r => (
          <div key={r.id} className="card">
            {editId === r.id ? (
              <div className="fcol gap6">
                <div className="g3">
                  <Field label="Nombre completo *"><input value={editData.name||""} onChange={ed("name")} /></Field>
                  <Field label="Nombre corto *"><input value={editData.short||""} onChange={ed("short")} /></Field>
                  <Field label="RFC"><input value={editData.rfc||""} onChange={ed("rfc")} /></Field>
                </div>
                <div className="flex gap4">
                  <button className="btn btn-a btn-sm" onClick={() => { onSaveRazones(razones.map(x=>x.id===r.id?{...x,...editData}:x)); cancelEdit(); }}>✓ Guardar</button>
                  <button className="btn btn-g btn-sm" onClick={cancelEdit}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="flex aic jb">
                <div><div style={{ fontWeight: 700 }}>{r.name}</div><div className="tsm txt2">RFC: {r.rfc} · <span className="rs-pill">{r.short}</span></div></div>
                <div className="flex gap4">
                  <button className="btn btn-g btn-sm" onClick={() => startEdit(r.id, r)}>✏️</button>
                  <button className={`btn btn-sm ${r.active ? "btn-g" : "btn-a"}`} onClick={() => onSaveRazones(razones.map(x => x.id === r.id ? { ...x, active: !x.active } : x))}>{r.active ? "Desactivar" : "Activar"}</button>
                  <DelBtn uid={`r:${r.id}`} onConfirm={() => onSaveRazones(razones.filter(x => x.id !== r.id))} />
                </div>
              </div>
            )}
          </div>
        ))}</div>
      </div>
    </div>
  );
}

function PendingSection({ title, color, icon, items, total, emptyMsg, renderItem }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sec-card mb12">
      <div className="sec-hdr" style={{ cursor: "pointer" }} onClick={() => setOpen(p => !p)}>
        <div className="flex aic gap8">
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span>{title}</span>
          {items.length > 0 && <span className={`badge ${color}`}>{items.length}</span>}
        </div>
        <div className="flex aic gap12">
          {items.length > 0 && <span style={{ fontWeight: 800, color: color === "br" ? "var(--red)" : color === "ba" ? "var(--amber)" : color === "bg" ? "var(--green)" : "var(--blue)" }}>{fmt$(total)}</span>}
          <span className="tsm txt2">{open ? "▲" : "▼"}</span>
        </div>
      </div>
      {open && (
        <div className="sec-body">
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "var(--green)", fontWeight: 700 }}>✓ {emptyMsg}</div>
          ) : (
            <div className="fcol gap8">{items.map(renderItem)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminPendientes({ trips, outsourced, razones, onUpdate, onUpdateOut }) {
  const [mk, setMk] = useState(nowMon());
  const [selRS, setSelRS] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const ft = trips.filter(t => t.date.startsWith(mk) && (selRS === "all" || t.razonSocialId === selRS));
  const fo = outsourced.filter(o => o.date.startsWith(mk) && (selRS === "all" || o.razonSocialId === selRS));
  const bs = t => t.billingStatus || "sin_facturar";

  // Four billing buckets
  const sinFacturar = ft.filter(t => bs(t) === "sin_facturar");
  const porCobrar = ft.filter(t => bs(t) === "facturado");
  const sinCompl = ft.filter(t => bs(t) === "pagado");
  const completos = ft.filter(t => bs(t) === "complemento");
  const tercPend = fo.filter(o => !o.paid);

  // Progress overview
  const total = ft.length;
  const pct = total > 0 ? Math.round((completos.length / total) * 100) : 100;
  const months = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  const tripRow = t => (
    <div key={t.id}>
      <div className="card" style={{ background: "var(--bg3)" }}>
        <div className="flex aic jb mb4 wrap gap4">
          <div className="flex aic gap8 wrap">
            <span className="tsm txt2">{fmtDate(t.date)}</span>
            <BillingBadge v={bs(t)} mp={t.metodoPago} />
            <RSBadge id={t.razonSocialId} razones={razones} />
          </div>
          <button className="btn btn-g btn-sm" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
            {expandedId === t.id ? "▲ Cerrar" : "✏ Gestionar"}
          </button>
        </div>
        <div style={{ fontWeight: 700 }}>{t.origin} → {t.destination}</div>
        <div className="flex gap8 tsm txt2 wrap mt4">
          <span>👤 {t.client}</span>
          <span>{t.amount ? fmt$(t.amount) : <span style={{ color: "var(--amber)" }}>Sin monto</span>}</span>
          {t.invoiceNumber && <span>🧾 {t.invoiceNumber}</span>}
          {t.paidDate && <span>Cobrado: {fmtDate(t.paidDate)}</span>}
          {(bs(t) === "facturado") && <span style={{ color: daysSince(t.date) > 30 ? "var(--red)" : "var(--txt2)" }}>{daysSince(t.date)}d transcurridos</span>}
        </div>
        {expandedId === t.id && <BillingPanel trip={t} onUpdate={onUpdate} />}
      </div>
    </div>
  );

  const tercRow = o => {
    const dias = o.dueDate ? daysSince(o.dueDate) : null;
    const isOver = dias !== null && dias > 0;
    return (
      <div key={o.id} className="card" style={{ background: "var(--bg3)", borderLeft: `3px solid ${isOver ? "var(--red)" : "var(--amber)"}` }}>
        <div className="flex aic jb mb4">
          <span style={{ fontWeight: 700 }}>{o.provider}</span>
          <div className="flex gap4 aic">
            {isOver && <span className="badge br">Vencido {dias}d</span>}
            <button className="btn btn-gr btn-sm" onClick={() => onUpdateOut(o.id, { paid: true, paidDate: today() })}>✓ Pagado</button>
          </div>
        </div>
        <div className="tsm txt2">{o.origin} → {o.destination} · {o.client || ""}</div>
        <div className="flex gap8 tsm mt4 wrap">
          <span style={{ color: "var(--red)", fontWeight: 700 }}>{fmt$(o.providerAmount || 0)}</span>
          {o.dueDate && <span className="txt2">Vence: {fmtDate(o.dueDate)}</span>}
          {o.providerInvoiceNum && <span className="txt2">Fact: {o.providerInvoiceNum}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="ap">
      <div className="flex aic jb mb12 wrap gap8">
        <div className="stitle" style={{ margin: 0 }}>📋 Cierre Mensual & Pendientes</div>
        <div className="flex gap8 wrap aic">
          <div className="pill-tabs" style={{ margin: 0 }}>
            <button className={`pill-tab ${selRS === "all" ? "act" : ""}`} onClick={() => setSelRS("all")}>Todas</button>
            {razones.filter(r => r.active).map(r => <button key={r.id} className={`pill-tab ${selRS === r.id ? "act" : ""}`} onClick={() => setSelRS(r.id)}>{r.short}</button>)}
          </div>
          <select value={mk} onChange={e => setMk(e.target.value)} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--r)", color: "var(--txt)", padding: "6px 10px", fontFamily: "Barlow", outline: "none" }}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Progress */}
      <div className="card mb12">
        <div className="flex aic jb mb8">
          <span style={{ fontWeight: 700 }}>Progreso del mes</span>
          <span className="tsm txt2">{completos.length}/{total} servicios completos</span>
        </div>
        <div className="prog mb12"><div className="progf" style={{ width: `${pct}%`, background: pct === 100 ? "var(--green)" : "var(--amber)" }} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
          {[
            ["Sin facturar", sinFacturar.length, "var(--txt2)"],
            ["Por cobrar", porCobrar.length, "var(--amber)"],
            ["Sin complemento", sinCompl.length, "var(--blue)"],
            ["Completados", completos.length, "var(--green)"],
          ].map(([l, n, c]) => (
            <div key={l} style={{ textAlign: "center", padding: "10px 8px", background: "var(--bg3)", borderRadius: 6 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 26, fontWeight: 800, color: c }}>{n}</div>
              <div className="tsm txt2">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <PendingSection
        title="Sin facturar — pendiente emitir CFDI"
        color="bgr" icon="🧾"
        items={sinFacturar}
        total={sinFacturar.reduce((s, t) => s + (t.amount || 0), 0)}
        emptyMsg="Todos los servicios tienen factura"
        renderItem={tripRow}
      />
      <PendingSection
        title="Facturados — pendiente de cobro"
        color="ba" icon="💰"
        items={porCobrar}
        total={porCobrar.reduce((s, t) => s + (t.amount || 0), 0)}
        emptyMsg="No hay facturas pendientes de cobro"
        renderItem={tripRow}
      />
      <PendingSection
        title="Pagados — pendiente complemento de pago SAT"
        color="bb" icon="📄"
        items={sinCompl}
        total={sinCompl.reduce((s, t) => s + (t.amount || 0), 0)}
        emptyMsg="Todos los pagos tienen complemento emitido"
        renderItem={tripRow}
      />
      <PendingSection
        title="Tercerizados — pendiente pagar al proveedor"
        color="br" icon="🔴"
        items={tercPend}
        total={tercPend.reduce((s, o) => s + (o.providerAmount || 0), 0)}
        emptyMsg="Todos los proveedores están pagados"
        renderItem={tercRow}
      />
    </div>
  );
}


function AdminForecast({ trips, outsourced, expenses }) {
  const [terms, setTerms] = useState(30); // días de plazo de cobro
  const weeks = [];
  for (let w = 0; w < 8; w++) {
    const wStart = new Date(); wStart.setDate(wStart.getDate() + w * 7);
    const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7);
    const startStr = wStart.toISOString().slice(0, 10);
    const endStr = wEnd.toISOString().slice(0, 10);
    const lbl = wStart.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
    // Expected collections: invoiced trips, using configured payment terms
    const cobros = trips.filter(t => {
      if ((t.billingStatus || "sin_facturar") !== "facturado" || !t.amount) return false;
      const estPay = new Date(t.date + "T12:00:00");
      estPay.setDate(estPay.getDate() + terms);
      const est = estPay.toISOString().slice(0, 10);
      return est >= startStr && est < endStr;
    }).reduce((s, t) => s + t.amount, 0);
    // Sin facturar (optimistic — might collect if invoiced now)
    const sinFact = w <= 2 ? trips.filter(t => {
      if ((t.billingStatus || "sin_facturar") !== "sin_facturar" || !t.amount) return false;
      const estPay = new Date(t.date + "T12:00:00");
      estPay.setDate(estPay.getDate() + terms + 15);
      const est = estPay.toISOString().slice(0, 10);
      return est >= startStr && est < endStr;
    }).reduce((s, t) => s + t.amount, 0) : 0;
    // Expected payments: outsourced with due dates
    const pagos = outsourced.filter(o => !o.paid && o.dueDate && o.dueDate >= startStr && o.dueDate < endStr)
      .reduce((s, o) => s + (o.providerAmount || 0), 0);
    weeks.push({ lbl, Cobros: Math.round(cobros), "Cobros potenciales": Math.round(sinFact), Pagos: Math.round(pagos), Neto: Math.round(cobros - pagos) });
  }
  // Pending totals
  const totalPending = trips.filter(t => (t.billingStatus||"sin_facturar") === "facturado" && t.amount > 0).reduce((s,t)=>s+t.amount,0);
  const totalSinFact = trips.filter(t => (t.billingStatus||"sin_facturar") === "sin_facturar" && t.amount > 0).reduce((s,t)=>s+t.amount,0);
  const totalProvPend = outsourced.filter(o => !o.paid).reduce((s,o)=>s+(o.providerAmount||0),0);
  const netCashPos = totalPending - totalProvPend;
  return (
    <div className="ap">
      <div className="flex aic jb mb12 wrap gap8">
        <div className="stitle" style={{margin:0}}>📅 Forecast de Flujo de Efectivo — 8 semanas</div>
        <div className="flex aic gap8">
          <span className="tsm txt2">Plazo de cobro:</span>
          <select value={terms} onChange={e=>setTerms(Number(e.target.value))} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--r)",color:"var(--txt)",padding:"6px 10px",fontFamily:"Barlow",outline:"none"}}>
            <option value={15}>15 días</option><option value={30}>30 días</option>
            <option value={45}>45 días</option><option value={60}>60 días</option>
          </select>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:16}}>
        <div className="card kpi"><div className="kv" style={{color:"var(--green)"}}>{fmt$(totalPending)}</div><div className="kl">Por cobrar (facturado)</div></div>
        <div className="card kpi"><div className="kv" style={{color:"var(--amber)"}}>{fmt$(totalSinFact)}</div><div className="kl">Sin facturar (potencial)</div></div>
        <div className="card kpi"><div className="kv" style={{color:"var(--red)"}}>{fmt$(totalProvPend)}</div><div className="kl">Por pagar (proveedores)</div></div>
        <div className="card kpi" style={{borderColor:netCashPos>=0?"#22c55e44":"#ef444444"}}>
          <div className="kv" style={{color:netCashPos>=0?"var(--green)":"var(--red)"}}>{fmt$(netCashPos)}</div><div className="kl">Posición neta</div>
        </div>
      </div>
      <div className="card mb12">
        <div className="stitle" style={{fontSize:15,marginBottom:12}}>Proyección semanal de efectivo</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeks} margin={{top:0,right:8,left:0,bottom:0}}>
            <XAxis dataKey="lbl" tick={{fill:"#8b949e",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#8b949e",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`}/>
            <Tooltip formatter={v=>fmt$(v)} contentStyle={{background:"#1c2333",border:"1px solid #30363d",borderRadius:6,fontSize:12}} labelStyle={{color:"#e6edf3",fontWeight:700}}/>
            <Legend wrapperStyle={{fontSize:12,color:"#8b949e"}}/>
            <Bar dataKey="Cobros" fill="#22c55e" radius={[3,3,0,0]} stackId="in"/>
            <Bar dataKey="Cobros potenciales" fill="#22c55e66" radius={[3,3,0,0]} stackId="in"/>
            <Bar dataKey="Pagos" fill="#ef4444" radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
        <div className="tsm txt2 mt8">🟢 Cobros confirmados · 🟩 Potenciales · 🔴 Pagos a proveedores</div>
      </div>
      <div className="stitle">Detalle por semana</div>
      <div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr><th>Semana</th><th>Cobros esperados</th><th>Potencial sin facturar</th><th>Pagos a proveedores</th><th>Flujo neto</th></tr></thead>
          <tbody>
            {weeks.map((w,i) => (
              <tr key={i}>
                <td style={{fontWeight:600}}>{w.lbl}</td>
                <td style={{color:"var(--green)",fontWeight:w.Cobros>0?700:400}}>{w.Cobros>0?fmt$(w.Cobros):"—"}</td>
                <td style={{color:"#22c55e99"}}>{w["Cobros potenciales"]>0?fmt$(w["Cobros potenciales"]):"—"}</td>
                <td style={{color:"var(--red)",fontWeight:w.Pagos>0?700:400}}>{w.Pagos>0?fmt$(w.Pagos):"—"}</td>
                <td style={{fontWeight:700,color:w.Neto>=0?"var(--green)":"var(--red)"}}>{fmt$(w.Neto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt12" style={{background:"var(--bg3)"}}>
        <div className="tsm txt2">
          <strong style={{color:"var(--txt)"}}>💡 Cómo leer este forecast:</strong><br/>
          Los <span style={{color:"var(--green)"}}>cobros confirmados</span> son servicios ya facturados — el dinero debería entrar según tu plazo de cobro configurado.<br/>
          Los <span style={{color:"#22c55e99"}}>cobros potenciales</span> son servicios sin facturar — si los facturas hoy, llegarían según el plazo.<br/>
          Los <span style={{color:"var(--red)"}}>pagos</span> son fechas límite de proveedores tercerizados. Si el flujo neto de alguna semana es negativo, planea con anticipación.
        </div>
      </div>
    </div>
  );
}

function AdminGastosAnalisis({ trips, expenses, outsourced }) {
  const [months3] = useState(() => {
    const ms = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      ms.push(d.toISOString().slice(0, 7));
    }
    return ms;
  });
  // Per-category per-month breakdown
  const cats = [...new Set(expenses.map(e => e.cat))].sort();
  const data = months3.map(mk => {
    const row = { mes: mk.slice(5) };
    cats.forEach(c => { row[c] = expenses.filter(e => e.month === mk && e.cat === c).reduce((s,e)=>s+e.amount,0); });
    row["Gastos viaje"] = trips.filter(t=>t.date.startsWith(mk)).reduce((s,t)=>s+(t.tripExpenses||[]).reduce((a,x)=>a+x.amount,0),0);
    row["Tercerizados"] = outsourced.filter(o=>o.date.startsWith(mk)).reduce((s,o)=>s+(o.providerAmount||0),0);
    return row;
  }).reverse();
  const allCats = [...cats, "Gastos viaje", "Tercerizados"].filter(c => data.some(d => d[c] > 0));
  const COLORS = ["#f59e0b","#3b82f6","#22c55e","#06b6d4","#a855f7","#ef4444","#f97316","#ec4899"];
  // Find anomalies comparing last month to 3-month avg
  const mk = months3[0];
  const anomalies = [];
  allCats.forEach(cat => {
    const avg = months3.slice(1,4).reduce((s,m)=>s+(data.find(d=>d.mes===m.slice(5))?.[cat]||0),0)/3;
    const cur = data[data.length-1]?.[cat] || 0;
    if (avg > 300 && cur > avg * 1.25) anomalies.push({ cat, cur, avg, pct: Math.round((cur/avg-1)*100) });
  });
  return (
    <div className="ap">
      <div className="stitle">🔍 Análisis de Gastos — Últimos 6 meses</div>
      {anomalies.length > 0 && (
        <div className="mb12">
          <div className="stitle" style={{fontSize:15}}>⚠️ Gastos inusuales detectados</div>
          {anomalies.map(a => (
            <div key={a.cat} className="warn-box mb6" style={{marginBottom:6}}>
              <strong>{a.cat}:</strong> {fmt$(a.cur)} este mes vs promedio {fmt$(Math.round(a.avg))} — <strong style={{color:"var(--red)"}}>+{a.pct}% fuera de lo normal</strong>
            </div>
          ))}
        </div>
      )}
      <div className="card mb12">
        <div className="stitle" style={{fontSize:15,marginBottom:12}}>Composición de gastos por mes</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{top:0,right:8,left:0,bottom:0}}>
            <XAxis dataKey="mes" tick={{fill:"#8b949e",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#8b949e",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`}/>
            <Tooltip formatter={v=>fmt$(v)} contentStyle={{background:"#1c2333",border:"1px solid #30363d",borderRadius:6,fontSize:12}} labelStyle={{color:"#e6edf3",fontWeight:700}}/>
            <Legend wrapperStyle={{fontSize:11,color:"#8b949e"}}/>
            {allCats.map((cat,i)=><Bar key={cat} dataKey={cat} fill={COLORS[i%COLORS.length]} stackId="a" radius={i===allCats.length-1?[3,3,0,0]:[0,0,0,0]}/>)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="stitle" style={{fontSize:15}}>Detalle por categoría</div>
      <div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr><th>Categoría</th>{data.map(d=><th key={d.mes}>{d.mes}</th>)}<th>Promedio</th></tr></thead>
          <tbody>
            {allCats.map((cat,ci) => {
              const vals = data.map(d => d[cat] || 0);
              const avg = Math.round(vals.reduce((s,v)=>s+v,0)/vals.length);
              const lastVal = vals[vals.length-1];
              const isHigh = avg > 300 && lastVal > avg * 1.25;
              return (
                <tr key={cat} style={{background:isHigh?"#f59e0b08":"transparent"}}>
                  <td><span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:COLORS[ci%COLORS.length],marginRight:6}}></span>{cat}{isHigh&&<span className="badge ba" style={{marginLeft:6,fontSize:10}}>⚠</span>}</td>
                  {vals.map((v,i)=><td key={i} style={{color:v>0?"var(--txt)":"var(--border)",fontWeight:v===lastVal&&isHigh?700:400}}>{v>0?fmt$(v):"—"}</td>)}
                  <td style={{color:"var(--txt2)",fontWeight:600}}>{avg>0?fmt$(avg):"—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminOdometro({ trips, vehicles, onSaveVehicles }) {
  const vStats = vehicles.filter(v => v.active).map(v => {
    const vTrips = trips.filter(t => t.vehicleId === v.id && t.endKm).sort((a,b)=>Number(b.endKm)-Number(a.endKm));
    const curKm = vTrips[0] ? Number(vTrips[0].endKm) : 0;
    const lastMaint = Number(v.lastMaintenanceKm || 0);
    const interval = Number(v.maintenanceKm || 0);
    const kmSince = curKm - lastMaint;
    const pct = interval > 0 && curKm > 0 ? Math.min(100, Math.round((kmSince/interval)*100)) : 0;
    const maintColor = pct >= 100 ? "var(--red)" : pct >= 85 ? "var(--amber)" : "var(--green)";
    // Recent readings (last 10 trips with km)
    const recent = vTrips.slice(0, 8);
    return { ...v, curKm, lastMaint, interval, kmSince, pct, maintColor, recent };
  });
  return (
    <div className="ap">
      <div className="flex aic jb mb12">
        <div className="stitle" style={{margin:0}}>🛣️ Odómetro & Mantenimientos</div>
        <div className="tsm txt2">Los choferes registran el km al terminar cada viaje</div>
      </div>
      <div className="g2" style={{gap:12}}>
        {vStats.map(v => (
          <div key={v.id} className="card">
            <div className="flex aic jb mb8">
              <div><div style={{fontFamily:"'Barlow Condensed'",fontSize:20,fontWeight:800}}>{v.plates}</div><div className="tsm txt2">{v.model}</div></div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Barlow Condensed'",fontSize:26,fontWeight:800,color:"var(--amber)"}}>{v.curKm > 0 ? v.curKm.toLocaleString() : "—"}</div>
                <div className="tsm txt2">km actuales</div>
              </div>
            </div>
            {v.interval > 0 ? (
              <div className="mb8">
                <div className="flex aic jb tsm txt2 mb4">
                  <span>Mantenimiento preventivo</span>
                  <span style={{fontWeight:700,color:v.maintColor}}>{v.pct}%</span>
                </div>
                <div className="prog mb4"><div className="progf" style={{width:`${v.pct}%`,background:v.maintColor}}/></div>
                <div className="tsm txt2">
                  {v.curKm > 0 ? `${v.kmSince.toLocaleString()} km desde último mant. / ${v.interval.toLocaleString()} km intervalo` : "Sin lecturas registradas"}
                </div>
                {v.pct >= 100 && <div className="alert-box mt8"><strong>🔧 MANTENIMIENTO VENCIDO</strong> — {v.kmSince.toLocaleString()} km sin servicio</div>}
                {v.pct >= 85 && v.pct < 100 && <div className="warn-box mt8">⚠ Programar mantenimiento — faltan ~{(v.interval - v.kmSince).toLocaleString()} km</div>}
                <button className="btn btn-gr btn-sm mt8" onClick={() => {
                  const km = prompt(`Registrar mantenimiento. Km del odómetro hoy (actual: ${v.curKm.toLocaleString()})?`);
                  if (km && !isNaN(Number(km))) onSaveVehicles(vehicles.map(x=>x.id===v.id?{...x,lastMaintenanceKm:Number(km)}:x));
                }}>✓ Registrar mantenimiento realizado</button>
              </div>
            ) : (
              <div className="warn-box tsm mb8">Configura el intervalo de mantenimiento en ⚙ Configuración</div>
            )}
            {v.recent.length > 0 && (
              <div>
                <div className="tsm txt2 mb4">Últimas lecturas:</div>
                <div className="fcol gap4">
                  {v.recent.map(t => (
                    <div key={t.id} className="flex aic jb tsm" style={{padding:"3px 0",borderBottom:"1px solid var(--border)"}}>
                      <span className="txt2">{fmtDate(t.date)}</span>
                      <span>{Number(t.endKm).toLocaleString()} km</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="card mt12" style={{background:"var(--bg3)"}}>
        <div className="tsm txt2">
          <strong style={{color:"var(--txt)"}}>🌐 Integración con Webfleet (Bridgestone):</strong><br/>
          Webfleet ofrece una API REST para obtener posición GPS y odómetro en tiempo real. Para una integración directa necesitarías un servidor intermediario (backend) que maneje las credenciales de API de forma segura. <br/><br/>
          <strong style={{color:"var(--txt)"}}>Flujo recomendado por ahora:</strong> El chofer consulta la lectura del odómetro en la cabina (o en la app de Webfleet) y la registra en TransControl al terminar cada viaje. Con 3-5 registros por semana tendrás datos suficientemente precisos para el mantenimiento preventivo.
        </div>
      </div>
    </div>
  );
}


function PendingExpenseItem({ e, onUpdate }) {
  const [payM, setPayM] = useState("transferencia");
  const [paying, setPaying] = useState(false);
  return (
    <div className="card flex aic jb" style={{ borderLeft: "3px solid var(--amber)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{e.desc}</div>
        <div className="tsm txt2">{e.cat} · <strong>{fmt$(e.amount)}</strong></div>
        <div className="tsm txt2">📍 {e.trip.origin} → {e.trip.destination} · {fmtDate(e.trip.date)}</div>
        {e.trip.client && <div className="tsm txt2">🤝 {e.trip.client}</div>}
        {paying
          ? <div className="flex gap4 aic mt6">
              <select value={payM} onChange={ev => setPayM(ev.target.value)} style={{ fontSize: 12, padding: "4px 6px" }}>
                <option value="transferencia">🏦 Transferencia</option>
                <option value="efectivo">💵 Efectivo</option>
                <option value="cheque">📝 Cheque</option>
              </select>
              <button className="btn btn-gr btn-sm" onClick={() => {
                const updated = (e.trip.tripExpenses || []).map(x => x.id === e.id ? { ...x, paid: true, paidDate: today(), paymentMethod: payM } : x);
                onUpdate(e.trip.id, { tripExpenses: updated });
                setPaying(false);
              }}>✓ Pagar</button>
              <button className="btn btn-g btn-sm" onClick={() => setPaying(false)}>✕</button>
            </div>
          : <button className="btn btn-a btn-sm mt6" onClick={() => setPaying(true)}>Marcar pagado</button>
        }
      </div>
      <span className="badge ba ml8">Pendiente</span>
    </div>
  );
}

function AdminCuentasProveedor({ outsourced, providers, razones, trips, onUpdate, onUpdateOut }) {
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("proveedores"); // "proveedores" | "gastos-viaje"
  // Unpaid trip expenses across all trips
  const pendingTripExp = trips.flatMap(t =>
    (t.tripExpenses || []).filter(e => e.paid !== true).map(e => ({ ...e, trip: t }))
  ).sort((a, b) => a.trip.date.localeCompare(b.trip.date));
  const totalPendingExp = pendingTripExp.reduce((s, e) => s + e.amount, 0);
  const providerNames = [...new Set(outsourced.map(o => o.provider).filter(Boolean))].sort()
    .filter(p => p.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="ap">
      <div className="flex aic jb mb12 wrap gap8">
        <div className="stitle" style={{ margin: 0 }}>🚛 Cuentas por Pagar</div>
        <div className="pill-tabs" style={{ margin: 0 }}>
          <button className={`pill-tab ${section === "proveedores" ? "act" : ""}`} onClick={() => setSection("proveedores")}>Proveedores tercerizados</button>
          <button className={`pill-tab ${section === "gastos-viaje" ? "act" : ""}`} onClick={() => setSection("gastos-viaje")}>
            Gastos de viajes{pendingTripExp.length > 0 && ` (${pendingTripExp.length})`}
          </button>
        </div>
      </div>

      {section === "gastos-viaje" && (
        <div>
          {pendingTripExp.length === 0 ? <Empty title="Sin gastos pendientes" sub="Todos los gastos de viaje están pagados" /> : (
            <div>
              <div className="card mb12 flex aic jb">
                <span className="tsm txt2">{pendingTripExp.length} gasto(s) pendiente(s)</span>
                <span style={{ fontWeight: 800, color: "var(--amber)", fontSize: 18 }}>{fmt$(totalPendingExp)}</span>
              </div>
              <div className="fcol gap8">
                  {pendingTripExp.map(e => (
                    <PendingExpenseItem key={e.id} e={e} onUpdate={onUpdate} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {section === "proveedores" && (
        <div>
          <div className="card mb12">
            <Field label="Buscar proveedor"><input placeholder="Nombre del proveedor..." value={search} onChange={e => setSearch(e.target.value)} /></Field>
          </div>
          {!providerNames.length ? <Empty title="Sin proveedores" sub="No hay servicios tercerizados registrados" /> : (
            <div className="fcol gap12">
            {providerNames.map(prov => {
              const po = outsourced.filter(o => o.provider === prov);
            const total = po.reduce((s, o) => s + (o.providerAmount || 0), 0);
            const paid = po.filter(o => o.paid).reduce((s, o) => s + (o.providerAmount || 0), 0);
            const pending = total - paid;
            const overdue = po.filter(o => !o.paid && o.dueDate && daysSince(o.dueDate) > 0);
            const provInfo = (providers||[]).find(p => p.name === prov);
            return (
              <div key={prov} className="sec-card">
                <div className="sec-hdr">
                  <div>
                    <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 800 }}>{prov}</div>
                    <div className="tsm txt2">
                      {[po.length + " servicios", provInfo?.rfc && `RFC: ${provInfo.rfc}`, provInfo?.paymentMethod && `Pago: ${provInfo.paymentMethod}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "var(--red)", fontSize: 18 }}>{fmt$(total)}</div>
                    {pending > 0 && <div className="tsm" style={{ color: "var(--amber)" }}>Pendiente: {fmt$(pending)}</div>}
                    {paid > 0 && <div className="tsm" style={{ color: "var(--green)" }}>Pagado: {fmt$(paid)}</div>}
                  </div>
                </div>
                <div className="sec-body">
                  {overdue.length > 0 && <div className="alert-box mb12"><span style={{ fontWeight: 700, color: "var(--red)" }}>⚠ {overdue.length} pago(s) vencido(s) — {fmt$(overdue.reduce((s, o) => s + (o.providerAmount || 0), 0))}</span></div>}
                  <div className="flex gap8 mb12 wrap">
                    <span className="badge bg">Pagados: {po.filter(o => o.paid).length}</span>
                    <span className="badge ba">Pendientes: {po.filter(o => !o.paid).length}</span>
                    {overdue.length > 0 && <span className="badge br">Vencidos: {overdue.length}</span>}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead><tr><th>Fecha</th><th>Ruta</th><th>Cliente</th><th>Monto</th><th>Estado</th><th>Vence</th><th></th></tr></thead>
                      <tbody>
                        {po.sort((a, b) => b.date.localeCompare(a.date)).map(o => {
                          const dias = o.dueDate ? daysSince(o.dueDate) : null;
                          const venc = !o.paid && dias !== null && dias > 0;
                          return (
                            <tr key={o.id} style={{ background: venc ? "#ef444408" : "transparent" }}>
                              <td style={{ whiteSpace: "nowrap" }}>{fmtDate(o.date)}</td>
                              <td className="tsm">{o.origin} → {o.destination}</td>
                              <td className="tsm">{o.client || "—"}</td>
                              <td><strong style={{ color: "var(--red)" }}>{fmt$(o.providerAmount || 0)}</strong></td>
                              <td><span className={`badge ${o.paid ? "bg" : venc ? "br" : "ba"}`}>{o.paid ? "✓ Pagado" : venc ? `Vencido ${dias}d` : "Pendiente"}</span></td>
                              <td className="tsm txt2">{o.dueDate ? fmtDate(o.dueDate) : "—"}</td>
                              <td>{!o.paid ? (
                                <button className="btn btn-gr btn-sm" onClick={() => onUpdate(o.id, { paid: true, paidDate: today() })}>✓ Pagar</button>
                              ) : (
                                <button className="btn btn-g btn-sm" style={{ color: "var(--amber)", borderColor: "var(--amber)", fontSize: 11 }} onClick={() => onUpdate(o.id, { paid: false, paidDate: null })}>↩</button>
                              )}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
      )}
    </div>
  );
}

function AdminComplementos({ trips, onUpdate }) {
  const pending = trips.filter(t => t.metodoPago === "PPD" && t.billingStatus === "facturado")
    .sort((a, b) => a.date.localeCompare(b.date));
  const done = trips.filter(t => t.metodoPago === "PPD" && t.billingStatus === "pagado")
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const [showDone, setShowDone] = useState(false);
  const totalPending = pending.reduce((s, t) => s + ivaTotal(t.amount, t.sinFactura, t.ivaRetention), 0);
  const save = (id, patch) => onUpdate(id, patch);
  return (
    <div className="ap">
      <div className="flex aic jb mb12">
        <div className="stitle" style={{ margin: 0 }}>📋 Complementos de Pago SAT</div>
        {pending.length > 0 && <span style={{ fontWeight: 800, color: "var(--amber)", fontSize: 18 }}>{fmt$(totalPending)}</span>}
      </div>

      {pending.length === 0 && !showDone && (
        <Empty title="Sin complementos pendientes" sub="Todos los viajes PPD tienen su complemento de pago emitido 🎉" />
      )}

      {pending.length > 0 && (
        <div className="fcol gap8 mb16">
          <div className="tsm txt2 mb4" style={{ fontWeight: 700 }}>Pendientes de complemento ({pending.length})</div>
          {pending.map(t => (
            <div key={t.id} className="card" style={{ borderLeft: "4px solid var(--amber)" }}>
              <div className="flex aic jb mb8">
                <div>
                  <div style={{ fontWeight: 700 }}>{t.origin} → {t.destination}</div>
                  <div className="tsm txt2">{fmtDate(t.date)}{t.client ? ` · 🤝 ${t.client}` : ""}</div>
                  {t.invoiceNumber && <div className="tsm txt2">🧾 {t.invoiceNumber}</div>}
                </div>
                <div className="fcol" style={{ alignItems: "flex-end", gap: 4 }}>
                  <span className="badge ba">PPD — Pdte. complemento</span>
                  {t.amount > 0 && <span style={{ fontWeight: 700, color: "var(--amber)" }}>{fmt$(ivaTotal(t.amount, t.sinFactura, t.ivaRetention))}</span>}
                </div>
              </div>
              <div className="flex aic gap8 wrap">
                <div>
                  <div className="tsm txt2 mb4">Subir complemento de pago</div>
                  <PhotoBtn label="📎 Complemento SAT" photoKey={[t.id, "complemento"]} compact
                    onLoad={() => save(t.id, { billingStatus: "pagado", paidDate: today(), complementoSubido: true })} />
                </div>
                <button className="btn btn-gr btn-sm mt12" onClick={() => save(t.id, { billingStatus: "pagado", paidDate: today(), complementoSubido: true })}>
                  ✓ Marcar pagado c/Complemento
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-g btn-sm mb12" onClick={() => setShowDone(p=>!p)}>
        {showDone ? "▲ Ocultar" : "▼ Ver"} complementos emitidos ({done.length})
      </button>
      {showDone && done.map(t => (
        <div key={t.id} className="card mb6 flex aic jb" style={{ borderLeft: "4px solid var(--green)" }}>
          <div>
            <div style={{ fontWeight: 700 }}>{t.origin} → {t.destination}</div>
            <div className="tsm txt2">{fmtDate(t.date)} · {t.client} · {t.invoiceNumber}</div>
            <div className="tsm txt2">Pagado: {fmtDate(t.paidDate)}</div>
          </div>
          <div className="flex gap4 aic">
            <span className="badge bg">✓ Complemento emitido</span>
            <PhotoBtn label="Ver" photoKey={[t.id, "complemento"]} compact />
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminApp({ trips, inspections, vehicles, drivers, expenses, outsourced, razones, clients, providers, schedule, instructions, instant, onAdd, onUpdate, onDelete, onAddIns, onSaveExpenses, onAddOut, onUpdateOut, onDeleteOut, onSaveVehicles, onSaveDrivers, onSaveRazones, onSaveClients, onSaveProviders, onUpdateInstant, onAddStatusRequest, onResolveInspection, onDeleteInspection, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const activeIssues = inspections.filter(i => i.issues && !i.resolved).length;
  const mk = nowMon();
  const pendCount = trips.filter(t => t.date.startsWith(mk) && ["sin_facturar","facturado","pagado"].includes(t.billingStatus || "sin_facturar") && t.amount > 0).length
    + outsourced.filter(o => o.date.startsWith(mk) && !o.paid).length;
  const tabs = [
    { id: "dashboard", l: "📊 Dashboard" },
    { id: "pendientes", l: `📋 Cierre${pendCount > 0 ? ` (${pendCount})` : ""}` },
    { id: "forecast", l: "📅 Forecast" },
    { id: "gastos", l: "🔍 Análisis gastos" },
    { id: "viajes", l: "🚛 Viajes" },
    { id: "complementos", l: `📋 Complementos${trips.filter(t=>t.metodoPago==="PPD"&&t.billingStatus==="facturado").length > 0 ? ` (${trips.filter(t=>t.metodoPago==="PPD"&&t.billingStatus==="facturado").length})` : ""}` },
    { id: "clientes", l: "🤝 Clientes" }, { id: "tercerizados", l: "🔗 Tercerizados" }, { id: "cuentas-prov", l: "🚛 C. Proveedor" },
    { id: "financiero", l: "💰 Financiero" }, { id: "conductores", l: "👤 Conductores" },
    { id: "unidades", l: "🚚 Unidades" },
    { id: "odometro", l: "🛣️ Odómetro" },
    { id: "inspecciones", l: `🔧 Inspecciones${activeIssues > 0 ? ` (${activeIssues})` : ""}` },
    { id: "disponib", l: "📅 Disponibilidad" }, { id: "config", l: "⚙ Config" },
  ];
  return (
    <div>
      <div className="hdr">
        <div className="logo">⬡ TRANSCONTROL</div>
        <div className="flex aic gap8"><span className="badge ba">Admin</span><button className="btn btn-g btn-sm" onClick={onLogout}><Ico path={IC.logout} size={14} /> Salir</button></div>
      </div>
      <div className="nav-tabs">{tabs.map(t => <button key={t.id} className={`ntab ${tab === t.id ? "act" : ""}`} onClick={() => setTab(t.id)}>{t.l}</button>)}</div>
      <div style={{ paddingTop: 8 }}>
        {tab === "dashboard" && <AdminDashboard trips={trips} vehicles={vehicles} drivers={drivers} expenses={expenses} outsourced={outsourced} razones={razones} inspections={inspections} />}
        {tab === "pendientes" && <AdminPendientes trips={trips} outsourced={outsourced} razones={razones} onUpdate={onUpdate} onUpdateOut={onUpdateOut} />}
        {tab === "forecast" && <AdminForecast trips={trips} outsourced={outsourced} expenses={expenses} />}
        {tab === "gastos" && <AdminGastosAnalisis trips={trips} expenses={expenses} outsourced={outsourced} />}
        {tab === "viajes" && <AdminViajes trips={trips} vehicles={vehicles} drivers={drivers} razones={razones} clients={clients} onUpdate={onUpdate} onDelete={onDelete} onAdd={onAdd} />}
        {tab === "complementos" && <AdminComplementos trips={trips} onUpdate={onUpdate} />}
        {tab === "clientes" && <AdminClientes trips={trips} razones={razones} />}
        {tab === "tercerizados" && <AdminTercerizados outsourced={outsourced} razones={razones} clients={clients} providers={providers} onAdd={onAddOut} onUpdate={onUpdateOut} onDelete={onDeleteOut} />}
        {tab === "cuentas-prov" && <AdminCuentasProveedor outsourced={outsourced} providers={providers} razones={razones} trips={trips} onUpdate={onUpdate} onUpdateOut={onUpdateOut} />}
        {tab === "financiero" && <AdminFinanciero trips={trips} expenses={expenses} outsourced={outsourced} razones={razones} onSaveExpenses={onSaveExpenses} />}
        {tab === "conductores" && <AdminConductores trips={trips} drivers={drivers} vehicles={vehicles} razones={razones} />}
        {tab === "unidades" && <AdminUnidades trips={trips} inspections={inspections} vehicles={vehicles} />}
        {tab === "odometro" && <AdminOdometro trips={trips} vehicles={vehicles} onSaveVehicles={onSaveVehicles} />}
        {tab === "inspecciones" && <div className="ap"><div className="stitle">Inspecciones Físico-Mecánicas</div><InspectionsView inspections={inspections} vehicles={vehicles} drivers={drivers} onResolve={onResolveInspection} onDelete={onDeleteInspection} /></div>}
        {tab === "disponib" && <CoordAvailability vehicles={vehicles} drivers={drivers} schedule={schedule} instant={instant} onUpdateInstant={onUpdateInstant} onAddStatusRequest={onAddStatusRequest} />}
        {tab === "config" && <AdminConfig trips={trips} vehicles={vehicles} drivers={drivers} clients={clients} providers={providers} razones={razones} onSaveVehicles={onSaveVehicles} onSaveDrivers={onSaveDrivers} onSaveClients={onSaveClients} onSaveProviders={onSaveProviders} onSaveRazones={onSaveRazones} />}
      </div>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null); const [driver, setDriver] = useState(null);
  const [pendingDriverSelect, setPendingDriverSelect] = useState(null);
  const [trips, setTrips] = useState([]); const [inspections, setInspections] = useState([]);
  const [vehicles, setVehicles] = useState(DEF_VEHICLES); const [drivers, setDrivers] = useState(DEF_DRIVERS);
  const [expenses, setExpenses] = useState([]); const [outsourced, setOutsourced] = useState([]);
  const [razones, setRazones] = useState(DEF_RS);
  const [clients, setClients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [instructions, setInstructions] = useState([]); const [schedule, setSchedule] = useState([]);
  const [instant, setInstant] = useState({ vehicles: [], drivers: [] });
  const [statusRequests, setStatusRequests] = useState([]);

  useEffect(() => {
    const el = document.createElement("style"); el.textContent = CSS; document.head.appendChild(el);
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); setRole(null); setDriver(null); return; }
      const info = USUARIOS[user.email?.toLowerCase()];
      if (!info) { await signOut(auth); setLoading(false); return; }
      const safety = setTimeout(() => setLoading(false), 8000);
      Promise.all([
        ld("tr:trips",[]), ld("tr:inspections",[]),
        ld("tr:vehicles",DEF_VEHICLES), ld("tr:drivers",DEF_DRIVERS),
        ld("tr:expenses",[]), ld("tr:outsourced",[]),
        ld("tr:razones",DEF_RS), ld("tr:clients",[]), ld("tr:providers",[]),
        ld("tr:instructions",[]), ld("tr:schedule",[]),
        ld("tr:instant",{vehicles:[],drivers:[]}), ld("tr:status_requests",[]),
      ]).then(async ([t,i,v,d,e,o,r,cl,prov,ins,sc,inst,sreq]) => {
        setTrips(t); setInspections(i); setVehicles(v); setDrivers(d);
        setExpenses(e); setOutsourced(o); setRazones(r); setClients(cl||[]); setProviders(prov||[]);
        setInstructions(ins); setSchedule(sc);
        setInstant(inst||{vehicles:[],drivers:[]});
        setStatusRequests(sreq||[]);
        if (info.rol === "chofer") {
          // 1. Check saved email→driverId mapping in Firestore
          const emailMap = await ld("tr:email_driver_map", {});
          const savedId = emailMap[user.email?.toLowerCase()];
          let matched = savedId ? d.find(dr => dr.id === savedId && dr.active !== false) : null;
          // 2. Fallback: try to match by exact name
          if (!matched) matched = d.find(dr => dr.name === info.nombre && dr.active !== false);
          if (matched) {
            setDriver(matched);
            setRole("chofer");
          } else {
            // 3. No match — show selector
            setPendingDriverSelect({ userEmail: user.email?.toLowerCase(), userInfo: info, availableDrivers: d.filter(dr => dr.active !== false) });
            setRole("select_driver");
          }
        } else {
          setRole(info.rol);
        }
      }).catch(()=>{}).finally(()=>{ clearTimeout(safety); setLoading(false); });
    });
    return () => unsub();
  }, []);

  const upd = (arr, id, p) => arr.map(x => x.id === id ? { ...x, ...p } : x);
  const addTrip = t => { const u = [...trips, t]; setTrips(u); sv("tr:trips", u); };
  const updTrip = (id, p) => { const u = upd(trips, id, p); setTrips(u); sv("tr:trips", u); };
  const delTrip = id => { const u = trips.filter(t => t.id !== id); setTrips(u); sv("tr:trips", u); };
  const addIns = i => { const u = [...inspections, i]; setInspections(u); sv("tr:inspections", u); };
  const delIns = id => { const u = inspections.filter(i => i.id !== id); setInspections(u); sv("tr:inspections", u); };
  const resolveInspection = id => { const u = upd(inspections, id, { resolved: true, resolvedAt: today() }); setInspections(u); sv("tr:inspections", u); };
  const addOut = o => { const u = [...outsourced, o]; setOutsourced(u); sv("tr:outsourced", u); };
  const updOut = (id, p) => { const u = upd(outsourced, id, p); setOutsourced(u); sv("tr:outsourced", u); };
  const delOut = id => { const u = outsourced.filter(o => o.id !== id); setOutsourced(u); sv("tr:outsourced", u); };
  const saveExps = e => { setExpenses(e); sv("tr:expenses", e); };
  const saveVehicles = v => { setVehicles(v); sv("tr:vehicles", v); };
  const saveDrivers = d => { setDrivers(d); sv("tr:drivers", d); };
  const saveRazones = r => { setRazones(r); sv("tr:razones", r); };
  const saveClients = c => { setClients(c); sv("tr:clients", c); };
  const saveProviders = p => { setProviders(p); sv("tr:providers", p); };
  const saveInstructions = i => { setInstructions(i); sv("tr:instructions", i); };
  const saveSchedule = s => { setSchedule(s); sv("tr:schedule", s); };
  const ackInstruction = id => { const u = upd(instructions, id, { ack: true }); setInstructions(u); sv("tr:instructions", u); };
  const updateInstant = u => { setInstant(u); sv("tr:instant", u); };
  const addStatusRequest = req => { const u = [...statusRequests, req]; setStatusRequests(u); sv("tr:status_requests", u); };
  const updStatusRequest = (id, patch) => { const u = statusRequests.map(r => r.id === id ? { ...r, ...patch } : r); setStatusRequests(u); sv("tr:status_requests", u); };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}><div className="logo" style={{ fontSize: 32, marginBottom: 12 }}>⬡ TRANSCONTROL</div><div className="txt2">Cargando...</div></div>
    </div>
  );

  if (!role) return <LoginScreen />;

  if (role === "select_driver" && pendingDriverSelect) return (
    <DriverSelector info={pendingDriverSelect} onSelect={async selected => {
      const emailMap = await ld("tr:email_driver_map", {});
      emailMap[pendingDriverSelect.userEmail] = selected.id;
      await sv("tr:email_driver_map", emailMap);
      setDriver(selected);
      setPendingDriverSelect(null);
      setRole("chofer");
    }} />
  );

  if (role === "chofer") return (
    <ChoferApp driver={driver} trips={trips} inspections={inspections}
      vehicles={vehicles.filter(v => v.active)} drivers={drivers} razones={razones.filter(r => r.active)}
      clients={clients} instructions={instructions} instant={instant}
      statusRequests={statusRequests.filter(r => r.driverId === driver?.id)}
      onAdd={addTrip} onUpdate={updTrip} onAddIns={addIns} onAck={ackInstruction}
      onUpdateInstant={updateInstant} onUpdStatusRequest={updStatusRequest}
      onLogout={() => signOut(auth)} />
  );

  if (role === "coord") return (
    <CoordApp vehicles={vehicles} drivers={drivers} razones={razones} clients={clients} providers={providers} trips={trips}
      outsourced={outsourced} schedule={schedule} instructions={instructions} inspections={inspections} instant={instant}
      onSaveSchedule={saveSchedule} onSaveInstructions={saveInstructions}
      onUpdateInstant={updateInstant} onSaveVehicles={saveVehicles} onSaveClients={saveClients} onSaveProviders={saveProviders}
      onAddOut={addOut} onUpdateOut={updOut} onDeleteOut={delOut} onUpdate={updTrip}
      onAddStatusRequest={addStatusRequest}
      onResolveInspection={resolveInspection} onDeleteInspection={delIns} onLogout={() => signOut(auth)} />
  );

  return (
    <AdminApp trips={trips} inspections={inspections} vehicles={vehicles} drivers={drivers}
      expenses={expenses} outsourced={outsourced} razones={razones} clients={clients} providers={providers}
      schedule={schedule} instructions={instructions} instant={instant}
      onAdd={addTrip} onUpdate={updTrip} onDelete={delTrip} onAddIns={addIns}
      onSaveExpenses={saveExps} onAddOut={addOut} onUpdateOut={updOut} onDeleteOut={delOut}
      onSaveVehicles={saveVehicles} onSaveDrivers={saveDrivers} onSaveRazones={saveRazones}
      onSaveClients={saveClients} onSaveProviders={saveProviders}
      onUpdateInstant={updateInstant} onAddStatusRequest={addStatusRequest}
      onResolveInspection={resolveInspection} onDeleteInspection={delIns} onLogout={() => signOut(auth)} />
  );
}
