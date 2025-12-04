const express = require("express");
const fs = require("fs");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("./config/upload");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");

dotenv.config();

const app = express();

// -----------------------------------
// DATABASE CONNECTION
// -----------------------------------
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB error:", err));

// -----------------------------------
// SCHEMAS
// -----------------------------------
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const imageSchema = new mongoose.Schema({
  url: String,
  type: String,
  likes: { type: Number, default: 0 },
  comments: { type: [String], default: [] },
});

const User = mongoose.model("User", userSchema);
const Image = mongoose.model("Image", imageSchema);

// -----------------------------------
// MIDDLEWARE
// -----------------------------------
app.use(
  cors({
    origin: [
      "http://localhost:5500",
      "https://advvoc.onrender.com",
      "https://advvoc-1.onrender.com",
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("public"));

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// -----------------------------------
// SESSION CONFIG
// -----------------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL,
      collectionName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
    name: "sid",
  })
);

// -----------------------------------
// AUTH CHECK
// -----------------------------------
app.get("/auth-check", (req, res) => {
  res.json({ loggedIn: !!req.session.user });
});

// -----------------------------------
// SIGNUP
// -----------------------------------
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username?.trim() || !password?.trim()) {
    return res.json({ success: false, message: "Invalid input" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = new User({
    username,
    password: hashedPassword,
  });

  await newUser.save();

  res.json({ success: true });
});

// -----------------------------------
// LOGIN
// -----------------------------------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.json({ success: false });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ success: false });

  req.session.user = user._id;
  res.json({ success: true });
});

// -----------------------------------
// LOGOUT
// -----------------------------------
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.json({ success: false });
    }

    res.clearCookie("sid", {
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    res.json({ success: true });
  });
});

// -----------------------------------
// UPLOAD IMAGE/VIDEO
// -----------------------------------
app.post("/upload", multer.single("file"), async (req, res) => {
  if (!req.file || !req.file.path) {
    console.log("Upload failed: No file received");
    return res.json({ success: false, message: "Upload failed" });
  }

  const newImage = new Image({
    url: req.file.path,
    type: req.file.mimetype,
  });

  await newImage.save();

  console.log("Upload success:", req.file.path);

  res.json({
    success: true,
    fileUrl: req.file.path,
    fileType: req.file.mimetype,
  });
});

// -----------------------------------
// GET IMAGES
// -----------------------------------
app.get("/images", async (req, res) => {
  const images = await Image.find();
  res.json(images);
});

// -----------------------------------
// LIKE
// -----------------------------------
app.post("/like/:id", async (req, res) => {
  await Image.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
  res.json({ success: true });
});

// -----------------------------------
// COMMENT
// -----------------------------------
app.post("/comment/:id", async (req, res) => {
  const { comment } = req.body;

  await Image.findByIdAndUpdate(req.params.id, {
    $push: { comments: comment },
  });

  res.json({ success: true });
});

// -----------------------------------
// START SERVER
// -----------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
