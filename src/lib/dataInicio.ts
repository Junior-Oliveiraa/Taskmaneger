// Data de início das tarefas (migração 20261122120000_tasks_data_inicio).
//
// A listagem tenta ler a coluna; se a migração ainda não foi aplicada, desliga
// o recurso até o próximo carregamento em vez de derrubar as telas: o campo
// some e nada é gravado.
export const dataInicio = { ativa: true };

/** O erro é da coluna start_date inexistente? */
export const colunaInicioAusente = (msg?: string) => !!msg && /start_date/i.test(msg);

const dia = (s?: string | null) => s?.slice(0, 10) || '';

/** Início ou prazo que já existia e está sendo alterado (ou removido). */
export interface MudancaData { campo: 'inicio' | 'prazo'; de: string; para: string }

export function mudancasDeDatas(
  antes: { startDate?: string | null; dueDate?: string | null },
  mudanca: { startDate?: string | null; dueDate?: string | null },
): MudancaData[] {
  const lista: MudancaData[] = [];
  for (const [chave, campo] of [['startDate', 'inicio'], ['dueDate', 'prazo']] as const) {
    if (!(chave in mudanca)) continue;
    const de = dia(antes[chave]), para = dia(mudanca[chave]);
    if (de && de !== para) lista.push({ campo, de, para });
  }
  return lista;
}

const br = (d: string) => d ? d.split('-').reverse().join('/') : 'sem data';
export const textoMudanca = (m: MudancaData) => `${m.campo === 'inicio' ? 'Início' : 'Prazo'} de ${br(m.de)} para ${br(m.para)}`;

/** Início depois do prazo (só quando os dois existem). */
export const inicioDepoisDoPrazo = (inicio?: string | null, prazo?: string | null) =>
  !!dia(inicio) && !!dia(prazo) && dia(inicio) > dia(prazo);

/**
 * Início e prazo não podem se cruzar. Se quem mudou foi o prazo, o início o
 * acompanha; se foi o início, a mudança é recusada.
 */
export function conciliarDatas(
  antes: { startDate?: string | null; dueDate?: string | null },
  depois: { startDate?: string | null; dueDate?: string | null },
): 'ok' | 'ajustar-inicio' | 'recusar-inicio' {
  if (!inicioDepoisDoPrazo(depois.startDate, depois.dueDate)) return 'ok';
  const mudouInicio = dia(antes.startDate) !== dia(depois.startDate);
  const mudouPrazo = dia(antes.dueDate) !== dia(depois.dueDate);
  return mudouPrazo && !mudouInicio ? 'ajustar-inicio' : 'recusar-inicio';
}
