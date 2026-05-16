local ran = false
local co = task.spawn(function() ran = true end)
if type(co) == "thread" and ran then
    print("BOTH_PASS")
else
    print("co_type=" .. type(co) .. ",ran=" .. tostring(ran))
end
