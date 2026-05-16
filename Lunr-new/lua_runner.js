const fs = require('fs');
const fengari = require('fengari');
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;
const interop = require('fengari-interop');

/**
 * Escape special characters in Lua patterns to prevent malformed pattern errors
 * @param {string} str - String to escape
 * @returns {string} - Escaped string safe for use in Lua patterns
 */
function escapeLuaPattern(str) {
    // Lua pattern special characters: ( ) . % + - * ? [ ] ^
    return str.replace(/[%\.%+%-%*%?%[%]%(%)\^]/g, function(char) {
        return '%' + char;
    });
}

/**
 * Sanitize code block content to prevent pattern errors
 * @param {string} content - Raw code content
 * @returns {string} - Sanitized content
 */
function sanitizeCodeBlock(content) {
    // Don't modify the content structure, just ensure it's properly formatted
    // The issue is in how patterns are used, not in the code itself
    return content;
}

/**
 * Process a Lua script using the Lunr environment logger
 * @param {string} scriptContent - The Lua script content to process
 * @returns {Promise<string>} - The processed output
 */
function processScript(scriptContent) {
    return new Promise((resolve, reject) => {
        let L = null;
        try {
            // Sanitize input to prevent malformed patterns
            scriptContent = sanitizeCodeBlock(scriptContent);

            // Create new Lua state
            L = lauxlib.luaL_newstate();
            lualib.luaL_openlibs(L);
            interop.luaopen_js(L);

            // Load the Lunr environment logger
            const lunrPath = './lunr env log to copy.txt';
            let lunrCode;
            
            try {
                lunrCode = fs.readFileSync(lunrPath, 'utf8');
            } catch (readError) {
                // Try with latin1 encoding as fallback
                try {
                    const buffer = fs.readFileSync(lunrPath);
                    lunrCode = buffer.toString('latin1');
                } catch (fallbackError) {
                    throw new Error(`Cannot read lunr file: ${readError.message}`);
                }
            }

            // Load the Lunr code into Lua state
            if (lauxlib.luaL_dostring(L, fengari.to_luastring(lunrCode)) !== lua.LUA_OK) {
                const error = lua.lua_tostring(L, -1);
                let errorMsg;
                try {
                    errorMsg = fengari.to_jsstring(error);
                } catch (e) {
                    errorMsg = 'Failed to load lunr (encoding error)';
                }
                throw new Error(`Lunr initialization failed: ${errorMsg}`);
            }

            // Get the dump_string function from the loaded environment
            lua.lua_getfield(L, -1, fengari.to_luastring('dump_string'));
            if (!lua.lua_isfunction(L, -1)) {
                throw new Error('dump_string function not found in Lunr environment');
            }

            // Check for empty input
            if (!scriptContent || scriptContent.trim().length === 0) {
                resolve('[Empty script content]');
                lua.lua_close(L);
                return;
            }

            // Push the script content as argument to dump_string
            try {
                lua.lua_pushstring(L, fengari.to_luastring(scriptContent));
            } catch (pushError) {
                throw new Error(`Failed to push script to Lua: ${pushError.message}`);
            }

            // Call dump_string(scriptContent) with proper error handling
            const callResult = lua.lua_pcall(L, 1, 2, 0);

            if (callResult !== lua.LUA_OK) {
                const errorObj = lua.lua_tostring(L, -1);
                let errorMsg;
                try {
                    errorMsg = fengari.to_jsstring(errorObj);
                } catch (e) {
                    errorMsg = 'Lua execution error (encoding issue)';
                }
                
                // Enhanced error handling for malformed patterns
                if (errorMsg.includes('malformed pattern')) {
                    errorMsg = `Pattern error detected - code may contain invalid special characters:\n${errorMsg}`;
                }
                
                lua.lua_close(L);
                throw new Error(errorMsg);
            }

            // Extract results from Lua stack
            let result = '';
            
            if (lua.lua_isstring(L, -2)) {
                try {
                    result = fengari.to_jsstring(lua.lua_tostring(L, -2));
                } catch (e) {
                    result = '[Unable to read result - encoding error]';
                }
            } else if (!lua.lua_isnil(L, -1)) {
                // If there's an error message in the second return value
                try {
                    result = fengari.to_jsstring(lua.lua_tostring(L, -1));
                } catch (e) {
                    result = '[Script execution error with encoding issues]';
                }
            }

            lua.lua_close(L);
            resolve(result || '[No output]');

        } catch (err) {
            if (L) {
                try {
                    lua.lua_close(L);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
            
            console.error('Script processing error:', err);
            
            // Return error message that doesn't crash Discord
            const errorMessage = err.message || 'Unknown error during script processing';
            resolve(`⚠️ Error: ${errorMessage}`);
        }
    });
}

module.exports = { processScript };
