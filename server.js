require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");

// Cloudinary uploader
const uploadFile = require("./config/upload");

// Models
const User = require("./models/User");
const Post = require("./models/Post");

const app = express();

// -----------------------------------
// SECURITY
// -----------------------------------
app.use(helmet({ crossOriginResourcePolicy: false }));

// -----------------------------------
// CORS (Render compatible)
// -----------------------------------
app.use(cors({
    origin: [
        "http://localhost:1998",
        "http://127.0.0.1:1998",
        "https://advvoc.onrender.com"
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// -----------------------------------
// MONGO CONNECT
// -----------------------------------
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log("MongoDB error:", err));

// -----------------------------------
// SESSION CONFIG
// -----------------------------------
const isProduction = process.env.NODE_ENV === "production";

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
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 14 * 24 * 60 * 60 * 1000
    }
}));

// -----------------------------------
// SIGNUP
// -----------------------------------
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
            email
        });

        req.session.user = { username: user.username, _id: user._id };

        res.json({ success: true, user: { username: user.username } });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Signup failed" });
    }
});

// -----------------------------------
// LOGIN
// -----------------------------------
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user)
            return res.json({ success: false, message: "Invalid username" });

        const match = await bcrypt.compare(password, user.password);
        if (!match)
            return res.json({ success: false, message: "Invalid password" });

        req.session.user = { username: user.username, _id: user._id };

        res.json({ success: true, user: { username: user.username } });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Login failed" });
    }
});

// -----------------------------------
// UPLOAD POST (Cloudinary + MongoDB)
// -----------------------------------
app.post("/upload", uploadFile.single("media"), async (req, res) => {
    try {
        if (!req.session.user)
            return res.json({ success: false, message: "Not logged in" });

        if (!req.file)
            return res.json({ success: false, message: "No file uploaded" });

        const type = req.file.mimetype.startsWith("video") ? "video" : "image";

        const post = await Post.create({
            user: req.session.user.username,
            caption: req.body.caption || "",
            type,
            url: req.file.path,
            likes: 0,
            comments: []
        });

        res.json({
            success: true,
            message: "Upload successful",
            post
        });

    } catch (error) {
        console.error("UPLOAD ERROR:", error);
        res.status(500).json({ success: false, message: "Upload failed" });
    }
});

// -----------------------------------
// GET ALL POSTS
// -----------------------------------
app.get("/images", async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        res.json(posts);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// -----------------------------------
// LIKE POST
// -----------------------------------
app.post("/like/:id", async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        post.likes++;
        await post.save();

        res.json({ success: true, likes: post.likes });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// -----------------------------------
// COMMENT ON POST
// -----------------------------------
app.post("/comment/:id", async (req, res) => {
    try {
        const { text } = req.body;

        if (!req.session.user)
            return res.json({ success: false, message: "Not logged in" });

        const post = await Post.findById(req.params.id);

        post.comments.push({
            user: req.session.user.username,
            text
        });

        await post.save();

        res.json({ success: true, comments: post.comments });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
// -----------------------------------
// AUTH CHECK
// -----------------------------------
app.get("/auth-check", (req, res) => {
    if (req.session.user) {
        return res.json({
            loggedIn: true,
            username: req.session.user.username
        });
    }
    res.json({ loggedIn: false });
});

// -----------------------------------
const PORT = process.env.PORT || 1998;
app.listen(PORT, () => console.log("Server running on port " + PORT));
