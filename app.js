const STORAGE_KEY = "zhihui_quanwu_state_v3";
const API_BASE = (window.ZHIHUI_API_BASE || "").replace(/\/$/, "");

let state = loadState();
let quickTarget = "floorplan.html";
let floorplanReference = "";
let videoImages = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadState() {
  try {
    return {
      points: 1000,
      tier: "normal",
      cycle: null,
      assets: [],
      pendingVideoImages: [],
      ...JSON.parse(localStorage.getItem(STORAGE_KEY))
    };
  } catch {
    return { points: 1000, tier: "normal", cycle: null, assets: [], pendingVideoImages: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("show"), 2300);
}

function updatePoints() {
  $$("[data-points]").forEach((node) => {
    node.textContent = Math.round(state.points).toLocaleString("zh-CN");
  });
  $$("[data-reward-points]").forEach((node) => {
    node.textContent = "88";
  });
}

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderPreviewCard(url, label) {
  return `
    <article class="preview-card">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}">
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function renderResultCard(url, title, prompt = "", type = "image") {
  const safeUrl = escapeHtml(url);
  const safeTitle = escapeHtml(title);
  const safePrompt = escapeHtml(prompt);
  const typeText = type === "video" ? "视频" : "图片";
  return `
    <article class="result-card is-previewable" data-preview-url="${safeUrl}" data-preview-type="${type}" data-preview-title="${safeTitle}" data-preview-prompt="${safePrompt}">
      <div class="result-media">
        <img src="${safeUrl}" alt="${safeTitle}">
        ${type === "video" ? `<b class="media-badge">视频预览</b>` : ""}
      </div>
      <span>${safeTitle} · ${escapeHtml(String(prompt).slice(0, 28))}</span>
      <div class="result-actions">
        <button type="button" data-result-save data-url="${safeUrl}" data-type="${type}" data-title="${safeTitle}" data-prompt="${safePrompt}">保存到资产库</button>
        <small>点击${typeText}放大查看</small>
      </div>
    </article>
  `;
}

function setButtonLoading(button, loading, text = "AI 正在生成...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.classList.add("is-loading");
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.classList.remove("is-loading");
    button.disabled = false;
  }
}

function renderGeneratingCard(label) {
  return `
    <article class="generating-card" aria-live="polite">
      <div class="render-ghost"><span></span><span></span><span></span></div>
      <strong>${escapeHtml(label)}正在生成</strong>
      <p>正在理解空间结构、材质和光影，请稍候。</p>
    </article>
  `;
}

function activeValue(selectId, otherId) {
  const select = $(`#${selectId}`);
  if (!select) return "";
  if (select.value === "other") return $(`#${otherId}`)?.value.trim() || "自定义";
  return select.value;
}

function toggleOther(selectId, wrapId) {
  const select = $(`#${selectId}`);
  const wrap = $(`#${wrapId}`);
  if (!select || !wrap) return;
  wrap.classList.toggle("show", select.value === "other");
}

function charge(cost) {
  if (state.points < cost) {
    toast("积分不足，请先充值");
    window.location.href = "pricing.html";
    return false;
  }
  state.points -= cost;
  saveState();
  updatePoints();
  return true;
}

async function callImageApi(payload) {
  if (!API_BASE) throw new Error("缺少 Vercel API 地址");
  const response = await fetch(`${API_BASE}/api/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function uploadImage(file) {
  if (!API_BASE) throw new Error("缺少 Vercel API 地址");
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function queryImageTask(id) {
  const response = await fetch(`${API_BASE}/api/task-detail?id=${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function extractTaskId(result) {
  return result?.data?.id || result?.data?.task_id || result?.id || result?.task_id || "";
}

function extractImageUrls(result) {
  const data = result?.data || result || {};
  const candidates = [
    data.url,
    data.image,
    data.output,
    data.result,
    data.image_url,
    data.video,
    ...(Array.isArray(data.urls) ? data.urls : []),
    ...(Array.isArray(data.images) ? data.images : [])
  ].filter(Boolean);

  return candidates
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .filter((item) => typeof item === "string" && /^https?:\/\//.test(item));
}

function isTaskDone(result) {
  const data = result?.data || result || {};
  const status = String(data.status ?? data.state ?? data.task_status ?? "").toLowerCase();
  return ["2", "3", "success", "succeeded", "completed", "finish", "finished"].includes(status) || extractImageUrls(result).length > 0;
}

async function waitForImageUrls(taskId, log) {
  if (!taskId) return [];
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, index === 0 ? 1200 : 3000));
    const detail = await queryImageTask(taskId);
    const urls = extractImageUrls(detail);
    if (urls.length) return urls;
    if (log) log.textContent = "正在生成效果图，请稍候。";
    if (isTaskDone(detail)) return urls;
  }
  return [];
}

function makeMockImage(prompt, label) {
  const palettes = [
    ["#f6efe7", "#d9b98d", "#3c4b46"],
    ["#eef2f5", "#b9c8d9", "#26364b"],
    ["#f7efe8", "#caa77c", "#563c2c"],
    ["#f1f4e9", "#9fb59f", "#2e4139"]
  ];
  const palette = palettes[Math.abs(hashCode(prompt)) % palettes.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="875" viewBox="0 0 1400 875">
      <rect width="1400" height="875" fill="${palette[0]}"/>
      <rect x="90" y="110" width="1220" height="620" rx="28" fill="#fffdfa"/>
      <rect x="140" y="170" width="360" height="500" rx="10" fill="${palette[2]}" opacity=".9"/>
      <rect x="530" y="170" width="310" height="500" rx="10" fill="${palette[1]}" opacity=".9"/>
      <rect x="870" y="170" width="390" height="500" rx="10" fill="#eee3d6"/>
      <rect x="218" y="520" width="680" height="86" rx="16" fill="#c9b7a3"/>
      <rect x="260" y="456" width="410" height="74" rx="16" fill="#fff7ec"/>
      <circle cx="1080" cy="296" r="72" fill="${palette[1]}"/>
      <text x="140" y="790" fill="#101426" font-size="42" font-family="Microsoft YaHei, Arial" font-weight="800">${escapeHtml(label)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hashCode(value) {
  return String(value).split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

async function submitImageTask({ prompt, size, urls, count, targetId, logId, label, source }) {
  const cost = count * (state.tier === "enterprise" ? 6 : state.tier === "member" ? 10 : 16);
  if (!charge(cost)) return;
  const log = $(logId);
  const target = $(targetId);
  if (target) target.innerHTML = Array.from({ length: count }, () => renderGeneratingCard(label)).join("");
  if (log) log.textContent = "正在生成效果图，请稍候。";

  let images = [];
  try {
    const result = await callImageApi({ prompt, size, urls });
    const taskId = extractTaskId(result);
    images = extractImageUrls(result);
    if (!images.length && taskId) images = await waitForImageUrls(taskId, log);
    if (log) log.textContent = images.length ? "生成完成，可点击图片放大查看，也可以保存到资产库。" : "任务已提交，但暂未返回图片地址。";
  } catch (error) {
    if (log) log.textContent = `生成失败：${error.message}。已退回本次消耗积分。`;
    state.points += cost;
    saveState();
    updatePoints();
    toast("生成失败，积分已退回");
    return;
  }

  if (!images.length) {
    toast("任务已提交，暂未返回图片");
    return;
  }

  images = images.slice(0, count);
  state.pendingVideoImages = images;
  if (target) {
    target.innerHTML = images.map((url, index) => {
      const title = `${label} ${index + 1}`;
      const promptWithSource = source ? `${prompt}｜${source}` : prompt;
      return renderResultCard(url, title, promptWithSource, "image");
    }).join("");
  }
  saveState();
  updatePoints();
  toast(`已消耗 ${cost} 点积分`);
}

function addAsset(asset, persist = true) {
  state.assets.unshift({ id: uid(), createdAt: new Date().toISOString(), ...asset });
  if (persist) saveState();
  renderAssets();
}

function assetExists(url, type) {
  return state.assets.some((asset) => asset.url === url && asset.type === type);
}

function saveGeneratedAsset({ url, type, title, prompt }) {
  if (!url) return;
  if (assetExists(url, type)) {
    toast("这个素材已经在资产库里");
    return;
  }
  addAsset({
    type,
    title: title || (type === "video" ? "全屋定制视频" : "全屋定制效果图"),
    prompt: type === "image" ? prompt : "",
    description: type === "video" ? prompt : "",
    url
  });
  toast("已保存到资产库");
}

function ensurePreviewModal() {
  let modal = $("#mediaPreviewModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "mediaPreviewModal";
  modal.className = "media-preview-modal";
  modal.innerHTML = `
    <div class="media-preview-panel" role="dialog" aria-modal="true" aria-label="素材预览">
      <button type="button" class="modal-close" data-preview-close>×</button>
      <div class="media-preview-body"></div>
      <div class="media-preview-info">
        <div>
          <strong data-preview-title></strong>
          <p data-preview-prompt></p>
        </div>
        <button type="button" class="white-button small" data-preview-save>保存到资产库</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openMediaPreview({ url, type, title, prompt }) {
  const modal = ensurePreviewModal();
  modal.dataset.url = url;
  modal.dataset.type = type;
  modal.dataset.title = title;
  modal.dataset.prompt = prompt || "";
  const body = modal.querySelector(".media-preview-body");
  body.innerHTML = type === "video"
    ? `<div class="modal-video-frame"><img src="${escapeHtml(url)}" alt="${escapeHtml(title)}"><span>视频预览</span></div>`
    : `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}">`;
  modal.querySelector("[data-preview-title]").textContent = title;
  modal.querySelector("[data-preview-prompt]").textContent = prompt || "生成素材";
  modal.classList.add("open");
}

function closeMediaPreview() {
  $("#mediaPreviewModal")?.classList.remove("open");
}

function bindMediaPreview() {
  document.addEventListener("click", (event) => {
    const saveButton = event.target.closest("[data-result-save], [data-preview-save]");
    if (saveButton) {
      const modal = saveButton.closest("#mediaPreviewModal");
      saveGeneratedAsset({
        url: saveButton.dataset.url || modal?.dataset.url,
        type: saveButton.dataset.type || modal?.dataset.type || "image",
        title: saveButton.dataset.title || modal?.dataset.title,
        prompt: saveButton.dataset.prompt || modal?.dataset.prompt || ""
      });
      return;
    }

    if (event.target.closest("[data-preview-close]")) {
      closeMediaPreview();
      return;
    }

    const modal = event.target.closest("#mediaPreviewModal");
    if (modal && event.target.id === "mediaPreviewModal") {
      closeMediaPreview();
      return;
    }

    if (event.target.closest("button, a")) return;
    const preview = event.target.closest("[data-preview-url]");
    if (!preview) return;
    openMediaPreview({
      url: preview.dataset.previewUrl,
      type: preview.dataset.previewType || "image",
      title: preview.dataset.previewTitle || "素材预览",
      prompt: preview.dataset.previewPrompt || ""
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMediaPreview();
  });
}

function renderAssets() {
  const grid = $("#assetGrid");
  const homeGrid = $("#homeAssetGrid");
  if (homeGrid) renderHomeAssets(homeGrid);
  if (!grid) return;
  if (!state.assets.length) {
    grid.innerHTML = `<div class="status-line">暂无资产。生成图片或视频后，点击“保存到资产库”即可沉淀到这里。</div>`;
    return;
  }

  const filter = grid.dataset.filter || "all";
  let assets = state.assets.slice();
  if (filter === "image") assets = assets.filter((asset) => asset.type === "image");
  if (filter === "video") assets = assets.filter((asset) => asset.type === "video");
  if (filter === "floorplan") assets = assets.filter((asset) => String(asset.prompt || "").includes("户型生图"));
  if (filter === "text") assets = assets.filter((asset) => String(asset.prompt || "").includes("文本生图"));
  if (filter === "recent") assets = assets.slice(0, 8);

  if (!assets.length) {
    grid.innerHTML = `<div class="empty-preview"><span></span><strong>还没有资产</strong><p>开始一次创作并保存后会出现在这里。</p></div>`;
    return;
  }

  grid.innerHTML = assets.map((asset) => {
    const detail = asset.prompt || asset.description || "";
    const media = asset.type === "video"
      ? `<div class="asset-thumb-video">▶</div>`
      : `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.title)}">`;
    return `
      <article class="asset-card is-previewable" data-preview-url="${escapeHtml(asset.url)}" data-preview-type="${asset.type}" data-preview-title="${escapeHtml(asset.title)}" data-preview-prompt="${escapeHtml(detail)}">
        ${media}
        <div class="asset-body">
          <strong>${escapeHtml(asset.title)}</strong>
          <p>${escapeHtml(detail)}</p>
          <small>${new Date(asset.createdAt).toLocaleString("zh-CN")}</small>
        </div>
        <div class="asset-actions-row">
          <button type="button" data-asset-action="reuse">复用</button>
          <button type="button" data-asset-action="video">转视频</button>
          <button type="button" data-asset-action="download">下载</button>
          <button type="button" data-asset-action="delete" data-id="${asset.id}">删除</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderHomeAssets(grid) {
  const assets = state.assets.slice(0, 4);
  if (!assets.length) {
    grid.innerHTML = `
      <a class="home-asset empty" href="floorplan.html">
        <strong>还没有资产</strong>
        <span>生成并保存第一张全屋定制效果图</span>
      </a>
    `;
    return;
  }
  grid.innerHTML = assets.map((asset) => {
    const bg = asset.type === "video" ? "" : `style="background-image:url('${escapeHtml(asset.url)}')"`;
    return `
      <a class="home-asset" href="assets.html" ${bg}>
        <strong>${escapeHtml(asset.title)}</strong>
        <span>${asset.type === "video" ? "视频资产" : "图片资产"}</span>
      </a>
    `;
  }).join("");
}

function bindHome() {
  const quickStart = $("#quickStart");
  $$(".prompt-pills button").forEach((button) => {
    button.addEventListener("click", () => {
      const target = $("#quickPrompt") || $("#textPrompt");
      if (target) target.value = button.textContent.trim();
    });
  });
  if (!quickStart) return;

  const trigger = $("#modeTrigger");
  const dropdown = $("#modeDropdown");
  trigger?.addEventListener("click", () => dropdown?.classList.toggle("open"));
  $$(".mode-dropdown button").forEach((button) => {
    button.addEventListener("click", () => {
      quickTarget = button.dataset.target;
      $$(".mode-dropdown button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (trigger) trigger.innerHTML = `${button.childNodes[0].textContent.trim()} <span>⌄</span>`;
      dropdown?.classList.remove("open");
    });
  });
  quickStart.addEventListener("click", () => {
    const prompt = $("#quickPrompt").value.trim();
    if (prompt) sessionStorage.setItem("quickPrompt", prompt);
    window.location.href = quickTarget;
  });
}

function bindFloorplan() {
  const form = $("#floorplanForm");
  if (!form) return;
  $("#floorplanUpload").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const localPreview = await fileToDataUrl(file);
    $("#floorplanPreview").innerHTML = renderPreviewCard(localPreview, file.name);
    $("#floorLog").textContent = "正在上传户型图到素材库。";
    try {
      const uploaded = await uploadImage(file);
      floorplanReference = uploaded.url;
      $("#floorLog").textContent = "户型图已上传完成，可以开始生成。";
    } catch (error) {
      floorplanReference = "";
      $("#floorLog").textContent = `上传失败：${error.message}。请检查阿里 OSS 环境变量。`;
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector(".generate-button");
    if (!floorplanReference) {
      toast("请先上传户型平面图");
      return;
    }
    const style = activeValue("floorStyle", "floorStyleOther");
    const area = activeValue("floorArea", "floorAreaOther");
    const count = Math.max(1, Math.min(4, Number($("#floorCount").value || 1)));
    const prompt = `根据上传的户型平面图生成${area}全屋定制效果图，风格为${style}，柜体比例合理，材质真实，空间动线清晰，室内摄影级渲染。`;
    setButtonLoading(button, true);
    await submitImageTask({ prompt, size: $("#floorSize").value, urls: [floorplanReference], count, targetId: "#floorResults", logId: "#floorLog", label: `${area}效果图`, source: "户型生图" });
    setButtonLoading(button, false);
  });
  $("#floorToVideoBtn")?.addEventListener("click", continueToVideo);
}

function bindTextImage() {
  const form = $("#textImageForm");
  if (!form) return;
  const quickPrompt = sessionStorage.getItem("quickPrompt");
  if (quickPrompt) {
    $("#textPrompt").value = quickPrompt;
    sessionStorage.removeItem("quickPrompt");
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector(".generate-button");
    const style = activeValue("textStyle", "textStyleOther");
    const area = activeValue("textArea", "textAreaOther");
    const count = Math.max(1, Math.min(4, Number($("#textCount").value || 1)));
    const prompt = `${$("#textPrompt").value.trim()}，区域：${area}，风格：${style}，全屋定制效果图，高质量室内摄影，真实材质，专业灯光。`;
    setButtonLoading(button, true);
    await submitImageTask({ prompt, size: $("#textSize").value, urls: [], count, targetId: "#textResults", logId: "#textLog", label: `${area}效果图`, source: "文本生图" });
    setButtonLoading(button, false);
  });
  $("#textToVideoBtn")?.addEventListener("click", continueToVideo);
}

function continueToVideo() {
  if (!state.pendingVideoImages.length) {
    toast("请先生成图片");
    return;
  }
  saveState();
  window.location.href = "video.html";
}

function bindVideo() {
  const form = $("#videoForm");
  if (!form) return;
  if (state.pendingVideoImages.length) {
    videoImages = state.pendingVideoImages.slice(0, 8);
    renderVideoPreview();
    $("#videoLog").textContent = "已把刚生成的效果图带入视频剪辑。";
  }
  $("#videoUpload").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    videoImages = await Promise.all(files.map(fileToDataUrl));
    renderVideoPreview();
    $("#videoLog").textContent = `已上传 ${files.length} 张图片，可继续添加字幕和背景音乐。`;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector(".generate-button");
    if (!videoImages.length) {
      toast("请先上传图片素材");
      return;
    }
    const seconds = Math.max(2, Number($("#secondsPerImage").value || 4));
    const cost = Math.ceil(videoImages.length * seconds * (state.tier === "enterprise" ? 1 : state.tier === "member" ? 1.5 : 3));
    if (!charge(cost)) return;
    const subtitle = $("#subtitleText").value.trim() || "智绘全屋 · 定制美好空间";
    const music = $("#musicUpload").files?.[0]?.name || "未添加音乐";
    setButtonLoading(button, true, "AI 正在剪辑...");
    $("#videoResults").innerHTML = renderGeneratingCard("定制化视频");
    $("#videoLog").textContent = "正在剪辑视频，请稍候。";
    window.setTimeout(() => {
      const description = `${videoImages.length} 张图 · ${seconds} 秒/图 · ${music} · 字幕：${subtitle}`;
      $("#videoResults").innerHTML = renderResultCard(videoImages[0], "定制化视频", description, "video");
      $("#videoLog").textContent = "视频已生成，可点击预览放大查看，也可以保存到资产库。";
      state.pendingVideoImages = [];
      saveState();
      toast(`视频已生成，消耗 ${cost} 点积分`);
      setButtonLoading(button, false);
    }, 1200);
  });
}

function renderVideoPreview() {
  const target = $("#videoPreview");
  if (!target) return;
  target.innerHTML = videoImages.map((url, index) => renderPreviewCard(url, `图片 ${index + 1}`)).join("");
}

function bindPricing() {
  if (!$("#rechargeBtn")) return;
  $$(".price-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (!card.dataset.plan) return;
      if (card.dataset.plan === "normal") {
        state.tier = "normal";
        state.cycle = null;
        toast("已切换到普通版");
      } else {
        const points = Number(card.dataset.points || 0);
        state.tier = "member";
        state.cycle = card.dataset.cycle || "monthly";
        state.points += points;
        toast(`会员已开通，赠送 ${points.toLocaleString("zh-CN")} 点积分`);
      }
      saveState();
      updatePoints();
      updatePriceCards();
    });
  });
  $$(".pay-method").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".pay-method").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
  $("#rechargeAmount").addEventListener("input", () => {
    const amount = Math.max(0, Number($("#rechargeAmount").value || 0));
    $("#payResult").textContent = `预计到账 ${(amount * 100).toLocaleString("zh-CN")} 点积分`;
  });
  $("#rechargeBtn").addEventListener("click", () => {
    const amount = Math.max(1, Number($("#rechargeAmount").value || 0));
    const method = $(".pay-method.active")?.dataset.pay === "alipay" ? "支付宝" : "微信支付";
    const points = amount * 100;
    state.points += points;
    saveState();
    updatePoints();
    $("#payResult").textContent = `${method}支付成功，到货 ${points.toLocaleString("zh-CN")} 点积分`;
    toast("充值成功");
  });
  $("#contactSalesBtn")?.addEventListener("click", () => {
    $("#salesModal")?.classList.add("open");
  });
  $("#salesClose")?.addEventListener("click", () => {
    $("#salesModal")?.classList.remove("open");
  });
  $("#salesModal")?.addEventListener("click", (event) => {
    if (event.target.id === "salesModal") $("#salesModal").classList.remove("open");
  });
}

function updatePriceCards() {
  $$(".price-card").forEach((card) => {
    const selected = card.dataset.plan === state.tier && (!card.dataset.cycle || card.dataset.cycle === state.cycle);
    card.classList.toggle("selected", selected);
  });
}

function bindAssets() {
  $$(".asset-filters button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".asset-filters button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const grid = $("#assetGrid");
      if (grid) grid.dataset.filter = button.dataset.filter || "all";
      renderAssets();
    });
  });
  $("#assetGrid")?.addEventListener("click", (event) => {
    const action = event.target?.dataset?.assetAction;
    if (!action) return;
    if (action === "delete") {
      state.assets = state.assets.filter((asset) => asset.id !== event.target.dataset.id);
      saveState();
      renderAssets();
      toast("资产已删除");
      return;
    }
    if (action === "video") {
      const card = event.target.closest(".asset-card");
      const img = card?.querySelector("img")?.src;
      if (img) {
        state.pendingVideoImages = [img];
        saveState();
      }
      window.location.href = "video.html";
      return;
    }
    toast(action === "download" ? "下载功能将在商用版接入" : "已复用为创作参考");
  });
  $("#clearAssetsBtn")?.addEventListener("click", () => {
    state.assets = [];
    saveState();
    renderAssets();
    toast("资产库已清空");
  });
}

function bindShared() {
  [
    ["floorStyle", "floorStyleOtherWrap"],
    ["floorArea", "floorAreaOtherWrap"],
    ["textStyle", "textStyleOtherWrap"],
    ["textArea", "textAreaOtherWrap"]
  ].forEach(([selectId, wrapId]) => {
    $(`#${selectId}`)?.addEventListener("change", () => toggleOther(selectId, wrapId));
  });
}

function bindMobileNav() {
  const page = document.body?.dataset?.page || "home";
  const items = [
    ["home", "index.html", "⌂", "首页"],
    ["floorplan", "floorplan.html", "□", "户型"],
    ["text-image", "text-image.html", "✎", "文本"],
    ["video", "video.html", "▶", "视频"],
    ["assets", "assets.html", "▦", "资产"]
  ];
  const nav = document.createElement("nav");
  nav.className = "mobile-tabbar";
  nav.setAttribute("aria-label", "移动端主导航");
  nav.innerHTML = items.map(([key, href, icon, label]) => `
    <a class="${page === key ? "active" : ""}" href="${href}">
      <span>${icon}</span>
      <b>${label}</b>
    </a>
  `).join("");
  document.body.appendChild(nav);
}

function bindDesktopTutorialNav() {
  const nav = $(".top-nav");
  if (!nav || nav.querySelector('a[href="tutorial.html"]')) return;
  const pricingLink = nav.querySelector('a[href="pricing.html"]');
  const tutorialLink = document.createElement("a");
  tutorialLink.href = "tutorial.html";
  tutorialLink.textContent = "教程";
  if (document.body?.dataset?.page === "tutorial") {
    nav.querySelectorAll("a").forEach((item) => item.classList.remove("active"));
    tutorialLink.classList.add("active");
  }
  nav.insertBefore(tutorialLink, pricingLink);
}

function init() {
  updatePoints();
  bindShared();
  bindDesktopTutorialNav();
  bindHome();
  bindFloorplan();
  bindTextImage();
  bindVideo();
  bindPricing();
  bindAssets();
  bindMediaPreview();
  bindMobileNav();
  renderAssets();
  updatePriceCards();
}

init();
