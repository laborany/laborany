#!/usr/bin/env node
/**
 * Export SVG slides to PPTX
 * Usage: node export_pptx.js <input_dir> [output_path]
 */

const fs = require('fs');
const path = require('path');

// Check for pptxgenjs
let PptxGenJS;
try {
  PptxGenJS = require('pptxgenjs');
} catch (e) {
  console.error('❌ Missing dependency: pptxgenjs');
  console.error('\nInstall required package:');
  console.error('  npm install pptxgenjs');
  process.exit(1);
}

function showHelp() {
  console.log(`
Export SVG slides to PPTX

Usage: node export_pptx.js <input_dir> [output_path]

Arguments:
  input_dir     Directory containing SVG files
  output_path   (Optional) Output PPTX file path
                Default: <input_dir>/slides-YYYY-MM-DD.pptx

Examples:
  node export_pptx.js ./ppt-output/
  node export_pptx.js ./ppt-output/ ./presentation.pptx
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
  let outputPath = path.join(inputDir, `slides-${timestamp}.pptx`);
  
  if (!fs.existsSync(outputPath)) {
    return outputPath;
  }
  
  let counter = 2;
  while (true) {
    outputPath = path.join(inputDir, `slides-${timestamp}-${counter}.pptx`);
    if (!fs.existsSync(outputPath)) {
      return outputPath;
    }
    counter++;
  }
}

async function exportToPptx(inputDir, outputPath) {
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
  
  // Create presentation
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  
  // Add slides
  console.log(`\n📊 Creating presentation with ${svgFiles.length} slide(s)...`);
  for (const svgFile of svgFiles) {
    const svgPath = path.join(inputDir, svgFile);
    const slide = pptx.addSlide();
    
    try {
      slide.addImage({
        path: svgPath,
        x: 0,
        y: 0,
        w: '100%',
        h: '100%'
      });
      console.log(`  ✓ Added: ${svgFile}`);
    } catch (err) {
      console.error(`  ✗ Error adding ${svgFile}: ${err.message}`);
      process.exit(1);
    }
  }
  
  // Save presentation
  try {
    pptx.writeFile(outputPath);
    console.log(`\n✅ PPTX exported: ${outputPath} (${svgFiles.length} slides)\n`);
  } catch (err) {
    console.error(`❌ Error saving PPTX: ${err.message}`);
    process.exit(1);
  }
}

// Main
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

const inputDir = args[0];
const customOutputPath = args[1];
const outputPath = getOutputPath(inputDir, customOutputPath);

exportToPptx(inputDir, outputPath).catch(err => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
