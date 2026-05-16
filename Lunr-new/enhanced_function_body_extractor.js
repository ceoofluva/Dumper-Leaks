const fs = require('fs');
const { processLuaFile } = require('./lua_runner_enhanced');

// Enhanced function body extraction patterns
const FUNCTION_BODY_PATTERNS = [
    // task.spawn(function() ... end)
    {
        pattern: /task\.spawn\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'task.spawn',
        extract: (match) => match[1]
    },
    // task.spawn(function() ... end) - multiline
    {
        pattern: /task\.spawn\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}/gs,
        type: 'task.spawn_multiline',
        extract: (match) => match[1]
    },
    // pcall(function() ... end)
    {
        pattern: /pcall\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'pcall',
        extract: (match) => match[1]
    },
    // xpcall(function() ... end, errorHandler)
    {
        pattern: /xpcall\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'xpcall',
        extract: (match) => ({ main: match[1], handler: match[2] })
    },
    // coroutine.create(function() ... end)
    {
        pattern: /coroutine\.create\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'coroutine.create',
        extract: (match) => match[1]
    },
    // coroutine.wrap(function() ... end)
    {
        pattern: /coroutine\.wrap\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'coroutine.wrap',
        extract: (match) => match[1]
    },
    // spawn(function() ... end)
    {
        pattern: /spawn\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'spawn',
        extract: (match) => match[1]
    },
    // delay(function() ... end)
    {
        pattern: /delay\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'delay',
        extract: (match) => match[1]
    },
    // Event:Connect(function() ... end)
    {
        pattern: /:\s*Connect\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'event.Connect',
        extract: (match) => match[1]
    },
    // hookfunction(original, function() ... end)
    {
        pattern: /hookfunction\s*\([^,]*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}\s*\)/g,
        type: 'hookfunction',
        extract: (match) => match[1]
    },
    // getfenv(func) - function body extraction
    {
        pattern: /getfenv\s*\([^)]*\)\s*\{([\s\S]*?)\s*\}/g,
        type: 'getfenv',
        extract: (match) => match[1]
    },
    // loadstring("...") - literal string content
    {
        pattern: /loadstring\s*\(\s*["']([^"']*)["']\s*\)/g,
        type: 'loadstring',
        extract: (match) => match[1]
    },
    // require("module") - module tracking
    {
        pattern: /require\s*\(\s*["']([^"']*)["']\s*\)/g,
        type: 'require',
        extract: (match) => match[1]
    }
];

function extractFunctionBodies(luaCode) {
    const extractedFunctions = [];
    
    FUNCTION_BODY_PATTERNS.forEach(({ pattern, type, extract }) => {
        let match;
        while ((match = pattern.exec(luaCode)) !== null) {
            const body = extract(match);
            extractedFunctions.push({
                type,
                body: body.trim(),
                fullMatch: match[0],
                lineNumber: getLineNumber(luaCode, match.index)
            });
        }
        // Reset regex lastIndex
        pattern.lastIndex = 0;
    });
    
    return extractedFunctions;
}

function getLineNumber(text, index) {
    const before = text.substring(0, index);
    return (before.match(/\n/g) || []).length + 1;
}

function analyzeFunctionCoverage(luaCode, extractedFunctions) {
    const analysis = {
        totalFunctionsFound: 0,
        functionsWithBodies: 0,
        functionTypes: {},
        missingBodies: [],
        coverage: 0
    };
    
    // Count all function calls in the code
    const functionCallPattern = /\b(task\.spawn|pcall|xpcall|coroutine\.create|coroutine\.wrap|spawn|delay|hookfunction|getfenv|loadstring|require)\b/g;
    const functionCalls = luaCode.match(functionCallPattern) || [];
    analysis.totalFunctionsFound = functionCalls.length;
    
    // Analyze extracted functions
    extractedFunctions.forEach(func => {
        analysis.functionTypes[func.type] = (analysis.functionTypes[func.type] || 0) + 1;
        
        if (func.body && func.body.length > 0) {
            analysis.functionsWithBodies++;
        } else {
            analysis.missingBodies.push({
                type: func.type,
                lineNumber: func.lineNumber,
                fullMatch: func.fullMatch
            });
        }
    });
    
    analysis.coverage = analysis.totalFunctionsFound > 0 
        ? (analysis.functionsWithBodies / analysis.totalFunctionsFound) * 100 
        : 0;
    
    return analysis;
}

async function testFunctionBodyExtraction(testFile) {
    console.log(`=== Testing Function Body Extraction: ${testFile} ===`);
    
    try {
        const luaCode = fs.readFileSync(testFile, 'utf8');
        const extractedFunctions = extractFunctionBodies(luaCode);
        const analysis = analyzeFunctionCoverage(luaCode, extractedFunctions);
        
        console.log('\n📊 EXTRACTION ANALYSIS:');
        console.log(`Total function calls found: ${analysis.totalFunctionsFound}`);
        console.log(`Functions with bodies extracted: ${analysis.functionsWithBodies}`);
        console.log(`Coverage: ${analysis.coverage.toFixed(1)}%`);
        
        console.log('\n📋 FUNCTION TYPES FOUND:');
        Object.entries(analysis.functionTypes).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        
        if (analysis.missingBodies.length > 0) {
            console.log('\n⚠️  MISSING FUNCTION BODIES:');
            analysis.missingBodies.forEach(missing => {
                console.log(`  Line ${missing.lineNumber}: ${missing.type}`);
                console.log(`    Match: ${missing.fullMatch.substring(0, 100)}...`);
            });
        }
        
        console.log('\n📝 EXTRACTED FUNCTION BODIES:');
        extractedFunctions.forEach((func, index) => {
            if (func.body && func.body.length > 0) {
                console.log(`\n${index + 1}. ${func.type} (Line ${func.lineNumber}):`);
                console.log('   Body:', func.body.substring(0, 200) + (func.body.length > 200 ? '...' : ''));
            }
        });
        
        return analysis;
        
    } catch (error) {
        console.error(`Error processing ${testFile}:`, error.message);
        return null;
    }
}

// Main execution
if (require.main === module) {
    const testFile = process.argv[2];
    if (!testFile) {
        console.error('Usage: node enhanced_function_body_extractor.js <test_file.lua>');
        process.exit(1);
    }
    
    if (!fs.existsSync(testFile)) {
        console.error(`Error: File '${testFile}' not found`);
        process.exit(1);
    }
    
    testFunctionBodyExtraction(testFile)
        .then(analysis => {
            if (analysis) {
                console.log('\n✅ Function body extraction analysis complete!');
                console.log(`Overall coverage: ${analysis.coverage.toFixed(1)}%`);
            }
        })
        .catch(error => {
            console.error('Analysis failed:', error);
            process.exit(1);
        });
}

module.exports = { 
    extractFunctionBodies, 
    analyzeFunctionCoverage, 
    testFunctionBodyExtraction 
};
