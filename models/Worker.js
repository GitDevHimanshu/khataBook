const mongoose = require("mongoose");

/* Sub-document schemas */
const AdvPaySchema = new mongoose.Schema(
  {
    id:   { type: String, required: true },
    date: { type: String, required: true },
    amt:  { type: Number, required: true },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const RateSchema = new mongoose.Schema(
  {
    from: { type: String, required: true }, // "YYYY-MM-DD"
    rate: { type: Number, required: true },
  },
  { _id: false }
);

/* Worker schema
   att is stored as a free-form object keyed by "YYYY-MM-DD"
   e.g. { "2024-10-01": { s: "P", r: 500 } }
*/
const WorkerSchema = new mongoose.Schema(
  {
    _id:     { type: String, required: true },   // reuse the app's uid
    name:    { type: String, required: true, trim: true },
    rate:    { type: Number, default: 0 },       // current daily wage
    openAdv: { type: Number, default: 0 },       // opening advance balance
    openPay: { type: Number, default: 0 },       // opening payable balance
    att:     { type: mongoose.Schema.Types.Mixed, default: {} }, // attendance map
    adv:     { type: [AdvPaySchema], default: [] },
    pay:     { type: [AdvPaySchema], default: [] },
    rates:   { type: [RateSchema],   default: [] }, // salary history
  },
  { timestamps: true }
);

module.exports = mongoose.model("Worker", WorkerSchema);
