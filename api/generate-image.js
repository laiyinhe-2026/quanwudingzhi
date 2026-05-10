const { WUYIN_IMAGE_ENDPOINT, readJson, requireEnv, sendJson, setCors } = require("./_utils");

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
    const key = requireEnv("WUYIN_API_KEY");
    const body = await readJson(req);
    const payload = {
      prompt: String(body.prompt || "").trim(),
      size: body.size || "16:9",
      urls: Array.isArray(body.urls) ? body.urls.filter(Boolean) : []
    };

    if (!payload.prompt) {
      sendJson(res, 400, { error: "prompt is required" });
      return;
    }

    const endpoint = new URL(WUYIN_IMAGE_ENDPOINT);
    endpoint.searchParams.set("key", key);

    const upstream = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: key
      },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    sendJson(res, upstream.ok ? 200 : upstream.status, data);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
};
