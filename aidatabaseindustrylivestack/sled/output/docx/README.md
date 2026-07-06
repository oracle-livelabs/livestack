# Colorado SLED runbook DOCX workflow

This directory contains the deterministic build and QA tooling for the Oracle-branded Colorado State and Local Government LiveStack runbook. The original `seer-sled-livestack-runbook.docx` remains the cover and style template. The builder writes a separate artifact and preserves the eleven-scene source order.

Do not build the final DOCX until the rewritten Markdown, live screenshots, and `output/guide-screenshots/inventory.json` are complete. The builder's default mode is preflight only; it writes a DOCX only with `--build`.

Run all commands from the SLED runbook root.

## Test-driven release gates

1. RED - prove incomplete inputs are blocked.

   ```bash
   python3 output/docx/build_runbook_docx.py
   python3 output/docx/validate_runbook_docx.py
   ```

   Preflight reports the current source and screenshot state without writing a DOCX. The validator must fail while the final artifact is absent. A `--build` invocation must fail when the refreshed screenshot inventory or any referenced image is missing.

2. GREEN - preflight the final Markdown and screenshot inventory.

   ```bash
   python3 output/docx/build_runbook_docx.py
   ```

   Confirm the JSON summary reports 13 sources, 11 scenes, no missing images, and `screenshotInventoryReady: true`.

3. Build a disposable first draft with TOC placeholders.

   ```bash
   mkdir -p tmp/docs/runbook-draft
   python3 output/docx/build_runbook_docx.py \
     --build \
     --output tmp/docs/runbook-draft/state-local-government-colorado-operations-runbook.docx
   python3 output/docx/validate_runbook_docx.py \
     --docx tmp/docs/runbook-draft/state-local-government-colorado-operations-runbook.docx \
     --allow-toc-placeholders
   ```

4. Render and inspect the first draft.

   ```bash
   python3 "$HOME/.codex/skills/doc/scripts/render_docx.py" \
     tmp/docs/runbook-draft/state-local-government-colorado-operations-runbook.docx \
     --output_dir tmp/docs/runbook-draft/rendered
   python3 output/docx/make_contact_sheets.py \
     --render-dir tmp/docs/runbook-draft/rendered
   ```

   Inspect every rendered page at 100 percent, then inspect the contact sheets for document-wide consistency. Record the rendered start page of the introduction, each of Scenes 1 through 11, and Take It Home in `output/docx/toc-pages.json`. Use the exact level-one Markdown titles as JSON keys and integer page numbers as values.

5. Build and structurally validate the release candidate.

   ```bash
   python3 output/docx/build_runbook_docx.py \
     --build \
     --toc-pages output/docx/toc-pages.json
   python3 output/docx/validate_runbook_docx.py
   ```

   The default output is `state-local-government-colorado-operations-runbook.docx` in the runbook root. The strict validator fails for TOC placeholders, missing figures, nonsequential captions, incorrect cover metadata, altered template structure, missing footer fields, or source-order drift.

6. Render and visually validate the release candidate.

   ```bash
   python3 "$HOME/.codex/skills/doc/scripts/render_docx.py" \
     state-local-government-colorado-operations-runbook.docx \
     --output_dir tmp/docs/runbook-final
   python3 output/docx/make_contact_sheets.py \
     --render-dir tmp/docs/runbook-final
   shasum -a 256 state-local-government-colorado-operations-runbook.docx
   ```

   Before release, verify all pages for clipping, blank pages, orphaned headings, split task steps, unreadable screenshots, caption/image separation, stale labels, incorrect scene numbers, broken hyperlinks, TOC page accuracy, footer consistency, and unexpected font substitution. Rebuild after any source, image, caption, or TOC correction and rerun both structural and visual QA.

## Tool responsibilities

- `build_runbook_docx.py` validates the fixed Introduction, Scenes 1-11, and Take It Home source order; requires refreshed screenshot evidence for a build; preserves the Oracle cover and styles; writes stable core and ZIP metadata for reproducible output; and refuses to overwrite the template.
- `validate_runbook_docx.py` verifies the DOCX package, Oracle cover metadata, two-section template, footer, eleven scene headings, screenshot and caption parity, accessibility descriptions, TOC completion, source inventory, and SHA-256 checksum.
- `make_contact_sheets.py` creates deterministic 2x2 contact sheets from numerically sorted `page-N.png` render files.

The final publish gate is GREEN only when source preflight, strict DOCX validation, every-page visual QA, checksum capture, and the broader LiveStack test-driven deployment validation are all complete.
