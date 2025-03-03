const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000; // Changed to 3000 to match Dockerfile

// Middleware
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static('public')); // Changed to serve from public directory

// Increase timeout for long operations
app.use((req, res, next) => {
    res.setTimeout(120000); // 2 minute timeout
    next();
});

// Store browser instance and last scraping time
let browser;
let lastScrapingTime = null;

// Function to save data to JSON file
async function saveToJson(data, category) {
    const fileName = path.join(process.env.DATA_DIR || 'scrapes', `${category}.json`);
    
    try {
        // Create scrapes directory if it doesn't exist
        const dir = process.env.DATA_DIR || 'scrapes';
        await fs.mkdir(dir, { recursive: true }).catch(() => {});
        
        // Save data to file with timestamp
        await fs.writeFile(fileName, JSON.stringify({
            data: data,
            timestamp: Date.now()
        }, null, 2));
        console.log(`Data saved to ${fileName}`);
        return fileName;
    } catch (error) {
        console.error('Error saving data:', error);
        throw error;
    }
}

// Function to load cached data from JSON file
async function loadFromJson(category) {
    const fileName = path.join(process.env.DATA_DIR || 'scrapes', `${category}.json`);
    try {
        const fileContent = await fs.readFile(fileName, 'utf-8');
        const cached = JSON.parse(fileContent);
        return cached;
    } catch (error) {
        console.log('No cached data found or error reading cache');
        return null;
    }
}

// Add this function after loadFromJson
function validateProduct(product) {
    return {
        ...product,
        title: product.title || 'Неизвестен продукт',
        store: product.store || 'Неизвестен магазин',
        price: typeof product.price === 'number' ? product.price : null,
        oldPrice: typeof product.oldPrice === 'number' ? product.oldPrice : null,
        discount: product.discount || '',
        unit: product.unit || '',
        basePrice: product.basePrice || '',
        subtitle: product.subtitle || '',
        image: product.image || '',
        isMeatProduct: !!product.isMeatProduct
    };
}

// Initialize browser on server start
async function initBrowser() {
    try {
        const isWindows = process.platform === 'win32';
        const options = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        };

        // If we're in Docker/Linux, use the installed Chrome
        if (!isWindows) {
            options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
        }
        // On Windows, let Puppeteer use the bundled Chromium
        else {
            const puppeteer = require('puppeteer');
            delete options.executablePath;
        }

        browser = await (isWindows ? require('puppeteer') : puppeteer).launch(options);
        console.log('Browser initialized successfully');
    } catch (error) {
        console.error('Failed to initialize browser:', error);
        throw error;
    }
}

// Scraper function for Billa meat products
async function scrapeBillaProducts() {
    const page = await browser.newPage();
    try {
        console.log('Scraping Billa products...');
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto('https://ssbbilla.site/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        await page.waitForSelector('.product', { timeout: 60000 });

        const products = await page.evaluate(() => {
            const items = document.querySelectorAll('.product');
            
            return Array.from(items).map(item => {
                const productNameEl = item.querySelector('.actualProduct');
                const priceElements = item.querySelectorAll('.price');
                
                // Get all price elements and clean them
                let prices = Array.from(priceElements).map(el => {
                    // Remove currency symbol and any non-numeric characters except decimal point
                    let price = el.textContent.trim()
                        .replace('лв.', '')
                        .replace(',', '.')
                        .trim();
                    return parseFloat(price);
                }).filter(price => !isNaN(price));

                // Get the text content and clean it up
                const fullProductText = productNameEl ? productNameEl.textContent.trim() : '';
                
                // Extract product details
                let title = fullProductText.replace('Супер цена ', '').replace('Само с Billa Card ', '');
                
                // If we have two prices, first is old price, second is new price
                // If we have one price, it's the current price
                return {
                    title: title,
                    subtitle: '',
                    store: 'Billa',
                    oldPrice: prices.length > 1 ? prices[0] : null,
                    price: prices.length > 0 ? prices[prices.length - 1] : null,
                    discount: prices.length > 1 ? 
                        Math.round(((prices[0] - prices[1]) / prices[0]) * 100) + '%' : '',
                    unit: title.includes('За 1 кг') ? 'кг' : 'бр.',
                };
            });
        });

        // Filter meat products
        const meatKeywords = ['месо', 'пиле', 'риба', 'колбас', 'луканка', 'салам', 'кайма', 'пастет', 'шунка', 'бут', 'филе', 'пастърма', 'суджук', 'кренвирш', 'вешалица'];
        
        const meatProducts = products.filter(product => 
            meatKeywords.some(keyword => 
                product.title.toLowerCase().includes(keyword)
            )
        ).map(product => ({
            ...product,
            isMeatProduct: true
        }));

        return meatProducts;
    } catch (error) {
        console.error('Error scraping Billa products:', error);
        throw error;
    } finally {
        await page.close();
    }
}

// Scraper function for Kaufland meat products
async function scrapeKauflandProducts() {
    const page = await browser.newPage();
    try {
        console.log('Scraping Kaufland products...');
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto('https://www.kaufland.bg/aktualni-predlozheniya/ot-ponedelnik/obsht-pregled.category=01_Месо__колбаси__риба.html', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        await page.waitForSelector('.k-product-grid__item', { timeout: 60000 });

        const products = await page.evaluate(() => {
            const items = document.querySelectorAll('.k-product-grid__item');
            
            return Array.from(items).map(item => {
                const titleEl = item.querySelector('.k-product-tile__title');
                const subtitleEl = item.querySelector('.k-product-tile__subtitle');
                const imageEl = item.querySelector('.k-product-tile__main-image');
                const priceEl = item.querySelector('.k-price-tag__price');
                const oldPriceEl = item.querySelector('.k-price-tag__old-price-line-through');
                const discountEl = item.querySelector('.k-price-tag__discount');
                const unitEl = item.querySelector('.k-product-tile__unit-price');
                const basePriceEl = item.querySelector('.k-product-tile__base-price');

                return {
                    title: titleEl ? titleEl.textContent.trim() : '',
                    subtitle: subtitleEl ? subtitleEl.textContent.trim() : '',
                    image: imageEl ? imageEl.src : '',
                    store: 'Kaufland',
                    price: priceEl ? parseFloat(priceEl.textContent.replace(',', '.')) : null,
                    oldPrice: oldPriceEl ? parseFloat(oldPriceEl.textContent.replace(',', '.')) : null,
                    discount: discountEl ? discountEl.textContent.trim() : '',
                    unit: unitEl ? unitEl.textContent.trim() : '',
                    basePrice: basePriceEl ? basePriceEl.textContent.trim() : ''
                };
            });
        });

        // Mark meat products
        const meatKeywords = ['месо', 'пиле', 'риба', 'колбас', 'луканка', 'салам', 'кайма', 'пастет', 'шунка', 'бут', 'филе', 'пастърма', 'суджук', 'кренвирш', 'вешалица'];
        
        const productsWithMeatFlag = products.map(product => ({
            ...product,
            isMeatProduct: meatKeywords.some(keyword => 
                (product.title + ' ' + product.subtitle).toLowerCase().includes(keyword)
            )
        }));

        return productsWithMeatFlag;
    } catch (error) {
        console.error('Error scraping Kaufland products:', error);
        throw error;
    } finally {
        await page.close();
    }
}

// Modify the scrapeMeatProducts function
async function scrapeMeatProducts() {
    try {
        // Try to load cached data
        const cached = await loadFromJson('meat');
        
        if (cached) {
            const cacheAge = Date.now() - cached.timestamp;
            const twentyFourHours = 24 * 60 * 60 * 1000;
            
            if (cacheAge < twentyFourHours) {
                console.log('Returning cached products');
                return cached.data.map(validateProduct);
            }
        }

        console.log('Scraping new products from all stores...');
        
        // Scrape from both stores
        const [kauflandProducts, billaProducts] = await Promise.all([
            scrapeKauflandProducts(),
            scrapeBillaProducts()
        ]);

        // Combine and validate products from both stores
        const allProducts = [...kauflandProducts, ...billaProducts].map(validateProduct);
        
        // Save to JSON for cache
        await saveToJson(allProducts, 'meat');

        return allProducts;
    } catch (error) {
        console.error('Error scraping products:', error);
        // If error occurs and we have cached data, return it
        const cached = await loadFromJson('meat');
        if (cached) {
            console.log('Returning cached data due to scraping error');
            return cached.data.map(validateProduct);
        }
        throw error;
    }
}

// Schedule daily scraping at 00:05 AM (Bulgarian time)
function scheduleDailyScraping() {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(0, 5, 0, 0); // Set to 00:05 AM
    
    if (nextRun <= now) { // If it's already past 00:05 today, schedule for tomorrow
        nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const timeUntilNextRun = nextRun - now;
    setTimeout(async () => {
        try {
            await scrapeMeatProducts();
        } catch (error) {
            console.error('Scheduled scraping failed:', error);
        }
        scheduleDailyScraping(); // Schedule next run
    }, timeUntilNextRun);
    
    console.log(`Next scraping scheduled for: ${nextRun}`);
}

// API Endpoints
app.get('/api/scrape/meat', async (req, res) => {
    try {
        if (!browser) {
            await initBrowser();
        }
        
        const products = await scrapeMeatProducts();
        lastScrapingTime = Date.now();
        
        res.json({
            success: true,
            products: products,
            lastScraped: new Date(lastScrapingTime).toISOString(),
            totalProducts: products.length
        });
    } catch (error) {
        console.error('Error in /api/scrape/meat endpoint:', error);
        
        // Try to recover browser if it crashed
        if (!browser) {
            try {
                await initBrowser();
            } catch (browserError) {
                console.error('Failed to recover browser:', browserError);
            }
        }
        
        // Return cached data if available
        try {
            const cached = await loadFromJson('meat');
            if (cached && cached.data) {
                return res.json({
                    success: true,
                    products: cached.data.map(validateProduct),
                    lastScraped: new Date(cached.timestamp).toISOString(),
                    fromCache: true,
                    error: error.message
                });
            }
        } catch (cacheError) {
            console.error('Failed to load cache:', cacheError);
        }
        
        res.status(500).json({
            success: false,
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', lastScraped: lastScrapingTime ? new Date(lastScrapingTime).toISOString() : null });
});

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Initialize browser and start server
initBrowser().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        scheduleDailyScraping(); // Start scheduling daily scrapes
    });
}).catch(error => {
    console.error('Failed to initialize browser:', error);
    process.exit(1);
}); 