let catalog;
let viewer;
let activeId = "original";
let viewerPose = {
  pitch: 0,
  yaw: 15,
  hfov: 98
};
let resizeAnimationFrame;
let resizeInterval;

const els = {
  shell: document.querySelector(".shell"),
  libraryPanel: document.querySelector("#libraryPanel"),
  detailPanel: document.querySelector("#detailPanel"),
  toggleLibrary: document.querySelector("#toggleLibrary"),
  toggleDetail: document.querySelector("#toggleDetail"),
  spaceTabs: document.querySelector("#spaceTabs"),
  styleList: document.querySelector("#styleList"),
  originalButton: document.querySelector("#originalButton"),
  viewerStyle: document.querySelector("#viewerStyle"),
  viewerVariant: document.querySelector("#viewerVariant"),
  detailTitle: document.querySelector("#detailTitle"),
  detailNotes: document.querySelector("#detailNotes"),
  metaSpace: document.querySelector("#metaSpace"),
  metaImage: document.querySelector("#metaImage"),
  metaGeneration: document.querySelector("#metaGeneration"),
  promptText: document.querySelector("#promptText"),
  copyPrompt: document.querySelector("#copyPrompt")
};

const original = {
  id: "original",
  style: "Original",
  variant: "Living Room",
  output_image: "assets/reference/living-room-original-viewer.jpg",
  notes: "Reference living room panorama.",
  prompt: "Original reference image. No generated prompt.",
  space: "living-room",
  generation_status: "reference"
};

init();

async function init() {
  catalog = await fetch("data/prompts.json").then((response) => response.json());
  renderSpaces();
  renderStyles();
  els.originalButton.addEventListener("click", () => selectItem(original));
  els.copyPrompt.addEventListener("click", copyPrompt);
  els.toggleLibrary.addEventListener("click", () => togglePanel("library"));
  els.toggleDetail.addEventListener("click", () => togglePanel("detail"));
  setupViewerResizeStabilizer();
  selectItem(original);
}

function renderSpaces() {
  els.spaceTabs.innerHTML = "";
  catalog.spaces.forEach((space) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `space-tab ${space.status === "active" ? "is-active" : "is-planned"}`;
    button.textContent = space.label;
    button.disabled = space.status !== "active";
    els.spaceTabs.append(button);
  });
}

function renderStyles() {
  els.styleList.innerHTML = "";
  catalog.styles.forEach((style) => {
    const section = document.createElement("section");
    section.className = "style-card";

    const head = document.createElement("div");
    head.className = "style-head";
    head.innerHTML = `
      <div>
        <h3>${style.label}</h3>
        <p>${style.summary}</p>
      </div>
      <div class="swatches" aria-hidden="true">
        ${style.palette.map((color) => `<span style="--swatch:${color}"></span>`).join("")}
      </div>
    `;

    const variants = document.createElement("div");
    variants.className = "variant-row";
    style.variants.forEach((variant) => {
      const item = catalog.items.find(
        (candidate) =>
          candidate.style_slug === style.slug && candidate.variant_slug === variant.slug
      );
      const button = document.createElement("button");
      button.type = "button";
      button.className = "variant-button";
      button.dataset.id = item.id;
      button.textContent = variant.label;
      button.addEventListener("click", () => selectItem(item));
      variants.append(button);
    });

    section.append(head, variants);
    els.styleList.append(section);
  });
}

function selectItem(item) {
  viewerPose = getViewerPose();
  activeId = item.id;
  document
    .querySelectorAll(".variant-button")
    .forEach((button) => button.classList.toggle("is-active", button.dataset.id === activeId));
  els.originalButton.classList.toggle("is-active", activeId === "original");

  const panoramaPath = item.output_image;
  if (viewer) viewer.destroy();
  viewer = pannellum.viewer("panorama", {
    type: "equirectangular",
    panorama: panoramaPath,
    autoLoad: true,
    showControls: true,
    compass: false,
    minHfov: 55,
    maxHfov: 120,
    pitch: viewerPose.pitch,
    yaw: viewerPose.yaw,
    hfov: viewerPose.hfov,
    horizonPitch: 0,
    horizonRoll: 0,
    backgroundColor: [17, 19, 18]
  });
  stabilizeViewerResize();

  els.viewerStyle.textContent = item.style;
  els.viewerVariant.textContent = item.variant;
  els.detailTitle.textContent = `${item.style} / ${item.variant}`;
  els.detailNotes.textContent = item.notes;
  els.metaSpace.textContent = readableSpace(item.space);
  els.metaImage.textContent = panoramaPath;
  els.metaGeneration.textContent = readableStatus(item.generation_status);
  els.promptText.textContent = item.prompt;
}

function readableSpace(slug) {
  return catalog.spaces.find((space) => space.slug === slug)?.label ?? slug;
}

function readableStatus(status) {
  return (
    {
      reference: "Reference",
      "built-in-image-generation": "Built-in image generation",
      "temporary-local-derivative": "Temporary local derivative"
    }[status] ?? status
  );
}

async function copyPrompt() {
  await navigator.clipboard.writeText(els.promptText.textContent);
  els.copyPrompt.textContent = "Copied";
  window.setTimeout(() => {
    els.copyPrompt.textContent = "Copy";
  }, 1200);
}

function togglePanel(panelName) {
  const panel = panelName === "library" ? els.libraryPanel : els.detailPanel;
  setPanelCollapsed(panelName, !panel.classList.contains("is-collapsed"));
}

function setPanelCollapsed(panelName, collapsed) {
  const isLibrary = panelName === "library";
  const panel = isLibrary ? els.libraryPanel : els.detailPanel;
  const toggle = isLibrary ? els.toggleLibrary : els.toggleDetail;
  const icon = toggle.querySelector(".toggle-icon");
  const readableName = isLibrary ? "style library" : "prompt detail";

  panel.classList.toggle("is-collapsed", collapsed);
  els.shell.classList.toggle(`is-${panelName}-collapsed`, collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.title = `${collapsed ? "Expand" : "Collapse"} ${readableName}`;
  icon.textContent = isLibrary
    ? collapsed
      ? ">"
      : "<"
    : collapsed
      ? "<"
      : ">";

  stabilizeViewerResize();
}

function getViewerPose() {
  if (!viewer) return viewerPose;
  return {
    pitch: safeViewerNumber("getPitch", viewerPose.pitch),
    yaw: safeViewerNumber("getYaw", viewerPose.yaw),
    hfov: safeViewerNumber("getHfov", viewerPose.hfov)
  };
}

function safeViewerNumber(method, fallback) {
  try {
    const value = viewer?.[method]?.();
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function setupViewerResizeStabilizer() {
  els.shell.addEventListener("transitionrun", (event) => {
    if (event.propertyName === "grid-template-columns") stabilizeViewerResize();
  });
  els.shell.addEventListener("transitionend", (event) => {
    if (event.propertyName === "grid-template-columns") resizeViewerNow();
  });
  window.addEventListener("resize", () => stabilizeViewerResize());

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => scheduleViewerResize());
    observer.observe(document.querySelector(".stage"));
    observer.observe(document.querySelector("#panorama"));
  }
}

function stabilizeViewerResize() {
  resizeViewerNow();
  scheduleViewerResize();
  window.clearInterval(resizeInterval);
  resizeInterval = window.setInterval(resizeViewerNow, 45);
  window.setTimeout(() => window.clearInterval(resizeInterval), 360);
}

function scheduleViewerResize() {
  window.cancelAnimationFrame(resizeAnimationFrame);
  resizeAnimationFrame = window.requestAnimationFrame(resizeViewerNow);
}

function resizeViewerNow() {
  if (viewer?.resize) viewer.resize();
}
