// models/BusinessPost.js
const mongoose = require("mongoose");

const BusinessPostSchema = new mongoose.Schema({
  user: { type: String, required: true }, // username
  url: { type: String, required: true }, // Cloudinary URL
  caption: { type: String, default: "" },
  type: { type: String, enum: ["image", "video"], default: "image" },
  likes: { type: Number, default: 0 },
  comments: { type: [{ user: String, text: String, createdAt: Date }], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("BusinessPost", BusinessPostSchema);
