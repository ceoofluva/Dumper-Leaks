// Phantoraph Helper Script
// Enhances deobfuscation for Phantoraph obfuscator

const phantoraphPatterns = {
    // Phantoraph-specific patterns
    returnFunction: /return\s*\(function\(\)/g,
    nestedReturns: /return\s*\(.*\)\(.*\)/g,
    loaderPattern: /return\s+(\w+)\s*\(\s*(\w+)\s*\)\s*\(/g,
    
    // Common Phantoraph obfuscation techniques
    hexEscapes: /\x[0-9a-fA-F]{2}/g,
    unicodeEscapes: /\u[0-9a-fA-F]{4}/g,
    decimalEscapes: /\[0-9]{1,3}/g,
    
    // Function wrapping patterns
    functionWrapper: /\(function\(\)\s*([^)]+)\)\(\)/g,
    immediateExecution: /\(function\(\)\{[^}]*\}\)\(\)/g
};

function enhancePhantoraph(scriptContent) {
    let enhanced = scriptContent;
    
    // Track return patterns
    enhanced = enhanced.replace(phantoraphPatterns.returnFunction, 
        'print("PHANTORAPH_RETURN_FUNCTION detected")\nreturn (function()');
    
    // Track loader patterns
    enhanced = enhanced.replace(phantoraphPatterns.loaderPattern, 
        (match, loader, code) => {
            return `print("LOADER_PATTERN: ${loader}(${code})")\n${match}`;
        });
    
    // Decode string literals
    enhanced = enhanced.replace(phantoraphPatterns.hexEscapes, 
        (match) => {
            const decoded = String.fromCharCode(parseInt(match.slice(2), 16));
            return `"${decoded}"`;
        });
    
    enhanced = enhanced.replace(phantoraphPatterns.unicodeEscapes, 
        (match) => {
            const decoded = String.fromCharCode(parseInt(match.slice(2), 16));
            return `"${decoded}"`;
        });
    
    enhanced = enhanced.replace(phantoraphPatterns.decimalEscapes, 
        (match) => {
            const decoded = String.fromCharCode(parseInt(match.slice(1)));
            return `"${decoded}"`;
        });
    
    return enhanced;
}

module.exports = { enhancePhantoraph, phantoraphPatterns };
