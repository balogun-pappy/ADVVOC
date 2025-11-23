// server.js


require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");

const upload = require("./config/upload");
const cloudinary = require("./config/cloudinary");

const User = require("./models/User");
const Post = require("./models/Post");
const BusinessPost = require("./models/BusinessPost");
const DM = require("./models/DM");

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// --------------------
// MongoDB connect
// --------------------
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    });


// --------------------
// Session (store sessions in MongoDB so Render restarts don't kill sessions)
// --------------------
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
    secure: process.env.NODE_ENV === "production", // true on Render (https)
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

// --------------------
// Auth: Signup / Login / Auth-check / Logout
// --------------------
app.post("/signup", async (req, res) => {
  try {
    const { username, password, phone, email } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Missing fields" });

    const exists = await User.findOne({ username });
    if (exists) return res.json({ success: false, message: "Username exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashed, phone, email });
    req.session.user = { username: user.username, _id: user._id };
    res.json({ success: true, user: { username: user.username, profilePic: user.profilePic } });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Signup failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Missing fields" });

    const user = await User.findOne({ username });
    if (!user) return res.json({ success: false, message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: "Invalid credentials" });

    req.session.user = { username: user.username, _id: user._id };
    res.json({ success: true, user: { username: user.username, profilePic: user.profilePic } });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Login failed" });
  }
});

app.get("/auth-check", (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  return res.json({ loggedIn: true, username: req.session.user.username });
});

app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.json({ success: false });
    res.clearCookie("sid");
    res.json({ success: true });
  });
});

// --------------------
// Upload routes (Cloudinary + MongoDB)
// --------------------
app.post("/upload", upload.single("media"), async (req, res) => {
  try {
    if (!req.session.user) return res.json({ success: false, message: "Not logged in" });
    if (!req.file) return res.json({ success: false, message: "No file uploaded" });

    const mediaUrl = req.file.path;
    const type = req.file.mimetype.startsWith("video") ? "video" : "image";
    const caption = req.body.caption || "";

    const post = await Post.create({
      user: req.session.user.username,
      url: mediaUrl,
      caption,
      type
    });

    res.json({ success: true, post });
  } catch (err) {
    console.error("Upload error:", err);
    res.json({ success: false, message: "Upload failed" });
  }
});

app.post("/business/upload", upload.single("media"), async (req, res) => {
  try {
    if (!req.session.user) return res.json({ success: false, message: "Not logged in" });
    if (!req.file) return res.json({ success: false, message: "No file uploaded" });

    const mediaUrl = req.file.path;
    const type = req.file.mimetype.startsWith("video") ? "video" : "image";
    const caption = req.body.caption || "";

    const post = await BusinessPost.create({
      user: req.session.user.username,
      url: mediaUrl,
      caption,
      type
    });

    res.json({ success: true, post });
  } catch (err) {
    console.error("Business upload error:", err);
    res.json({ success: false, message: "Business upload failed" });
  }
});

// --------------------
// Images / Business images
// --------------------
app.get("/images", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not load images" });
  }
});

app.get("/business/images", async (req, res) => {
  try {
    const posts = await BusinessPost.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not load business images" });
  }
});

// --------------------
// Profile pic upload & get
// --------------------
app.post("/profile-pic", upload.single("profilePic"), async (req, res) => {
  try {
    if (!req.session.user) return res.json({ success: false, message: "Not logged in" });
    if (!req.file) return res.json({ success: false, message: "No file uploaded" });

    const profileUrl = req.file.path;
    await User.updateOne({ username: req.session.user.username }, { profilePic: profileUrl });
    res.json({ success: true, profilePic: profileUrl });
  } catch (err) {
    console.error("Profile upload error:", err);
    res.json({ success: false, message: "Profile upload failed" });
  }
});

app.get("/profile/:username", async (req, res) => {
  try {
    const u = await User.findOne({ username: req.params.username });
    if (!u) return res.json({ success: false, message: "User not found" });
    res.json({ username: u.username, profilePic: u.profilePic || null });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not fetch profile" });
  }
});

// --------------------
// Likes
// --------------------
app.post("/like/:postId", async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.likes = (post.likes || 0) + 1;
    await post.save();
    res.json({ success: true, likes: post.likes });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not like" });
  }
});

app.post("/business/like/:postId", async (req, res) => {
  try {
    const post = await BusinessPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.likes = (post.likes || 0) + 1;
    await post.save();
    res.json({ success: true, likes: post.likes });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not like" });
  }
});

// --------------------
// Comments
// --------------------
app.get("/comments/:postId", async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json([]);
    res.json(post.comments || []);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.post("/comments/:postId", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ success: false, message: "Not logged in" });
    const { text } = req.body;
    if (!text || !text.trim()) return res.json({ success: false, message: "Empty comment" });

    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.comments.push({ user: req.session.user.username, text, createdAt: new Date() });
    await post.save();
    res.json({ success: true, comments: post.comments });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not add comment" });
  }
});

app.get("/business/comments/:postId", async (req, res) => {
  try {
    const post = await BusinessPost.findById(req.params.postId);
    if (!post) return res.status(404).json([]);
    res.json(post.comments || []);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.post("/business/comments/:postId", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ success: false, message: "Not logged in" });

    const { text } = req.body;
    if (!text || !text.trim()) return res.json({ success: false, message: "Empty comment" });

    const post = await BusinessPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.comments.push({ user: req.session.user.username, text, createdAt: new Date() });
    await post.save();
    res.json({ success: true, comments: post.comments });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not add comment" });
  }
});

// --------------------
// Direct Messages
// --------------------
app.get("/dm/:user1/:user2", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ success: false, message: "Not logged in" });
    const messages = await DM.find({
      $or: [
        { from: req.params.user1, to: req.params.user2 },
        { from: req.params.user2, to: req.params.user1 }
      ]
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not fetch DMs" });
  }
});

app.post("/dm/:user1/:user2", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ success: false, message: "Not logged in" });
    const { message } = req.body;
    if (!message || !message.trim()) return res.json({ success: false, message: "Message empty" });

    await DM.create({
      from: req.session.user.username,
      to: req.params.user2,
      message,
      timestamp: Date.now()
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Could not send DM" });
  }
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 1998;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
