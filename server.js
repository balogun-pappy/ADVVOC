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
// SECURITY
// --------------------
app.use(helmet({ crossOriginResourcePolicy: false }));

// --------------------
// CORS FIX FOR RENDER
// --------------------
app.use(cors({
    origin: [
        "http://localhost:1998",
        "http://127.0.0.1:1998",
        "http://localhost:3000",
        "https://advvoc.onrender.com"
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
    .catch(err => console.error("MongoDB error:", err));


// --------------------
// SESSION FIXED FOR RENDER
// --------------------
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
        secure: isProduction,  // <--- FIXED FOR HTTPS
        sameSite: isProduction ? "none" : "lax",
        maxAge: 14 * 24 * 60 * 60 * 1000
    }
}));

// --------------------
// SIGNUP
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
            email
        });

        req.session.user = { username: user.username, _id: user._id };

        res.json({ success: true, user: { username: user.username } });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Signup failed" });
    }
});

// --------------------
// LOGIN
// --------------------
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

// --------------------
// UPLOAD FIXED
// --------------------
app.post("/upload", upload.single("media"), async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: "Not logged in" });
        }

        if (!req.file) {
            return res.json({ success: false, message: "No file uploaded" });
        }

        const url = req.file.path;

        const post = await Post.create({
            user: req.session.user.username,
            url,
            type: req.file.mimetype.startsWith("video") ? "video" : "image",
            createdAt: new Date()
        });

        res.json({ success: true, post });
    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.json({ success: false });
    }
});

// --------------------
// START
// --------------------
const PORT = process.env.PORT || 1998;
app.listen(PORT, () => console.log("Server running on port " + PORT));
