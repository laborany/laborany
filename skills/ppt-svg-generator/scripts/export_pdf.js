#!/usr/bin/env node
/**
 * Export SVG slides to PDF using Playwright
 * 
 * Cross-platform solution (Windows/macOS/Linux) that uses Playwright
 * to render SVG files via a headless browser and generate a merged PDF.
 * 
 * Usage: node export_pdf.js <input_dir> [output_path]
 */

const fs = require('fs');
const path = require('path');

// Dependency check with helpful error messages
async function checkDependencies() {
  const missing = [];
  
  try {
    require('playwright');
  } catch (e) {
    missing.push('playwright');
  }
  
  try {
    require('pdf-lib');
  } catch (e) {
    missing.push('pdf-lib');
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing dependencies: ' + missing.join(', '));
    console.error('\nInstall required packages:');
    console.error('  cd ' + path.dirname(__filename));
    console.error('  npm install');
    console.error('\nOr install globally:');
    console.error('  npm install -g ' + missing.join(' '));
    
    if (missing.includes('playwright')) {
      console.error('\nPlaywright also requires browser installation:');
      console.error('  npx playwright install chromium');
    }
    
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Export SVG slides to PDF

Usage: node export_pdf.js <input_dir> [output_path]

Arguments:
  input_dir     Directory containing SVG files
  output_path   (Optional) Output PDF file path
                Default: <input_dir>/slides-YYYY-MM-DD.pdf

Options:
  --help, -h    Show this help message

Examples:
  node export_pdf.js ./ppt-output/
  node export_pdf.js ./ppt-output/ ./presentation.pdf

Cross-platform: Works on Windows, macOS, and Linux.
`);
}

function naturalSort(a, b) {
  // Natural sort for slide-01, slide-02, ... slide-10
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function getOutputPath(inputDir, customPath) {
  if (customPath) {
    // If custom path provided, check for conflicts
    if (!fs.existsSync(customPath)) {
      return customPath;
    }
    
    const dir = path.dirname(customPath);
    const ext = path.extname(customPath);
    const base = path.basename(customPath, ext);
    
    let counter = 2;
    while (true) {
      const newPath = path.join(dir, `${base}-${counter}${ext}`);
      if (!fs.existsSync(newPath)) {
        return newPath;
      }
      counter++;
    }
  }
  
  // Generate timestamped filename
  const timestamp = new Date().toISOString().split('T')[0];
  let outputPath = path.join(inputDir, `slides-${timestamp}.pdf`);
  
  if (!fs.existsSync(outputPath)) {
    return outputPath;
  }
  
  let counter = 2;
  while (true) {
    outputPath = path.join(inputDir, `slides-${timestamp}-${counter}.pdf`);
    if (!fs.existsSync(outputPath)) {
      return outputPath;
    }
    counter++;
  }
}

/**
 * Convert a single SVG file to PDF buffer using Playwright
 */
async function svgToPdfBuffer(browser, svgPath) {
  const svgContent = fs.readFileSync(svgPath, 'utf-8');
  
  // Extract SVG dimensions (default to 1920x1080 for 16:9)
  let width = 1920;
  let height = 1080;
  
  const widthMatch = svgContent.match(/width=["'](\d+)/);
  const heightMatch = svgContent.match(/height=["'](\d+)/);
  
  if (widthMatch) width = parseInt(widthMatch[1], 10);
  if (heightMatch) height = parseInt(heightMatch[1], 10);
  
  // Create a page with the SVG dimensions
  const page = await browser.newPage({
    viewport: { width, height }
  });
  
  // Create an HTML wrapper for the SVG
  // Use file:// protocol for cross-platform compatibility with local resources
  const svgDir = path.dirname(svgPath);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: ${width}px; 
      height: ${height}px; 
      overflow: hidden;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
${svgContent}
</body>
</html>`;
  
  // Set content with file:// base URL for local resource access
  await page.setContent(html, {
    waitUntil: 'networkidle'
  });
  
  // Generate PDF with exact dimensions (convert px to inches at 96 DPI)
  const pdfBuffer = await page.pdf({
    width: `${width}px`,
    height: `${height}px`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  
  await page.close();
  
  return pdfBuffer;
}

/**
 * Merge multiple PDF buffers into a single PDF using pdf-lib
 */
async function mergePdfs(pdfBuffers) {
  const { PDFDocument } = require('pdf-lib');
  
  const mergedPdf = await PDFDocument.create();
  
  for (const buffer of pdfBuffers) {
    const pdf = await PDFDocument.load(buffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach(page => mergedPdf.addPage(page));
  }
  
  return await mergedPdf.save();
}

async function exportToPdf(inputDir, outputPath) {
  const { chromium } = require('playwright');
  
  // Validate input directory
  if (!fs.existsSync(inputDir)) {
    console.error(`❌ Input directory not found: ${inputDir}`);
    process.exit(1);
  }
  
  if (!fs.statSync(inputDir).isDirectory()) {
    console.error(`❌ Not a directory: ${inputDir}`);
    process.exit(1);
  }
  
  // Find SVG files
  const files = fs.readdirSync(inputDir);
  const svgFiles = files
    .filter(f => f.toLowerCase().endsWith('.svg'))
    .sort(naturalSort);
  
  if (svgFiles.length === 0) {
    console.error(`❌ No SVG files found in ${inputDir}`);
    process.exit(1);
  }
  
  console.log(`\n📄 Found ${svgFiles.length} SVG file(s)`);
  console.log('🚀 Starting PDF conversion (using Playwright)...\n');
  
  // Launch browser
  let browser;
  try {
    browser = await chromium.launch({
      headless: true
    });
  } catch (e) {
    if (e.message.includes('Executable doesn\'t exist') || e.message.includes('browserType.launch')) {
      console.error('❌ Chromium browser not installed for Playwright');
      console.error('\nInstall the browser with:');
      console.error('  npx playwright install chromium');
      process.exit(1);
    }
    throw e;
  }
  
  try {
    const pdfBuffers = [];
    
    for (let i = 0; i < svgFiles.length; i++) {
      const svgFile = svgFiles[i];
      const svgPath = path.join(inputDir, svgFile);
      
      process.stdout.write(`  [${i + 1}/${svgFiles.length}] Converting ${svgFile}...`);
      
      try {
        const pdfBuffer = await svgToPdfBuffer(browser, svgPath);
        pdfBuffers.push(pdfBuffer);
        console.log(' ✅');
      } catch (err) {
        console.log(' ❌');
        console.error(`\n❌ Failed to convert ${svgFile}: ${err.message}`);
        process.exit(1);
      }
    }
    
    // Merge all PDFs
    console.log('\n📎 Merging pages...');
    const mergedPdf = await mergePdfs(pdfBuffers);
    
    // Write output file
    fs.writeFileSync(outputPath, mergedPdf);
    
    console.log(`\n✅ PDF exported: ${outputPath} (${svgFiles.length} pages)\n`);
    
  } finally {
    await browser.close();
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  if (args.length === 0) {
    console.error('❌ Missing required argument: input_dir');
    console.error('Use --help for usage information');
    process.exit(1);
  }
  
  // Check dependencies first
  await checkDependencies();
  
  const inputDir = path.resolve(args[0]);
  const customOutputPath = args[1] ? path.resolve(args[1]) : null;
  const outputPath = getOutputPath(inputDir, customOutputPath);
  
  await exportToPdf(inputDir, outputPath);
}

main().catch(err => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
