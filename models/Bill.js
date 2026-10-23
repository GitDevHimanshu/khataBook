const mongoose = require("mongoose");

const BillSchema = new mongoose.Schema(
  {
    _id:  { type: String, required: true },   // reuse the app's uid
    who:  { type: String, required: true, trim: true },
    amt:  { type: Number, required: true },
    due:  { type: String, required: true },   // "YYYY-MM-DD"
    paid: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bill", BillSchema);
