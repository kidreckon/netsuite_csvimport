# NetSuite CSV Import Pusher

`csv_import_pusher.js` is a SuiteScript 2.1 scheduled script. It submits CSV files from a File Cabinet folder to saved CSV imports, so nobody has to click through the UI. Results still show on **Setup > Import/Export > View CSV Import Status**.

## How it works
- Each record type has an entry in `PUSH_CONFIG` with its saved CSV import ID and three folders: `01 Push`, `02 Error`, `03 Archived`.
- Only `.csv` files placed directly in a `01 Push` folder are submitted. Anything else in the parent folder is ignored.
- Each file is submitted with `N/task` (`CSV_IMPORT`), with the processing queue rotating 1 -> 2 -> 3 -> 4 -> 5 -> 1 ... The last queue is remembered between runs via `N/cache` (best effort).
- On success the file moves to that type's `03 Archived`; on a submit failure it moves to `02 Error`.
- Stops early if governance is low; remaining files are picked up on the next run.

## Setup
1. Upload the script to the File Cabinet and create a Scheduled Script record (no parameters needed).
2. Set **Execute As Role** on the deployment to a role that can run CSV imports and access these folders.
3. Edit `PUSH_CONFIG` for each record type (Journal is filled in; Vendor Invoice is a commented template).
4. Deploy and schedule (e.g. every 15 minutes) or run on demand.

## Notes
- Processing queues require the SuiteCloud Plus license. If you don't have it, set `USE_QUEUES = false`.
- Saved imports must already have their field mappings and the import file type configured; the script only supplies the file.
- Not tested in a live account. Verify the file move behaviour in sandbox first.
