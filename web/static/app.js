(function () {
  const captchaScreen = document.getElementById("captcha-screen");
  const ticketScreen = document.getElementById("ticket-screen");
  const stage = document.getElementById("captcha-stage");
  const stageInner = document.querySelector(".captcha-stage-inner");
  const bgImage = document.getElementById("captcha-bg");
  const hat = document.getElementById("hat-piece");
  const verifyBtn = document.getElementById("verify-btn");
  const statusEl = document.getElementById("status");
  const ticketStatusEl = document.getElementById("ticket-status");

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
    captcha_required: "Сначала пройдите капчу.",
    default_error: "Не удалось пройти проверку.",
    network_error: "Ошибка сети. Попробуйте снова.",
    ticket_sending: "Отправляем билет в чат...",
    ticket_sent: "Готово! Билет отправлен в чат как фото и файл.",
    ticket_failed: "Не удалось отправить билет в чат.",
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

  function updateProximityFeedback() {
    if (!captchaConfig) {
      return;
    }
    const slot = captchaConfig.hatSlot;
    const tolerance = captchaConfig.tolerance || 42;
    const deltaX = Math.abs(hatPosition.x - slot.x);
    const deltaY = Math.abs(hatPosition.y - slot.y);
    const isNear = deltaX <= tolerance * 1.8 && deltaY <= tolerance * 1.8;

    if (isNear && !dragging && !statusEl.classList.contains("error")) {
      statusEl.textContent = messages.near;
      statusEl.className = "status ok";
    } else if (!dragging && statusEl.textContent === messages.near) {
      statusEl.textContent = "";
      statusEl.className = "status";
    }
  }

  function layoutCaptcha() {
    if (!captchaConfig) {
      return;
    }

    displayScale = getScale();
    const slot = captchaConfig.hatSlot;

    hat.style.width = slot.w * displayScale + "px";
    hat.style.height = slot.h * displayScale + "px";
    applyHatVisualPosition(false);
  }

  function randomHatStart() {
    if (!captchaConfig || hasInitialPosition) {
      return;
    }

    const slot = captchaConfig.hatSlot;
    const maxX = Math.max(captchaConfig.imageWidth - slot.w, 0);
    const maxY = Math.max(captchaConfig.imageHeight - slot.h, 0);

    const zones = [
      { x: 24, y: maxY * 0.62 },
      { x: maxX * 0.68, y: maxY * 0.66 },
      { x: 24, y: maxY * 0.86 },
      { x: maxX * 0.62, y: maxY * 0.84 },
    ];

    let zone = zones[0];
    for (const candidate of zones.sort(() => Math.random() - 0.5)) {
      const farEnough =
        Math.abs(candidate.x - slot.x) > slot.w * 0.5 ||
        Math.abs(candidate.y - slot.y) > slot.h * 0.5;
      if (farEnough) {
        zone = candidate;
        break;
      }
    }

    setHatPositionNatural(zone.x, zone.y, false);
    hasInitialPosition = true;
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
        captchaScreen.classList.add("hidden");
        ticketScreen.classList.remove("hidden");
        await deliverTicket();
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
      randomHatStart();
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
  init();
})();
