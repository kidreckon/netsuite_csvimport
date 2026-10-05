/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * CSV Import Pusher
 * -----------------
 * Picks up CSV files from File Cabinet folders, chooses the saved CSV import
 * (Setup > Import/Export > Saved CSV Imports) based on the folder the file is in, and submits it with N/task. Results still appear on the
 * normal "CSV Import Status" page.
 *
 * Files are assigned to processing queues 1..5 in round-robin order so the
 * work spreads across all queues (queues only apply with the SuiteCloud Plus
 * license; without it, set USE_QUEUES to false).
 *
 * Script parameters (create on the script record):
 *   custscript_csvpush_done_folder      (Free-Form Text / Integer)  folder for submitted files
 *   custscript_csvpush_error_folder     (Free-Form Text / Integer)  optional; folder for files with no matching import / submit errors
 */
define(['N/file', 'N/log', 'N/runtime', 'N/search', 'N/task', 'N/cache'], (file, log, runtime, search, task, cache) => {

    /**
     * Inbox folder internal ID -> saved CSV import (script ID like
     * 'custimport_customer_load' or its numeric internal ID).
     * Find a folder's ID in Documents > Files > File Cabinet (Internal ID column,
     * enable it via Customize View if hidden). Find an import's script ID in
     * Setup > Import/Export > Saved CSV Imports.
     * Files placed directly in a mapped folder are sent to that folder's import.
     */
    const FOLDER_IMPORT_MAP = {
        '1001': 'custimport_customer_load',
        '1002': 'custimport_vendor_load',
        '1003': 'custimport_salesorder_load',
        '1004': 'custimport_journal_load',
    };

    const USE_QUEUES = true;
    const MAX_QUEUE = 5;           // CSV import queues are 1..5
    const MIN_UNITS_LEFT = 150;    // stop cleanly; leftover files are picked up next run
    const CACHE_NAME = 'CSVPUSH_STATE';
    const CACHE_KEY = 'LAST_QUEUE';

    const execute = () => {
        const script = runtime.getCurrentScript();
        const doneFolder = script.getParameter({ name: 'custscript_csvpush_done_folder' });
        const errorFolder = script.getParameter({ name: 'custscript_csvpush_error_folder' });

        if (!doneFolder) {
            throw new Error('Done folder parameter is required.');
        }

        let queue = getStartQueue();
        const summary = { submitted: 0, unmapped: 0, failed: 0 };

        for (const f of listCsvFiles(Object.keys(FOLDER_IMPORT_MAP))) {
            if (script.getRemainingUsage() < MIN_UNITS_LEFT) {
                log.audit('Low governance', 'Stopping; remaining files will be handled next run.');
                break;
            }

            const importId = FOLDER_IMPORT_MAP[f.folder];
            if (!importId) {
                log.error('No import mapping', f.name);
                summary.unmapped++;
                moveFile(f.id, errorFolder);
                continue;
            }

            queue = queue % MAX_QUEUE + 1;
            try {
                const csvTask = task.create({
                    taskType: task.TaskType.CSV_IMPORT,
                    mappingId: importId,
                    importFile: file.load({ id: f.id }),
                    name: `${importId} ${f.name}`.slice(0, 100),
                });
                if (USE_QUEUES) csvTask.queue = queue;

                const taskId = csvTask.submit();
                log.audit('Submitted', `${f.name} -> ${importId}${USE_QUEUES ? ` (queue ${queue})` : ''}, task ${taskId}`);
                moveFile(f.id, doneFolder);
                summary.submitted++;
            } catch (e) {
                log.error(`Failed to submit ${f.name}`, e);
                summary.failed++;
                moveFile(f.id, errorFolder);
            }
        }

        saveLastQueue(queue);
        log.audit('Done', JSON.stringify(summary));
    };

    const listCsvFiles = (folderIds) => {
        const results = [];
        search.create({
            type: 'file',
            filters: [['folder', 'anyof', folderIds], 'AND', ['filetype', 'anyof', 'CSV']],
            columns: [search.createColumn({ name: 'name', sort: search.Sort.ASC }), 'folder'],
        }).run().each((r) => {
            results.push({ id: r.id, name: r.getValue('name'), folder: r.getValue('folder') });
            return true;
        });
        return results;
    };

    /** Moves a file to a folder; no-op when no folder is given (file stays in the inbox). */
    const moveFile = (fileId, folderId) => {
        if (!folderId) return;
        try {
            const f = file.load({ id: fileId });
            f.folder = Number(folderId);
            f.save();
        } catch (e) {
            log.error(`Could not move file ${fileId}`, e);
        }
    };

    // Remember the last queue used so single-file runs still rotate 1-2-3-4-5.
    // N/cache is best-effort (entries can expire); worst case rotation restarts at 1.
    const getStartQueue = () => {
        try {
            const v = cache.getCache({ name: CACHE_NAME, scope: cache.Scope.PRIVATE }).get({ key: CACHE_KEY });
            return Number(v) || 0;
        } catch (e) {
            return 0;
        }
    };

    const saveLastQueue = (queue) => {
        try {
            cache.getCache({ name: CACHE_NAME, scope: cache.Scope.PRIVATE })
                .put({ key: CACHE_KEY, value: String(queue), ttl: 7200 });
        } catch (e) {
            log.debug('Could not save queue state', e);
        }
    };

    return { execute };
});
