"""
Generate icon PNGs at 16/32/48/128 px from a single 1024x1024 master.
Run:  python3 icons/gen_icons.py
Output: icons/icon16.png, icon32.png, icon48.png, icon128.png
"""
from PIL import Image, ImageDraw, ImageFilter
import os

MASTER = 1024
SIZES = [16, 32, 48, 128]
PINK = (236, 72, 153)       # #ec4899
PURPLE = (168, 85, 247)     # #a855f7
WHITE = (255, 255, 255)
SHADOW = (40, 8, 64, 80)

def gradient(size, c1, c2):
    """Vertical linear gradient image."""
    img = Image.new("RGB", (size, size), c1)
    top = Image.new("RGB", (size, 1), c1)
    bot = Image.new("RGB", (size, 1), c2)
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        r = int(c1[0] * (1 - t) + c2[0] * t)
        g = int(c1[1] * (1 - t) + c2[1] * t)
        b = int(c1[2] * (1 - t) + c2[2] * t)
        grad.putpixel((0, y), (r, g, b))
    return grad.resize((size, size))

def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=255)
    return mask

def draw_master():
    S = MASTER
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # === Background: rounded square with pink→purple gradient ===
    bg_radius = int(S * 0.22)
    bg = gradient(S, PINK, PURPLE)
    bg.putalpha(rounded_mask(S, bg_radius))
    out.alpha_composite(bg)

    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # === Two stacked "character cards" (white rounded rectangles) ===
    # Back card — offset up-left, lower opacity
    card_w, card_h = int(S * 0.50), int(S * 0.62)
    card_r = int(S * 0.05)
    back_x = int(S * 0.20)
    back_y = int(S * 0.16)
    d.rounded_rectangle(
        [back_x, back_y, back_x + card_w, back_y + card_h],
        radius=card_r, fill=(255, 255, 255, 110),
    )

    # Front card — main element
    front_x = int(S * 0.30)
    front_y = int(S * 0.22)
    d.rounded_rectangle(
        [front_x, front_y, front_x + card_w, front_y + card_h],
        radius=card_r, fill=WHITE,
    )

    # Portrait inside front card: circle (head) + trapezoid (shoulders)
    cx = front_x + card_w // 2
    head_r = int(card_w * 0.16)
    head_y = front_y + int(card_h * 0.28)
    d.ellipse(
        [cx - head_r, head_y - head_r, cx + head_r, head_y + head_r],
        fill=PINK,
    )
    # shoulders: trapezoid
    shoulder_top_y = head_y + int(head_r * 1.4)
    shoulder_bot_y = front_y + int(card_h * 0.78)
    shoulder_half_top = int(head_r * 1.0)
    shoulder_half_bot = int(head_r * 2.4)
    d.polygon([
        (cx - shoulder_half_top, shoulder_top_y),
        (cx + shoulder_half_top, shoulder_top_y),
        (cx + shoulder_half_bot, shoulder_bot_y),
        (cx - shoulder_half_bot, shoulder_bot_y),
    ], fill=PURPLE)

    # === Download arrow badge in bottom-right corner ===
    badge_size = int(S * 0.30)
    badge_x = int(S * 0.62)
    badge_y = int(S * 0.60)
    # White circle background
    d.ellipse(
        [badge_x, badge_y, badge_x + badge_size, badge_y + badge_size],
        fill=WHITE,
    )
    # Arrow inside
    arr_cx = badge_x + badge_size // 2
    arr_cy = badge_y + badge_size // 2
    arr_w = int(badge_size * 0.18)
    arr_h = int(badge_size * 0.42)
    # vertical bar
    d.rectangle(
        [arr_cx - arr_w // 2, arr_cy - arr_h // 2,
         arr_cx + arr_w // 2, arr_cy + int(arr_h * 0.20)],
        fill=PURPLE,
    )
    # arrowhead triangle
    head_w = int(badge_size * 0.45)
    head_top = arr_cy - int(arr_h * 0.02)
    head_bot = arr_cy + int(arr_h * 0.36)
    d.polygon([
        (arr_cx - head_w // 2, head_top),
        (arr_cx + head_w // 2, head_top),
        (arr_cx, head_bot),
    ], fill=PURPLE)

    out.alpha_composite(layer)
    return out

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    master = draw_master()
    master_path = os.path.join(here, "icon_master_1024.png")
    master.save(master_path)
    print(f"  master  {master_path}  {master.size}")

    for s in SIZES:
        resized = master.resize((s, s), Image.LANCZOS)
        path = os.path.join(here, f"icon{s}.png")
        resized.save(path)
        print(f"  {s:>4}px  {path}  {os.path.getsize(path)} B")

if __name__ == "__main__":
    main()
