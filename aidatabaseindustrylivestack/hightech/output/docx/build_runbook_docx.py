#!/usr/bin/env python3
"""Build the Oracle-branded High-Tech LiveStack runbook DOCX from Markdown."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


GUIDE_ROOT = Path(__file__).resolve().parents[2]
DOCX_PATH = GUIDE_ROOT / "seer-hightech-livestack-runbook.docx"
SOURCE_FILES = [
    GUIDE_ROOT / "introduction/introduction.md",
    *[
        GUIDE_ROOT / f"scene-{number}-{slug}/scene-{number}-{slug}.md"
        for number, slug in [
            (1, "seer-tech-control-tower"),
            (2, "seer-tech-26ai-data-foundation"),
            (3, "product-and-commitment-control-tower"),
            (4, "enterprise-buyer-signal-monitor"),
            (5, "product-signal-graph"),
            (6, "supply-and-commitment-map"),
            (7, "customer-commitments"),
            (8, "oml-product-intelligence"),
            (9, "ask-seer-tech-data"),
            (10, "ai-agent-console"),
            (11, "use-your-own-product-data"),
        ]
    ],
    GUIDE_ROOT / "download-livestack/download-livestack-take-it-home.md",
]

PURPOSE = (
    "This document provides a story-led Oracle LiveLabs runbook for the Seer Tech High Tech Product "
    "Intelligence LiveStack, showing how Oracle AI Database 26ai connects product, manufacturing, "
    "supply, commitment, analytics, natural-language SQL, and AI-agent workflows on one governed foundation."
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

ORACLE_RED = RGBColor(0xC7, 0x46, 0x34)
INLINE_TOKEN = re.compile(r"(\*\*.+?\*\*|`.+?`|\[[^\]]+\]\([^)]+\)|(?<!\*)\*[^*]+\*(?!\*))")
IMAGE_LINE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)$")
HEADING_LINE = re.compile(r"^(#{1,3})\s+(.+)$")
NUMBERED_LINE = re.compile(r"^(\s*)(\d+)\.\s+(.+)$")
BULLET_LINE = re.compile(r"^(\s*)-\s+(.+)$")


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
    replace_paragraph_text(cover[0], "Seer Tech High Tech Product Intelligence LiveStack Guide")
    replace_paragraph_text(cover[1], "Oracle AI Database 26ai\nBusiness / Technical Brief")
    replace_paragraph_text(cover[2], "July, 2026, Version 1.1")
    replace_paragraph_text(cover[3], "Copyright © 2026, Oracle and/or its affiliates")
    replace_paragraph_text(cover[4], "Oracle Internal")

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
    first.add_run("\tSeer Tech High Tech Product Intelligence LiveStack Guide  /  Version 1.1")

    second = footer.paragraphs[1] if len(footer.paragraphs) > 1 else footer.add_paragraph()
    replace_paragraph_text(second, "\tCopyright © 2026, Oracle and/or its affiliates  /  Oracle Internal")

    properties = document.core_properties
    properties.title = "Seer Tech High Tech Product Intelligence LiveStack Guide"
    properties.subject = "Oracle AI Database 26ai High Tech LiveStack runbook"
    properties.author = "Oracle LiveLabs Team"
    properties.keywords = "Oracle AI Database 26ai, High Tech, LiveStack, Seer Tech, runbook"
    properties.comments = "Generated from the High-Tech LiveStack Markdown guide on 2026-07-02."


def set_cell_shading(paragraph, fill: str) -> None:
    paragraph_properties = paragraph._p.get_or_add_pPr()
    shading = paragraph_properties.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        paragraph_properties.append(shading)
    shading.set(qn("w:fill"), fill)


def add_hyperlink(paragraph, text: str, url: str):
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
    marker_run.bold = marker != "•"
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


def parse_title(markdown_file: Path) -> str:
    for line in markdown_file.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    raise ValueError(f"No level-one heading in {markdown_file}")


def add_front_matter(document: Document, toc_pages: dict[str, int | str]) -> None:
    add_text_paragraph(document, "Purpose statement", "Heading 1 no TOC")
    add_text_paragraph(document, PURPOSE)
    add_text_paragraph(document, "Disclaimer", "Heading 1 no TOC")
    add_text_paragraph(document, DISCLAIMER_1)
    add_text_paragraph(document, DISCLAIMER_2)
    add_text_paragraph(document, "Table of contents", "TOC Heading")

    entries = [
        ("Purpose statement", 2),
        ("Disclaimer", 2),
        ("Runbook overview", toc_pages.get(parse_title(SOURCE_FILES[0]), "—")),
        *[(parse_title(source), toc_pages.get(parse_title(source), "—")) for source in SOURCE_FILES[1:]],
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
            add_list_paragraph(document, "•", bullet.group(2), len(bullet.group(1)))
        elif stripped in {"---", "<copy>", "</copy>"}:
            flush_prose()
        else:
            prose_buffer.append(stripped)

    flush_prose()
    if in_code and code_lines:
        add_code_block(document, code_lines)
    return figure_number


def build(output_path: Path, toc_pages: dict[str, int | str]) -> None:
    document = Document(str(DOCX_PATH))
    clear_after_cover(document)
    update_template_metadata(document)
    add_front_matter(document, toc_pages)

    figure_number = 1
    for source in SOURCE_FILES:
        figure_number = add_markdown(document, source, figure_number)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_suffix(".tmp.docx")
    document.save(str(temporary_path))
    os.replace(temporary_path, output_path)
    print(f"Built {output_path} with {figure_number - 1} figure placements.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DOCX_PATH)
    parser.add_argument("--toc-pages", type=Path)
    args = parser.parse_args()
    toc_pages = {}
    if args.toc_pages and args.toc_pages.exists():
        toc_pages = json.loads(args.toc_pages.read_text(encoding="utf-8"))
    build(args.output.resolve(), toc_pages)


if __name__ == "__main__":
    main()
