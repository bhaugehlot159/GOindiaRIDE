# Complete Feature Pack (No Point Missed)

This folder keeps the full `COMPLETE-FEATURES-LIST.txt` in folder-wise format without deleting any old setup.

## Source
- `feature-pack/00-source/COMPLETE-FEATURES-LIST.txt`

## Folder-wise split
- `feature-pack/01-security/security-and-global-levels.txt`
- `feature-pack/02-customer/customer-portal-features.txt`
- `feature-pack/03-driver/driver-portal-features.txt`
- `feature-pack/04-admin/admin-portal-features.txt`
- `feature-pack/05-additional/additional-and-notes.txt`

## Full line index
- `feature-pack/06-index/FEATURE-INDEX.json`
- `feature-pack/06-index/FEATURE-SUMMARY.md`

## Regenerate
Run:

```bash
node tools/folderize-features.cjs
```

This regeneration maps every line from source to an indexed item (`L0001` style), so no line is skipped.
