-- Research only. Uses documented Sider events, never changes ctx or game memory.
-- All observations go to Sider's existing log. No save files are opened.
local m = {}
local prefix = "[STRYKER-TACTICS-PROBE] "
local fields = {"home_team", "away_team", "tournament_id", "match_id", "match_info", "match_leg"}
local stat_fields = {"home_score", "away_score", "period", "clock_minutes", "clock_seconds"}
local seen, resource_count, frame, emitted = {}, 0, 0, 0
local previous_stats, stats_failed = nil, false
local MAX_RESOURCES, MAX_LOGS = 500, 2000

local function clean(value)
    if type(value) ~= "string" and type(value) ~= "number" then return "unknown" end
    return tostring(value):gsub("[%c|]", " "):sub(1, 240)
end

local function emit(kind, values)
    if emitted >= MAX_LOGS then return end
    emitted = emitted + 1
    log(prefix .. kind .. " | " .. table.concat(values or {}, " | "))
    if emitted == MAX_LOGS then log(prefix .. "limit | restart game to capture another session") end
end

local function context_values(ctx)
    local result = {}
    for _, key in ipairs(fields) do result[#result + 1] = key .. "=" .. clean(ctx[key]) end
    return result
end

local function sample(ctx, reason)
    if stats_failed or type(match) ~= "table" or type(match.stats) ~= "function" then return end
    local ok, stats = pcall(match.stats)
    if not ok then
        stats_failed = true
        emit("stats_unavailable", {"reason=API error; polling disabled for this session"})
        return
    end
    if type(stats) ~= "table" then
        if previous_stats ~= nil then emit("stats_unavailable", {"reason=no snapshot; not a final result"}) end
        previous_stats = nil
        return
    end
    -- Sample each five match minutes, and on score/period changes, not every frame.
    local bucket = type(stats.clock_minutes) == "number" and math.floor(stats.clock_minutes / 5) or "unknown"
    local key = table.concat({clean(ctx.home_team), clean(ctx.away_team), clean(stats.home_score),
        clean(stats.away_score), clean(stats.period), clean(bucket)}, ":")
    if previous_stats == key then return end
    previous_stats = key
    local values = context_values(ctx)
    values[#values + 1] = "reason=" .. clean(reason)
    for _, name in ipairs(stat_fields) do values[#values + 1] = name .. "=" .. clean(stats[name]) end
    emit("snapshot", values)
end

function m.set_teams(ctx, home_team, away_team)
    previous_stats = nil
    local values = context_values(ctx)
    values[#values + 1] = "event_home=" .. clean(home_team)
    values[#values + 1] = "event_away=" .. clean(away_team)
    emit("teams_selected", values)
end

function m.after_set_conditions(ctx)
    emit("conditions_ready", context_values(ctx))
    sample(ctx, "conditions_ready")
end

function m.context_reset(ctx)
    emit("context_reset", {"meaning=unknown transition; not a career date or final result"})
    previous_stats = nil
end

function m.data_ready(ctx, filename, data, size, total_size, offset, cpk_filename)
    if type(filename) ~= "string" or #filename > 2048 or resource_count >= MAX_RESOURCES then return end
    local name = filename:lower():gsub("/", "\\")
    local relevant = name:find("tactic", 1, true) or name:find("formation", 1, true)
        or name:find("coach", 1, true) or name:find("manager", 1, true)
        or name:find("masterleague", 1, true) or name:find("becomealegend", 1, true)
        or name:find("\\pesdb\\", 1, true)
    if not relevant or seen[name] then return end
    seen[name] = true
    resource_count = resource_count + 1
    -- Deliberately do not dereference the data pointer or expose process addresses.
    emit("resource", {"file=" .. clean(filename), "chunk_bytes=" .. clean(size),
        "total_bytes=" .. clean(total_size), "offset=" .. clean(offset)})
end

function m.display_frame(ctx)
    frame = frame + 1
    if frame % 120 == 0 and emitted < MAX_LOGS then sample(ctx, "poll") end
end

function m.overlay_on(ctx)
    return "STRYKER : diagnostic tactiques 0.1.0\nAucun effet gameplay. Observations dans sider.log.\n"
        .. "Ressources observees : " .. resource_count .. " / " .. MAX_RESOURCES
end

function m.init(ctx)
    seen, resource_count, frame, emitted = {}, 0, 0, 0
    previous_stats, stats_failed = nil, false
    emit("start", {"version=0.1.0", "mode=read-only", "career_detection=unavailable"})
    if type(match) ~= "table" or type(match.stats) ~= "function" then
        emit("stats_unavailable", {"reason=match.stats not exposed"})
    end
    ctx.register("set_teams", m.set_teams)
    ctx.register("after_set_conditions", m.after_set_conditions)
    ctx.register("context_reset", m.context_reset)
    ctx.register("livecpk_data_ready", m.data_ready)
    ctx.register("display_frame", m.display_frame)
    ctx.register("overlay_on", m.overlay_on)
end

return m
