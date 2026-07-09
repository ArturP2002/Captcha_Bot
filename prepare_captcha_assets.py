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
    max_y = int(h * 0.22)
    min_x = int(w * 0.20)
    max_x = int(w * 0.58)

    red_points: list[tuple[int, int]] = []
    for y in range(0, max_y):
        for x in range(min_x, max_x):
            r, g, b = image_rgb[y, x]
            if is_hat_red(int(r), int(g), int(b)):
                red_points.append((x, y))

    if len(red_points) < 100:
        raise RuntimeError("Hat region not found on captcha image")

    xs = [point[0] for point in red_points]
    ys = [point[1] for point in red_points]
    pad = 14
    x1 = max(0, min(xs) - pad)
    y1 = max(0, min(ys) - pad)
    x2 = min(w, max(xs) + pad)
    y2 = min(h, max(ys) + pad)
    return {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1}


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

    hat_piece = image_rgb[slot["y"] : slot["y"] + slot["h"], slot["x"] : slot["x"] + slot["w"]]

    Image.fromarray(base_rgb).save(OUT_DIR / "Mem_Captcha_base.PNG", quality=95)
    Image.fromarray(hat_piece).save(OUT_DIR / "Mem_Captcha_hat.PNG", quality=95)

    config = {
        "imageWidth": w,
        "imageHeight": h,
        "hatSlot": slot,
        "tolerance": 24,
    }
    (OUT_DIR / "captcha_config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(config, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
