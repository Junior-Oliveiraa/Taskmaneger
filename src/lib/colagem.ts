// Conteúdo colado → padrão do nosso editor. Mantém a estrutura (negrito, itálico,
// listas, tabelas, links, títulos) e descarta a aparência da origem (fonte, cor,
// tamanho, espaçamento de Word, Docs, e-mail e sites).

/** Tamanhos do editor usados nos títulos colados. */
const TAMANHO_TITULO: Record<string, string> = { H1: '24px', H2: '18px', H3: '18px' };

const REMOVER = 'style,script,meta,link,title,xml,noscript,svg,button,iframe,object,embed,input,select,textarea,video,audio,canvas';

const BLOCO = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'HR', 'FIGURE', 'DL', 'DT', 'DD']);

const ATRIBUTOS: Record<string, string[]> = {
  A: ['href'],
  IMG: ['src', 'alt'],
  TD: ['colspan', 'rowspan'],
  TH: ['colspan', 'rowspan'],
  OL: ['start'],
};

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function desembrulhar(el: Element) {
  while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el);
  el.remove();
}

/** Envolve o conteúdo do elemento numa tag. */
function envolver(el: Element, tag: string): Element {
  const novo = el.ownerDocument.createElement(tag);
  while (el.firstChild) novo.appendChild(el.firstChild);
  el.appendChild(novo);
  return novo;
}

// ─── Listas ──────────────────────────────────────────────────────────

interface ItemLista { nivel: number; ordenada: boolean; html: string; numero?: number; feito?: boolean }

/** Itens em sequência, com nível, viram listas aninhadas. */
function montarLista(itens: ItemLista[]): string {
  let saida = '';
  let i = 0;
  while (i < itens.length) {
    const { nivel, ordenada, numero, feito } = itens[i];
    const tarefa = feito !== undefined;
    let lis = '';
    while (i < itens.length && itens[i].nivel >= nivel) {
      const atual = itens[i];
      if (atual.nivel === nivel && (atual.ordenada !== ordenada || (atual.feito !== undefined) !== tarefa)) break;
      const filhos: ItemLista[] = [];
      i++;
      while (i < itens.length && itens[i].nivel > nivel) filhos.push(itens[i++]);
      const corpo = `<p>${atual.html}</p>${filhos.length ? montarLista(filhos) : ''}`;
      lis += tarefa ? `<li data-type="taskItem" data-checked="${!!atual.feito}">${corpo}</li>` : `<li>${corpo}</li>`;
    }
    saida += tarefa ? `<ul data-type="taskList">${lis}</ul>`
      : ordenada ? `<ol${numero && numero !== 1 ? ` start="${numero}"` : ''}>${lis}</ol>`
      : `<ul>${lis}</ul>`;
  }
  return saida;
}

/** O Word cola listas como parágrafos com o marcador escrito. */
function listasDoWord(doc: Document) {
  const ehItem = (el: Element | null): el is Element =>
    !!el && el.tagName === 'P' && /mso-list:\s*l\d+/i.test(el.getAttribute('style') || '');

  for (const p of Array.from(doc.querySelectorAll('p'))) {
    if (!p.isConnected || !ehItem(p)) continue;
    const grupo: Element[] = [p];
    while (ehItem(grupo[grupo.length - 1].nextElementSibling)) grupo.push(grupo[grupo.length - 1].nextElementSibling!);

    const itens = grupo.map((el): ItemLista => {
      const nivel = Number(/level(\d+)/i.exec(el.getAttribute('style') || '')?.[1] ?? 1);
      const marca = Array.from(el.querySelectorAll('span')).find(s => /mso-list:\s*ignore/i.test(s.getAttribute('style') || ''));
      const texto = (marca?.textContent || '').replace(/ /g, ' ').trim();
      marca?.remove();
      const numero = Number(/^(\d+)[.)]/.exec(texto)?.[1]) || undefined;
      return { nivel, ordenada: /^(\d+|[a-z]|[ivxlc]+)[.)]/i.test(texto), numero, html: el.innerHTML.trim() };
    });

    const caixa = doc.createElement('div');
    caixa.innerHTML = montarLista(itens);
    p.before(...Array.from(caixa.childNodes));
    grupo.forEach(el => el.remove());
  }
}

// ─── HTML ────────────────────────────────────────────────────────────

/** Cópia do próprio editor: mantém só o que a nossa barra de ferramentas produz. */
function limparInterno(doc: Document) {
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const st = (el as HTMLElement).style;
    const manter = (['color', 'font-size', 'font-weight', 'font-style'] as const)
      .map(p => [p, st?.getPropertyValue(p)] as const)
      .filter(([, v]) => v);
    el.removeAttribute('style');
    el.removeAttribute('class');
    if (manter.length) el.setAttribute('style', manter.map(([p, v]) => `${p}: ${v}`).join('; '));
  }
}

/** Estilo em linha (Docs, Word, sites) → marca equivalente do editor. */
function estilosParaMarcas(doc: Document) {
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('*'))) {
    const st = el.style;
    if (!st) continue;
    const peso = st.fontWeight;
    const normal = peso === 'normal' || (!!peso && Number(peso) > 0 && Number(peso) < 600);

    // O Google Docs embrulha tudo num <b style="font-weight:normal">.
    if ((el.tagName === 'B' || el.tagName === 'STRONG') && normal) { desembrulhar(el); continue; }
    if (/^H[1-6]$/.test(el.tagName) || !el.textContent?.trim()) continue;
    if (Array.from(el.children).some(f => BLOCO.has(f.tagName))) continue;

    const decoracao = `${st.textDecoration} ${st.getPropertyValue('text-decoration-line')}`;
    if (/bold/.test(peso) || Number(peso) >= 600) envolver(el, 'strong');
    if (/italic|oblique/.test(st.fontStyle)) envolver(el, 'em');
    if (/underline/.test(decoracao) && el.tagName !== 'A' && !el.closest('a') && !el.querySelector('a')) envolver(el, 'u');
    if (/line-through/.test(decoracao)) envolver(el, 's');
  }
}

function titulos(doc: Document) {
  for (const h of Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
    const p = doc.createElement('p');
    while (h.firstChild) p.appendChild(h.firstChild);
    if (p.textContent?.trim()) {
      envolver(p, 'strong');
      const tamanho = TAMANHO_TITULO[h.tagName];
      if (tamanho) envolver(p, 'span').setAttribute('style', `font-size: ${tamanho}`);
    }
    h.replaceWith(p);
  }
}

/** Imagens que o editor não alcança (arquivo local, anexo de e-mail) e pixels de rastreio saem. */
function imagens(doc: Document): number {
  let perdidas = 0;
  for (const img of Array.from(doc.body.querySelectorAll('img'))) {
    const src = img.getAttribute('src') || '';
    const pixel = ['width', 'height'].some(a => { const v = img.getAttribute(a); return v !== null && Number(v) <= 2; });
    if (pixel) { img.remove(); continue; }
    if (/^https?:|^data:image\//i.test(src)) continue;
    perdidas++;
    img.remove();
  }
  return perdidas;
}

function limparAtributos(doc: Document) {
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const nosso = el.tagName === 'SPAN' && /^font-size: \d+px$/.test(el.getAttribute('style') || '');
    const tarefa = !!el.getAttribute('data-type')?.startsWith('task');
    for (const { name } of Array.from(el.attributes)) {
      if (nosso && name === 'style') continue;
      if (tarefa && (name === 'data-type' || name === 'data-checked')) continue;
      if (ATRIBUTOS[el.tagName]?.includes(name)) continue;
      el.removeAttribute(name);
    }
    if (el.tagName === 'A' && !/^(https?:|mailto:|tel:)/i.test(el.getAttribute('href') || '')) desembrulhar(el);
    else if ((el.tagName === 'SPAN' && !nosso) || el.tagName === 'FONT' || el.tagName.includes(':')) desembrulhar(el);
  }
}

const vazio = (el: Element) => !el.textContent?.replace(/ /g, ' ').trim() && !el.querySelector('img,table,hr,li');

/** Uma linha em branco separa; duas ou mais viram uma. Sem sobras no começo e no fim. */
function linhasVazias(doc: Document) {
  for (const el of Array.from(doc.body.querySelectorAll('p,div'))) {
    if (!el.isConnected || !vazio(el) || el.closest('li,td,th')) continue;
    const ant = el.previousElementSibling;
    if (!ant || !el.nextElementSibling || ((ant.tagName === 'P' || ant.tagName === 'BR') && vazio(ant))) el.remove();
    else if (el.tagName === 'P') el.innerHTML = '';
  }
  // O Docs separa parágrafos com <br> solto entre blocos.
  for (const br of Array.from(doc.body.querySelectorAll('br'))) {
    const entreBlocos = [br.previousElementSibling, br.nextElementSibling].some(e => e && BLOCO.has(e.tagName));
    if (!entreBlocos) continue;
    const ant = br.previousElementSibling;
    if (!ant || !br.nextElementSibling || vazio(ant)) br.remove();
    else br.replaceWith(doc.createElement('p'));
  }
}

function semEspacosDuros(doc: Document) {
  const andar = (no: Node) => {
    if (no.nodeType === 8) { no.parentNode?.removeChild(no); return; }
    if (no.nodeType === 3) { no.nodeValue = (no.nodeValue || '').replace(/ /g, ' '); return; }
    Array.from(no.childNodes).forEach(andar);
  };
  andar(doc.body);
}

export interface Colagem { html: string; imagensPerdidas: number }

export function limparHtmlColado(html: string): Colagem {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(REMOVER).forEach(el => el.remove());

  if (doc.body.querySelector('[data-pm-slice]')) {
    limparInterno(doc);
    return { html: doc.body.innerHTML, imagensPerdidas: 0 };
  }

  listasDoWord(doc);
  const imagensPerdidas = imagens(doc);
  estilosParaMarcas(doc);
  titulos(doc);
  limparAtributos(doc);
  linhasVazias(doc);
  semEspacosDuros(doc);
  return { html: doc.body.innerHTML.trim(), imagensPerdidas };
}

/**
 * O clipboard traz texto de verdade no HTML? Word e Excel mandam também uma foto
 * do trecho copiado: nesse caso vale o texto, não a foto.
 */
export function htmlTemTexto(html: string): boolean {
  if (!html) return false;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style,script,title').forEach(el => el.remove());
  return !!doc.body.textContent?.trim();
}

// ─── Texto puro (WhatsApp, Markdown, bloco de notas) ─────────────────

const ANTES = '(^|[\\s("\'“>*_~])';
const DEPOIS = '(?=$|[\\s)"\'”.,;:!?<*_~])';
const marca = (abre: string, fecha = abre) => new RegExp(`${ANTES}${abre}(\\S(?:[^\\n]*?\\S)?)${fecha}${DEPOIS}`, 'g');

const MARCAS: [RegExp, string][] = [
  [marca('\\*\\*'), '$1<strong>$2</strong>'],
  [marca('__'), '$1<strong>$2</strong>'],
  [marca('~~'), '$1<s>$2</s>'],
  [marca('\\*'), '$1<strong>$2</strong>'],
  [marca('_'), '$1<em>$2</em>'],
  [marca('~'), '$1<s>$2</s>'],
];

function marcasEmLinha(linha: string): string {
  // Endereços ficam de fora: "_" e "*" neles não são formatação.
  return linha.split(/(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/\S+)/g).map((parte, i) => {
    if (i % 2) {
      const md = /^\[([^\]]+)\]\((.+)\)$/.exec(parte);
      return md ? `<a href="${escapar(md[2])}">${escapar(md[1])}</a>` : `<a href="${escapar(parte)}">${escapar(parte)}</a>`;
    }
    return MARCAS.reduce((s, [re, por]) => s.replace(re, por), escapar(parte));
  }).join('');
}

const ITEM = /^([ \t]*)([-*+•·▪◦‣–]|\d{1,3}[.)])[ \t]+(.*)$/;

/** `null` = texto simples de uma linha, cola como está. */
export function textoParaHtml(texto: string): string | null {
  const linhas = texto.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/^\n+|\s+$/g, '').split('\n');

  const blocos: string[] = [];
  let itens: ItemLista[] = [];
  let recuos: number[] = [];
  const fecharLista = () => {
    if (itens.length) blocos.push(montarLista(itens));
    itens = [];
    recuos = [];
  };

  linhas.forEach((linha, i) => {
    const item = ITEM.exec(linha);
    if (item) {
      const recuo = item[1].replace(/\t/g, '    ').length;
      while (recuos.length && recuos[recuos.length - 1] > recuo) recuos.pop();
      if (!recuos.length || recuos[recuos.length - 1] < recuo) recuos.push(recuo);
      const caixa = /^\[([ xX])\][ \t]+(.*)$/.exec(item[3]);
      itens.push({
        nivel: recuos.length,
        ordenada: /^\d/.test(item[2]),
        numero: parseInt(item[2], 10) || undefined,
        feito: caixa ? caixa[1] !== ' ' : undefined,
        html: marcasEmLinha(caixa ? caixa[2] : item[3]),
      });
      return;
    }
    if (!linha.trim()) {
      // Linha em branco entre itens da mesma lista não a separa.
      const proxima = linhas.slice(i + 1).find(l => l.trim());
      if (itens.length && proxima && ITEM.test(proxima)) return;
      fecharLista();
      if (blocos.length && blocos[blocos.length - 1] !== '<p></p>') blocos.push('<p></p>');
      return;
    }
    fecharLista();
    const titulo = /^(#{1,6})[ \t]+(.+?)[ \t]*#*$/.exec(linha);
    if (titulo) {
      const tamanho = TAMANHO_TITULO[`H${titulo[1].length}`];
      const forte = `<strong>${marcasEmLinha(titulo[2])}</strong>`;
      blocos.push(`<p>${tamanho ? `<span style="font-size: ${tamanho}">${forte}</span>` : forte}</p>`);
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(linha)) {
      blocos.push('<hr>');
    } else {
      blocos.push(`<p>${marcasEmLinha(linha.trimEnd())}</p>`);
    }
  });
  fecharLista();

  if (linhas.length === 1 && blocos[0] === `<p>${escapar(linhas[0].trimEnd())}</p>`) return null;
  return blocos.join('');
}
