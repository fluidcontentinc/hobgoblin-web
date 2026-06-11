#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');

console.log('Fixing index.html...');

if (!fs.existsSync(indexPath)) {
  console.error('Error: dist/index.html not found. Run "npx expo export --platform web" first.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

// The fixed style block
const fixedStyles = `    <!-- The \`react-native-web\` recommended style reset: https://necolas.github.io/react-native-web/docs/setup/#root-element -->
    <style id="expo-reset">
      /* These styles make the body full-height */
      html,
      body {
        height: 100%;
        margin: 0;
        padding: 0;
        background-color: #000000;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
      }
      /* These styles disable body scrolling if you are using <ScrollView> */
      body {
        overflow: hidden;
        width: 100%;
      }
      /* These styles make the root element full-height */
      #root {
        display: flex;
        height: 100%;
        flex: 1;
        background-color: #000000;
        position: relative;
        -webkit-overflow-scrolling: touch;
      }
      /* Enable touch scrolling for nested divs */
      #root div {
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
      }
      /* CRITICAL: ScrollView containers - allow content to expand */
      #root > div > div {
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-y !important;
        overflow-y: auto !important;
        min-height: 100% !important;
        position: relative !important;
      }
      /* Target React Native Web ScrollView containers */
      div[style*="overflow"],
      div[style*="flex: 1"],
      div[style*="flex:1"],
      div[data-rn-scroll-view],
      div[class*="ScrollView"] {
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-y !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        min-height: 100% !important;
        position: relative !important;
      }
      /* Ensure ScrollView content containers can expand */
      div[style*="flexGrow"],
      div[style*="flex-grow"],
      div[style*="paddingBottom"] {
        min-height: 100%;
      }
      /* Force enable touch scrolling on mobile */
      @media (hover: none) and (pointer: coarse) {
        #root > div > div {
          overflow-y: scroll !important;
          -webkit-overflow-scrolling: touch !important;
          touch-action: pan-y !important;
          min-height: 100% !important;
        }
        /* Ensure ScrollView content is visible and scrollable */
        div[style*="paddingBottom"],
        div[style*="flexGrow"] {
          overflow-y: visible !important;
          -webkit-overflow-scrolling: touch !important;
        }
      }
      /* Custom thin dark-theme scrollbar (Spec #5a) */
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.16);
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.28); }
      ::-webkit-scrollbar-corner { background: transparent; }
      * {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
      }
    </style>`;

// Match the style block - be flexible with whitespace
const styleRegex = /(\s*<!--[^>]*react-native-web[^>]*-->\s*)?<style id="expo-reset">[\s\S]*?<\/style>/;

if (styleRegex.test(html)) {
  html = html.replace(styleRegex, fixedStyles);
  // Fix any formatting issues (ensure newline after title)
  html = html.replace(/(<\/title>)\s*(<!--)/, '$1\n    $2');
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('✅ Successfully fixed index.html');
} else {
  console.error('Error: Could not find style block in index.html');
  console.error('HTML content:', html.substring(0, 500));
  process.exit(1);
}
