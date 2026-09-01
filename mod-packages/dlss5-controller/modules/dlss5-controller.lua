local m = {}
m.version = "1.2.0"

local UP_KEY = 0x26
local DOWN_KEY = 0x28
local LEFT_KEY = 0x25
local RIGHT_KEY = 0x27
local ENTER_KEY = 0x0d

local quality_names = {
    [0] = "Jeu / automatique",
    [1] = "Performance",
    [2] = "Equilibre",
    [3] = "Qualite",
    [4] = "Ultra Performance",
    [5] = "Ultra Qualite",
    [6] = "DLAA",
}

local selected = 1
local config_path = nil
local settings = {
    enabled = true,
    quality = 0,
    auto_exposure = false,
}
local last_message = "PRET - choisissez un reglage"

local function trim(value)
    return (value:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function read_lines(filename)
    local file = io.open(filename, "rt")
    if not file then return nil end
    local lines = {}
    for line in file:lines() do
        lines[#lines + 1] = line
    end
    file:close()
    return lines
end

local function read_ini_value(lines, wanted_section, wanted_key)
    local in_section = false
    for _, line in ipairs(lines or {}) do
        local section = line:match("^%s*%[([^%]]+)%]%s*$")
        if section then
            in_section = trim(section):lower() == wanted_section:lower()
        elseif in_section then
            local key, value = line:match("^%s*([^=;#]-)%s*=%s*(.-)%s*$")
            if key and trim(key):lower() == wanted_key:lower() then
                return trim(value)
            end
        end
    end
    return nil
end

local function append_missing(out, written, ordered_values)
    for _, item in ipairs(ordered_values) do
        if not written[item.key:lower()] then
            out[#out + 1] = item.key .. "=" .. item.value
            written[item.key:lower()] = true
        end
    end
end

local function update_section(lines, wanted_section, ordered_values)
    local out = {}
    local written = {}
    local in_section = false
    local section_found = false

    for _, line in ipairs(lines) do
        local section = line:match("^%s*%[([^%]]+)%]%s*$")
        if section then
            if in_section then append_missing(out, written, ordered_values) end
            in_section = trim(section):lower() == wanted_section:lower()
            if in_section then section_found = true end
        end

        local replacement = nil
        if in_section and not section then
            local key = line:match("^%s*([^=;#]-)%s*=")
            if key then
                local normalized = trim(key):lower()
                for _, item in ipairs(ordered_values) do
                    if item.key:lower() == normalized then
                        replacement = item.key .. "=" .. item.value
                        written[normalized] = true
                        break
                    end
                end
            end
        end
        out[#out + 1] = replacement or line
    end

    if in_section then append_missing(out, written, ordered_values) end
    if not section_found then
        if #out > 0 and out[#out] ~= "" then out[#out + 1] = "" end
        out[#out + 1] = "[" .. wanted_section .. "]"
        append_missing(out, written, ordered_values)
    end
    return out
end

local function copy_file(source, destination)
    local input = io.open(source, "rb")
    if not input then return false end
    local data = input:read("*all")
    input:close()
    local output = io.open(destination, "wb")
    if not output then return false end
    output:write(data)
    output:close()
    return true
end

local function load_settings()
    local lines = read_lines(config_path)
    if not lines then
        last_message = "ReShade.ini introuvable"
        return false
    end
    settings.enabled = read_ini_value(lines, "RENODX-DLSS", "DirectNeuralRenderingEnabled") ~= "0"
    local quality = tonumber(read_ini_value(lines, "RENODX-DLSS", "DLSSQualityMode") or "0") or 0
    settings.quality = quality_names[quality] and quality or 0
    settings.auto_exposure = read_ini_value(lines, "RENODX-DLSS", "DLSSAutoExposure") == "1"
    last_message = "CONFIGURATION CHARGEE"
    return true
end

local function save_settings()
    local lines = read_lines(config_path)
    if not lines then
        last_message = "Impossible: ReShade.ini introuvable"
        return false
    end
    copy_file(config_path, config_path .. ".sider-dlss.bak")
    lines = update_section(lines, "RENODX-DLSS", {
        { key = "DirectNeuralRenderingEnabled", value = settings.enabled and "1" or "0" },
        { key = "DirectNeuralRenderingForceNgxCore", value = "1" },
        { key = "DirectNeuralRenderingHookPoint", value = "2" },
        { key = "DirectNeuralRenderingHookPointOrder", value = "2" },
        { key = "DLSSAutoExposure", value = settings.auto_exposure and "1" or "0" },
        { key = "DLSSPath", value = "nvngx_dlss.dll" },
        { key = "DLSSQualityMode", value = tostring(settings.quality) },
        { key = "StreamlinePath", value = "sl.interposer.dll" },
    })
    local output = io.open(config_path, "wt")
    if not output then
        last_message = "Impossible d'ecrire ReShade.ini"
        return false
    end
    output:write(table.concat(lines, "\n"), "\n")
    output:close()
    last_message = "ENREGISTRE - redemarrage du jeu requis"
    log(string.format("STRYKER DLSS: enabled=%s quality=%d auto_exposure=%s", tostring(settings.enabled), settings.quality, tostring(settings.auto_exposure)))
    return true
end

local function setting_text(index)
    if index == 1 then return string.format("%-26s [%s]", "Neural Rendering", settings.enabled and "ACTIVE" or "DESACTIVE") end
    if index == 2 then return string.format("%-26s [%s]", "Mode de qualite", quality_names[settings.quality]) end
    return string.format("%-26s [%s]", "Exposition automatique", settings.auto_exposure and "ACTIVE" or "DESACTIVE")
end

function m.overlay_on(ctx)
    local lines = {}
    for index = 1, 3 do
        local marker = index == selected and ">  " or "   "
        lines[#lines + 1] = marker .. setting_text(index)
    end
    return string.format([[STRYKER - DLSS 5 UNIVERSAL RTX        v%s
==================================================

Fleches HAUT / BAS     choisir un reglage
Fleches GAUCHE / DROITE modifier et enregistrer
ENTREE                 recharger ReShade.ini
F10                    fermer ce panneau

%s

--------------------------------------------------
%s
Les changements DLSS s'appliquent au prochain lancement.]], m.version, table.concat(lines, "\n\n"), last_message)
end

function m.key_down(ctx, vkey)
    if vkey == UP_KEY then
        selected = selected > 1 and selected - 1 or 3
        return
    end
    if vkey == DOWN_KEY then
        selected = selected < 3 and selected + 1 or 1
        return
    end
    if vkey == ENTER_KEY then
        load_settings()
        return
    end
    if vkey ~= LEFT_KEY and vkey ~= RIGHT_KEY then return end

    if selected == 1 then
        settings.enabled = not settings.enabled
    elseif selected == 2 then
        local delta = vkey == RIGHT_KEY and 1 or -1
        settings.quality = (settings.quality + delta + 7) % 7
    else
        settings.auto_exposure = not settings.auto_exposure
    end
    save_settings()
end

function m.show(ctx)
    load_settings()
    input.set_blocked(true)
end

function m.hide(ctx)
    input.set_blocked(false)
end

function m.init(ctx)
    config_path = ctx.sider_dir .. "\\..\\ReShade.ini"
    load_settings()
    ctx.register("overlay_on", m.overlay_on)
    ctx.register("key_down", m.key_down)
    ctx.register("show", m.show)
    ctx.register("hide", m.hide)
    log("STRYKER DLSS 5 Controller loaded: " .. config_path)
end

return m
