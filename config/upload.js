const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: "uploads",
    resource_type: "auto",   // 🔥 FIX: allows images & videos
    allowed_formats: ["jpg", "jpeg", "png", "mp4", "mov"]
  }),
});

module.exports = multer({ storage });
