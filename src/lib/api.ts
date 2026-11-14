import { supabase } from './supabase';
import { Task, Project, Label, AppNotification, SiengeTitle, SiengeMensalidade, SiengeLote, SiengeFatura, SiengeAlcadaConfig, DesignBriefing, CopyBriefing, PlanningBriefing, TaskHistoryEntry, SiengeProjectMeta, SiengeCategoriaOrcamento, SiengeTitleStatusHistoryEntry, SiengeProjectTotal, SiengeProjectDisplay, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao, SiengeTabelaVendaConfig, SiengeTabelaVendaColuna, SiengeTabelaVendaRevisao, SiengeVenda, SiengeOrcamentoConfig, SiengeCalculoRegra, SiengeValidacao, SiengeCentroCustoDef, SiengeCategoriaDef, SiengeSubcategoriaDef, WhatsAppConfig, WhatsAppOutboxItem, LpCorretorConfig, LpCorretorPublicData, SiengeVendaSituacao, UserDocument } from '../types';

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*');
  if (error) throw error;
  return (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    status: p.status,
    coverImage: p.cover_image,
    code: p.code,
    buildProgress: p.build_progress,
    terceiros: p.terceiros ?? false,
  })) as Project[];
}

export async function fetchLabels(): Promise<Label[]> {
  const { data, error } = await supabase.from('labels').select('*');
  if (error) throw error;
  return data as Label[];
}

export async function logTaskFieldHistory(
  taskId: string,
  field: 'description' | 'copy_briefing',
  oldValue: string | null,
  newValue: string | null,
  changedBy: string | null
): Promise<void> {
  const { error } = await supabase.rpc('log_task_field_history', {
    p_task_id: taskId,
    p_field: field,
    p_old_value: oldValue,
    p_new_value: newValue,
    p_changed_by: changedBy,
  });
  if (error) throw error;
}

export async function fetchTaskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
  const { data, error } = await supabase
    .from('task_history')
    .select('*')
    .eq('task_id', taskId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((h: any): TaskHistoryEntry => ({
    id: h.id,
    taskId: h.task_id,
    field: h.field,
    oldValue: h.old_value,
    newValue: h.new_value,
    changedBy: h.changed_by,
    changedAt: h.changed_at,
  }));
}

// design_briefing / copy_briefing / planning_briefing are excluded here (~13 MB total).
// They are fetched on-demand via fetchTaskBriefings() when a task is opened.
const TASKS_LIST_COLS = [
  'id', 'task_code', 'title', 'description', 'status', 'priority',
  'project_id', 'created_at', 'due_date', 'reminder_date', 'reminder_type',
  'assignee_id', 'parent_task_id', 'hierarchy_order', 'is_private', 'updated_by',
  'chat_messages', 'attachments', 'proposals', 'budget_approvals', 'social_media_approval', 'time_tracking',
  'updated_at', 'status_history', 'rework_count', 'pending_deadline_change'
].join(', ');

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from('tasks').select(`
    ${TASKS_LIST_COLS},
    subtasks(*),
    task_labels(
      labels(*)
    )
  `);

  if (error) throw error;

  return data.map((t: any): Task => {
    // Safely extract labels, handling cases where the join might be empty
    const extractedLabels = (t.task_labels || [])
      .map((tl: any) => tl.labels)
      .filter(Boolean);

    return {
      id: t.id,
      taskCode: t.task_code,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      projectId: t.project_id,
      createdAt: t.created_at,
      dueDate: t.due_date,
      reminderDate: t.reminder_date,
      reminderType: t.reminder_type,
      assigneeId: t.assignee_id,
      parentTaskId: t.parent_task_id,
      hierarchyOrder: t.hierarchy_order ?? undefined,
      isPrivate: t.is_private ?? false,
      updatedBy: t.updated_by,
      chatMessages: t.chat_messages || [],
      attachments: t.attachments || [],
      proposals: t.proposals || [],
      budgetApprovals: t.budget_approvals || [],
      socialMediaApproval: t.social_media_approval,
      timeTracking: t.time_tracking,
      updatedAt: t.updated_at,
      statusHistory: t.status_history || [],
      reworkCount: t.rework_count || 0,
      pendingDeadlineChange: t.pending_deadline_change || null,
      subtasks: (t.subtasks || [])
        .map((st: any) => ({
          id: st.id,
          title: st.title,
          completed: st.completed,
          canceled: st.canceled,
          completedAt: st.completed_at,
          reminderDate: st.reminder_date,
          reminderType: st.reminder_type,
          assigneeId: st.assignee_id,
          level: st.level,
          sortOrder: st.sort_order
        }))
        .sort((a: any, b: any) => {
          const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
          return orderA - orderB;
        }),
      labels: extractedLabels
    };
  });
}

export async function fetchTaskBriefings(id: string): Promise<{
  designBriefing?: DesignBriefing;
  copyBriefing?: CopyBriefing;
  planningBriefing?: PlanningBriefing;
} | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select('design_briefing, copy_briefing, planning_briefing')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return {
    designBriefing: data.design_briefing ?? undefined,
    copyBriefing: data.copy_briefing ?? undefined,
    planningBriefing: data.planning_briefing ?? undefined,
  };
}

const taskSaveLocks: Record<string, Promise<void>> = {};

// Write Operations
export async function saveTask(task: Task) {
  // Wait for any pending save for this task
  while (taskSaveLocks[task.id]) {
    try {
      await taskSaveLocks[task.id];
    } catch (e) {
      // ignore error from previous lock
    }
  }

  let resolveLock: () => void;
  taskSaveLocks[task.id] = new Promise(resolve => {
    resolveLock = resolve;
  });

  try {
    // 1. Upsert main task
    const { error: taskError } = await supabase.from('tasks').upsert({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
    priority: task.priority,
    project_id: task.projectId || null,
    created_at: task.createdAt,
    due_date: task.dueDate || null,
    reminder_date: task.reminderDate || null,
    reminder_type: task.reminderType || null,
    assignee_id: task.assigneeId || null,
    parent_task_id: task.parentTaskId || null,
    hierarchy_order: task.hierarchyOrder ?? null,
    is_private: task.isPrivate ?? false,
    updated_by: task.updatedBy || null,
    chat_messages: task.chatMessages || [],
    design_briefing: task.designBriefing,
    copy_briefing: task.copyBriefing,
    planning_briefing: task.planningBriefing,
    attachments: task.attachments || [],
    proposals: task.proposals || [],
    budget_approvals: task.budgetApprovals || [],
    social_media_approval: task.socialMediaApproval,
    time_tracking: task.timeTracking,
    updated_at: task.updatedAt || null,
    status_history: task.statusHistory || [],
    rework_count: task.reworkCount || 0,
    pending_deadline_change: task.pendingDeadlineChange || null
  });
  if (taskError) {
    console.error("Error saving task:", taskError);
    throw taskError;
  }

  // 2. Sync Labels — upsert new rows, delete only removed ones (avoids N WAL events per save)
  if (task.labels && task.labels.length > 0) {
    const keepLabelIds = task.labels.map(l => l.id);
    const { error: deleteLabelsError } = await supabase.from('task_labels').delete().eq('task_id', task.id).not('label_id', 'in', `(${keepLabelIds.join(',')})`);
    if (deleteLabelsError) console.error("Error deleting task labels:", deleteLabelsError);
    const labelInserts = task.labels.map(l => ({ task_id: task.id, label_id: l.id }));
    const { error: upsertLabelsError } = await supabase.from('task_labels').upsert(labelInserts);
    if (upsertLabelsError) console.error("Error upserting task labels:", upsertLabelsError);
  } else {
    const { error: deleteLabelsError } = await supabase.from('task_labels').delete().eq('task_id', task.id);
    if (deleteLabelsError) console.error("Error deleting task labels:", deleteLabelsError);
  }

  // 3. Sync Subtasks — upsert changed/new rows, delete removed ones only (avoids N WAL events per save)
  if (task.subtasks && task.subtasks.length > 0) {
    const keepIds = task.subtasks.map(st => st.id);
    const { error: deleteSubtasksError } = await supabase.from('subtasks').delete().eq('task_id', task.id).not('id', 'in', `(${keepIds.join(',')})`);
    if (deleteSubtasksError) console.error("Error deleting subtasks:", deleteSubtasksError);
    const subtaskInserts = task.subtasks.map((st, index) => ({
      id: st.id,
      task_id: task.id,
      title: st.title,
      completed: st.completed,
      canceled: st.canceled,
      completed_at: st.completedAt || null,
      reminder_date: st.reminderDate || null,
      reminder_type: st.reminderType || null,
      assignee_id: st.assigneeId || null,
      level: st.level,
      sort_order: index
    }));
    const { error: upsertSubtasksError } = await supabase.from('subtasks').upsert(subtaskInserts);
    if (upsertSubtasksError) console.error("Error upserting subtasks:", upsertSubtasksError);
  } else {
    const { error: deleteSubtasksError } = await supabase.from('subtasks').delete().eq('task_id', task.id);
    if (deleteSubtasksError) console.error("Error deleting subtasks:", deleteSubtasksError);
  }
  } finally {
    delete taskSaveLocks[task.id];
    resolveLock!();
  }
}

// Lançado quando um write de descrição é rejeitado porque o texto no banco já não
// é o mesmo que o editor carregou — ou seja, outra pessoa salvou no meio do caminho.
// O chamador deve descartar o write (nunca re-enfileirar) e recarregar do servidor.
export class TaskConflictError extends Error {
  constructor(public taskId: string) {
    super(`Descrição da tarefa ${taskId} foi alterada por outro usuário`);
    this.name = 'TaskConflictError';
  }
}

interface PatchOptions {
  // Descrição que o editor tinha como base. Quando informada, a gravação vira um
  // compare-and-swap: o UPDATE só casa se a linha ainda contiver esse texto.
  // Atômico e sem request extra — o próprio UPDATE faz a verificação.
  descriptionBase?: string | null;
}

export async function patchTask(taskId: string, updates: Partial<Task>, opts: PatchOptions = {}) {
  // Wait for any pending save for this task
  while (taskSaveLocks[taskId]) {
    try {
      await taskSaveLocks[taskId];
    } catch (e) {
      // ignore
    }
  }

  let resolveLock: () => void;
  taskSaveLocks[taskId] = new Promise(resolve => {
    resolveLock = resolve;
  });

  try {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId || null;
    if (updates.createdAt !== undefined) dbUpdates.created_at = updates.createdAt;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate || null;
    if ('reminderDate' in updates) dbUpdates.reminder_date = updates.reminderDate ?? null;
    if ('reminderType' in updates) dbUpdates.reminder_type = updates.reminderType ?? null;
    if (updates.assigneeId !== undefined) dbUpdates.assignee_id = updates.assigneeId;
    if ('parentTaskId' in updates) dbUpdates.parent_task_id = updates.parentTaskId ?? null;
    if ('hierarchyOrder' in updates) dbUpdates.hierarchy_order = updates.hierarchyOrder ?? null;
    if ('isPrivate' in updates) dbUpdates.is_private = updates.isPrivate ?? false;
    if (updates.updatedBy !== undefined) dbUpdates.updated_by = updates.updatedBy;
    if (updates.chatMessages !== undefined) dbUpdates.chat_messages = updates.chatMessages;
    if (updates.designBriefing !== undefined) dbUpdates.design_briefing = updates.designBriefing;
    if (updates.copyBriefing !== undefined) dbUpdates.copy_briefing = updates.copyBriefing;
    if (updates.planningBriefing !== undefined) dbUpdates.planning_briefing = updates.planningBriefing;
    if (updates.attachments !== undefined) dbUpdates.attachments = updates.attachments;
    if (updates.proposals !== undefined) dbUpdates.proposals = updates.proposals;
    if (updates.budgetApprovals !== undefined) dbUpdates.budget_approvals = updates.budgetApprovals;
    if (updates.socialMediaApproval !== undefined) dbUpdates.social_media_approval = updates.socialMediaApproval;
    if (updates.timeTracking !== undefined) dbUpdates.time_tracking = updates.timeTracking;
    if (updates.updatedAt !== undefined) dbUpdates.updated_at = updates.updatedAt;
    if (updates.statusHistory !== undefined) dbUpdates.status_history = updates.statusHistory;
    if (updates.reworkCount !== undefined) dbUpdates.rework_count = updates.reworkCount;
    if ('pendingDeadlineChange' in updates) dbUpdates.pending_deadline_change = updates.pendingDeadlineChange ?? null;

    const guardDescription = dbUpdates.description !== undefined && opts.descriptionBase !== undefined;

    if (guardDescription) {
      // Separa a descrição do resto: só ela precisa do compare-and-swap, e um
      // conflito nela não deve derrubar a gravação dos demais campos.
      const { description, ...rest } = dbUpdates;

      if (Object.keys(rest).length > 0) {
        const { error } = await supabase.from('tasks').update(rest).eq('id', taskId);
        if (error) {
          console.error("Error patching task:", error);
          throw error;
        }
      }

      const base = opts.descriptionBase;
      // Descrição vazia pode estar gravada como '' ou NULL — para o usuário é a
      // mesma coisa, então o guard aceita as duas formas.
      const baseEmpty = base === null || base === '';
      // O compare-and-swap roda numa RPC: base e novo texto vão no corpo do POST.
      // Fazer .eq('description', base) mandava a descrição inteira como filtro na
      // URL — descrições grandes (imagem base64 embutida) estouravam o limite de
      // tamanho de URL, casavam 0 linhas e geravam um conflito falso que apagava
      // o que o usuário digitou.
      const { data, error } = await supabase.rpc('update_task_description_cas', {
        p_task_id: taskId,
        p_new_description: description,
        p_base_description: baseEmpty ? '' : base,
        p_base_empty: baseEmpty,
      });
      if (error) {
        console.error("Error patching task description:", error);
        throw error;
      }
      if (data !== true) throw new TaskConflictError(taskId);
    } else if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', taskId);
      if (error) {
        console.error("Error patching task:", error);
        throw error;
      }
    }

    if (updates.labels !== undefined) {
      if (updates.labels && updates.labels.length > 0) {
        const keepLabelIds = updates.labels.map(l => l.id);
        const { error: deleteError } = await supabase.from('task_labels').delete().eq('task_id', taskId).not('label_id', 'in', `(${keepLabelIds.join(',')})`);
        if (deleteError) console.error("Error deleting task labels:", deleteError);
        const labelInserts = updates.labels.map(l => ({ task_id: taskId, label_id: l.id }));
        const { error: upsertError } = await supabase.from('task_labels').upsert(labelInserts);
        if (upsertError) console.error("Error upserting task labels:", upsertError);
      } else {
        const { error: deleteError } = await supabase.from('task_labels').delete().eq('task_id', taskId);
        if (deleteError) console.error("Error deleting task labels:", deleteError);
      }
    }

    if (updates.subtasks !== undefined) {
      if (updates.subtasks && updates.subtasks.length > 0) {
        const keepIds = updates.subtasks.map(st => st.id);
        const { error: deleteError } = await supabase.from('subtasks').delete().eq('task_id', taskId).not('id', 'in', `(${keepIds.join(',')})`);
        if (deleteError) console.error("Error deleting subtasks:", deleteError);
        const subtaskInserts = updates.subtasks.map((st, index) => ({
          id: st.id,
          task_id: taskId,
          title: st.title,
          completed: st.completed,
          canceled: st.canceled,
          completed_at: st.completedAt || null,
          reminder_date: st.reminderDate || null,
          reminder_type: st.reminderType || null,
          assignee_id: st.assigneeId || null,
          level: st.level,
          sort_order: index
        }));
        const { error: upsertError } = await supabase.from('subtasks').upsert(subtaskInserts);
        if (upsertError) console.error("Error upserting subtasks:", upsertError);
      } else {
        const { error: deleteError } = await supabase.from('subtasks').delete().eq('task_id', taskId);
        if (deleteError) console.error("Error deleting subtasks:", deleteError);
      }
    }
  } finally {
    delete taskSaveLocks[taskId];
    resolveLock!();
  }
}

export async function deleteTask(taskId: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) {
    console.error("Error deleting task from DB:", error);
    throw error;
  }
}

export async function saveProject(project: Project) {
  const { error } = await supabase.from('projects').upsert({
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    status: project.status,
    cover_image: project.coverImage ?? null,
    code: project.code ?? null,
    build_progress: project.buildProgress ?? null,
    terceiros: project.terceiros ?? false,
  });
  if (error) throw error;
}

/**
 * Renomear passa por RPC, e não por `saveProject`, porque o nome é chave de
 * ligação: `sienge_titles.empreendimento` guarda o nome em texto e é assim que
 * o Dashboard Analítico soma gasto por empreendimento. Trocar só o `projects.name`
 * desliga os títulos do relatório sem erro nenhum — o gasto some das telas e
 * continua no banco. A função no banco move os dois lados na mesma transação.
 */
export async function renameProject(projectId: string, novoNome: string) {
  const { error } = await supabase.rpc('renomear_empreendimento', {
    p_project_id: projectId,
    p_novo_nome: novoNome,
  });
  if (error) throw error;
}

export interface ProjectDeleteImpact {
  tarefas: number;
  unidades: number;
  versoes: number;
  vendas: number;
  metas: number;
  temLp: boolean;
  /** Títulos ligados por NOME: não são apagados, ficam órfãos. */
  titulos: number;
}

/** O que a exclusão arrasta junto — o cascade do banco é invisível na tela. */
export async function fetchProjectDeleteImpact(projectId: string): Promise<ProjectDeleteImpact> {
  const { data, error } = await supabase.rpc('impacto_exclusao_empreendimento', { p_project_id: projectId });
  if (error) throw error;
  return data as ProjectDeleteImpact;
}

export async function deleteProject(projectId: string) {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
    
  if (error) throw error;
  
  return data.map((n: any): AppNotification => ({
    id: n.id,
    userId: n.user_id,
    actorId: n.actor_id,
    taskId: n.task_id,
    siengeTitleId: n.sienge_title_id,
    type: n.type,
    status: n.status,
    createdAt: n.created_at,
    viewedAt: n.viewed_at,
    postponedUntil: n.postponed_until,
    message: n.message,
    details: n.details,
    targetId: n.target_id
  }));
}

export async function saveNotification(notif: AppNotification) {
  const { error } = await supabase.from('notifications').upsert({
    id: notif.id,
    user_id: notif.userId,
    actor_id: notif.actorId,
    task_id: notif.taskId || null,
    sienge_title_id: notif.siengeTitleId || null,
    type: notif.type,
    status: notif.status,
    created_at: notif.createdAt,
    viewed_at: notif.viewedAt,
    postponed_until: notif.postponedUntil,
    message: notif.message,
    details: notif.details,
    target_id: notif.targetId
  });
  if (error) throw error;
}

export async function deleteArchivedNotifications(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'viewed');
  if (error) throw error;
}

// ─── Meus Documentos (privado por usuário) ───────────────────────────

export async function fetchUserDocuments(userId: string): Promise<UserDocument[]> {
  const { data, error } = await supabase
    .from('user_documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((d: any): UserDocument => ({
    id: d.id,
    userId: d.user_id,
    kind: d.kind,
    title: d.title,
    url: d.url || undefined,
    content: d.content || undefined,
    fileName: d.file_name || undefined,
    fileSize: d.file_size ?? undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at
  }));
}

export async function saveUserDocument(doc: UserDocument) {
  const { error } = await supabase.from('user_documents').upsert({
    id: doc.id,
    user_id: doc.userId,
    kind: doc.kind,
    title: doc.title,
    url: doc.url || null,
    content: doc.content || null,
    file_name: doc.fileName || null,
    file_size: doc.fileSize ?? null,
    created_at: doc.createdAt,
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.error('Error saving user document', error);
    throw error;
  }
}

export async function deleteUserDocument(id: string) {
  const { error } = await supabase.from('user_documents').delete().eq('id', id);
  if (error) throw error;
}

// ─── Sienge Titles ───────────────────────────────────────────────

const SIENGE_TITLE_LIST_COLS = 'id, titulo, descricao, valor, empreendimento, centro_custo, categoria, subcategoria, vencimento, vencimento_original, lote, lote_id, fatura_id, motivo_detalhado, assignee_id, reminder_date, reminder_type, status, created_at, updated_at, paid_at, mensalidade_id, motivo_recusa, motivo_recusa_registrado_em, motivo_recusa_resolvido, motivo_recusa_resolvido_em, motivo_recusa_observacao, attachments_count';

function mapSiengeTitle(r: any, attachments?: any): SiengeTitle {
  return {
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao,
    valor: Number(r.valor),
    empreendimento: r.empreendimento,
    centroCusto: r.centro_custo,
    categoria: r.categoria,
    subcategoria: r.subcategoria,
    vencimento: r.vencimento,
    vencimentoOriginal: r.vencimento_original,
    // Left undefined (not defaulted to []) when not selected by the list query,
    // so saveSiengeTitle can tell "not loaded" apart from "explicitly empty"
    // and avoid clobbering real history data — same guard used for attachments below.
    vencimentoHistory: r.vencimento_history,
    lote: r.lote,
    loteId: r.lote_id,
    faturaId: r.fatura_id,
    motivoDetalhado: r.motivo_detalhado,
    assigneeId: r.assignee_id,
    reminderDate: r.reminder_date,
    reminderType: r.reminder_type,
    // Only defined when explicitly passed by the caller (fetchSiengeTitleById).
    // Left undefined for the list query so saveSiengeTitle can tell "not loaded"
    // apart from "explicitly empty" and won't clobber real attachments — same
    // guard used for vencimento_history above.
    attachments,
    // Coluna gerada no banco: vem na lista mesmo sem o conteúdo dos anexos, e é o que
    // permite às telas mostrarem o clipe sem baixar o `attachments` inteiro.
    attachmentsCount: attachments ? attachments.length : (r.attachments_count ?? undefined),
    status: r.status,
    motivoRecusa: r.motivo_recusa,
    motivoRecusaRegistradoEm: r.motivo_recusa_registrado_em,
    motivoRecusaResolvido: r.motivo_recusa_resolvido,
    motivoRecusaResolvidoEm: r.motivo_recusa_resolvido_em,
    motivoRecusaObservacao: r.motivo_recusa_observacao,
    chatMessages: r.chat_messages,
    paidAt: r.paid_at,
    mensalidadeId: r.mensalidade_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeTitleStatusHistory(): Promise<SiengeTitleStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('sienge_title_status_history')
    .select('id, title_id, status, changed_at');
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    titleId: r.title_id,
    status: r.status,
    changedAt: r.changed_at,
  }));
}

export async function fetchSiengeTitles(): Promise<SiengeTitle[]> {
  // attachments column excluded — it stores base64 PDFs that cause statement
  // timeouts when fetched for the full list. Load them on demand via fetchSiengeTitleById.
  const { data, error } = await supabase
    .from('sienge_titles')
    .select(SIENGE_TITLE_LIST_COLS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any) => mapSiengeTitle(r));
}

export async function fetchSiengeTitleById(id: string): Promise<SiengeTitle | null> {
  const { data, error } = await supabase
    .from('sienge_titles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapSiengeTitle(data, data.attachments || []);
}

// Lançado quando o save de um título Sienge é rejeitado porque o updated_at no banco
// já não é o que a tela carregou — ou seja, outra pessoa salvou no meio do caminho.
// O chamador deve descartar a alteração local e recarregar do servidor.
export class SiengeTitleConflictError extends Error {
  constructor(public titleId: string) {
    super(`Título Sienge ${titleId} foi alterado por outro usuário`);
    this.name = 'SiengeTitleConflictError';
  }
}

export async function saveSiengeTitle(title: SiengeTitle) {
  // Base para o compare-and-swap: o updated_at que a tela tinha ao abrir o título.
  // Só é setado pelo caminho de "Salvar Alterações" (edição destrutiva de todos os
  // campos). Ações rápidas (status/chat) não passam base — seguem via upsert normal,
  // protegidas pela presença (bloqueio de edição simultânea).
  const baseUpdatedAt = (title as any).__baseUpdatedAt as string | undefined;

  const payload: any = {
    id: title.id,
    titulo: title.titulo,
    descricao: title.descricao || null,
    valor: title.valor,
    empreendimento: title.empreendimento || null,
    centro_custo: title.centroCusto || null,
    categoria: title.categoria || null,
    subcategoria: title.subcategoria || null,
    vencimento: title.vencimento || null,
    vencimento_original: title.vencimentoOriginal || null,
    lote: title.lote || null,
    lote_id: title.loteId || null,
    fatura_id: title.faturaId || null,
    motivo_detalhado: title.motivoDetalhado || null,
    assignee_id: title.assigneeId || null,
    reminder_date: title.reminderDate || null,
    reminder_type: title.reminderType || null,
    status: title.status,
    motivo_recusa: title.motivoRecusa || null,
    motivo_recusa_registrado_em: title.motivoRecusaRegistradoEm || null,
    motivo_recusa_resolvido: title.motivoRecusaResolvido || false,
    motivo_recusa_resolvido_em: title.motivoRecusaResolvidoEm || null,
    motivo_recusa_observacao: title.motivoRecusaObservacao || null,
  };
  if (title.chatMessages !== undefined) {
    payload.chat_messages = title.chatMessages;
  }
  // Only write vencimento_history when explicitly provided, to avoid clobbering
  // records loaded via the list view (which doesn't fetch this column).
  if (title.vencimentoHistory !== undefined) {
    payload.vencimento_history = title.vencimentoHistory;
  }
  // Only write attachments when they were explicitly loaded (fetchSiengeTitleById),
  // otherwise we'd overwrite real DB data with the empty list default.
  if (title.attachments !== undefined) {
    payload.attachments = title.attachments;
  }

  if (baseUpdatedAt !== undefined) {
    // Compare-and-swap: só grava se o updated_at no banco ainda for o que a tela
    // carregou. Se outro usuário salvou no meio, o UPDATE não casa nenhuma linha
    // e sinalizamos conflito — nunca gravamos por cima. (O trigger BEFORE UPDATE
    // avança updated_at a cada gravação, então a base fica velha após o 1º save.)
    const { data, error } = await supabase
      .from('sienge_titles')
      .update(payload)
      .eq('id', title.id)
      .eq('updated_at', baseUpdatedAt)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new SiengeTitleConflictError(title.id);
    return;
  }

  const { error } = await supabase.from('sienge_titles').upsert(payload);
  if (error) throw error;
}

export async function deleteSiengeTitle(id: string) {
  const { error } = await supabase.from('sienge_titles').delete().eq('id', id);
  if (error) throw error;
}

// ─── Mensalidades (títulos recorrentes) ───────────

function mapSiengeMensalidade(r: any): SiengeMensalidade {
  return {
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao,
    valor: Number(r.valor),
    empreendimento: r.empreendimento,
    centroCusto: r.centro_custo,
    categoria: r.categoria,
    subcategoria: r.subcategoria,
    diaVencimento: r.dia_vencimento,
    loteId: r.lote_id,
    assigneeId: r.assignee_id,
    motivoDetalhado: r.motivo_detalhado,
    ativa: r.ativa,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeMensalidades(): Promise<SiengeMensalidade[]> {
  const { data, error } = await supabase
    .from('sienge_mensalidades')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSiengeMensalidade);
}

export async function saveSiengeMensalidade(m: SiengeMensalidade): Promise<SiengeMensalidade> {
  const payload = {
    id: m.id,
    titulo: m.titulo || null,
    descricao: m.descricao || null,
    valor: m.valor,
    empreendimento: m.empreendimento || null,
    centro_custo: m.centroCusto || null,
    categoria: m.categoria || null,
    subcategoria: m.subcategoria || null,
    dia_vencimento: m.diaVencimento,
    lote_id: m.loteId || null,
    assignee_id: m.assigneeId || null,
    motivo_detalhado: m.motivoDetalhado || null,
    ativa: m.ativa,
  };
  const { data, error } = await supabase
    .from('sienge_mensalidades')
    .upsert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapSiengeMensalidade(data);
}

export async function deleteSiengeMensalidade(id: string) {
  const { error } = await supabase.from('sienge_mensalidades').delete().eq('id', id);
  if (error) throw error;
}

// ─── Sienge Metas & Orçamento (dashboard estratégico) ───────────

function mapSiengeProjectMeta(r: any): SiengeProjectMeta {
  return {
    id: r.id,
    projectId: r.project_id,
    ano: r.ano,
    mes: r.mes,
    vgvMeta: Number(r.vgv_meta),
    unidadesMeta: Number(r.unidades_meta),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeProjectMetas(): Promise<SiengeProjectMeta[]> {
  const { data, error } = await supabase.from('sienge_project_metas').select('*');
  if (error) throw error;
  return (data || []).map(mapSiengeProjectMeta);
}

export async function saveSiengeProjectMeta(meta: SiengeProjectMeta) {
  const { error } = await supabase.from('sienge_project_metas').upsert({
    id: meta.id,
    project_id: meta.projectId,
    ano: meta.ano,
    mes: meta.mes,
    vgv_meta: meta.vgvMeta,
    unidades_meta: meta.unidadesMeta,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,ano,mes' });
  if (error) throw error;
}

export async function deleteSiengeProjectMeta(id: string) {
  const { error } = await supabase.from('sienge_project_metas').delete().eq('id', id);
  if (error) throw error;
}

function mapSiengeProjectTotal(r: any): SiengeProjectTotal {
  return {
    id: r.id,
    projectId: r.project_id,
    vgvTotal: Number(r.vgv_total),
    unidadesTotal: Number(r.unidades_total),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeProjectTotais(): Promise<SiengeProjectTotal[]> {
  const { data, error } = await supabase.from('sienge_project_totais').select('*');
  if (error) throw error;
  return (data || []).map(mapSiengeProjectTotal);
}

export async function saveSiengeProjectTotal(total: SiengeProjectTotal) {
  const { error } = await supabase.from('sienge_project_totais').upsert({
    id: total.id,
    project_id: total.projectId,
    vgv_total: total.vgvTotal,
    unidades_total: total.unidadesTotal,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' });
  if (error) throw error;
}

function mapSiengeProjectDisplay(r: any): SiengeProjectDisplay {
  return {
    projectId: r.project_id,
    hidden: r.hidden,
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeProjectDisplays(): Promise<SiengeProjectDisplay[]> {
  const { data, error } = await supabase.from('sienge_project_display').select('*');
  if (error) throw error;
  return (data || []).map(mapSiengeProjectDisplay);
}

export async function saveSiengeProjectDisplay(display: SiengeProjectDisplay) {
  const { error } = await supabase.from('sienge_project_display').upsert({
    project_id: display.projectId,
    hidden: display.hidden,
    sort_order: display.sortOrder,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' });
  if (error) throw error;
}

function mapSiengeCategoriaOrcamento(r: any): SiengeCategoriaOrcamento {
  return {
    id: r.id,
    projectId: r.project_id,
    centroCusto: r.centro_custo,
    categoria: r.categoria,
    percentual: Number(r.percentual),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeCategoriaOrcamentos(): Promise<SiengeCategoriaOrcamento[]> {
  const { data, error } = await supabase.from('sienge_categoria_orcamento').select('*');
  if (error) throw error;
  return (data || []).map(mapSiengeCategoriaOrcamento);
}

export async function saveSiengeCategoriaOrcamento(item: SiengeCategoriaOrcamento) {
  const { error } = await supabase.from('sienge_categoria_orcamento').upsert({
    id: item.id,
    project_id: item.projectId,
    centro_custo: item.centroCusto,
    categoria: item.categoria,
    percentual: item.percentual,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,centro_custo,categoria' });
  if (error) throw error;
}

export async function deleteSiengeCategoriaOrcamento(id: string) {
  const { error } = await supabase.from('sienge_categoria_orcamento').delete().eq('id', id);
  if (error) throw error;
}

// ─── Sienge Tabela de Vendas (unidades, valor de tabela e revisões) ──

// `margens` chega como jsonb, então um valor pode voltar string ("10") se algum
// dia entrar por outro caminho. Normaliza pra number e descarta o que não for
// numérico — a mesma tolerância que sienge_margem_de() aplica no banco.
function mapMargens(raw: any): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  Object.entries(raw).forEach(([key, value]) => {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!isNaN(n)) out[key] = n;
  });
  return out;
}

// ─── Versões da tabela de vendas ───────────────────────────────

function mapSiengeTabelaVendaVersao(r: any): SiengeTabelaVendaVersao {
  return {
    id: r.id,
    projectId: r.project_id,
    nome: r.nome,
    sortOrder: r.sort_order,
    principal: !!r.principal,
    lpVisivel: !!r.lp_visivel,
    tabelaPublicadaEm: r.tabela_publicada_em ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeTabelaVendaVersoes(): Promise<SiengeTabelaVendaVersao[]> {
  // Sem `select('*')`: `tabela_publicada` é o snapshot inteiro da tabela por
  // versão e não tem uso no client — trazê-lo multiplicaria o payload inicial.
  const { data, error } = await supabase
    .from('sienge_tabela_vendas_versoes')
    .select('id, project_id, nome, sort_order, principal, lp_visivel, tabela_publicada_em, created_at, updated_at');
  if (error) throw error;
  return (data || []).map(mapSiengeTabelaVendaVersao);
}

export async function saveSiengeTabelaVendaVersao(versao: SiengeTabelaVendaVersao) {
  const { error } = await supabase.from('sienge_tabela_vendas_versoes').upsert({
    id: versao.id,
    project_id: versao.projectId,
    nome: versao.nome,
    sort_order: versao.sortOrder,
    principal: versao.principal,
    lp_visivel: versao.lpVisivel,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Cria uma versão como cópia de outra (colunas, regras, unidades e valores). */
export async function duplicarSiengeTabelaVendaVersao(versaoId: string, nome?: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicar_sienge_tabela_vendas_versao', {
    p_versao_id: versaoId,
    p_nome: nome ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Troca a versão principal do projeto — atômico, por causa do índice único. */
export async function definirVersaoPrincipal(versaoId: string) {
  const { error } = await supabase.rpc('definir_versao_principal', { p_versao_id: versaoId });
  if (error) throw error;
}

export async function deleteSiengeTabelaVendaVersao(id: string) {
  const { error } = await supabase.from('sienge_tabela_vendas_versoes').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchSiengeTabelaVendaConfigs(): Promise<SiengeTabelaVendaConfig[]> {
  const { data, error } = await supabase.from('sienge_tabela_vendas_config').select('*');
  if (error) throw error;
  return (data || []).map((r: any) => ({
    projectId: r.project_id,
    colunasVinculadas: r.colunas_vinculadas || [],
  }));
}

export async function saveSiengeTabelaVendaConfig(config: SiengeTabelaVendaConfig) {
  const { error } = await supabase.from('sienge_tabela_vendas_config').upsert({
    project_id: config.projectId,
    colunas_vinculadas: config.colunasVinculadas,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' });
  if (error) throw error;
}

function mapSiengeTabelaVendaUnidade(r: any): SiengeTabelaVendaUnidade {
  return {
    id: r.id,
    projectId: r.project_id,
    versaoId: r.versao_id,
    unidade: r.unidade,
    imovel: r.imovel ?? null,
    valorTabela: Number(r.valor_tabela),
    situacao: r.situacao,
    camposExtra: r.campos_extra || {},
    margens: mapMargens(r.margens),
    descricao: r.descricao,
    compradorAtual: r.comprador,
    situacaoMotivo: r.situacao_motivo ?? null,
    frozenSince: r.frozen_since,
    vendaConfirmadaEm: r.venda_confirmada_em ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const TABELA_VENDAS_PAGE = 1000;

export async function fetchSiengeTabelaVendas(): Promise<SiengeTabelaVendaUnidade[]> {
  // O PostgREST corta em 1000 linhas e não avisa: a tabela já passou disso
  // somando os projetos, e o que sobrava sumia do VGV/saldo sem erro nenhum.
  // O order('id') é o que mantém as páginas estáveis — sem ORDER BY o Postgres
  // não garante a mesma ordem entre as consultas, e as faixas pulariam linhas.
  const rows: any[] = [];
  for (let from = 0; ; from += TABELA_VENDAS_PAGE) {
    const { data, error } = await supabase
      .from('sienge_tabela_vendas')
      .select('*')
      .order('id')
      .range(from, from + TABELA_VENDAS_PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < TABELA_VENDAS_PAGE) break;
  }
  return rows.map(mapSiengeTabelaVendaUnidade);
}

export async function saveSiengeTabelaVenda(item: SiengeTabelaVendaUnidade) {
  const { error } = await supabase.from('sienge_tabela_vendas').upsert({
    id: item.id,
    project_id: item.projectId,
    versao_id: item.versaoId,
    unidade: item.unidade,
    imovel: item.imovel,
    valor_tabela: item.valorTabela,
    situacao: item.situacao,
    campos_extra: item.camposExtra || {},
    // `margens` NÃO entra aqui de propósito. A margem compõe o valor: gravá-la
    // exige mover o valor pelo delta, conta que vive só em
    // set_sienge_tabela_vendas_margem. Um upsert de linha escreveria a margem
    // sem mexer no valor e as duas ficariam incoerentes — foi assim que o
    // Gênova ganhou margem sem o valor acompanhar.
    descricao: item.descricao,
    comprador: item.compradorAtual,
    venda_confirmada_em: item.vendaConfirmadaEm,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,versao_id,unidade' });
  if (error) throw error;
}

export async function deleteSiengeTabelaVenda(id: string) {
  const { error } = await supabase.from('sienge_tabela_vendas').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAllSiengeTabelaVendasByProject(projectId: string) {
  const { error } = await supabase.from('sienge_tabela_vendas').delete().eq('project_id', projectId);
  if (error) throw error;
}

function mapSiengeTabelaVendaColuna(r: any): SiengeTabelaVendaColuna {
  return {
    id: r.id,
    projectId: r.project_id,
    versaoId: r.versao_id,
    key: r.key,
    label: r.label,
    tipo: r.tipo,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeTabelaVendaColunas(): Promise<SiengeTabelaVendaColuna[]> {
  const { data, error } = await supabase.from('sienge_tabela_vendas_colunas').select('*');
  if (error) throw error;
  return (data || []).map(mapSiengeTabelaVendaColuna);
}

export async function saveSiengeTabelaVendaColuna(coluna: SiengeTabelaVendaColuna) {
  const { error } = await supabase.from('sienge_tabela_vendas_colunas').upsert({
    id: coluna.id,
    project_id: coluna.projectId,
    versao_id: coluna.versaoId,
    key: coluna.key,
    label: coluna.label,
    tipo: coluna.tipo,
    sort_order: coluna.sortOrder,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteSiengeTabelaVendaColuna(id: string) {
  const { error } = await supabase.from('sienge_tabela_vendas_colunas').delete().eq('id', id);
  if (error) throw error;
}

function mapSiengeTabelaVendaRevisao(r: any): SiengeTabelaVendaRevisao {
  return {
    id: r.id,
    projectId: r.project_id,
    versaoId: r.versao_id,
    numero: r.numero,
    tipo: r.tipo,
    percentual: Number(r.percentual),
    unidadesAfetadas: r.unidades_afetadas,
    unidades: r.unidades,
    descricao: r.descricao,
    motivo: r.motivo ?? null,
    temBackup: !!r.tem_backup,
    revertidaEm: r.revertida_em ?? null,
    createdAt: r.created_at,
    colunas: r.colunas ?? null,
  };
}

export async function fetchSiengeTabelaVendaRevisoes(): Promise<SiengeTabelaVendaRevisao[]> {
  // Colunas explícitas para não arrastar o `snapshot` (o backup completo da
  // tabela) em toda revisão; `tem_backup` já resume o que a tela precisa.
  const { data, error } = await supabase
    .from('sienge_tabela_vendas_revisoes')
    .select('id,project_id,versao_id,numero,tipo,percentual,unidades_afetadas,unidades,descricao,motivo,tem_backup,revertida_em,created_at,colunas');
  if (error) throw error;
  return (data || []).map(mapSiengeTabelaVendaRevisao);
}

/**
 * Caminho único para mudar a situação de unidades. A função no banco exige
 * motivo sempre, e comprador quando o destino é venda ou permuta — é ela que
 * autoriza o congelamento do snapshot que alimenta o orçamento real.
 */
export async function alterarSituacaoUnidades(params: {
  projectId: string;
  unidadeIds: string[];
  situacao: SiengeVendaSituacao;
  motivo: string;
  comprador?: string | null;
  data?: string | null;
}): Promise<number> {
  const { data, error } = await supabase.rpc('alterar_situacao_unidades', {
    p_project_id: params.projectId,
    p_unidade_ids: params.unidadeIds,
    p_situacao: params.situacao,
    p_motivo: params.motivo,
    p_comprador: params.comprador ?? null,
    p_data: params.data ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Restaura os valores da tabela a partir do backup de uma revisão. */
export async function reverterSiengeTabelaVendasRevisao(revisaoId: string): Promise<number> {
  const { data, error } = await supabase.rpc('reverter_sienge_tabela_vendas_revisao', { p_revisao_id: revisaoId });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Aprova os valores atuais de uma versão como o que a LP passa a servir nela. */
export async function publicarTabelaLpCorretorVersao(versaoId: string): Promise<string> {
  const { data, error } = await supabase.rpc('publicar_tabela_lp_corretor_versao', { p_versao_id: versaoId });
  if (error) throw error;
  return String(data);
}

function mapSiengeVenda(r: any): SiengeVenda {
  return {
    id: r.id,
    unidadeId: r.unidade_id,
    projectId: r.project_id,
    unidade: r.unidade,
    valorCongelado: Number(r.valor_congelado),
    camposExtraCongelados: r.campos_extra_congelados || {},
    comprador: r.comprador,
    dataVenda: r.data_venda,
    dataDistrato: r.data_distrato,
    motivo: r.motivo ?? null,
    situacaoOrigem: r.situacao_origem ?? null,
    motivoDistrato: r.motivo_distrato ?? null,
  };
}

// Só leitura: sienge_vendas é escrita exclusivamente pelo trigger
// handle_sienge_tabela_venda_situacao_change no banco, nunca pelo client.
export async function fetchSiengeVendas(): Promise<SiengeVenda[]> {
  const { data, error } = await supabase.from('sienge_vendas').select('*');
  if (error) throw error;
  return (data || []).map(mapSiengeVenda);
}

export async function fetchSiengeOrcamentoConfig(): Promise<SiengeOrcamentoConfig> {
  const { data, error } = await supabase
    .from('sienge_orcamento_config')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw error;
  return { controleInicio: data?.controle_inicio || new Date().toISOString().slice(0, 10) };
}

export async function saveSiengeOrcamentoConfig(config: SiengeOrcamentoConfig) {
  const { error } = await supabase.from('sienge_orcamento_config').upsert({
    id: 'default',
    controle_inicio: config.controleInicio,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

function mapSiengeCalculoRegra(r: any): SiengeCalculoRegra {
  return {
    id: r.id,
    projectId: r.project_id,
    versaoId: r.versao_id,
    vinculoKey: r.vinculo_key,
    titulo: r.titulo,
    quantidade: r.quantidade,
    quantidadeColunaKey: r.quantidade_coluna_key ?? null,
    operacao: r.operacao === 'multiplicar' ? 'multiplicar' : 'dividir',
    percentual: Number(r.percentual),
    colunaBaseKey: r.coluna_base_key,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeCalculoRegras(): Promise<SiengeCalculoRegra[]> {
  const { data, error } = await supabase.from('sienge_calculo_regras').select('*');
  if (error) throw error;
  return (data || []).map(mapSiengeCalculoRegra);
}

export async function saveSiengeCalculoRegra(regra: SiengeCalculoRegra) {
  const { error } = await supabase.from('sienge_calculo_regras').upsert({
    id: regra.id,
    project_id: regra.projectId,
    versao_id: regra.versaoId,
    titulo: regra.titulo,
    quantidade: regra.quantidade,
    quantidade_coluna_key: regra.quantidadeColunaKey ?? null,
    operacao: regra.operacao === 'multiplicar' ? 'multiplicar' : 'dividir',
    percentual: regra.percentual,
    coluna_base_key: regra.colunaBaseKey,
    sort_order: regra.sortOrder,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteSiengeCalculoRegra(id: string) {
  const { error } = await supabase.from('sienge_calculo_regras').delete().eq('id', id);
  if (error) throw error;
}

function mapSiengeValidacao(r: any): SiengeValidacao {
  return {
    id: r.id,
    projectId: r.project_id,
    versaoId: r.versao_id,
    tipo: r.tipo === 'valor_unidade' ? 'valor_unidade' : 'parcelas',
    titulo: r.titulo || '',
    termos: Array.isArray(r.termos) ? r.termos : [],
    referenciaKey: r.referencia_key ?? null,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchSiengeValidacoes(): Promise<SiengeValidacao[]> {
  const { data, error } = await supabase.from('sienge_validacoes').select('*');
  if (error) throw error;
  return (data || []).map(mapSiengeValidacao);
}

export async function saveSiengeValidacao(validacao: SiengeValidacao) {
  const { error } = await supabase.from('sienge_validacoes').upsert({
    id: validacao.id,
    project_id: validacao.projectId,
    versao_id: validacao.versaoId,
    tipo: validacao.tipo,
    titulo: validacao.titulo,
    termos: validacao.termos,
    referencia_key: validacao.referenciaKey,
    sort_order: validacao.sortOrder,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteSiengeValidacao(id: string) {
  const { error } = await supabase.from('sienge_validacoes').delete().eq('id', id);
  if (error) throw error;
}

export async function applySiengeTabelaVendasReajuste(params: {
  projectId: string;
  /** Versão a reajustar. Omitido cai na versão principal do empreendimento. */
  versaoId?: string | null;
  unidadeIds: string[] | null;
  percentual: number;
  descricao?: string | null;
  /** Obrigatório — a função no banco recusa a chamada sem ele. */
  motivo: string;
  /** Keys a reajustar ('valor_tabela' e/ou keys de coluna extra). Vazio/omitido cai em ['valor_tabela']. */
  colunas?: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('apply_sienge_tabela_vendas_reajuste', {
    p_project_id: params.projectId,
    p_versao_id: params.versaoId || null,
    p_unidade_ids: params.unidadeIds,
    p_percentual: params.percentual,
    p_descricao: params.descricao ?? null,
    p_motivo: params.motivo,
    p_colunas: params.colunas && params.colunas.length > 0 ? params.colunas : null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Grava a margem de UMA coluna em várias unidades de uma vez. `valor` 0 (ou
 * null) remove a margem — "sem margem" e "margem zero" são o mesmo estado.
 * Retorna quantas unidades foram alteradas.
 */
export async function setSiengeTabelaVendasMargem(params: {
  projectId: string;
  /** Versão alvo. Omitido cai na versão principal do empreendimento. */
  versaoId?: string | null;
  /** null = todas as unidades da versão. */
  unidadeIds: string[] | null;
  /** 'valor_tabela' ou a key de uma coluna extra. */
  coluna: string;
  valor: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc('set_sienge_tabela_vendas_margem', {
    p_project_id: params.projectId,
    p_versao_id: params.versaoId || null,
    p_unidade_ids: params.unidadeIds,
    p_coluna: params.coluna,
    p_valor: params.valor,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// ─── Sienge Alçada Config ──────────────────────────────────────

export async function fetchSiengeAlcadaConfig(): Promise<SiengeAlcadaConfig> {
  const { data, error } = await supabase
    .from('sienge_alcada_config')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw error;
  return {
    alcada1UserId: data?.alcada_1_user_id || undefined,
    alcada2UserId: data?.alcada_2_user_id || undefined,
    alcada3UserId: data?.alcada_3_user_id || undefined,
  };
}

export async function saveSiengeAlcadaConfig(config: SiengeAlcadaConfig) {
  const { error } = await supabase.from('sienge_alcada_config').upsert({
    id: 'default',
    alcada_1_user_id: config.alcada1UserId || null,
    alcada_2_user_id: config.alcada2UserId || null,
    alcada_3_user_id: config.alcada3UserId || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ─── WhatsApp (WAHA) ───────────────────────────────────────────

export async function fetchWhatsAppConfig(): Promise<WhatsAppConfig> {
  const { data, error } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw error;
  return {
    enabled: data?.enabled ?? false,
    baseUrl: data?.base_url || undefined,
    session: data?.session || 'default',
  };
}

export async function saveWhatsAppConfig(config: WhatsAppConfig) {
  const { error } = await supabase.from('whatsapp_config').upsert({
    id: 'default',
    enabled: config.enabled,
    base_url: config.baseUrl || null,
    session: config.session || 'default',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Últimos envios, para o painel de integrações diagnosticar falhas. */
export async function fetchWhatsAppOutbox(limit = 20): Promise<WhatsAppOutboxItem[]> {
  const { data, error } = await supabase
    .from('whatsapp_outbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r: any): WhatsAppOutboxItem => ({
    id: r.id,
    notificationId: r.notification_id || undefined,
    userId: r.user_id || undefined,
    phone: r.phone,
    message: r.message,
    status: r.status,
    attempts: r.attempts ?? 0,
    lastError: r.last_error || undefined,
    createdAt: r.created_at,
    sentAt: r.sent_at || undefined,
  }));
}

// ─── Sienge Lotes ──────────────────────────────────────────────

export async function fetchSiengeLotes(): Promise<SiengeLote[]> {
  const { data, error } = await supabase
    .from('sienge_lotes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any): SiengeLote => ({
    id: r.id,
    nome: r.nome,
    status: r.status,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    vencimento: r.vencimento,
    prazoPagamento: r.prazo_pagamento,
  }));
}

export async function saveSiengeLote(lote: SiengeLote) {
  const { error } = await supabase.from('sienge_lotes').upsert({
    id: lote.id,
    nome: lote.nome,
    status: lote.status,
    vencimento: lote.vencimento || null,
    prazo_pagamento: lote.prazoPagamento || null,
    closed_at: lote.closedAt || null,
  });
  if (error) throw error;
}

export async function deleteSiengeLote(id: string) {
  const { error } = await supabase.from('sienge_lotes').delete().eq('id', id);
  if (error) throw error;
}

// ─── Sienge Faturas (Cartão de Crédito) ─────────────────────────

export async function fetchSiengeFaturas(): Promise<SiengeFatura[]> {
  const { data, error } = await supabase
    .from('sienge_faturas')
    .select('*')
    .order('seq', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any): SiengeFatura => ({
    id: r.id,
    codigo: r.codigo,
    seq: r.seq,
    status: r.status,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    vencimento: r.vencimento,
    prazoPagamento: r.prazo_pagamento,
    tituloId: r.titulo_id,
  }));
}

export async function saveSiengeFatura(fatura: SiengeFatura) {
  const { error } = await supabase.from('sienge_faturas').upsert({
    id: fatura.id,
    codigo: fatura.codigo,
    status: fatura.status,
    vencimento: fatura.vencimento || null,
    prazo_pagamento: fatura.prazoPagamento || null,
    closed_at: fatura.closedAt || null,
    titulo_id: fatura.tituloId || null,
  });
  if (error) throw error;
}

export async function deleteSiengeFatura(id: string) {
  const { error } = await supabase.from('sienge_faturas').delete().eq('id', id);
  if (error) throw error;
}

// ─── Sienge Taxonomia (Centro de Custo / Categoria / Subcategoria) ──

export async function fetchSiengeCentrosCusto(): Promise<SiengeCentroCustoDef[]> {
  const { data, error } = await supabase.from('sienge_centros_custo').select('*').order('nome');
  if (error) throw error;
  return (data || []).map((r: any): SiengeCentroCustoDef => ({ id: r.id, nome: r.nome, createdAt: r.created_at }));
}

export async function addSiengeCentroCusto(nome: string): Promise<void> {
  const { error } = await supabase.from('sienge_centros_custo').insert({ nome });
  if (error) throw error;
}

export async function fetchSiengeCategorias(): Promise<SiengeCategoriaDef[]> {
  const { data, error } = await supabase.from('sienge_categorias').select('*').order('categoria');
  if (error) throw error;
  return (data || []).map((r: any): SiengeCategoriaDef => ({
    id: r.id, centroCusto: r.centro_custo, categoria: r.categoria, createdAt: r.created_at,
  }));
}

export async function addSiengeCategoria(centroCusto: string, categoria: string): Promise<void> {
  const { error } = await supabase.from('sienge_categorias').insert({ centro_custo: centroCusto, categoria });
  if (error) throw error;
}

export async function renameSiengeCategoria(id: string, categoria: string): Promise<void> {
  const { error } = await supabase.from('sienge_categorias').update({ categoria }).eq('id', id);
  if (error) throw error;
}

// Cascata: apagar a categoria remove suas subcategorias (FK on delete cascade).
export async function deleteSiengeCategoria(id: string): Promise<void> {
  const { error } = await supabase.from('sienge_categorias').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchSiengeSubcategorias(): Promise<SiengeSubcategoriaDef[]> {
  const { data, error } = await supabase.from('sienge_subcategorias').select('*').order('subcategoria');
  if (error) throw error;
  return (data || []).map((r: any): SiengeSubcategoriaDef => ({
    id: r.id, categoriaId: r.categoria_id, subcategoria: r.subcategoria, createdAt: r.created_at,
  }));
}

export async function addSiengeSubcategoria(categoriaId: string, subcategoria: string): Promise<void> {
  const { error } = await supabase.from('sienge_subcategorias').insert({ categoria_id: categoriaId, subcategoria });
  if (error) throw error;
}

export async function deleteSiengeSubcategoria(id: string): Promise<void> {
  const { error } = await supabase.from('sienge_subcategorias').delete().eq('id', id);
  if (error) throw error;
}

// ─── LP do Corretor ────────────────────────────────────────────

function mapLpCorretorConfig(r: any): LpCorretorConfig {
  return {
    projectId: r.project_id,
    slug: r.slug,
    publicada: r.publicada ?? false,
    titulo: r.titulo ?? null,
    subtitulo: r.subtitulo ?? null,
    descricao: r.descricao ?? null,
    logoEmpreendimentoUrl: r.logo_empreendimento_url ?? null,
    bannerUrl: r.banner_url ?? null,
    imagens: Array.isArray(r.imagens) ? r.imagens : [],
    plantas: Array.isArray(r.plantas) ? r.plantas : [],
    fichaTecnica: Array.isArray(r.ficha_tecnica) ? r.ficha_tecnica : [],
    imoveis: Array.isArray(r.imoveis) ? r.imoveis : [],
    bookUrl: r.book_url ?? null,
    observacoes: r.observacoes ?? null,
    cvcrmUrlTemplate: r.cvcrm_url_template ?? null,
    colunasVisiveis: Array.isArray(r.colunas_visiveis) ? r.colunas_visiveis : [],
    colunasLinha: Array.isArray(r.colunas_linha) ? r.colunas_linha : [],
    colunaTipologia: r.coluna_tipologia ?? null,
    riRegistrado: r.ri_registrado ?? true,
    validacaoHabilitada: r.validacao_habilitada ?? false,
    validacaoToken: r.validacao_token ?? '',
    tabelaPublicadaEm: r.tabela_publicada_em ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchLpCorretorConfigs(): Promise<LpCorretorConfig[]> {
  // Colunas explícitas: `tabela_publicada` guarda o snapshot inteiro da tabela
  // e não tem uso no painel — só a data da publicação importa aqui.
  const { data, error } = await supabase
    .from('sienge_lp_corretor')
    .select('project_id,slug,publicada,titulo,subtitulo,descricao,logo_empreendimento_url,banner_url,imagens,plantas,ficha_tecnica,book_url,observacoes,cvcrm_url_template,imoveis,colunas_visiveis,colunas_linha,coluna_tipologia,ri_registrado,validacao_habilitada,validacao_token,tabela_publicada_em,created_at,updated_at');
  if (error) throw error;
  return (data || []).map(mapLpCorretorConfig);
}

export class LpCorretorSlugConflictError extends Error {
  constructor() {
    super('Já existe outra LP publicada com esse endereço. Escolha outro.');
    this.name = 'LpCorretorSlugConflictError';
  }
}

export async function saveLpCorretorConfig(config: LpCorretorConfig) {
  const { error } = await supabase.from('sienge_lp_corretor').upsert({
    project_id: config.projectId,
    slug: config.slug,
    publicada: config.publicada,
    titulo: config.titulo,
    subtitulo: config.subtitulo,
    descricao: config.descricao,
    logo_empreendimento_url: config.logoEmpreendimentoUrl,
    banner_url: config.bannerUrl,
    imagens: config.imagens,
    plantas: config.plantas,
    ficha_tecnica: config.fichaTecnica,
    imoveis: config.imoveis,
    book_url: config.bookUrl,
    observacoes: config.observacoes,
    cvcrm_url_template: config.cvcrmUrlTemplate,
    colunas_visiveis: config.colunasVisiveis,
    colunas_linha: config.colunasLinha,
    coluna_tipologia: config.colunaTipologia,
    ri_registrado: config.riRegistrado,
    validacao_habilitada: config.validacaoHabilitada,
    // `validacao_token` fica fora de propósito: ele só muda por
    // regenerarTokenValidacaoLp. Se viesse no upsert, salvar o painel com uma
    // config carregada há dez minutos ressuscitaria um token já rotacionado.
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' });
  // 23505 = unique_violation; o único índice único além da PK é o do slug.
  if (error?.code === '23505') throw new LpCorretorSlugConflictError();
  if (error) throw error;
}

/**
 * Leitura pública da LP — roda com a chave anon, sem sessão. Toda a filtragem
 * (colunas visíveis, colunas calculadas já resolvidas, comprador removido)
 * acontece dentro da função get_lp_corretor, no banco.
 */
/** Sem versaoId a RPC devolve a primeira versão liberada ao corretor. */
export async function fetchLpCorretorPublic(slug: string, versaoId?: string): Promise<LpCorretorPublicData | null> {
  const { data, error } = await supabase.rpc('get_lp_corretor', { p_slug: slug, p_versao_id: versaoId ?? null });
  if (error) throw error;
  return (data as LpCorretorPublicData | null) ?? null;
}

/**
 * Leitura da página de validação — mesmo payload da pública, montado pela mesma
 * função no banco, porém a partir da tabela ao vivo. Não passa por publicação:
 * é o estado atual do Orbit, sempre. Responde null com o token errado ou com a
 * validação desligada no painel.
 */
export async function fetchLpCorretorValidacao(token: string, versaoId?: string): Promise<LpCorretorPublicData | null> {
  const { data, error } = await supabase.rpc('get_lp_corretor_validacao', { p_token: token, p_versao_id: versaoId ?? null });
  if (error) throw error;
  return (data as LpCorretorPublicData | null) ?? null;
}

/** Rotaciona o token: o link de validação que já circulou para de responder. */
export async function regenerarTokenValidacaoLp(projectId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerar_token_validacao_lp', { p_project_id: projectId });
  if (error) throw error;
  return data as string;
}


// ─── Relatório semanal do Dashboard de Vendas por e-mail ──────────
// Linha única (id = 'default'); o envio é da Edge Function `relatorio-vendas`,
// agendada pelo pg_cron. Ver migration 20260925120000.

export interface RelatorioVendasConfig {
  ativo: boolean;
  emails: string[];
  diaSemana: number; // 0 = domingo … 6 = sábado
  hora: string; // 'HH:MM', horário de Brasília
  remetenteEmail: string | null;
  remetenteNome: string;
  ultimoEnvioEm: string | null;
  ultimoEnvioStatus: string | null;
  /** Fora do Dashboard de Vendas (tela e e-mail), sem afetar a Tabela de Vendas. */
  projetosExcluidos: string[];
}

export async function fetchRelatorioVendasConfig(): Promise<RelatorioVendasConfig | null> {
  const { data, error } = await supabase.from('relatorio_vendas_config').select('*').eq('id', 'default').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ativo: data.ativo,
    emails: data.emails || [],
    diaSemana: data.dia_semana,
    hora: data.hora,
    remetenteEmail: data.remetente_email,
    remetenteNome: data.remetente_nome,
    ultimoEnvioEm: data.ultimo_envio_em,
    ultimoEnvioStatus: data.ultimo_envio_status,
    projetosExcluidos: data.projetos_excluidos || [],
  };
}

export async function saveRelatorioVendasProjetosExcluidos(projectIds: string[]) {
  const { error } = await supabase.from('relatorio_vendas_config')
    .update({ projetos_excluidos: projectIds, updated_at: new Date().toISOString() })
    .eq('id', 'default');
  if (error) throw error;
}

// Não envia projetos_excluidos: o upsert só grava as colunas presentes, então a
// lista de exclusão (editada no filtro do Dashboard) fica intacta.
export async function saveRelatorioVendasConfig(config: Omit<RelatorioVendasConfig, 'ultimoEnvioEm' | 'ultimoEnvioStatus' | 'projetosExcluidos'>) {
  const { error } = await supabase.from('relatorio_vendas_config').upsert({
    id: 'default',
    ativo: config.ativo,
    emails: config.emails,
    dia_semana: config.diaSemana,
    hora: config.hora,
    remetente_email: config.remetenteEmail,
    remetente_nome: config.remetenteNome,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Dispara o relatório agora para a lista salva, sem afetar o agendamento. */
export async function enviarRelatorioVendasAgora(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/relatorio-vendas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: '{}',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Erro ${res.status}`);
  return body.enviados ?? 0;
}

/** Conexão do número do WhatsApp (instância da Evolution), via Edge Function whatsapp-status. */
export interface WhatsAppStatus {
  estado: 'online' | 'conectando' | 'offline' | 'desativado' | 'erro';
  instancia?: string;
  numero?: string | null;
  nome?: string | null;
  detalhe?: string;
}

export async function fetchWhatsAppStatus(): Promise<WhatsAppStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada.');
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: '{}',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Erro ${res.status}`);
  return body as WhatsAppStatus;
}

// Foto diária do resumo (ver migration 20260925140000). Mesma regra da Edge
// Function relatorio-vendas: fechamento de 7 dias antes de hoje (Brasília) ou,
// enquanto o histórico não tem uma semana, a foto mais antiga antes de hoje.
export interface RelatorioVendasSnapshotRow {
  projectId: string;
  situacao: SiengeVendaSituacao;
  unidades: number;
  vgv: number;
}

export async function fetchRelatorioVendasBaseline(hoje: string, alvo: string): Promise<{ referencia: string | null; rows: RelatorioVendasSnapshotRow[] }> {
  const { data: antes, error } = await supabase.from('relatorio_vendas_snapshots')
    .select('referencia').lte('referencia', alvo).order('referencia', { ascending: false }).limit(1);
  if (error) throw error;
  let referencia: string | null = antes?.[0]?.referencia ?? null;
  if (!referencia) {
    const { data: primeira } = await supabase.from('relatorio_vendas_snapshots')
      .select('referencia').lt('referencia', hoje).order('referencia', { ascending: true }).limit(1);
    referencia = primeira?.[0]?.referencia ?? null;
  }
  if (!referencia) return { referencia: null, rows: [] };
  const { data, error: rowsError } = await supabase.from('relatorio_vendas_snapshots')
    .select('project_id, situacao, unidades, vgv').eq('referencia', referencia);
  if (rowsError) throw rowsError;
  return {
    referencia,
    rows: (data || []).map((r: any) => ({ projectId: r.project_id, situacao: r.situacao, unidades: Number(r.unidades), vgv: Number(r.vgv) })),
  };
}
