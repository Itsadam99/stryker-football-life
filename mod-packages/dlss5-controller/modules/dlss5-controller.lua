local m = {}
m.version = "3.1.0"

-- Ce module ne dessine rien dans l'overlay de Sider. Le reglage se fait dans le
-- Centre de controle DLSS 5 de STRYKER, que l'application ouvre par-dessus le
-- jeu sur F10 : une vraie fenetre vaut mieux qu'un panneau texte.
--
-- STRYKER deplace au passage l'overlay RenoDX sur Origine, pour que les deux ne
-- se disputent pas la touche. Le module reste installe parce qu'il est ce que
-- le catalogue livre, et sa presence est ce qui declenche la capture de F10.
function m.init(ctx)
    log("STRYKER DLSS 5 Control Center " .. m.version .. " - F10 ouvre le centre de controle, Origine l'overlay RenoDX")
end

return m
