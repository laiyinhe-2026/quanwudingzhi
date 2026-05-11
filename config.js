// Same-origin deployment is used on the Alibaba Cloud server.
// Keep the Vercel fallback only for GitHub Pages previews.
window.ZHIHUI_API_BASE = location.hostname.endsWith("github.io")
  ? "https://quanwudingzhi.vercel.app"
  : "";
