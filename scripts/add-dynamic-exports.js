#!/usr/bin/env node

/**
 * Script to ensure all API routes have the necessary dynamic exports
 * Run this before building to ensure consistency
 */

const fs = require('fs');
const path = require('path');

const API_DIR = path.join(process.cwd(), 'app', 'api');

const DYNAMIC_EXPORTS = `// Force dynamic rendering to prevent build-time static generation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
`;

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check if file already has all three exports
  const hasDynamic = content.includes("export const dynamic");
  const hasRuntime = content.includes("export const runtime");
  const hasRevalidate = content.includes("export const revalidate");
  
  if (hasDynamic && hasRuntime && hasRevalidate) {
    return false; // Already has all exports
  }
  
  // Find the insertion point (after imports, before first export function)
  const lines = content.split('\n');
  let insertIndex = 0;
  
  // Find last import statement
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      insertIndex = i + 1;
    }
  }
  
  // Remove old dynamic export if it exists but is incomplete
  const newLines = [];
  let skipNext = false;
  for (let i = 0; i < lines.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    
    // Skip old incomplete dynamic exports
    if (lines[i].includes('export const dynamic') && !hasRuntime) {
      // Skip this line and check if next line is empty
      if (i + 1 < lines.length && lines[i + 1].trim() === '') {
        skipNext = true;
      }
      continue;
    }
    
    newLines.push(lines[i]);
  }
  
  // Insert new exports after imports
  const finalLines = [
    ...newLines.slice(0, insertIndex),
    '',
    DYNAMIC_EXPORTS.trim(),
    '',
    ...newLines.slice(insertIndex)
  ];
  
  fs.writeFileSync(filePath, finalLines.join('\n'), 'utf8');
  return true;
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name === 'route.ts') {
      if (processFile(fullPath)) {
        console.log(`✓ Updated: ${fullPath}`);
      }
    }
  }
}

console.log('🔍 Checking API routes for dynamic exports...\n');
processDirectory(API_DIR);
console.log('\n✅ Done!');
