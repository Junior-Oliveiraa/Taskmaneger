-- Apaga só o que inserir.sql criou (ids com o prefixo e57e0000). Etiquetas e vínculos
-- saem junto. Cópias feitas com "Duplicar" e tarefas criadas nesses projetos têm outro
-- id: continuam existindo, sem projeto.
begin;
delete from public.tasks where id::text like 'e57e0000-0000-4000-8000-%';
delete from public.marketing_projetos where id::text like 'e57e0000-0000-4000-8000-%';
commit;
