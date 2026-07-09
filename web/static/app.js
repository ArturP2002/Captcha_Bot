(function () {
  const captchaScreen = document.getElementById("captcha-screen");
  const ticketScreen = document.getElementById("ticket-screen");
  const stage = document.getElementById("captcha-stage");
  const bgImage = document.getElementById("captcha-bg");
  const hat = document.getElementById("hat-piece");
  const verifyBtn = document.getElementById("verify-btn");
  const statusEl = document.getElementById("status");

  const tg = window.Telegram ? window.Telegram.WebApp : null;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const hatPosition = { x: 0, y: 0 }; // natural image coordinates
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  let captchaConfig = null;
  let displayScale = 1;

  const messages = {
    verifying: "Проверяем...",
    wrong_position: "Неверно. Попробуйте ещё раз.",
    rate_limited: "Слишком много попыток. Подождите немного.",
    invalid_init_data: "Ошибка авторизации Telegram.",
    invalid_user: "Не удалось определить пользователя.",
    invalid_coordinates: "Некорректные координаты.",
    default_error: "Не удалось пройти проверку.",
    network_error: "Ошибка сети. Попробуйте снова.",
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getScale() {
    if (!bgImage.naturalWidth) {
      return 1;
    }
    return stage.clientWidth / bgImage.naturalWidth;
  }

  function layoutCaptcha() {
    if (!captchaConfig) {
      return;
    }

    displayScale = getScale();
    const slot = captchaConfig.hatSlot;

    hat.style.width = slot.w * displayScale + "px";
    hat.style.height = slot.h * displayScale + "px";
    setHatPositionNatural(hatPosition.x, hatPosition.y);
  }

  function randomHatStart() {
    if (!captchaConfig) {
      return;
    }

    const slot = captchaConfig.hatSlot;
    const maxX = Math.max(captchaConfig.imageWidth - slot.w, 0);
    const maxY = Math.max(captchaConfig.imageHeight - slot.h, 0);

    const zones = [
      { x: maxX * 0.04, y: maxY * 0.55 },
      { x: maxX * 0.72, y: maxY * 0.58 },
      { x: maxX * 0.05, y: maxY * 0.82 },
      { x: maxX * 0.68, y: maxY * 0.8 },
      { x: maxX * 0.38, y: maxY * 0.86 },
    ];

    let zone = zones[0];
    for (const candidate of zones.sort(() => Math.random() - 0.5)) {
      const farEnough =
        Math.abs(candidate.x - slot.x) > slot.w * 0.45 ||
        Math.abs(candidate.y - slot.y) > slot.h * 0.45;
      if (farEnough) {
        zone = candidate;
        break;
      }
    }

    setHatPositionNatural(zone.x, zone.y);
  }

  function setHatPositionNatural(naturalX, naturalY) {
    const slot = captchaConfig.hatSlot;
    const maxX = Math.max(captchaConfig.imageWidth - slot.w, 0);
    const maxY = Math.max(captchaConfig.imageHeight - slot.h, 0);

    hatPosition.x = clamp(naturalX, 0, maxX);
    hatPosition.y = clamp(naturalY, 0, maxY);
    hat.style.left = hatPosition.x * displayScale + "px";
    hat.style.top = hatPosition.y * displayScale + "px";
  }

  function setHatPositionDisplay(displayX, displayY) {
    setHatPositionNatural(displayX / displayScale, displayY / displayScale);
  }

  function pointerDown(event) {
    dragging = true;
    hat.classList.add("dragging");
    const rect = hat.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    hat.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    if (!dragging) {
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const x = event.clientX - stageRect.left - offsetX;
    const y = event.clientY - stageRect.top - offsetY;
    setHatPositionDisplay(x, y);
  }

  function pointerUp() {
    dragging = false;
    hat.classList.remove("dragging");
  }

  async function loadConfig() {
    const response = await fetch("/api/captcha/config");
    if (!response.ok) {
      throw new Error("config");
    }
    captchaConfig = await response.json();
  }

  async function verifyCaptcha() {
    statusEl.textContent = messages.verifying;
    verifyBtn.disabled = true;

    const naturalX = Math.round(hatPosition.x);
    const naturalY = Math.round(hatPosition.y);

    const body = {
      initData: tg ? tg.initData : "",
      hatX: naturalX,
      hatY: naturalY,
    };

    try {
      const response = await fetch("/api/captcha/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        statusEl.textContent = "";
        captchaScreen.classList.add("hidden");
        ticketScreen.classList.remove("hidden");
        return;
      }

      statusEl.textContent = messages[data.reason] || messages.default_error;
    } catch (_error) {
      statusEl.textContent = messages.network_error;
    } finally {
      verifyBtn.disabled = false;
    }
  }

  async function init() {
    try {
      await loadConfig();
      await new Promise((resolve) => {
        if (bgImage.complete) {
          resolve();
          return;
        }
        bgImage.onload = resolve;
      });
      layoutCaptcha();
      randomHatStart();
      window.addEventListener("resize", layoutCaptcha);
    } catch (_error) {
      statusEl.textContent = "Не удалось загрузить капчу.";
    }
  }

  hat.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);
  verifyBtn.addEventListener("click", verifyCaptcha);
  init();
})();
