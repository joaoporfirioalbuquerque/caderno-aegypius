# Caderno de Campo Aegypius

App de campo para monitorização de ninhos de abutre-preto. Funciona no telemóvel como app instalada, com GPS e sem rede.

- O código está aqui (repositório público, servido pelo GitHub Pages).
- **Os dados não estão aqui.** Ninhos, histórico, registos e fotos ficam no Supabase, e só os membros autorizados os veem.
- Configuração: `supabase/setup.sql` (tabelas e regras de acesso) e `js/config.js` (URL e chave pública do projeto).

Para acrescentar um colega: Supabase → Table Editor → `membros` → Insert row (email, nome, papel `registo` ou `admin`).

Ao publicar uma versão nova da app, mude `VERSAO` em `sw.js` (ex.: `aeg-v2`) para os telemóveis a atualizarem.
