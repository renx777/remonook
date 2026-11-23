"""Collect real RemoteViews renders for the PR and read-only CI annotations."""
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
