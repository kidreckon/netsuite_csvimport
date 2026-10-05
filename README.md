# NetSuite CSV Import Pusher

`csv_import_pusher.js` is a SuiteScript 2.1 scheduled script. It submits CSV files from a File Cabinet folder to saved CSV imports, so nobody has to click through the UI. Results still show on **Setup > Import/Export > View CSV Import Status**.

## How it works
- Scans the source folder for `.csv` files.
- Matches the file name prefix to a saved CSV import using `IMPORT_MAP` (e.g. `customer_2026-10-05.csv` -> `custimport_customer_load`). Longest prefix wins.
- Submits it with `N/task` (`CSV_IMPORT`), setting the processing queue round-robin 1 -> 2 -> 3 -> 4 -> 5 -> 1 ... The last queue is remembered between runs via `N/cache` (best effort).
- Moves the file to the *done* folder after submit. Unmapped files and submit failures go to the *error* folder if one is set.
- Stops early if governance is low; remaining files are picked up on the next run.

## Setup
1. Upload the script to the File Cabinet and create a Scheduled Script record.
2. Add three script parameters (Free-Form Text): `custscript_csvpush_source_folder`, `custscript_csvpush_done_folder`, `custscript_csvpush_error_folder` (optional). Values are folder internal IDs.
3. Edit `IMPORT_MAP` with your prefixes and saved CSV import script IDs (or internal IDs).
4. Deploy and schedule (e.g. every 15 minutes) or run on demand.

## Notes
- Processing queues require the SuiteCloud Plus license. If you don't have it, set `USE_QUEUES = false`.
- Saved imports must already have their field mappings and the import file type configured; the script only supplies the file.
- Not tested in a live account. Verify `csvTask.queue` and the file move behaviour in sandbox first.
