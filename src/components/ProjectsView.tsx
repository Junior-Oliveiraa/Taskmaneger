import React, { useEffect, useRef, useState } from 'react';
import { FolderPlus, Image as ImageIcon, Megaphone, Tag, History, Copy, Check, ChevronRight, PieChart, Edit2, Building2, Trash2, AlertTriangle, Loader2, X } from 'lucide-react';
import { Project, Task } from '../types';
import { fetchProjectDeleteImpact, ProjectDeleteImpact } from '../lib/api';
import { usePermissoes } from '../lib/permissoes';

interface ProjectsViewProps {
  projects: Project[];
  tasks: Task[];
  onSelectProjectFilter: (projectId: string) => void;
  onAddProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
}

/**
 * Confirmação da exclusão. Vale a tela inteira porque o DELETE cascateia: leva
 * tarefas, unidades da tabela de vendas, vendas congeladas, metas e a LP do
 * Corretor junto — nada disso aparece no card, e aprovar às cegas aqui custa
 * caro. Os números vêm do banco, não de estimativa da tela.
 *
 * Digitar o nome é proposital: o clique errado é o modo de falha real de um
 * botão de lixeira num grid de cards.
 */
function DeleteProjectDialog({ project, onCancel, onConfirm }: {
  project: Project;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [impact, setImpact] = useState<ProjectDeleteImpact | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    let ativo = true;
    fetchProjectDeleteImpact(project.id)
      .then(d => { if (ativo) setImpact(d); })
      .catch(e => { if (ativo) setErro(e?.message || 'Não foi possível levantar o impacto da exclusão.'); });
    return () => { ativo = false; };
  }, [project.id]);

  const podeExcluir = confirmText.trim() === project.name && !excluindo;

  const linhas = impact ? ([
    ['Tarefas', impact.tarefas],
    ['Unidades da tabela de vendas', impact.unidades],
    ['Versões da tabela de vendas', impact.versoes],
    ['Vendas congeladas', impact.vendas],
    ['Metas de VGV', impact.metas],
  ] as const).filter(([, n]) => n > 0) : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#121214] border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-zinc-900">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle size={15} className="text-red-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-100">Excluir empreendimento</h3>
              <p className="text-[11px] text-zinc-500 truncate">{project.name}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          {erro && <p className="text-[11px] text-red-400">{erro}</p>}

          {!impact && !erro ? (
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 py-2">
              <Loader2 size={13} className="animate-spin" /> Levantando o que será apagado...
            </div>
          ) : impact && (
            <>
              {linhas.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] text-zinc-400">Esta ação apaga permanentemente, junto com o empreendimento:</p>
                  <div className="flex flex-col rounded-lg border border-zinc-800 overflow-hidden">
                    {linhas.map(([label, n]) => (
                      <div key={label} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11px] bg-zinc-900/40 border-b border-zinc-800/60 last:border-b-0">
                        <span className="text-zinc-400">{label}</span>
                        <span className="text-red-400 font-semibold tabular-nums">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400">Este empreendimento não tem tarefas nem tabela de vendas vinculadas.</p>
              )}

              {impact.temLp && (
                <p className="text-[11px] text-amber-400/90 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  A página pública da Tabela Corretor sai do ar junto.
                </p>
              )}

              {/* Títulos se ligam por nome, não por chave: o cascade não os
                  alcança e eles sobrevivem apontando para um nome extinto. */}
              {impact.titulos > 0 && (
                <p className="text-[11px] text-amber-400/90 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  {impact.titulos} {impact.titulos === 1 ? 'título financeiro continua' : 'títulos financeiros continuam'} no sistema, mas {impact.titulos === 1 ? 'fica órfão' : 'ficam órfãos'} — o gasto some do Dashboard Analítico.
                </p>
              )}

              <div className="flex flex-col gap-1.5 pt-1">
                <label className="text-[11px] text-zinc-400">
                  Digite <span className="text-zinc-200 font-semibold">{project.name}</span> para confirmar:
                </label>
                <input
                  autoFocus
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={project.name}
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-700 outline-none focus:border-red-500/50 transition-colors"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-900">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
            Cancelar
          </button>
          <button
            disabled={!podeExcluir}
            onClick={async () => { setExcluindo(true); try { await onConfirm(); } finally { setExcluindo(false); } }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors text-white bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed"
          >
            {excluindo ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            {excluindo ? 'Excluindo...' : 'Excluir permanentemente'}
          </button>
        </div>
      </div>
    </div>
  );
}

const QUICK_SECTIONS = [
  { label: 'Imagens, Fotos e Vídeos', icon: ImageIcon },
  { label: 'Material de Marketing', icon: Megaphone },
  { label: 'Tabela de Preços', icon: Tag },
  { label: 'Linha do tempo', icon: History },
];

const STATUS_LABEL: Record<Project['status'], string> = {
  active: 'Ativo',
  completed: 'Concluído',
  on_hold: 'Pausado',
};

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
      title="Copiar código"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

export default function ProjectsView({
  projects,
  tasks,
  onSelectProjectFilter,
  onAddProject,
  onUpdateProject,
  onDeleteProject
}: ProjectsViewProps) {
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  // Criar/editar segue o módulo; renomear e excluir são do administrador.
  const { pode, isAdmin } = usePermissoes();
  const podeEditar = pode('empreendimentos', 'editar');
  // Referências, e não document.querySelector: o seletor global pegava o
  // primeiro `.overflow-y-auto` do documento, que é o do menu lateral. Clicar
  // em editar rolava o menu e deixava o formulário fora da tela — parecia que
  // o botão não fazia nada.
  const scrollRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjCode, setNewProjCode] = useState('');
  const [newProjCoverImage, setNewProjCoverImage] = useState('');
  const [newProjBuildProgress, setNewProjBuildProgress] = useState(0);
  const [newProjTerceiros, setNewProjTerceiros] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // Colors array to allocate to new projects
  const availableColors = [
    'text-blue-400',
    'text-rose-400',
    'text-amber-400',
    'text-emerald-400',
    'text-sky-400',
    'text-pink-400'
  ];

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    if (editingProjectId) {
      const existing = projects.find(p => p.id === editingProjectId);
      if (existing) {
        onUpdateProject({
          ...existing,
          name: newProjName.trim(),
          description: newProjDesc.trim() || 'Sem descrição cadastrada.',
          code: newProjCode.trim() || null,
          coverImage: newProjCoverImage.trim() || null,
          buildProgress: newProjBuildProgress,
          terceiros: newProjTerceiros,
        });
      }
    } else {
      const newProj: Project = {
        id: `p-${Date.now()}`,
        name: newProjName.trim(),
        description: newProjDesc.trim() || 'Sem descrição cadastrada.',
        color: availableColors[Math.floor(Math.random() * availableColors.length)],
        status: 'active',
        code: newProjCode.trim() || null,
        coverImage: newProjCoverImage.trim() || null,
        buildProgress: newProjBuildProgress,
        terceiros: newProjTerceiros,
      };
      onAddProject(newProj);
    }

    setNewProjName('');
    setNewProjDesc('');
    setNewProjCode('');
    setNewProjCoverImage('');
    setNewProjBuildProgress(0);
    setNewProjTerceiros(false);
    setShowAddForm(false);
    setEditingProjectId(null);
  };

  const handleEditClick = (project: Project) => {
    setEditingProjectId(project.id);
    setNewProjName(project.name);
    setNewProjDesc(project.description);
    setNewProjCode(project.code || '');
    setNewProjCoverImage(project.coverImage || '');
    setNewProjBuildProgress(project.buildProgress || 0);
    setNewProjTerceiros(!!project.terceiros);
    setShowAddForm(true);
  };

  // O formulário nasce no topo da lista, longe do card em que se clicou. Rolar
  // até ele e já deixar o nome selecionado é o que torna o clique no lápis
  // visivelmente uma edição — e não um botão que não responde.
  useEffect(() => {
    if (!showAddForm) return;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    // Depois da montagem do formulário, senão o ref ainda está vazio.
    const id = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      if (editingProjectId) nameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [showAddForm, editingProjectId]);

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingProjectId(null);
    setNewProjName('');
    setNewProjDesc('');
    setNewProjCode('');
    setNewProjCoverImage('');
    setNewProjBuildProgress(0);
    setNewProjTerceiros(false);
  };

  return (
    <div ref={scrollRef} className="flex-1 flex flex-col view-pad overflow-y-auto select-none view-gap bg-[#08080a]">

      {/* Projects Title Banner */}
      <div className="flex items-center justify-between bg-zinc-950/50 p-4 rounded-lg border border-zinc-900">
        <div className="flex items-center gap-2">
          <PieChart size={14} className="text-zinc-400" />
          <h2 className="text-xs font-semibold text-zinc-350 uppercase tracking-widest font-mono">Workspace Empreendimentos</h2>
          <span className="text-[9px] bg-zinc-900 text-zinc-500 py-0.5 px-2 rounded-full font-mono font-medium border border-zinc-800">
            {projects.length} Total
          </span>
        </div>

        {podeEditar && (
        <button
          onClick={() => {
            if (showAddForm && !editingProjectId) {
              handleCancelForm();
            } else {
              setEditingProjectId(null);
              setNewProjName('');
              setNewProjDesc('');
              setNewProjCode('');
              setNewProjCoverImage('');
              setNewProjBuildProgress(0);
              setNewProjTerceiros(false);
              setShowAddForm(true);
            }
          }}
          className="h-8 flex items-center gap-1.5 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-100 rounded text-xs font-semibold border border-zinc-700/50 transition-all shadow-sm"
        >
          <FolderPlus size={12} />
          <span>Novo Empreendimento</span>
        </button>
        )}
      </div>

      {/* Add Project collapsible Inline Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateProject}
          className="bg-zinc-950 p-4 rounded-lg border border-zinc-900 space-y-3 animate-fade-in max-w-lg"
        >
          <h3 className="text-[10px] font-bold font-mono uppercase text-zinc-400">
            {editingProjectId ? 'Editar Empreendimento' : 'Criar Novo Empreendimento'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[9px] text-zinc-550 font-bold uppercase block mb-1">Nome</label>
              <input
                ref={nameInputRef}
                type="text"
                required
                placeholder="Ex. Green Park..."
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                disabled={!!editingProjectId && !isAdmin}
                title={editingProjectId && !isAdmin ? 'Renomear empreendimento é exclusivo do administrador' : undefined}
                className="w-full bg-[#08080a] border border-zinc-900 p-2 text-xs rounded text-zinc-200 outline-none focus:border-zinc-750"
              />
            </div>
            <div>
              <label className="text-[9px] text-zinc-550 font-bold uppercase block mb-1">Código / Matrícula</label>
              <input
                type="text"
                placeholder="Ex. 34.0001.2589..."
                value={newProjCode}
                onChange={(e) => setNewProjCode(e.target.value)}
                className="w-full bg-[#08080a] border border-zinc-900 p-2 text-xs rounded text-zinc-200 outline-none focus:border-zinc-750 font-mono"
              />
            </div>
            <div>
              <label className="text-[9px] text-zinc-550 font-bold uppercase block mb-1">Evolução da Obra ({newProjBuildProgress}%)</label>
              <input
                type="range"
                min={0}
                max={100}
                value={newProjBuildProgress}
                onChange={(e) => setNewProjBuildProgress(Number(e.target.value))}
                className="w-full accent-zinc-400 mt-2.5"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[9px] text-zinc-550 font-bold uppercase block mb-1">URL da Imagem de Capa</label>
              <input
                type="text"
                placeholder="https://..."
                value={newProjCoverImage}
                onChange={(e) => setNewProjCoverImage(e.target.value)}
                className="w-full bg-[#08080a] border border-zinc-900 p-2 text-xs rounded text-zinc-200 outline-none focus:border-zinc-750"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[9px] text-zinc-550 font-bold uppercase block mb-1">Descrição</label>
              <textarea
                placeholder="Ex. Lotes em Guaxuma..."
                rows={2}
                value={newProjDesc}
                onChange={(e) => setNewProjDesc(e.target.value)}
                className="w-full bg-[#08080a] border border-zinc-900 p-2 text-xs rounded text-zinc-200 outline-none focus:border-zinc-750 resize-none"
              />
            </div>

            {/* Terceiros: fato do empreendimento, não configuração de página —
                por isso mora aqui e não no painel da Tabela Corretor. A LP lê o
                flag pelo payload público. */}
            <div className="col-span-2">
              <div className="flex items-center justify-between gap-3 bg-[#08080a] border border-zinc-900 rounded p-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-zinc-300">Empreendimento de terceiros</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Não é da incorporadora. A Tabela Corretor se apresenta de outro jeito.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewProjTerceiros(v => !v)}
                  aria-pressed={newProjTerceiros}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${newProjTerceiros ? 'bg-amber-500' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${newProjTerceiros ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={handleCancelForm}
              className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded font-semibold border border-zinc-700/40"
            >
              Confirmar
            </button>
          </div>
        </form>
      )}

      {/* Grid of Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 view-gap-sm">
        {projects.map(project => {
          const projectTasks = tasks.filter(t => t.projectId === project.id);
          const totalTasks = projectTasks.length;
          const completedTasks = projectTasks.filter(t => t.status === 'done').length;
          const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          const buildProgress = Math.max(0, Math.min(100, project.buildProgress ?? 0));

          return (
            <div
              key={project.id}
              className="group bg-zinc-950/40 border border-zinc-900 hover:border-zinc-800 rounded-xl overflow-hidden transition-all duration-300 flex flex-col cursor-pointer hover:shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_8px_24px_-8px_rgba(0,0,0,0.5)]"
              onClick={() => onSelectProjectFilter(project.id)}
            >
              {/* Cover */}
              <div className={`relative h-28 short:h-20 shrink-0 overflow-hidden ${project.color}`}>
                {project.coverImage ? (
                  <img
                    src={project.coverImage}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-current opacity-[0.12] flex items-center justify-center">
                    <Building2 size={22} className="opacity-60" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0" />
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                  {project.terceiros && (
                    <span
                      title="Empreendimento de terceiros — a Tabela Corretor se apresenta de outro jeito."
                      className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 backdrop-blur-sm py-0.5 px-2 rounded-full border border-amber-400/30"
                    >
                      Terceiros
                    </span>
                  )}
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-200 bg-black/50 backdrop-blur-sm py-0.5 px-2 rounded-full border border-white/10">
                    {STATUS_LABEL[project.status]}
                  </span>
                </div>
                {/* Editar e excluir. Ficavam invisíveis até o hover (e a
                    lixeira não existia); agora aparecem esmaecidos e firmam no
                    hover — descobrir que dá para renomear não deveria depender
                    de passar o mouse no lugar certo. */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1">
                  {podeEditar && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditClick(project); }}
                    className="p-1.5 bg-black/50 backdrop-blur-sm rounded text-zinc-400 opacity-70 group-hover:opacity-100 hover:text-white hover:bg-black/70 transition-all border border-white/10"
                    title="Editar empreendimento"
                  >
                    <Edit2 size={11} />
                  </button>
                  )}
                  {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setProjectToDelete(project); }}
                    className="p-1.5 bg-black/50 backdrop-blur-sm rounded text-zinc-400 opacity-70 group-hover:opacity-100 hover:text-red-400 hover:bg-black/70 transition-all border border-white/10"
                    title="Excluir empreendimento"
                  >
                    <Trash2 size={11} />
                  </button>
                  )}
                </div>
              </div>

              <div className="p-4 flex flex-col flex-1">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-[13.5px] font-semibold text-zinc-100 truncate" title={project.name}>
                    {project.name}
                  </h3>
                </div>
                {project.code && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-[10px] font-mono text-zinc-600 truncate">{project.code}</span>
                    <CopyCodeButton code={project.code} />
                  </div>
                )}
                {!project.code && <div className="mb-3" />}

                <p className="text-[11.5px] text-zinc-500 leading-relaxed line-clamp-2 mb-3.5">
                  {project.description}
                </p>

                {/* Quick sections (decorative) */}
                <div className="border-t border-zinc-900 -mx-4 px-4 pt-2.5 pb-1 space-y-0.5">
                  {QUICK_SECTIONS.map(({ label, icon: Icon }) => (
                    <div
                      key={label}
                      className="flex items-center gap-2 py-1 text-[11.5px] text-zinc-500"
                    >
                      <Icon size={12} className="text-zinc-600 shrink-0" />
                      <span className="truncate">{label}</span>
                    </div>
                  ))}
                </div>

                <div className="flex-1" />

                {/* Build progress meter */}
                <div className={`space-y-1.5 mt-3 mb-3 ${project.color}`}>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-zinc-500">Evolução da Obra</span>
                    <span className="text-zinc-300 font-semibold">{buildProgress}%</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-current rounded-full transition-all duration-300"
                      style={{ width: `${buildProgress}%` }}
                    />
                  </div>
                </div>

                {/* Tasks meta + open button */}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-900 text-[10px] text-zinc-600 font-mono mb-3">
                  <span>{completedTasks}/{totalTasks} tarefas concluídas</span>
                  <span className="text-zinc-500">{progressPercent}%</span>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); onSelectProjectFilter(project.id); }}
                  className="w-full flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-zinc-300 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-lg py-2 transition-colors group-hover:border-zinc-700"
                >
                  <span>Abrir Empreendimento</span>
                  <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {projectToDelete && (
        <DeleteProjectDialog
          project={projectToDelete}
          onCancel={() => setProjectToDelete(null)}
          onConfirm={async () => {
            await onDeleteProject(projectToDelete.id);
            setProjectToDelete(null);
            // O formulário podia estar aberto editando justamente este.
            if (editingProjectId === projectToDelete.id) handleCancelForm();
          }}
        />
      )}
    </div>
  );
}
