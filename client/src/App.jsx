import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { T } from "./i18n";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const TYPES = [["Pothole", "🕳️"], ["Crack", "⚡"], ["Waterlogging", "🌊"], ["Open manhole", "⚠️"], ["Broken divider", "🚧"], ["Other", "🛣️"]];
const STATUS = ["Reported", "In progress", "Fixed"];
const COL = { l: "#12b5a6", m: "#ff8a1f", h: "#f23b4e" };
const EMPTY = { type: "Pothole", sev: "m", road: "", area: "", desc: "", photo: "" };

async function call(path, opts = {}, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 70000);
  let r;
  try {
    r = await fetch(API + path, {
      ...opts,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) },
    });
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Server is taking too long. Please try again." : "Server is waking up or not reachable. Wait a minute and try again.");
  } finally { clearTimeout(timer); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong");
  return d;
}

// shrink photos in the browser so they stay small in the database
const compress = (file) => new Promise((res) => {
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 800 / img.width), c = document.createElement("canvas");
    c.width = img.width * s; c.height = img.height * s;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    res(c.toDataURL("image/jpeg", 0.7));
  };
  img.src = URL.createObjectURL(file);
});

function MapView({ reports, pos, setPos }) {
  const el = useRef(), map = useRef(), layer = useRef(), pin = useRef();
  useEffect(() => {
    const m = L.map(el.current).setView([26.8467, 80.9462], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e) => setPos({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => m.remove();
  }, []);
  useEffect(() => {
    layer.current.clearLayers();
    reports.filter((r) => r.lat != null).forEach((r) => {
      const d = document.createElement("div");
      d.textContent = r.type + ": " + r.road; // textContent keeps user text safe
      L.circleMarker([r.lat, r.lng], { radius: 9, color: "#fff", weight: 2, fillColor: COL[r.sev], fillOpacity: 1 }).bindPopup(d).addTo(layer.current);
    });
  }, [reports]);
  useEffect(() => {
    pin.current?.remove();
    if (pos) {
      pin.current = L.circleMarker([pos.lat, pos.lng], { radius: 13, color: "#5b3df5", weight: 4, fillColor: "#ff3d8b", fillOpacity: 0.9 }).addTo(map.current);
      map.current.setView([pos.lat, pos.lng], Math.max(map.current.getZoom(), 15));
    }
  }, [pos]);
  return <div ref={el} className="map" />;
}

export default function App() {
  const [lang, setLang] = useState(localStorage.getItem("lang") || "en");
  const t = (k) => T[lang][k] || T.en[k] || k;
  const [auth, setAuth] = useState(() => { try { return JSON.parse(localStorage.getItem("auth")); } catch { return null; } });
  const [reports, setReports] = useState([]);
  const [flt, setFlt] = useState("All");
  const [f, setF] = useState(EMPTY);
  const [pos, setPos] = useState(null);
  const [msg, setMsg] = useState({ text: "", ok: false });
  const [showAuth, setShowAuth] = useState(false);
  const [authErr, setAuthErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState({ mode: "login", name: "", email: "", password: "" });
  const token = auth?.token, isAdmin = auth?.user?.role === "admin";
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (text, ok = false) => { setMsg({ text, ok }); if (text) setToast({ text, ok }); };
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(null), 4500); return () => clearTimeout(id); } }, [toast]);
  const goTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const load = () => call("/api/reports").then(setReports).catch(() => say("Server is not reachable. Try again in a moment."));
  useEffect(() => { load(); }, []);
  useEffect(() => { localStorage.setItem("lang", lang); document.documentElement.lang = lang; }, [lang]);

  const doAuth = async (e) => {
    e.preventDefault();
    setAuthErr(""); setBusy(true);
    try {
      const d = await call("/api/auth/" + a.mode, { method: "POST", body: JSON.stringify(a) });
      localStorage.setItem("auth", JSON.stringify(d)); setAuth(d); setShowAuth(false); say("");
      setA({ ...a, password: "" });
    } catch (err) {
      setAuthErr(err instanceof TypeError ? "Server is waking up or not reachable. Wait a minute and try again." : err.message);
    }
    setBusy(false);
  };
  const logout = () => { localStorage.removeItem("auth"); setAuth(null); };
  const gps = () => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => say(t("gpsFail")))
    : say(t("gpsFail"));

  const submit = async () => {
    if (sending) return;
    if (!auth) { setShowAuth(true); goTop(); return say(t("needLogin")); }
    if (f.road.trim().length < 5 || f.desc.trim().length < 5) return say(t("fillAll"));
    setSending(true);
    const timer = setTimeout(() => setSlow(true), 4000);
    try {
      await call("/api/reports", { method: "POST", body: JSON.stringify({ ...f, ...pos }) }, token);
      setF(EMPTY); setPos(null); say(t("done"), true); await load();
      setTimeout(() => document.getElementById("reports")?.scrollIntoView({ behavior: "smooth" }), 150);
    } catch (e) { say(e.message); }
    clearTimeout(timer); setSlow(false); setSending(false);
  };
  const upvote = async (id) => {
    if (!auth) { setShowAuth(true); goTop(); return say(t("needLogin")); }
    try { await call(`/api/reports/${id}/upvote`, { method: "POST" }, token); load(); } catch (e) { say(e.message); }
  };
  const setStatus = async (id, status) => {
    try { await call(`/api/reports/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, token); load(); } catch (e) { say(e.message); }
  };

  const shown = useMemo(() => reports.filter((r) => flt === "All" || r.status === flt).sort((x, y) => y.votes - x.votes), [reports, flt]);
  const count = (s) => reports.filter((r) => r.status === s).length;
  const days = (d) => Math.floor((Date.now() - new Date(d)) / 864e5);

  return (
    <>
      <header className="hero">
        <div className="in">
          <div className="topbar">
            <div className="brand">🚧 SadakSaathi</div>
            <div className="topbtns">
              <button className="themebtn" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{lang === "en" ? "हिंदी" : "English"}</button>
              {auth
                ? <button className="themebtn" onClick={logout}>{t("logout")}</button>
                : <button className="themebtn" onClick={() => setShowAuth(!showAuth)}>{t("login")}</button>}
            </div>
          </div>
          {auth && <div className="hello">👋 {auth.user.name}{isAdmin ? " · " + t("staff") : ""}</div>}
          <h1>{t("title")}</h1>
          <p>{t("sub")}</p>
        </div>
        <div className="road" aria-hidden="true" />
      </header>

      <main className="wrap">
        {showAuth && !auth && (
          <section className="card authcard" aria-label={t("login")}>
            <div className="authhead">
              <h2>{a.mode === "login" ? t("login") : t("register")}</h2>
              <button type="button" className="closebtn" onClick={() => setShowAuth(false)} aria-label="Close">✕</button>
            </div>
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={a.mode === "login"} className={a.mode === "login" ? "on" : ""} onClick={() => { setA({ ...a, mode: "login" }); setAuthErr(""); }}>{t("login")}</button>
              <button type="button" role="tab" aria-selected={a.mode === "register"} className={a.mode === "register" ? "on" : ""} onClick={() => { setA({ ...a, mode: "register" }); setAuthErr(""); }}>{t("register")}</button>
            </div>
            <form onSubmit={doAuth} noValidate>
              {a.mode === "register" && <><label htmlFor="an">{t("name")}</label><input id="an" autoComplete="name" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></>}
              <label htmlFor="ae">{t("email")}</label>
              <input id="ae" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} />
              <label htmlFor="ap">{t("password")}</label>
              <input id="ap" type="password" autoComplete={a.mode === "login" ? "current-password" : "new-password"} value={a.password} onChange={(e) => setA({ ...a, password: e.target.value })} />
              {authErr && <div className="err" role="alert">{authErr}</div>}
              <button className="submit" type="submit" disabled={busy}>{busy ? "..." : t(a.mode)}</button>
            </form>
          </section>
        )}

        <section className="stats">
          <div className="stat s1"><b>{reports.length}</b>{t("total")}</div>
          <div className="stat s2"><b>{count("Reported")}</b>{t("waiting")}</div>
          <div className="stat s3"><b>{count("In progress")}</b>{t("progress")}</div>
          <div className="stat s4"><b>{count("Fixed")}</b>{t("fixed")}</div>
        </section>

        <div className="grid">
          <section className="card form">
            <h2>{t("report")}</h2>
            <label htmlFor="type">{t("type")}</label>
            <select id="type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {TYPES.map(([k, i]) => <option key={k} value={k}>{i} {t(k)}</option>)}
            </select>
            <label>{t("sev")}</label>
            <div className="sev">
              {["l", "m", "h"].map((k) => <button key={k} type="button" className={(f.sev === k ? "on " : "") + k} onClick={() => setF({ ...f, sev: k })}>{t(k)}</button>)}
            </div>
            <label htmlFor="road">{t("road")}</label>
            <input id="road" value={f.road} onChange={(e) => setF({ ...f, road: e.target.value })} />
            <label htmlFor="area">{t("area")}</label>
            <input id="area" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
            <label htmlFor="desc">{t("desc")}</label>
            <textarea id="desc" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
            <label htmlFor="photo">{t("photo")}</label>
            <input id="photo" type="file" accept="image/*" onChange={async (e) => e.target.files[0] && setF({ ...f, photo: await compress(e.target.files[0]) })} />
            {f.photo && <img className="thumb" src={f.photo} alt="Selected damage" />}
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="ghost" onClick={gps}>📍 {t("gps")}</button>
              <span className="meta">{pos ? `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` : t("mapHint")}</span>
            </div>
            <MapView reports={reports} pos={pos} setPos={setPos} />
            {msg.text && <div className={msg.ok ? "ok" : "err"} role="alert">{msg.text}</div>}
            <button className="submit" type="button" onClick={submit} disabled={sending} aria-busy={sending}>
              {sending ? <><span className="spin" aria-hidden="true" />{t("sending")}</> : t("submit")}
            </button>
            {slow && <div className="hint" role="status">{t("slow")}</div>}
          </section>

          <section id="reports">
            <div className="filters">
              {["All", ...STATUS].map((s) => <button key={s} className={"chip" + (flt === s ? " on" : "")} onClick={() => setFlt(s)}>{t(s)}</button>)}
              {isAdmin && <span className="staff">🛠️ {t("staff")}</span>}
            </div>
            {shown.length === 0 && <div className="card empty">{t("empty")}</div>}
            {shown.map((r) => (
              <article key={r._id} className={"card report " + r.sev}>
                <div className="ico">{(TYPES.find(([k]) => k === r.type) || [])[1]}</div>
                <div className="rb">
                  <h3>{t(r.type)}: {r.road}</h3>
                  <div className="tags">
                    <span className={"tag t-" + r.status.replace(" ", "")}>{t(r.status)}</span>
                    <span className={"tag t-" + r.sev}>{t(r.sev)}</span>
                  </div>
                  <div>{r.desc}</div>
                  {r.photo && <img className="thumb" src={r.photo} alt={r.type} loading="lazy" />}
                  <div className="meta">{r.area ? r.area + " – " : ""}{t("by")} {r.name}, {days(r.createdAt) < 1 ? "today" : days(r.createdAt) + "d"}</div>
                  <div className="act">
                    <button className="up" onClick={() => upvote(r._id)}>👍 {t("me2")} · {r.votes}</button>
                    {isAdmin && (
                      <select value={r.status} onChange={(e) => setStatus(r._id, e.target.value)} aria-label="Status">
                        {STATUS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      </main>
      {toast && <div className={"toast" + (toast.ok ? "" : " bad")} role="status">{toast.text}</div>}
    </>
  );
}
