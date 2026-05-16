// LuaObfuscator Helper Script
// Enhances deobfuscation for LuaObfuscator.com scripts

const luaobfuscatorPatterns = {
    // Common LuaObfuscator patterns
    stringChar: /local\s+(\w+)\s*=\s*string\.char/g,
    stringByte: /local\s+(\w+)\s*=\s*string\.byte/g,
    stringSub: /local\s+(\w+)\s*=\s*string\.sub/g,
    bitXor: /local\s+(\w+)\s*=\s*bit32\.bxor\s*\|\|\s*bit/g,
    tableConcat: /local\s+(\w+)\s*=\s*table\.concat/g,
    tableInsert: /local\s+(\w+)\s*=\s*table\.insert/g,
    
    // Function pattern detection
    obfuscatedFunction: /local\s+function\s+(\w+)\([^)]*\)/g,
    nestedCalls: /(\w+)\([^)]*\([^)]*\)/g,
    
    // String decryption patterns
    stringDecryption: /(\w+)\(\s*[""][^""]*[""]\s*,\s*[""][^""]*[""]\s*\)/g
};

function enhanceLuaObfuscator(scriptContent) {
    let enhanced = scriptContent;
    
    // Add debug prints for obfuscated function calls
    enhanced = enhanced.replace(luaobfuscatorPatterns.stringDecryption, 
        (match) => `print("DECRYPTING: ${match}")\n${match}`);
    
    // Track variable assignments
    enhanced = enhanced.replace(/local\s+(\w+)\s*=/g, 
        (match, varName) => `print("VARIABLE: ${varName}")\n${match}`);
    
    // Add function call tracking
    enhanced = enhanced.replace(/(\w+)\s*\(/g, 
        (match, funcName) => `print("CALL: ${funcName}")\n${match}(`);
    
    return enhanced;
}

module.exports = { enhanceLuaObfuscator, luaobfuscatorPatterns };
