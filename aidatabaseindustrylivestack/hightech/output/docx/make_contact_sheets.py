#!/usr/bin/env python3
"""Create labeled contact sheets for visual QA of every rendered DOCX page."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


guide_root = Path(__file__).resolve().parents[2]
render_root = guide_root / "tmp/docs/runbook-final"
output_root = render_root / "contact-sheets"
output_root.mkdir(parents=True, exist_ok=True)

pages = sorted(
    render_root.glob("page-*.png"),
    key=lambda path: int(path.stem.split("-")[-1]),
)

page_width = 520
label_height = 32
columns = 2
rows = 2
margin = 18
font = ImageFont.load_default(size=18)

for sheet_index in range(0, len(pages), columns * rows):
    batch = pages[sheet_index : sheet_index + columns * rows]
    with Image.open(batch[0]) as sample:
        page_height = round(sample.height * page_width / sample.width)
    sheet = Image.new(
        "RGB",
        (
            columns * page_width + (columns + 1) * margin,
            rows * (page_height + label_height) + (rows + 1) * margin,
        ),
        "#d7d7d7",
    )
    draw = ImageDraw.Draw(sheet)
    for item_index, page_path in enumerate(batch):
        row, column = divmod(item_index, columns)
        x = margin + column * (page_width + margin)
        y = margin + row * (page_height + label_height + margin)
        with Image.open(page_path) as page:
            resized = page.convert("RGB").resize((page_width, page_height), Image.Resampling.LANCZOS)
        sheet.paste(resized, (x, y + label_height))
        draw.text((x, y + 4), page_path.stem.replace("-", " ").title(), fill="black", font=font)
    first_page = int(batch[0].stem.split("-")[-1])
    last_page = int(batch[-1].stem.split("-")[-1])
    sheet.save(output_root / f"pages-{first_page:02d}-{last_page:02d}.png", quality=95)

print(f"Created {len(list(output_root.glob('pages-*.png')))} contact sheets for {len(pages)} pages.")
