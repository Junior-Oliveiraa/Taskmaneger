-- Estado (UF) e bairro de quem comprou, do cadastro da pessoa no CV CRM
-- (cvdw/pessoas, ligado pela reserva em idcliente). Usados só agrupados no perfil.
-- Aplicar ANTES de publicar a nova versão da `cvcrm-sync`, que já grava as colunas.
alter table public.cv_comercial_reservas add column if not exists estado text;
alter table public.cv_comercial_reservas add column if not exists bairro text;
