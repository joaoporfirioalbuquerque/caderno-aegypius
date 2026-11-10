-- Caderno de Campo Aegypius — configuração do Supabase
-- Correr uma vez no SQL Editor do projeto (Run). Pode voltar a correr-se sem estragar nada.

-- 1. Quem pode usar a app ------------------------------------------------------
create table if not exists public.membros (
  email      text primary key,
  nome       text,
  papel      text not null default 'registo' check (papel in ('registo','admin')),
  criado_em  timestamptz not null default now()
);

create or replace function public.e_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where lower(email) = lower(auth.jwt() ->> 'email') and papel = 'admin')
$$;

-- 2. Os dados do caderno (registos, ninhos, PO, fichas, lista base) -------------
create table if not exists public.docs (
  col         text not null,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text default (auth.jwt() ->> 'email'),
  primary key (col, id)
);

create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.docs_touch();

-- 3. Regras de acesso: só membros veem e gravam; a lista base só a muda um admin --
alter table public.docs    enable row level security;
alter table public.membros enable row level security;

drop policy if exists docs_ler    on public.docs;
drop policy if exists docs_criar  on public.docs;
drop policy if exists docs_mudar  on public.docs;
drop policy if exists docs_apagar on public.docs;
create policy docs_ler    on public.docs for select using (public.e_membro());
create policy docs_criar  on public.docs for insert with check (public.e_membro() and (col <> 'base' or public.e_admin()));
create policy docs_mudar  on public.docs for update using (public.e_membro() and (col <> 'base' or public.e_admin()))
                                                    with check (public.e_membro() and (col <> 'base' or public.e_admin()));
create policy docs_apagar on public.docs for delete using (public.e_membro() and (col <> 'base' or public.e_admin()));

drop policy if exists membros_ler    on public.membros;
drop policy if exists membros_gerir  on public.membros;
create policy membros_ler   on public.membros for select using (public.e_membro());
create policy membros_gerir on public.membros for all using (public.e_admin()) with check (public.e_admin());

-- 4. Atualizações em direto entre telemóveis -----------------------------------
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 5. Fotografias -----------------------------------------------------------------
-- Pasta pública com nomes aleatórios: quem não tem o link não encontra as fotos.
-- As fotos são reduzidas na app antes de sair do telemóvel e não levam GPS no ficheiro.
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

drop policy if exists fotos_enviar on storage.objects;
drop policy if exists fotos_apagar on storage.objects;
create policy fotos_enviar on storage.objects for insert with check (bucket_id = 'fotos' and public.e_membro());
create policy fotos_apagar on storage.objects for delete using (bucket_id = 'fotos' and public.e_membro());

-- 6. O primeiro membro (tu): troca o email e o nome antes de correr ------------------
insert into public.membros (email, nome, papel)
values ('joaoalbuquerque18@gmail.com', 'Joao Porfirio Albuquerque', 'admin')
on conflict (email) do update set papel = 'admin';
