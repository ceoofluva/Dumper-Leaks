const { processScript } = require('./lua_runner');
const fs = require('fs');

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node lua_bridge_original.js <file_path>');
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const result = await processScript(content);
        if (result) {
            process.stdout.write(result);
        } else {
            process.stdout.write("No output");
        }
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();
