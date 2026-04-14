const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'cases.csv');

// Define NEW 13-column CSV structure
const csvWriter = createCsvWriter({
    path: CSV_PATH,
    header: [
        {id: 'id', title: 'Case ID'},
        {id: 'grade', title: 'Grade'},
        {id: 'subject', title: 'Subject'},
        {id: 'fee', title: 'Fee'},
        {id: 'location_general', title: 'General Location'},
        {id: 'date', title: 'Date'},
        {id: 'location_detail', title: 'Specific Location'},
        {id: 'lessons_per_week', title: 'Lessons/Week'},
        {id: 'duration', title: 'Duration'},
        {id: 'availability', title: 'Availability'},
        {id: 'other_req', title: 'Other Req'},
        {id: 'applicants', title: 'Applicants'},
        {id: 'timestamp', title: 'Scraped At'}
    ],
    append: fs.existsSync(CSV_PATH)
});

async function getExistingIds() {
    if (!fs.existsSync(CSV_PATH)) return new Set();
    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = content.split('\n').slice(1);
    const ids = lines.map(line => line.split(',')[0].replace(/"/g, '')).filter(Boolean);
    return new Set(ids);
}

async function scrape() {
    console.log('--- Starting Deep Scrape ---');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    try {
        await page.goto('https://tutorcircle.hk/case-list.php?', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000); 

        // Get all case IDs first from headers
        const headers = await page.$$('a[id^="header_"]');
        console.log(`Found ${headers.length} case headers.`);

        const existingIds = await getExistingIds();
        const records = [];

        // Helper to close annoying modals
        async function closeModals() {
            try {
                const modal = await page.$('#modal_redirect');
                if (modal && await modal.isVisible()) {
                    console.log('Closing modal popup...');
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(1000);
                }
            } catch (e) {}
        }

        for (let i = 0; i < headers.length; i++) {
            await closeModals();
            const header = headers[i];
            
            // Extract Case ID from header to check if we already have it
            const headerText = await header.innerText();
            const idMatch = headerText.match(/\[(\d+)\]/);
            const id = idMatch ? idMatch[1] : `unknown_${i}`;

            if (existingIds.has(id)) {
                console.log(`Skipping existing Case ID: ${id}`);
                continue;
            }

            console.log(`Deep scraping Case ID: ${id} (${i + 1}/${headers.length})...`);
            
            try {
                // Click to expand
                await header.click({ force: true });
                
                // Wait for the collapse panel to have 'in' class or be visible
                const collapseId = await header.getAttribute('href');
                const panelSelector = `${collapseId}.in .panel-body`;
                await page.waitForSelector(panelSelector, { timeout: 10000 }).catch(() => null);

                const details = await page.evaluate((sel) => {
                    const body = document.querySelector(sel);
                    if (!body) return null;

                    const text = body.innerText;
                    
                    const extract = (label) => {
                        const regex = new RegExp(`${label}:?\\s*(.*)`, 'i');
                        const match = text.match(regex);
                        return match ? match[1].trim() : '';
                    };

                    return {
                        date: extract('日期'),
                        location_detail: extract('詳細地點').replace('(在Google地圖上查看)', '').trim(),
                        lessons_per_week: extract('堂數'),
                        duration: extract('每堂時間'),
                        availability: extract('可補習時間'),
                        other_req: extract('其他要求')
                    };
                }, panelSelector);

                if (details) {
                    // Extract common info from header (Col-md-3 structures)
                    const headerInfo = await page.evaluate((h) => {
                        const cols = h.querySelectorAll('.col-md-3');
                        const grade = cols[0].innerText.split(']').pop().trim();
                        const fee = cols[1].innerText.trim();
                        const subject = cols[2].innerText.trim();
                        const location_general = cols[3].innerText.trim().split('\n')[0];
                        const applicants = cols[3].innerText.includes('現時申請人數') ? cols[3].innerText.split('現時申請人數:')[1].trim() : 'N/A';
                        
                        return { grade, fee, subject, location_general, applicants };
                    }, header);

                    records.push({
                        id,
                        ...headerInfo,
                        ...details,
                        timestamp: new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' })
                    });
                } else {
                    console.warn(`Could not extract details for Case ID: ${id}`);
                }

                // Optional: click again to close to keep DOM clean
                await header.click();
                await page.waitForTimeout(500);

            } catch (err) {
                console.error(`Error scraping Case ID ${id}:`, err.message);
            }
        }

        if (records.length > 0) {
            console.log(`Successfully scraped ${records.length} new detailed cases.`);
            await csvWriter.writeRecords(records);
        } else {
            console.log('No new cases to add.');
        }

    } catch (error) {
        console.error('Critical Error during scraping:', error);
    } finally {
        await browser.close();
        console.log('--- Deep Scrape Finished ---');
    }
}

if (require.main === module) {
    scrape();
}

module.exports = { scrape };
