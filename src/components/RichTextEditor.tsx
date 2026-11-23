import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import MenuBlocos, { ItemBloco } from './tarefa/MenuBlocos';
import { isDataUrlImage, uploadDescriptionImage, fileToDataUrl, imageFilesFrom, imagensDoClipboard } from '../lib/descriptionImages';
import { htmlTemTexto, limparHtmlColado, textoParaHtml } from '../lib/colagem';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  ImagePlus,
  RemoveFormatting,
  ChevronDown,
  Check,
  Minus,
  Table as TableIcon,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Rows3,
  Columns3,
} from 'lucide-react';

// Inline font-size extension — teaches TextStyle to carry a `fontSize` attribute.
// Works exactly like the Color extension: applies to selection or stored mark at cursor.
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, any>) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ];
  },
});

// Extension to allow listItem and taskItem to have style attributes
const ListItemStyle = Extension.create({
  name: 'listItemStyle',
  addGlobalAttributes() {
    return [
      {
        types: ['listItem', 'taskItem'],
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => element.style.color || null,
            renderHTML: (attributes) => attributes.color ? { style: `color: ${attributes.color}` } : {},
          },
          fontWeight: {
            default: null,
            parseHTML: (element) => element.style.fontWeight || null,
            renderHTML: (attributes) => attributes.fontWeight ? { style: `font-weight: ${attributes.fontWeight}` } : {},
          },
          fontStyle: {
            default: null,
            parseHTML: (element) => element.style.fontStyle || null,
            renderHTML: (attributes) => attributes.fontStyle ? { style: `font-style: ${attributes.fontStyle}` } : {},
          },
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
          },
        },
      },
    ];
  },
});

interface RichTextEditorProps {
  taskId: string;
  content: string;
  onChange: (content: string) => void;
  variant?: 'default' | 'borderless';
  wrapperClassName?: string;
  columns?: 1 | 2 | 3;
  onColumnsChange?: (cols: 1 | 2 | 3) => void;
  readOnly?: boolean;
  // Incrementado pelo pai quando `content` traz texto novo vindo do servidor que
  // deve substituir o que está no editor. Fora do modo readOnly o editor ignora
  // mudanças de `content` (senão atropelaria quem está digitando) — este token é
  // o único sinal que autoriza a substituição. O pai só o incrementa quando não
  // há edição local pendente.
  syncToken?: number;
  // Ctrl+V de um print com o foco fora de qualquer campo cai no fim deste editor.
  capturarPrints?: boolean;
  placeholder?: string;
}

const COLORS = [
  { hex: '#a1a1aa', label: 'Cinza' },
  { hex: '#ef4444', label: 'Vermelho' },
  { hex: '#f97316', label: 'Laranja' },
  { hex: '#eab308', label: 'Amarelo' },
  { hex: '#10b981', label: 'Verde' },
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#a855f7', label: 'Roxo' },
  { hex: '#ec4899', label: 'Rosa' },
];

// Tamanho de fonte como marca inline: null = padrão (remove a marca).
const FONT_SIZES: { label: string; size: string | null }[] = [
  { label: 'Pequeno', size: '12px' },
  { label: 'Normal', size: null },
  { label: 'Subtítulo', size: '18px' },
  { label: 'Título', size: '24px' },
];
const TAMANHO_NORMAL = '15px'; // corpo do painel da tarefa (.tela-tarefa)
const px = (size: string | null) => (size ?? TAMANHO_NORMAL).replace('px', '');

type InserirImagens = (arquivos: File[]) => Promise<void>;

type ToolbarButton = {
  icon: React.ReactNode;
  title: string;
  action: () => void;
  isActive?: () => boolean;
  disabled?: () => boolean;
};

function toggleMarkKeepingColor(editor: Editor, toggle: (e: Editor) => void) {
  const color = editor.getAttributes('textStyle').color as string | undefined;
  toggle(editor);
  if (color) {
    setTimeout(() => {
      if (!editor.isDestroyed) {
        editor.chain().focus().setColor(color).run();
      }
    }, 0);
  }
}

const Col1Icon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);
const Col2Icon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="2" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="8" y="2" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);
const Col3Icon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="2" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="5.5" y="2" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="10" y="2" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);

type MenuAberto = { tipo: 'blocos' | 'tamanho' | 'cor'; x: number; y: number; ancora?: HTMLElement };

function MenuBar({ editor, columns = 1, onColumnsChange, onImagens }: { editor: Editor | null; columns?: 1|2|3; onColumnsChange?: (c: 1|2|3) => void; onImagens: InserirImagens }) {
  const [menu, setMenu] = useState<MenuAberto | null>(null);
  const [, forceUpdate] = useState(0);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // Re-render the toolbar whenever the editor's selection or content changes
  // so that conditional toolbar sections (e.g. table controls) appear/disappear
  useEffect(() => {
    if (!editor) return;
    const handler = () => forceUpdate(n => n + 1);
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);

  // "/" numa linha vazia abre o menu de blocos junto ao cursor.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    const abrir = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const { selection } = editor.state;
      if (!selection.empty || selection.$from.parent.content.size > 0) return;
      e.preventDefault();
      const c = editor.view.coordsAtPos(selection.from);
      setMenu({ tipo: 'blocos', x: c.left, y: c.bottom + 4 });
    };
    dom.addEventListener('keydown', abrir);
    return () => dom.removeEventListener('keydown', abrir);
  }, [editor]);

  if (!editor) return (
    <div className="rte-toolbar opacity-50 pointer-events-none">
      <div className="text-caption text-zinc-500 px-2 py-1">Carregando editor...</div>
    </div>
  );

  const tamanhoAtual = (editor.getAttributes('textStyle').fontSize as string | null | undefined)
    // Títulos de conteúdo antigo são nós próprios, não marca de tamanho.
    ?? (editor.isActive('heading', { level: 1 }) ? '24px' : editor.isActive('heading', { level: 2 }) ? '20px' : editor.isActive('heading') ? '18px' : null);

  // Aplica na seleção ou guarda a marca no cursor.
  const applyFontSize = (size: string | null) => {
    if (editor.isActive('heading')) editor.chain().setParagraph().run();
    if (size === null) {
      // volta ao padrão
      editor.chain().focus().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
    } else {
      editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
    }
    setTimeout(() => {
      if (editor.isActive('listItem')) editor.commands.updateAttributes('listItem', { fontSize: size });
      if (editor.isActive('taskItem')) editor.commands.updateAttributes('taskItem', { fontSize: size });
    }, 10);
  };

  const groups: ToolbarButton[][] = [
    // Group: inline formatting
    [
      {
        icon: <Bold size={14} />,
        title: 'Negrito (Ctrl+B)',
        action: () => {
          toggleMarkKeepingColor(editor, (e) => e.chain().focus().toggleBold().run());
          setTimeout(() => {
            const isBold = editor.isActive('bold');
            if (editor.isActive('listItem')) editor.commands.updateAttributes('listItem', { fontWeight: isBold ? 'bold' : null });
            if (editor.isActive('taskItem')) editor.commands.updateAttributes('taskItem', { fontWeight: isBold ? 'bold' : null });
          }, 10);
        },
        isActive: () => editor.isActive('bold'),
        disabled: () => !editor.can().chain().focus().toggleBold().run(),
      },
      {
        icon: <Italic size={14} />,
        title: 'Itálico (Ctrl+I)',
        action: () => {
          toggleMarkKeepingColor(editor, (e) => e.chain().focus().toggleItalic().run());
          setTimeout(() => {
            const isItalic = editor.isActive('italic');
            if (editor.isActive('listItem')) editor.commands.updateAttributes('listItem', { fontStyle: isItalic ? 'italic' : null });
            if (editor.isActive('taskItem')) editor.commands.updateAttributes('taskItem', { fontStyle: isItalic ? 'italic' : null });
          }, 10);
        },
        isActive: () => editor.isActive('italic'),
        disabled: () => !editor.can().chain().focus().toggleItalic().run(),
      },
      {
        icon: <UnderlineIcon size={14} />,
        title: 'Sublinhado (Ctrl+U)',
        action: () => toggleMarkKeepingColor(editor, (e) => e.chain().focus().toggleUnderline().run()),
        isActive: () => editor.isActive('underline'),
      },
      {
        icon: <Strikethrough size={14} />,
        title: 'Riscado (Ctrl+Shift+S)',
        action: () => toggleMarkKeepingColor(editor, (e) => e.chain().focus().toggleStrike().run()),
        isActive: () => editor.isActive('strike'),
      },
    ],
    // Group: lists
    [
      {
        icon: <List size={14} />,
        title: 'Lista',
        action: () => editor.chain().focus().toggleBulletList().run(),
        isActive: () => editor.isActive('bulletList'),
      },
      {
        icon: <ListOrdered size={14} />,
        title: 'Lista numerada',
        action: () => editor.chain().focus().toggleOrderedList().run(),
        isActive: () => editor.isActive('orderedList'),
      },
    ],
  ];

  const setCor = (cor: string | null) => {
    if (cor) editor.chain().focus().setColor(cor).run();
    else editor.chain().focus().unsetColor().run();
    if (editor.isActive('listItem')) editor.commands.updateAttributes('listItem', { color: cor });
    if (editor.isActive('taskItem')) editor.commands.updateAttributes('taskItem', { color: cor });
    setMenu(null);
  };

  const limparFormatacao = () => {
    editor.chain().focus().unsetAllMarks().run();
    if (editor.isActive('heading')) editor.commands.setParagraph();
    const limpo = { color: null, fontWeight: null, fontStyle: null, fontSize: null };
    if (editor.isActive('listItem')) editor.commands.updateAttributes('listItem', limpo);
    if (editor.isActive('taskItem')) editor.commands.updateAttributes('taskItem', limpo);
  };

  // Pega o print que já está na área de transferência; sem nenhum (ou sem
  // permissão de leitura), abre a escolha de arquivo.
  const colarPrint = async () => {
    const prints = await imagensDoClipboard();
    if (prints.length) await onImagens(prints);
    else arquivoRef.current?.click();
  };

  const alternarMenu = (tipo: MenuAberto['tipo']) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const ancora = e.currentTarget;
    const r = ancora.getBoundingClientRect();
    setMenu(m => (m?.tipo === tipo ? null : { tipo, x: r.left, y: r.bottom + 4, ancora }));
  };
  const fecharMenu = (focar: boolean) => { setMenu(null); if (focar) editor.commands.focus(); };

  const itensTamanho: ItemBloco[] = FONT_SIZES.map(({ label, size }) => ({
    id: label,
    rotulo: label,
    detalhe: `${px(size)} px`,
    icone: <span className="font-semibold leading-none" style={{ fontSize: Math.min(18, Math.max(10, Number(px(size)) * 0.7)) }}>A</span>,
    ativo: tamanhoAtual === size,
    acao: () => applyFontSize(size),
  }));

  const itensMenu: ItemBloco[] = [
    { id: 'titulo', grupo: 'Texto', rotulo: 'Título', icone: <span className="text-caption font-semibold leading-none">H1</span>, ativo: tamanhoAtual === '24px', acao: () => applyFontSize('24px') },
    { id: 'subtitulo', grupo: 'Texto', rotulo: 'Subtítulo', icone: <span className="text-caption font-semibold leading-none">H2</span>, ativo: tamanhoAtual === '18px', acao: () => applyFontSize('18px') },
    { id: 'lista', grupo: 'Blocos', rotulo: 'Lista', icone: <List size={14} />, ativo: editor.isActive('bulletList'), acao: () => editor.chain().focus().toggleBulletList().run() },
    { id: 'numerada', grupo: 'Blocos', rotulo: 'Lista numerada', icone: <ListOrdered size={14} />, ativo: editor.isActive('orderedList'), acao: () => editor.chain().focus().toggleOrderedList().run() },
    { id: 'tarefas', grupo: 'Blocos', rotulo: 'Lista de verificação', icone: <ListChecks size={14} />, ativo: editor.isActive('taskList'), acao: () => editor.chain().focus().toggleTaskList().run() },
    { id: 'print', grupo: 'Blocos', rotulo: 'Colar print', icone: <ImagePlus size={14} />, acao: () => { void colarPrint(); } },
    { id: 'imagem', grupo: 'Blocos', rotulo: 'Imagem do computador', icone: <ImagePlus size={14} />, acao: () => arquivoRef.current?.click() },
    { id: 'tabela', grupo: 'Blocos', rotulo: 'Tabela 3×3', icone: <TableIcon size={14} />, acao: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'separador', grupo: 'Blocos', rotulo: 'Separador', icone: <Minus size={14} />, acao: () => editor.chain().focus().setHorizontalRule().run() },
    ...(onColumnsChange ? ([1, 2, 3] as const).map(n => {
      const Icon = n === 1 ? Col1Icon : n === 2 ? Col2Icon : Col3Icon;
      return { id: `col-${n}`, grupo: 'Colunas', rotulo: `${n} coluna${n > 1 ? 's' : ''}`, icone: <Icon />, ativo: n > 1 && columns === n, acao: () => onColumnsChange(n) };
    }) : []),
  ];

  const corAtual = editor.getAttributes('textStyle').color as string | undefined;
  const rotuloTamanho = FONT_SIZES.find(f => f.size === tamanhoAtual)?.label ?? `${px(tamanhoAtual)} px`;

  return (
    <div className="rte-toolbar">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu?.tipo === 'tamanho'}
        aria-label={`Tamanho da fonte: ${rotuloTamanho}`}
        title="Tamanho da fonte"
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternarMenu('tamanho')}
        className="rte-btn gap-1 w-[92px] !justify-between text-body leading-none"
      >
        <span className="truncate">{rotuloTamanho}</span>
        <ChevronDown size={12} className="opacity-50 shrink-0" aria-hidden />
      </button>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu?.tipo === 'cor'}
        aria-label="Cor do texto"
        title="Cor do texto"
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternarMenu('cor')}
        className="rte-btn gap-1"
      >
        <span className="flex flex-col items-center gap-[2px]" aria-hidden>
          <span className="text-body font-semibold leading-none">A</span>
          <span className="h-[3px] w-3.5 rounded-full bg-zinc-400" style={corAtual ? { backgroundColor: corAtual } : undefined} />
        </span>
        <ChevronDown size={12} className="opacity-50" aria-hidden />
      </button>
      <div className="rte-divider" />

      {/* Formatting marks */}
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="rte-divider" />}
          {group.map((btn, bi) => (
            <button
              key={bi}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
              disabled={btn.disabled ? btn.disabled() : false}
              title={btn.title}
              aria-label={btn.title}
              aria-pressed={btn.isActive ? btn.isActive() : undefined}
              className={`rte-btn ${btn.isActive && btn.isActive() ? 'rte-btn--active' : ''}`}
            >
              {btn.icon}
            </button>
          ))}
        </React.Fragment>
      ))}

      <div className="rte-divider" />
      <button
        type="button"
        title="Colar o print da área de transferência (Ctrl+V também funciona). Sem print copiado, escolhe um arquivo"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { void colarPrint(); }}
        className="rte-btn gap-1.5 text-body leading-none"
      >
        <ImagePlus size={14} aria-hidden /> Print
      </button>
      <button type="button" title="Limpar formatação" aria-label="Limpar formatação" onMouseDown={(e) => e.preventDefault()} onClick={limparFormatacao} className="rte-btn">
        <RemoveFormatting size={14} />
      </button>
      <div className="rte-divider" />
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu?.tipo === 'blocos'}
        title="Inserir bloco (digite / numa linha vazia)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternarMenu('blocos')}
        className="rte-btn gap-1.5 text-body leading-none"
      >
        <span className="inline-flex items-center justify-center w-3.5 font-semibold" aria-hidden>/</span> Inserir
      </button>
      <input
        ref={arquivoRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (arquivos.length) void onImagens(arquivos);
        }}
      />

      {menu?.tipo === 'blocos' && (
        <MenuBlocos
          {...menu}
          itens={itensMenu}
          onFechar={fecharMenu}
          onDigitarBarra={() => { setMenu(null); editor.chain().focus().insertContent('/').run(); }}
        />
      )}
      {menu?.tipo === 'tamanho' && (
        <MenuBlocos {...menu} rotulo="Tamanho da fonte" largura="w-48" itens={itensTamanho} onFechar={fecharMenu} />
      )}
      {menu?.tipo === 'cor' && (
        <MenuBlocos
          {...menu}
          rotulo="Cor do texto"
          largura="w-44"
          onFechar={fecharMenu}
          rodape={
            <div className="p-1">
              <div className="grid grid-cols-4 gap-1">
                {COLORS.map(c => (
                  <button
                    key={c.hex}
                    type="button"
                    role="menuitem"
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => setCor(c.hex)}
                    className="h-9 rounded-lg flex items-center justify-center hover:bg-[#1F1F22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                  >
                    <span className="size-5 rounded-full inline-flex items-center justify-center text-white" style={{ backgroundColor: c.hex }}>
                      {corAtual === c.hex && <Check size={12} strokeWidth={3} aria-hidden />}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => setCor(null)}
                className="mt-1 w-full min-h-8 px-2 rounded-lg text-body text-left text-zinc-200 hover:bg-[#1F1F22] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                Cor padrão
                {!corAtual && <Check size={14} className="ml-auto text-blue-400" aria-hidden />}
              </button>
            </div>
          }
        />
      )}

      {/* Table Actions */}
      {editor.isActive('table') && (
        <div className="flex items-center gap-0.5 ml-2 bg-zinc-900/60 px-1.5 py-0.5 rounded-lg border border-zinc-800/60">
          {/* Row controls */}
          <div className="flex items-center gap-0.5 mr-0.5">
            <span className="text-caption font-medium text-zinc-400 mr-0.5 select-none">Linha</span>
            <button type="button" className="rte-tbl-btn rte-tbl-btn--add" title="Adicionar linha acima" onMouseDown={e => {e.preventDefault(); editor.chain().focus().addRowBefore().run();}}>
              <ArrowUp size={10} /><Plus size={8} className="rte-tbl-plus" />
            </button>
            <button type="button" className="rte-tbl-btn rte-tbl-btn--add" title="Adicionar linha abaixo" onMouseDown={e => {e.preventDefault(); editor.chain().focus().addRowAfter().run();}}>
              <ArrowDown size={10} /><Plus size={8} className="rte-tbl-plus" />
            </button>
            <button type="button" className="rte-tbl-btn rte-tbl-btn--del" title="Excluir linha" onMouseDown={e => {e.preventDefault(); editor.chain().focus().deleteRow().run();}}>
              <Trash2 size={11} />
            </button>
          </div>
          <div className="w-px h-4 bg-zinc-700/60 mx-1" />
          {/* Column controls */}
          <div className="flex items-center gap-0.5 mr-0.5">
            <span className="text-caption font-medium text-zinc-400 mr-0.5 select-none">Col</span>
            <button type="button" className="rte-tbl-btn rte-tbl-btn--add" title="Adicionar coluna à esquerda" onMouseDown={e => {e.preventDefault(); editor.chain().focus().addColumnBefore().run();}}>
              <ArrowLeft size={10} /><Plus size={8} className="rte-tbl-plus" />
            </button>
            <button type="button" className="rte-tbl-btn rte-tbl-btn--add" title="Adicionar coluna à direita" onMouseDown={e => {e.preventDefault(); editor.chain().focus().addColumnAfter().run();}}>
              <ArrowRight size={10} /><Plus size={8} className="rte-tbl-plus" />
            </button>
            <button type="button" className="rte-tbl-btn rte-tbl-btn--del" title="Excluir coluna" onMouseDown={e => {e.preventDefault(); editor.chain().focus().deleteColumn().run();}}>
              <Trash2 size={11} />
            </button>
          </div>
          <div className="w-px h-4 bg-zinc-700/60 mx-1" />
          {/* Delete table */}
          <button type="button" className="rte-tbl-btn rte-tbl-btn--destroy" title="Excluir tabela inteira" onMouseDown={e => {e.preventDefault(); editor.chain().focus().deleteTable().run();}}>
            <Trash2 size={12} />
            <span className="text-caption font-medium">Tabela</span>
          </button>
        </div>
      )}
    </div>
  );
}

const MULTI_COL_ATTR = 'data-multi-col-wrapper';

function parseMultiColumnContent(html: string, cols: number): string[] {
  if (!html) return Array(cols).fill('');
  if (!html.includes(MULTI_COL_ATTR)) {
    return [html, ...Array(Math.max(0, cols - 1)).fill('')];
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const wrapper = doc.querySelector(`[${MULTI_COL_ATTR}]`);
    if (!wrapper) return [html, ...Array(Math.max(0, cols - 1)).fill('')];
    const docCols = parseInt(wrapper.getAttribute('data-cols') || '1');
    const extracted: string[] = [];
    for (let i = 0; i < Math.max(docCols, cols); i++) {
      const colDiv = wrapper.querySelector(`[data-col-idx="${i}"]`);
      extracted.push(colDiv ? colDiv.innerHTML : '');
    }
    if (cols < docCols) {
      const surviving = extracted.slice(0, cols);
      const dropped = extracted.slice(cols).filter(c => c.replace(/<p><\/p>|<br>|\s/g, '') !== '');
      if (dropped.length > 0) {
        surviving[cols - 1] = surviving[cols - 1] + '<p></p>' + dropped.join('<p></p>');
      }
      return surviving;
    }
    return extracted.slice(0, cols);
  } catch (e) {
    return [html, ...Array(Math.max(0, cols - 1)).fill('')];
  }
}

function buildMultiColumnContent(contents: string[], cols: number): string {
  if (cols === 1) return contents[0] || '';
  const innerHtml = contents.map((c, i) =>
    `<div data-col-idx="${i}" style="flex:1; min-width:0;">${c}</div>`
  ).join('');
  return `<div ${MULTI_COL_ATTR}="true" data-cols="${cols}" style="display:flex; gap:1.25rem;">${innerHtml}</div>`;
}

interface SingleEditorProps {
  taskId: string;
  content: string;
  onChange: (html: string) => void;
  onFocus: () => void;
  editorRefCallback: (editor: Editor | null, inserirImagens: InserirImagens) => void;
  capturarPrints?: boolean;
  placeholderText?: string;
  readOnly?: boolean;
  syncToken?: number;
}

function SingleEditor({ taskId, content, onChange, onFocus, editorRefCallback, placeholderText = 'Escreva sobre o que é essa tarefa...', readOnly, syncToken = 0, capturarPrints = false }: SingleEditorProps) {
  const localRef = useRef<Editor | null>(null);
  const [uploadingImages, setUploadingImages] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);
  // Evita que a varredura dispare em cima de si mesma: cada swap de src conta como
  // um update do editor, que reentraria aqui antes do upload anterior terminar.
  const sweepingRef = useRef(false);

  // Rede de segurança: HTML colado (Word, Docs, e-mail) pode trazer <img src="data:...">
  // embutido, e transformPastedHTML é síncrono — não dá para subir o arquivo lá.
  // Aqui trocamos qualquer base64 que tenha entrado no doc por um link do Storage.
  const sweepDataUrlImages = async () => {
    const ed = localRef.current;
    if (!ed || sweepingRef.current) return;

    const pending: string[] = [];
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'image' && isDataUrlImage(node.attrs.src)) {
        pending.push(node.attrs.src as string);
      }
    });
    if (pending.length === 0) return;

    sweepingRef.current = true;
    setUploadingImages(n => n + pending.length);
    try {
      for (const dataUrl of pending) {
        try {
          const url = await uploadDescriptionImage(taskId, dataUrl);
          const editor = localRef.current;
          if (!editor) break;
          // A posição pode ter mudado durante o upload, então procuramos o nó de novo.
          let pos: number | null = null;
          editor.state.doc.descendants((node, nodePos) => {
            if (pos === null && node.type.name === 'image' && node.attrs.src === dataUrl) pos = nodePos;
          });
          if (pos !== null) {
            editor.chain().setNodeSelection(pos).updateAttributes('image', { src: url }).run();
          }
        } catch (e) {
          console.error('Falha ao subir imagem da descrição:', e);
        } finally {
          setUploadingImages(n => Math.max(0, n - 1));
        }
      }
    } finally {
      sweepingRef.current = false;
    }
  };

  // Sobe os arquivos e insere já como link — assim o base64 nunca chega ao banco.
  const insertImageFiles = async (files: File[]) => {
    setAviso(null);
    setUploadingImages(n => n + files.length);
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        const url = await uploadDescriptionImage(taskId, dataUrl);
        localRef.current?.chain().focus().setImage({ src: url }).run();
      } catch (e: any) {
        console.error('Falha ao subir imagem da descrição:', e);
        setAviso(`A imagem não foi enviada. ${e?.message || 'Tente de novo.'}`);
      } finally {
        setUploadingImages(n => Math.max(0, n - 1));
      }
    }
  };

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      // Headings kept in StarterKit for backward compat with existing content
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      // TaskList/TaskItem kept for backward compat (checklist button removed from toolbar)
      TaskList.configure({ HTMLAttributes: { class: 'task-list' } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'task-item' } }),
      TextStyle.configure({ HTMLAttributes: {} }),
      Color.configure({ types: ['textStyle'] }),
      FontSize,
      ListItemStyle,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'max-w-full max-h-96 object-contain rounded-md border border-zinc-800/50 my-2',
        },
      }),
      Placeholder.configure({
        placeholder: placeholderText,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      void sweepDataUrlImages();
    },
    onFocus: () => {
      onFocus();
    },
    editorProps: {
      attributes: {
        class: 'rte-content h-full outline-none',
        spellcheck: 'false',
      },
      // Tudo que é colado vira o padrão do editor (ver lib/colagem).
      transformPastedHTML(html) {
        try {
          const limpo = limparHtmlColado(html);
          if (limpo.imagensPerdidas > 0) {
            setAviso(limpo.imagensPerdidas === 1
              ? 'A imagem do texto colado não veio junto. Copie e cole só a imagem.'
              : `${limpo.imagensPerdidas} imagens do texto colado não vieram junto. Copie e cole cada uma.`);
          }
          return limpo.html;
        } catch (e) {
          return html;
        }
      },
      // Texto puro (WhatsApp, Markdown). Ctrl+Shift+V cola como está.
      clipboardTextParser(text, context, plain, view) {
        const html = plain ? null : textoParaHtml(text);
        // `null` = deixa o ProseMirror colar como texto (o tipo não prevê, o código sim).
        if (html === null) return null as any;
        const corpo = new DOMParser().parseFromString(html, 'text/html').body;
        return PMDOMParser.fromSchema(view.state.schema).parseSlice(corpo, { preserveWhitespace: true, context });
      },
      handlePaste(_view, event) {
        if (readOnly) return false;
        const files = imageFilesFrom(event.clipboardData);
        if (files.length === 0) return false;
        // Word e Excel mandam o texto e uma foto dele: fica o texto.
        if (htmlTemTexto(event.clipboardData?.getData('text/html') ?? '')) return false;
        event.preventDefault();
        void insertImageFiles(files);
        return true;
      },
      handleDrop(_view, event) {
        if (readOnly) return false;
        const files = imageFilesFrom((event as DragEvent).dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertImageFiles(files);
        return true;
      },
      handleKeyDown(_view, event) {
        const ed = localRef.current;
        if (!ed) return false;

        // Tab indentation for lists
        if (event.key === 'Tab') {
          const isList = ed.isActive('bulletList') || ed.isActive('orderedList') || ed.isActive('taskList');
          if (isList) {
            event.preventDefault();
            if (event.shiftKey) {
              if (ed.can().liftListItem('listItem')) ed.chain().focus().liftListItem('listItem').run();
              else if (ed.can().liftListItem('taskItem')) ed.chain().focus().liftListItem('taskItem').run();
            } else {
              if (ed.can().sinkListItem('listItem')) ed.chain().focus().sinkListItem('listItem').run();
              else if (ed.can().sinkListItem('taskItem')) ed.chain().focus().sinkListItem('taskItem').run();
            }
            return true;
          } else {
            // Indent text with spaces
            event.preventDefault();
            if (!event.shiftKey) {
              ed.chain().focus().insertContent('\u00A0\u00A0\u00A0\u00A0').run();
            }
            return true;
          }
        }

        const isMod = event.ctrlKey || event.metaKey;
        if (!isMod) return false;
        if (event.key === 'b' || event.key === 'B') {
          event.preventDefault();
          toggleMarkKeepingColor(ed, (e) => e.chain().focus().toggleBold().run());
          setTimeout(() => {
            const isBold = ed.isActive('bold');
            if (ed.isActive('listItem')) ed.commands.updateAttributes('listItem', { fontWeight: isBold ? 'bold' : null });
            if (ed.isActive('taskItem')) ed.commands.updateAttributes('taskItem', { fontWeight: isBold ? 'bold' : null });
          }, 10);
          return true;
        }
        if (event.key === 'i' || event.key === 'I') {
          event.preventDefault();
          toggleMarkKeepingColor(ed, (e) => e.chain().focus().toggleItalic().run());
          setTimeout(() => {
            const isItalic = ed.isActive('italic');
            if (ed.isActive('listItem')) ed.commands.updateAttributes('listItem', { fontStyle: isItalic ? 'italic' : null });
            if (ed.isActive('taskItem')) ed.commands.updateAttributes('taskItem', { fontStyle: isItalic ? 'italic' : null });
          }, 10);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    localRef.current = editor ?? null;
    editorRefCallback(editor ?? null, insertImageFiles);
  }, [editor]);

  // Print colado com o foco em nenhum campo: vai para o fim do texto.
  useEffect(() => {
    if (!capturarPrints || readOnly || !editor) return;
    const colar = (e: ClipboardEvent) => {
      if (e.defaultPrevented || editor.isDestroyed) return;
      const foco = document.activeElement;
      if (foco && foco !== document.body) return;
      const files = imageFilesFrom(e.clipboardData);
      if (files.length === 0 || htmlTemTexto(e.clipboardData?.getData('text/html') ?? '')) return;
      e.preventDefault();
      editor.commands.focus('end');
      void insertImageFiles(files);
    };
    window.addEventListener('paste', colar);
    return () => window.removeEventListener('paste', colar);
  }, [capturarPrints, readOnly, editor]);

  useEffect(() => {
    if (editor && !editor.isDestroyed && readOnly) {
      if (editor.getHTML() !== content) {
        editor.commands.setContent(content || '');
      }
    }
  }, [content, readOnly, editor]);

  // Adota texto novo do servidor em modo de edição. Sem `emitUpdate: false` isto
  // dispararia onChange e o conteúdo remoto voltaria ao banco como se fosse edição
  // local. Roda só quando o token muda — nunca por mudança de `content` sozinha.
  const lastAppliedTokenRef = useRef(syncToken);
  useEffect(() => {
    if (!editor || editor.isDestroyed || readOnly) return;
    if (syncToken === lastAppliedTokenRef.current) return;
    lastAppliedTokenRef.current = syncToken;
    if (editor.getHTML() === content) return;
    editor.commands.setContent(content || '', { emitUpdate: false });
  }, [syncToken, content, readOnly, editor]);

  return (
    <div className="relative h-full">
      <EditorContent editor={editor} className="h-full min-h-[150px]" />
      {(uploadingImages > 0 || aviso) && (
        <div role="status" className={`sticky bottom-2 mx-2 ml-auto w-fit z-20 rounded-lg border border-zinc-700 bg-[#18181b] px-2.5 py-1.5 text-body shadow-md ${uploadingImages > 0 ? 'text-zinc-300' : 'text-amber-400'}`}>
          {uploadingImages > 0 ? `Enviando ${uploadingImages === 1 ? 'imagem' : `${uploadingImages} imagens`}…` : aviso}
        </div>
      )}
    </div>
  );
}

export default function RichTextEditor({ taskId, content, onChange, variant = 'default', wrapperClassName = '', columns = 1, onColumnsChange, readOnly, syncToken = 0, capturarPrints = false, placeholder = 'Escreva sobre o que é essa tarefa...' }: RichTextEditorProps) {
  const [contents, setContents] = useState<string[]>(() => parseMultiColumnContent(content, columns));
  const [activeIdx, setActiveIdx] = useState(0);
  const editorsRef = useRef<(Editor | null)[]>([null, null, null]);
  const inserirRef = useRef<(InserirImagens | null)[]>([null, null, null]);
  const [prevTaskId, setPrevTaskId] = useState(taskId);

  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    setContents(parseMultiColumnContent(content, columns));
  }

  useEffect(() => {
    if (readOnly) {
      setContents(parseMultiColumnContent(content, columns));
    }
  }, [content, readOnly, columns]);

  // Em modo de edição, `contents` só é realimentado a partir das props quando o
  // pai autoriza via syncToken (texto novo do servidor, sem edição local pendente).
  useEffect(() => {
    if (readOnly || syncToken === 0) return;
    setContents(parseMultiColumnContent(content, columns));
  }, [syncToken]);

  const handleEditorChange = (index: number, html: string) => {
    setContents(prev => {
      const next = [...prev];
      next[index] = html;
      onChange(buildMultiColumnContent(next, columns));
      return next;
    });
  };

  const handleColumnsChange = (newCols: 1|2|3) => {
    if (newCols === columns) return;
    setContents(prev => {
      let next = [...prev];
      if (newCols < columns) {
        const surviving = next.slice(0, newCols);
        const dropped = next.slice(newCols).filter(c => c.replace(/<p><\/p>|<br>|\s/g, '') !== '');
        if (dropped.length > 0) {
          surviving[newCols - 1] = surviving[newCols - 1] + '<p></p>' + dropped.join('<p></p>');
        }
        next = surviving;
      } else {
        while(next.length < newCols) next.push('');
      }
      onChange(buildMultiColumnContent(next, newCols));
      return next;
    });
    if (activeIdx >= newCols) setActiveIdx(newCols - 1);
    onColumnsChange?.(newCols);
  };

  const activeEditor = editorsRef.current[activeIdx] || editorsRef.current[0] || null;
  const gridClass = columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className={`rte-wrapper flex flex-col ${variant === 'borderless' ? 'rte-borderless !border-transparent !bg-transparent' : ''} ${wrapperClassName}`}>
      {!readOnly && <MenuBar editor={activeEditor} columns={columns} onColumnsChange={onColumnsChange ? handleColumnsChange : undefined} onImagens={async (arquivos) => { await (inserirRef.current[activeIdx] ?? inserirRef.current[0])?.(arquivos); }} />}
      <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar grid ${gridClass} gap-5`}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={`${taskId}-col-${i}`} className={`h-full ${i < columns - 1 ? 'border-r border-zinc-800/50 pr-5' : ''}`}>
            <SingleEditor
              taskId={`${taskId}-col-${i}`}
              content={contents[i] || ''}
              readOnly={readOnly}
              syncToken={syncToken}
              onChange={(html) => handleEditorChange(i, html)}
              onFocus={() => setActiveIdx(i)}
              capturarPrints={capturarPrints && i === 0}
              editorRefCallback={(ed, inserir) => { editorsRef.current[i] = ed; inserirRef.current[i] = inserir; }}
              placeholderText={i === 0 ? placeholder : 'Escreva aqui...'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
