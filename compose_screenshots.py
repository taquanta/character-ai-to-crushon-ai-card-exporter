"""
Compose Chrome Web Store listing screenshots (1280x800) from existing
source images in the project / Desktop / Lark cache. Annotates each
with a caption and key-element highlights.

Run:  python3 compose_screenshots.py
Output: screenshots/01_*.png, 02_*.png, 03_*.png
"""
from PIL import Image, ImageDraw, ImageFont
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "screenshots")
os.makedirs(OUT_DIR, exist_ok=True)

TARGET_W, TARGET_H = 1280, 800
BG = (250, 245, 255)
ACCENT_PURPLE = (168, 85, 247)
ACCENT_PINK = (236, 72, 153)
TEXT_DARK = (31, 23, 41)
BORDER = (220, 210, 235)
HIGHLIGHT = (236, 72, 153, 180)

LARK = "/Users/nnt/Library/Application Support/LarkShell/sdk_storage/ee5fcd0cfe537f71f5298e731afff8fa/resources/images"
DESKTOP = "/Users/nnt/Desktop"


def find_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_canvas():
    return Image.new("RGB", (TARGET_W, TARGET_H), BG)


def draw_title(canvas, text, y=46, color=ACCENT_PURPLE):
    d = ImageDraw.Draw(canvas)
    f = find_font(38)
    bbox = d.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    d.text(((TARGET_W - tw) // 2, y), text, fill=color, font=f)


def draw_subtitle(canvas, text, y=100, color=TEXT_DARK):
    d = ImageDraw.Draw(canvas)
    f = find_font(20)
    bbox = d.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    d.text(((TARGET_W - tw) // 2, y), text, fill=color, font=f)


def paste_centered(canvas, img, top=140, max_h=620, x_offset=0):
    """Resize image to fit max_h and paste centered (with optional horizontal offset)."""
    iw, ih = img.size
    if ih > max_h:
        scale = max_h / ih
        img = img.resize((int(iw * scale), int(ih * scale)), Image.LANCZOS)
    iw, ih = img.size
    x = (TARGET_W - iw) // 2 + x_offset
    y = top + (max_h - ih) // 2
    canvas.paste(img, (x, y))
    # Draw subtle border
    d = ImageDraw.Draw(canvas)
    d.rectangle((x - 3, y - 3, x + iw + 3, y + ih + 3), outline=BORDER, width=2)
    return (x, y, iw, ih)


# ============================================================
# Screenshot 1: char.ai page with extension buttons visible
# ============================================================
def shot1():
    src = os.path.join(DESKTOP, "截屏2026-05-15 16.23.51.png")
    src_img = Image.open(src).convert("RGB")
    # The image is 2168x1688. The buttons are top-right (~x=1700, y=240).
    # Crop the central character-page region + the buttons.
    # Trim chrome (top 80px) and bottom (the "AI Summarize" / chat starters)
    sw, sh = src_img.size
    # Take roughly the meaningful central column showing the character card +
    # the two export buttons on the right
    cropped = src_img.crop((0, 80, sw, sh - 60))

    canvas = make_canvas()
    draw_title(canvas, "Two one-click export buttons on every Character.AI page")
    draw_subtitle(canvas, "Pink = Tavern JSON  ·  Purple = PNG character card (Tavern V2)", y=98)
    x, y, w, h = paste_centered(canvas, cropped, top=140, max_h=620)

    # Highlight the buttons region (approximate)
    # In the original 2168x1688, buttons are around (1700-2070, 240-380)
    # Cropped image started at (0,80), so adjust y. Then we scaled to fit max_h=620.
    crop_h = cropped.size[1]   # original 1548
    scale = h / crop_h
    btn_x1 = int(1700 * scale) + x
    btn_y1 = int((240 - 80) * scale) + y
    btn_x2 = int(2070 * scale) + x
    btn_y2 = int((380 - 80) * scale) + y
    d = ImageDraw.Draw(canvas, "RGBA")
    d.rounded_rectangle(
        (btn_x1 - 6, btn_y1 - 6, btn_x2 + 6, btn_y2 + 6),
        radius=10, outline=(236, 72, 153, 220), width=4,
    )
    out = os.path.join(OUT_DIR, "01_buttons.png")
    canvas.save(out, "PNG", optimize=True)
    print(f"✓ {out}")


# ============================================================
# Screenshot 2: Yae Miko CrushOn form (auto-populated) — two-column layout
# Form on the left (tall narrow), explanatory bullets on the right.
# ============================================================
def shot2():
    src = os.path.join(HERE, "screenshots/raw/02_crushon_form_en.jpg")
    src_img = Image.open(src).convert("RGB")
    sw, sh = src_img.size  # 1368 x 6069  (English UI capture)
    # Take Character's name through Personality block:
    # y ≈ 2100 (Character's name label) .. 4500 (after Personality 467 Chars)
    cropped = src_img.crop((0, 2100, sw, 4500))  # 1368 x 2400

    canvas = make_canvas()
    draw_title(canvas, "Drop-in import to CrushOn — fields auto-populate", color=ACCENT_PINK)
    draw_subtitle(canvas, "Imported from Character.AI: name · tagline · greeting · long description", y=98)

    # Place the form on the left side
    # Target form area: x=60..520, y=150..760 (max h=610)
    form_max_h = 600
    form_max_w = 460
    iw, ih = cropped.size
    scale = min(form_max_w / iw, form_max_h / ih)
    new_w, new_h = int(iw * scale), int(ih * scale)
    form_img = cropped.resize((new_w, new_h), Image.LANCZOS)
    fx = 80
    fy = 150 + (form_max_h - new_h) // 2
    canvas.paste(form_img, (fx, fy))
    d = ImageDraw.Draw(canvas)
    d.rectangle((fx - 3, fy - 3, fx + new_w + 3, fy + new_h + 3), outline=BORDER, width=2)

    # Right column: 4 bullet points highlighting filled fields
    text_x = fx + new_w + 60
    text_y = 170
    bullets = [
        ("Character's name", "Yae Miko"),
        ("Introduction (Brief)", "From Genshin Impact"),
        ("Greeting (first message)", "I am the Guuji of the Grand Narukami Shrine..."),
        ("Personality (long-term memory)", "Lady Guuji of the Grand Narukami Shrine also serves as..."),
    ]
    label_font = find_font(20)
    value_font = find_font(16)
    for label, value in bullets:
        d.ellipse((text_x - 24, text_y + 6, text_x - 12, text_y + 18), fill=ACCENT_PINK)
        d.text((text_x, text_y), label, fill=TEXT_DARK, font=label_font)
        # value, possibly wrapped
        max_value_w = TARGET_W - text_x - 40
        words = value.split(" ")
        line, lines = "", []
        for w in words:
            test = (line + " " + w).strip()
            bbox = d.textbbox((0, 0), test, font=value_font)
            if bbox[2] - bbox[0] > max_value_w and line:
                lines.append(line)
                line = w
            else:
                line = test
        if line:
            lines.append(line)
        for i, ln in enumerate(lines[:2]):  # cap at 2 lines per bullet
            d.text((text_x, text_y + 28 + i * 20), ln, fill=(85, 80, 100), font=value_font)
        text_y += 28 + len(lines[:2]) * 20 + 22

    out = os.path.join(OUT_DIR, "02_crushon_form.png")
    canvas.save(out, "PNG", optimize=True)
    print(f"✓ {out}")


# ============================================================
# Screenshot 3: Rui Kamishiro Example Conversation (definition imported)
# ============================================================
def shot3():
    src = os.path.join(HERE, "screenshots/raw/03_example_conversation_en.jpg")
    src_img = Image.open(src).convert("RGB")
    sw, sh = src_img.size  # 1384 x 1512  (already focused, English UI)
    cropped = src_img  # use the whole capture as-is

    canvas = make_canvas()
    draw_title(canvas, "Definition exported as Example Conversation")
    draw_subtitle(canvas, "When the creator made Definition Visibility = Public, the full 800+-char dialogue carries through")
    paste_centered(canvas, cropped, top=140, max_h=620)

    out = os.path.join(OUT_DIR, "03_example_conversation.png")
    canvas.save(out, "PNG", optimize=True)
    print(f"✓ {out}")


if __name__ == "__main__":
    shot1()
    shot2()
    shot3()
    print(f"\nAll done. Upload {OUT_DIR}/0[1-3]_*.png to the Chrome Web Store listing.")
