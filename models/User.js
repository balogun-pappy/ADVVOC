const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: String,
  email: String,
  profilePic: String
});

module.exports = mongoose.model("User", UserSchema);
