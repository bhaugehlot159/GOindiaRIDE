# Disabled Feature Code Scaffold

This scaffold is generated from `COMPLETE-FEATURES-LIST.txt` without deleting any existing project files.

## What is generated
- Folder-wise `disabled-features.js` files by domain
- `00-meta/feature-index.csv` and `00-meta/feature-index.json`
- `00-meta/coverage-summary.md`
- Category-wise activation-ready files also placed in existing `feature-pack/01..05` folders
- Section mapping is driven by `feature-pack/07-audit/LINE-COVERAGE.csv` so points stay in their proper files

## Important
- Every generated code file is disabled with one outer block comment: `/* ... */`.
- To activate in future, remove only first `/*` and last `*/` in that file.
- This is intentional for staged implementation.