import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

BASE_DIR = Path(__file__).resolve().parent
SRC = BASE_DIR / "media" / "Mem_Captcha.PNG"
OUT_DIR = BASE_DIR / "media"


def is_hat_red(r: int, g: int, b: int) -> bool:
    return r > 160 and g < 80 and b < 80 and (r - g) > 80


def detect_hat_slot(img: Image.Image) -> dict[str, int]:
    w, h = img.size
    pixels = img.load()
    visited: set[tuple[int, int]] = set()
    best: tuple[int, int, int, int, int] | None = None

    for sy in range(0, h // 2, 3):
        for sx in range(0, w, 3):
            if (sx, sy) in visited or not is_hat_red(*pixels[sx, sy][:3]):
                continue
            queue = deque([(sx, sy)])
            visited.add((sx, sy))
            xs: list[int] = []
            ys: list[int] = []
            while queue:
                x, y = queue.popleft()
                xs.append(x)
                ys.append(y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                        if is_hat_red(*pixels[nx, ny][:3]):
                            visited.add((nx, ny))
                            queue.append((nx, ny))
            if best is None or len(xs) > best[4]:
                best = (min(xs), min(ys), max(xs), max(ys), len(xs))

    if best is None:
        raise RuntimeError("Hat region not found on captcha image")

    minx, miny, maxx, maxy, _ = best
    pad = 10
    return {
        "x": max(0, minx - pad),
        "y": max(0, miny - pad),
        "w": min(w, maxx + pad) - max(0, minx - pad),
        "h": min(h, maxy + pad) - max(0, miny - pad),
    }


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    pixels = img.load()
    slot = detect_hat_slot(img)

    hat = Image.new("RGBA", (slot["w"], slot["h"]), (0, 0, 0, 0))
    hat_pixels = hat.load()
    for dy in range(slot["h"]):
        for dx in range(slot["w"]):
            sx, sy = slot["x"] + dx, slot["y"] + dy
            r, g, b, a = pixels[sx, sy]
            if is_hat_red(r, g, b):
                hat_pixels[dx, dy] = (r, g, b, a)
            else:
                hat_pixels[dx, dy] = (r, g, b, 0)

    base = img.copy()
    base_pixels = base.load()
    for dy in range(slot["h"]):
        for dx in range(slot["w"]):
            sx, sy = slot["x"] + dx, slot["y"] + dy
            if is_hat_red(*pixels[sx, sy][:3]):
                sample_y = min(h - 1, sy + 40)
                base_pixels[sx, sy] = pixels[sx, sample_y]

    patch = base.crop((slot["x"], slot["y"], slot["x"] + slot["w"], slot["y"] + slot["h"]))
    patch = patch.filter(ImageFilter.GaussianBlur(radius=6))
    base.paste(patch, (slot["x"], slot["y"]))

    hat.save(OUT_DIR / "Mem_Captcha_hat.PNG")
    base.save(OUT_DIR / "Mem_Captcha_base.PNG")

    config = {
        "imageWidth": w,
        "imageHeight": h,
        "hatSlot": slot,
        "tolerance": 28,
    }
    (OUT_DIR / "captcha_config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(config, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
