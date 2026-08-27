(function () {
  const captchaScreen = document.getElementById("captcha-screen");
  const promoScreen = document.getElementById("promo-screen");
  const stageInner = document.querySelector(".captcha-stage-inner");
  const bgImage = document.getElementById("captcha-bg");
  const hat = document.getElementById("hat-piece");
  const verifyBtn = document.getElementById("verify-btn");
  const statusEl = document.getElementById("status");
  const promoCodeEl = document.getElementById("promo-code");
  const promoCopyBtn = document.getElementById("promo-copy-btn");
  const promoCopyStatusEl = document.getElementById("promo-copy-status");

  const tg = window.Telegram ? window.Telegram.WebApp : null;
  if (tg) {
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === "function") {
      tg.disableVerticalSwipes();
    }
  }

  const hatPosition = { x: 0, y: 0 };
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  let captchaConfig = null;
  let displayScale = 1;
  let hasInitialPosition = false;
  let resizeTimer = null;

  const messages = {
    verifying: "Проверяем...",
    wrong_position: "Мимо. Попробуйте ещё раз.",
    rate_limited: "Слишком много попыток. Подождите немного.",
    invalid_init_data: "Ошибка авторизации Telegram.",
    invalid_user: "Не удалось определить пользователя.",
    invalid_coordinates: "Некорректные координаты.",
    network_error: "Ошибка сети. Попробуйте снова.",
    near: "Почти! Можно проверять.",
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getScale() {
    if (!bgImage.naturalWidth) {
      return 1;
    }
    const renderedWidth = bgImage.getBoundingClientRect().width;
    if (!renderedWidth) {
      return 1;
    }
    return renderedWidth / bgImage.naturalWidth;
  }

  function applyHatVisualPosition(animate) {
    const x = hatPosition.x * displayScale;
    const y = hatPosition.y * displayScale;
    hat.style.setProperty("--hat-x", x + "px");
    hat.style.setProperty("--hat-y", y + "px");
    hat.style.transition = animate ? "transform 0.28s ease" : "none";
    hat.style.transform = `translate(${x}px, ${y}px)`;
    updateProximityFeedback();
  }

  function getHatCenter() {
    const slot = captchaConfig.hatSlot;
    return {
      x: hatPosition.x + slot.w / 2,
      y: hatPosition.y + slot.h / 2,
    };
  }

  function getSlotCenter() {
    const slot = captchaConfig.hatSlot;
    return {
      x: slot.x + slot.w / 2,
      y: slot.y + slot.h / 2,
    };
  }

  function updateProximityFeedback() {
    if (!captchaConfig) {
      return;
    }
    const tolerance = captchaConfig.tolerance || 48;
    const hatCenter = getHatCenter();
    const slotCenter = getSlotCenter();
    const deltaX = Math.abs(hatCenter.x - slotCenter.x);
    const deltaY = Math.abs(hatCenter.y - slotCenter.y);
    const isNear = deltaX <= tolerance * 1.2 && deltaY <= tolerance * 1.2;

    if (isNear && !dragging && !statusEl.classList.contains("error")) {
      statusEl.textContent = messages.near;
      statusEl.className = "status ok";
    } else if (!dragging && statusEl.textContent === messages.near) {
      statusEl.textContent = "";
      statusEl.className = "status";
    }
  }

  function hatOverlapsSlot(x, y, slot, margin) {
    return !(
      x + slot.w + margin < slot.x ||
      slot.x + slot.w + margin < x ||
      y + slot.h + margin < slot.y ||
      slot.y + slot.h + margin < y
    );
  }

  function getRandomCornerPosition() {
    const slot = captchaConfig.hatSlot;
    const maxX = Math.max(captchaConfig.imageWidth - slot.w, 0);
    const maxY = Math.max(captchaConfig.imageHeight - slot.h, 0);
    const pad = 12;

    const corners = [
      { x: pad, y: pad },
      { x: maxX - pad, y: pad },
      { x: pad, y: maxY - pad },
      { x: maxX - pad, y: maxY - pad },
    ];

    const validCorners = corners
      .filter((corner) => !hatOverlapsSlot(corner.x, corner.y, slot, 16))
      .sort(() => Math.random() - 0.5);

    if (validCorners.length > 0) {
      return validCorners[0];
    }

    const slotCenterX = slot.x + slot.w / 2;
    const slotCenterY = slot.y + slot.h / 2;
    return corners.reduce((best, corner) => {
      const centerX = corner.x + slot.w / 2;
      const centerY = corner.y + slot.h / 2;
      const bestCenterX = best.x + slot.w / 2;
      const bestCenterY = best.y + slot.h / 2;
      const distance =
        (centerX - slotCenterX) ** 2 + (centerY - slotCenterY) ** 2;
      const bestDistance =
        (bestCenterX - slotCenterX) ** 2 + (bestCenterY - slotCenterY) ** 2;
      return distance > bestDistance ? corner : best;
    });
  }

  function placeHatInRandomCorner() {
    const corner = getRandomCornerPosition();
    const slot = captchaConfig.hatSlot;
    const maxX = Math.max(captchaConfig.imageWidth - slot.w, 0);
    const maxY = Math.max(captchaConfig.imageHeight - slot.h, 0);

    hatPosition.x = clamp(corner.x, 0, maxX);
    hatPosition.y = clamp(corner.y, 0, maxY);
  }

  function layoutCaptcha() {
    if (!captchaConfig) {
      return;
    }

    displayScale = getScale();
    const slot = captchaConfig.hatSlot;

    hat.style.width = slot.w * displayScale + "px";
    hat.style.height = slot.h * displayScale + "px";

    if (!hasInitialPosition) {
      placeHatInRandomCorner();
      hasInitialPosition = true;
    }

    applyHatVisualPosition(false);
  }

  function setHatPositionNatural(naturalX, naturalY, animate) {
    const slot = captchaConfig.hatSlot;
    const maxX = Math.max(captchaConfig.imageWidth - slot.w, 0);
    const maxY = Math.max(captchaConfig.imageHeight - slot.h, 0);

    hatPosition.x = clamp(naturalX, 0, maxX);
    hatPosition.y = clamp(naturalY, 0, maxY);
    applyHatVisualPosition(animate);
  }

  function setHatPositionDisplay(displayX, displayY) {
    setHatPositionNatural(displayX / displayScale, displayY / displayScale, false);
  }

  function shakeHat() {
    hat.classList.remove("shake");
    void hat.offsetWidth;
    hat.classList.add("shake");
    statusEl.textContent = messages.wrong_position;
    statusEl.className = "status error";
  }

  function snapToSlot() {
    return new Promise((resolve) => {
      const slot = captchaConfig.hatSlot;
      setHatPositionNatural(slot.x, slot.y, true);
      setTimeout(resolve, 300);
    });
  }

  function pointerDown(event) {
    event.preventDefault();
    dragging = true;
    hat.classList.add("dragging");
    statusEl.textContent = "";
    statusEl.className = "status";
    const rect = hat.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    hat.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    if (!dragging) {
      return;
    }
    event.preventDefault();
    const stageRect = stageInner.getBoundingClientRect();
    const x = event.clientX - stageRect.left - offsetX;
    const y = event.clientY - stageRect.top - offsetY;
    setHatPositionDisplay(x, y);
  }

  function pointerUp(event) {
    if (!dragging) {
      return;
    }
    event.preventDefault();
    dragging = false;
    hat.classList.remove("dragging");
    applyHatVisualPosition(false);
  }

  async function loadConfig() {
    const response = await fetch("/api/captcha/config");
    if (!response.ok) {
      throw new Error("config");
    }
    captchaConfig = await response.json();
  }

  function bindResizeHandlers() {
    const relayout = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layoutCaptcha, 80);
    };

    window.addEventListener("resize", relayout);
    window.addEventListener("orientationchange", relayout);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", relayout);
    }

    if (tg && typeof tg.onEvent === "function") {
      tg.onEvent("viewportChanged", relayout);
    }

    if (typeof ResizeObserver !== "undefined" && stageInner) {
      const observer = new ResizeObserver(relayout);
      observer.observe(stageInner);
    }
  }

  function showPromoScreen() {
    captchaScreen.classList.add("hidden");
    promoScreen.classList.remove("hidden");
  }

  async function copyPromoCode() {
    const promoCode = promoCodeEl.textContent.trim();
    if (!promoCode) {
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(promoCode);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = promoCode;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      promoCopyBtn.classList.add("copied");
      promoCopyStatusEl.textContent = "Промокод скопирован";
      if (tg && typeof tg.HapticFeedback?.notificationOccurred === "function") {
        tg.HapticFeedback.notificationOccurred("success");
      }

      setTimeout(() => {
        promoCopyBtn.classList.remove("copied");
        promoCopyStatusEl.textContent = "";
      }, 2000);
    } catch (_error) {
      promoCopyStatusEl.textContent = "Не удалось скопировать";
    }
  }

  async function verifyCaptcha() {
    statusEl.textContent = messages.verifying;
    statusEl.className = "status";
    verifyBtn.disabled = true;

    const body = {
      initData: tg ? tg.initData : "",
      hatX: Math.round(hatPosition.x),
      hatY: Math.round(hatPosition.y),
    };

    try {
      const response = await fetch("/api/captcha/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        statusEl.textContent = "Верно!";
        statusEl.className = "status ok";
        await snapToSlot();
        showPromoScreen();
        return;
      }

      shakeHat();
    } catch (_error) {
      statusEl.textContent = messages.network_error;
      statusEl.className = "status error";
    } finally {
      verifyBtn.disabled = false;
    }
  }

  async function init() {
    try {
      await loadConfig();
      await new Promise((resolve) => {
        if (bgImage.complete && hat.complete) {
          resolve();
          return;
        }
        let loaded = 0;
        const done = () => {
          loaded += 1;
          if (loaded >= 2) resolve();
        };
        bgImage.onload = done;
        hat.onload = done;
      });
      layoutCaptcha();
      bindResizeHandlers();
    } catch (_error) {
      statusEl.textContent = "Не удалось загрузить капчу.";
      statusEl.className = "status error";
    }
  }

  hat.addEventListener("pointerdown", pointerDown);
  hat.addEventListener("pointermove", pointerMove);
  hat.addEventListener("pointerup", pointerUp);
  hat.addEventListener("pointercancel", pointerUp);
  stageInner.addEventListener("pointermove", pointerMove);
  verifyBtn.addEventListener("click", verifyCaptcha);
  promoCopyBtn.addEventListener("click", copyPromoCode);
  init();
})();
