---
name: tutor-scraper-selectors
description: Specialized DOM selectors and extraction logic for the TutorCircle (寻补) case list. Use when maintaining or debugging the scraper.js engine.
---
# TutorCircle Selectors Reference

### List Level
- **Case Header Link**: `a[id^="header_"]` (contains the Case ID in brackets `[12345]`).
- **Core Info Columns**: `.col-md-3` within the header.
  - `[0]`: Grade
  - `[1]`: Fee
  - `[2]`: Subject
  - `[3]`: Location & Applicant Count

### Detail Level (Expanded)
- **Expansion ID**: Match `href` of the header to find the target `div` ID.
- **Detail Panel**: `${collapseId}.in .panel-body`
- **Labels (Chinese)**:
  - Date: `日期`
  - Specific Location: `詳細地點`
  - Lessons per week: `堂數`
  - Duration: `每堂時間`
  - Available time: `可補習時間`
  - Other requirements: `其他要求`

### Interaction Rules
1. To expand: `header.click({ force: true })`.
2. Wait for `.in` class to appear on the panel.
3. Use `page.evaluate` with a label-search regex: `new RegExp(label + ':?\\s*(.*)', 'i')`.
