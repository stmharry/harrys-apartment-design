let catalog;
let viewer;
let activeItem;
let activeId = "original";
let activeSpaceSlug = "living-room";
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
  miniMap: document.querySelector("#miniMap"),
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
  activeSpaceSlug =
    catalog.spaces.find((space) => space.slug === activeSpaceSlug && space.status === "active")
      ?.slug ??
    catalog.spaces.find((space) => space.status === "active")?.slug ??
    catalog.spaces[0]?.slug;
  renderSpaces();
  renderStyles();
  renderMiniMap();
  els.originalButton.addEventListener("click", () => selectItem(getOriginalItem()));
  els.copyPrompt.addEventListener("click", copyPrompt);
  els.toggleLibrary.addEventListener("click", () => togglePanel("library"));
  els.toggleDetail.addEventListener("click", () => togglePanel("detail"));
  setupViewerResizeStabilizer();
  selectItem(getOriginalItem());
}

function renderSpaces() {
  els.spaceTabs.innerHTML = "";
  catalog.spaces.forEach((space) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `space-tab ${space.slug === activeSpaceSlug ? "is-active" : ""} ${
      space.status === "active" ? "" : "is-planned"
    }`;
    button.textContent = space.label;
    button.disabled = space.status !== "active";
    button.addEventListener("click", () => selectSpace(space.slug));
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
          candidate.space === activeSpaceSlug &&
          candidate.style_slug === style.slug &&
          candidate.variant_slug === variant.slug
      );
      const button = document.createElement("button");
      button.type = "button";
      button.className = "variant-button";
      button.dataset.id = item?.id ?? `${activeSpaceSlug}--${style.slug}--${variant.slug}`;
      button.textContent = variant.label;
      button.disabled = !item;
      if (item) button.addEventListener("click", () => selectItem(item));
      variants.append(button);
    });

    section.append(head, variants);
    els.styleList.append(section);
  });
}

function selectSpace(spaceSlug) {
  if (spaceSlug === activeSpaceSlug) return;
  activeSpaceSlug = spaceSlug;
  renderSpaces();
  renderStyles();
  renderMiniMap();
  selectItemWithOptions(getOriginalItem(), { yaw: getSpaceDefaultYaw(spaceSlug), pitch: 0 });
}

function getOriginalItem() {
  const space = catalog.spaces.find((candidate) => candidate.slug === activeSpaceSlug);
  const label = space?.label ?? activeSpaceSlug;
  const referenceImage = space?.viewer_reference_image ?? space?.reference_image;

  return {
    ...original,
    id: `${activeSpaceSlug}--original`,
    variant: label,
    output_image: referenceImage,
    notes: `Reference ${label.toLowerCase()} panorama.`,
    space: activeSpaceSlug
  };
}

function selectItem(item) {
  return selectItemWithOptions(item);
}

function selectItemWithOptions(item, options = {}) {
  viewerPose = getViewerPose();
  if (Number.isFinite(options.yaw)) viewerPose.yaw = options.yaw;
  if (Number.isFinite(options.pitch)) viewerPose.pitch = options.pitch;
  if (Number.isFinite(options.hfov)) viewerPose.hfov = options.hfov;
  activeItem = item;
  activeId = item.id;
  updateOriginalButton();
  renderSpaces();
  renderMiniMap();
  document
    .querySelectorAll(".variant-button")
    .forEach((button) => button.classList.toggle("is-active", button.dataset.id === activeId));
  els.originalButton.classList.toggle("is-active", item.generation_status === "reference");

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
    hotSpots: getHotSpots(item),
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

function getHotSpots(item) {
  const space = getSpace(item.space);
  return (space?.hotspots ?? []).map((hotspot) => ({
    pitch: hotspot.pitch ?? -8,
    yaw: hotspot.yaw,
    type: "info",
    cssClass: "nav-hotspot",
    createTooltipFunc: createHotspotTooltip,
    createTooltipArgs: {
      ...hotspot,
      source: item.space
    },
    clickHandlerFunc: handleHotspotClick,
    clickHandlerArgs: {
      source: item.space,
      target: hotspot.target
    }
  }));
}

function createHotspotTooltip(hotSpotDiv, hotspot) {
  hotSpotDiv.classList.add("nav-hotspot");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = hotspot.label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    navigateToSpace(hotspot.target, hotspot.source);
  });
  hotSpotDiv.append(button);
}

function handleHotspotClick(_event, args) {
  navigateToSpace(args.target, args.source);
}

function navigateToSpace(targetSpaceSlug, sourceSpaceSlug = activeSpaceSlug) {
  const targetItem = resolveNavigationTarget(targetSpaceSlug);
  const yaw = getReturnYaw(targetSpaceSlug, sourceSpaceSlug);
  activeSpaceSlug = targetSpaceSlug;
  renderStyles();
  selectItemWithOptions(targetItem, {
    yaw,
    pitch: 0,
    hfov: safeViewerNumber("getHfov", viewerPose.hfov)
  });
}

function resolveNavigationTarget(targetSpaceSlug) {
  if (activeItem?.style_slug && activeItem?.variant_slug) {
    const matchingGeneratedItem = catalog.items.find(
      (item) =>
        item.space === targetSpaceSlug &&
        item.style_slug === activeItem.style_slug &&
        item.variant_slug === activeItem.variant_slug
    );
    if (matchingGeneratedItem) return matchingGeneratedItem;
  }

  return getOriginalItemForSpace(targetSpaceSlug);
}

function getOriginalItemForSpace(spaceSlug) {
  const previousSpaceSlug = activeSpaceSlug;
  activeSpaceSlug = spaceSlug;
  const item = getOriginalItem();
  activeSpaceSlug = previousSpaceSlug;
  return item;
}

function getReturnYaw(targetSpaceSlug, sourceSpaceSlug) {
  const targetSpace = getSpace(targetSpaceSlug);
  const returnHotspot = targetSpace?.hotspots?.find((hotspot) => hotspot.target === sourceSpaceSlug);
  return Number.isFinite(returnHotspot?.yaw) ? returnHotspot.yaw : getSpaceDefaultYaw(targetSpaceSlug);
}

function getSpaceDefaultYaw(spaceSlug) {
  const defaultYaw = getSpace(spaceSlug)?.default_yaw;
  return Number.isFinite(defaultYaw) ? defaultYaw : viewerPose.yaw;
}

function renderMiniMap() {
  if (!els.miniMap || !catalog?.spaces?.length) return;

  const spaces = catalog.spaces.filter((space) => space.position_ft);
  const bounds = getMapBounds(spaces);
  const edges = getMapEdges(spaces);

  els.miniMap.innerHTML = `
    <div class="mini-map-head">
      <span>Map</span>
      <strong>${readableSpace(activeSpaceSlug)}</strong>
    </div>
    <div class="mini-map-board">
      <svg class="mini-map-lines" viewBox="0 0 100 100" aria-hidden="true">
        ${edges
          .map((edge) => {
            const a = mapPoint(edge.source.position_ft, bounds);
            const b = mapPoint(edge.target.position_ft, bounds);
            return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
          })
          .join("")}
      </svg>
    </div>
  `;

  const board = els.miniMap.querySelector(".mini-map-board");
  spaces.forEach((space) => {
    const point = mapPoint(space.position_ft, bounds);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `map-node ${space.slug === activeSpaceSlug ? "is-active" : ""}`;
    button.style.left = `${point.x}%`;
    button.style.top = `${point.y}%`;
    button.title = space.label;
    button.setAttribute("aria-label", `Go to ${space.label}`);
    button.addEventListener("click", () => navigateToSpace(space.slug, activeSpaceSlug));

    const dot = document.createElement("span");
    dot.className = "map-node-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "map-node-label";
    label.textContent = shortSpaceLabel(space.slug);
    button.append(dot, label);
    board.append(button);
  });
}

function getMapBounds(spaces) {
  const xs = spaces.map((space) => space.position_ft.x);
  const ys = spaces.map((space) => space.position_ft.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function mapPoint(point, bounds) {
  const padding = 9;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  return {
    x: padding + ((point.x - bounds.minX) / width) * (100 - padding * 2),
    y: padding + ((bounds.maxY - point.y) / height) * (100 - padding * 2)
  };
}

function getMapEdges(spaces) {
  const bySlug = new Map(spaces.map((space) => [space.slug, space]));
  const seen = new Set();
  const edges = [];

  spaces.forEach((space) => {
    (space.hotspots ?? []).forEach((hotspot) => {
      const target = bySlug.get(hotspot.target);
      if (!target) return;
      const key = [space.slug, target.slug].sort().join("--");
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ source: space, target });
    });
  });

  return edges;
}

function shortSpaceLabel(slug) {
  return (
    {
      entryway: "Entry",
      "washer-dryer-closet": "W/D",
      bathroom: "Bath",
      kitchen: "Kitchen",
      "dining-room": "Dining",
      "living-room": "Living",
      bedroom: "Bed",
      balcony: "Balcony"
    }[slug] ?? readableSpace(slug)
  );
}

function updateOriginalButton() {
  const label = readableSpace(activeSpaceSlug);
  els.originalButton.querySelector("span").textContent = `Original ${label}`;
  els.originalButton.querySelector("small").textContent = "Reference panorama";
}

function readableSpace(slug) {
  return getSpace(slug)?.label ?? slug;
}

function getSpace(slug) {
  return catalog.spaces.find((space) => space.slug === slug);
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
