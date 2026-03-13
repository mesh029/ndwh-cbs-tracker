#!/usr/bin/env node

/**
 * Script to fix dynamic [id] routes by adding generateStaticParams and fetchCache
 */

const fs = require('fs');
const path = require('path');

const API_DIR = path.join(process.cwd(), 'app', 'api');

const ADDITIONS = {
  fetchCache: "export const fetchCache = 'force-no-store'",
  generateStaticParams: "// Prevent Next.js from trying to generate static params\nexport async function generateStaticParams() {\n  return []\n}"
};

function fixRouteFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Only process files with [id] in path
  if (!filePath.includes('[id]')) {
    return false;
  }
  
  let newContent = content;
  let modified = false;
  
  // Add fetchCache if missing
  if (!content.includes("export const fetchCache")) {
    const dynamicMatch = content.match(/export const dynamic[^\n]*\n/);
    if (dynamicMatch) {
      const insertPos = content.indexOf(dynamicMatch[0]) + dynamicMatch[0].length;
      newContent = newContent.slice(0, insertPos) + ADDITIONS.fetchCache + '\n' + newContent.slice(insertPos);
      modified = true;
    }
  }
  
  // Add generateStaticParams if missing
  if (!content.includes("generateStaticParams")) {
    const fetchCacheMatch = newContent.match(/export const fetchCache[^\n]*\n/);
    const dynamicMatch = newContent.match(/export const dynamic[^\n]*\n/);
    let insertPos = 0;
    
    if (fetchCacheMatch) {
      insertPos = newContent.indexOf(fetchCacheMatch[0]) + fetchCacheMatch[0].length;
    } else if (dynamicMatch) {
      insertPos = newContent.indexOf(dynamicMatch[0]) + dynamicMatch[0].length;
    }
    
    if (insertPos > 0) {
      newContent = newContent.slice(0, insertPos) + '\n' + ADDITIONS.generateStaticParams + '\n' + newContent.slice(insertPos);
      modified = true;
    }
  }
  
  // Update params type to be async-compatible
  const paramsPattern = /(\{ params \}: \{ params: )(\{ id: string \})( \})/g;
  if (paramsPattern.test(newContent)) {
    newContent = newContent.replace(
      /(\{ params \}: \{ params: )(\{ id: string \})( \})/g,
      '$1Promise<$2> | $2$3'
    );
    
    // Add await for params in function bodies
    const functionMatches = [...newContent.matchAll(/export async function (PATCH|DELETE|GET|POST)\([^)]*\{ params[^}]*\}\)[^{]*\{/g)];
    
    for (const match of functionMatches) {
      const funcStart = match.index + match[0].length;
      const funcBody = newContent.slice(funcStart);
      const firstBrace = funcBody.indexOf('{');
      const secondBrace = funcBody.indexOf('{', firstBrace + 1);
      
      if (secondBrace !== -1) {
        const insertPos = funcStart + secondBrace + 1;
        // Check if we already have resolvedParams
        const funcName = match[1];
        const funcContent = newContent.slice(funcStart);
        if (!funcContent.includes('resolvedParams')) {
          const indent = '  ';
          const paramsResolve = `${indent}const resolvedParams = await Promise.resolve(params)\n`;
          newContent = newContent.slice(0, insertPos) + paramsResolve + newContent.slice(insertPos);
          
          // Replace params.id with resolvedParams.id
          const funcEnd = newContent.indexOf('}', insertPos);
          const funcBodyContent = newContent.slice(insertPos, funcEnd);
          const updatedBody = funcBodyContent.replace(/\bparams\.id\b/g, 'resolvedParams.id');
          newContent = newContent.slice(0, insertPos) + updatedBody + newContent.slice(funcEnd);
          modified = true;
        }
      }
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    return true;
  }
  
  return false;
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name === 'route.ts') {
      if (fixRouteFile(fullPath)) {
        console.log(`✓ Fixed: ${fullPath}`);
      }
    }
  }
}

console.log('🔧 Fixing dynamic [id] routes...\n');
processDirectory(API_DIR);
console.log('\n✅ Done!');
