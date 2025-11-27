const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "uploads";

    return {
      folder,
  allowed_formats: ["jpg", "png", "jpeg", "mp4", "mov"],
      resource_type: "auto",
    };
  },
});

module.exports = multer({ storage });
