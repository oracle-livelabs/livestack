#!/usr/bin/env python3
"""Create deterministic 2x2 contact sheets for rendered DOCX page QA."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DEFAULT_GUIDE_ROOT = Path(__file__).resolve().parents[2]
PAGE_PATTERN = re.compile(r"^page-(\d+)\.png$")


def page_number(path: Path) -> int:
    match = PAGE_PATTERN.match(path.name)
    if match is None:
        raise ValueError(f"Rendered page must be named page-N.png: {path}")
    return int(match.group(1))


def create_contact_sheets(render_root: Path, output_root: Path) -> dict[str, object]:
    pages = sorted(
        (path for path in render_root.glob("page-*.png") if PAGE_PATTERN.match(path.name)),
        key=page_number,
    )
    if not pages:
        raise FileNotFoundError(f"No rendered page-N.png files found in {render_root}")

    output_root.mkdir(parents=True, exist_ok=True)
    for stale_sheet in output_root.glob("pages-*.png"):
        stale_sheet.unlink()

    page_width = 520
    label_height = 32
    columns = 2
    rows = 2
    margin = 18
    font = ImageFont.load_default(size=18)
    generated: list[str] = []

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
                resized = page.convert("RGB").resize(
                    (page_width, page_height), Image.Resampling.LANCZOS
                )
            sheet.paste(resized, (x, y + label_height))
            draw.text(
                (x, y + 4),
                f"Page {page_number(page_path)}",
                fill="black",
                font=font,
            )
        first_page = page_number(batch[0])
        last_page = page_number(batch[-1])
        destination = output_root / f"pages-{first_page:03d}-{last_page:03d}.png"
        sheet.save(destination, format="PNG", optimize=False, compress_level=9)
        generated.append(str(destination))

    return {
        "renderDirectory": str(render_root),
        "outputDirectory": str(output_root),
        "pageCount": len(pages),
        "contactSheetCount": len(generated),
        "contactSheets": generated,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--render-dir",
        type=Path,
        default=DEFAULT_GUIDE_ROOT / "tmp/docs/runbook-final",
        help="Directory containing page-N.png render files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Destination. Defaults to <render-dir>/contact-sheets.",
    )
    args = parser.parse_args()

    render_root = args.render_dir.resolve()
    output_root = (args.output_dir or (render_root / "contact-sheets")).resolve()
    result = create_contact_sheets(render_root, output_root)
    print(
        f"Created {result['contactSheetCount']} contact sheets "
        f"for {result['pageCount']} rendered pages in {output_root}."
    )


if __name__ == "__main__":
    main()
