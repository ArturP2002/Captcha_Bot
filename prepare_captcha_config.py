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


def crop_to_visible(hat_rgba: np.ndarray) -> np.ndarray:
    alpha = hat_rgba[:, :, 3]
    ys, xs = np.where(alpha > ALPHA_THRESHOLD)
    if len(xs) == 0:
        raise RuntimeError("hat.png не содержит видимых пикселей")

    x1, x2 = int(xs.min()), int(xs.max()) + 1
    y1, y2 = int(ys.min()), int(ys.max()) + 1
    return hat_rgba[y1:y2, x1:x2]


def detect_placeholder_center(base_rgb: np.ndarray) -> tuple[int, int]:
    gray = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 2)

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=80,
        param1=50,
        param2=28,
        minRadius=20,
        maxRadius=90,
    )
    if circles is not None:
        height = base_rgb.shape[0]
        best = min(circles[0], key=lambda circle: (circle[1], abs(circle[0] - base_rgb.shape[1] / 2)))
        for circle in circles[0]:
            cx, cy, _radius = circle
            if cy < height * 0.55:
                best = circle
                break
        return int(best[0]), int(best[1])

    # Fallback: серая заглушка на base.png отличается от белого тела и коричневого пола.
    channel = base_rgb.astype(np.int16)
    uniform = (
        (np.abs(channel[:, :, 0] - channel[:, :, 1]) < 18)
        & (np.abs(channel[:, :, 1] - channel[:, :, 2]) < 18)
    )
    placeholder_mask = (
        uniform
        & (channel[:, :, 0] > 120)
        & (channel[:, :, 0] < 215)
        & (channel[:, :, 1] < 205)
    ).astype(np.uint8) * 255

    height = base_rgb.shape[0]
    placeholder_mask[height // 2 :, :] = 0

    num_labels, _labels, stats, centroids = cv2.connectedComponentsWithStats(placeholder_mask)
    if num_labels <= 1:
        raise RuntimeError("Не удалось найти серую заглушку на base.png")

    best_label = max(
        range(1, num_labels),
        key=lambda label: stats[label, cv2.CC_STAT_AREA],
    )
    return int(centroids[best_label][0]), int(centroids[best_label][1])


def detect_hat_slot(base_rgb: np.ndarray, hat_rgba: np.ndarray) -> dict[str, int]:
    hat_h, hat_w = hat_rgba.shape[:2]
    center_x, center_y = detect_placeholder_center(base_rgb)
    return {
        "x": int(center_x - hat_w / 2),
        "y": int(center_y - hat_h / 2),
        "w": int(hat_w),
        "h": int(hat_h),
    }


def main() -> None:
    if not BASE_PATH.exists() or not HAT_PATH.exists():
        raise RuntimeError("Нужны файлы media/base.png и media/hat.png")

    base = np.array(Image.open(BASE_PATH).convert("RGB"))
    hat_full = np.array(Image.open(HAT_PATH).convert("RGBA"))
    hat_cropped = crop_to_visible(hat_full)

    slot = detect_hat_slot(base, hat_cropped)
    config = {
        "imageWidth": base.shape[1],
        "imageHeight": base.shape[0],
        "hatSlot": slot,
        "tolerance": 48,
    }

    Image.fromarray(hat_cropped).save(HAT_PATH)
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(config, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
