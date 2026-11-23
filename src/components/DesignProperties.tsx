// Design da tarefa: briefing, textos da peça, criativos (com a aprovação de cada um) e histórico.
import React, { useEffect, useState } from 'react';
import { ExternalLink, FileInput, Plus, Trash2, X } from 'lucide-react';
import { CopyEditorItem, Delivery, DesignBriefing, Task } from '../types';
import ConfirmModal from './ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { fetchTaskBriefings } from '../lib/api';
import { criativosAprovados, editarCriativo, entregaDoTexto, enviarCriativo, entregaTravada, imagensDe, rodadasDe, situacaoDe } from '../lib/aprovacao';
import { uploadDeliveryImages } from '../lib/deliveryImages';
import { Abas, EditoresTexto } from './tarefa/Abas';
import { HistoricoAprovacao, IconeSituacao } from './tarefa/Aprovacao';
import { EscolhasBriefing, LinhaBriefing, SecaoBriefing, TextoBriefing } from './tarefa/Briefing';
import Criativo from './tarefa/Criativo';
import { BOTAO_BORDA, BOTAO_GHOST, BOTAO_ICONE, CAMPO, FOCO, ItemMenu, Menu, TituloSecao } from './tarefa/Propriedade';
import { listaDe, useBriefing, useDecisoes } from './tarefa/useBriefing';

interface DesignPropertiesProps {
  task: Task;
  allTasks?: Task[];
  saveChange: (updates: Partial<Task>) => void;
  /** Cor da classe nos títulos das seções. */
  cor?: string;
  disabled?: boolean;
  /** Motivo pelo qual ainda não dá para enviar para aprovação. */
  bloqueio?: string;
  /** O conteúdo ainda está vindo do banco: não dá para escrever por cima. */
  carregando?: boolean;
}

const OBJETIVOS_OPTIONS = [
  'Gerar Leads', 'Gerar Interesse', 'Visitas ao stand', 'Apresentação institucional',
  'Lançamento de Produto', 'Engajamento', 'Reforço de marca', 'Convidar',
  'Divulgar Promoção', 'Comunicado'
];

const TIPO_PECA_OPTIONS = [
  'Feed', 'Stories', 'Banner site', 'Vídeo', 'Landing page',
  'Cartão', 'Impresso', 'E-mail marketing', 'Apresentação', 'Anúncio Meta', 'Anúncio Google'
];

const FORMATOS_DINAMICOS: Record<string, string[]> = {
  "Feed": [
    "1:1 (Quadrado) - 1080x1080px",
    "4:5 (Retrato) - 1080x1350px",
    "16:9 (Paisagem) - 1080x566px"
  ],
  "Stories": [
    "9:16 (Vertical) - 1080x1920px"
  ],
  "Cartão": [
    "Físico Padrão - 9x5cm",
    "Físico Europeu - 8.5x5.5cm",
    "Digital Interativo - 1080x1920px"
  ],
  "Anúncio Meta": [
    "Feed/Carrossel (1:1) - 1080x1080px",
    "Feed Vídeo/Imagem (4:5) - 1080x1350px",
    "Stories/Reels/Audience Network (9:16) - 1080x1920px",
    "Resultados de Pesquisa/In-Stream (1.91:1) - 1200x628px"
  ],
  "Anúncio Google": [
    "Retângulo Médio - 300x250px",
    "Retângulo Grande - 336x280px",
    "Leaderboard - 728x90px",
    "Leaderboard para celular - 320x50px",
    "Arranha-céu Largo - 160x600px",
    "Arranha-céu Inteligente - 300x600px",
    "Outdoor - 970x250px",
    "Banner para Vídeo (YouTube) - 300x60px",
    "Quadrado Padrão - 250x250px"
  ],
  "Banner site": [
    "Hero Desktop - 1920x1080px",
    "Mobile - 360x640px"
  ],
  "Landing page": [
    "Hero Desktop - 1920x1080px",
    "Mobile - 360x640px"
  ],
  "Vídeo": [
    "Quadrado (1:1) - 1080x1080px",
    "Vertical (9:16) - 1080x1920px",
    "Paisagem (16:9) - 1920x1080px",
    "Stories/Reels (9:16) - 1080x1920px",
    "YouTube (16:9) - 1920x1080px"
  ],
  "Impresso": [
    "A4 - 210x297mm",
    "A3 - 297x420mm",
    "A5 - 148x210mm",
    "Flyer - 150x210mm",
    "Banner Roll-up - 800x2000mm",
    "Outdoor - 9000x3000mm"
  ],
  "E-mail marketing": [
    "Desktop - 600px de largura",
    "Mobile - 320px de largura"
  ]
};

// Peças em que a direção de foco faz sentido.
const DIRECAO_FOCO_PIECES = ['Landing page', 'E-mail marketing', 'Banner site'];

const DIRECAO_FOCO_OPTIONS = [
  'Mobile First', 'Desktop First', 'Responsivo (ambos)', 'App'
];

const DIRECAO_CRIATIVA_OPTIONS = [
  'Institucional', 'Corporativo', 'Sofisticado', 'Luxo', 'Imponente', 'Lifestyle',
  'Aspiracional', 'Familiar', 'Comercial', 'Conversão', 'Oferta', 'Urgência',
  'Visual Leve', 'Técnico', 'Chamativo', 'Dramático'
];

function formularioDaTarefa(task: Task): DesignBriefing {
  const b = task.designBriefing || {} as Partial<DesignBriefing>;
  return {
    ...b,
    isFilled: b.isFilled || false,
    objetivos: listaDe(b.objetivos),
    tipoPeca: listaDe(b.tipoPeca),
    formatosEspecificos: b.formatosEspecificos || {},
    formatosPersonalizados: b.formatosPersonalizados || {},
    mensagemPrincipal: b.mensagemPrincipal || '',
    direcaoCriativa: listaDe(b.direcaoCriativa),
    direcaoFoco: listaDe(b.direcaoFoco),
    inspiracoes: listaDe(b.inspiracoes).filter(s => s.trim()),
    copyContent: b.copyContent || '',
    copyEditors: b.copyEditors?.length ? b.copyEditors
      : b.copyContent ? [{ id: 'legacy-copy', name: 'Copy', content: b.copyContent }] : [],
    deliveries: b.deliveries || [],
  };
}

// O primeiro texto também fica no campo antigo, que outras telas leem.
const primeiroTexto = (textos: CopyEditorItem[]) => ({ copyContent: textos[0]?.content || '' });
const temTexto = (html: string) => !!html.replace(/<[^>]*>|&nbsp;/g, '').trim();
const nomeDoCriativo = (d: Delivery, entregas: Delivery[]) => d.name || `Criativo ${Math.max(0, entregas.findIndex(e => e.id === d.id)) + 1}`;
const novoCriativo = (id: string): Delivery => ({ id, status: 'draft', thread: [], createdAt: new Date().toISOString() });

const SECOES = { briefing: false, textos: true, criativos: true, historico: false };

export default function DesignProperties({ task, allTasks = [], saveChange, cor, bloqueio, disabled = false, carregando = false }: DesignPropertiesProps) {
  const { currentUser } = useAuth();
  const [aberto, setAberto] = useState(SECOES);
  const alternar = (k: keyof typeof aberto) => setAberto(a => ({ ...a, [k]: !a[k] }));
  const [textoAtivo, setTextoAtivo] = useState('');
  const [criativoAtivo, setCriativoAtivo] = useState('');
  const [excluindo, setExcluindo] = useState<{ tipo: 'texto' | 'criativo'; id: string; nome: string } | null>(null);
  // Entrega aberta por uma notificação, até os criativos carregarem.
  const [alvo, setAlvo] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  const b = useBriefing({
    campo: 'designBriefing', task, disabled, saveChange, formulario: formularioDaTarefa, derivado: primeiroTexto,
    prepararEntregas: async (id, entregas) => (await uploadDeliveryImages(id, entregas)) ?? entregas,
    aoTrocarTarefa: () => { setTextoAtivo(''); setCriativoAtivo(''); setExcluindo(null); setAlvo(null); setEnviandoId(null); setAberto(SECOES); },
  });
  const { form, textos, salvando } = b;
  const { decidir, cancelarEnvio, pedirAprovacao } = useDecisoes<'designBriefing'>({
    tipo: 'criativo', task, gravar: b.gravar, nomeDe: nomeDoCriativo, tudoAprovado: criativosAprovados,
  });

  useEffect(() => {
    const abrir = (e: CustomEvent<{ section: string, targetId?: string }>) => {
      if (e.detail.section === 'designProps' && e.detail.targetId?.startsWith('design-delivery-')) {
        setAlvo(e.detail.targetId.replace('design-delivery-', ''));
      }
    };
    window.addEventListener('openTaskSection', abrir as EventListener);
    return () => window.removeEventListener('openTaskSection', abrir as EventListener);
  }, []);

  // A aprovação fica junto do criativo: abre a aba dele.
  useEffect(() => {
    if (!alvo || !form.deliveries?.some(d => d.id === alvo)) return;
    setAberto(a => ({ ...a, criativos: true }));
    setCriativoAtivo(alvo);
    setAlvo(null);
  }, [alvo, form.deliveries]);

  // ── Briefing ──
  const formatos = form.formatosEspecificos || {};
  const mudarFormato = (peca: string, formato: string, soAdicionar = false) => {
    const todos = b.atual('formatosEspecificos') || {};
    const lista = listaDe(todos[peca]);
    if (soAdicionar && lista.includes(formato)) return;
    b.mudarCampos({ formatosEspecificos: { ...todos, [peca]: lista.includes(formato) ? lista.filter(f => f !== formato) : [...lista, formato] } });
  };
  // Medida dos briefings antigos, guardada à parte.
  const mostrarFormato = (peca: string) => (f: string) => {
    const m = form.formatosPersonalizados?.[peca];
    return f === 'Personalizado' && m?.width && m?.height ? `${m.width} x ${m.height} ${m.unit}` : f;
  };
  const comFoco = form.tipoPeca.some(p => DIRECAO_FOCO_PIECES.includes(p)) || listaDe(form.direcaoFoco).length > 0;
  const inspiracoes = form.inspiracoes || [];
  const camposPreenchidos = [
    form.objetivos.length > 0, !!form.mensagemPrincipal.trim(), form.direcaoCriativa.length > 0, form.tipoPeca.length > 0, inspiracoes.length > 0,
    ...(comFoco ? [listaDe(form.direcaoFoco).length > 0] : []),
  ];
  const escolhas = (chave: 'objetivos' | 'direcaoCriativa' | 'direcaoFoco' | 'tipoPeca', rotulo: string, opcoes: string[]) => (
    <EscolhasBriefing
      key={`${task.id}-${chave}`}
      rotulo={rotulo}
      opcoes={opcoes}
      valores={listaDe(form[chave])}
      disabled={disabled}
      onAlternar={op => b.mudarOpcao(chave, op)}
      onAdicionar={t => b.mudarOpcao(chave, t, true)}
    />
  );

  // ── Textos ──
  const textoAberto = textos.find(t => t.id === textoAtivo) ?? textos[0];
  const tarefasDeCopy = allTasks.filter(t =>
    t.labels.some(l => l.name === 'Copy') && (t.parentTaskId === task.id || (task.parentTaskId && t.id === task.parentTaskId)));
  const importar = tarefasDeCopy.length > 0 && !disabled && (
    <Menu
      rotulo="Importar texto de uma tarefa de Copy"
      largura="w-80"
      alinhar="right"
      classe={BOTAO_GHOST}
      gatilho={<><FileInput size={15} aria-hidden /> Importar copy</>}
    >
      {fechar => <TextosDeCopy tarefas={tarefasDeCopy} onEscolher={t => { fechar(); setAberto(a => ({ ...a, textos: true })); setTextoAtivo(b.adicionarTexto(t.name || 'Copy', t.content)); }} />}
    </Menu>
  );
  const adicionarTexto = () => { setAberto(a => ({ ...a, textos: true })); setTextoAtivo(b.adicionarTexto(`Texto ${textos.length + 1}`)); };

  // ── Criativos ──
  // Sem nenhum criativo, um rascunho local já aparece pronto; só vai ao banco quando recebe algo.
  const entregas = form.deliveries?.length ? form.deliveries : disabled ? [] : [novoCriativo(`criativo-${task.id}`)];
  const criativo = entregas.find(d => d.id === criativoAtivo)
    ?? entregas.find(d => situacaoDe(d) === 'pendente' && d.approverId === currentUser?.id)
    ?? entregas[0];
  const rodadas = rodadasDe(entregas, d => nomeDoCriativo(d, entregas));
  const rodadaDe = (id?: string) => rodadas.find(r => r.entregaId === id);
  const enviados = entregas.filter(d => imagensDe(d).length > 0);

  const comCriativo = (lista: Delivery[], id: string) =>
    lista.some(d => d.id === id) ? lista : [...lista, entregas.find(d => d.id === id) ?? novoCriativo(id)];

  const mudarCriativo = (id: string, mudar: (d: Delivery) => Partial<Delivery>) => {
    b.setForm(prev => ({ ...prev, deliveries: editarCriativo(comCriativo(prev.deliveries || [], id), id, mudar) ?? prev.deliveries }));
    void b.salvar(base => {
      // Enviado em outra tela: vale o que foi enviado.
      const deliveries = editarCriativo(comCriativo(base.deliveries || [], id), id, mudar);
      return deliveries ? { deliveries } : {};
    });
  };

  const adicionarCriativo = () => {
    const novo = novoCriativo(Date.now().toString());
    const atuais = entregas;
    const juntar = (lista: Delivery[]) => [...(lista.length ? lista : atuais), novo];
    setAberto(a => ({ ...a, criativos: true }));
    setCriativoAtivo(novo.id);
    b.setForm(prev => ({ ...prev, deliveries: juntar(prev.deliveries || []) }));
    void b.salvar(base => ({ deliveries: juntar(base.deliveries || []) }));
  };

  const excluirCriativo = (id: string) => {
    // Só rascunhos: o que já foi enviado fica no histórico.
    const sem = (lista: Delivery[]) => lista.filter(d => d.id !== id || d.status !== 'draft');
    b.setForm(prev => ({ ...prev, deliveries: sem(prev.deliveries || []) }));
    void b.salvar(base => ({ deliveries: sem(base.deliveries || []) }));
  };

  const enviar = async (id: string, aprovadorId: string) => {
    if (salvando) return;
    setEnviandoId(id);
    await b.gravar(base => {
      const deliveries = enviarCriativo(comCriativo(base.deliveries || [], id), id, aprovadorId, currentUser);
      if (!deliveries) return null;
      const nome = nomeDoCriativo(deliveries.find(d => d.id === id)!, deliveries);
      return {
        partial: { deliveries },
        taskUpdates: task.status === 'approval' ? {} : { status: 'approval' },
        avisar: () => pedirAprovacao(aprovadorId, id, nome),
      };
    });
    if (b.naTarefa()) setEnviandoId(null);
  };

  if (carregando && !task.designBriefing) return <p role="status" className="text-body text-zinc-500">Carregando o design…</p>;

  return (
    <div className="flex flex-col gap-8">
      <SecaoBriefing
        cor={cor}
        aberta={aberto.briefing}
        onAlternar={() => alternar('briefing')}
        preenchidos={camposPreenchidos.filter(Boolean).length}
        total={camposPreenchidos.length}
        resumo="Objetivo, mensagem, direção criativa e peças"
        disabled={disabled}
      >
        <div className="flex flex-col gap-2 min-w-0">
          {escolhas('objetivos', 'Objetivo', OBJETIVOS_OPTIONS)}
          <TextoBriefing
            rotulo="Mensagem principal"
            valor={form.mensagemPrincipal}
            placeholder="Escrever"
            disabled={disabled}
            onMudar={t => b.mudarCampos({ mensagemPrincipal: t })}
          />
          {escolhas('direcaoCriativa', 'Direção criativa', DIRECAO_CRIATIVA_OPTIONS)}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          {escolhas('tipoPeca', 'Tipo da peça', TIPO_PECA_OPTIONS)}
          {form.tipoPeca.map(peca => (
            <EscolhasBriefing
              key={`${task.id}-${peca}`}
              rotulo={`Formato · ${peca}`}
              opcoes={FORMATOS_DINAMICOS[peca] || []}
              valores={listaDe(formatos[peca])}
              mostrar={mostrarFormato(peca)}
              disabled={disabled}
              onAlternar={f => mudarFormato(peca, f)}
              onAdicionar={f => mudarFormato(peca, f, true)}
            />
          ))}
          {comFoco && escolhas('direcaoFoco', 'Direção de foco', DIRECAO_FOCO_OPTIONS)}
          <LinhaBriefing rotulo="Inspirações">
            <div className="flex flex-col gap-1 min-w-0">
              {inspiracoes.map((url, i) => (
                <div key={url + i} className="flex items-center gap-1 min-w-0">
                  <a href={/^https?:\/\//i.test(url) ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" title={url} className={`min-w-0 min-h-8 inline-flex items-center gap-1.5 text-body text-zinc-200 hover:text-blue-400 rounded ${FOCO}`}>
                    <ExternalLink size={14} className="shrink-0 text-zinc-500" aria-hidden />
                    <span className="truncate">{url.replace(/^https?:\/\/(www\.)?/i, '')}</span>
                  </a>
                  {!disabled && (
                    <button type="button" aria-label={`Remover inspiração ${i + 1}`} title="Remover" onClick={() => b.mudarCampos({ inspiracoes: inspiracoes.filter((_, n) => n !== i) })} className={`${BOTAO_ICONE} !size-7`}>
                      <X size={14} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {disabled ? inspiracoes.length === 0 && <span className="min-h-8 flex items-center text-body text-zinc-500">—</span> : (
                <input
                  key={`${task.id}-${inspiracoes.length}`}
                  onBlur={e => { const url = e.target.value.trim(); if (url) b.mudarCampos({ inspiracoes: [...inspiracoes, url] }); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  placeholder={inspiracoes.length ? 'Colar outro link' : 'Colar um link'}
                  aria-label="Adicionar inspiração"
                  className={`${CAMPO} h-9 [@media(pointer:coarse)]:h-10`}
                />
              )}
            </div>
          </LinhaBriefing>
        </div>
      </SecaoBriefing>

      {/* Textos da peça */}
      <div className="flex flex-col gap-3">
        <TituloSecao
          cor={cor}
          aberta={aberto.textos}
          onAlternar={() => alternar('textos')}
          extra={textos.length > 1 && <span className="text-caption text-zinc-500 tabular-nums">{textos.length}</span>}
          acoes={!disabled && aberto.textos && textos.length > 0 && <>
            {importar}
            <button type="button" onClick={adicionarTexto} className={BOTAO_GHOST}><Plus size={15} aria-hidden /> Adicionar texto</button>
          </>}
        >
          Textos da peça
        </TituloSecao>
        {aberto.textos && (textos.length === 0 ? (
          disabled ? <p className="text-body text-zinc-500">Nenhum texto.</p> : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-xl border border-dashed border-zinc-700">
              <button type="button" onClick={adicionarTexto} className={BOTAO_BORDA}><Plus size={15} aria-hidden /> Adicionar texto</button>
              {importar}
              <span className="text-body text-zinc-500">O que vai escrito na arte</span>
            </div>
          )
        ) : <>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <Abas rotulo={{ grupo: 'Textos da peça', item: 'texto' }} itens={textos} ativoId={textoAberto?.id} disabled={disabled} onAtivar={setTextoAtivo} onRenomear={b.renomearTexto} />
            </div>
            {!disabled && textoAberto && (
              <button
                type="button"
                onClick={() => (temTexto(textoAberto.content) ? setExcluindo({ tipo: 'texto', id: textoAberto.id, nome: textoAberto.name }) : b.removerTexto(textoAberto.id))}
                aria-label={`Excluir ${textoAberto.name || 'texto'}`}
                title="Excluir texto"
                className={`${BOTAO_ICONE} hover:!text-red-400`}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            )}
          </div>
          <EditoresTexto taskId={task.id} briefing={b} ativoId={textoAberto?.id} disabled={disabled} />
        </>)}
      </div>

      {/* Criativos */}
      <div className="flex flex-col gap-3">
        <TituloSecao
          cor={cor}
          aberta={aberto.criativos}
          onAlternar={() => alternar('criativos')}
          extra={enviados.length > 1 && <span className="text-caption text-zinc-500 tabular-nums">{enviados.length}</span>}
          acoes={!disabled && aberto.criativos && (
            <button type="button" onClick={adicionarCriativo} className={BOTAO_GHOST}><Plus size={15} aria-hidden /> Adicionar criativo</button>
          )}
        >
          Criativos
        </TituloSecao>
        {aberto.criativos && (!criativo ? <p className="text-body text-zinc-500">Nenhum criativo.</p> : <>
          <Abas
            rotulo={{ grupo: 'Criativos', item: 'criativo' }}
            itens={entregas.map(d => ({ id: d.id, name: nomeDoCriativo(d, entregas) }))}
            ativoId={criativo.id}
            disabled={disabled}
            travado={id => enviandoId === id || entregaTravada(entregas.find(d => d.id === id))}
            icone={id => <IconeSituacao entrega={entregas.find(d => d.id === id)} />}
            onAtivar={setCriativoAtivo}
            onRenomear={(id, name) => mudarCriativo(id, () => ({ name }))}
          />
          <Criativo
            key={`${task.id}-${criativo.id}-${rodadaDe(criativo.id)?.id}-${situacaoDe(criativo)}`}
            taskId={task.id}
            nome={nomeDoCriativo(criativo, entregas)}
            criativo={criativo}
            rodada={rodadaDe(criativo.id)}
            cor={cor}
            bloqueio={bloqueio}
            disabled={disabled}
            salvando={salvando}
            enviando={enviandoId === criativo.id}
            solicitanteId={task.assigneeId}
            onMudar={mudar => mudarCriativo(criativo.id, mudar)}
            onExcluir={criativo.status === 'draft' && form.deliveries?.some(d => d.id === criativo.id)
              ? () => setExcluindo({ tipo: 'criativo', id: criativo.id, nome: nomeDoCriativo(criativo, entregas) })
              : undefined}
            onEnviar={id => void enviar(criativo.id, id)}
            onDecidir={(decisao, motivo, anotadas) => decidir(criativo.id, decisao, motivo, anotadas)}
            onCancelar={() => cancelarEnvio(criativo.id)}
          />
          {b.erro && <p role="alert" className="text-body text-red-400">{b.erro}</p>}
        </>)}
      </div>

      {/* Histórico de aprovação */}
      <div className="flex flex-col gap-3">
        <TituloSecao
          cor={cor}
          aberta={aberto.historico}
          onAlternar={() => alternar('historico')}
          extra={rodadas.length > 0 && <span className="text-caption text-zinc-500 tabular-nums">{rodadas.length}</span>}
        >
          Histórico de aprovação
        </TituloSecao>
        {aberto.historico && <HistoricoAprovacao tipo="criativo" rodadas={rodadas} />}
      </div>

      <ConfirmModal
        isOpen={!!excluindo}
        title={excluindo?.tipo === 'texto' ? 'Excluir texto?' : 'Excluir criativo?'}
        message={`“${excluindo?.nome}” será excluído. Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        onConfirm={() => {
          if (excluindo?.tipo === 'texto') b.removerTexto(excluindo.id);
          else if (excluindo) excluirCriativo(excluindo.id);
          setExcluindo(null);
        }}
        onCancel={() => setExcluindo(null)}
      />
    </div>
  );
}

/** Textos das tarefas de Copy ligadas a esta. O conteúdo não vem na listagem: é lido ao abrir. */
function TextosDeCopy({ tarefas, onEscolher }: { tarefas: Task[]; onEscolher: (texto: CopyEditorItem) => void }) {
  const [grupos, setGrupos] = useState<{ tarefa: Task; textos: CopyEditorItem[]; entregas: Delivery[] }[] | null>(null);

  useEffect(() => {
    let ativo = true;
    void Promise.all(tarefas.map(async tarefa => {
      const copy = (await fetchTaskBriefings(tarefa.id).catch(() => null))?.copyBriefing ?? tarefa.copyBriefing;
      return { tarefa, textos: (copy?.copyEditors || []).filter(t => temTexto(t.content)), entregas: copy?.deliveries || [] };
    })).then(g => { if (ativo) setGrupos(g.filter(x => x.textos.length > 0)); });
    return () => { ativo = false; };
  }, []);

  if (!grupos) return <p role="status" className="px-2 py-1.5 text-body text-zinc-500">Carregando…</p>;
  if (grupos.length === 0) return <p className="px-2 py-1.5 text-body text-zinc-500">Nenhum texto escrito nas tarefas de Copy ligadas.</p>;
  return (
    <>
      {grupos.map(({ tarefa, textos, entregas }) => (
        <div key={tarefa.id} className="flex flex-col">
          <p className="px-2 pt-1 pb-1.5 text-caption text-zinc-500 truncate">{tarefa.title}</p>
          {textos.map(t => (
            <ItemMenu key={t.id} onClick={() => onEscolher(t)}>
              <span className="min-w-0 truncate">{t.name || 'Texto sem nome'}</span>
              <span className="ml-auto"><IconeSituacao entrega={entregaDoTexto(entregas, t)} /></span>
            </ItemMenu>
          ))}
        </div>
      ))}
    </>
  );
}
