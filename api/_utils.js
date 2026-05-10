const WUYIN_DETAIL_ENDPOINT = "https://api.wuyinkeji.com/api/async/detail";
const WUYIN_IMAGE_ENDPOINT = "https://api.wuyinkeji.com/api/async/image_gpt";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(res, status, payload) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Missing environment variable: ${name}`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

module.exports = {
  WUYIN_DETAIL_ENDPOINT,
  WUYIN_IMAGE_ENDPOINT,
  readJson,
  requireEnv,
  sendJson,
  setCors
};
