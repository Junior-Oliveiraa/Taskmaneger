-- =============================================================================
-- Aprovador das propostas: só master/administrador troca, e só para um deles
-- -----------------------------------------------------------------------------
-- A engrenagem ao lado de "Nova proposta" grava whatsapp_config
-- .proposta_aprovador_id. A policy da tabela libera escrita a qualquer
-- autenticado (é ela que o painel de integrações usa), então a regra desta
-- coluna fica num trigger:
--   * quem troca precisa ser master/administrador (service_role passa);
--   * o escolhido também precisa ser master/administrador.
-- =============================================================================

create or replace function public.whatsapp_config_aprovador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proposta_aprovador_id is not distinct from old.proposta_aprovador_id then
    return new;
  end if;

  if auth.uid() is not null and not public.is_permission_level_1() then
    raise exception 'Só o Diretor (master ou administrador) define o aprovador das propostas.'
      using errcode = '42501';
  end if;

  if new.proposta_aprovador_id is not null and not exists (
    select 1 from public.users_profile
     where id = new.proposta_aprovador_id and perfil in ('master', 'administrador')
  ) then
    raise exception 'O aprovador das propostas precisa ter perfil master ou administrador.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_config_aprovador on public.whatsapp_config;
create trigger whatsapp_config_aprovador
  before update on public.whatsapp_config
  for each row execute function public.whatsapp_config_aprovador();
