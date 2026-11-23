// Aprovação dos textos da copy e dos criativos do design. Cada um tem uma entrega;
// cada envio dentro dela é uma rodada, que termina aprovada, reprovada (com justificativa) ou cancelada.
import type { CopyEditorItem, Delivery, DeliveryThreadMessage } from '../types';

type Pessoa = { id?: string; name?: string } | null | undefined;

export type SituacaoTexto = 'livre' | 'pendente' | 'reprovado' | 'aprovado';

export interface Comentario { id: string; autor: string; texto: string; citacao?: string; em: string }

export interface Rodada {
  id: string;
  entregaId: string;
  /** Nome do texto ou do criativo. */
  nome: string;
  /** 1 no primeiro envio daquele item, 2 no segundo… */
  numero: number;
  html: string;
  imagens: string[];
  enviadoEm: string;
  enviadoPor?: string;
  aprovadorId?: string;
  resultado: 'pendente' | 'aprovado' | 'reprovado' | 'cancelado';
  resolvidoEm?: string;
  resolvidoPor?: string;
  justificativa?: string;
  /** Imagens rabiscadas na reprovação. */
  anotadas: string[];
  /** Conversas das aprovações antigas. */
  comentarios: Comentario[];
}

/** Textos que o sistema gravava sozinho: o evento já diz o mesmo. */
const AUTOMATICOS = new Set(['Nova entrega de copy', 'Nova entrega', 'Nova versão enviada', 'Aprovado!', 'Vou refazer a arte.', 'Reprovado sem justificativa']);
const escrito = (s?: string) => (s && !AUTOMATICOS.has(s) ? s.trim() : '');

const aguardando = (d: Delivery) => d.status === 'pending' || d.status === 'review_requested';
const ultimoEnvio = (d: Delivery) => [...(d.thread || [])].reverse().find(m => m.type === 'submission');

/** Pessoa que enviou a versão atual. */
export const quemEnviou = (d: Delivery) => ultimoEnvio(d)?.authorId;

/** HTML da versão enviada por último. */
export const htmlEnviado = (d: Delivery) => ultimoEnvio(d)?.copyText;

const pertence = (d: Delivery, t: CopyEditorItem) => {
  const envio = ultimoEnvio(d);
  // Envios antigos só guardavam o nome do texto.
  return envio?.copyEditorId ? envio.copyEditorId === t.id : !!envio?.editorName && envio.editorName === t.name;
};

/** Imagens atuais do criativo. */
export const imagensDe = (d: Pick<Delivery, 'imageUrl' | 'imageUrls'>): string[] =>
  d.imageUrls?.length ? d.imageUrls.filter(Boolean) : d.imageUrl ? [d.imageUrl] : [];

// Envios antigos de criativo não guardavam as imagens: ficam registradas antes de mudar.
function comImagensRegistradas(d: Delivery): Delivery {
  const envio = ultimoEnvio(d);
  const imagens = imagensDe(d);
  if (!envio || imagens.length === 0 || imagensDe(envio).length > 0) return d;
  return { ...d, thread: d.thread.map(m => m.id === envio.id ? { ...m, imageUrl: imagens[0], imageUrls: imagens } : m) };
}

/** Entrega atual do texto: a que aguarda decisão ou, sem nenhuma, a mais recente. */
export function entregaDoTexto(entregas: Delivery[], texto: CopyEditorItem): Delivery | undefined {
  const dele = entregas.filter(d => pertence(d, texto))
    .sort((a, b) => (ultimoEnvio(b)?.createdAt || b.createdAt).localeCompare(ultimoEnvio(a)?.createdAt || a.createdAt));
  return dele.find(aguardando) ?? dele[0];
}

export function situacaoDe(d?: Delivery): SituacaoTexto {
  if (!d) return 'livre';
  if (aguardando(d)) return 'pendente';
  if (d.status === 'approved') return 'aprovado';
  const decisao = [...(d.thread || [])].reverse().find(m => m.action === 'rejected' || m.action === 'approved');
  return decisao?.action === 'rejected' || d.status === 'rejected' ? 'reprovado' : 'livre';
}

/** Enviada ou aprovada: não pode mais ser editada. */
export const entregaTravada = (d?: Delivery) => ['pendente', 'aprovado'].includes(situacaoDe(d));

/** Enviado ou aprovado: o texto não pode mais ser editado. */
export const textoTravado = (entregas: Delivery[], texto: CopyEditorItem) =>
  entregaTravada(entregaDoTexto(entregas, texto));

/** Entregas aguardando decisão cujo texto não existe mais (ou mudou de nome). */
export const pendentesSemTexto = (entregas: Delivery[], textos: CopyEditorItem[]) =>
  entregas.filter(d => aguardando(d) && !textos.some(t => pertence(d, t)));

/** Todos os textos enviados foram aprovados. */
export function tudoAprovado(entregas: Delivery[], textos: CopyEditorItem[]): boolean {
  const situacoes = textos.map(t => situacaoDe(entregaDoTexto(entregas, t))).filter(s => s !== 'livre');
  return entregas.some(d => d.status === 'approved')
    && situacoes.every(s => s === 'aprovado')
    && pendentesSemTexto(entregas, textos).length === 0;
}

/** Todos os criativos enviados foram aprovados. */
export function criativosAprovados(entregas: Delivery[]): boolean {
  const situacoes = entregas.map(situacaoDe).filter(s => s !== 'livre');
  return situacoes.length > 0 && situacoes.every(s => s === 'aprovado');
}

let seq = 0;
function comMensagem(d: Delivery, msg: Omit<DeliveryThreadMessage, 'id' | 'createdAt'>, agora: string): Delivery {
  const thread = d.thread || [];
  const maior = Math.max(1, ...thread.map(m => m.majorVersion || 1));
  const menor = Math.max(0, ...thread.filter(m => (m.majorVersion || 1) === maior).map(m => m.minorVersion || 0));
  const envio = msg.type === 'submission';
  return {
    ...d,
    thread: [...thread, {
      ...msg,
      id: `${Date.parse(agora)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      majorVersion: envio && thread.length ? maior + 1 : maior,
      minorVersion: envio ? 0 : menor + 1,
      createdAt: agora,
    }],
  };
}

/** Envia o texto. `null` se ele já está em aprovação ou aprovado. */
export function enviar(entregas: Delivery[], texto: CopyEditorItem, aprovadorId: string, autor: Pessoa, agora = new Date().toISOString()): { entregas: Delivery[]; id: string } | null {
  const atual = entregaDoTexto(entregas, texto);
  const situacao = situacaoDe(atual);
  if (situacao === 'pendente' || situacao === 'aprovado') return null;
  const base: Delivery = atual ?? { id: `${Date.parse(agora)}${Math.random().toString(36).slice(2, 6)}`, status: 'pending', thread: [], createdAt: agora };
  const nova: Delivery = {
    ...comMensagem(base, {
      role: 'designer', type: 'submission', content: '', copyText: texto.content, editorName: texto.name, copyEditorId: texto.id,
      approverId: aprovadorId, authorId: autor?.id, authorName: autor?.name,
    }, agora),
    status: 'pending',
    approverId: aprovadorId,
  };
  return { id: nova.id, entregas: atual ? entregas.map(d => d.id === nova.id ? nova : d) : [...entregas, nova] };
}

/** Muda um criativo. `null` se ele já está em aprovação ou aprovado. */
export function editarCriativo(entregas: Delivery[], id: string, mudar: (d: Delivery) => Partial<Delivery>): Delivery[] | null {
  const alvo = entregas.find(d => d.id === id);
  if (!alvo || entregaTravada(alvo)) return null;
  const base = comImagensRegistradas(alvo);
  return entregas.map(d => d.id === id ? { ...base, ...mudar(base) } : d);
}

/** Envia o criativo. `null` se ele já está em aprovação ou aprovado, ou se não tem imagem. */
export function enviarCriativo(entregas: Delivery[], id: string, aprovadorId: string, autor: Pessoa, agora = new Date().toISOString()): Delivery[] | null {
  const alvo = entregas.find(d => d.id === id);
  if (!alvo || imagensDe(alvo).length === 0) return null;
  return editarCriativo(entregas, id, d => {
    const imagens = imagensDe(d);
    return {
      ...comMensagem(d, {
        role: 'designer', type: 'submission', content: '', imageUrl: imagens[0], imageUrls: imagens,
        approverId: aprovadorId, editorName: autor?.name, authorId: autor?.id, authorName: autor?.name,
      }, agora),
      status: 'pending',
      approverId: aprovadorId,
    };
  });
}

/** Aprova ou reprova. `null` se a entrega não está mais aguardando ou falta a justificativa. */
export function resolver(entregas: Delivery[], id: string, decisao: 'approved' | 'rejected', justificativa: string, autor: Pessoa, agora = new Date().toISOString(), anotadas: string[] = []): Delivery[] | null {
  const alvo = entregas.find(d => d.id === id);
  if (!alvo || !aguardando(alvo) || (decisao === 'rejected' && !justificativa.trim())) return null;
  const nova: Delivery = {
    ...comMensagem(comImagensRegistradas(alvo), {
      role: 'manager', type: 'feedback', action: decisao, content: justificativa.trim(),
      editorName: autor?.name, authorId: autor?.id, authorName: autor?.name,
      ...(anotadas.some(Boolean) ? { annotatedImageUrls: anotadas.filter(Boolean) } : {}),
    }, agora),
    status: decisao,
  };
  return entregas.map(d => d.id === id ? nova : d);
}

/** Desfaz o envio: o texto volta a ser editável e o cancelamento fica no histórico. */
export function cancelar(entregas: Delivery[], id: string, autor: Pessoa, agora = new Date().toISOString()): Delivery[] | null {
  const alvo = entregas.find(d => d.id === id);
  if (!alvo || !aguardando(alvo)) return null;
  const nova: Delivery = {
    ...comMensagem(alvo, { role: 'designer', type: 'reply', action: 'canceled', content: '', authorId: autor?.id, authorName: autor?.name }, agora),
    status: 'reworking',
  };
  return entregas.map(d => d.id === id ? nova : d);
}

/**
 * Todas as rodadas, da mais recente para a mais antiga. `nomeDe` dá o nome dos
 * criativos; nos textos o nome está no próprio envio.
 */
export function rodadasDe(entregas: Delivery[], nomeDe?: (d: Delivery) => string): Rodada[] {
  const todas: Rodada[] = [];
  for (const d of entregas) {
    const daEntrega: Rodada[] = [];
    const ultimoId = ultimoEnvio(d)?.id;
    const abrir = (m: Partial<DeliveryThreadMessage>) => {
      const anterior = daEntrega[daEntrega.length - 1];
      daEntrega.push({
        id: m.id || d.id,
        entregaId: d.id,
        nome: nomeDe?.(d) || (m.type === 'submission' && m.editorName) || anterior?.nome || 'Texto',
        numero: 0,
        html: m.copyText || anterior?.html || '',
        imagens: m.type === 'submission'
          ? (imagensDe(m).length ? imagensDe(m) : m.id === ultimoId ? imagensDe(d) : [])
          : anterior?.imagens ?? [],
        enviadoEm: m.createdAt || d.createdAt,
        enviadoPor: m.authorName || (nomeDe ? m.editorName : undefined),
        aprovadorId: m.approverId,
        resultado: 'pendente',
        anotadas: [],
        comentarios: [],
      });
      return daEntrega[daEntrega.length - 1];
    };
    const comentar = (r: Rodada, m: DeliveryThreadMessage) => {
      const texto = escrito(m.content);
      if (texto) r.comentarios.push({ id: m.id, autor: m.authorName || m.editorName || '', texto, citacao: m.type === 'chat' ? m.copyText : undefined, em: m.createdAt });
    };

    for (const m of d.thread || []) {
      const atual = daEntrega[daEntrega.length - 1];
      if (m.type === 'submission') comentar(abrir(m), m);
      else if (m.action === 'request_review') comentar(atual?.resultado === 'pendente' ? atual : abrir({ ...m, copyText: undefined }), m);
      else if (m.action === 'approved' || m.action === 'rejected') {
        const r = atual?.resultado === 'pendente' ? atual : abrir({ id: m.id, createdAt: m.createdAt });
        r.resultado = m.action === 'approved' ? 'aprovado' : 'reprovado';
        r.resolvidoEm = m.createdAt;
        r.resolvidoPor = m.authorName || m.editorName;
        r.justificativa = escrito(m.content) || undefined;
        r.anotadas = (m.annotatedImageUrls?.length ? m.annotatedImageUrls : [m.annotatedImageUrl]).filter((u): u is string => !!u);
      } else if (m.action === 'canceled' && atual?.resultado === 'pendente') {
        atual.resultado = 'cancelado';
        atual.resolvidoEm = m.createdAt;
        atual.resolvidoPor = m.authorName;
      } else if (atual) comentar(atual, m);
    }

    const ultima = daEntrega[daEntrega.length - 1];
    if (ultima) {
      ultima.aprovadorId ??= d.approverId;
      // Entrega antiga resolvida sem a mensagem correspondente.
      if (ultima.resultado === 'pendente' && !aguardando(d)) ultima.resultado = d.status === 'approved' ? 'aprovado' : 'reprovado';
    }
    todas.push(...daEntrega);
  }

  todas.sort((a, b) => a.enviadoEm.localeCompare(b.enviadoEm));
  const contagem = new Map<string, number>();
  for (const r of todas) {
    const chave = nomeDe ? r.entregaId : r.nome;
    const n = (contagem.get(chave) ?? 0) + 1;
    contagem.set(chave, n);
    r.numero = n;
  }
  return todas.reverse();
}
