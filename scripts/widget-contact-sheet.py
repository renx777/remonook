"""Collect real RemoteViews renders for the PR and read-only CI annotations."""
import base64
import io
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

directory = Path("docs/widgets/screenshots")
paths = sorted(directory.glob("*.png"))
sheet = Image.new("RGB", (800, ((len(paths) + 3) // 4) * 240), "white")
draw = ImageDraw.Draw(sheet)
for index, path in enumerate(paths):
    column = (index % 4) * 200
    row = (index // 4) * 240
    original = Image.open(path).convert("RGBA")
    background = Image.new("RGBA", original.size, "white")
    background.alpha_composite(original)
    picture = ImageOps.contain(background.convert("RGB"), (190, 210))
    sheet.paste(picture, (column, row + 20))
    draw.text((column, row), path.stem, fill="black")
sheet.save(directory / "contact-sheet.png")
preview = sheet
while True:
    buffer = io.BytesIO()
    preview.save(buffer, format="WEBP", quality=40)
    encoded = base64.b64encode(buffer.getvalue()).decode()
    if len(encoded) <= 27000:
        break
    preview = preview.resize((int(preview.width * .85), int(preview.height * .85)))
# GitHub limits each annotation and the number emitted by one step.
for index, start in enumerate(range(0, len(encoded), 3000)):
    print(f"::notice title=Widget contact sheet {index:02d}::{encoded[start:start + 3000]}")
