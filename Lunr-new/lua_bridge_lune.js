const { processLuaFile } = require('./lua_runner_lune');
const fs = require('fs');

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node lua_bridge_enhanced.js <file_path>');
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const result = await processLuaFile(filePath);
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
