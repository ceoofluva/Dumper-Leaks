const { processLuaFile } = require('./lua_runner_enhanced');
const { ConcurrentProcessor } = require('./concurrent_processor');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

// Obfuscation detection and normalization functions
function detectObfuscator(code) {
    if (!code) return "unknown";
    
    // Star Obfuscator
    if (code.includes("STAR OBFUSCATOR") && code.match(/local function \w+\(\) local \w+="\\[\d\\]+";/)) {
        return "star";
    }
    
    // HolyLua Obfuscator
    if (code.match(/--\[\[\s*holylua\s+v[\d.]+\s*\]\]/i)) {
        return "holylua";
    }
    
    return "unknown";
}

function normalizeCode(code) {
    const obfuscator = detectObfuscator(code);
    
    if (obfuscator === "star") {
        try {
            // Use Python obfuscation handler for Star
            const tempInput = 'temp_star_input.txt';
            const tempOutput = 'temp_star_output.lua';
            
            fs.writeFileSync(tempInput, code);
            
            try {
                const result = execSync(`python -c "from obfuscation_handler import normalize_code; import sys; code = open('${tempInput}', 'r', encoding='utf-8', errors='ignore').read(); normalized = normalize_code(code); print(normalized)"`, { 
                    encoding: 'utf-8',
                    cwd: __dirname
                });
                
                // Clean up temp files
                try { fs.unlinkSync(tempInput); } catch (e) {}
                try { fs.unlinkSync(tempOutput); } catch (e) {}
                
                return result;
            } catch (pythonError) {
                console.error('Python normalization failed:', pythonError.message);
                // Clean up temp files
                try { fs.unlinkSync(tempInput); } catch (e) {}
                try { fs.unlinkSync(tempOutput); } catch (e) {}
                return code;
            }
        } catch (error) {
            console.error('Star normalization failed:', error.message);
            return code;
        }
    } else if (obfuscator === "holylua") {
        try {
            // Use Python obfuscation handler for HolyLua
            const tempInput = 'temp_holylua_input.txt';
            const tempOutput = 'temp_holylua_output.lua';
            
            fs.writeFileSync(tempInput, code);
            
            try {
                const result = execSync(`python -c "from obfuscation_handler import normalize_code; import sys; code = open('${tempInput}', 'r', encoding='utf-8', errors='ignore').read(); normalized = normalize_code(code); print(normalized)"`, { 
                    encoding: 'utf-8',
                    cwd: __dirname
                });
                
                // Clean up temp files
                try { fs.unlinkSync(tempInput); } catch (e) {}
                try { fs.unlinkSync(tempOutput); } catch (e) {}
                
                return result;
            } catch (pythonError) {
                console.error('Python normalization failed:', pythonError.message);
                // Clean up temp files
                try { fs.unlinkSync(tempInput); } catch (e) {}
                try { fs.unlinkSync(tempOutput); } catch (e) {}
                return code;
            }
        } catch (error) {
            console.error('HolyLua normalization failed:', error.message);
            return code;
        }
    }
    
    return code;
}

// Enhanced concurrent processor with obfuscation handling
class EnhancedConcurrentProcessor extends ConcurrentProcessor {
    constructor(maxWorkers = os.cpus().length) {
        super(maxWorkers);
    }

    async processScript(scriptPath, scriptContent = null) {
        // If no script content provided, read and process it
        if (!scriptContent) {
            try {
                scriptContent = fs.readFileSync(scriptPath, 'utf8');
            } catch (utf8Error) {
                // If UTF-8 fails, try reading as binary and convert to Latin-1
                const buffer = fs.readFileSync(scriptPath);
                scriptContent = buffer.toString('latin1');
                // Clean up any remaining invalid characters
                scriptContent = scriptContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            }
        }

        // Detect and normalize obfuscation
        const obfuscator = detectObfuscator(scriptContent);
        
        if (obfuscator !== "unknown") {
            console.error(`[DETECTION] Detected obfuscator: ${obfuscator}`);
            scriptContent = normalizeCode(scriptContent);
            console.error(`[NORMALIZATION] Applied normalization for ${obfuscator}`);
        }

        // Use the parent class method with the processed content
        return super.processScript(scriptPath, scriptContent);
    }
}

async function main() {
    const scriptPath = process.argv[2];
    const useConcurrent = process.argv.includes('--concurrent') || process.argv.includes('-c');
    const rawMode = process.argv.includes('raw');
    
    if (!scriptPath) {
        console.error('Usage: node lua_bridge_enhanced.js <script.lua> [--concurrent|-c] [raw]');
        console.error('  --concurrent, -c: Use concurrent processing for better performance');
        console.error('  raw: Process without obfuscation detection (for code blocks)');
        process.exit(1);
    }

    if (!fs.existsSync(scriptPath)) {
        console.error(`Error: File '${scriptPath}' not found`);
        process.exit(1);
    }

    try {
        let scriptContent;
        if (!rawMode) {
            try {
                scriptContent = fs.readFileSync(scriptPath, 'utf8');
            } catch (utf8Error) {
                // If UTF-8 fails, try reading as binary and convert to Latin-1
                const buffer = fs.readFileSync(scriptPath);
                scriptContent = buffer.toString('latin1');
                // Clean up any remaining invalid characters
                scriptContent = scriptContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            }
            
            // Detect and normalize obfuscation
            const obfuscator = detectObfuscator(scriptContent);
            
            if (obfuscator !== "unknown") {
                console.error(`[DETECTION] Detected obfuscator: ${obfuscator}`);
                scriptContent = normalizeCode(scriptContent);
                console.error(`[NORMALIZATION] Applied normalization for ${obfuscator}`);
            }
        }

        if (useConcurrent) {
            // Use concurrent processing
            const processor = new EnhancedConcurrentProcessor();
            
            try {
                // Initialize workers
                await processor.initializeWorkers();
                
                // Process the script
                const startTime = Date.now();
                const result = await processor.processScript(scriptPath, scriptContent);
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
        } else {
            // Use single-threaded processing
            const result = await processLuaFile(scriptPath, scriptContent);
            if (result) {
                process.stdout.write(result);
            } else {
                process.stdout.write("No output");
            }
        }
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { 
    EnhancedConcurrentProcessor,
    detectObfuscator,
    normalizeCode
};
