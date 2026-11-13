export type TaskStatus = 'no_forecast' | 'todo' | 'in_progress' | 'paused' | 'approval' | 'rework' | 'implementation' | 'done';

export type TaskPriority = 'no_priority' | 'low' | 'medium' | 'high' | 'urgent';

export interface StatusHistoryEntry {
  status: TaskStatus;
  enteredAt: string; // ISO date
  leftAt?: string; // ISO date
}

export interface Label {
  id: string;
  name: string;
  color: string; // Tailwind color class or hex (e.g., 'bg-blue-500/10 text-blue-500')
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  canceled?: boolean;
  reminderDate?: string;
  reminderType?: '3h' | '1d' | 'custom' | 'seen';
  assigneeId?: string;
  level?: number;
  completedAt?: string; // ISO timestamp do último check (concluído ou cancelado)
}

export interface FormatoPersonalizado {
  width: string;
  height: string;
  unit: string;
}

export interface DeliveryThreadMessage {
  id: string;
  role: 'designer' | 'manager';
  type: 'submission' | 'feedback' | 'reply' | 'chat';
  action?: 'approved' | 'rejected' | 'request_review' | 'will_rework';
  content: string;
  imageUrl?: string;
  imageUrls?: string[]; // Suporte para múltiplas imagens
  annotatedImageUrl?: string;
  annotatedImageUrls?: string[];
  // Em submissions de copy: o HTML do editor. Em mensagens de chat: o trecho
  // citado, quando o comentário responde a uma seleção do texto.
  copyText?: string;
  editorName?: string;
  copyEditorId?: string;
  authorId?: string;
  authorName?: string;
  majorVersion?: number; // X in X.Y
  minorVersion?: number; // Y in X.Y
  revisionNumber?: number; // Legacy
  createdAt: string;
  resolved?: boolean;
}

export interface Delivery {
  id: string;
  imageUrl?: string; // URL do print original ou mais recente
  imageUrls?: string[]; // Múltiplos prints do criativo
  thumbnailUrl?: string; // URL comprimida (para histórico apos 30 dias)
  figmaLink?: string;
  creativeDefense?: string; // Legacy
  status: 'pending' | 'approved' | 'rejected' | 'reworking' | 'review_requested';
  rejectedFeedback?: string; // Legacy
  annotatedImageUrl?: string; // Legacy
  annotatedImageUrls?: string[]; // Multiple annotated images
  thread: DeliveryThreadMessage[];
  createdAt: string; // Usado para a política de retenção
  approverId?: string; // Aprovador do criativo
}

export interface DesignBriefing {
  isFilled: boolean;
  objetivos: string[];
  tipoPeca: string[];
  formatosEspecificos?: Record<string, string[]>;
  formatosPersonalizados?: Record<string, FormatoPersonalizado>;
  mensagemPrincipal: string;
  direcaoCriativa: string[];
  direcaoFoco?: string[];
  inspiracoes?: string[];
  copyContent?: string;
  copyEditors?: CopyEditorItem[];
  deliveries?: Delivery[];
}

export interface CopyEditorItem {
  id: string;
  name: string;
  content: string;
}

export interface CopyBriefing {
  isFilled: boolean;
  perfilPrimario: string[];
  momentoCompra: string[];
  faixaRenda: string[];
  desejoSonho: string[];
  objecoes: string[];
  objetivoMarketing: string[];
  etapaFunil: string[];
  acaoUnica: string[];
  tomPeca: string[];
  comoMarcaPercebida: string[];
  canalVeiculacao: string[];
  formatoPeca: string[];
  extensaoTexto: string[];
  textoCopy?: string;
  copyEditors?: CopyEditorItem[];
  deliveries?: Delivery[];
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: number;
  isLink?: boolean;
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  approverId?: string;
}

export interface ProposalComment {
  id: string;
  userId?: string;
  userName?: string;
  content: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  resolved?: boolean;
  resolvedBy?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  actorId: string;
  taskId?: string;
  siengeTitleId?: string;
  type: 'task_assigned' | 'task_deleted' | 'status_changed' | 'assignee_replaced' | 'properties_changed' | 'feedback_received' | 'rejected' | 'review_requested' | 'approved' | 'reminder' | 'deadline' | 'deadline_changed' | 'deadline_change_requested' | 'deadline_change_rejected' | 'approval_pending' | 'chat_mention' | 'alcada_pending';
  status: 'unread' | 'read' | 'viewed' | 'postponed' | 'important';
  createdAt: string;
  viewedAt?: string;
  postponedUntil?: string;
  message: string;
  details?: string;
  targetId?: string;
}

export interface Proposal {
  id: string;
  empresa: string;
  valor: string;
  negociado: string;
  // Campo legado de link único. Mantido por compatibilidade com propostas antigas;
  // novos links vão para `documentos`. Use o helper docLinks() para ler os dois juntos.
  documento: string;
  // Múltiplos links/documentos e prints anexados (URLs no Storage).
  documentos?: string[];
  imagens?: string[];
  observacao: string;
  valorUnitario?: string;
  valorM2?: string;
  valorMensal?: string;
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  approverId?: string;
  comments?: ProposalComment[];
}

export type BudgetDecisionStatus = 'pending' | 'approved' | 'rejected' | 'rework';

export interface BudgetProposalDecision {
  proposalId: string;
  status: BudgetDecisionStatus;
  // Justificativa exigida em 'rejected' e 'rework'.
  note?: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface BudgetApprovalRound {
  id: string;
  proposalIds: string[];
  approverId: string;
  requesterId?: string;
  decisions: BudgetProposalDecision[];
  createdAt: string;
  resolvedAt?: string;
}

export interface PlanningBriefing {
  text: string;
  attachments: Attachment[];
  objetivosPrincipais?: string[];
  objetivoAberto?: string;
  motivacoes?: string[];
  motivacaoAberta?: string;
  campanhaConectada?: string;
  publicoAlvo?: string[];
  nivelConhecimento?: string[];
  isFilled?: boolean;
}

export interface SocialMediaApprovalData {
  selectedDesignDeliveryId?: string;
  selectedDesignTaskId?: string;
  selectedCopyEditorId?: string;
  selectedCopyTaskId?: string;
  /** 'approved' usa a entrega de Design aprovada; 'custom' usa o print enviado aqui. */
  imageSource?: 'approved' | 'custom';
  /** Prints enviados direto no painel (links do Storage, nunca base64). */
  customImageUrls?: string[];
  /** Link externo do arquivo final (Drive, Dropbox, etc). */
  customImageFileLink?: string;
  /** 'approved' usa o editor de Copy filho; 'custom' usa o texto escrito aqui. */
  copySource?: 'approved' | 'custom';
  /** HTML do copy escrito direto no painel. */
  customCopy?: string;
  status?: 'pending' | 'review_requested' | 'approved' | 'rejected';
  approverId?: string;
  requesterId?: string;
  /** Agenda da publicação (módulo Rede Social). A data é o prazo da tarefa. */
  canal?: string;
  formato?: string;
  /** 'HH:mm' */
  horario?: string;
}

export interface TaskTimeTracking {
  accumulatedMs: number;
  lastStartedAt?: string;
  isTimerRunning: boolean;
  reachedImplementationAt?: string;
}

export interface RoutineConfig {
  active: boolean;
  type: 'interval' | 'weekdays';
  intervalValue?: number; // X for days, weeks, or months
  intervalUnit?: 'days' | 'weeks' | 'months';
  weekdays?: number[]; // [1, 2, 3, 4, 5] (Monday to Friday, using 1-7 or 0-6 convention. We'll use 1=Monday...5=Friday)
  lastDuplicatedAt?: string; // ISO date of last duplication
  originalSnapshot?: any; // Snapshot of the task when routine was activated
}

export interface Task {
  id: string; // Internal UUID
  taskCode?: string; // Visual display code (e.g., TSK-123)
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  updatedBy?: string; // Tracks the user who last modified the task
  labels: Label[];
  subtasks: Subtask[];
  attachments?: Attachment[];
  designBriefing?: DesignBriefing;
  copyBriefing?: CopyBriefing;
  planningBriefing?: PlanningBriefing;
  socialMediaApproval?: SocialMediaApprovalData;
  proposals?: Proposal[];
  budgetApprovals?: BudgetApprovalRound[];
  chatMessages?: ChatMessage[];
  dueDate?: string; // ISO date format like '2026-06-20'
  createdAt: string;
  assigneeId?: string;
  parentTaskId?: string;
  hierarchyOrder?: number;
  isPrivate?: boolean;
  reminderDate?: string;
  reminderType?: '3h' | '1d' | 'custom' | 'seen';
  timeTracking?: TaskTimeTracking;
  reworkCount?: number;
  statusHistory?: StatusHistoryEntry[];
  updatedAt?: string;
  routine?: RoutineConfig;
  routineOriginId?: string;
  pendingDeadlineChange?: PendingDeadlineChange | null;
}

export interface PendingDeadlineChange {
  requestedDueDate: string | null; // null = pedido para remover o prazo
  previousDueDate?: string | null;
  reason: string;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
}

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string; // e.g., 'text-purple-500' or hex
  status: 'active' | 'completed' | 'on_hold';
  coverImage?: string | null;
  code?: string | null;
  buildProgress?: number | null; // 0-100, evolução da obra
  // Empreendimento de terceiros (não é da incorporadora). Chega ao payload
  // público da Tabela Corretor para a página se apresentar de outro jeito.
  terceiros?: boolean;
}

export type UserDocumentKind = 'link' | 'note' | 'document';

// Item particular do usuário na seção "Meus Documentos" da Home.
export interface UserDocument {
  id: string;
  userId: string;
  kind: UserDocumentKind;
  title: string;
  url?: string;      // link externo ou URL pública do arquivo no Storage
  content?: string;  // HTML da anotação
  fileName?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export type ViewType = 'home' | 'crm' | 'inbox' | 'tasks_board' | 'tasks_list' | 'projects' | 'calendar' | 'settings' | 'sienge' | 'comercial' | 'dashboard' | 'rede_social';

export type SiengeStatus = 'a_lancar' | 'aprovacao_1' | 'aprovacao_2' | 'aprovacao_3' | 'aguardando_pagamento' | 'recusados' | 'pago';

export interface SiengeAlcadaConfig {
  alcada1UserId?: string;
  alcada2UserId?: string;
  alcada3UserId?: string;
}

/**
 * Integração WhatsApp (WAHA). A API key não vive aqui — fica como secret da
 * Edge Function `send-whatsapp`, fora do alcance do frontend.
 */
export interface WhatsAppConfig {
  enabled: boolean;
  baseUrl?: string;
  session: string;
}

export interface WhatsAppOutboxItem {
  id: string;
  notificationId?: string;
  userId?: string;
  phone: string;
  message: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError?: string;
  createdAt: string;
  sentAt?: string;
}

export type SiengeLoteStatus = 'aberto' | 'encerrado';

export interface SiengeLote {
  id: string;
  nome: string;
  status: SiengeLoteStatus;
  createdAt: string;
  closedAt?: string;
  vencimento?: string;      // ISO date
  prazoPagamento?: string;  // ISO date
}

// Cartão de Crédito invoice — parallel to SiengeLote, groups titles launched
// against the credit card instead of a bank-slip payment batch.
export interface SiengeFatura {
  id: string;
  codigo: string; // e.g. "FATJUL001" — FAT + 3-letter month + continuous 3-digit sequence
  // Contador do banco (sequence). Nunca reaproveita número, nem após exclusão — é
  // dele que sai a numeração do código.
  seq?: number;
  status: SiengeLoteStatus;
  createdAt: string;
  closedAt?: string;
  vencimento?: string;      // ISO date
  prazoPagamento?: string;  // ISO date
  // Título gerado a partir desta fatura (botão "Gerar Título"). Enquanto existir,
  // a situação exibida da fatura acompanha o status desse título no kanban.
  tituloId?: string;
}

export interface SiengeVencimentoHistoryEntry {
  vencimento: string;    // Previous due date, replaced by a resolution
  changedAt: string;     // ISO timestamp of the replacement
  observacao?: string;   // Optional note explaining the change
}

// Livre (não mais só 'comercial'|'marketing') — o painel de configuração permite
// adicionar novos centros de custo além dos dois fixos.
export type SiengeCentroCusto = string;

export interface SiengeCentroCustoDef {
  id: string;
  nome: string;
  createdAt: string;
}

export interface SiengeCategoriaDef {
  id: string;
  centroCusto: string;
  categoria: string;
  createdAt: string;
}

export interface SiengeSubcategoriaDef {
  id: string;
  categoriaId: string;
  subcategoria: string;
  createdAt: string;
}

export interface SiengeTitle {
  id: string;
  titulo: string;
  descricao?: string;
  valor: number;
  empreendimento?: string;
  centroCusto?: SiengeCentroCusto;
  categoria?: string;
  subcategoria?: string;
  vencimento?: string; // ISO date — current/active due date shown on the card
  vencimentoOriginal?: string; // ISO date — first due date recorded when the title entered 'aguardando_pagamento'; used to compute true days overdue across rejection/resolution cycles
  vencimentoHistory?: SiengeVencimentoHistoryEntry[]; // Past due dates, preserved for reporting
  lote?: string;       // legacy text field
  loteId?: string;     // FK to sienge_lotes — mutually exclusive with faturaId
  faturaId?: string;   // FK to sienge_faturas — set when launched against the credit card instead of a lote
  motivoDetalhado?: string; // Required extra detail for titles launched against the credit card
  assigneeId?: string; // User responsible
  reminderDate?: string;
  reminderType?: '3h' | '1d' | 'custom' | 'seen';
  attachments?: { id: string, name: string, url?: string, data?: string }[];
  // Quantidade de anexos vinda da coluna gerada `attachments_count`. A listagem não
  // carrega `attachments` (linhas antigas guardam PDF em base64), então é por aqui que
  // as telas sabem que existe anexo antes de buscá-lo sob demanda.
  attachmentsCount?: number;
  chatMessages?: ChatMessage[];
  status: SiengeStatus;
  motivoRecusa?: string; // Reason recorded when status is set to 'recusados'
  motivoRecusaRegistradoEm?: string; // ISO timestamp of when the rejection was recorded
  motivoRecusaResolvido?: boolean; // True once the rejection reason has been addressed
  motivoRecusaResolvidoEm?: string; // ISO timestamp of when the rejection was marked resolved
  motivoRecusaObservacao?: string; // Optional note recorded when marking the rejection as resolved
  paidAt?: string; // ISO timestamp gravado pelo trigger set_paid_at no instante em que status entra em 'pago'
  mensalidadeId?: string; // Preenchido quando o título foi gerado automaticamente por uma mensalidade
  createdAt: string;
  updatedAt: string;
}

// Molde de título recorrente. Não aparece no kanban: todo dia 01 o job
// `gerar_titulos_mensalidades` copia cada mensalidade ativa para um SiengeTitle real.
export interface SiengeMensalidade {
  id: string;
  titulo?: string;
  descricao?: string;
  valor: number;
  empreendimento?: string;
  centroCusto?: SiengeCentroCusto;
  categoria?: string;
  subcategoria?: string;
  diaVencimento: number; // 1..31 — reduzido ao último dia nos meses mais curtos
  loteId?: string;       // opcional, diferente do título
  assigneeId?: string;
  motivoDetalhado?: string;
  ativa: boolean;        // false = recorrência cancelada, sem apagar o histórico
  createdAt: string;
  updatedAt: string;
}

export interface SiengeTitleStatusHistoryEntry {
  id: string;
  titleId: string;
  status: SiengeStatus;
  changedAt: string;
}

export interface SiengeProjectMeta {
  id: string;
  projectId: string;
  ano: number;
  mes: number; // 1-12
  vgvMeta: number;
  unidadesMeta: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiengeProjectTotal {
  id: string;
  projectId: string;
  vgvTotal: number;
  unidadesTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiengeProjectDisplay {
  projectId: string;
  hidden: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface SiengeCategoriaOrcamento {
  id: string;
  projectId: string;
  centroCusto: SiengeCentroCusto;
  categoria: string;
  percentual: number; // % do VGV mensal
  createdAt: string;
  updatedAt: string;
}

export type SiengeVendaSituacao = 'vendida' | 'disponivel' | 'reservado' | 'permuta' | 'bloqueada';

// Uma versão é uma condição comercial do mesmo empreendimento (à vista,
// financiado, prazos diferentes): tem colunas, regras, validações e valores
// próprios. O que atravessa as versões é a situação da unidade — sempre — e as
// colunas listadas em colunasVinculadas (ver SiengeTabelaVendaConfig).
export interface SiengeTabelaVendaVersao {
  id: string;
  projectId: string;
  nome: string;
  sortOrder: number;
  // Exatamente uma por projeto (garantido por índice único parcial no banco).
  // Só a principal alimenta VGV Meta, Saldo Remanescente, Teto do Produto e
  // Alocação, e só ela congela venda em sienge_vendas.
  principal: boolean;
  lpVisivel: boolean;
  tabelaPublicadaEm: string | null;
  createdAt: string;
  updatedAt: string;
}

// Config de tabela de vendas do projeto — o vínculo atravessa versões, então
// mora no projeto, não na versão.
export interface SiengeTabelaVendaConfig {
  projectId: string;
  /** Keys vinculadas entre versões: 'valor_tabela' e/ou keys de coluna. */
  colunasVinculadas: string[];
}

// Unidade, valor de tabela e situação são fixos (sustentam o congelamento de
// venda e o reajuste de INCC no banco). Todas as demais colunas variam por
// empreendimento e ficam em camposExtra, descritas por SiengeTabelaVendaColuna.
export interface SiengeTabelaVendaUnidade {
  id: string;
  projectId: string;
  versaoId: string;
  unidade: string;
  // Só em empreendimentos de terceiros (Project.terceiros): a tabela reúne
  // unidades de imóveis diferentes, e é este campo que diz de qual. Casa por
  // nome com LpCorretorImovel.nome. Null no resto — um empreendimento próprio
  // é um imóvel só.
  imovel: string | null;
  valorTabela: number;
  situacao: SiengeVendaSituacao;
  camposExtra: Record<string, number | string>;
  // Parcela congelada do valor, por coluna ('valor_tabela' ou key de coluna
  // extra): o reajuste aplica o percentual só sobre (valor − margem) e soma a
  // margem de volta. Coluna ausente aqui = valor reajusta cheio.
  margens: Record<string, number>;
  descricao: string | null;
  compradorAtual: string | null;
  // Motivo da última mudança de situação; copiado para o snapshot de venda.
  situacaoMotivo: string | null;
  frozenSince: string | null;
  // Carimbo da confirmação explícita de venda. Só quando este campo muda no
  // mesmo UPDATE que leva a situação para "vendida" é que o snapshot em
  // sienge_vendas é gerado — importação de CSV e correção de planilha não
  // criam venda. Também é a data usada como dataVenda do snapshot.
  vendaConfirmadaEm: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SiengeColunaTipo = 'numero' | 'moeda' | 'texto' | 'area';

export interface SiengeTabelaVendaColuna {
  id: string;
  projectId: string;
  versaoId: string;
  key: string;
  label: string;
  tipo: SiengeColunaTipo;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Snapshot imutável de venda — todos os valores da unidade (valor de tabela +
// colunas dinâmicas) e o comprador, congelados no instante em que a unidade
// virou "vendida". A Tabela de Vendas continua viva e sofre reajuste de INCC;
// o Histórico de Vendas e o cálculo de orçamento real usam sempre os valores
// congelados aqui, nunca os valores atuais da unidade.
export interface SiengeVenda {
  id: string;
  unidadeId: string;
  projectId: string;
  unidade: string;
  valorCongelado: number;
  camposExtraCongelados: Record<string, number | string>;
  comprador: string | null;
  dataVenda: string;
  dataDistrato: string | null;
  // Motivo informado ao alterar a situação que gerou este congelamento.
  motivo: string | null;
  // 'vendida' ou 'permuta' — permuta também alimenta o orçamento real.
  situacaoOrigem: SiengeVendaSituacao | null;
  motivoDistrato: string | null;
}

export interface SiengeOrcamentoConfig {
  controleInicio: string; // YYYY-MM-DD — data a partir da qual o gasto real passa a ser contado
}

export type SiengeCalculoOperacao = 'dividir' | 'multiplicar';

// Regra de cálculo: vira uma coluna calculada na Tabela de Vendas — título +
// (percentual da colunaBaseKey) dividido ou multiplicado pela quantidade. A
// coluna base pode ser 'valor_tabela' ou qualquer key de SiengeTabelaVendaColuna
// do mesmo empreendimento (ex.: Rivage usa 'custo_construcao'). Regras sem
// 'operacao' (dados antigos) são tratadas como divisão, comportamento anterior.
export interface SiengeCalculoRegra {
  id: string;
  projectId: string;
  versaoId: string;
  // Id estável entre versões da "mesma" regra — gerado uma vez, preservado na
  // duplicação de versão. É o que permite vincular a fórmula entre versões
  // (`id` muda a cada cópia, este não). Nunca editado pelo client.
  vinculoKey: string;
  titulo: string;
  quantidade: number; // número de parcelas (divisão) ou multiplicador (multiplicação) — usado quando quantidadeColunaKey é null
  quantidadeColunaKey?: string | null; // se preenchido, a quantidade é lida dessa coluna (ou 'valor_tabela') em vez do número digitado
  operacao?: SiengeCalculoOperacao;
  percentual: number; // % da coluna base
  colunaBaseKey: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type SiengeValidacaoTipo = 'parcelas' | 'valor_unidade';

// Termo de uma fórmula de validação (ver SiengeValidacao): pra tipo 'parcelas',
// (quantidade × coluna); pra tipo 'valor_unidade', (sinal coluna).
export interface SiengeValidacaoTermo {
  colunaKey: string;
  quantidade?: number;
  sinal?: '+' | '-';
}

// Validação livre e persistida por empreendimento, montada em "Validar Tabela":
// 'parcelas' soma (quantidade × coluna) de cada termo e compara com referenciaKey;
// 'valor_unidade' soma/subtrai os termos (pelo sinal) e compara com Valor da
// Unidade (fixo, não configurável). Ambas esperam diferença = 0,00.
export interface SiengeValidacao {
  id: string;
  projectId: string;
  versaoId: string;
  tipo: SiengeValidacaoTipo;
  titulo: string;
  termos: SiengeValidacaoTermo[];
  referenciaKey: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── LP do Corretor ──────────────────────────────────────────────
// Página pública (uma por empreendimento) com a tabela de preços espelhada,
// pensada para o corretor abrir no celular. Ver migration 20260802000000.

export interface LpCorretorImagem {
  id: string;
  url: string;
  legenda: string;
}

export interface LpCorretorFichaItem {
  id: string;
  label: string;
  valor: string;
  /** Quando preenchida, a linha vira um link "Abrir" no lugar do valor. */
  url?: string | null;
}

// Planta exibida na linha expandida da tabela. A ligação com as unidades segue
// três regras, nesta ordem (ver plantasDaUnidade em lib/lpCorretor.ts):
//   1. `unidades` preenchido → a planta vale só para essas unidades e ignora
//      terminações. É o caso da cobertura, que tem planta própria mesmo tendo
//      a mesma terminação das demais.
//   2. `terminacoes` preenchido → vale para toda unidade cujo número termine
//      assim (ex.: '01' pega 101, 201, 1101), exceto as que já têm planta
//      própria pela regra 1. Quando `andares` também está preenchido, a
//      unidade só bate se o andar (o que sobra do número depois de tirar a
//      terminação) estiver na lista — necessário quando a mesma terminação
//      tem plantas diferentes em andares diferentes.
//   3. `unidades`, `terminacoes` e `andares` vazios → planta geral do
//      empreendimento (ex.: pavimento).
export interface LpCorretorPlanta {
  id: string;
  url: string;
  legenda: string;
  unidades: string[];
  terminacoes: string[];
  /** Vazio = terminação vale para qualquer andar (comportamento anterior). */
  andares: string[];
}

// Imóvel de um empreendimento de terceiros. Ali a LP não descreve um prédio:
// descreve uma carteira de imóveis avulsos, e cada linha da tabela pertence a
// um deles. Por isso o material de apresentação que num empreendimento próprio
// vale para a página inteira (galeria, ficha, book) vive aqui, um conjunto por
// imóvel, e aparece só ao expandir a unidade.
//
// A ligação com as unidades é pelo nome: `nome` casa com
// SiengeTabelaVendaUnidade.imovel. Nome é a chave porque é o que o usuário
// digita na tabela e escolhe no cadastro — um id oculto obrigaria a repicar
// toda linha importada por planilha.
export interface LpCorretorImovel {
  id: string;
  nome: string;
  descricao: string | null;
  /** PDF ou link do material de vendas do imóvel. */
  bookUrl: string | null;
  /** Álbum externo de fotos (Drive, site do proprietário...). */
  fotosUrl: string | null;
  imagens: LpCorretorImagem[];
  fichaTecnica: LpCorretorFichaItem[];
}

// Chave de coluna visível na LP: a key de uma coluna real ou 'regra:<id>'
// para uma coluna calculada — mesmo espaço de nomes usado nas validações.
export type LpCorretorColunaKey = string;

export interface LpCorretorConfig {
  projectId: string;
  slug: string;
  publicada: boolean;
  titulo: string | null;
  subtitulo: string | null;
  descricao: string | null;
  // Logo do produto, exibido no topo no lugar do nome em texto.
  logoEmpreendimentoUrl: string | null;
  bannerUrl: string | null;
  imagens: LpCorretorImagem[];
  plantas: LpCorretorPlanta[];
  fichaTecnica: LpCorretorFichaItem[];
  // Só alimentado em empreendimentos de terceiros; nos próprios fica vazio e a
  // LP nem olha para ele. Ver LpCorretorImovel.
  imoveis: LpCorretorImovel[];
  bookUrl: string | null;
  observacoes: string | null;
  // {unidade} é trocado pelo nome da unidade ao montar o botão "Reservar".
  cvcrmUrlTemplate: string | null;
  // Fronteira de segurança: só estas colunas saem do banco.
  colunasVisiveis: LpCorretorColunaKey[];
  // Subconjunto de colunasVisiveis exibido na linha compacta da tabela; o
  // restante aparece apenas ao expandir a unidade.
  colunasLinha: LpCorretorColunaKey[];
  // Coluna cujos valores viram os chips de filtro de tipologia na LP. null =
  // sem filtro; a página fica com os filtros de sempre.
  colunaTipologia: LpCorretorColunaKey | null;
  // RI registrado. false = a LP apresenta as unidades vendidas como reservadas,
  // porque antes do registro da incorporação não houve venda. A troca acontece
  // na RPC, não na tela: a situação real não sai do banco.
  riRegistrado: boolean;
  // Página de validação: espelho ao vivo da tabela, endereçado pelo token e
  // fora do fluxo de publicação. Serve para conferir um reajuste antes de
  // liberá-lo — por isso mostra preço não publicado e o endereço é secreto.
  validacaoHabilitada: boolean;
  validacaoToken: string;
  // Slot de publicação por projeto, de quando o empreendimento tinha uma tabela
  // só. Cada versão tem o seu desde 20260805030000 e é ele que a LP usa; este
  // permanece apenas para não quebrar leituras antigas do painel.
  tabelaPublicadaEm: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Payload público (RPC get_lp_corretor) ───────────────────────
// Só o que a LP mostra: colunas ocultas e o comprador nunca saem do banco, e
// as colunas calculadas já vêm resolvidas para que a coluna base fique oculta.

export interface LpCorretorPublicColuna {
  key: string;
  label: string;
  tipo: SiengeColunaTipo;
  sortOrder: number;
}

export interface LpCorretorPublicRegra {
  id: string;
  titulo: string;
  sortOrder: number;
}

export interface LpCorretorPublicUnidade {
  id: string;
  unidade: string;
  /** Terceiros: a que imóvel esta linha pertence. Null nos próprios. */
  imovel: string | null;
  valorTabela: number;
  situacao: SiengeVendaSituacao;
  descricao: string | null;
  camposExtra: Record<string, number | string>;
  calculados: Record<string, number>;
}

/** Versão liberada ao corretor — vira um botão nos filtros da página. */
export interface LpCorretorPublicVersao {
  id: string;
  nome: string;
  principal: boolean;
}

export interface LpCorretorPublicData {
  /**
   * true = este payload é o espelho ao vivo da página de validação, montado
   * sem passar por publicação nenhuma. A página avisa quem está lendo: não é
   * o que o corretor está vendo.
   */
  validacao: boolean;
  /** Versões liberadas na LP. Uma só = a página não mostra os botões. */
  versoes: LpCorretorPublicVersao[];
  /** Qual delas esta resposta traz — colunas, regras e unidades são dela. */
  versaoId: string;
  config: {
    projectId: string;
    slug: string;
    titulo: string | null;
    subtitulo: string | null;
    descricao: string | null;
    logoEmpreendimentoUrl: string | null;
    bannerUrl: string | null;
    imagens: LpCorretorImagem[];
    plantas: LpCorretorPlanta[];
    fichaTecnica: LpCorretorFichaItem[];
    imoveis: LpCorretorImovel[];
    bookUrl: string | null;
    observacoes: string | null;
    cvcrmUrlTemplate: string | null;
    colunasLinha: LpCorretorColunaKey[];
    colunaTipologia: LpCorretorColunaKey | null;
    atualizadoEm: string;
  };
  projeto: { id: string; nome: string; coverImage: string | null; terceiros: boolean };
  colunas: LpCorretorPublicColuna[];
  regras: LpCorretorPublicRegra[];
  unidades: LpCorretorPublicUnidade[];
}

export interface SiengeTabelaVendaRevisao {
  id: string;
  projectId: string;
  versaoId: string;
  numero: number;
  tipo: 'geral' | 'seletiva';
  percentual: number;
  unidadesAfetadas: number;
  unidades: string[] | null;
  descricao: string | null;
  // Obrigatório desde 02/08/2026; revisões antigas caem para `descricao`.
  motivo: string | null;
  // Backup dos valores da tabela inteira imediatamente antes do reajuste.
  // Só o indicador vem para o client — o conteúdo fica no banco.
  temBackup: boolean;
  revertidaEm: string | null;
  createdAt: string;
  // Keys reajustadas: 'valor_tabela' e/ou keys de SiengeTabelaVendaColuna.
  // Null em revisões anteriores a 02/08/2026, que sempre reajustavam só o valor de tabela.
  colunas: string[] | null;
}
