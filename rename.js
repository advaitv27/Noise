const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (file === 'node_modules' || file === '.git' || file === '.env' || file === 'dist' || file.endsWith('.png') || file.endsWith('.ico')) return;
        
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else {
            if (['.js', '.css', '.html', '.md', '.json', '.yml'].includes(path.extname(fullPath))) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

const files = walk(__dirname);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    // Case-sensitive replacements
    content = content.replace(/Noise/g, 'Noise');
    content = content.replace(/noise/g, 'noise');
    content = content.replace(/Noise/g, 'Noise');
    
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Updated:', file);
    }
});
console.log('Rename complete.');
