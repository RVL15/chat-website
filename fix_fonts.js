const fs = require('fs');

const path = './public/style.css';
let css = fs.readFileSync(path, 'utf8');

// We want to replace font-size: 14px; with font-size: calc(14rem / 14);
css = css.replace(/font-size:\s*(\d+(?:\.\d+)?)px\s*(;|\n|}|\!)/g, 'font-size: calc($1rem / 14)$2');

fs.writeFileSync(path, css);
console.log('Successfully updated font-sizes in style.css');
