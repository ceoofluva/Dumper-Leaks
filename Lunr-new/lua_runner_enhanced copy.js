const fs = require('fs');
const fengari = require('fengari');
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;
const interop = require('fengari-interop');

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
 * @returns {Promise<string>} - The logged output.
 */
function processLuaFile(scriptPath) {
    return new Promise((resolve, reject) => {
        try {
            // Read the script file
            let scriptContent = fs.readFileSync(scriptPath, 'utf8');
            
            // Preprocess Luau syntax to standard Lua
            scriptContent = scriptContent
                // Convert compound assignment operators to standard Lua
                .replace(/(\w+)\s*\+=\s*(.+)/g, '$1 = $1 + $2')
                .replace(/(\w+)\s*-=\s*(.+)/g, '$1 = $1 * $2')
                .replace(/(\w+)\s*\/=\s*(.+)/g, '$1 = $1 / $2')
            
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

            // Load the enhanced lunr env log script
            const lunrPath = './lunr env log to copy.txt';
            const lunrCode = fs.readFileSync(lunrPath, 'utf8');

            // Load lunr code
            if (lauxlib.luaL_dostring(L, fengari.to_luastring(lunrCode)) !== lua.LUA_OK) {
                const err = lua.lua_tostring(L, -1);
                console.error('Lunr load error:', fengari.to_jsstring(err));
                reject(new Error(`Failed to load lunr: ${fengari.to_jsstring(err)}`));
                return;
            }

            // Get q.dump_string method
            lua.lua_getfield(L, -1, fengari.to_luastring("dump_string"));
            if (!lua.lua_isfunction(L, -1)) {
                reject(new Error("q.dump_string is not a function"));
                return;
            }

            // Helper to push string
            lua.lua_pushstring(L, fengari.to_luastring(scriptContent));

            // Call dump_string(scriptContent). 1 argument, 2 results (success, output/error)
            const callStatus = lua.lua_pcall(L, 1, 2, 0);

            if (callStatus !== lua.LUA_OK) {
                const error = lua.lua_tostring(L, -1);
                lua.lua_close(L);
                
                // Check if this is a crash recovery output
                const errorStr = fengari.to_jsstring(error);
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
                resolve(fengari.to_jsstring(result) || "");
            } else {
                const errorStr = fengari.to_jsstring(result);
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
        console.error('Usage: node lua_bridge_enhanced.js <script.lua>');
        process.exit(1);
    }

    if (!fs.existsSync(scriptPath)) {
        console.error(`Error: File '${scriptPath}' not found`);
        process.exit(1);
    }

    processLuaFile(scriptPath)
        .then(output => {
            console.log(output);
        })
        .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
        });
}

module.exports = { processLuaFile };
