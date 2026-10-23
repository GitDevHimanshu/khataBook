const express = require("express");
const router  = express.Router();
const Bill    = require("../models/Bill");

const fmt = b => ({ ...b, id: b._id });

// GET /api/bills — all bills
router.get("/", async (req, res) => {
  try {
    const bills = await Bill.find().lean();
    res.json(bills.map(fmt));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bills — create bill  { id, who, amt, due }
router.post("/", async (req, res) => {
  try {
    const { id, who, amt, due } = req.body;
    const bill = await Bill.create({ _id: id, who, amt, due, paid: false });
    res.status(201).json(fmt(bill.toObject()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bills/:id/toggle — flip paid flag
router.put("/:id/toggle", async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    bill.paid = !bill.paid;
    await bill.save();
    res.json({ ok: true, paid: bill.paid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bills/:id — delete bill
router.delete("/:id", async (req, res) => {
  try {
    await Bill.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
