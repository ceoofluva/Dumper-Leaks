const { ConcurrentProcessor } = require('./concurrent_processor');
const path = require('path');
const fs = require('fs');

// Initialize concurrent processor
const processor = new ConcurrentProcessor();

async function main() {
    const scriptPath = process.argv[2];
    if (!scriptPath) {
        console.error('Usage: node lua_bridge_concurrent.js <script.lua>');
        process.exit(1);
    }

    if (!fs.existsSync(scriptPath)) {
        console.error(`Error: File '${scriptPath}' not found`);
        process.exit(1);
    }

    try {
        // Initialize workers
        await processor.initializeWorkers();
        
        // Process the script
        const startTime = Date.now();
        const result = await processor.processScript(scriptPath);
        const executionTime = Date.now() - startTime;
        
        console.log(result);
        console.error(`[CONCURRENT] Processing completed in ${executionTime}ms`);
        console.error(`[STATS] ${JSON.stringify(processor.getStats())}`);
        
        // Shutdown
        await processor.shutdown();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { processor };
