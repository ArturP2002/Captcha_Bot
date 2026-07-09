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
ORIG_PATH = MEDIA_DIR / "Mem_Captcha.PNG"
CONFIG_PATH = MEDIA_DIR / "captcha_config.json"


def detect_hat_slot(base_rgb: np.ndarray, hat_rgba: np.ndarray, orig_rgb: np.ndarray) -> dict[str, int]:
    orig_resized = cv2.resize(orig_rgb, (base_rgb.shape[1], base_rgb.shape[0]))
    hat_rgb = hat_rgba[:, :, :3]
    hat_alpha = hat_rgba[:, :, 3]

    result = cv2.matchTemplate(orig_resized, hat_rgb, cv2.TM_CCORR_NORMED, mask=hat_alpha)
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
    hat = np.array(Image.open(HAT_PATH).convert("RGBA"))
    orig = np.array(Image.open(ORIG_PATH).convert("RGB")) if ORIG_PATH.exists() else base

    slot = detect_hat_slot(base, hat, orig)
    config = {
        "imageWidth": base.shape[1],
        "imageHeight": base.shape[0],
        "hatSlot": slot,
        "tolerance": 42,
    }
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(config, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
