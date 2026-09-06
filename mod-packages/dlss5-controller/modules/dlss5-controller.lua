-- STRYKER DLSS 5 Universal RTX Controller
--
-- Panneau dessiné par l'overlay de Sider et ouvert par F10. Il lit et écrit la
-- section [RENODX-DLSS] de ReShade.ini, exactement les mêmes clés que le moteur
-- STRYKER : les deux restent donc d'accord sur l'état réel du jeu.
--
-- L'overlay RenoDX complet reste accessible sur Origine. Lui applique ses
-- changements en direct ; ceux faits ici prennent effet au lancement suivant,
-- puisqu'ils passent par le fichier de configuration.

local m = {}
m.version = "3.0.0"

local UP_KEY = 0x26
local DOWN_KEY = 0x28
local LEFT_KEY = 0x25
local RIGHT_KEY = 0x27
local ENTER_KEY = 0x0d

local QUALITY_NAMES = {
    [0] = "Jeu / automatique",
    [1] = "Performance",
    [2] = "Equilibre",
    [3] = "Qualite",
    [4] = "Ultra Performance",
    [5] = "Ultra Qualite",
    [6] = "DLAA",
}

local UI_CORRECTION_NAMES = {
    [0] = "Desactivee",
    [1] = "Legere",
    [2] = "Complete",
}

-- L'ordre de cette table est celui du panneau. `kind` décide de la lecture, de
-- l'écriture et de l'effet des flèches gauche/droite.
local FIELDS = {
    { key = "enabled", label = "Neural Rendering", ini = "DirectNeuralRenderingEnabled", kind = "bool", default = true },
    { key = "quality", label = "Mode de qualite", ini = "DLSSQualityMode", kind = "choice", names = QUALITY_NAMES, count = 7, default = 0 },
    { key = "auto_exposure", label = "Exposition automatique", ini = "DLSSAutoExposure", kind = "bool", default = false },
    { key = "intensity", label = "Intensite", ini = "DirectNeuralRenderingIntensity", kind = "range", min = 0, max = 1, step = 0.05, default = 1 },
    { key = "auto_mask", label = "Masque automatique", ini = "DirectNeuralRenderingAutoMask", kind = "bool", default = true },
    { key = "nits", label = "Blanc diffus (nits)", ini = "DirectNeuralRenderingDiffuseWhiteNits", kind = "range", min = 80, max = 1000, step = 20, default = 500, decimals = 0 },
    { key = "ui_correction", label = "Correction interface", ini = "DirectNeuralRenderingUiCorrectionMode", kind = "choice", names = UI_CORRECTION_NAMES, count = 3, default = 2 },
    { key = "global_tone", label = "Tonalite globale", ini = "DirectNeuralRenderingGlobalToneStrength", kind = "range", min = 0, max = 1, step = 0.05, default = 1 },
    { key = "local_tone", label = "Tonalite locale", ini = "DirectNeuralRenderingLocalToneStrength", kind = "range", min = 0, max = 1, step = 0.05, default = 1 },
    { key = "local_structure", label = "Structure locale", ini = "DirectNeuralRenderingLocalStructureStrength", kind = "range", min = 0, max = 1, step = 0.05, default = 1 },
    { key = "skin_structure", label = "Structure des visages", ini = "DirectNeuralRenderingSkinStructureStrength", kind = "range", min = 0, max = 1, step = 0.05, default = 1 },
}

local selected = 1
local config_path = nil
local values = {}
local last_message = "PRET"

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

local function round_to_step(value, field)
    local steps = math.floor((value - field.min) / field.step + 0.5)
    local snapped = field.min + steps * field.step
    if snapped < field.min then snapped = field.min end
    if snapped > field.max then snapped = field.max end
    return snapped
end

local function load_settings()
    local lines = read_lines(config_path)
    if not lines then
        last_message = "ReShade.ini introuvable"
        return false
    end
    for _, field in ipairs(FIELDS) do
        local raw = read_ini_value(lines, "RENODX-DLSS", field.ini)
        if field.kind == "bool" then
            if raw == nil then values[field.key] = field.default else values[field.key] = raw ~= "0" end
        elseif field.kind == "choice" then
            local number = tonumber(raw or "")
            if number == nil or field.names[number] == nil then number = field.default end
            values[field.key] = number
        else
            local number = tonumber(raw or "")
            if number == nil then number = field.default end
            values[field.key] = round_to_step(number, field)
        end
    end
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

    local ordered = {
        { key = "DirectNeuralRenderingForceNgxCore", value = "1" },
        { key = "DLSSPath", value = "nvngx_dlss.dll" },
        { key = "StreamlinePath", value = "sl.interposer.dll" },
    }
    for _, field in ipairs(FIELDS) do
        local value = values[field.key]
        local written
        if field.kind == "bool" then
            written = value and "1" or "0"
        elseif field.kind == "choice" then
            written = string.format("%d", value)
        elseif field.decimals == 0 then
            written = string.format("%d", math.floor(value + 0.5))
        else
            written = string.format("%.4f", value)
        end
        ordered[#ordered + 1] = { key = field.ini, value = written }
    end

    lines = update_section(lines, "RENODX-DLSS", ordered)
    local output = io.open(config_path, "wt")
    if not output then
        last_message = "Impossible d'ecrire ReShade.ini"
        return false
    end
    output:write(table.concat(lines, "\n"), "\n")
    output:close()
    last_message = "ENREGISTRE - actif au prochain lancement"
    return true
end

local function value_text(field)
    local value = values[field.key]
    if field.kind == "bool" then return value and "ACTIVE" or "DESACTIVE" end
    if field.kind == "choice" then return field.names[value] or "?" end
    if field.decimals == 0 then return string.format("%d", math.floor(value + 0.5)) end
    return string.format("%.2f", value)
end

local function adjust(field, delta)
    if field.kind == "bool" then
        values[field.key] = not values[field.key]
        return
    end
    if field.kind == "choice" then
        values[field.key] = (values[field.key] + delta + field.count) % field.count
        return
    end
    values[field.key] = round_to_step(values[field.key] + delta * field.step, field)
end

function m.overlay_on(ctx)
    local lines = {}
    for index, field in ipairs(FIELDS) do
        local marker = index == selected and ">  " or "   "
        lines[#lines + 1] = string.format("%s%-24s [%s]", marker, field.label, value_text(field))
    end
    return string.format([[STRYKER - DLSS 5 UNIVERSAL RTX        v%s
==================================================

%s

--------------------------------------------------
HAUT / BAS      choisir        GAUCHE / DROITE  regler
ENTREE          recharger      F10              fermer
ORIGINE         panneau RenoDX complet (reglage en direct)

%s]], m.version, table.concat(lines, "\n"), last_message)
end

function m.key_down(ctx, vkey)
    if vkey == UP_KEY then
        selected = selected > 1 and selected - 1 or #FIELDS
        return
    end
    if vkey == DOWN_KEY then
        selected = selected < #FIELDS and selected + 1 or 1
        return
    end
    if vkey == ENTER_KEY then
        load_settings()
        return
    end
    if vkey ~= LEFT_KEY and vkey ~= RIGHT_KEY then return end
    adjust(FIELDS[selected], vkey == RIGHT_KEY and 1 or -1)
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
    log("STRYKER DLSS 5 Controller " .. m.version .. " - F10 pour le panneau, Origine pour RenoDX")
end

return m
