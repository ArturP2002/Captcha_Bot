import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
SRC = BASE_DIR / "media" / "Mem_Captcha.PNG"
OUT_DIR = BASE_DIR / "media"


def is_hat_red(r: int, g: int, b: int) -> bool:
    return r > 165 and g < 75 and b < 75 and (r - g) > 90


def detect_hat_slot(image_rgb: np.ndarray) -> dict[str, int]:
    h, w = image_rgb.shape[:2]
    y1, y2 = int(h * 0.03), int(h * 0.18)
    x1, x2 = int(w * 0.24), int(w * 0.52)

    mask = np.zeros((h, w), dtype=np.uint8)
    for y in range(y1, y2):
        for x in range(x1, x2):
            r, g, b = image_rgb[y, x]
            if is_hat_red(int(r), int(g), int(b)):
                mask[y, x] = 255

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise RuntimeError("Hat region not found on captcha image")

    best = max(contours, key=cv2.contourArea)
    x, y, bw, bh = cv2.boundingRect(best)
    pad = 10
    slot_x = max(0, x - pad)
    slot_y = max(0, y - pad)
    slot_w = min(w, x + bw + pad) - slot_x
    slot_h = min(h, y + bh + pad) - slot_y
    return {"x": slot_x, "y": slot_y, "w": slot_w, "h": slot_h}


def build_inpaint_mask(image_rgb: np.ndarray, slot: dict[str, int]) -> np.ndarray:
    h, w = image_rgb.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    x1, y1 = slot["x"], slot["y"]
    x2, y2 = x1 + slot["w"], y1 + slot["h"]

    for y in range(y1, y2):
        for x in range(x1, x2):
            r, g, b = image_rgb[y, x]
            if is_hat_red(int(r), int(g), int(b)):
                mask[y, x] = 255

    kernel = np.ones((7, 7), np.uint8)
    return cv2.dilate(mask, kernel, iterations=2)


def main() -> None:
    pil_image = Image.open(SRC).convert("RGB")
    image_rgb = np.array(pil_image)
    h, w = image_rgb.shape[:2]
    slot = detect_hat_slot(image_rgb)

    mask = build_inpaint_mask(image_rgb, slot)
    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    inpainted_bgr = cv2.inpaint(image_bgr, mask, inpaintRadius=10, flags=cv2.INPAINT_TELEA)
    base_rgb = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2RGB)

    hat_piece = image_rgb[slot["y"] : slot["y"] + slot["h"], slot["x"] : slot["x"] + slot["w"]].copy()

    Image.fromarray(base_rgb).save(OUT_DIR / "Mem_Captcha_base.PNG", quality=95)
    Image.fromarray(hat_piece).save(OUT_DIR / "Mem_Captcha_hat.PNG", quality=95)

    config = {
        "imageWidth": w,
        "imageHeight": h,
        "hatSlot": slot,
        "tolerance": 22,
    }
    (OUT_DIR / "captcha_config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(config, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
