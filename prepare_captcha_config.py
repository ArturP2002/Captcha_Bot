"""Генерирует captcha_config.json из media/base.png и media/hat.png."""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
MEDIA_DIR = BASE_DIR / "media"
BASE_PATH = MEDIA_DIR / "base.png"
HAT_PATH = MEDIA_DIR / "hat.png"
CONFIG_PATH = MEDIA_DIR / "captcha_config.json"
ALPHA_THRESHOLD = 10


def crop_to_visible(hat_rgba: np.ndarray) -> tuple[np.ndarray, int, int]:
    alpha = hat_rgba[:, :, 3]
    ys, xs = np.where(alpha > ALPHA_THRESHOLD)
    if len(xs) == 0:
        raise RuntimeError("hat.png не содержит видимых пикселей")

    x1, x2 = int(xs.min()), int(xs.max()) + 1
    y1, y2 = int(ys.min()), int(ys.max()) + 1
    return hat_rgba[y1:y2, x1:x2], x1, y1


def detect_hat_slot(base_rgb: np.ndarray, hat_rgba: np.ndarray) -> dict[str, int]:
    hat_rgb = hat_rgba[:, :, :3]
    hat_alpha = hat_rgba[:, :, 3]

    result = cv2.matchTemplate(base_rgb, hat_rgb, cv2.TM_CCORR_NORMED, mask=hat_alpha)
    _, max_val, _, max_loc = cv2.minMaxLoc(result)
    if max_val < 0.5:
        raise RuntimeError("Не удалось определить позицию шапки на base.png")

    x, y = max_loc
    h, w = hat_alpha.shape
    return {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}


def main() -> None:
    if not BASE_PATH.exists() or not HAT_PATH.exists():
        raise RuntimeError("Нужны файлы media/base.png и media/hat.png")

    base = np.array(Image.open(BASE_PATH).convert("RGB"))
    hat_full = np.array(Image.open(HAT_PATH).convert("RGBA"))
    hat_cropped, _crop_x, _crop_y = crop_to_visible(hat_full)

    slot = detect_hat_slot(base, hat_cropped)
    config = {
        "imageWidth": base.shape[1],
        "imageHeight": base.shape[0],
        "hatSlot": slot,
        "tolerance": 42,
    }

    Image.fromarray(hat_cropped).save(HAT_PATH)
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(config, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
