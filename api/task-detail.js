const { WUYIN_DETAIL_ENDPOINT, requireEnv, sendJson, setCors } = require("./_utils");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const key = requireEnv("WUYIN_API_KEY");
    const requestUrl = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const id = requestUrl.searchParams.get("id");
    if (!id) {
      sendJson(res, 400, { error: "id is required" });
      return;
    }

    const endpoint = new URL(WUYIN_DETAIL_ENDPOINT);
    endpoint.searchParams.set("key", key);
    endpoint.searchParams.set("id", id);

    const upstream = await fetch(endpoint.toString(), {
      headers: {
        "Content-Type": "application/json",
        Authorization: key
      }
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
