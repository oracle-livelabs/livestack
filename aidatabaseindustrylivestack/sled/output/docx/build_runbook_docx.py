#!/usr/bin/env python3
"""Build the Oracle-branded Colorado SLED runbook DOCX from Markdown.

The default invocation performs preflight only. A document is written only when
``--build`` is supplied, and a refreshed screenshot inventory is required for
that build. This keeps the stale template DOCX intact until the guide Markdown
and live screenshots have passed their release gates.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt


DEFAULT_GUIDE_ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_FILENAME = "seer-sled-livestack-runbook.docx"
OUTPUT_FILENAME = "state-local-government-colorado-operations-runbook.docx"
SCREENSHOT_INVENTORY = Path("output/guide-screenshots/inventory.json")

SCENE_SPECS = (
    (1, "sled-operations-brief"),
    (2, "seer-26ai-data-foundation"),
    (3, "public-service-command-center"),
    (4, "resident-demand-signals"),
    (5, "community-partner-network"),
    (6, "service-access-and-coverage-map"),
    (7, "service-request-workbench"),
    (8, "demand-and-capacity-analytics"),
    (9, "ask-seer-operations-data"),
    (10, "public-service-ai-agent-console"),
    (11, "use-your-own-public-service-data"),
)

DOCUMENT_TITLE = "Colorado State and Local Government Service Operations LiveStack Guide"
DOCUMENT_SUBTITLE = "Oracle AI Database 26ai\nStory-Led Demo Runbook"
DOCUMENT_VERSION = "July, 2026, Version 1.1"
DOCUMENT_CLASSIFICATION = "Oracle Confidential"
FOOTER_TITLE = "Colorado State and Local Government Service Operations LiveStack Guide"
RELEASE_TIMESTAMP = datetime(2026, 7, 3, tzinfo=timezone.utc)
ZIP_TIMESTAMP = (2026, 7, 3, 0, 0, 0)

PURPOSE = (
    "This document provides a story-led Oracle LiveLabs runbook for the Colorado State and Local "
    "Government Service Operations LiveStack. It follows one governed operating decision from "
    "statewide resident-service and Medicaid eligibility risk signals through regional access, "
    "request resolution, demand and capacity analytics, natural-language SQL, and audited agent action."
)
DISCLAIMER_1 = (
    "This document in any form, software or printed matter, contains proprietary information that is the "
    "exclusive property of Oracle. Your access to and use of this confidential material is subject to the terms "
    "and conditions of your Oracle software license and service agreement, which has been executed and with "
    "which you agree to comply. This document and information contained herein may not be disclosed, copied, "
    "reproduced or distributed to anyone outside Oracle without prior written consent of Oracle. This document "
    "is not part of your license agreement nor can it be incorporated into any contractual agreement with Oracle "
    "or its subsidiaries or affiliates."
)
DISCLAIMER_2 = (
    "This document is for informational purposes only and is intended solely to assist you in planning for the "
    "implementation and upgrade of the product features described. It is not a commitment to deliver any material, "
    "code, or functionality, and should not be relied upon in making purchasing decisions. The development, release, "
    "timing, and pricing of any features or functionality described in this document remains at the sole discretion "
    "of Oracle. Due to the nature of the product architecture, it may not be possible to safely include all features "
    "described in this document without risking significant destabilization of the code."
)

INLINE_TOKEN = re.compile(r"(\*\*.+?\*\*|`.+?`|\[[^\]]+\]\([^)]+\)|(?<!\*)\*[^*]+\*(?!\*))")
IMAGE_LINE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)$")
HEADING_LINE = re.compile(r"^(#{1,3})\s+(.+)$")
NUMBERED_LINE = re.compile(r"^(\s*)(\d+)\.\s+(.+)$")
BULLET_LINE = re.compile(r"^(\s*)-\s+(.+)$")


def source_files(guide_root: Path) -> list[Path]:
    return [
        guide_root / "introduction/introduction.md",
        *[
            guide_root / f"scene-{number}-{slug}/scene-{number}-{slug}.md"
            for number, slug in SCENE_SPECS
        ],
        guide_root / "download-livestack/download-livestack-take-it-home.md",
    ]


def parse_title(markdown_file: Path) -> str:
    for line in markdown_file.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    raise ValueError(f"No level-one heading in {markdown_file}")


def referenced_images(markdown_file: Path) -> list[tuple[Path, str]]:
    references: list[tuple[Path, str]] = []
    for line in markdown_file.read_text(encoding="utf-8").splitlines():
        image = IMAGE_LINE.match(line.strip())
        if image:
            references.append(((markdown_file.parent / image.group(2)).resolve(), image.group(1)))
    return references


def inventory_contains(inventory_files: list[str], guide_root: Path, image_path: Path) -> bool:
    relative = image_path.relative_to(guide_root).as_posix()
    return any(entry == relative or entry.endswith(f"/selected/{relative}") for entry in inventory_files)


def validate_sources(
    guide_root: Path,
    inventory_path: Path,
    *,
    require_inventory: bool,
) -> dict[str, object]:
    sources = source_files(guide_root)
    missing_sources = [str(path) for path in sources if not path.is_file()]
    if missing_sources:
        raise FileNotFoundError("Missing Markdown source files:\n" + "\n".join(missing_sources))

    scene_sources = sources[1:12]
    if len(scene_sources) != 11:
        raise ValueError(f"Expected 11 scene sources, found {len(scene_sources)}")
    for expected_number, source in enumerate(scene_sources, start=1):
        title = parse_title(source)
        if not re.match(rf"^Scene {expected_number}\b", title):
            raise ValueError(f"Expected Scene {expected_number} heading in {source}, found {title!r}")

    images = [item for source in sources for item in referenced_images(source)]
    missing_images = [str(path) for path, _ in images if not path.is_file()]
    if missing_images:
        raise FileNotFoundError("Missing guide images:\n" + "\n".join(missing_images))

    inventory_ready = False
    inventory_count = 0
    if inventory_path.is_file():
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        screenshots = inventory.get("screenshots")
        if not isinstance(screenshots, list):
            raise ValueError(f"Screenshot inventory has no screenshots list: {inventory_path}")
        inventory_count = len(screenshots)
        declared_count = inventory.get("count")
        if declared_count is not None and int(declared_count) != inventory_count:
            raise ValueError(
                f"Screenshot inventory count mismatch: declared {declared_count}, found {inventory_count}"
            )
        inventory_files = [str(item.get("file", "")) for item in screenshots if isinstance(item, dict)]
        absent_from_inventory = [
            str(path.relative_to(guide_root))
            for path, _ in images
            if not inventory_contains(inventory_files, guide_root, path)
        ]
        if absent_from_inventory:
            raise ValueError(
                "Guide images are not represented in the refreshed screenshot inventory:\n"
                + "\n".join(absent_from_inventory)
            )
        inventory_ready = True
    elif require_inventory:
        raise FileNotFoundError(
            f"Refreshed screenshot inventory is required before DOCX build: {inventory_path}"
        )

    return {
        "guideRoot": str(guide_root),
        "sourceCount": len(sources),
        "sceneCount": len(scene_sources),
        "imageReferenceCount": len(images),
        "screenshotInventory": str(inventory_path),
        "screenshotInventoryReady": inventory_ready,
        "screenshotInventoryCount": inventory_count,
    }


def validate_template(document: Document, template_path: Path) -> None:
    required_styles = {
        'Reference graphic (6" width)',
        "Code",
        "Code Char",
        "Caption",
        "Heading 1 no TOC",
        "TOC Heading",
        "toc 1",
    }
    style_names = {style.name for style in document.styles}
    missing_styles = sorted(required_styles - style_names)
    if missing_styles:
        raise ValueError(f"Template {template_path} is missing styles: {', '.join(missing_styles)}")
    if len(document.paragraphs) < 7 or len(document.sections) < 2:
        raise ValueError(f"Template {template_path} does not contain the expected Oracle cover structure")


def clear_after_cover(document: Document) -> None:
    """Preserve the official Oracle cover section, then remove the old body."""
    cover_break = document.paragraphs[6]._p
    body = document._element.body
    passed_cover = False
    for child in list(body):
        if child is cover_break:
            passed_cover = True
            continue
        if passed_cover and child.tag != qn("w:sectPr"):
            body.remove(child)


def replace_paragraph_text(paragraph, text: str) -> None:
    for child in list(paragraph._p):
        if child.tag != qn("w:pPr"):
            paragraph._p.remove(child)
    paragraph.add_run(text)


def add_page_field(run) -> None:
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = " PAGE "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "2"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instruction, separate, placeholder, end])


def update_template_metadata(document: Document) -> None:
    cover = document.paragraphs[:7]
    replace_paragraph_text(cover[0], DOCUMENT_TITLE)
    replace_paragraph_text(cover[1], DOCUMENT_SUBTITLE)
    replace_paragraph_text(cover[2], DOCUMENT_VERSION)
    replace_paragraph_text(cover[3], "Copyright © 2026, Oracle and/or its affiliates")
    replace_paragraph_text(cover[4], DOCUMENT_CLASSIFICATION)

    body_section = document.sections[-1]
    body_section.top_margin = Inches(0.75)
    body_section.bottom_margin = Inches(0.75)
    body_section.left_margin = Inches(0.75)
    body_section.right_margin = Inches(0.75)

    footer = body_section.footer
    footer.is_linked_to_previous = False
    first = footer.paragraphs[0]
    drawing_run = next((run._r for run in first.runs if run._r.xpath(".//w:drawing")), None)
    for child in list(first._p):
        if child.tag == qn("w:pPr") or child is drawing_run:
            continue
        first._p.remove(child)
    page_run = first.add_run()
    add_page_field(page_run)
    first.add_run(f"\t{FOOTER_TITLE}  /  Version 1.1")

    second = footer.paragraphs[1] if len(footer.paragraphs) > 1 else footer.add_paragraph()
    replace_paragraph_text(second, f"\tCopyright © 2026, Oracle and/or its affiliates  /  {DOCUMENT_CLASSIFICATION}")

    properties = document.core_properties
    properties.title = DOCUMENT_TITLE
    properties.subject = "Oracle AI Database 26ai Colorado State and Local Government LiveStack runbook"
    properties.author = "Oracle LiveLabs Team"
    properties.last_modified_by = "Oracle LiveLabs Team"
    properties.created = RELEASE_TIMESTAMP
    properties.modified = RELEASE_TIMESTAMP
    properties.revision = 1
    properties.keywords = (
        "Oracle AI Database 26ai, Colorado, State and Local Government, LiveStack, runbook"
    )
    properties.comments = "Generated from the refreshed Colorado SLED Markdown guide and live screenshots."


def set_cell_shading(paragraph, fill: str) -> None:
    paragraph_properties = paragraph._p.get_or_add_pPr()
    shading = paragraph_properties.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        paragraph_properties.append(shading)
    shading.set(qn("w:fill"), fill)


def add_hyperlink(paragraph, text: str, url: str) -> None:
    relationship_id = paragraph.part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), relationship_id)
    run = OxmlElement("w:r")
    run_properties = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "00688C")
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    run_properties.extend([color, underline])
    text_element = OxmlElement("w:t")
    text_element.text = text
    run.extend([run_properties, text_element])
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def add_inline_markdown(paragraph, text: str) -> None:
    text = text.replace("<copy>", "").replace("</copy>", "")
    position = 0
    for match in INLINE_TOKEN.finditer(text):
        if match.start() > position:
            paragraph.add_run(text[position : match.start()])
        token = match.group(0)
        if token.startswith("**"):
            run = paragraph.add_run(token[2:-2])
            run.bold = True
        elif token.startswith("`"):
            run = paragraph.add_run(token[1:-1].replace("<copy>", "").replace("</copy>", ""))
            run.style = "Code Char"
        elif token.startswith("["):
            link = re.match(r"\[([^\]]+)\]\(([^)]+)\)", token)
            if link is None:
                raise ValueError(f"Malformed Markdown link: {token}")
            add_hyperlink(paragraph, link.group(1), link.group(2))
        elif token.startswith("*"):
            run = paragraph.add_run(token[1:-1])
            run.italic = True
        position = match.end()
    if position < len(text):
        paragraph.add_run(text[position:])


def add_text_paragraph(document: Document, text: str, style: str = "Normal"):
    paragraph = document.add_paragraph(style=style)
    add_inline_markdown(paragraph, text)
    paragraph.paragraph_format.space_after = Pt(6)
    return paragraph


def add_list_paragraph(document: Document, marker: str, text: str, leading_spaces: int):
    level = min(4, leading_spaces // 2)
    paragraph = document.add_paragraph(style="List Paragraph")
    paragraph.paragraph_format.left_indent = Inches(0.28 + level * 0.22)
    paragraph.paragraph_format.first_line_indent = Inches(-0.2)
    paragraph.paragraph_format.space_after = Pt(3)
    marker_run = paragraph.add_run(f"{marker} ")
    marker_run.bold = marker != "-"
    add_inline_markdown(paragraph, text)
    return paragraph


def add_code_block(document: Document, lines: list[str]) -> None:
    clean_lines = [line for line in lines if line.strip() not in {"<copy>", "</copy>"}]
    clean_lines = [line.replace("<copy>", "").replace("</copy>", "") for line in clean_lines]
    paragraph = document.add_paragraph(style="Code")
    paragraph.paragraph_format.left_indent = Inches(0.18)
    paragraph.paragraph_format.right_indent = Inches(0.18)
    paragraph.paragraph_format.space_before = Pt(3)
    paragraph.paragraph_format.space_after = Pt(6)
    paragraph.paragraph_format.keep_together = True
    set_cell_shading(paragraph, "F4F4F4")
    run = paragraph.add_run()
    run.font.name = "Consolas"
    run.font.size = Pt(8)
    for index, line in enumerate(clean_lines):
        if index:
            run.add_break()
        run.add_text(line)


def add_image(document: Document, markdown_file: Path, source: str, alt: str, figure_number: int) -> None:
    image_path = (markdown_file.parent / source).resolve()
    if not image_path.exists():
        raise FileNotFoundError(f"Missing image: {image_path}")
    paragraph = document.add_paragraph()
    paragraph.style = next(style for style in document.styles if style.name == 'Reference graphic (6" width)')
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(4)
    paragraph.paragraph_format.space_after = Pt(2)
    paragraph.paragraph_format.keep_with_next = True
    run = paragraph.add_run()
    inline_shape = run.add_picture(str(image_path), width=Inches(6.45))
    inline_shape._inline.docPr.set("descr", alt)
    inline_shape._inline.docPr.set("title", f"Figure {figure_number}. {alt}")

    caption = document.add_paragraph(style="Caption")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.keep_with_next = False
    caption.paragraph_format.keep_together = True
    caption.paragraph_format.space_after = Pt(8)
    caption.add_run(f"Figure {figure_number}. {alt}")


def add_front_matter(
    document: Document,
    sources: list[Path],
    toc_pages: dict[str, int | str],
) -> None:
    add_text_paragraph(document, "Purpose statement", "Heading 1 no TOC")
    add_text_paragraph(document, PURPOSE)
    add_text_paragraph(document, "Disclaimer", "Heading 1 no TOC")
    add_text_paragraph(document, DISCLAIMER_1)
    add_text_paragraph(document, DISCLAIMER_2)
    add_text_paragraph(document, "Table of contents", "TOC Heading")

    entries = [
        ("Purpose statement", 2),
        ("Disclaimer", 2),
        ("Runbook overview", toc_pages.get(parse_title(sources[0]), "-")),
        *[(parse_title(source), toc_pages.get(parse_title(source), "-")) for source in sources[1:]],
    ]
    for title, page_number in entries:
        paragraph = document.add_paragraph(style="toc 1")
        paragraph.paragraph_format.space_after = Pt(1)
        paragraph.paragraph_format.tab_stops.add_tab_stop(Inches(6.25))
        paragraph.add_run(f"{title}\t{page_number}")


def add_markdown(document: Document, markdown_file: Path, figure_number: int) -> int:
    lines = markdown_file.read_text(encoding="utf-8").splitlines()
    prose_buffer: list[str] = []
    code_lines: list[str] = []
    in_code = False

    def flush_prose() -> None:
        if prose_buffer:
            add_text_paragraph(document, " ".join(prose_buffer))
            prose_buffer.clear()

    for raw_line in lines:
        stripped = raw_line.strip()
        if stripped.startswith("```"):
            flush_prose()
            if in_code:
                add_code_block(document, code_lines)
                code_lines.clear()
            in_code = not in_code
            continue
        if in_code:
            code_lines.append(raw_line[4:] if raw_line.startswith("    ") else raw_line)
            continue
        if not stripped:
            flush_prose()
            continue

        heading = HEADING_LINE.match(stripped)
        image = IMAGE_LINE.match(stripped)
        numbered = NUMBERED_LINE.match(raw_line)
        bullet = BULLET_LINE.match(raw_line)

        if heading:
            flush_prose()
            level = len(heading.group(1))
            paragraph = add_text_paragraph(document, heading.group(2), f"Heading {level}")
            paragraph.paragraph_format.keep_with_next = True
            if level == 1:
                paragraph.paragraph_format.page_break_before = True
        elif image:
            flush_prose()
            add_image(document, markdown_file, image.group(2), image.group(1), figure_number)
            figure_number += 1
        elif numbered:
            flush_prose()
            add_list_paragraph(document, f"{numbered.group(2)}.", numbered.group(3), len(numbered.group(1)))
        elif bullet:
            flush_prose()
            add_list_paragraph(document, "-", bullet.group(2), len(bullet.group(1)))
        elif stripped in {"---", "<copy>", "</copy>"}:
            flush_prose()
        else:
            prose_buffer.append(stripped)

    flush_prose()
    if in_code and code_lines:
        raise ValueError(f"Unclosed code fence in {markdown_file}")
    return figure_number


def canonicalize_docx(source_path: Path, output_path: Path) -> None:
    """Rewrite the OPC package with stable member order and ZIP metadata."""
    canonical_path = output_path.with_suffix(".canonical.tmp.docx")
    try:
        with zipfile.ZipFile(source_path, "r") as source_archive:
            members = sorted(source_archive.infolist(), key=lambda item: item.filename)
            with zipfile.ZipFile(
                canonical_path,
                "w",
                compression=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            ) as output_archive:
                for member in members:
                    info = zipfile.ZipInfo(member.filename, ZIP_TIMESTAMP)
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.create_system = 3
                    info.external_attr = (0o755 if member.is_dir() else 0o644) << 16
                    output_archive.writestr(
                        info,
                        source_archive.read(member.filename),
                        compress_type=zipfile.ZIP_DEFLATED,
                        compresslevel=9,
                    )
        os.replace(canonical_path, output_path)
    finally:
        if canonical_path.exists():
            canonical_path.unlink()


def build(
    guide_root: Path,
    template_path: Path,
    output_path: Path,
    toc_pages: dict[str, int | str],
) -> None:
    if output_path.resolve() == template_path.resolve():
        raise ValueError("Output must not overwrite the preserved Oracle template DOCX")

    sources = source_files(guide_root)
    document = Document(str(template_path))
    validate_template(document, template_path)
    clear_after_cover(document)
    update_template_metadata(document)
    add_front_matter(document, sources, toc_pages)

    figure_number = 1
    for source in sources:
        figure_number = add_markdown(document, source, figure_number)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_suffix(".tmp.docx")
    try:
        document.save(str(temporary_path))
        canonicalize_docx(temporary_path, output_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    print(f"Built {output_path} with {figure_number - 1} figure placements.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--guide-root", type=Path, default=DEFAULT_GUIDE_ROOT)
    parser.add_argument("--template", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--toc-pages", type=Path)
    parser.add_argument(
        "--build",
        action="store_true",
        help="Write the DOCX. Without this flag the command performs preflight only.",
    )
    args = parser.parse_args()

    guide_root = args.guide_root.resolve()
    template_path = (args.template or (guide_root / TEMPLATE_FILENAME)).resolve()
    output_path = (args.output or (guide_root / OUTPUT_FILENAME)).resolve()
    inventory_path = (guide_root / SCREENSHOT_INVENTORY).resolve()

    try:
        summary = validate_sources(
            guide_root,
            inventory_path,
            require_inventory=args.build,
        )
        if not template_path.is_file():
            raise FileNotFoundError(f"Oracle DOCX template not found: {template_path}")
        template_document = Document(str(template_path))
        validate_template(template_document, template_path)
    except Exception as exc:
        summary = {
            "status": "FAIL",
            "guideRoot": str(guide_root),
            "template": str(template_path),
            "output": str(output_path),
            "mode": "build" if args.build else "preflight-only",
            "errors": [str(exc)],
        }
        print(json.dumps(summary, indent=2, sort_keys=True))
        sys.exit(1)
    summary["status"] = "PASS"
    summary["template"] = str(template_path)
    summary["output"] = str(output_path)
    summary["mode"] = "build" if args.build else "preflight-only"
    print(json.dumps(summary, indent=2, sort_keys=True))

    if not args.build:
        print("Preflight complete. No DOCX was generated. Use --build only after screenshot QA is GREEN.")
        return

    toc_pages: dict[str, int | str] = {}
    if args.toc_pages:
        if not args.toc_pages.is_file():
            raise FileNotFoundError(f"TOC page map not found: {args.toc_pages}")
        toc_pages = json.loads(args.toc_pages.read_text(encoding="utf-8"))
    build(guide_root, template_path, output_path, toc_pages)


if __name__ == "__main__":
    main()
