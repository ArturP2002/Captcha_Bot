(function () {
  const captchaScreen = document.getElementById("captcha-screen");
  const ticketScreen = document.getElementById("ticket-screen");
  const stage = document.getElementById("captcha-stage");
  const hat = document.getElementById("hat");
  const verifyBtn = document.getElementById("verify-btn");
  const statusEl = document.getElementById("status");

  const tg = window.Telegram ? window.Telegram.WebApp : null;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const hatPosition = { x: 24, y: 24 };
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setHatPosition(nextX, nextY) {
    const maxX = stage.clientWidth - hat.clientWidth;
    const maxY = stage.clientHeight - hat.clientHeight;
    hatPosition.x = clamp(nextX, 0, Math.max(maxX, 0));
    hatPosition.y = clamp(nextY, 0, Math.max(maxY, 0));
    hat.style.left = hatPosition.x + "px";
    hat.style.top = hatPosition.y + "px";
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
    if (!dragging) return;
    const stageRect = stage.getBoundingClientRect();
    const x = event.clientX - stageRect.left - offsetX;
    const y = event.clientY - stageRect.top - offsetY;
    setHatPosition(x, y);
  }

  function pointerUp() {
    dragging = false;
    hat.classList.remove("dragging");
  }

  hat.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);

  async function verifyCaptcha() {
    statusEl.textContent = "Verifying...";
    verifyBtn.disabled = true;

    const body = {
      initData: tg ? tg.initData : "",
      hatX: Math.round(hatPosition.x + hat.clientWidth / 2),
      hatY: Math.round(hatPosition.y + hat.clientHeight / 2),
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

      if (data.reason === "wrong_position") {
        statusEl.textContent = "Wrong position, try again.";
      } else if (data.reason === "rate_limited") {
        statusEl.textContent = "Too many attempts, try later.";
      } else {
        statusEl.textContent = "Validation failed.";
      }
    } catch (_error) {
      statusEl.textContent = "Network error, try again.";
    } finally {
      verifyBtn.disabled = false;
    }
  }

  verifyBtn.addEventListener("click", verifyCaptcha);
})();
