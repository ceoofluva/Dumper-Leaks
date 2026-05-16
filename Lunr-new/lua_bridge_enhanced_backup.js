const { processLuaFile } = require('./lua_runner_enhanced');
const fs = require('fs');
const { execSync } = require('child_process');

function detectObfuscator(code) {
    if (!code) return "unknown";
    
    // Phantoraph V1
    if (code.includes('-- // Phantoraph V1') && code.includes('Obfuscated by')) {
        return "phantoraph_v1";
    }
    
    // WeAreDevs
    if (code.includes("return(function())") || code.includes("WeAreDevs")) {
        return "wearedevs";
    }
    
    // LuaObfuscator.com
    if (code.includes("LuaObfuscator.com") || code.includes("local _=")) {
        return "luaobfuscator_com";
    }
    
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

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node lua_bridge_enhanced.js <file_path>');
        process.exit(1);
    }

    try {
        let scriptContent;
        try {
            scriptContent = fs.readFileSync(filePath, 'utf8');
        } catch (utf8Error) {
            // If UTF-8 fails, try reading as binary and convert to Latin-1
            const buffer = fs.readFileSync(filePath);
            scriptContent = buffer.toString('latin1');
            // Clean up any remaining invalid characters
            scriptContent = scriptContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        }
        
        // Detect and normalize obfuscation
        const obfuscator = detectObfuscator(scriptContent);
        
        if (obfuscator !== "unknown") {
            scriptContent = normalizeCode(scriptContent);
        }
        
        const result = await processLuaFile(filePath, scriptContent);
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
