-- Abre o Gémeo Digital no browser por omissão
-- Adiciona este script a Preferências do Sistema > Geral > Itens de Login

set gemeoPath to POSIX path of (path to home folder) & "gemeo-servidor/gemeo-digital.html"
set gemeoURL to "file://" & gemeoPath
open location gemeoURL
