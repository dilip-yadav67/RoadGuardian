import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json({ limit: "2mb" }));

const User = mongoose.model("User", new mongoose.Schema({
  name: String, email: { type: String, unique: true }, hash: String, role: { type: String, default: "citizen" },
}));
const Report = mongoose.model("Report", new mongoose.Schema({
  type: String, sev: String, road: String, area: String, desc: String, photo: String,
  lat: Number, lng: Number, status: { type: String, default: "Reported" },
  votes: { type: [String], default: [] }, user: String, name: String,
}, { timestamps: true }));

const TYPES = ["Pothole", "Crack", "Waterlogging", "Open manhole", "Broken divider", "Other"];
const STATUS = ["Reported", "In progress", "Fixed"];
const h = (fn) => (req, res, next) => fn(req, res, next).catch(() => res.status(500).json({ error: "Server error" }));
const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: "7d" });
const auth = (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || "").slice(7), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Please log in again" }); }
};

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.post("/api/auth/register", h(async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 60);
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !email.includes("@") || password.length < 6)
    return res.status(400).json({ error: "Name, valid email and a 6+ character password are required" });
  if (await User.findOne({ email })) return res.status(409).json({ error: "This email is already registered" });
  const role = email === String(process.env.ADMIN_EMAIL || "").toLowerCase() ? "admin" : "citizen";
  const u = await User.create({ name, email, hash: await bcrypt.hash(password, 10), role });
  res.json({ token: sign(u), user: { name: u.name, role: u.role } });
}));

app.post("/api/auth/login", h(async (req, res) => {
  const u = await User.findOne({ email: String(req.body.email || "").trim().toLowerCase() });
  if (!u || !(await bcrypt.compare(String(req.body.password || ""), u.hash)))
    return res.status(401).json({ error: "Wrong email or password" });
  res.json({ token: sign(u), user: { name: u.name, role: u.role } });
}));

app.get("/api/reports", h(async (_, res) => {
  const list = await Report.find().sort({ createdAt: -1 }).limit(200).lean();
  res.json(list.map((r) => ({ ...r, votes: r.votes.length })));
}));

app.post("/api/reports", auth, h(async (req, res) => {
  const b = req.body;
  const road = String(b.road || "").trim().slice(0, 150), desc = String(b.desc || "").trim().slice(0, 500);
  if (road.length < 5 || desc.length < 5) return res.status(400).json({ error: "Road and description are required" });
  if (!TYPES.includes(b.type) || !["l", "m", "h"].includes(b.sev)) return res.status(400).json({ error: "Invalid type or severity" });
  const photo = typeof b.photo === "string" && b.photo.startsWith("data:image/") && b.photo.length < 1.5e6 ? b.photo : "";
  const lat = Number.isFinite(b.lat) ? b.lat : undefined, lng = Number.isFinite(b.lng) ? b.lng : undefined;
  const r = await Report.create({ type: b.type, sev: b.sev, road, desc, area: String(b.area || "").slice(0, 80), photo, lat, lng,
    user: req.user.id, name: req.user.name, votes: [req.user.id] });
  res.json(r);
}));

app.post("/api/reports/:id/upvote", auth, h(async (req, res) => {
  await Report.updateOne({ _id: req.params.id }, { $addToSet: { votes: req.user.id } });
  res.json({ ok: true });
}));

app.patch("/api/reports/:id/status", auth, h(async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Staff only" });
  if (!STATUS.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
  await Report.updateOne({ _id: req.params.id }, { status: req.body.status });
  res.json({ ok: true });
}));

mongoose.connect(process.env.MONGO_URI).then(() => {
  app.listen(process.env.PORT || 5000, () => console.log("API running"));
}).catch((e) => { console.error("MongoDB connection failed", e.message); process.exit(1); });
