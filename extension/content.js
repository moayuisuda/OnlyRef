// LookBack Collector Content Script

const API_PORT = 30001;
const API_BASE = `http://localhost:${API_PORT}/api`;

const LOCAL_APP_PROBE_INTERVAL_MS = 5000;
const LOCAL_APP_PROBE_TIMEOUT_MS = 800;

let localAppAlive = false;
let localAppProbePromise = null;

async function probeLocalApp() {
  if (localAppProbePromise) return localAppProbePromise;

  localAppProbePromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      LOCAL_APP_PROBE_TIMEOUT_MS,
    );

    try {
      const res = await fetch(`${API_BASE}/tags`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      localAppAlive = res.ok;
    } catch {
      localAppAlive = false;
    } finally {
      clearTimeout(timeoutId);
      localAppProbePromise = null;
    }
  })();

  return localAppProbePromise;
}

async function fetchLatestTags() {
  if (!localAppAlive) return [];
  try {
    const res = await fetch(`${API_BASE}/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    void e;
    return [];
  }
}

// --- Floating Menu ---

const DRAG_THRESHOLD = 40;
let dragStartX = 0;
let dragSourceEl = null;
let dragFinalUrl = "";
let dragDirectionLeft = null;
let menuShown = false;

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function pickBestImageElement(container) {
  if (!container) return null;
  const imgs = Array.from(container.querySelectorAll("img"));
  if (imgs.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const img of imgs) {
    const url = img.currentSrc;
    if (!url) continue;
    const rect = img.getBoundingClientRect();
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    const urlScore = /pinimg\.com/i.test(url) ? 1000000000 : 0;
    const score = urlScore + area;
    if (score > bestScore) {
      bestScore = score;
      best = img;
    }
  }
  return best || imgs[0];
}

function parseCssUrl(value) {
  if (!value || typeof value !== "string") return "";
  const match = /url\((['"]?)(.*?)\1\)/i.exec(value);
  return match?.[2] || "";
}

function getElementBackgroundImageUrl(el) {
  if (!(el instanceof Element)) return "";
  return parseCssUrl(window.getComputedStyle(el).backgroundImage);
}

function findBestImageNearby(el) {
  if (!(el instanceof Element)) return null;
  const direct = el.tagName === "IMG" ? el : el.closest("img");
  if (direct instanceof HTMLImageElement && (direct.currentSrc || direct.src))
    return direct;

  let cur = el;
  for (let i = 0; i < 6 && cur; i++) {
    const img = pickBestImageElement(cur);
    if (img) return img;
    cur = cur.parentElement;
  }
  return null;
}

function upgradeTwimgUrl(url) {
  try {
    const u = new URL(url);
    if (!/twimg\.com$/i.test(u.hostname)) return url;
    u.searchParams.set("name", "orig");
    return u.toString();
  } catch {
    return url;
  }
}

function upgradePinimgUrl(url) {
  try {
    const u = new URL(url);
    if (!/pinimg\.com$/i.test(u.hostname)) return url;
    const parts = u.pathname.split("/");
    const sizeSegment = parts[1] || "";
    if (/^\d+x(\d+)?$/i.test(sizeSegment)) {
      parts[1] = "originals";
      u.pathname = parts.join("/");
    }
    return u.toString();
  } catch {
    return url;
  }
}

function getLargestSrcsetUrl(img) {
  if (!(img instanceof HTMLImageElement)) return "";
  const raw = (img.getAttribute("srcset") || img.srcset || "").trim();
  if (!raw) return "";

  let bestUrl = "";
  let bestScore = -1;

  const parts = raw.split(",");
  for (const part of parts) {
    const candidate = part.trim();
    if (!candidate) continue;

    const tokens = candidate.split(/\s+/).filter(Boolean);
    const urlToken = tokens[0] || "";
    if (!urlToken) continue;
    if (/^\d+(?:\.\d+)?[wx]$/i.test(urlToken)) continue;

    const descriptor = tokens[1] || "";
    const match = /^(\d+(?:\.\d+)?)(w|x)$/i.exec(descriptor);
    const score = match
      ? Number(match[1]) * (match[2].toLowerCase() === "x" ? 1000 : 1)
      : 0;

    if (score >= bestScore) {
      bestScore = score;
      bestUrl = urlToken;
    }
  }

  if (!bestUrl) return "";

  try {
    return new URL(bestUrl, document.baseURI).toString();
  } catch {
    return bestUrl;
  }
}

function getDomainParserKey(hostname) {
  if (/huaban\./i.test(hostname)) return "huaban.com";
  if (/pinterest\./i.test(hostname)) return "pinterest.com";
  if (/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(hostname)) return "x.com";
  return "default";
}

function parseDefaultFinalUrl(el) {
  if (!(el instanceof Element)) return "";

  const img = findBestImageNearby(el);
  if (img) return img.currentSrc || img.src || "";

  return getElementBackgroundImageUrl(el) || "";
}

function parsePinterestFinalUrl(el) {
  if (!(el instanceof Element)) return "";
  const pinImg = resolvePinterestImageFromTarget(el);
  // Pinterest images usually expose multiple candidates via srcset; pick the largest one for storage.
  const url = pinImg
    ? getLargestSrcsetUrl(pinImg) || pinImg.currentSrc || pinImg.src || ""
    : parseDefaultFinalUrl(el);
  return upgradePinimgUrl(url);
}

function parseXFinalUrl(el) {
  if (!(el instanceof Element)) return "";
  return upgradeTwimgUrl(parseDefaultFinalUrl(el));
}

function parseHuabanFinalUrl(el) {
  if (!(el instanceof Element)) return "";
  const url = parseDefaultFinalUrl(el);
  return url ? url.replace(/_fw\d+webp/i, "") : "";
}

function resolveXInfo(el) {
  if (!el) return { name: "" };

  let current = el;
  let tweetTextEl = null;

  const tweetContainer =
    el.closest('[data-testid="tweet"]') || el.closest("article");

  if (tweetContainer) {
    tweetTextEl = tweetContainer.querySelector('[data-testid="tweetText"]');
  } else {
    for (let i = 0; i < 20; i++) {
      if (!current || current === document.body) break;
      current = current.parentElement;
      if (current) {
        const found = current.querySelector('[data-testid="tweetText"]');
        if (found) {
          tweetTextEl = found;
          break;
        }
      }
    }
  }

  if (!tweetTextEl) return { name: "" };

  const clone = tweetTextEl.cloneNode(true);
  clone.querySelectorAll('a[href*="/hashtag/"]').forEach((el) => el.remove());
  const name = clone.innerText.replace(/[\r\n]+/g, " ").trim();

  return { name };
}

function resolvePinterestInfo(el) {
  if (!(el instanceof Element)) return { name: "" };

  const normalizeText = (text) => (text || "").replace(/\s+/g, " ").trim();

  const closeupTitleEl = document.querySelector(
    '[data-test-id="closeup-title"] h1',
  );
  const closeupTitle = normalizeText(closeupTitleEl?.textContent || "");
  if (closeupTitle) return { name: closeupTitle };

  const pinContainer = el.closest('[data-test-id="pin"]');
  if (!pinContainer) return { name: "" };

  const footerTitleAnchor =
    pinContainer.querySelector(
      '[data-test-id="pinrep-footer-organic-title"] a',
    ) ||
    pinContainer.querySelector("h2 a") ||
    pinContainer.querySelector('a[href*="/pin/"]');

  let name = normalizeText(footerTitleAnchor?.textContent || "");

  return { name };
}

const finalUrlParsers = new Map([
  ["x.com", parseXFinalUrl],
  ["pinterest.com", parsePinterestFinalUrl],
  ["huaban.com", parseHuabanFinalUrl],
  ["default", parseDefaultFinalUrl],
]);
const dragElementResolvers = new Map([
  ["pinterest.com", resolvePinterestDragElement],
  ["default", resolveDefaultDragElement],
]);

function resolveFinalUrlFromElement(el) {
  const host = getHostname(window.location.href);
  const key = getDomainParserKey(host);
  const parser = finalUrlParsers.get(key) || finalUrlParsers.get("default");
  const url = parser ? parser(el) : "";
  return typeof url === "string" ? url.trim() : "";
}

function resolvePinterestImageFromTarget(el) {
  if (!(el instanceof Element)) return null;
  const direct = el.tagName === "IMG" ? el : el.closest("img");
  if (direct) {
    const url = direct.currentSrc;
    if (/pinimg\.com/i.test(url)) return direct;
  }
  const pinCard =
    el.closest('[data-test-id="pincard-image-without-link"]') ||
    el.closest('[data-test-id="pin"]');
  if (pinCard) {
    const img = pickBestImageElement(pinCard);
    if (img) return img;
  }
  const overlay = el.closest('[data-test-id="pin-card-hover-overlay"]');
  if (overlay) {
    const container =
      overlay.closest('[data-test-id="pincard-image-without-link"]') ||
      overlay.parentElement;
    const img = pickBestImageElement(container);
    if (img) return img;
  }
  let cur = el;
  for (let i = 0; i < 8 && cur; i++) {
    const img = pickBestImageElement(cur);
    if (img) {
      const url = img.currentSrc;
      if (/pinimg\.com/i.test(url)) return img;
    }
    cur = cur.parentElement;
  }
  return null;
}

function resolveDefaultDragElement(el) {
  const img = el instanceof HTMLImageElement ? el : el.closest("img");
  if (img instanceof HTMLImageElement) return img;
  return el;
}

function resolvePinterestDragElement(el) {
  const pinImg = resolvePinterestImageFromTarget(el);
  if (pinImg) return pinImg;
  return resolveDefaultDragElement(el);
}

function resolveDragSourceElement(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return null;
  const host = getHostname(window.location.href);
  const key = getDomainParserKey(host);
  const resolver =
    dragElementResolvers.get(key) || dragElementResolvers.get("default");
  return resolver(el);
}

function createMenu(tags) {
  const menu = document.createElement("div");
  menu.id = "pic-captain-menu";
  menu.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    min-width: 140px;
    max-width: 200px;
    opacity: 0;
    pointer-events: auto;
    transition: opacity 0.1s;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const defaultItem = createMenuItem("Default", null, "#39c5bb", "folder");
  menu.appendChild(defaultItem);

  if (tags && tags.length > 0) {
    const divider = document.createElement("div");
    divider.style.cssText = "height: 1px; background: #333; margin: 2px 0;";
    menu.appendChild(divider);

    tags.forEach((tagObj) => {
      const name = typeof tagObj === "string" ? tagObj : tagObj.name;
      const color =
        typeof tagObj === "object" && tagObj.color ? tagObj.color : "#8b5cf6";
      menu.appendChild(createMenuItem(name, name, color, "tag"));
    });
  }

  return menu;
}

function createIcon(type, color) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";
  svg.style.pointerEvents = "none";
  svg.style.display = "block";

  if (type === "folder") {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z",
    );
    svg.appendChild(path);
    svg.style.fill = color + "33"; // 20% opacity fill
  } else {
    // tag
    const path1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path1.setAttribute(
      "d",
      "M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z",
    );
    const path2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path2.setAttribute("d", "M7 7h.01");
    svg.appendChild(path1);
    svg.appendChild(path2);
    svg.style.fill = color + "33"; // 20% opacity fill
  }
  return svg;
}

function createMenuItem(label, tag, color, iconType) {
  const item = document.createElement("div");
  item.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    color: #e5e7eb;
    font-size: 13px;
    transition: background 0.1s;
    background: transparent;
  `;

  // Icon
  const icon = createIcon(iconType || "tag", color);

  const text = document.createElement("span");
  text.textContent = label;
  text.style.cssText = `
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  `;

  item.appendChild(icon);
  item.appendChild(text);

  // Drag events
  let dragCounter = 0;

  item.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    item.style.background = "rgba(255, 255, 255, 0.1)";
  });

  item.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      item.style.background = "transparent";
    }
  });

  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  });

  item.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCounter = 0;
    hideMenu();

    if (!localAppAlive) return;

    const imageUrl =
      dragFinalUrl ||
      (dragSourceEl ? resolveFinalUrlFromElement(dragSourceEl) : "");

    if (imageUrl) {
      let extraTags = [];
      let contentName = "";

      const host = getHostname(window.location.href);
      const key = getDomainParserKey(host);
      if (key === "x.com" && dragSourceEl) {
        const info = resolveXInfo(dragSourceEl);
        if (info.name) contentName = info.name;
      }
      if (key === "pinterest.com" && dragSourceEl) {
        const info = resolvePinterestInfo(dragSourceEl);
        if (info.name) contentName = info.name;
      }

      const finalTags = tag ? [tag, ...extraTags] : extraTags;
      await collectImage(imageUrl, finalTags, contentName);
    }
  });

  return item;
}

async function showMenu(sourceElement, isLeft) {
  await probeLocalApp();
  if (!localAppAlive) return;
  hideMenu();
  const tags = await fetchLatestTags();
  const menu = createMenu(tags);
  document.body.appendChild(menu);

  const rect = sourceElement.getBoundingClientRect();
  menu.style.visibility = "hidden";
  menu.style.display = "flex";
  menu.style.opacity = "0";

  const actualWidth = menu.offsetWidth;
  const actualHeight = menu.offsetHeight;
  const gap = 12;

  let left;
  let top = rect.top;

  if (isLeft) {
    left = rect.left - actualWidth - gap;
  } else {
    left = rect.right + gap;
  }

  if (top + actualHeight > window.innerHeight) {
    top = window.innerHeight - actualHeight - 10;
  }
  if (top < 10) top = 10;

  if (left < 10) left = 10;
  if (left + actualWidth > window.innerWidth)
    left = window.innerWidth - actualWidth - 10;

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  menu.style.visibility = "visible";
  menu.offsetHeight;
  menu.style.opacity = "1";
}

function hideMenu() {
  const el = document.getElementById("pic-captain-menu");
  if (el) el.remove();
}

// Collection Logic
async function collectImage(imageUrl, tags, nameOverride) {
  await probeLocalApp();
  if (!localAppAlive) return;
  try {
    showNotification("Collecting...", "info");

    const pageUrl = window.location.href;
    const name = nameOverride || "";

    const res = await fetch(`${API_BASE}/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageUrl,
        pageUrl,
        tags,
        name,
      }),
    });

    if (res.ok) {
      showNotification("Image collected!", "success");
    } else {
      const err = await res.json();
      throw new Error(err.error || "Unknown error");
    }
  } catch (e) {
    console.error("Collection failed", e);
    showNotification(`Failed: ${e.message}`, "error");
  }
}

function showNotification(message, type) {
  const div = document.createElement("div");
  div.textContent = message;
  const bg =
    type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#3b82f6";

  div.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${bg};
    color: white;
    padding: 8px 16px;
    border-radius: 99px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    animation: slideDown 0.2s ease-out;
  `;

  if (!document.getElementById("pic-captain-styles")) {
    const style = document.createElement("style");
    style.id = "pic-captain-styles";
    style.textContent = `
      @keyframes slideDown {
        from { transform: translate(-50%, -10px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(div);

  setTimeout(() => {
    div.style.transition = "opacity 0.3s";
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 300);
  }, 2000);
}

function init() {
  // --- Ghost Image Setup (canvas based) ---
  const ghostCanvas = document.createElement("canvas");
  ghostCanvas.width = 100;
  ghostCanvas.height = 100;
  ghostCanvas.style.cssText = "position: absolute; top: -9999px;";
  document.body.append(ghostCanvas);

  void probeLocalApp();
  setInterval(() => void probeLocalApp(), LOCAL_APP_PROBE_INTERVAL_MS);

  // --- Event Listeners ---

  document.addEventListener(
    "dragstart",
    (e) => {
      debugger;
      if (!localAppAlive) {
        void probeLocalApp();
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      const sourceEl = target ? resolveDragSourceElement(target) : null;
      if (sourceEl) {
        dragStartX = e.clientX;
        dragSourceEl = sourceEl;
        dragFinalUrl = resolveFinalUrlFromElement(sourceEl);
        dragDirectionLeft = null;
        menuShown = false;

        const ghostImg =
          sourceEl instanceof HTMLImageElement
            ? sourceEl
            : findBestImageNearby(sourceEl);
        const ctx = ghostCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
          if (ghostImg) {
            const rect = ghostImg.getBoundingClientRect();
            const iw = rect.width || ghostImg.naturalWidth || 100;
            const ih = rect.height || ghostImg.naturalHeight || 100;
            const scale = Math.min(
              ghostCanvas.width / iw,
              ghostCanvas.height / ih,
              1,
            );
            const dw = iw * scale;
            const dh = ih * scale;
            const dx = (ghostCanvas.width - dw) / 2;
            const dy = (ghostCanvas.height - dh) / 2;
            ctx.drawImage(ghostImg, dx, dy, dw, dh);
          }
        }

        if (e.dataTransfer && e.dataTransfer.setDragImage) {
          e.dataTransfer.setDragImage(ghostCanvas, 0, 0);
        }
      }
    },
    true,
  );

  document.addEventListener(
    "dragover",
    (e) => {
      if (!localAppAlive) return;
      if (!dragSourceEl) return;

      const dx = e.clientX - dragStartX;

      if (!menuShown && Math.abs(dx) >= DRAG_THRESHOLD) {
        const isLeft = dx < 0;
        dragDirectionLeft = isLeft;
        menuShown = true;

        const offsetX = isLeft ? -12 : ghostCanvas.width + 12;
        if (e.dataTransfer && e.dataTransfer.setDragImage) {
          e.dataTransfer.setDragImage(ghostCanvas, offsetX, 0);
        }
        showMenu(dragSourceEl, isLeft);
      } else if (menuShown && dragDirectionLeft !== null) {
        const offsetX = dragDirectionLeft ? -12 : ghostCanvas.width + 12;
        if (e.dataTransfer && e.dataTransfer.setDragImage) {
          e.dataTransfer.setDragImage(ghostCanvas, offsetX, 0);
        }
      }
    },
    true,
  );

  document.addEventListener(
    "dragend",
    () => {
      dragSourceEl = null;
      dragFinalUrl = "";
      dragDirectionLeft = null;
      menuShown = false;
      hideMenu();
    },
    true,
  );
}

const SITE_LOAD_CHECKS = [
  {
    pattern: /pinterest\./i,
    selector: "#VerticalNavContent",
  },
];

function startApp() {
  let inited = false;
  const initOnce = () => {
    if (inited) return;
    inited = true;
    init();
  };

  const waitForSelectorByRaf = (selector, timeoutMs) => {
    const startAt = performance.now();
    const tick = () => {
      if (document.querySelector(selector)) {
        initOnce();
        return;
      }
      if (performance.now() - startAt >= timeoutMs) {
        initOnce();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const host = window.location.hostname;
  const site = SITE_LOAD_CHECKS.find((s) => s.pattern.test(host));

  if (site) {
    if (document.querySelector(site.selector)) {
      initOnce();
    } else {
      waitForSelectorByRaf(site.selector, 8000);
    }
  } else {
    if (document.readyState === "complete") {
      initOnce();
    } else {
      window.addEventListener("load", initOnce, { once: true });
    }
  }
}

startApp();
