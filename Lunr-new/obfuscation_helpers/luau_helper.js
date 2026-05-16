// LuaU Enhancement Helper
// Helps capture and enhance LuaU-specific features

const luauPatterns = {
    // Roblox-specific patterns
    gameService: /game:GetService\("([^"]+)"\)/g,
    instanceNew: /Instance\.new\("([^"]+)"\)/g,
    waitForChild: /:WaitForChild\("([^"]+)"\)/g,
    findFirstChild: /:FindFirstChild\("([^"]+)"\)/g,
    
    // Event patterns
    eventConnect: /\.Connect\s*\(/g,
    eventWait: /\.wait\s*\(/g,
    remoteEvent: /:FireServer\s*\(/g,
    remoteFunction: /:InvokeServer\s*\(/g,
    
    // UI patterns
    udim2: /UDim2\.new\([^)]+\)/g,
    color3: /Color3\.new\([^)]+\)/g,
    fromRGB: /Color3\.fromRGB\([^)]+\)/g,
    
    // Player patterns
    localPlayer: /game\.Players\.LocalPlayer/g,
    characterAdded: /CharacterAdded/g,
    humanoid: /Humanoid/g
};

function enhanceLuaU(scriptContent) {
    let enhanced = scriptContent;
    
    // Track Roblox API calls
    enhanced = enhanced.replace(luauPatterns.gameService, 
        (match, serviceName) => `print("GAME_SERVICE: ${serviceName}")\n${match}`);
    
    enhanced = enhanced.replace(luauPatterns.instanceNew, 
        (match, className) => `print("INSTANCE_NEW: ${className}")\n${match}`);
    
    enhanced = enhanced.replace(luauPatterns.eventConnect, 
        'print("EVENT_CONNECT")\n.Connect(');
    
    enhanced = enhanced.replace(luauPatterns.remoteEvent, 
        'print("REMOTE_EVENT")\n:FireServer(');
    
    enhanced = enhanced.replace(luauPatterns.remoteFunction, 
        'print("REMOTE_FUNCTION")\n:InvokeServer(');
    
    // Track UI creation
    enhanced = enhanced.replace(luauPatterns.udim2, 
        (match) => `print("UDIM2: ${match}")\n${match}`);
    
    enhanced = enhanced.replace(luauPatterns.color3, 
        (match) => `print("COLOR3: ${match}")\n${match}`);
    
    return enhanced;
}

module.exports = { enhanceLuaU, luauPatterns };
