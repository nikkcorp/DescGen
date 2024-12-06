const puppeteer = require('puppeteer');
const readline = require('readline');

const amazonDomains = {
  'DE': 'https://www.amazon.de/dp/',
  'IT': 'https://www.amazon.it/dp/',
  'ES': 'https://www.amazon.es/dp/',
  'FR': 'https://www.amazon.fr/dp/',
  'UK': 'https://www.amazon.co.uk/dp/',
  'US': 'https://www.amazon.com/dp/',
  'JP': 'https://www.amazon.co.jp/dp/',
  'CA': 'https://www.amazon.ca/dp/',
};

async function checkProductExistence(sku) {
  let productExists = false;

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Block unnecessary resources for faster loading
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const blockedResources = ['image', 'stylesheet', 'font', 'media'];
    if (blockedResources.includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  for (const [country, url] of Object.entries(amazonDomains)) {
    const productUrl = `${url}${sku}`;

    try {
      // Load page faster by limiting waitUntil and timeout
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait only for necessary elements
      await page.waitForSelector('#productTitle', { timeout: 5000 });

      const productTitle = await page.$eval('#productTitle', el => el.textContent.trim());

      // Check if the product is available by looking for error messages
      const isProductAvailable = await page.evaluate(() => {
        const title = document.querySelector('title').textContent.toLowerCase();
        const h1 = document.querySelector('h1')?.textContent.toLowerCase();
        const h2 = document.querySelector('h2')?.textContent.toLowerCase();
        return title.includes('page not found') || h1.includes('no results for') || h2.includes('product does not exist');
      });

      if (isProductAvailable) {
        console.log(`Product does not exist on Amazon ${country} - ${productUrl}`);
      } else {
        productExists = true;

        // Extract product features
        const features = await page.$$eval('#featurebullets_feature_div .a-unordered-list .a-list-item', elements => {
          return elements.map(el => el.textContent.trim());
        });

        // Extract product description
        let productDescription = '';
        try {
          productDescription = await page.$eval('#productDescription p', el => el ? el.textContent.trim() : '');
        } catch (e) {
          // If #productDescription p doesn't exist, try another common description area
          try {
            productDescription = await page.$eval('.a-section.a-spacing-medium #productOverview_feature_div', el => el ? el.textContent.trim() : '');
          } catch (e) {
            console.log('No product description found.');
          }
        }

        // Extract product details from the "prodDetTable"
        const tableDetails = await page.$$eval('.a-keyvalue.prodDetTable tbody tr', rows => {
          const details = {};
          rows.forEach(row => {
            const key = row.querySelector('th') ? row.querySelector('th').textContent.trim() : '';
            const value = row.querySelector('td') ? row.querySelector('td').textContent.trim() : '';
            if (key && value) {
              details[key] = value;
            }
          });
          return details;
        });

        // Extract product description list items
        const descriptionList = await page.$$eval('.a-unordered-list.a-vertical.a-spacing-small .a-list-item', items => {
          return items.map(item => item.textContent.trim());
        });

        // Extract product details from the "detailBulletsWrapper_feature_div"
        const detailBullets = await page.$$eval('#detailBulletsWrapper_feature_div .detail-bullet-list .a-list-item', items => {
          const details = {};
          items.forEach(item => {
            const boldText = item.querySelector('.a-text-bold');
            const valueText = item.querySelector('span:not(.a-text-bold)');
            if (boldText && valueText) {
              const key = boldText.textContent.trim();
              const value = valueText.textContent.trim();
              details[key] = value;
            }
          });
          return details;
        });

        console.log(`\nAmazon ${country} - ${productUrl}\n`);
        console.log(`Product Title: ${productTitle}`);
        
        if (productDescription) {
          console.log(`Product Description: ${productDescription}`);
        }

        if (features) {
          console.log(`Product Features:`);
          features.forEach(feature => console.log(`- ${feature}`));
        }

        if (tableDetails) {
          console.log(`Product Table Details:`);
          Object.entries(tableDetails).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
          });
        }

        if (descriptionList) {
          console.log(`Product Description List:`);
          descriptionList.forEach((item, index) => {
            console.log(`${index + 1}. ${item}`);
          });
        }

        if (detailBullets) {
          console.log(`Product Detail Bullets:`);
          Object.entries(detailBullets).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
          });
        }

        break;
      }
    } catch (error) {
      console.log(`Error checking Amazon ${country}:`, error.message);
    }
  }

  if (!productExists) {
    console.log('Product does not exist');
  }

  await browser.close();
}

// Readline interface for taking input from terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\n\nPlease enter SKU: '
});

rl.prompt();

rl.on('line', async (input) => {
  const sku = input.trim();

  if (sku === '') {
    console.clear();
    rl.prompt();
    return;
  }

  await checkProductExistence(sku);

  rl.prompt(); // Prompt for the next SKU
});
