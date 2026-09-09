"""Run with Lupa 2.8 available on PYTHONPATH; does not launch or access the game."""
from pathlib import Path
import unittest
from lupa.luajit21 import LuaRuntime

SOURCE = (Path(__file__).parent / "modules" / "team-identity-probe.lua").read_text(encoding="utf-8")


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.lua = LuaRuntime(unpack_returned_tuples=True)
        self.lua.execute("""
            messages, handlers = {}, {}
            log = function(text) table.insert(messages, text) end
            local forbidden = setmetatable({}, {__index=function() error('forbidden API') end})
            memory, io, os = forbidden, forbidden, forbidden
            calls = 0
            stats = {home_score=0, away_score=0, period=1, clock_minutes=0, clock_seconds=0}
            match = {stats=function() calls=calls+1; return stats end}
            local values = {home_team=100, away_team=200, tournament_id=3}
            values.register = function(event, callback) handlers[event] = callback end
            ctx = setmetatable({}, {
                __index=values,
                __newindex=function() error('context must not be modified') end
            })
            function contains(text)
                for _, line in ipairs(messages) do
                    if line:find(text, 1, true) then return true end
                end
                return false
            end
            function frames(count)
                for i=1,count do handlers.display_frame(ctx) end
            end
        """)
        self.lua.globals().source = SOURCE
        self.lua.execute("""
            -- Same global allowlist as Sider's documented module environment.
            local allowed = {}
            for key in string.gmatch('assert ipairs pairs tostring tonumber table string math unpack type error io os _VERSION log memory fs zlib audio match input _FILE', '%S+') do
                allowed[key] = true
            end
            module_env = setmetatable({}, {__index=function(_, key)
                if allowed[key] then return _G[key] end
            end})
            module_env._G = module_env
            local chunk = assert(loadstring(source))
            setfenv(chunk, module_env)
            probe = chunk()
        """)

    def test_only_documented_events_no_game_mutation(self):
        self.lua.execute("""
            probe.init(ctx)
            local expected = {set_teams=true, after_set_conditions=true, context_reset=true,
                livecpk_data_ready=true, display_frame=true, overlay_on=true}
            local count = 0
            for event in pairs(handlers) do assert(expected[event]); count=count+1 end
            assert(count == 6)
            assert(handlers.set_teams(ctx, 100, 200) == nil)
            assert(handlers.after_set_conditions(ctx) == nil)
            assert(handlers.context_reset(ctx) == nil)
            assert(ctx.home_team == 100 and ctx.away_team == 200)
            assert(contains('mode=read-only'))
            assert(handlers.overlay_on(ctx):find('Aucun effet gameplay', 1, true))
        """)

    def test_stats_polling_score_changes_and_clock_rewind(self):
        self.lua.execute("""
            probe.init(ctx)
            frames(119); assert(calls == 0)
            frames(1); assert(calls == 1)
            local n = #messages
            frames(120); assert(calls == 2 and #messages == n)
            stats.home_score=1; frames(120); assert(#messages == n+1)
            stats.clock_minutes=20; frames(120); assert(#messages == n+2)
            stats.clock_minutes=0; frames(120); assert(#messages == n+3)
            stats=nil; frames(120)
            assert(contains('not a final result'))
            n=#messages; frames(120); assert(#messages == n)
        """)

    def test_stats_optional_and_error_does_not_break_resource_capture(self):
        self.lua.execute("""
            match=nil; probe.init(ctx); frames(120)
            assert(contains('match.stats not exposed'))
            calls=0
            match={stats=function() calls=calls+1; error('unsupported runtime') end}
            local ok = pcall(frames, 120) -- Sider catches callback errors at this boundary.
            assert(not ok and calls == 1)
            local n=#messages; frames(1200); assert(#messages == n and calls == 1)
            handlers.livecpk_data_ready(ctx, 'Tactics.bin', nil, 12, 12, 0)
            assert(contains('file=Tactics.bin'))
        """)

    def test_sider_sandbox_omits_pcall_but_stats_are_collected(self):
        self.lua.execute("""
            assert(module_env.pcall == nil and module_env.xpcall == nil)
            probe.init(ctx)
            frames(120)
            assert(calls == 1 and contains('snapshot'))
            assert(contains('home_score=0') and contains('clock_minutes=0'))
        """)

    def test_resource_filter_deduplication_and_no_pointer_access(self):
        self.lua.execute(r"""
            probe.init(ctx)
            local n=#messages
            handlers.livecpk_data_ready(ctx, 'common/texture/face.bin', {}, 16, 16, 0)
            assert(#messages == n)
            handlers.livecpk_data_ready(ctx, 'common/pesdb/etc/Tactics.bin', {}, 16, 32, 0)
            handlers.livecpk_data_ready(ctx, [[COMMON\PESDB\ETC\TACTICS.BIN]], {}, 16, 32, 16)
            assert(#messages == n+1)
            assert(contains('total_bytes=32'))
            handlers.livecpk_data_ready(ctx, [[coach\bad\name.bin]] .. string.char(10) .. '|fake', {}, 12, 12, 0)
            assert(not messages[#messages]:find(string.char(10), 1, true))
        """)

    def test_bounded_resources_and_logging(self):
        self.lua.execute("""
            probe.init(ctx)
            for i=1,510 do handlers.livecpk_data_ready(ctx, 'tactics-'..i..'.bin', nil, 12, 12, 0) end
            assert(#messages == 501)
            assert(not contains('file=tactics-501.bin'))
            for i=1,2100 do handlers.set_teams(ctx, i, 200) end
            assert(#messages == 2001)
            assert(contains('restart game to capture another session'))
            local n=#messages; frames(1200); assert(#messages == n and calls == 0)
        """)

    def test_reset_does_not_advance_a_career(self):
        self.lua.execute("""
            probe.init(ctx)
            handlers.after_set_conditions(ctx)
            handlers.context_reset(ctx)
            local n=#messages
            frames(120); assert(#messages == n+1)
            assert(contains('not a career date or final result'))
            assert(probe.career == nil and ctx.season == nil)
        """)


if __name__ == "__main__":
    unittest.main(verbosity=2)
