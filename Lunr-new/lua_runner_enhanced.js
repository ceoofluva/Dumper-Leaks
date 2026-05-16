const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fengari = require('fengari');
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;
const interop = require('fengari-interop');

// Performance optimizations
const ENABLE_CACHING = true;
const scriptCache = new Map();
const MAX_CACHE_SIZE = 100;

// Performance metrics
const performanceMetrics = {
    scriptsProcessed: 0,
    totalTime: 0,
    cacheHits: 0,
    cacheMisses: 0
};

function debugStack(L, label) {
    console.log(`=== DEBUG STACK (${label}) ===`);
    const top = lua.lua_gettop(L);
    for (let i = 1; i <= top; i++) {
        const type = lua.lua_type(L, i);
        let value = '';
        switch (type) {
            case lua.LUA_TSTRING:
                value = fengari.to_jsstring(lua.lua_tostring(L, i));
                break;
            case lua.LUA_TBOOLEAN:
                value = lua.lua_toboolean(L, i) ? 'true' : 'false';
                break;
            case lua.LUA_TNUMBER:
                value = lua.lua_tonumber(L, i).toString();
                break;
            case lua.LUA_TTABLE:
                value = '[table]';
                break;
            case lua.LUA_TFUNCTION:
                value = '[function]';
                break;
            default:
                value = `[type: ${type}]`;
        }
        console.log(`  [${i}] ${lua.lua_typename(L, type)}: ${value}`);
    }
}

/**
 * Process a Lua script using the enhanced environment logger
 * @param {string} scriptPath - Path to the Lua script file
 * @param {string} [scriptContent] - Optional pre-processed script content
 * @returns {Promise<string>} - The logged output.
 */
function fastFileRead(filePath) {
    try {
        // Try UTF-8 first (fastest path)
        return fs.readFileSync(filePath, 'utf8');
    } catch (utf8Error) {
        // Fallback: optimized binary processing
        const buffer = fs.readFileSync(filePath);
        let result = '';
        
        // Use Buffer methods for much faster processing
        for (let i = 0; i < buffer.length; i++) {
            const byte = buffer[i];
            if (byte >= 32 && byte <= 126) {
                result += String.fromCharCode(byte);
            } else if (byte === 10 || byte === 13) {
                result += byte === 10 ? '\n' : '\r';
            } else if (byte === 9) {
                result += '\t';
            } else if (byte >= 128) {
                // Skip extended ASCII for performance
                continue;
            }
        }
        return result;
    }
}

function processLuaFileOptimized(scriptPath, scriptContent = null) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        try {
            // Use provided content or read file
            if (!scriptContent) {
                scriptContent = fastFileRead(scriptPath);
            }

            // Generate cache key
            const cacheKey = require('crypto').createHash('md5').update(scriptContent).digest('hex');
            
            // Check cache first
            if (ENABLE_CACHING && scriptCache.has(cacheKey)) {
                performanceMetrics.cacheHits++;
                performanceMetrics.scriptsProcessed++;
                resolve(scriptCache.get(cacheKey));
                return;
            }
            
            performanceMetrics.cacheMisses++;

            // Strip UTF-8 BOM if present (can cause Lua parse errors like: unexpected symbol near '<\239>')
            if (scriptContent && scriptContent.charCodeAt(0) === 0xFEFF) {
                scriptContent = scriptContent.slice(1);
            }


            // Fast string processing - optimized regex
            const stringLiterals = [];
            scriptContent = scriptContent.replace(
                /(["'])(?:\\.|(?!\1)[^\\\r\n])*\1/g,
                (m) => {
                    stringLiterals.push(m);
                    return `__STR_${stringLiterals.length - 1}__`;
                }
            );

            // Optimized Luau fixes - single pass with combined regex
            scriptContent = scriptContent
                .replace(/(\b[_a-zA-Z]\w*)\s*\+=\s*([^;\n\r]+)/g, '$1 = $1 + ($2)')
                .replace(/(\b[_a-zA-Z]\w*)\s*-\=\s*([^;\n\r]+)/g, '$1 = $1 - ($2)')
                .replace(/(\b[_a-zA-Z]\w*)\s*\*=\s*([^;\n\r]+)/g, '$1 = $1 * ($2)')
                .replace(/(\b[_a-zA-Z]\w*)\s*\/\=\s*([^;\n\r]+)/g, '$1 = $1 / ($2)')
                .replace(/(\b[_a-zA-Z]\w*)\s*%\=\s*([^;\n\r]+)/g, '$1 = $1 % ($2)')
                .replace(/(\b[_a-zA-Z]\w*)\s*\^=\s*([^;\n\r]+)/g, '$1 = $1 ^ ($2)')
                .replace(/(\b[_a-zA-Z]\w*)\s*\.\.\=\s*([^;\n\r]+)/g, '$1 = $1 .. ($2)')
                .replace(/--!\w+/g, '');

            // ================= BACKTICK HANDLING (Luau Interpolation) =================
            scriptContent = scriptContent.replace(/`([\s\S]*?)`/g, (_, content) => {
                let parts = [];
                let lastPos = 0;
                // Match {expression} pattern
                const interpRegex = /\{([\s\S]*?)\}/g;
                let match;
                while ((match = interpRegex.exec(content)) !== null) {
                    // Text before the interpolation
                    if (match.index > lastPos) {
                        let text = content.substring(lastPos, match.index);
                        parts.push(`"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
                    }
                    // The expression itself
                    parts.push(`tostring(${match[1]})`);
                    lastPos = interpRegex.lastIndex;
                }
                // Trailing text
                if (lastPos < content.length) {
                    let text = content.substring(lastPos);
                    parts.push(`"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
                }

                if (parts.length === 0) return '""';
                return parts.join(" .. ");
            });

            // ================= STRING RESTORE =================
            scriptContent = scriptContent.replace(/__STR_(\d+)__/g, (_, i) => {
                return stringLiterals[Number(i)];
            });

            // DEBUG: Log the final script content AFTER transparency
            // console.log("=== FINAL SCRIPT CONTENT ===\n" + scriptContent + "\n============================");

            // Initialize Lua state
            const L = lauxlib.luaL_newstate();
            lualib.luaL_openlibs(L);
            interop.luaopen_js(L);

            // Initialize 'arg' global properly with table structure
            lua.lua_newtable(L);
            for (let i = 0; i < 5; i++) {
                lua.lua_pushstring(L, fengari.to_luastring(""));
                lua.lua_rawseti(L, -2, i);
            }
            lua.lua_setglobal(L, fengari.to_luastring("arg"));

            // Load lunr code (cached)
            const nigger = './lunr env log to copy.txt';
            let lunrCode;
            if (ENABLE_CACHING && scriptCache.has('lunr_code')) {
                lunrCode = scriptCache.get('lunr_code');
            } else {
                lunrCode = fastFileRead(nigger);
                if (ENABLE_CACHING) {
                    scriptCache.set('lunr_code', lunrCode);
                }
            }

            // Strip UTF-8 BOM from lunr code too (safety)
            if (lunrCode && lunrCode.charCodeAt(0) === 0xFEFF) {
                lunrCode = lunrCode.slice(1);
            }

            // Load lunr code
            if (lauxlib.luaL_dostring(L, fengari.to_luastring(lunrCode)) !== lua.LUA_OK) {
                const err = lua.lua_tostring(L, -1);
                let errorMsg;
                try {
                    errorMsg = fengari.to_jsstring(err);
                } catch (utf8Error) {
                    errorMsg = "Failed to load lunr (UTF-8 conversion error)";
                }
                console.error('Lunr load error:', errorMsg);
                reject(new Error(`Failed to load lunr: ${errorMsg}`));
                return;
            }

            // Get q.dump_string method
            lua.lua_getfield(L, -1, fengari.to_luastring("dump_string"));
            if (!lua.lua_isfunction(L, -1)) {
                reject(new Error("q.dump_string is not a function"));
                return;
            }

            // Helper to push string
            if (!scriptContent || scriptContent.trim().length === 0) {
                resolve("[Empty or unreadable script content]");
                return;
            }
            lua.lua_pushstring(L, fengari.to_luastring(scriptContent));

            // Call dump_string(scriptContent). 1 argument, 2 results (success, output/error)
            const callStatus = lua.lua_pcall(L, 1, 2, 0);

            if (callStatus !== lua.LUA_OK) {
                const error = lua.lua_tostring(L, -1);
                lua.lua_close(L);

                let errorStr;
                try {
                    errorStr = fengari.to_jsstring(error);
                } catch (utf8Error) {
                    errorStr = "Lua execution failed (UTF-8 conversion error)";
                }

                // Check if this is a crash recovery output
                if (errorStr.includes("error('lunr: The bot was unable to process the file fully")) {
                    // Extract the actual partial output after the crash recovery message
                    const lines = errorStr.split('\n');
                    const partialOutput = lines.slice(1).join('\n').trim();
                    resolve(partialOutput || errorStr);
                    return;
                }

                reject(new Error(`Lua execution failed: ${errorStr}`));
                return;
            }

            // Get the results: success (boolean) and output/error (string)
            const success = lua.lua_toboolean(L, -2);
            const result = lua.lua_tostring(L, -1);

            if (success) {
                let resultStr;
                try {
                    resultStr = fengari.to_jsstring(result);
                } catch (utf8Error) {
                    // Try to get raw bytes and convert them safely
                    try {
                        // Use a different approach - get the Lua string as bytes
                        const luaStr = lua.lua_tostring(L, -1);
                        if (luaStr) {
                            // Convert using a safer method
                            resultStr = '';
                            const len = lua.lua_strlen(L, -1);
                            for (let i = 0; i < len; i++) {
                                const charCode = lua.lua_string_at(L, -1, i);
                                if (charCode >= 32 && charCode <= 126) {
                                    // Printable ASCII
                                    resultStr += String.fromCharCode(charCode);
                                } else if (charCode === 10) {
                                    // Newline
                                    resultStr += '\n';
                                } else if (charCode === 13) {
                                    // Carriage return
                                    resultStr += '\r';
                                } else if (charCode === 9) {
                                    // Tab
                                    resultStr += '\t';
                                } else if (charCode >= 128 && charCode <= 255) {
                                    // Extended ASCII - convert to safe Unicode
                                    const extendedChars = {
                                        128: '€', 129: '?', 130: '\u201A', 131: '\u0192',
                                        132: '\u201E', 133: '\u2026', 134: '\u2020', 135: '\u2021',
                                        136: '\u02C6', 137: '\u2030', 138: '\u0160', 139: '\u2039',
                                        140: '\u0152', 141: '?', 142: '\u017D', 143: '?',
                                        144: '?', 145: '\u2018', 146: '\u2019', 147: '\u201C',
                                        148: '\u201D', 149: '\u2022', 150: '\u2013', 151: '\u2014',
                                        152: '\u02DC', 153: '\u2122', 154: '\u0161', 155: '\u203A',
                                        156: '\u0153', 157: '?', 158: '\u017E', 159: '\u0178'
                                    };
                                    resultStr += extendedChars[charCode] || '?';
                                } else {
                                    // Replace other control chars with a placeholder
                                    resultStr += '[?]';
                                }
                            }
                        } else {
                            resultStr = "";
                        }
                    } catch (bufferError) {
                        // Last resort - try to get any readable content
                        try {
                            const luaStr = lua.lua_tostring(L, -1);
                            resultStr = luaStr ? "" : "";
                        } catch (finalError) {
                            resultStr = "";
                        }
                    }
                }
                // Cache the result
                if (ENABLE_CACHING && scriptCache.size < MAX_CACHE_SIZE) {
                    scriptCache.set(cacheKey, resultStr || "");
                }
                
                // Update metrics
                performanceMetrics.scriptsProcessed++;
                performanceMetrics.totalTime += Date.now() - startTime;
                
                resolve(resultStr || "");
            } else {
                let errorStr;
                try {
                    errorStr = fengari.to_jsstring(result);
                } catch (utf8Error) {
                    // Try to get raw bytes for error message too
                    try {
                        const luaStr = lua.lua_tostring(L, -1);
                        if (luaStr) {
                            errorStr = '';
                            const len = lua.lua_strlen(L, -1);
                            for (let i = 0; i < len; i++) {
                                const charCode = lua.lua_string_at(L, -1, i);
                                if (charCode >= 32 && charCode <= 126) {
                                    errorStr += String.fromCharCode(charCode);
                                } else if (charCode === 10) {
                                    errorStr += '\n';
                                } else if (charCode === 13) {
                                    errorStr += '\r';
                                } else if (charCode === 9) {
                                    errorStr += '\t';
                                } else if (charCode >= 128 && charCode <= 255) {
                                    // Extended ASCII - convert to safe Unicode
                                    const extendedChars = {
                                        128: '€', 129: '?', 130: '\u201A', 131: '\u0192',
                                        132: '\u201E', 133: '\u2026', 134: '\u2020', 135: '\u2021',
                                        136: '\u02C6', 137: '\u2030', 138: '\u0160', 139: '\u2039',
                                        140: '\u0152', 141: '?', 142: '\u017D', 143: '?',
                                        144: '?', 145: '\u2018', 146: '\u2019', 147: '\u201C',
                                        148: '\u201D', 149: '\u2022', 150: '\u2013', 151: '\u2014',
                                        152: '\u02DC', 153: '\u2122', 154: '\u0161', 155: '\u203A',
                                        156: '\u0153', 157: '?', 158: '\u017E', 159: '\u0178'
                                    };
                                    errorStr += extendedChars[charCode] || '?';
                                } else {
                                    errorStr += '[?]';
                                }
                            }
                        } else {
                            errorStr = "Script execution failed";
                        }
                    } catch (bufferError) {
                        errorStr = "Script execution failed (UTF-8 conversion error)";
                    }
                }
                // Check if this is crash recovery output
                if (errorStr.includes("error('lunr: The bot was unable to process the file fully")) {
                    // Extract the actual partial output after the crash recovery message
                    const lines = errorStr.split('\n');
                    const partialOutput = lines.slice(1).join('\n').trim();
                    resolve(partialOutput || errorStr);
                } else {
                    reject(new Error(`Script execution failed: ${errorStr}`));
                }
            }

            lua.lua_close(L);

        } catch (error) {
            reject(error);
        }
    });
}

// Main execution
if (require.main === module) {
    const scriptPath = process.argv[2];
    if (!scriptPath) {
        console.error('Usage: node lua_runner_enhanced.js <script.lua>');
        process.exit(1);
    }

    if (!fs.existsSync(scriptPath)) {
        console.error(`Error: File '${scriptPath}' not found`);
        process.exit(1);
    }

    processLuaFileOptimized(scriptPath)
        .then(output => {
            console.log(output);
        })
        .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
        });
}

module.exports = { processLuaFile: processLuaFileOptimized, performanceMetrics };
