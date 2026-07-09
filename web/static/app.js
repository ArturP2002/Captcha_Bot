(function () {
  const captchaScreen = document.getElementById("captcha-screen");
  const ticketScreen = document.getElementById("ticket-screen");
  const stage = document.getElementById("captcha-stage");
  const bgImage = document.getElementById("captcha-bg");
  const hat = document.getElementById("hat-piece");
  const verifyBtn = document.getElementById("verify-btn");
  const statusEl = document.getElementById("status");
  const ticketStatusEl = document.getElementById("ticket-status");

  const tg = window.Telegram ? window.Telegram.WebApp : null;
  if (tg) {
    tg.ready();
    tg.expand();
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
    wrong_position: "Неверно. Попробуйте ещё раз.",
    rate_limited: "Слишком много попыток. Подождите немного.",
    invalid_init_data: "Ошибка авторизации Telegram.",
    invalid_user: "Не удалось определить пользователя.",
    invalid_coordinates: "Некорректные координаты.",
    captcha_required: "Сначала пройдите капчу.",
    default_error: "Не удалось пройти проверку.",
    network_error: "Ошибка сети. Попробуйте снова.",
    ticket_sending: "Отправляем билет в чат...",
    ticket_sent: "Готово! Билет отправлен в чат как фото и файл.",
    ticket_failed: "Не удалось отправить билет в чат.",
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

  function applyHatVisualPosition() {
    hat.style.transform = `translate(${hatPosition.x * displayScale}px, ${hatPosition.y * displayScale}px)`;
  }

  function layoutCaptcha() {
    if (!captchaConfig) {
      return;
    }

    displayScale = getScale();
    const slot = captchaConfig.hatSlot;
    hat.style.width = slot.w * displayScale + "px";
    hat.style.height = slot.h * displayScale + "px";
    applyHatVisualPosition();
  }

  function randomHatStart() {
    if (!captchaConfig || hasInitialPosition) {
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
    hasInitialPosition = true;
  }

  function setHatPositionNatural(naturalX, naturalY) {
    const slot = captchaConfig.hatSlot;
    const maxX = Math.max(captchaConfig.imageWidth - slot.w, 0);
    const maxY = Math.max(captchaConfig.imageHeight - slot.h, 0);

    hatPosition.x = clamp(naturalX, 0, maxX);
    hatPosition.y = clamp(naturalY, 0, maxY);
    applyHatVisualPosition();
  }

  function setHatPositionDisplay(displayX, displayY) {
    setHatPositionNatural(displayX / displayScale, displayY / displayScale);
  }

  function pointerDown(event) {
    event.preventDefault();
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
    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
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
    applyHatVisualPosition();
  }

  async function loadConfig() {
    const response = await fetch("/api/captcha/config");
    if (!response.ok) {
      throw new Error("config");
    }
    captchaConfig = await response.json();
  }

  async function deliverTicket() {
    ticketStatusEl.textContent = messages.ticket_sending;

    try {
      const response = await fetch("/api/ticket/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg ? tg.initData : "" }),
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        ticketStatusEl.textContent = messages.ticket_sent;
        return;
      }

      ticketStatusEl.textContent = messages[data.reason] || messages.ticket_failed;
    } catch (_error) {
      ticketStatusEl.textContent = messages.ticket_failed;
    }
  }

  async function verifyCaptcha() {
    statusEl.textContent = messages.verifying;
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
        statusEl.textContent = "";
        captchaScreen.classList.add("hidden");
        ticketScreen.classList.remove("hidden");
        await deliverTicket();
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
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layoutCaptcha, 120);
      });
    } catch (_error) {
      statusEl.textContent = "Не удалось загрузить капчу.";
    }
  }

  hat.addEventListener("pointerdown", pointerDown);
  hat.addEventListener("pointermove", pointerMove);
  hat.addEventListener("pointerup", pointerUp);
  hat.addEventListener("pointercancel", pointerUp);
  stage.addEventListener("pointermove", pointerMove);
  verifyBtn.addEventListener("click", verifyCaptcha);
  init();
})();
