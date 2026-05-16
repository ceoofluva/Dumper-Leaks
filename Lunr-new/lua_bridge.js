const { processScript } = require('./lua_runner');
const fs = require('fs');

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node lua_bridge.js <file_path>');
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const result = await processScript(content);
        process.stdout.write(result);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();
