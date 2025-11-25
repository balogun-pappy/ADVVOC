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

// --------------------
// SECURITY + PARSING
// --------------------
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: [
    "https://advvoc.onrender.com",   // backend URL
    "https://advvoc-frontend.onrender.com", // if you have a frontend deployment
    "http://localhost:5500"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// --------------------
// MONGO CONNECT
// --------------------
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connected"))
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });

// --------------------
// SESSIONS
// --------------------
app.use(session({
  name: "sid",
  secret: process.env.SESSION_SECRET || "dev_secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URL,
    collectionName: "sessions",
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    httpOnly: true,
    secure: true,          // Render uses HTTPS
    sameSite: "none",      // REQUIRED for cross-origin cookies
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

// --------------------
// AUTH ROUTES
// --------------------
app.post("/signup", async (req, res) => {
  try {
    const { username, password, phone, email } = req.body;

    if (!username || !password)
      return res.json({ success: false, message: "Missing fields" });

    const exists = await User.findOne({ username });
    if (exists)
      return res.json({ success: false, message: "Username already taken" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashed,
      phone,
      email,
      createdAt: new Date()
    });

    req.session.user = {
      username: user.username,
      _id: user._id
    };

    res.json({
      success: true,
      user: { username: user.username, profilePic: user.profilePic }
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Signup failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.json({ success: false, message: "Missing fields" });

    const user = await User.findOne({ username });
    if (!user)
      return res.json({ success: false, message: "Invalid username" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.json({ success: false, message: "Invalid password" });

    req.session.user = {
      username: user.username,
      _id: user._id
    };

    res.json({
      success: true,
      user: { username: user.username, profilePic: user.profilePic }
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Login failed" });
  }
});

app.get("/auth-check", (req, res) => {
  if (!req.session.user)
    return res.json({ loggedIn: false });

  res.json({
    loggedIn: true,
    username: req.session.user.username
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.json({ success: false });
    res.clearCookie("sid");
    res.json({ success: true });
  });
});

// --------------------
// UPLOADS
// --------------------
app.post("/upload", upload.single("media"), async (req, res) => {
  try {
    if (!req.session.user)
      return res.json({ success: false, message: "Not logged in" });

    if (!req.file)
      return res.json({ success: false, message: "No file uploaded" });

    const fileUrl = req.file.path;
    const type = req.file.mimetype.startsWith("video") ? "video" : "image";

    const post = await Post.create({
      user: req.session.user.username,
      url: fileUrl,
      caption: req.body.caption || "",
      type,
      createdAt: new Date()
    });

    res.json({ success: true, post });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Upload failed" });
  }
});

// --------------------
// GET POSTS
// --------------------
app.get("/images", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch {
    res.json({ success: false, message: "Could not load images" });
  }
});

// --------------------
// START SERVER
// --------------------
const PORT = process.env.PORT || 1998;
app.listen(PORT, () => console.log("Server running on port " + PORT));
