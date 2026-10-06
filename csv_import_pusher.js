/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * CSV Import Pusher
 * -----------------
 * Picks up CSV files from File Cabinet folders, chooses the saved CSV import
 * (Setup > Import/Export > Saved CSV Imports) based on the "Push" folder the
 * file is in, and submits it with N/task. Submitted files move to that type's
 * Archived folder, failures to its Error folder. Results still appear on the
 * normal "CSV Import Status" page.
 *
 * Files are assigned to processing queues 1..5 in round-robin order so the
 * work spreads across all queues (queues only apply with the SuiteCloud Plus
 * license; without it, set USE_QUEUES to false).
 *
 * No script parameters are needed; all folder/import settings live in PUSH_CONFIG below.
 */
define(['N/file', 'N/log', 'N/runtime', 'N/search', 'N/task', 'N/cache'], (file, log, runtime, search, task, cache) => {

    /**
     * One entry per record type. Only CSVs placed directly in `pushFolder` are
     * submitted. `importId` is the saved CSV import's internal ID or script ID
     * (Setup > Import/Export > Saved CSV Imports). Folder IDs come from the
     * File Cabinet's Internal ID column.
     */
    const PUSH_CONFIG = [
        {
            type: 'Journal',
            importId: 693,
            pushFolder: 9159,       // BL_Mass CSV Upload > Journal > 01 Push
            errorFolder: 9160,      // ... > 02 Error
            archivedFolder: 9161,   // ... > 03 Archived
        },
        // {
        //     type: 'Vendor Invoice',
        //     importId: 0,          // saved import internal ID
        //     pushFolder: 0,        // Vendor Invoice > 01 Push
        //     errorFolder: 0,
        //     archivedFolder: 0,
        // },
    ];

    const USE_QUEUES = true;
    const MAX_QUEUE = 5;           // CSV import queues are 1..5
    const MIN_UNITS_LEFT = 150;    // stop cleanly; leftover files are picked up next run
    const CACHE_NAME = 'CSVPUSH_STATE';
    const CACHE_KEY = 'LAST_QUEUE';

    const execute = () => {
        const script = runtime.getCurrentScript();
        const configByFolder = {};
        PUSH_CONFIG.forEach((c) => { configByFolder[c.pushFolder] = c; });

        let queue = getStartQueue();
        const summary = { submitted: 0, failed: 0 };

        for (const f of listCsvFiles(Object.keys(configByFolder))) {
            if (script.getRemainingUsage() < MIN_UNITS_LEFT) {
                log.audit('Low governance', 'Stopping; remaining files will be handled next run.');
                break;
            }

            const cfg = configByFolder[f.folder];
            queue = queue % MAX_QUEUE + 1;
            try {
                const csvTask = task.create({
                    taskType: task.TaskType.CSV_IMPORT,
                    mappingId: cfg.importId,
                    importFile: file.load({ id: f.id }),
                    name: `${cfg.type} ${f.name}`.slice(0, 100),
                });
                if (USE_QUEUES) csvTask.queue = queue;

                const taskId = csvTask.submit();
                log.audit('Submitted', `${f.name} -> ${cfg.type}${USE_QUEUES ? ` (queue ${queue})` : ''}, task ${taskId}`);
                moveFile(f.id, cfg.archivedFolder);
                summary.submitted++;
            } catch (e) {
                log.error(`Failed to submit ${f.name}`, e);
                summary.failed++;
                moveFile(f.id, cfg.errorFolder);
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
