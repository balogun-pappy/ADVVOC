const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({
  user: String,                 // Username of uploader
  caption: String,
  type: String,                 // "image" or "video"
  url: String,                  // Cloudinary URL
  likes: { type: Number, default: 0 },
  comments: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Post", PostSchema);
