const mongoose = require("mongoose");

const DMSchema = new mongoose.Schema({
  from: String,
  to: String,
  message: String,
  timestamp: { type: Number, default: Date.now }
});

module.exports = mongoose.model("DM", DMSchema);
