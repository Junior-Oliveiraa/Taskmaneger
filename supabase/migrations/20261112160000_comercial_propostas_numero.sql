-- =============================================================================
-- Comercial — propostas: número de registro (P0001, P0002…)
-- -----------------------------------------------------------------------------
-- Número sequencial, único e imutável. Quem atribui é o banco (sequência +
-- trigger): dois cadastros ao mesmo tempo nunca recebem o mesmo número, e o
-- valor que o cliente mandar é ignorado. A tela formata como "P" + 4 dígitos.
-- Número de proposta excluída não é reaproveitado.
-- =============================================================================

alter table public.comercial_propostas
  add column if not exists numero bigint;

-- Existentes: numeradas pela ordem de cadastro.
with ordem as (
  select id, row_number() over (order by created_at, id) as n
    from public.comercial_propostas
)
update public.comercial_propostas p
   set numero = o.n
  from ordem o
 where p.id = o.id and p.numero is null;

create sequence if not exists public.comercial_propostas_numero_seq;
select setval(
  'public.comercial_propostas_numero_seq',
  greatest((select coalesce(max(numero), 0) from public.comercial_propostas), 0) + 1,
  false
);

alter table public.comercial_propostas
  alter column numero set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comercial_propostas_numero_key') then
    alter table public.comercial_propostas
      add constraint comercial_propostas_numero_key unique (numero);
  end if;
end;
$$;

create or replace function public.comercial_propostas_numero()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.numero := nextval('public.comercial_propostas_numero_seq');
  else
    new.numero := old.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists comercial_propostas_numero on public.comercial_propostas;
create trigger comercial_propostas_numero
  before insert or update on public.comercial_propostas
  for each row execute function public.comercial_propostas_numero();
