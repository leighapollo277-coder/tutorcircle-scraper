const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { google } = require('googleapis');
require('dotenv').config();

const CREDENTIALS_PATH = path.join(__dirname, process.env.SERVICE_ACCOUNT_PATH || 'unified-hull-493305-c5-7c5d90279adf.json');
const CSV_PATH = path.join(__dirname, 'cases.csv');
const ENV_PATH = path.join(__dirname, '.env');

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const auth = google.auth.fromJSON(credentials);
auth.scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

const HEADERS = [
    'Case ID', 'Applying URL', 'Grade', 'Subject', 'Fee', 'General Location', 'Date', 
    'Specific Location', 'Lessons/Week', 'Duration', 'Availability', 
    'Other Req', 'Applicants', 'Scraped At', 'Checked At', 'Status'
];

async function initSpreadsheet() {
    let spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
        throw new Error('SPREADSHEET_ID missing in .env');
    }
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
    } catch (e) {
        return [];
    }
}

async function syncTab(spreadsheetId, tabName, records, filterFn = (r) => true) {
    console.log(`Syncing ${tabName}...`);
    const existingData = await getSheetData(spreadsheetId, `'${tabName}'!A:O`);
    const now = new Date().toLocaleString();
    
    // Create map of existing data for quick lookup
    // existingRows[CaseID] = fullRowArray
    const existingMap = new Map();
    if (existingData.length > 1) {
        existingData.slice(1).forEach(row => {
            if (row[0]) existingMap.set(row[0], row);
        });
    }

    const finalRows = [HEADERS];
    const seenInCSV = new Set();

    // Process CSV records
    for (const r of records) {
        if (!filterFn(r)) continue;
        
        const caseId = r['Case ID'];
        seenInCSV.add(caseId);

        let status = 'New';
        let scrapedAt = r['Scraped At'];
        let checkedAt = now;

        if (existingMap.has(caseId)) {
            const existingRow = existingMap.get(caseId);
            scrapedAt = existingRow[13] || r['Scraped At'];
            // Preserve status if it's already set (e.g., 'Existing', 'Applied')
            status = existingRow[15] || 'Existing';
            checkedAt = now; 
        }

        const row = [
            r['Case ID'], 
            `https://tutorcircle.hk/case_apply.php?case_id=${caseId}`,
            r['Grade'], r['Subject'], r['Fee'], r['General Location'], 
            r['Date'], r['Specific Location'], r['Lessons/Week'], r['Duration'], 
            r['Availability'], r['Other Req'], r['Applicants'], scrapedAt, checkedAt, status
        ];
        finalRows.push(row);
    }

    // Capture rows that are in the Sheet but NOT in the Latest CSV (Optional: Mark as Closed?)
    for (const [id, row] of existingMap) {
        if (!seenInCSV.has(id)) {
            row[14] = now; 
            if (!row[15]) row[15] = 'Existing';
            finalRows.push(row);
        }
    }

    // Sort by Date (Index 6) descending
    const headerRow = finalRows.shift();
    finalRows.sort((a, b) => {
        const dateA = a[6] || '';
        const dateB = b[6] || '';
        return dateB.localeCompare(dateA);
    });
    finalRows.unshift(headerRow);

    // Update Sheet
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabName}'!A1`,
        valueInputOption: 'USER_ENTERED', // Use USER_ENTERED to make URLs clickable
        resource: { values: finalRows }
    });
    console.log(`Updated ${finalRows.length - 1} rows in '${tabName}'`);
}

async function sync() {
    console.log('--- Starting Spreadsheet Heartbeat Sync ---');
    if (!fs.existsSync(CSV_PATH)) return console.error('CSV not found');
    const records = parse(fs.readFileSync(CSV_PATH, 'utf-8'), { columns: true });

    const spreadsheetId = await initSpreadsheet();
    await ensureSheets(spreadsheetId);

    // Sync All Cases
    await syncTab(spreadsheetId, 'All Cases', records);

    // Sync Actionable
    const gradeFilter = /中(四|五|六)/;
    const subjectFilter = /(數學|M1|M2|Math)/i;
    await syncTab(spreadsheetId, 'Actionable', records, (r) => {
        return gradeFilter.test(r['Grade']) && subjectFilter.test(r['Subject']);
    });

    console.log(`Sync Finished. URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
}

sync().catch(console.error);
