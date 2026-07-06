#!/usr/bin/env python3
"""Validate the generated Colorado SLED runbook DOCX as a release gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

from docx import Document
from docx.shared import Inches

from build_runbook_docx import (
    DOCUMENT_CLASSIFICATION,
    DOCUMENT_SUBTITLE,
    DOCUMENT_TITLE,
    DOCUMENT_VERSION,
    FOOTER_TITLE,
    OUTPUT_FILENAME,
    SCENE_SPECS,
    SCREENSHOT_INVENTORY,
    parse_title,
    referenced_images,
    source_files,
    validate_sources,
)


DEFAULT_GUIDE_ROOT = Path(__file__).resolve().parents[2]
CAPTION_PATTERN = re.compile(r"^Figure (\d+)\.\s+\S")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def paragraph_style_name(paragraph) -> str:
    return paragraph.style.name if paragraph.style is not None else ""


def validate_docx(
    guide_root: Path,
    docx_path: Path,
    *,
    allow_toc_placeholders: bool,
) -> dict[str, object]:
    inventory_path = (guide_root / SCREENSHOT_INVENTORY).resolve()
    source_summary = validate_sources(guide_root, inventory_path, require_inventory=True)
    sources = source_files(guide_root)
    images = [item for source in sources for item in referenced_images(source)]
    expected_titles = [parse_title(source) for source in sources]
    expected_scene_titles = expected_titles[1:12]

    errors: list[str] = []

    def expect(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    expect(docx_path.is_file(), f"Generated DOCX not found: {docx_path}")
    if not docx_path.is_file():
        return {
            **source_summary,
            "status": "FAIL",
            "docx": str(docx_path),
            "errors": errors,
        }

    try:
        with zipfile.ZipFile(docx_path) as archive:
            bad_member = archive.testzip()
            members = set(archive.namelist())
    except zipfile.BadZipFile as exc:
        errors.append(f"DOCX is not a valid ZIP package: {exc}")
        members = set()
        bad_member = None
    else:
        expect(bad_member is None, f"Corrupt DOCX member: {bad_member}")
        required_members = {
            "[Content_Types].xml",
            "word/document.xml",
            "word/styles.xml",
            "docProps/core.xml",
        }
        expect(
            required_members.issubset(members),
            "DOCX package is missing: " + ", ".join(sorted(required_members - members)),
        )

    try:
        document = Document(str(docx_path))
    except Exception as exc:  # pragma: no cover - defensive release-gate reporting
        errors.append(f"python-docx could not open the generated document: {exc}")
        return {
            **source_summary,
            "status": "FAIL",
            "docx": str(docx_path),
            "sha256": sha256(docx_path),
            "errors": errors,
        }

    cover_expected = [
        DOCUMENT_TITLE,
        DOCUMENT_SUBTITLE,
        DOCUMENT_VERSION,
        "Copyright © 2026, Oracle and/or its affiliates",
        DOCUMENT_CLASSIFICATION,
    ]
    cover_actual = [paragraph.text for paragraph in document.paragraphs[:5]]
    expect(cover_actual == cover_expected, "Oracle cover metadata does not match the release specification")

    properties = document.core_properties
    expect(properties.title == DOCUMENT_TITLE, "Core document title is incorrect")
    expect("Colorado" in (properties.subject or ""), "Core document subject does not identify Colorado")

    expect(len(document.sections) == 2, f"Expected 2 template sections, found {len(document.sections)}")
    if document.sections:
        body_section = document.sections[-1]
        expected_margin = Inches(0.75)
        for name, actual in (
            ("top", body_section.top_margin),
            ("bottom", body_section.bottom_margin),
            ("left", body_section.left_margin),
            ("right", body_section.right_margin),
        ):
            expect(actual == expected_margin, f"Body {name} margin is not 0.75 inches")

        footer_xml = body_section.footer._element.xml
        footer_text = "\n".join(paragraph.text for paragraph in body_section.footer.paragraphs)
        expect(" PAGE " in footer_xml, "Body footer has no PAGE field")
        expect(FOOTER_TITLE in footer_text, "Body footer title is missing")
        expect(DOCUMENT_CLASSIFICATION in footer_text, "Body footer classification is missing")

    heading_one_titles = [
        paragraph.text
        for paragraph in document.paragraphs
        if paragraph_style_name(paragraph) == "Heading 1"
    ]
    expect(
        heading_one_titles == expected_titles,
        "Body level-one headings do not match Introduction, Scenes 1-11, and Take It Home in source order",
    )
    scene_heading_titles = [title for title in heading_one_titles if title.startswith("Scene ")]
    expect(scene_heading_titles == expected_scene_titles, "The eleven scene headings are missing or out of order")
    expect(len(SCENE_SPECS) == 11, "Builder scene specification does not contain exactly eleven scenes")

    expected_figure_count = len(images)
    actual_figure_count = len(document.inline_shapes)
    expect(
        actual_figure_count == expected_figure_count,
        f"Expected {expected_figure_count} inline figures, found {actual_figure_count}",
    )
    captions = [
        paragraph.text
        for paragraph in document.paragraphs
        if paragraph_style_name(paragraph) == "Caption"
    ]
    caption_numbers: list[int] = []
    for caption in captions:
        match = CAPTION_PATTERN.match(caption)
        if match is None:
            errors.append(f"Malformed figure caption: {caption!r}")
        else:
            caption_numbers.append(int(match.group(1)))
    expect(
        caption_numbers == list(range(1, expected_figure_count + 1)),
        "Figure captions are not sequential from 1 through the screenshot reference count",
    )

    for figure_number, inline_shape in enumerate(document.inline_shapes, start=1):
        description = inline_shape._inline.docPr.get("descr", "").strip()
        expect(bool(description), f"Figure {figure_number} has no accessibility description")

    toc_paragraphs = [
        paragraph.text
        for paragraph in document.paragraphs
        if paragraph_style_name(paragraph) == "toc 1"
    ]
    expect(len(toc_paragraphs) == len(sources) + 2, "Table of contents entry count is incorrect")
    toc_placeholders = [text for text in toc_paragraphs if text.rstrip().endswith("\t-")]
    if not allow_toc_placeholders:
        expect(not toc_placeholders, "Table of contents still contains page-number placeholders")

    raw_markdown = []
    for index, paragraph in enumerate(document.paragraphs):
        text = paragraph.text
        if "<copy>" in text or "</copy>" in text or re.search(r"!\[[^]]*]\([^)]+\)", text):
            raw_markdown.append(f"paragraph {index + 1}: {text[:80]}")
    expect(not raw_markdown, "Raw Markdown/copy markers remain: " + "; ".join(raw_markdown))

    result = {
        **source_summary,
        "status": "PASS" if not errors else "FAIL",
        "docx": str(docx_path),
        "sha256": sha256(docx_path),
        "docxBytes": docx_path.stat().st_size,
        "sectionCount": len(document.sections),
        "sceneHeadingCount": len(scene_heading_titles),
        "figureCount": actual_figure_count,
        "captionCount": len(captions),
        "tocEntryCount": len(toc_paragraphs),
        "tocPlaceholderCount": len(toc_placeholders),
        "allowTocPlaceholders": allow_toc_placeholders,
        "errors": errors,
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--guide-root", type=Path, default=DEFAULT_GUIDE_ROOT)
    parser.add_argument("--docx", type=Path)
    parser.add_argument(
        "--allow-toc-placeholders",
        action="store_true",
        help="Permit '-' page placeholders while validating an initial rendered draft.",
    )
    args = parser.parse_args()

    guide_root = args.guide_root.resolve()
    docx_path = (args.docx or (guide_root / OUTPUT_FILENAME)).resolve()
    try:
        result = validate_docx(
            guide_root,
            docx_path,
            allow_toc_placeholders=args.allow_toc_placeholders,
        )
    except Exception as exc:
        result = {
            "status": "FAIL",
            "guideRoot": str(guide_root),
            "docx": str(docx_path),
            "errors": [str(exc)],
        }
    print(json.dumps(result, indent=2, sort_keys=True))
    if result["status"] != "PASS":
        sys.exit(1)


if __name__ == "__main__":
    main()
