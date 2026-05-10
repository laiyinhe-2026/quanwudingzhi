const fs = require("fs");
const OSS = require("ali-oss");
const formidableModule = require("formidable");
const { requireEnv, sendJson, setCors } = require("./_utils");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const createForm = formidableModule.formidable || formidableModule.default || formidableModule;
    const form = createForm({
      maxFileSize: 12 * 1024 * 1024,
      multiples: false
    });
    const [, files] = await form.parse(req);
    const fileValue = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!fileValue) {
      sendJson(res, 400, { error: "file is required" });
      return;
    }

    const client = new OSS({
      region: requireEnv("ALI_OSS_REGION"),
      accessKeyId: requireEnv("ALI_OSS_ACCESS_KEY_ID"),
      accessKeySecret: requireEnv("ALI_OSS_ACCESS_KEY_SECRET"),
      bucket: requireEnv("ALI_OSS_BUCKET")
    });

    const originalName = fileValue.originalFilename || "upload.png";
    const ext = originalName.includes(".") ? originalName.slice(originalName.lastIndexOf(".")) : ".png";
    const objectName = `zhihui/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const result = await client.put(objectName, fs.createReadStream(fileValue.filepath));
    const publicBase = process.env.ALI_OSS_PUBLIC_BASE_URL;
    const url = publicBase ? `${publicBase.replace(/\/$/, "")}/${objectName}` : result.url;
    sendJson(res, 200, { url, objectName });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
