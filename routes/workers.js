const express = require("express");
const router = express.Router();
const Worker = require("../models/Worker");

/* ── helper: normalize a worker doc for the frontend ── */
const fmt = w => {
  if (!w) return null;
  return {
    ...w,
    id: w._id,
    rate: +w.rate || 0,
    openAdv: +w.openAdv || 0,
    openPay: +w.openPay || 0,
    att: (w.att && typeof w.att === "object") ? w.att : {},
    adv: Array.isArray(w.adv) ? w.adv : [],
    pay: Array.isArray(w.pay) ? w.pay : [],
    rates: Array.isArray(w.rates) ? w.rates : [],
  };
};

/* ────────────────────────────────────────
   Workers CRUD
──────────────────────────────────────── */

// GET /api/workers — all workers
router.get("/", async (req, res) => {
  try {
    const workers = await Worker.find().lean();
    res.json(workers.map(fmt));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workers — create worker
router.post("/", async (req, res) => {
  try {
    const { id, name, rate, openAdv, openPay } = req.body;
    const worker = await Worker.create({
      _id: id,
      name,
      rate:    rate    || 0,
      openAdv: openAdv || 0,
      openPay: openPay || 0,
      att: {},
      adv: [],
      pay: [],
      rates: [],
    });
    res.status(201).json(fmt(worker.toObject()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/workers/:id — update name / opening balances
router.put("/:id", async (req, res) => {
  try {
    const { name, openAdv, openPay } = req.body;
    const worker = await Worker.findByIdAndUpdate(
      req.params.id,
      { name, openAdv: openAdv || 0, openPay: openPay || 0 },
      { new: true }
    ).lean();
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    res.json(fmt(worker));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workers/:id — delete worker
router.delete("/:id", async (req, res) => {
  try {
    await Worker.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────────────────────────────────────
   Attendance  /api/workers/:id/attendance/:date
──────────────────────────────────────── */

// PUT — mark or update a day  { s: "P"|"H"|"A", r: number }
router.put("/:id/attendance/:date", async (req, res) => {
  try {
    const { s, r } = req.body;
    const key = `att.${req.params.date}`;
    await Worker.findByIdAndUpdate(
      req.params.id,
      { $set: { [key]: { s, r } } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE — clear a day
router.delete("/:id/attendance/:date", async (req, res) => {
  try {
    const key = `att.${req.params.date}`;
    await Worker.findByIdAndUpdate(
      req.params.id,
      { $unset: { [key]: "" } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────────────────────────────────────
   Advances  /api/workers/:id/advances
──────────────────────────────────────── */

// POST — add advance  { id, date, amt, note }
router.post("/:id/advances", async (req, res) => {
  try {
    const { id, date, amt, note } = req.body;
    await Worker.findByIdAndUpdate(
      req.params.id,
      { $push: { adv: { id, date, amt, note: note || "" } } }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE — remove advance by its id
router.delete("/:id/advances/:advId", async (req, res) => {
  try {
    await Worker.findByIdAndUpdate(
      req.params.id,
      { $pull: { adv: { id: req.params.advId } } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────────────────────────────────────
   Payments  /api/workers/:id/payments
──────────────────────────────────────── */

// POST — add payment  { id, date, amt, note }
router.post("/:id/payments", async (req, res) => {
  try {
    const { id, date, amt, note } = req.body;
    await Worker.findByIdAndUpdate(
      req.params.id,
      { $push: { pay: { id, date, amt, note: note || "" } } }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE — remove payment by its id
router.delete("/:id/payments/:payId", async (req, res) => {
  try {
    await Worker.findByIdAndUpdate(
      req.params.id,
      { $pull: { pay: { id: req.params.payId } } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────────────────────────────────────
   Salary / rate history  /api/workers/:id/rates
──────────────────────────────────────── */

// POST — add or replace rate entry for a date  { from, rate }
router.post("/:id/rates", async (req, res) => {
  try {
    const { from, rate } = req.body;
    // Remove any existing entry for this from-date, then push new one
    await Worker.findByIdAndUpdate(req.params.id, { $pull: { rates: { from } } });
    await Worker.findByIdAndUpdate(req.params.id, { $push: { rates: { from, rate } } });
    // Keep worker.rate in sync with the latest (highest from-date) rate
    const worker = await Worker.findById(req.params.id).lean();
    const sorted = [...worker.rates].sort((a, b) => a.from.localeCompare(b.from));
    await Worker.findByIdAndUpdate(req.params.id, { rate: sorted[sorted.length - 1].rate });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE — remove a rate entry by its from-date
router.delete("/:id/rates/:from", async (req, res) => {
  try {
    await Worker.findByIdAndUpdate(
      req.params.id,
      { $pull: { rates: { from: req.params.from } } }
    );
    // Re-sync worker.rate to latest remaining entry
    const worker = await Worker.findById(req.params.id).lean();
    if (worker.rates && worker.rates.length > 0) {
      const sorted = [...worker.rates].sort((a, b) => a.from.localeCompare(b.from));
      await Worker.findByIdAndUpdate(req.params.id, { rate: sorted[sorted.length - 1].rate });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
