// Copy da tarefa: briefing, textos (com a aprovação de cada um) e histórico.
import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Task, CopyBriefing } from '../types';
import { useAuth } from '../context/AuthContext';
import { entregaDoTexto, entregaTravada, enviar, htmlEnviado, pendentesSemTexto, rodadasDe, situacaoDe, tudoAprovado } from '../lib/aprovacao';
import { Abas, EditoresTexto } from './tarefa/Abas';
import { FaixaAprovacao, HistoricoAprovacao, IconeSituacao } from './tarefa/Aprovacao';
import { EscolhasBriefing, GrupoBriefing, SecaoBriefing } from './tarefa/Briefing';
import { BOTAO_GHOST, TituloSecao } from './tarefa/Propriedade';
import { listaDe, useBriefing, useDecisoes } from './tarefa/useBriefing';

interface CopyPropertiesProps {
  task: Task;
  saveChange: (updates: Partial<Task>) => void;
  disabled?: boolean;
  /** Cor da classe nos títulos das seções. */
  cor?: string;
  /** Motivo pelo qual ainda não dá para enviar para aprovação. */
  bloqueio?: string;
  /** O conteúdo ainda está vindo do banco: não dá para escrever por cima. */
  carregando?: boolean;
}

const PERFIL_PRIMARIO_OPTIONS = [
  'Investidor pessoa física', 'Investidor pessoa jurídica', 'Família com filhos', 
  'Casal sem filhos', 'Single', 'Aposentado', 'Brasileiros no exterior'
];

const MOMENTO_COMPRA_OPTIONS = [
  '1ª moradia', '2ª moradia / lazer', '1º investimento', 'Portfólio imobiliário', 'Troca de imóvel'
];

const FAIXA_RENDA_OPTIONS = [
  'Classe B', 'Classe B+', 'Classe A', 'Alta renda / patrimônio elevado'
];

const DESEJO_SONHO_OPTIONS = [
  'Segurança e patrimônio duradouro', 'Liberdade financeira / renda passiva',
  'Qualidade de vida e conforto', 'Status e reconhecimento social',
  'Deixar algo para os filhos', 'Aproveitar a vida agora', 'Ter um lar verdadeiro'
];

const OBJECOES_OPTIONS = [
  'Preço alto / momento econômico', 'Medo de a construtora não entregar',
  'Já tentou antes e se frustrou', 'Não sabe se é o momento certo',
  'Cônjuge ainda não está convencido', 'Prefere renda variável (ações, FIIs)',
  'Burocracia e dificuldade de financiamento'
];

const OBJETIVO_MARKETING_OPTIONS = [
  'Gerar leads qualificados', 'Aquecer base existente', 'Lançamento', 'Visita ao decorado',
  'Convidar para evento', 'Gerar interesse / topo de funil', 'Reengajar lead frio'
];

const ETAPA_FUNIL_OPTIONS = [
  'Topo (descoberta)', 'Meio (consideração)', 'Fundo (decisão)'
];

const ACAO_UNICA_OPTIONS = [
  'Preencher formulário (lead)', 'Enviar mensagem no WhatsApp', 'Ligar para o plantão',
  'Agendar visita', 'Salvar / compartilhar o post', 'Assistir ao vídeo completo',
  'Acessar o site / landing page'
];

const TOM_PECA_OPTIONS = [
  'Sofisticado', 'Aspiracional', 'Direto e objetivo', 'Caloroso e próximo', 'Urgência', 
  'Exclusividade', 'Institucional', 'Descontraído'
];

const COMO_MARCA_PERCEBIDA_OPTIONS = [
  'Construtora mais confiável da região', 'Sinônimo de design premium',
  'Entregamos o que prometemos', 'Cuidamos do cliente após a venda',
  'Referência em inovação e qualidade', 'Empresa com propósito e história'
];

const CANAL_VEICULACAO_OPTIONS = [
  'Feed Instagram', 'Stories / Reels', 'Meta Ads (feed)', 'Meta Ads (vídeo)', 
  'WhatsApp', 'E-mail', 'SMS / push', 'Outdoor / OOH', 'Landing page'
];

const FORMATO_PECA_OPTIONS = [
  'Carrossel', 'Post estático', 'Vídeo curto (até 15s)', 'Vídeo longo', 
  'Roteiro de locução', 'Legenda de post'
];

const EXTENSAO_TEXTO_OPTIONS = [
  'Headline (até 10 palavras)', 'Copy curta (1-3 linhas)', 'Copy média (1 parágrafo)', 'Copy longa (múltiplos parágrafos)'
];

type CampoBriefing = Exclude<keyof CopyBriefing, 'isFilled' | 'textoCopy' | 'copyEditors' | 'deliveries'>;

const GRUPOS: { titulo: string; campos: { chave: CampoBriefing; rotulo: string; opcoes: string[] }[] }[] = [
  { titulo: 'Para quem', campos: [
    { chave: 'perfilPrimario', rotulo: 'Perfil primário', opcoes: PERFIL_PRIMARIO_OPTIONS },
    { chave: 'momentoCompra', rotulo: 'Momento de compra', opcoes: MOMENTO_COMPRA_OPTIONS },
    { chave: 'faixaRenda', rotulo: 'Faixa de renda', opcoes: FAIXA_RENDA_OPTIONS },
  ] },
  { titulo: 'Dor e desejo', campos: [
    { chave: 'desejoSonho', rotulo: 'Maior desejo', opcoes: DESEJO_SONHO_OPTIONS },
    { chave: 'objecoes', rotulo: 'Objeções comuns', opcoes: OBJECOES_OPTIONS },
  ] },
  { titulo: 'Objetivo da peça', campos: [
    { chave: 'objetivoMarketing', rotulo: 'Objetivo', opcoes: OBJETIVO_MARKETING_OPTIONS },
    { chave: 'etapaFunil', rotulo: 'Etapa do funil', opcoes: ETAPA_FUNIL_OPTIONS },
    { chave: 'acaoUnica', rotulo: 'Ação única', opcoes: ACAO_UNICA_OPTIONS },
  ] },
  { titulo: 'Tom e voz', campos: [
    { chave: 'tomPeca', rotulo: 'Tom da peça', opcoes: TOM_PECA_OPTIONS },
    { chave: 'comoMarcaPercebida', rotulo: 'Percepção da marca', opcoes: COMO_MARCA_PERCEBIDA_OPTIONS },
  ] },
  { titulo: 'Formato e canal', campos: [
    { chave: 'canalVeiculacao', rotulo: 'Canal', opcoes: CANAL_VEICULACAO_OPTIONS },
    { chave: 'formatoPeca', rotulo: 'Formato', opcoes: FORMATO_PECA_OPTIONS },
    { chave: 'extensaoTexto', rotulo: 'Extensão do texto', opcoes: EXTENSAO_TEXTO_OPTIONS },
  ] },
];
// Duas colunas equilibradas: público e objetivo | tom e formato.
const COLUNAS = [GRUPOS.slice(0, 3), GRUPOS.slice(3)];
const CAMPOS = GRUPOS.flatMap(g => g.campos);
const MAX_TEXTOS = 5;

function formularioDaTarefa(task: Task): CopyBriefing {
  const existing = task.copyBriefing || {} as Partial<CopyBriefing>;
  return {
    ...(Object.fromEntries(CAMPOS.map(c => [c.chave, listaDe(existing[c.chave])])) as Pick<CopyBriefing, CampoBriefing>),
    isFilled: existing.isFilled || false,
    textoCopy: existing.textoCopy || '',
    copyEditors: existing.copyEditors?.length
      ? existing.copyEditors
      // Id fixo: o primeiro texto ainda não existe no banco e não pode mudar de identidade.
      : [{ id: `texto-${task.id}`, name: 'Texto principal', content: existing.textoCopy || '' }],
    deliveries: existing.deliveries || [],
  };
}

const textoCompleto = (editores: { name: string; content: string }[]) => ({
  textoCopy: editores.map(ed => `<h3>${ed.name}</h3>${ed.content}`).join('<br/><hr/><br/>'),
});

const SECOES = { briefing: false, textos: true, historico: false };

export default function CopyProperties({ task, saveChange, cor, bloqueio, disabled = false, carregando = false }: CopyPropertiesProps) {
  const { currentUser } = useAuth();
  const [aberto, setAberto] = useState(SECOES);
  const alternar = (k: keyof typeof aberto) => setAberto(a => ({ ...a, [k]: !a[k] }));
  const [textoAtivo, setTextoAtivo] = useState('');
  // Entrega aberta por uma notificação, até os textos carregarem.
  const [alvo, setAlvo] = useState<string | null>(null);
  // Texto que está sendo enviado: já não pode mudar.
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  const b = useBriefing({
    campo: 'copyBriefing', task, disabled, saveChange, formulario: formularioDaTarefa, derivado: textoCompleto,
    aoTrocarTarefa: () => { setTextoAtivo(''); setAlvo(null); setEnviandoId(null); setAberto(SECOES); },
  });
  const { form, textos, salvando } = b;
  const entregas = form.deliveries || [];
  const { decidir, cancelarEnvio, pedirAprovacao } = useDecisoes<'copyBriefing'>({
    tipo: 'texto', task, gravar: b.gravar,
    nomeDe: entrega => rodadasDe([entrega])[0]?.nome ?? 'Texto',
    tudoAprovado: (deliveries, base) => tudoAprovado(deliveries, base.copyEditors || []),
  });

  useEffect(() => {
    const handleOpenSection = (e: CustomEvent<{ section: string, targetId?: string }>) => {
      if (e.detail.section === 'copyProps' && e.detail.targetId?.startsWith('copy-delivery-')) {
        setAlvo(e.detail.targetId.replace('copy-delivery-', ''));
      }
    };
    window.addEventListener('openTaskSection', handleOpenSection as EventListener);
    return () => window.removeEventListener('openTaskSection', handleOpenSection as EventListener);
  }, []);

  // A aprovação fica junto do texto: abre a aba dele.
  useEffect(() => {
    if (!alvo || !entregas.some(d => d.id === alvo)) return;
    const texto = textos.find(t => entregaDoTexto(entregas, t)?.id === alvo);
    setAberto(a => ({ ...a, textos: true }));
    if (texto) setTextoAtivo(texto.id);
    setAlvo(null);
  }, [alvo, form.deliveries]);

  const entregaPorTexto = new Map(textos.map(t => [t.id, entregaDoTexto(entregas, t)]));
  const travado = (id: string) => enviandoId === id || entregaTravada(entregaPorTexto.get(id));
  const ativo = textos.find(t => t.id === textoAtivo) ?? textos[0];
  const entregaAtiva = ativo && entregaPorTexto.get(ativo.id);
  const preenchidos = CAMPOS.filter(c => listaDe(form[c.chave]).length > 0).length;
  const rodadas = rodadasDe(entregas);
  const rodadaDe = (id?: string) => rodadas.find(r => r.entregaId === id);

  const enviarTexto = async (textoId: string, aprovadorId: string) => {
    const local = textos.find(t => t.id === textoId);
    if (!local || salvando) return;
    // O que está na tela vai junto no envio: o salvamento com atraso não é mais necessário.
    const content = b.textosPendentes.current[textoId] ?? local.content;
    b.cancelarAtraso(textoId);
    setEnviandoId(textoId);
    const ok = await b.gravar(base => {
      const copyEditors = b.mesclarTexto(base, textoId, { content });
      const texto = copyEditors.find(t => t.id === textoId)!;
      const name = texto.name || 'Texto sem nome';
      const envio = enviar(base.deliveries || [], { ...texto, name }, aprovadorId, currentUser);
      if (!envio) return null;
      return {
        partial: { ...b.comTextos(copyEditors), deliveries: envio.entregas },
        taskUpdates: task.status === 'approval' ? {} : { status: 'approval' },
        avisar: () => pedirAprovacao(aprovadorId, envio.id, name),
      };
    });
    if (!b.naTarefa()) return;
    if (ok) { if (b.textosPendentes.current[textoId] === content) delete b.textosPendentes.current[textoId]; }
    else if (textoId in b.textosPendentes.current) b.agendarTexto(textoId, content);
    setEnviandoId(null);
  };

  if (carregando && !task.copyBriefing) return <p role="status" className="text-body text-zinc-500">Carregando a copy…</p>;

  return (
    <div className="flex flex-col gap-8">
      <SecaoBriefing
        cor={cor}
        aberta={aberto.briefing}
        onAlternar={() => alternar('briefing')}
        preenchidos={preenchidos}
        total={CAMPOS.length}
        resumo="Público, objetivo, tom e canal da peça"
        disabled={disabled}
      >
        {COLUNAS.map((grupos, i) => (
          <div key={i} className="flex flex-col gap-6 min-w-0">
            {grupos.map(grupo => (
              <GrupoBriefing key={grupo.titulo} titulo={grupo.titulo}>
                {grupo.campos.map(({ chave, rotulo, opcoes }) => (
                  <EscolhasBriefing
                    key={`${task.id}-${chave}`}
                    rotulo={rotulo}
                    opcoes={opcoes}
                    valores={listaDe(form[chave])}
                    disabled={disabled}
                    onAlternar={op => b.mudarOpcao(chave, op)}
                    onAdicionar={t => b.mudarOpcao(chave, t, true)}
                  />
                ))}
              </GrupoBriefing>
            ))}
          </div>
        ))}
      </SecaoBriefing>

      {/* Textos */}
      <div className="flex flex-col gap-3">
        <TituloSecao
          cor={cor}
          aberta={aberto.textos}
          onAlternar={() => alternar('textos')}
          extra={textos.length > 1 && <span className="text-caption text-zinc-500 tabular-nums">{textos.length}</span>}
          acoes={!disabled && aberto.textos && (
            <button
              type="button"
              onClick={() => setTextoAtivo(b.adicionarTexto(`Texto ${textos.length + 1}`))}
              disabled={textos.length >= MAX_TEXTOS}
              title={textos.length >= MAX_TEXTOS ? `Limite de ${MAX_TEXTOS} textos` : undefined}
              className={BOTAO_GHOST}
            >
              <Plus size={15} aria-hidden /> Adicionar texto
            </button>
          )}
        >
          Textos
        </TituloSecao>
        {aberto.textos && (
          <>
            <Abas
              rotulo={{ grupo: 'Textos da copy', item: 'texto' }}
              itens={textos}
              ativoId={ativo?.id}
              disabled={disabled}
              travado={travado}
              icone={id => <IconeSituacao entrega={entregaPorTexto.get(id)} />}
              onAtivar={setTextoAtivo}
              onRenomear={b.renomearTexto}
            />
            <EditoresTexto
              taskId={task.id}
              briefing={b}
              ativoId={ativo?.id}
              disabled={disabled}
              travado={travado}
              conteudo={t => {
                const entrega = entregaPorTexto.get(t.id);
                return situacaoDe(entrega) === 'pendente' ? htmlEnviado(entrega!) ?? t.content : t.content;
              }}
            />
            {ativo && (
              <FaixaAprovacao
                key={`${task.id}-${ativo.id}-${rodadaDe(entregaAtiva?.id)?.id}-${situacaoDe(entregaAtiva)}`}
                tipo="texto"
                cor={cor}
                nome={ativo.name || 'Texto sem nome'}
                entrega={entregaAtiva}
                rodada={rodadaDe(entregaAtiva?.id)}
                bloqueio={bloqueio}
                vazio={!ativo.content.replace(/<[^>]*>|&nbsp;/g, '').trim()}
                disabled={disabled}
                salvando={salvando}
                solicitanteId={task.assigneeId}
                onEnviar={id => void enviarTexto(ativo.id, id)}
                onDecidir={(decisao, motivo) => decidir(entregaAtiva!.id, decisao, motivo)}
                onCancelar={() => cancelarEnvio(entregaAtiva!.id)}
              />
            )}
            {b.erro && <p role="alert" className="text-body text-red-400">{b.erro}</p>}
          </>
        )}
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
        {/* Aprovações antigas cujo texto foi excluído ou renomeado: a decisão não fica escondida. */}
        {pendentesSemTexto(entregas, textos).map(d => (
          <div key={d.id} className="flex flex-col gap-1 p-3 rounded-xl border border-zinc-800">
            <p className="text-body font-medium text-zinc-200">{rodadaDe(d.id)?.nome}</p>
            <FaixaAprovacao
              tipo="texto"
              nome={rodadaDe(d.id)?.nome ?? 'Texto'}
              entrega={d}
              rodada={rodadaDe(d.id)}
              disabled={disabled}
              salvando={salvando}
              solicitanteId={task.assigneeId}
              onDecidir={(decisao, motivo) => decidir(d.id, decisao, motivo)}
              onCancelar={() => cancelarEnvio(d.id)}
            />
          </div>
        ))}
        {aberto.historico && <HistoricoAprovacao tipo="texto" rodadas={rodadas} />}
      </div>
    </div>
  );
}
