"""Expose one synthetic native screenshot for attaching to the feature PR."""
import base64
import io
import sys
from pathlib import Path
from PIL import Image

name = sys.argv[1]
path = Path("docs/widgets/screenshots") / (name + ".png")
image = Image.open(path).convert("RGBA")
buffer = io.BytesIO()
image.save(buffer, format="WEBP", lossless=True, method=6)
encoded = base64.b64encode(buffer.getvalue()).decode()
if len(encoded) > 38000:
    raise RuntimeError("Review screenshot exceeds the annotation transport budget")
for index, start in enumerate(range(0, len(encoded), 3800)):
    print(f"::notice title=Widget image {name} {index:02d}::{encoded[start:start + 3800]}")
