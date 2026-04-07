#!/usr/bin/env node

import { writeDeliveryReport } from './lib/forge-delivery-report.mjs';

const result = writeDeliveryReport(process.cwd());
process.stdout.write(`${result.outputPath}\n`);
