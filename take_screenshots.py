#!/usr/bin/env python3
"""
Interactive screenshot helper for Chrome Web Store listing.

Walks through 4 screenshots needed for the listing, prompts you to set up
each screen state, then opens the macOS interactive screencapture so you
drag-select the area. After all raw captures, post-processes them to
publish-ready 1280×800 PNGs with a caption header.

Usage:
    python3 take_screenshots.py            # walk through all 4
    python3 take_screenshots.py --reshoot  # delete existing raws and redo
    python3 take_screenshots.py --process  # only re-run post-processing

Requirements: macOS (uses `screencapture`), Python 3, Pillow.

First run may trigger a macOS permission prompt for Screen Recording —
grant it in System Settings → Privacy & Security → Screen & System Audio
Recording, then re-run.
"""
import argparse
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "screenshots", "raw")
OUT_DIR = os.path.join(HERE, "screenshots")
TARGET_W, TARGET_H = 1280, 800
BG_COLOR = (250, 245, 255)     # very pale purple
ACCENT = (168, 85, 247)        # extension's brand purple
TEXT_DARK = (31, 23, 41)

SHOTS = [
    {
        "id": "01_buttons",
        "instruction": (
            "Open https://character.ai/chat/<any-character> in your browser.\n"
            "Wait for the two export buttons (pink + purple) to appear in the\n"
            "TOP-RIGHT corner. Bring that window to the front, ready to capture\n"
            "BOTH BUTTONS AND a chunk of the character page around them."
        ),
        "caption": "One-click export — buttons appear on every Character.AI page",
    },
    {
        "id": "02_files",
        "instruction": (
            "Open Finder, navigate to your Downloads folder. Capture the area\n"
            "showing the most recent .json and .png files (e.g. Yae_Miko.json /\n"
            "Yae_Miko.png). Use list view so file sizes are visible."
        ),
        "caption": "Exports save as JSON (Tavern V1) or PNG character card",
    },
    {
        "id": "03_crushon_form",
        "instruction": (
            "Open https://crushon.ai/character/create. Upload one of the exported\n"
            "files. Wait for fields to auto-populate. Capture the top half of\n"
            "the form showing Character name + Introduction + Greeting filled."
        ),
        "caption": "Drop-in import to CrushOn.AI — fields auto-populate",
    },
    {
        "id": "04_field_mapping",
        "instruction": (
            "Continue scrolling down the same CrushOn form to show Personality\n"
            "and Example Conversation. Capture that area so reviewers see the\n"
            "longer-form fields (definition / description) coming through."
        ),
        "caption": "Personality + Example Conversation populated from Character.AI fields",
    },
]


def find_font(size):
    """Best-effort macOS font lookup."""
    candidates = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSDisplay.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def screencapture_interactive(out_path):
    """Run macOS screencapture in interactive crosshair mode (-i -o = no shadow)."""
    if sys.platform != "darwin":
        print("  ⚠️  This script only runs on macOS (uses screencapture).")
        sys.exit(1)
    print("  → Cursor is now a crosshair. Drag-select the area to capture.")
    print("  → Press Escape to cancel.")
    subprocess.run(["screencapture", "-i", "-o", out_path], check=False)
    return os.path.exists(out_path) and os.path.getsize(out_path) > 0


def capture_all(reshoot=False):
    os.makedirs(RAW_DIR, exist_ok=True)
    for i, shot in enumerate(SHOTS, 1):
        raw_path = os.path.join(RAW_DIR, shot["id"] + ".png")
        if os.path.exists(raw_path) and not reshoot:
            print(f"\n=== [{i}/{len(SHOTS)}] {shot['id']} — already captured, skip ===")
            continue
        if reshoot and os.path.exists(raw_path):
            os.remove(raw_path)
        print(f"\n=== [{i}/{len(SHOTS)}] {shot['id']} ===")
        print(shot["instruction"])
        try:
            input("\nPress Enter when ready... ")
        except KeyboardInterrupt:
            print("\nAborted.")
            sys.exit(0)
        ok = screencapture_interactive(raw_path)
        if not ok:
            print(f"  ⚠️  No file written — cancelled or escaped. You can re-run later.")
        else:
            sz = os.path.getsize(raw_path)
            with Image.open(raw_path) as im:
                w, h = im.size
            print(f"  ✓ saved {raw_path}  ({w}×{h}, {sz/1024:.0f} KB)")


def post_process_one(shot):
    raw_path = os.path.join(RAW_DIR, shot["id"] + ".png")
    out_path = os.path.join(OUT_DIR, shot["id"] + ".png")
    if not os.path.exists(raw_path):
        print(f"  ⚠️  skip {shot['id']} (no raw capture)")
        return
    img = Image.open(raw_path).convert("RGB")

    # Inner content area: leave 100px top for caption, 40px padding all around
    inner_w = TARGET_W - 80
    inner_h = TARGET_H - 160
    img.thumbnail((inner_w, inner_h), Image.LANCZOS)

    canvas = Image.new("RGB", (TARGET_W, TARGET_H), BG_COLOR)
    x = (TARGET_W - img.width) // 2
    y = 120 + (inner_h - img.height) // 2
    canvas.paste(img, (x, y))

    draw = ImageDraw.Draw(canvas)
    font = find_font(34)
    text = shot["caption"]
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = max(40, (TARGET_W - text_w) // 2)
    draw.text((text_x, 50), text, fill=ACCENT, font=font)

    # subtle border around the inner image
    border_box = (x - 4, y - 4, x + img.width + 4, y + img.height + 4)
    draw.rectangle(border_box, outline=(230, 220, 240), width=2)

    canvas.save(out_path, "PNG", optimize=True)
    print(f"  ✓ {out_path}  ({os.path.getsize(out_path)/1024:.0f} KB)")


def post_process_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("\nPost-processing to 1280×800 publish-ready PNGs...")
    for shot in SHOTS:
        post_process_one(shot)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--reshoot", action="store_true",
                   help="Delete existing raw captures and redo all")
    p.add_argument("--process", action="store_true",
                   help="Skip capture step, only re-run post-processing")
    args = p.parse_args()

    if not args.process:
        capture_all(reshoot=args.reshoot)
    post_process_all()

    print(f"\nDone. Upload the 4 PNGs from {OUT_DIR}/ to the Chrome Web Store listing.")


if __name__ == "__main__":
    main()
