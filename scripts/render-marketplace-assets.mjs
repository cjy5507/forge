#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FORGE_ROOT = dirname(THIS_DIR);
const ASSETS_DIR = join(FORGE_ROOT, 'assets');
const previewUrl = pathToFileURL(join(ASSETS_DIR, 'marketplace-preview.html')).href;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  await page.goto(previewUrl);
  await page.screenshot({
    path: join(ASSETS_DIR, 'screenshot-overview.png'),
    type: 'png',
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(previewUrl);
  await page.screenshot({
    path: join(ASSETS_DIR, 'screenshot-console.png'),
    type: 'png',
    clip: { x: 40, y: 520, width: 1200, height: 360 },
  });

  await browser.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
