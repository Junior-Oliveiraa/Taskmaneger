// Estado e gravação do briefing de uma classe (Copy ou Design): campos que salvam
// sozinhos, textos com salvamento atrasado e entregas gravadas na hora.
import { useRef, useState } from 'react';
import type { CopyBriefing, CopyEditorItem, Delivery, DesignBriefing, Task } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { fetchTaskBriefings } from '../../lib/api';
import { useSyncManager } from '../../lib/SyncManager';
import { cancelar, quemEnviou, resolver, situacaoDe, SituacaoTexto, textoTravado } from '../../lib/aprovacao';

type Campos = { copyBriefing: CopyBriefing; designBriefing: DesignBriefing };
export const listaDe = (val: any): string[] => Array.isArray(val) ? val : (typeof val === 'string' && val ? [val] : []);

export function useBriefing<C extends keyof Campos>({ campo, task, disabled, saveChange, formulario, derivado, prepararEntregas, aoTrocarTarefa }: {
  campo: C;
  task: Task;
  disabled: boolean;
  saveChange: (updates: Partial<Task>) => void;
  formulario: (task: Task) => Campos[C];
  /** Campos calculados a partir dos textos. */
  derivado: (textos: CopyEditorItem[]) => Partial<Campos[C]>;
  /** Passo antes de gravar entregas (ex.: subir imagens). */
  prepararEntregas?: (taskId: string, entregas: Delivery[]) => Promise<Delivery[]>;
  /** Chamado durante o render quando o painel troca de tarefa. */
  aoTrocarTarefa: () => void;
}) {
  type T = Campos[C];
  const { getPendingField, saveImmediately } = useSyncManager();
  const [form, setForm] = useState<T>(() => formulario(task));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Edições locais ainda não confirmadas no banco: valem mais que a versão relida.
  const camposPendentes = useRef<Partial<T>>({});
  const textosPendentes = useRef<Record<string, string>>({});
  const taskIdRef = useRef(task.id);
  const comPendencias = (b: T): T => ({
    ...b,
    ...camposPendentes.current,
    copyEditors: (b.copyEditors || []).map(ed => ed.id in textosPendentes.current ? { ...ed, content: textosPendentes.current[ed.id] } : ed),
  });

  // Conteúdo que cada editor está mostrando. O editor só lê `content` ao montar:
  // quando chega um texto diferente do banco, a versão muda e ele remonta.
  const mostrado = useRef<Record<string, { html: string; versao: number }>>({});
  const versaoDoTexto = (id: string, html: string) => {
    const m = (mostrado.current[id] ??= { html, versao: 0 });
    if (m.html !== html && !(id in textosPendentes.current)) { m.html = html; m.versao++; }
    return m.versao;
  };

  // O componente não desmonta ao trocar de tarefa no painel. Durante o render, e não
  // num efeito: os editores não podem montar com o conteúdo anterior.
  const [lido, setLido] = useState({ id: task.id, briefing: task[campo], disabled });
  if (lido.id !== task.id || lido.briefing !== task[campo] || lido.disabled !== disabled) {
    setLido({ id: task.id, briefing: task[campo], disabled });
    if (taskIdRef.current !== task.id) {
      taskIdRef.current = task.id;
      camposPendentes.current = {};
      textosPendentes.current = {};
      mostrado.current = {};
      setErro(null);
      aoTrocarTarefa();
    }
    setForm(comPendencias(formulario(task)));
  }

  const naTarefa = () => taskIdRef.current === task.id;
  const aplicar = (b: Partial<T>) => { if (naTarefa()) setForm(prev => comPendencias({ ...prev, ...b })); };

  // Uma gravação por vez: uma edição de texto lida antes de um envio não pode
  // voltar ao banco depois dele e apagar o envio.
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const enfileirar = <R,>(tarefa: () => Promise<R>): Promise<R> => {
    const p = fila.current.then(tarefa, tarefa);
    fila.current = p.catch(() => {});
    return p;
  };

  // Relê o briefing do servidor e aplica só o que a mudança pretende alterar, para
  // não sobrescrever o que mudou em outra tela. O que ainda está na fila do
  // SyncManager é mais novo que o banco e tem prioridade.
  const baseAtual = async (): Promise<T> => {
    let base: T = form;
    try {
      const fresh = await fetchTaskBriefings(task.id);
      if (fresh?.[campo]) base = fresh[campo] as T;
    } catch {
      // Sem conexão: segue com o estado local.
    }
    return (getPendingField(task.id, campo) as T | undefined) ?? base;
  };
  const comoTarefa = (b: T, outros?: Partial<Task>) => ({ [campo]: b, ...(outros || {}) }) as Partial<Task>;

  const salvar = (receita: (base: T) => Partial<T>) => enfileirar(async () => {
    const base = await baseAtual();
    const novo = { ...base, ...receita(base) };
    aplicar(novo);
    saveChange(comoTarefa(novo));
  });

  // Envio e decisão: espera a gravação de verdade e só então chama `avisar`, para
  // ninguém ser notificado de algo que não está no banco. A receita devolve `null`
  // quando a mudança não vale mais (já foi resolvida em outra tela).
  const gravar = async (
    receita: (base: T) => { partial: Partial<T>; taskUpdates?: Partial<Task>; avisar?: () => void } | null,
  ): Promise<boolean> => {
    // Antes da releitura: um clique duplo não pode gravar duas vezes.
    if (salvando) return false;
    setSalvando(true);
    setErro(null);
    return enfileirar(async () => {
      let tentou = false;
      let base: T = form;
      let novo: T = form;
      let taskUpdates: Partial<Task> | undefined;
      try {
        base = await baseAtual();
        const mudanca = receita(base);
        if (!mudanca) {
          aplicar(base);
          if (naTarefa()) setErro('A situação mudou em outra tela. Confira e tente de novo.');
          return false;
        }
        taskUpdates = mudanca.taskUpdates;
        novo = { ...base, ...mudanca.partial };
        if (prepararEntregas && novo.deliveries) novo = { ...novo, deliveries: await prepararEntregas(task.id, novo.deliveries) };
        tentou = true;
        await saveImmediately(task.id, comoTarefa(novo, taskUpdates));
        aplicar(novo);
        mudanca.avisar?.();
        return true;
      } catch (err: any) {
        console.error('Falha ao gravar a aprovação:', err);
        // A gravação que falhou fica na fila do SyncManager: sem isto ela entraria mais
        // tarde, sem notificar ninguém. O texto escrito é mantido.
        if (tentou) saveChange(comoTarefa({ ...base, copyEditors: novo.copyEditors }, taskUpdates?.status ? { status: task.status } : {}));
        if (naTarefa()) setErro(tentou ? 'Falha ao salvar. Verifique sua conexão e tente novamente.' : `A imagem não foi enviada. ${err?.message || 'Tente de novo.'}`);
        return false;
      } finally {
        setSalvando(false);
      }
    });
  };

  // ── Campos ── Cada escolha salva sozinha; um respiro junta cliques seguidos num envio só.
  const timerCampos = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const atual = <K extends keyof T>(chave: K): T[K] => (chave in camposPendentes.current ? camposPendentes.current[chave] as T[K] : form[chave]);
  const mudarCampos = (campos: Partial<T>) => {
    if (!naTarefa()) return;
    const pendentes = { ...camposPendentes.current, ...campos };
    camposPendentes.current = pendentes;
    setForm(prev => ({ ...prev, ...campos, isFilled: true }));
    if (timerCampos.current?.id === task.id) clearTimeout(timerCampos.current.timer);
    timerCampos.current = {
      id: task.id,
      timer: setTimeout(() => {
        void salvar(() => ({ ...pendentes, isFilled: true })).then(() => {
          if (camposPendentes.current === pendentes) camposPendentes.current = {};
        });
      }, 500),
    };
  };
  const mudarOpcao = (chave: keyof T, opcao: string, soAdicionar = false) => {
    const lista = listaDe(atual(chave));
    if (soAdicionar && lista.includes(opcao)) return;
    mudarCampos({ [chave]: lista.includes(opcao) ? lista.filter(o => o !== opcao) : [...lista, opcao] } as Partial<T>);
  };

  // ── Textos ──
  const textos = form.copyEditors || [];
  const comTextos = (copyEditors: CopyEditorItem[]) => ({ copyEditors, ...derivado(copyEditors) }) as Partial<T>;

  // Aplica a mudança a um texto. Um texto local que ainda não existe no banco vai inteiro.
  const mesclarTexto = (base: T, id: string, patch: Partial<CopyEditorItem>): CopyEditorItem[] => {
    const daBase = base.copyEditors || [];
    if (daBase.some(ed => ed.id === id)) return daBase.map(ed => ed.id === id ? { ...ed, ...patch } : ed);
    return [...daBase, { id, name: '', content: '', ...textos.find(ed => ed.id === id), ...patch }];
  };

  const timersTexto = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const chaveTimer = (id: string) => `${task.id}:${id}`;
  const cancelarAtraso = (id: string) => clearTimeout(timersTexto.current[chaveTimer(id)]);
  const agendarTexto = (id: string, html: string) => {
    cancelarAtraso(id);
    timersTexto.current[chaveTimer(id)] = setTimeout(() => {
      void salvar(base => {
        // Enviado em outra tela enquanto se escrevia aqui: vale o que foi enviado.
        const enviado = campo === 'copyBriefing' && base.copyEditors?.find(ed => ed.id === id);
        if (enviado && textoTravado(base.deliveries || [], enviado)) return {};
        return comTextos(mesclarTexto(base, id, { content: html }));
      }).then(() => {
        if (textosPendentes.current[id] === html) delete textosPendentes.current[id];
      });
    }, 800);
  };

  const escrever = (id: string, html: string) => {
    textosPendentes.current[id] = html;
    mostrado.current[id] = { html, versao: mostrado.current[id]?.versao ?? 0 };
    setForm(prev => ({ ...prev, ...comTextos((prev.copyEditors || []).map(ed => ed.id === id ? { ...ed, content: html } : ed)) }));
    agendarTexto(id, html);
  };

  const renomearTexto = (id: string, name: string) => {
    setForm(prev => ({ ...prev, copyEditors: (prev.copyEditors || []).map(ed => ed.id === id ? { ...ed, name } : ed) }));
    void salvar(base => comTextos(mesclarTexto(base, id, { name })));
  };

  const adicionarTexto = (name: string, content = ''): string => {
    const novo = { id: Date.now().toString(), name, content };
    // Os locais vão junto: o primeiro texto pode ainda não existir no banco.
    const locais = textos;
    setForm(prev => ({ ...prev, copyEditors: [...(prev.copyEditors || []), novo] }));
    void salvar(base => {
      const daBase = base.copyEditors || [];
      return comTextos([...(daBase.length ? daBase : locais), novo].filter((ed, i, arr) => arr.findIndex(o => o.id === ed.id) === i));
    });
    return novo.id;
  };

  const removerTexto = (id: string) => {
    cancelarAtraso(id);
    delete textosPendentes.current[id];
    setForm(prev => ({ ...prev, ...comTextos((prev.copyEditors || []).filter(ed => ed.id !== id)) }));
    void salvar(base => comTextos((base.copyEditors || []).filter(ed => ed.id !== id)));
  };

  return {
    form, setForm, salvar, gravar, salvando, erro, setErro, naTarefa,
    atual, mudarCampos, mudarOpcao,
    textos, comTextos, mesclarTexto, versaoDoTexto, escrever, renomearTexto, adicionarTexto, removerTexto,
    textosPendentes, cancelarAtraso, agendarTexto,
  };
}

/** Aprovar, reprovar e cancelar: grava, muda o status da tarefa e avisa quem precisa saber. */
export function useDecisoes<C extends keyof Campos>({ tipo, task, gravar, nomeDe, tudoAprovado }: {
  tipo: 'texto' | 'criativo';
  task: Task;
  gravar: ReturnType<typeof useBriefing<C>>['gravar'];
  nomeDe: (entrega: Delivery, entregas: Delivery[]) => string;
  tudoAprovado: (entregas: Delivery[], base: Campos[C]) => boolean;
}) {
  const { currentUser } = useAuth();
  const { addNotification } = useNotifications();
  const texto = tipo === 'texto';

  const decidir = (entregaId: string, decisao: 'approved' | 'rejected', justificativa: string, anotadas?: string[]) => void gravar(base => {
    const entregas = base.deliveries || [];
    const entrega = entregas.find(d => d.id === entregaId);
    const deliveries = resolver(entregas, entregaId, decisao, justificativa, currentUser, undefined, anotadas);
    if (!entrega || !deliveries) return null;
    const status = decisao === 'rejected' ? 'rework' as const
      : tudoAprovado(deliveries, base) ? 'implementation' as const : task.status;
    const alvo = `${texto ? 'O texto' : 'O criativo'} "${nomeDe(entrega, entregas)}" da tarefa "${task.title}"`;
    const destinatarios = new Set([quemEnviou(entrega), task.assigneeId].filter((id): id is string => !!id && id !== currentUser?.id));
    return {
      partial: { deliveries } as Partial<Campos[C]>,
      taskUpdates: status === task.status ? {} : { status },
      avisar: () => destinatarios.forEach(userId => addNotification({
        userId,
        actorId: currentUser?.id || 'system',
        taskId: task.id,
        type: decisao,
        message: decisao === 'approved' ? (texto ? 'Copy Aprovada! 🎉' : 'Criativo Aprovado! 🎉') : (texto ? 'Reprovação de Copy' : 'Reprovação de Criativo'),
        details: decisao === 'approved' ? `${alvo} foi aprovado.` : `${alvo} foi reprovado: ${justificativa.trim()}`,
        targetId: `${texto ? 'copy' : 'design'}-delivery-${entregaId}`,
      })),
    };
  });

  const cancelarEnvio = (entregaId: string) => void gravar(base => {
    const deliveries = cancelar(base.deliveries || [], entregaId, currentUser);
    if (!deliveries) return null;
    const tem = (s: SituacaoTexto) => deliveries.some(d => situacaoDe(d) === s);
    return {
      partial: { deliveries } as Partial<Campos[C]>,
      taskUpdates: task.status === 'approval' && !tem('pendente') ? { status: tem('reprovado') ? 'rework' : 'in_progress' } : {},
    };
  });

  /** Aviso para quem vai aprovar. */
  const pedirAprovacao = (aprovadorId: string, entregaId: string, nome: string) => addNotification({
    userId: aprovadorId,
    actorId: currentUser?.id || 'system',
    taskId: task.id,
    type: 'review_requested',
    message: texto ? 'Aprovação de Copy' : 'Aprovação de Criativo',
    details: `Você foi escolhido para aprovar ${texto ? 'o texto' : 'o criativo'} "${nome}" na tarefa "${task.title}".`,
    targetId: `${texto ? 'copy' : 'design'}-delivery-${entregaId}`,
  });

  return { decidir, cancelarEnvio, pedirAprovacao };
}
