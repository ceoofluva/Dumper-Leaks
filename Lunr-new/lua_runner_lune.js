// lua_runner_enhanced.js  (renamed or replaced with something like lune_runner.js)

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Run a Luau/Lua script using the Lune runtime
 * @param {string} scriptPath - Path to the .lua / .luau file
 * @returns {Promise<string>} The stdout of the script (what it printed)
 */
function processLuaFile(scriptPath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(scriptPath)) {
            return reject(new Error(`File not found: ${scriptPath}`));
        }

        // You can pass arguments to the script if needed: ["run", scriptPath, "arg1", "arg2"]
        const child = spawn("lune", ["run", scriptPath], {
            stdio: ["ignore", "pipe", "pipe"],   // we only care about stdout + stderr
            shell: false,
            cwd: process.cwd(),                  // or path.dirname(scriptPath)
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve(stdout.trimEnd());   // or just stdout if you want newlines preserved
            } else {
                const errMsg = stderr.trim() || "Lune exited with non-zero code";
                reject(new Error(`Lune failed (code ${code}):\n${errMsg}`));
            }
        });

        child.on("error", reject);
    });
}

module.exports = { processLuaFile };