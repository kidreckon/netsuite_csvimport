# NetSuite CSV Import Pusher

`csv_import_pusher.js` is a SuiteScript 2.1 scheduled script. It submits CSV files from a File Cabinet folder to saved CSV imports, so nobody has to click through the UI. Results still show on **Setup > Import/Export > View CSV Import Status**.

## How it works
- Scans every folder listed in `FOLDER_IMPORT_MAP` for `.csv` files.
- Each folder maps to one saved CSV import (folder internal ID -> import script ID or internal ID). Edit `FOLDER_IMPORT_MAP` at the top of the script.
- Submits it with `N/task` (`CSV_IMPORT`), setting the processing queue round-robin 1 -> 2 -> 3 -> 4 -> 5 -> 1 ... The last queue is remembered between runs via `N/cache` (best effort).
- Moves the file to the *done* folder after submit. Submit failures go to the *error* folder if one is set.
- Stops early if governance is low; remaining files are picked up on the next run.

## Setup
1. Upload the script to the File Cabinet and create a Scheduled Script record.
2. Add two script parameters (Free-Form Text): `custscript_csvpush_done_folder`, `custscript_csvpush_error_folder` (optional). Values are folder internal IDs.
3. Edit `FOLDER_IMPORT_MAP` with your inbox folder IDs and saved CSV import IDs.
4. Deploy and schedule (e.g. every 15 minutes) or run on demand.

## Notes
- Processing queues require the SuiteCloud Plus license. If you don't have it, set `USE_QUEUES = false`.
- Saved imports must already have their field mappings and the import file type configured; the script only supplies the file.
- Not tested in a live account. Verify `csvTask.queue` and the file move behaviour in sandbox first.
