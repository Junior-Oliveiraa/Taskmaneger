-- Dados fictícios para ver as telas de tarefas em cada situação. Rodar no SQL Editor.
-- 1 portfólio, 3 projetos e 18 tarefas, todos com "[TESTE]" no nome.
--
-- * As tarefas ficam privadas (só administrador/master vê) e sob o seu nome.
-- * Não geram notificação nem WhatsApp (updated_by vazio).
-- * Projetos e portfólio aparecem para quem tem acesso a Projetos.
-- * Para apagar tudo: remover.sql. Rodar de novo recria do zero.

do $$
declare
  v_email text := 'SEU-EMAIL-NO-ORBIT';   -- <<< troque pelo e-mail do seu login
  v_user  uuid;
  h       date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select id into v_user from public.users_profile where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'Nenhum usuário com o e-mail "%". Troque v_email no começo do script.', v_email;
  end if;

  delete from public.tasks where id::text like 'e57e0000-0000-4000-8000-%';
  delete from public.marketing_projetos where id::text like 'e57e0000-0000-4000-8000-%';

  insert into public.marketing_projetos (id, nome, descricao, cor, status, sort_order, data_entrega) values
    ('e57e0000-0000-4000-8000-0000000000b1', '[TESTE] Lançamento da torre B', 'Dado fictício', '#3b82f6', 'ativo',     901, h + 45),
    ('e57e0000-0000-4000-8000-0000000000b2', '[TESTE] Stand de vendas',       'Dado fictício', '#f97316', 'ativo',     902, null),
    ('e57e0000-0000-4000-8000-0000000000b3', '[TESTE] Folder institucional',  'Dado fictício', '#22c55e', 'concluido', 903, null);

  create temp table t_teste on commit drop as
  select ('e57e0000-0000-4000-8000-0000000000' || v.n)::uuid as id, v.titulo, v.status, v.prioridade, v.etiqueta,
         v.criada, v.inicio, v.prazo, v.historico, v.projeto
  from (values
    -- n, título, status, prioridade, etiqueta, criada (dias), início, prazo, histórico, projeto
    -- Torre B: um de cada status
    ('01', 'A fazer: book do corretor',                  'todo',           'medium', 'l1', -3,   h + 6,      h + 14, '{todo}'::text[],                                     'b1'),
    ('02', 'Em progresso: vídeo do decorado',            'in_progress',    'urgent', 'l1', -10,  h - 4,      h + 5,  '{todo,in_progress}'::text[],                         'b1'),
    ('03', 'Refação: legenda dos posts',                 'rework',         'high',   'l2', -12,  h - 8,      h + 2,  '{todo,in_progress,approval,rework}'::text[],         'b1'),
    ('04', 'Aprovação: evento de lançamento, lista de convidados e confirmação com o hotel', 'approval', 'high', 'l3', -9, h - 6, h + 3, '{todo,in_progress,approval}'::text[], 'b1'),
    ('05', 'Implementação: stories da semana',           'implementation', 'medium', 'l5', -15,  h - 9,      h + 4,  '{todo,in_progress,approval,implementation}'::text[], 'b1'),
    ('06', 'Pausada em Aprovação (75%): landing page',   'paused',         'low',    'l3', -20,  h - 12,     h + 8,  '{todo,in_progress,approval,paused}'::text[],         'b1'),
    ('07', 'Concluída: placa de obra',                   'done',           'medium', 'l1', -25,  h - 16,     h - 7,  '{todo,in_progress,approval,done}'::text[],           'b1'),
    ('08', 'Passa do fim do mês: campanha de mídia',     'in_progress',    'high',   'l3', -8,   h - 5,      h + 40, '{todo,in_progress}'::text[],                         'b1'),
    -- Stand: prazos
    ('09', 'Atrasada de meses: tapume do terreno',       'in_progress',    'high',   'l1', -120, h - 115,    h - 93, '{todo,in_progress}'::text[],                         'b2'),
    ('10', 'Começou no mês passado: outdoor da entrada', 'approval',       'urgent', 'l1', -50,  h - 40,     h - 5,  '{todo,in_progress,approval}'::text[],                'b2'),
    ('11', 'Atrasada: orçamento de brindes',             'rework',         'medium', 'l4', -18,  h - 12,     h - 2,  '{todo,in_progress,rework}'::text[],                  'b2'),
    ('12', 'Vence hoje: fornecedor do stand',            'todo',           'low',    'l3', -6,   h - 3,      h,      '{todo}'::text[],                                     'b2'),
    ('13', 'Um dia só: reunião com imobiliária',         'todo',           'medium', 'l3', -2,   h + 1,      h + 1,  '{todo}'::text[],                                     'b2'),
    ('14', 'Sem início definido: roteiro da visita',     'in_progress',    'medium', 'l2', -7,   null::date, h + 6,  '{todo,in_progress}'::text[],                         'b2'),
    ('15', 'Sem previsão (não aparece no Cronograma)',   'no_forecast',    'low',    'l3', -4,   null::date, null::date, '{no_forecast}'::text[],                          'b2'),
    -- Projeto inteiro concluído
    ('16', 'Concluída: texto do folder',                 'done',           'medium', 'l2', -30,  h - 20,     h - 14, '{todo,in_progress,done}'::text[],                    'b3'),
    ('17', 'Concluída: arte do folder',                  'done',           'high',   'l1', -28,  h - 15,     h - 6,  '{todo,in_progress,approval,done}'::text[],           'b3'),
    -- Sem projeto
    ('18', 'Sem projeto: cotação de gráfica',            'paused',         'medium', 'l4', -9,   h - 5,      h + 7,  '{todo,in_progress,paused}'::text[],                  null::text)
  ) as v(n, titulo, status, prioridade, etiqueta, criada, inicio, prazo, historico, projeto);

  insert into public.tasks (id, task_code, title, description, status, priority, project_id, created_at, start_date, due_date,
                            assignee_id, is_private, status_history, updated_at)
  select t.id, '', '[TESTE] ' || t.titulo, 'Tarefa fictícia para testar as telas.', t.status, t.prioridade,
         (select p.id from public.projects p order by p.name limit 1),
         to_char(h + t.criada, 'YYYY-MM-DD'), t.inicio, to_char(t.prazo, 'YYYY-MM-DD'), v_user::text, true,
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'status', x.s,
                   'enteredAt', to_char(h + t.criada + x.k::int - 1, 'YYYY-MM-DD') || 'T12:00:00.000Z',
                   'leftAt', case when x.k < cardinality(t.historico) then to_char(h + t.criada + x.k::int, 'YYYY-MM-DD') || 'T12:00:00.000Z' end)) order by x.k)
            from unnest(t.historico) with ordinality as x(s, k)),
         now()
  from t_teste t;

  insert into public.task_labels (task_id, label_id) select id, etiqueta from t_teste;

  insert into public.marketing_projeto_tarefas (task_id, projeto_id)
  select id, ('e57e0000-0000-4000-8000-0000000000' || projeto)::uuid from t_teste where projeto is not null;
end $$;

select count(*) as tarefas_de_teste from public.tasks where id::text like 'e57e0000-0000-4000-8000-%';
