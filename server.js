const http = require("http");
const fs = require("fs");
const path = require("path");

const generateImage = require("./api/generate-image");
const taskDetail = require("./api/task-detail");
const upload = require("./api/upload");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const routes = {
  "/api/generate-image": generateImage,
  "/api/task-detail": taskDetail,
  "/api/upload": upload
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8"
};

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}.git${path.sep}`) || filePath.includes(`${path.sep}api${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const handler = routes[url.pathname];
  if (handler) {
    handler(req, res);
    return;
  }
  sendStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`智绘全屋服务已启动：http://0.0.0.0:${PORT}`);
});
