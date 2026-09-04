local m = {}
m.version = "2.0.0"

-- RenoDX applies its settings immediately while the game is running.
-- STRYKER deliberately leaves keyboard input and ReShade.ini untouched here:
-- the desktop engine configures F10 and the visual theme before launch.
function m.init(ctx)
    log("STRYKER DLSS Control Center 2.0 ready - press F10 for live RenoDX settings")
end

return m
