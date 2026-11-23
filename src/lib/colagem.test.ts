import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { htmlTemTexto, limparHtmlColado, textoParaHtml } from './colagem';

(globalThis as any).DOMParser = new JSDOM('').window.DOMParser;
const limpo = (h: string) => limparHtmlColado(h).html;

test('Google Docs: negrito por estilo, sem fonte nem cor', () => {
  assert.equal(
    limpo('<b style="font-weight:normal" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38"><span style="font-family:Arial;color:#ff0000;font-weight:700">Prazo</span><span style="font-weight:400"> sexta</span></p></b>'),
    '<p><strong>Prazo</strong> sexta</p>',
  );
});

test('itálico, sublinhado e riscado por estilo; link não ganha sublinhado', () => {
  assert.equal(
    limpo('<p><span style="font-style:italic">a</span><span style="text-decoration:underline">b</span><span style="text-decoration:line-through">c</span><a href="https://x.com" style="text-decoration:underline" target="_blank">d</a></p>'),
    '<p><em>a</em><u>b</u><s>c</s><a href="https://x.com">d</a></p>',
  );
});

test('Word: parágrafos de lista viram listas aninhadas', () => {
  const item = (nivel: number, marca: string, t: string) =>
    `<p class="MsoListParagraph" style="margin-left:36pt;mso-list:l0 level${nivel} lfo1"><!--[if !supportLists]--><span style="mso-list:Ignore">${marca}<span>&nbsp;&nbsp;</span></span><!--[endif]-->${t}<o:p></o:p></p>`;
  assert.equal(
    limpo(item(1, '1.', 'Um') + item(2, '·', 'Filho') + item(1, '2.', 'Dois') + '<p class="MsoNormal">Fim<o:p></o:p></p>'),
    '<ol><li><p>Um</p><ul><li><p>Filho</p></li></ul></li><li><p>Dois</p></li></ol><p>Fim</p>',
  );
});

test('títulos viram o tamanho do editor', () => {
  assert.equal(limpo('<h1 style="color:red"><span style="font-size:30pt">Oi</span></h1>'), '<p><span style="font-size: 24px"><strong>Oi</strong></span></p>');
  assert.equal(limpo('<h4>Oi</h4>'), '<p><strong>Oi</strong></p>');
});

test('tabela mantém a estrutura e perde o estilo', () => {
  assert.equal(
    limpo('<table border="1" style="width:9px"><tbody><tr><td colspan="2" bgcolor="red" style="color:red">A</td></tr></tbody></table>'),
    '<table><tbody><tr><td colspan="2">A</td></tr></tbody></table>',
  );
});

test('imagens: mantém web e data, descarta arquivo local e pixel', () => {
  const r = limparHtmlColado('<p><img src="https://x/a.png" width="300" class="z"><img src="file:///c:/a.png"><img src="https://x/p.gif" width="1" height="1"></p>');
  assert.equal(r.html, '<p><img src="https://x/a.png"></p>');
  assert.equal(r.imagensPerdidas, 1);
});

test('remove script, estilo, javascript: e linhas vazias repetidas', () => {
  assert.equal(
    limpo('<style>p{}</style><script>1</script><p>a</p><p>&nbsp;</p><p><br></p><p><a href="javascript:1">b</a></p><p></p>'),
    '<p>a</p><p></p><p>b</p>',
  );
  assert.equal(limpo('<p>a</p><br><br><p>b</p>'), '<p>a</p><p></p><p>b</p>');
});

test('quebra de linha dentro do parágrafo fica', () => {
  assert.equal(limpo('<p>a<br>b</p>'), '<p>a<br>b</p>');
});

test('cópia do próprio editor mantém cor e tamanho', () => {
  assert.equal(
    limpo('<p data-pm-slice="0 0 []"><span style="color: rgb(236, 72, 153); font-size: 24px; font-family: Arial">x</span></p>'),
    '<p data-pm-slice="0 0 []"><span style="color: rgb(236, 72, 153); font-size: 24px">x</span></p>',
  );
});

test('htmlTemTexto separa print de texto com foto', () => {
  assert.equal(htmlTemTexto('<meta charset="utf-8"><img src="https://x/a.png">'), false);
  assert.equal(htmlTemTexto('<html><head><style>td{}</style></head><table><tr><td>1</td></tr></table>'), true);
});

test('WhatsApp: marcas, listas e linhas em branco', () => {
  assert.equal(
    textoParaHtml('*Aviso*: _hoje_ ~não~\n\n- um\n- dois\n  - filho\n\n1. a\n2. b'),
    '<p><strong>Aviso</strong>: <em>hoje</em> <s>não</s></p><p></p><ul><li><p>um</p></li><li><p>dois</p><ul><li><p>filho</p></li></ul></li></ul><ol><li><p>a</p></li><li><p>b</p></li></ol>',
  );
});

test('Markdown: título, negrito duplo, link e checklist', () => {
  assert.equal(
    textoParaHtml('## Escopo\n**ok** [site](https://a.com)\n- [x] feito\n- [ ] falta'),
    '<p><span style="font-size: 18px"><strong>Escopo</strong></span></p><p><strong>ok</strong> <a href="https://a.com">site</a></p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>feito</p></li><li data-type="taskItem" data-checked="false"><p>falta</p></li></ul>',
  );
});

test('não mexe em conta, arquivo com _ nem endereço', () => {
  assert.equal(textoParaHtml('2 * 3 * 4'), null);
  assert.equal(textoParaHtml('arte_final_v2.pdf'), null);
  assert.equal(textoParaHtml('texto simples'), null);
  assert.equal(textoParaHtml('a\nhttps://x.com/_a_b'), '<p>a</p><p><a href="https://x.com/_a_b">https://x.com/_a_b</a></p>');
});

test('escapa HTML do texto puro', () => {
  assert.equal(textoParaHtml('<b>x</b>\n*y*'), '<p>&lt;b&gt;x&lt;/b&gt;</p><p><strong>y</strong></p>');
});

test('marcas aninhadas', () => {
  assert.equal(textoParaHtml('*_a b_* c'), '<p><strong><em>a b</em></strong> c</p>');
});
