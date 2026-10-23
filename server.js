require("dotenv").config();
const express = require("express");
const path    = require("path");
const connect = require("./db/connect");
const Worker  = require("./models/Worker");
const Bill    = require("./models/Bill");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* ── Serve the frontend (from public folder) ── */
app.use(express.static(path.join(__dirname, "public")));

/* ── Health check endpoint for keep-alive / cron ── */
app.get("/health", (req, res) => res.status(200).send("OK"));

/* ── API routes ── */
app.use("/api/workers", require("./routes/workers"));
app.use("/api/bills",   require("./routes/bills"));

/* ────────────────────────────────────────
   GET /api/backup
   Returns the full DB as a JSON object in
   the same shape as the old localStorage data.
──────────────────────────────────────── */
app.get("/api/backup", async (req, res) => {
  try {
    const [workers, bill] = await Promise.all([
      Worker.find().lean(),
      Bill.find().lean(),
    ]);
    res.json({
      workers: workers.map(w => ({ ...w, id: w._id })),
      cur: null,
      bill:    bill.map(b => ({ ...b, id: b._id })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────────────────────────────────────
   POST /api/restore
   Replaces the entire DB with a backup file.
──────────────────────────────────────── */
app.post("/api/restore", async (req, res) => {
  try {
    const { workers, bill } = req.body;
    if (!Array.isArray(workers))
      return res.status(400).json({ error: "Invalid backup: workers must be an array" });

    await Worker.deleteMany({});
    await Bill.deleteMany({});

    if (workers.length) {
      await Worker.insertMany(
        workers.map(w => ({
          _id:     w.id || w._id,
          name:    w.name,
          rate:    w.rate    || 0,
          openAdv: w.openAdv || 0,
          openPay: w.openPay || 0,
          att:     w.att     || {},
          adv:     w.adv     || [],
          pay:     w.pay     || [],
          rates:   w.rates   || [],
        }))
      );
    }

    if (Array.isArray(bill) && bill.length) {
      await Bill.insertMany(
        bill.map(b => ({
          _id:  b.id || b._id,
          who:  b.who,
          amt:  b.amt,
          due:  b.due,
          paid: b.paid || false,
        }))
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────────────────────────────────────
   DELETE /api/data
   Wipes all workers and bills (used by "Clear all data").
──────────────────────────────────────── */
app.delete("/api/data", async (req, res) => {
  try {
    await Promise.all([Worker.deleteMany({}), Bill.deleteMany({})]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Connect to MongoDB then start listening ── */
connect()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`🚀 Khata server running → http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
