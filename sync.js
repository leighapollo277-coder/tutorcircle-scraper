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

async function initSpreadsheet() {
    let spreadsheetId = process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
        console.log('No SPREADSHEET_ID found. Creating a new one...');
        const res = await sheets.spreadsheets.create({
            resource: {
                properties: { title: 'TutorCircle Auto Apply Tracker' }
            }
        });
        spreadsheetId = res.data.spreadsheetId;
        console.log(`Created Spreadsheet ID: ${spreadsheetId}`);

        if (process.env.USER_EMAIL) {
            console.log(`Sharing with ${process.env.USER_EMAIL}...`);
            await drive.permissions.create({
                fileId: spreadsheetId,
                requestBody: {
                    type: 'user',
                    role: 'editor',
                    emailAddress: process.env.USER_EMAIL
                }
            });
            console.log('Shared successfully.');
        }

        const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
        const updatedEnv = envContent.replace(/SPREADSHEET_ID=.*/, `SPREADSHEET_ID=${spreadsheetId}`);
        fs.writeFileSync(ENV_PATH, updatedEnv);
        console.log('Updated .env with new SPREADSHEET_ID');
    }

    return spreadsheetId;
}

async function ensureSheets(spreadsheetId) {
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetTitles = res.data.sheets.map(s => s.properties.title);
    
    const requests = [];
    if (!sheetTitles.includes('All Cases')) {
        requests.push({ addSheet: { properties: { title: 'All Cases' } } });
    }
    if (!sheetTitles.includes('Actionable')) {
        requests.push({ addSheet: { properties: { title: 'Actionable' } } });
    }

    if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests }
        });
        console.log('Created missing sheets.');
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

async function sync() {
    console.log('--- Starting Spreadsheet Sync (Pure GoogleAPI) ---');
    
    const spreadsheetId = await initSpreadsheet();
    await ensureSheets(spreadsheetId);

    // Initial Headers if empty
    const headers = [
        'Case ID', 'Grade', 'Subject', 'Fee', 'General Location', 'Date', 
        'Specific Location', 'Lessons/Week', 'Duration', 'Availability', 
        'Other Req', 'Applicants', 'Scraped At'
    ];

    // Load CSV
    if (!fs.existsSync(CSV_PATH)) return console.error('CSV not found');
    const records = parse(fs.readFileSync(CSV_PATH, 'utf-8'), { columns: true });

    // Sync "All Cases"
    const allExisting = await getSheetData(spreadsheetId, "'All Cases'!A:M");
    if (allExisting.length === 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId, range: "'All Cases'!A1",
            valueInputOption: 'RAW', resource: { values: [headers] }
        });
    }
    const existingAllIds = new Set(allExisting.map(row => row[0]));
    const newAllRows = records.filter(r => !existingAllIds.has(r['Case ID']))
                             .map(r => headers.map(h => r[h]));

    if (newAllRows.length > 0) {
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: "'All Cases'!A1",
            valueInputOption: 'RAW', resource: { values: newAllRows }
        });
        console.log(`Added ${newAllRows.length} to 'All Cases'`);
    }

    // Sync "Actionable"
    const actionableExisting = await getSheetData(spreadsheetId, "'Actionable'!A:N");
    const actionableHeaders = [...headers, 'Status'];
    if (actionableExisting.length === 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId, range: "'Actionable'!A1",
            valueInputOption: 'RAW', resource: { values: [actionableHeaders] }
        });
    }
    const existingActionableIds = new Set(actionableExisting.map(row => row[0]));
    
    const gradeFilter = /中(四|五|六)/;
    const subjectFilter = /(數學|M1|M2|Math)/i;

    const newActionableRows = records
        .filter(r => gradeFilter.test(r['Grade']) && subjectFilter.test(r['Subject']))
        .filter(r => !existingActionableIds.has(r['Case ID']))
        .map(r => [...headers.map(h => r[h]), 'New']);

    if (newActionableRows.length > 0) {
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: "'Actionable'!A1",
            valueInputOption: 'RAW', resource: { values: newActionableRows }
        });
        console.log(`Added ${newActionableRows.length} to 'Actionable'`);
    }

    console.log(`Sync Finished. URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
}

sync().catch(console.error);
