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
  return String(value)
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

function renderResultCard(url, title, prompt) {
  return `
    <article class="result-card">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(title)}">
      <span>${escapeHtml(title)} · ${escapeHtml(prompt.slice(0, 28))}</span>
    </article>
  `;
}

function renderGeneratingCard(label) {
  return `
    <article class="generating-card" aria-live="polite">
      <div class="render-ghost">
        <span></span>
        <span></span>
        <span></span>
      </div>
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
  const response = await fetch(`${API_BASE}/api/generate-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData
  });
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
      <text x="140" y="790" fill="#101426" font-size="42" font-family="Microsoft YaHei, Arial" font-weight="800">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hashCode(value) {
  return String(value).split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

async function submitImageTask({ prompt, size, urls, count, targetId, logId, label }) {
  const cost = count * (state.tier === "enterprise" ? 6 : state.tier === "member" ? 10 : 16);
  if (!charge(cost)) return;
  const log = $(logId);
  const target = $(targetId);
  if (target) {
    target.innerHTML = Array.from({ length: count }, () => renderGeneratingCard(label)).join("");
  }
  if (log) log.textContent = "正在生成效果图，请稍候。";

  let images = [];
  try {
    const result = await callImageApi({ prompt, size, urls });
    const taskId = extractTaskId(result);
    if (log) log.textContent = "正在生成效果图，请稍候。";
    images = extractImageUrls(result);
    if (!images.length && taskId) {
      images = await waitForImageUrls(taskId, log);
    }
    if (log) log.textContent = images.length ? "生成完成，结果已保存到资产库。" : "任务已提交，但暂未返回图片地址。稍后可刷新资产库查看。";
  } catch (error) {
    if (log) log.textContent = `生成失败：${error.message}。请确认 Vercel 环境变量和阿里 OSS 配置。`;
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
  if (target) target.innerHTML = images.map((url, index) => renderResultCard(url, `${label} ${index + 1}`, prompt)).join("");
  state.pendingVideoImages = images;
  images.forEach((url, index) => addAsset({
    type: "image",
    title: `${label} ${index + 1}`,
    prompt,
    url
  }, false));
  saveState();
  updatePoints();
  toast(`已消耗 ${cost} 点积分`);
}

function addAsset(asset, persist = true) {
  state.assets.unshift({ id: uid(), createdAt: new Date().toISOString(), ...asset });
  if (persist) saveState();
  renderAssets();
}

function renderAssets() {
  const grid = $("#assetGrid");
  const homeGrid = $("#homeAssetGrid");
  if (homeGrid) renderHomeAssets(homeGrid);
  if (!grid) return;
  if (!state.assets.length) {
    grid.innerHTML = `<div class="status-line">暂无资产。生成效果图或视频后会自动保存到这里。</div>`;
    return;
  }
  grid.innerHTML = state.assets.map((asset) => {
    const media = asset.type === "video"
      ? `<div class="asset-thumb-video">▶</div>`
      : `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.title)}">`;
    return `
      <article class="asset-card">
        ${media}
        <div class="asset-body">
          <strong>${escapeHtml(asset.title)}</strong>
          <p>${escapeHtml(asset.prompt || asset.description || "")}</p>
          <small>${new Date(asset.createdAt).toLocaleString("zh-CN")}</small>
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
        <span>生成第一张全屋定制效果图</span>
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
  $$(".prompt-pills button").forEach((button) => {
    button.addEventListener("click", () => {
      $("#quickPrompt").value = button.textContent.trim();
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
      $("#floorLog").textContent = "户型图已上传完成，可开始生成。";
    } catch (error) {
      floorplanReference = "";
      $("#floorLog").textContent = `上传失败：${error.message}。请检查阿里 OSS 环境变量。`;
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!floorplanReference) {
      toast("请先上传户型平面图");
      return;
    }
    const style = activeValue("floorStyle", "floorStyleOther");
    const area = activeValue("floorArea", "floorAreaOther");
    const count = Math.max(1, Math.min(4, Number($("#floorCount").value || 1)));
    const prompt = `根据上传的户型平面图生成${area}全屋定制效果图，风格为${style}，柜体比例合理，材质真实，空间动线清晰，室内摄影级渲染。`;
    await submitImageTask({ prompt, size: $("#floorSize").value, urls: [floorplanReference], count, targetId: "#floorResults", logId: "#floorLog", label: `${area}效果图` });
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
    const style = activeValue("textStyle", "textStyleOther");
    const area = activeValue("textArea", "textAreaOther");
    const count = Math.max(1, Math.min(4, Number($("#textCount").value || 1)));
    const prompt = `${$("#textPrompt").value.trim()}，区域：${area}，风格：${style}，全屋定制效果图，高质量室内摄影，真实材质，专业灯光。`;
    await submitImageTask({ prompt, size: $("#textSize").value, urls: [], count, targetId: "#textResults", logId: "#textLog", label: `${area}效果图` });
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
    if (!videoImages.length) {
      toast("请先上传图片素材");
      return;
    }
    const seconds = Math.max(2, Number($("#secondsPerImage").value || 4));
    const cost = Math.ceil(videoImages.length * seconds * (state.tier === "enterprise" ? 1 : state.tier === "member" ? 1.5 : 3));
    if (!charge(cost)) return;
    const subtitle = $("#subtitleText").value.trim() || "智绘全屋 · 定制美好空间";
    const music = $("#musicUpload").files?.[0]?.name || "未添加音乐";
    $("#videoResults").innerHTML = renderGeneratingCard("定制化视频");
    $("#videoLog").textContent = "正在剪辑视频，请稍候。";
    window.setTimeout(() => {
    $("#videoResults").innerHTML = renderResultCard(videoImages[0], "定制化视频", `${videoImages.length} 张图 · ${seconds} 秒/图 · ${music}`);
    $("#videoLog").textContent = `视频已生成：已添加字幕“${subtitle}”，并完成图片拼接与背景音乐配置。`;
    addAsset({ type: "video", title: "全屋定制视频", description: `${videoImages.length} 张图片，字幕：${subtitle}`, url: videoImages[0] });
    state.pendingVideoImages = [];
    saveState();
    toast(`视频已生成，消耗 ${cost} 点积分`);
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
    $("#payResult").textContent = `${method}支付成功，到账 ${points.toLocaleString("zh-CN")} 点积分`;
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

function init() {
  updatePoints();
  bindShared();
  bindHome();
  bindFloorplan();
  bindTextImage();
  bindVideo();
  bindPricing();
  bindAssets();
  renderAssets();
  updatePriceCards();
}

init();
