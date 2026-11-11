-- =============================================================================
-- Metas do Comercial passam a alimentar o Dashboard Analítico (Finanças)
-- -----------------------------------------------------------------------------
-- O Dashboard Analítico calculava o orçamento (2% do VGV meta e % por categoria)
-- sobre sienge_project_metas, editadas no painel "Ajustar Metas". Agora a fonte
-- única é comercial_metas; cada empreendimento das metas aponta para o
-- empreendimento do Orbit (projects) de onde vêm os gastos.
--
-- sienge_project_metas fica no banco, sem uso, como histórico.
-- =============================================================================

alter table public.comercial_metas_empreendimentos
  add column if not exists project_id text references public.projects(id) on delete set null;

-- Vínculo inicial pelos nomes atuais do Orbit (só onde ainda não há vínculo).
update public.comercial_metas_empreendimentos e
set project_id = p.id
from (values
  ('Rivage', 'rivage'),
  ('Botanic', 'botanic'),
  ('Gênova', 'gênova'),
  ('Flow', 'flow'),
  ('Green Park', 'green park'),
  ('Vivenda', 'vivenda do bosque'),
  ('Corporate', 'coporate')
) as v(meta, projeto)
join public.projects p on lower(btrim(p.name)) = v.projeto
where e.nome = v.meta and e.project_id is null;
