// server.js
require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
const upload = require("./config/upload"); // multer-storage-cloudinary configured
const path = require("path");

const app = express();

/* -----------------------
   Basic middleware
   ----------------------- */
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* -----------------------
   CORS (allow credentials)
   ----------------------- */
app.use(cors({
  origin: [
    "https://advvoc.onrender.com",
    "https://advvoc-1.onrender.com",
    // add your dev origins if needed:
    "http://localhost:1998",
    "http://127.0.0.1:1998"
  ],
  credentials: true
}));

/* -----------------------
   MongoDB
   ----------------------- */
if (!process.env.MONGO_URL) {
  console.error("MONGO_URL is not set in env - aborting.");
  process.exit(1);
}
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connected"))
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

/* -----------------------
   Models
   ----------------------- */
const { Schema } = mongoose;

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  email: String
}, { timestamps: true });

const PostSchema = new Schema({
  user: String,                 // uploader username
  caption: { type: String, default: "" },
  type: String,                 // "image" or "video"
  url: String,                  // Cloudinary URL
  likes: { type: Number, default: 0 },
  comments: { type: [{ user: String, text: String }], default: [] },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Post = mongoose.model("Post", PostSchema);

/* -----------------------
   Trust proxy for Render (secure cookies)
   ----------------------- */
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/* -----------------------
   Sessions
   ----------------------- */
if (!process.env.SESSION_SECRET) {
  console.warn("SESSION_SECRET not set — using default (not recommended for production).");
}

app.use(session({
  name: "sid",
  secret: process.env.SESSION_SECRET || "dev_secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URL,
    collectionName: "sessions",
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

/* -----------------------
   Routes - Auth
   ----------------------- */

// Return login state and username (used by frontend)
app.get("/auth-check", (req, res) => {
  if (req.session.user) {
    return res.json({ loggedIn: true, username: req.session.user.username });
  }
  res.json({ loggedIn: false, username: null });
});

// Signup
app.post("/signup", async (req, res) => {
  try {
    const { username, password, phone, email } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Missing fields" });

    const exists = await User.findOne({ username });
    if (exists) return res.json({ success: false, message: "Username already taken" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashed, phone, email });

    // Save username and id to session so frontend can greet the user
    req.session.user = { username: user.username, _id: user._id };

    res.json({ success: true, user: { username: user.username } });
  } catch (err) {
    console.error("Signup error:", err);
    res.json({ success: false, message: "Signup failed" });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Missing fields" });

    const user = await User.findOne({ username });
    if (!user) return res.json({ success: false, message: "Invalid username" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: "Invalid password" });

    req.session.user = { username: user.username, _id: user._id };

    res.json({ success: true, user: { username: user.username } });
  } catch (err) {
    console.error("Login error:", err);
    res.json({ success: false, message: "Login failed" });
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout error:", err);
      return res.json({ success: false });
    }
    res.clearCookie("sid", { path: "/" });
    res.json({ success: true });
  });
});

/* -----------------------
   Routes - Posts / Upload
   ----------------------- */

// Upload expects form field name "media" and optional "caption"
app.post("/upload", upload.single("media"), async (req, res) => {
  try {
    // require login
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Not logged in" });
    }

    if (!req.file) {
      console.error("Upload: no file in req.file");
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Cloudinary storage returns secure_url or url on req.file
    const fileUrl = req.file.secure_url || req.file.url || (req.file.path || null);
    const fileType = (req.file.mimetype || "").startsWith("video") ? "video" : "image";

    if (!fileUrl) {
      console.error("Upload: missing file URL from Cloudinary", req.file);
      return res.status(500).json({ success: false, message: "Upload failed (no url)" });
    }

    const caption = req.body.caption ? String(req.body.caption).trim() : "";

    const post = await Post.create({
      user: req.session.user.username,
      caption,
      type: fileType,
      url: fileUrl
    });

    return res.json({ success: true, post });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all posts (sorted newest first)
app.get("/images", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error("Get images error:", err);
    res.json([]);
  }
});

// Like post
app.post("/like/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.json({ success: false, message: "Post not found" });
    post.likes = (post.likes || 0) + 1;
    await post.save();
    res.json({ success: true, likes: post.likes });
  } catch (err) {
    console.error("Like error:", err);
    res.json({ success: false });
  }
});

// Comment on post
app.post("/comment/:id", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ success: false, message: "Not logged in" });

    const { text } = req.body;
    if (!text || !String(text).trim()) return res.json({ success: false, message: "Empty comment" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.json({ success: false, message: "Post not found" });

    post.comments.push({ user: req.session.user.username, text: String(text).trim() });
    await post.save();
    res.json({ success: true, comments: post.comments });
  } catch (err) {
    console.error("Comment error:", err);
    res.json({ success: false });
  }
});

/* -----------------------
   Start server
   ----------------------- */
const PORT = process.env.PORT || 1998;
app.listen(PORT, () => console.log("Server running on port " + PORT));
