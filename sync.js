const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { google } = require('googleapis');
require('dotenv').config();

const CREDENTIALS_PATH = path.join(__dirname, process.env.SERVICE_ACCOUNT_PATH || 'unified-hull-493305-c5-7c5d90279adf.json');
const CSV_PATH = path.join(__dirname, 'cases.csv');

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const auth = google.auth.fromJSON(credentials);
auth.scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

const sheets = google.sheets({ version: 'v4', auth });

const HEADERS = [
    'Case ID', 'Grade', 'Subject', 'Fee', 'General Location', 'Date', 
    'Specific Location', 'Lessons/Week', 'Duration', 'Availability', 
    'Other Req', 'Applicants', 'Scraped At', 'Checked At', 'Status', 'Applying URL'
];

async function initSpreadsheet() {
    let spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID missing in .env');
    return spreadsheetId;
}

async function ensureSheets(spreadsheetId) {
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetTitles = res.data.sheets.map(s => s.properties.title);
    const requests = [];
    if (!sheetTitles.includes('All Cases')) requests.push({ addSheet: { properties: { title: 'All Cases' } } });
    if (!sheetTitles.includes('Actionable')) requests.push({ addSheet: { properties: { title: 'Actionable' } } });
    if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
    }
}

async function getSheetData(spreadsheetId, range) {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        return res.data.values || [];
    } catch (e) { return []; }
}

function getHKTime() {
    return new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
}

async function syncTab(spreadsheetId, tabName, records, filterFn = (r) => true) {
    console.log(`Syncing ${tabName}...`);
    const existingData = await getSheetData(spreadsheetId, `'${tabName}'!A:P`);
    const now = getHKTime();
    
    const existingMap = new Map();
    if (existingData.length > 1) {
        existingData.slice(1).forEach(row => {
            if (row[0]) existingMap.set(row[0], row);
        });
    }

    const filteredRecords = records.filter(filterFn);

    // Sorting by Date (Descending) and Case ID (Descending)
    filteredRecords.sort((a, b) => {
        const dateA = new Date(a.Date);
        const dateB = new Date(b.Date);
        if (dateB - dateA !== 0) return dateB - dateA;
        return parseInt(b['Case ID']) - parseInt(a['Case ID']);
    });

    const finalRows = [HEADERS];
    const seenInCSV = new Set();

    for (const r of filteredRecords) {
        const caseId = r['Case ID'];
        seenInCSV.add(caseId);

        let status = 'New';
        let scrapedAt = r['Scraped At'];
        let checkedAt = now;

        if (existingMap.has(caseId)) {
            const existingRow = existingMap.get(caseId);
            scrapedAt = existingRow[12] || r['Scraped At'];
            status = existingRow[14] || 'Existing';
            checkedAt = now; 
        }

        const applyUrl = `https://tutorcircle.hk/case_apply.php?case_id=${caseId}`;

        const row = [
            r['Case ID'], r['Grade'], r['Subject'], r['Fee'], r['General Location'], 
            r['Date'], r['Specific Location'], r['Lessons/Week'], r['Duration'], 
            r['Availability'], r['Other Req'], r['Applicants'], scrapedAt, checkedAt, status, applyUrl
        ];
        finalRows.push(row);
    }

    // Keep rows that are in the sheet but not in the latest scrape (as they might be closed)
    for (const [id, row] of existingMap) {
        if (!seenInCSV.has(id)) {
            row[13] = now; // Update heart beat
            finalRows.push(row);
        }
    }

    // Update entire sheet
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabName}'!A1`,
        valueInputOption: 'RAW',
        resource: { values: finalRows }
    });
    console.log(`Updated ${finalRows.length - 1} rows in '${tabName}'`);
}

async function sync() {
    console.log('--- Starting Optimized Spreadsheet Sync (HKT & Sorting) ---');
    if (!fs.existsSync(CSV_PATH)) return console.error('CSV not found');
    const records = parse(fs.readFileSync(CSV_PATH, 'utf-8'), { columns: true });

    const spreadsheetId = await initSpreadsheet();
    await ensureSheets(spreadsheetId);

    await syncTab(spreadsheetId, 'All Cases', records);

    const gradeFilter = /中(四|五|六)/;
    const subjectFilter = /(數學|M1|M2|Math)/i;
    await syncTab(spreadsheetId, 'Actionable', records, (r) => {
        return gradeFilter.test(r['Grade']) && subjectFilter.test(r['Subject']);
    });

    console.log(`Sync Finished. URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
}

sync().catch(console.error);
