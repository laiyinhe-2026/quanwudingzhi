const STORAGE_KEY = "zhihui_quanwu_state";
const API_BASE = (window.ZHIHUI_API_BASE || "").replace(/\/$/, "");

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let state = loadState();
let floorplanReference = "";
let videoImages = [];
let selectedModeId = "text-to-image";
let activeModeCategory = "image";
const skillDefaults = new Map();

const creationModes = [
  { id: "floorplan-analysis", category: "image", name: "户型分析图", icon: "⌁", description: "上传户型图，自动分析空间布局、动线、采光和改造建议。", target: "floorplan.html", workflowType: "floorplan_analysis", skillFile: "prompt-skills/modes/floorplan-analysis.md" },
  { id: "floorplan-render", category: "image", name: "户型效果图", icon: "⌂", description: "根据户型图生成不同风格的家装效果图，适合客户沟通和方案展示。", target: "floorplan.html", workflowType: "floorplan_render", skillFile: "prompt-skills/modes/floorplan-render.md" },
  { id: "text-to-image", category: "image", name: "文本生成图", icon: "✦", description: "输入文字需求，生成家装风格图、产品图、场景图和营销图。", target: "text-image.html", workflowType: "text_to_image", skillFile: "prompt-skills/modes/text-to-image.md" },
  { id: "floorplan-layout", category: "image", name: "户型平面图", icon: "□", description: "生成清晰的户型平面示意图，适合方案讲解和客户展示。", target: "floorplan.html", workflowType: "floorplan_layout", skillFile: "prompt-skills/modes/floorplan-layout.md" },
  { id: "rough-renovation-image", category: "image", name: "毛胚改装图", icon: "◐", description: "将毛胚房照片转化为装修后的效果图，直观看到改造前后变化。", target: "floorplan.html", workflowType: "rough_renovation_image", skillFile: "prompt-skills/modes/rough-renovation-image.md" },
  { id: "image-slideshow-video", category: "video", name: "图片拼接视频", icon: "▻", description: "将多张家装图片自动拼接成短视频，适合短视频平台发布。", target: "video.html", workflowType: "image_slideshow_video", skillFile: "prompt-skills/modes/image-slideshow-video.md" },
  { id: "rough-renovation-video", category: "video", name: "毛胚改装视频", icon: "▻", description: "把毛胚房素材生成装修过程或改造前后对比视频。", target: "video.html", workflowType: "rough_renovation_video", skillFile: "prompt-skills/modes/rough-renovation-video.md" },
  { id: "talking-head-video", category: "video", name: "人物口播视频", icon: "◉", description: "生成适合家装获客的人物口播视频脚本和画面内容。", target: "video.html", workflowType: "talking_head_video", skillFile: "prompt-skills/modes/talking-head-video.md" },
  { id: "story-video", category: "video", name: "故事驱动视频", icon: "✧", description: "围绕客户痛点、装修故事和成交案例，生成更有吸引力的视频内容。", target: "video.html", workflowType: "story_video", skillFile: "prompt-skills/modes/story-video.md" },
  { id: "background-music", category: "audio", name: "背景音乐", icon: "♪", description: "为家装视频匹配适合的背景音乐，提升内容质感。", target: "audio.html", workflowType: "background_music", skillFile: "prompt-skills/modes/background-music.md" },
  { id: "voice-clone", category: "audio", name: "声音克隆", icon: "◒", description: "克隆指定声音，用于生成统一风格的品牌口播内容。", target: "audio.html", workflowType: "voice_clone", skillFile: "prompt-skills/modes/voice-clone.md" },
  { id: "ai-voiceover", category: "audio", name: "AI配音", icon: "●", description: "输入文案，自动生成自然流畅的中文配音。", target: "audio.html", workflowType: "ai_voiceover", skillFile: "prompt-skills/modes/ai-voiceover.md" },
  { id: "music-generation", category: "audio", name: "音乐生成", icon: "♫", description: "根据内容风格生成原创音乐，适合品牌宣传和短视频使用。", target: "audio.html", workflowType: "music_generation", skillFile: "prompt-skills/modes/music-generation.md" }
];

function loadState() {
  try {
    return {
      points: 1000,
      tier: "normal",
      assets: [],
      pendingVideoImages: [],
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    };
  } catch {
    return { points: 1000, tier: "normal", assets: [], pendingVideoImages: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return window.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
}

function updatePoints() {
  $$("[data-points]").forEach((node) => {
    node.textContent = Math.round(state.points).toLocaleString("zh-CN");
  });
  $$("[data-reward-points]").forEach((node) => {
    node.textContent = "88";
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    location.href = "pricing.html";
    return false;
  }
  state.points -= cost;
  saveState();
  updatePoints();
  return true;
}

function setButtonLoading(button, loading, text = "AI 正在生成...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
    button.classList.add("is-loading");
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.classList.remove("is-loading");
  }
}

function renderPreviewCard(url, label) {
  return `<article class="preview-card"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}"><span>${escapeHtml(label)}</span></article>`;
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

function renderResultCard(url, title, prompt = "", type = "image") {
  const safeUrl = escapeHtml(url);
  const safeTitle = escapeHtml(title);
  const safePrompt = escapeHtml(prompt);
  return `
    <article class="result-card is-previewable" data-preview-url="${safeUrl}" data-preview-type="${type}" data-preview-title="${safeTitle}" data-preview-prompt="${safePrompt}">
      <div class="result-media">
        <img src="${safeUrl}" alt="${safeTitle}">
        ${type === "video" ? '<b class="media-badge">视频预览</b>' : ""}
      </div>
      <span>${safeTitle} · ${escapeHtml(String(prompt).slice(0, 28))}</span>
      <div class="result-actions">
        <button type="button" data-result-save data-url="${safeUrl}" data-type="${type}" data-title="${safeTitle}" data-prompt="${safePrompt}">保存到资产库</button>
        <small>点击放大查看</small>
      </div>
    </article>
  `;
}

function hashCode(value) {
  return String(value).split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
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
      <circle cx="1080" cy="296" r="72" fill="${palette[1]}"/>
      <text x="140" y="790" fill="#101426" font-size="42" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(label)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function callImageApi(payload) {
  if (!API_BASE) throw new Error("缺少后端 API 地址");
  const response = await fetch(`${API_BASE}/api/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function uploadImage(file) {
  if (!API_BASE) throw new Error("缺少后端 API 地址");
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
    ...(Array.isArray(data.urls) ? data.urls : []),
    ...(Array.isArray(data.images) ? data.images : [])
  ].filter(Boolean);
  return candidates.flatMap((item) => Array.isArray(item) ? item : [item]).filter((item) => typeof item === "string" && /^https?:\/\//.test(item));
}

async function waitForImageUrls(taskId, log) {
  if (!taskId) return [];
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, index === 0 ? 1200 : 3000));
    const detail = await queryImageTask(taskId);
    const urls = extractImageUrls(detail);
    if (urls.length) return urls;
    if (log) log.textContent = "正在生成效果图，请稍候。";
  }
  return [];
}

function skillStorageKey(id) {
  return `zhihui_skill_${id}`;
}

function getPromptSkill(id) {
  return $(`#${id}`)?.value.trim() || "";
}

function withSkillPrompt(prompt, skill) {
  return skill ? `${prompt}\n\n请遵循以下内置 Skill：\n${skill}` : prompt;
}

async function loadPromptSkills() {
  await Promise.all($$("[data-skill-file]").map(async (textarea) => {
    const saved = localStorage.getItem(skillStorageKey(textarea.id));
    if (saved) {
      textarea.value = saved;
      return;
    }
    try {
      const response = await fetch(textarea.dataset.skillFile, { cache: "no-cache" });
      const text = response.ok ? await response.text() : "";
      skillDefaults.set(textarea.id, text);
      textarea.value = text;
    } catch {
      textarea.value = "";
    }
  }));
}

function bindPromptSkills() {
  $$("[data-skill-file]").forEach((textarea) => {
    textarea.addEventListener("input", () => localStorage.setItem(skillStorageKey(textarea.id), textarea.value));
  });
  $$("[data-skill-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = $(`#${button.dataset.skillReset}`);
      if (!textarea) return;
      textarea.value = skillDefaults.get(textarea.id) || "";
      localStorage.removeItem(skillStorageKey(textarea.id));
      toast("已恢复默认 Skill");
    });
  });
}

function optimizeTextPrompt() {
  const input = $("#textPrompt");
  if (!input) return;
  const original = input.value.trim();
  if (!original) {
    toast("请先输入客户需求");
    return;
  }
  const style = activeValue("textStyle", "textStyleOther") || "现代奶油风";
  const area = activeValue("textArea", "textAreaOther") || "主卧";
  input.value = `${original}。空间区域：${area}。整体风格：${style}。全屋定制重点：柜体到顶、收纳动线清晰、门板材质真实、灯带柔和、功能分区明确。画面要求：真实室内摄影，高质量空间渲染，比例准确，自然光，高级克制的家居氛围。`;
  toast("已优化为更适合生图的提示词");
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
  } catch (error) {
    state.points += cost;
    saveState();
    updatePoints();
    if (log) log.textContent = `生成失败：${error.message}。已退回本次消耗积分。`;
    toast("生成失败，积分已退回");
    return;
  }

  if (!images.length) {
    images = Array.from({ length: count }, (_, index) => makeMockImage(`${prompt}-${index}`, `${label} ${index + 1}`));
  }
  images = images.slice(0, count);
  state.pendingVideoImages = images;
  saveState();
  if (target) {
    target.innerHTML = images.map((url, index) => renderResultCard(url, `${label} ${index + 1}`, source ? `${prompt} · ${source}` : prompt, "image")).join("");
  }
  if (log) log.textContent = "生成完成，可点击图片放大查看，也可以保存到资产库。";
  toast(`已消耗 ${cost} 点积分`);
}

function addAsset(asset, persist = true) {
  state.assets.unshift({ id: uid(), createdAt: new Date().toISOString(), ...asset });
  if (persist) saveState();
  renderAssets();
}

function saveGeneratedAsset({ url, type, title, prompt }) {
  if (!url) return;
  if (state.assets.some((asset) => asset.url === url && asset.type === type)) {
    toast("这个素材已经在资产库里");
    return;
  }
  addAsset({
    type,
    title: title || (type === "video" ? "家装展示视频" : "家装效果图"),
    prompt: type === "image" ? prompt : "",
    description: type === "video" ? prompt : "",
    url
  });
  toast("已保存到资产库");
}

function hasOpenModal() {
  return Boolean($("#mediaPreviewModal.open, #caseModal.open, #simpleModal.open, #salesModal.open"));
}

function syncModalOpenState() {
  document.body.classList.toggle("modal-open", hasOpenModal());
}

function ensurePreviewModal() {
  let modal = $("#mediaPreviewModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "mediaPreviewModal";
  modal.className = "media-preview-modal";
  modal.innerHTML = `
    <div class="media-preview-panel" role="dialog" aria-modal="true" aria-label="素材预览">
      <button type="button" class="modal-close" data-preview-close>&times;</button>
      <div class="media-preview-body"></div>
      <div class="media-preview-info">
        <div><strong data-preview-title></strong><p data-preview-prompt></p></div>
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
  document.body.classList.add("modal-open");
}

function closeMediaPreview() {
  $("#mediaPreviewModal")?.classList.remove("open");
  syncModalOpenState();
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
    if (event.target.closest("[data-preview-close]") || event.target.id === "mediaPreviewModal") {
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
  if (!grid) return;
  if (!state.assets.length) {
    grid.innerHTML = `<div class="status-line">暂无资产。生成图片或视频后，点击“保存到资产库”即可沉淀到这里。</div>`;
    return;
  }
  grid.innerHTML = state.assets.map((asset) => {
    const detail = asset.prompt || asset.description || "";
    const media = asset.type === "video" ? `<div class="asset-thumb-video">▶</div>` : `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.title)}">`;
    return `
      <article class="asset-card is-previewable" data-preview-url="${escapeHtml(asset.url)}" data-preview-type="${asset.type}" data-preview-title="${escapeHtml(asset.title)}" data-preview-prompt="${escapeHtml(detail)}">
        <div class="asset-thumb">${media}</div>
        <span>${asset.type === "video" ? "视频" : "图片"}</span>
        <h3>${escapeHtml(asset.title)}</h3>
        <p>${new Date(asset.createdAt).toLocaleString("zh-CN")}</p>
        <div class="asset-actions"><button type="button">预览</button><button type="button" data-asset-delete="${asset.id}">删除</button></div>
      </article>
    `;
  }).join("");
}

function bindAssets() {
  const grid = $("#assetGrid");
  if (!grid) return;
  document.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-asset-delete]");
    if (!deleteButton) return;
    state.assets = state.assets.filter((asset) => asset.id !== deleteButton.dataset.assetDelete);
    saveState();
    renderAssets();
    toast("资产已删除");
  });
  $("#clearAssets")?.addEventListener("click", () => {
    state.assets = [];
    saveState();
    renderAssets();
    toast("资产库已清空");
  });
}

function getMode(id = selectedModeId) {
  return creationModes.find((mode) => mode.id === id) || creationModes[2];
}

function renderModePanel() {
  const grid = $("#modeCardGrid");
  if (!grid) return;
  const modes = creationModes.filter((mode) => mode.category === activeModeCategory);
  grid.innerHTML = modes.map((mode) => `
    <button class="mode-card ${mode.id === selectedModeId ? "active" : ""}" type="button" data-select-mode="${mode.id}">
      <span>${mode.icon}</span>
      <strong>${mode.name}</strong>
      <small>${mode.description}</small>
    </button>
  `).join("");
  $$("#modePanel .mode-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.category === activeModeCategory));
  const selectedName = $("#selectedModeName");
  if (selectedName) selectedName.textContent = getMode().name;
}

function positionModePanel() {
  const panel = $("#modePanel");
  const button = $("#homeModeButton");
  if (!panel || !button || !panel.classList.contains("open")) return;
  const rect = button.getBoundingClientRect();
  const width = Math.min(540, window.innerWidth - 32);
  const top = Math.min(rect.bottom + 12, window.innerHeight - 120);
  panel.style.setProperty("--mode-panel-left", `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`);
  panel.style.setProperty("--mode-panel-top", `${top}px`);
  panel.style.setProperty("--mode-panel-width", `${width}px`);
  panel.style.setProperty("--mode-panel-max-height", `${Math.max(260, window.innerHeight - top - 24)}px`);
}

function openModePanel() {
  const panel = $("#modePanel");
  if (!panel) return;
  if (panel.parentElement !== document.body) document.body.appendChild(panel);
  panel.classList.add("open");
  renderModePanel();
  positionModePanel();
}

function closeModePanel() {
  $("#modePanel")?.classList.remove("open");
}

function bindHome() {
  if (!$("#quickStart")) return;
  renderModePanel();
  $("#homeModeButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const panel = $("#modePanel");
    if (panel?.classList.contains("open")) closeModePanel();
    else openModePanel();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#modePanel, #homeModeButton")) closeModePanel();
  });
  window.addEventListener("resize", positionModePanel);
  $$("#modePanel .mode-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      activeModeCategory = button.dataset.category;
      renderModePanel();
    });
  });
  $("#modePanel")?.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-select-mode]");
    if (modeButton) {
      selectedModeId = modeButton.dataset.selectMode;
      renderModePanel();
      closeModePanel();
      $("#quickPrompt")?.focus();
      return;
    }
    if (event.target.closest("#customModeBtn")) openCustomModeModal();
  });
  $("#modePanel")?.addEventListener("wheel", (event) => {
    event.stopPropagation();
  }, { passive: true });
  $$(".hot-mode-row [data-mode-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedModeId = button.dataset.modeId;
      activeModeCategory = getMode().category;
      renderModePanel();
      $("#quickPrompt")?.focus();
    });
  });
  $("#quickStart")?.addEventListener("click", () => {
    const mode = getMode();
    const prompt = $("#quickPrompt")?.value.trim() || "";
    if (prompt) sessionStorage.setItem("zhihui_quick_prompt", prompt);
    location.href = mode.target;
  });
  $("#uploadPlus")?.addEventListener("click", (event) => {
    event.stopPropagation();
    $("#uploadMenu")?.classList.toggle("open");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".upload-control")) $("#uploadMenu")?.classList.remove("open");
  });
  $$("[data-upload-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const map = { image: "#homeImageUpload", video: "#homeVideoUpload", audio: "#homeAudioUpload", text: "#homeTextUpload" };
      $(map[button.dataset.uploadType])?.click();
    });
  });
}

function bindFloorplan() {
  if (!$("#floorplanForm")) return;
  ["floorStyle", "floorArea"].forEach((id) => {
    $(`#${id}`)?.addEventListener("change", () => toggleOther(id, `${id}OtherWrap`));
  });
  $("#floorplanUpload")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = await fileToDataUrl(file);
    floorplanReference = preview;
    $("#floorplanPreview").innerHTML = renderPreviewCard(preview, file.name);
    $("#floorLog").textContent = "户型图已上传，可开始生成。";
    if (API_BASE) {
      try {
        const uploaded = await uploadImage(file);
        floorplanReference = uploaded.url || uploaded.data?.url || preview;
      } catch {
        floorplanReference = preview;
      }
    }
  });
  $("#floorplanForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!floorplanReference) {
      toast("请先上传户型平面图");
      return;
    }
    const style = activeValue("floorStyle", "floorStyleOther");
    const area = activeValue("floorArea", "floorAreaOther");
    const count = Math.max(1, Math.min(4, Number($("#floorCount").value || 1)));
    const prompt = withSkillPrompt(`根据上传的户型平面图生成${area}全屋定制效果图，风格为${style}，柜体比例合理，材质真实，空间动线清晰，室内摄影级渲染。`, getPromptSkill("floorSkill"));
    await submitImageTask({ prompt, size: $("#floorSize").value, urls: [floorplanReference], count, targetId: "#floorResults", logId: "#floorLog", label: `${area}效果图`, source: "户型生图" });
  });
  $("#floorToVideoBtn")?.addEventListener("click", () => {
    if (!state.pendingVideoImages?.length) {
      toast("请先生成图片");
      return;
    }
    saveState();
    location.href = "video.html";
  });
}

function bindTextImage() {
  if (!$("#textImageForm")) return;
  const savedPrompt = sessionStorage.getItem("zhihui_quick_prompt");
  if (savedPrompt && $("#textPrompt") && !$("#textPrompt").value.trim()) $("#textPrompt").value = savedPrompt;
  ["textStyle", "textArea"].forEach((id) => {
    $(`#${id}`)?.addEventListener("change", () => toggleOther(id, `${id}OtherWrap`));
  });
  $("#optimizeTextPrompt")?.addEventListener("click", optimizeTextPrompt);
  $$(".prompt-shortcuts button").forEach((button) => {
    button.addEventListener("click", () => {
      $("#textPrompt").value = button.textContent.trim();
      $("#textPrompt").focus();
    });
  });
  $("#textImageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = $("#textPrompt").value.trim();
    if (!raw) {
      toast("请输入需求提示词");
      return;
    }
    const style = activeValue("textStyle", "textStyleOther");
    const area = activeValue("textArea", "textAreaOther");
    const count = Math.max(1, Math.min(4, Number($("#textCount").value || 1)));
    const prompt = withSkillPrompt(`${raw}，区域：${area}，风格：${style}，全屋定制效果图，高质量室内摄影，真实材质，专业灯光。`, getPromptSkill("textSkill"));
    await submitImageTask({ prompt, size: $("#textSize").value, urls: [], count, targetId: "#textResults", logId: "#textLog", label: `${area}效果图`, source: "文本生图" });
  });
  $("#textToVideoBtn")?.addEventListener("click", () => {
    if (!state.pendingVideoImages?.length) {
      toast("请先生成图片");
      return;
    }
    saveState();
    location.href = "video.html";
  });
}

function bindVideo() {
  if (!$("#videoForm")) return;
  if (state.pendingVideoImages?.length) {
    videoImages = state.pendingVideoImages.slice();
    $("#videoPreview").innerHTML = videoImages.map((url, index) => renderPreviewCard(url, `效果图 ${index + 1}`)).join("");
    $("#videoLog").textContent = "已带入刚生成的效果图，可继续剪辑。";
  }
  $("#videoUpload")?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    videoImages = await Promise.all(files.map(fileToDataUrl));
    $("#videoPreview").innerHTML = videoImages.map((url, index) => renderPreviewCard(url, files[index]?.name || `图片 ${index + 1}`)).join("");
    $("#videoLog").textContent = `已上传 ${files.length} 张图片。`;
  });
  $("#videoForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!videoImages.length) {
      toast("请先上传图片素材");
      return;
    }
    const cost = state.tier === "enterprise" ? 20 : state.tier === "member" ? 32 : 48;
    if (!charge(cost)) return;
    const description = `时长 ${$("#secondsPerImage").value}s / ${$("#transitionType").value} / ${$("#videoRatio").value}`;
    $("#videoResults").innerHTML = renderGeneratingCard("定制化视频");
    $("#videoLog").textContent = "正在剪辑视频，请稍候。";
    setTimeout(() => {
      $("#videoResults").innerHTML = renderResultCard(videoImages[0], "定制化视频", description, "video");
      $("#videoLog").textContent = "视频已生成，可点击预览放大查看，也可以保存到资产库。";
    }, 1000);
  });
}

function bindPricing() {
  $$(".price-card[data-plan]").forEach((card) => {
    card.querySelector("button")?.addEventListener("click", () => {
      const points = Number(card.dataset.points || 0);
      if (points) state.points += points;
      state.tier = card.dataset.plan === "member" ? "member" : state.tier;
      saveState();
      updatePoints();
      toast(points ? `会员已开通，赠送 ${points.toLocaleString("zh-CN")} 点积分` : "当前为普通版");
    });
  });
  $$(".pay-method").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".pay-method").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
  $("#rechargeAmount")?.addEventListener("input", () => {
    const amount = Number($("#rechargeAmount").value || 0);
    $("#payResult").textContent = `预计到账 ${(amount * 100).toLocaleString("zh-CN")} 点积分`;
  });
  $("#rechargeBtn")?.addEventListener("click", () => {
    const amount = Number($("#rechargeAmount").value || 0);
    const points = amount * 100;
    state.points += points;
    saveState();
    updatePoints();
    $("#payResult").textContent = `支付成功，到账 ${points.toLocaleString("zh-CN")} 点积分`;
    toast("充值成功");
  });
  $("#contactSalesBtn")?.addEventListener("click", () => {
    $("#salesModal")?.classList.add("open");
    document.body.classList.add("modal-open");
  });
  $("#salesClose")?.addEventListener("click", () => {
    $("#salesModal")?.classList.remove("open");
    syncModalOpenState();
  });
}

function liftDesktopAccountBar() {
  const accountBar = $(".app-header .header-actions");
  if (!accountBar || accountBar.classList.contains("account-topbar")) return;
  accountBar.classList.add("account-topbar");
  document.body.appendChild(accountBar);
}

function bindNavigation() {
  const nav = $(".top-nav");
  if (!nav) return;
  const page = document.body?.dataset?.page || "home";
  const items = [
    ["home", "index.html", "\u9996\u9875"],
    ["assets", "assets.html", "\u8d44\u4ea7\u5e93"],
    ["tutorial", "tutorial.html", "\u4f7f\u7528\u6559\u7a0b"]
  ];
  nav.innerHTML = items.map(([key, href, label]) => `<a class="${page === key ? "active" : ""}" href="${href}">${label}</a>`).join("");
}

function bindMobileNav() {
  if ($(".mobile-tabbar")) return;
  const page = document.body?.dataset?.page || "home";
  const items = [
    ["home", "index.html", "\u2302", "\u9996\u9875"],
    ["assets", "assets.html", "\u25a1", "\u8d44\u4ea7"],
    ["tutorial", "tutorial.html", "?", "\u6559\u7a0b"]
  ];
  const nav = document.createElement("nav");
  nav.className = "mobile-tabbar";
  nav.innerHTML = items.map(([key, href, icon, label]) => `<a class="${page === key ? "active" : ""}" href="${href}"><span>${icon}</span><b>${label}</b></a>`).join("");
  document.body.appendChild(nav);
}

function bindMobileDrawer() {
  const header = $(".app-header");
  const logo = $(".logo-link");
  if (!header || !logo || $(".mobile-menu-button")) return;
  const button = document.createElement("button");
  button.className = "mobile-menu-button";
  button.type = "button";
  button.setAttribute("aria-label", "打开菜单");
  button.innerHTML = "<span></span><span></span>";
  header.insertBefore(button, logo);
  button.addEventListener("click", () => document.body.classList.toggle("drawer-open"));
}

function renderAccountPanel() {
  $$(".profile-menu").forEach((menu) => {
    let popover = menu.querySelector(".profile-popover");
    if (!popover) {
      popover = document.createElement("div");
      popover.className = "profile-popover";
      menu.appendChild(popover);
    }
    popover.innerHTML = `
      <div class="account-profile">
        <strong>\u667a\u7ed8\u5168\u5c4b\u8d26\u6237</strong>
        <span>linyuping1215@gmail.com</span>
      </div>
      <div class="account-points-list">
        <p><span>\u4f1a\u5458\u79ef\u5206</span><b>0</b></p>
        <p><span>\u5957\u9910\u79ef\u5206</span><b>0</b></p>
        <p><span>\u8d2d\u4e70\u79ef\u5206</span><b>0</b></p>
        <p class="has-note"><span>\u6bcf\u5468\u79ef\u5206<small>\u6bcf\u5468\u4e00 00:00 \u5237\u65b0</small></span><b>200</b></p>
        <p><span>\u5956\u52b1\u79ef\u5206</span><b>0</b></p>
      </div>
      <a class="account-row" href="profile.html"><span>\u8fdb\u5165\u4e2a\u4eba\u4e2d\u5fc3</span><b>\u2192</b></a>
      <a class="account-row" href="pricing.html"><span>\u5f00\u901a\u4f1a\u5458</span><b>\u2192</b></a>
    `;
  });
}

function ensureSimpleModal() {
  let modal = $("#simpleModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "simpleModal";
  modal.className = "simple-modal";
  modal.innerHTML = `
    <div class="simple-modal-panel" role="dialog" aria-modal="true">
      <button type="button" class="modal-close" data-simple-close>&times;</button>
      <h2 data-simple-title></h2>
      <div data-simple-body></div>
      <div class="simple-modal-actions" data-simple-actions></div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openSimpleModal({ title, body, actions = "" }) {
  const modal = ensureSimpleModal();
  modal.querySelector("[data-simple-title]").textContent = title;
  modal.querySelector("[data-simple-body]").innerHTML = body;
  modal.querySelector("[data-simple-actions]").innerHTML = actions;
  modal.classList.add("open");
  document.body.classList.add("modal-open");
}

function closeSimpleModal() {
  $("#simpleModal")?.classList.remove("open");
  syncModalOpenState();
}

function openMemberModal(title = "开通会员", text = "开通会员后可解锁更多创作模式、查看案例创作过程，并支持定制专属模式。") {
  openSimpleModal({
    title,
    body: `<p>${escapeHtml(text)}</p>`,
    actions: `<a class="gradient-button" href="pricing.html">开通会员</a><button class="ghost-button" type="button" data-simple-close>稍后再说</button>`
  });
}

function openCustomModeModal() {
  openSimpleModal({
    title: "申请定制专属模式",
    body: `<form class="custom-mode-form"><input placeholder="姓名"><input placeholder="手机号"><input placeholder="公司名称"><input placeholder="业务类型"><input placeholder="想定制的模式"><textarea rows="3" placeholder="备注"></textarea></form>`,
    actions: `<button class="gradient-button" type="button" data-submit-custom>提交申请</button><button class="ghost-button" type="button" data-simple-close>取消</button>`
  });
}

function bindAccountCenter() {
  renderAccountPanel();
  document.addEventListener("click", (event) => {
    const avatarButton = event.target.closest(".avatar-button");
    if (avatarButton) {
      event.preventDefault();
      location.href = "profile.html";
      return;
    }
    if (event.target.closest("[data-open-member]")) openMemberModal();
    if (event.target.closest("[data-simple-close]") || event.target.id === "simpleModal") closeSimpleModal();
    if (event.target.closest("[data-submit-custom]")) {
      closeSimpleModal();
      toast("提交成功，我们会尽快联系你");
    }
  });
}

function ensureCaseModal() {
  let modal = $("#caseModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "caseModal";
  modal.className = "case-modal";
  modal.innerHTML = `
    <div class="case-modal-panel" role="dialog" aria-modal="true">
      <button class="modal-close" type="button" data-case-close>&times;</button>
      <div class="case-modal-art"></div>
      <div class="case-modal-copy">
        <span data-case-kind></span>
        <h2 data-case-title></h2>
        <p data-case-mode></p>
        <div class="case-meta-line" data-case-desc></div>
        <div class="case-modal-actions">
          <button class="gradient-button" type="button" data-case-share>分享</button>
          <button class="ghost-button" type="button" data-case-process>查看创作过程</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function closeCaseModal() {
  $("#caseModal")?.classList.remove("open");
  syncModalOpenState();
}

function bindCaseGallery() {
  const cases = $$(".gallery-case, .home-case-card");
  if (!cases.length) return;
  cases.forEach((card) => {
    card.addEventListener("click", () => {
      const modal = ensureCaseModal();
      modal.querySelector("[data-case-title]").textContent = card.dataset.caseTitle || "案例详情";
      modal.querySelector("[data-case-kind]").textContent = card.dataset.caseKind || card.dataset.caseType || "案例";
      modal.querySelector("[data-case-mode]").textContent = card.dataset.caseMode || "家装创作模式";
      modal.querySelector("[data-case-desc]").textContent = card.dataset.caseDesc || "查看图片与视频案例，快速了解不同模式可以生成什么内容。";
      modal.dataset.caseTitle = card.dataset.caseTitle || "";
      const cover = card.querySelector(".case-cover");
      const art = modal.querySelector(".case-modal-art");
      if (art && cover) art.className = `case-modal-art ${cover.className.replace("case-cover", "").trim()}`;
      modal.classList.add("open");
      document.body.classList.add("modal-open");
    });
  });
  document.addEventListener("click", (event) => {
    if (event.target.id === "caseModal" || event.target.closest("[data-case-close]")) closeCaseModal();
    if (event.target.closest("[data-case-share]")) {
      const title = $("#caseModal")?.dataset.caseTitle || "智绘全屋案例";
      navigator.clipboard?.writeText(`${location.origin}${location.pathname}#${encodeURIComponent(title)}`);
      toast("案例链接已复制");
    }
    if (event.target.closest("[data-case-process]")) {
      closeCaseModal();
      openMemberModal("开通会员，查看完整创作过程", "会员可查看案例的创作步骤、使用模式、提示词结构和参数配置，快速复刻同款内容。");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCaseModal();
  });
}

function init() {
  updatePoints();
  bindNavigation();
  liftDesktopAccountBar();
  bindAccountCenter();
  loadPromptSkills();
  bindPromptSkills();
  bindMobileDrawer();
  bindHome();
  bindFloorplan();
  bindTextImage();
  bindVideo();
  bindPricing();
  bindAssets();
  bindCaseGallery();
  bindMediaPreview();
  bindMobileNav();
  renderAssets();
}

init();
