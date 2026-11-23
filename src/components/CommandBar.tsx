import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Columns3, 
  List, 
  Calendar, 
  Settings as SettingsIcon, 
  Folder, 
  Plus, 
  Moon, 
  Sun,
  X,
  FileCheck2
} from 'lucide-react';
import { Task, Project, ViewType } from '../types';

interface CommandBarProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  projects: Project[];
  onSelectTask: (task: Task) => void;
  onSelectView: (view: ViewType) => void;
  onSelectTaskViewType: (type: 'board' | 'list') => void;
  onNewTask: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export default function CommandBar({
  isOpen,
  onClose,
  tasks,
  projects,
  onSelectTask,
  onSelectView,
  onSelectTaskViewType,
  onNewTask,
  isDarkMode,
  onToggleDarkMode
}: CommandBarProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close command bar on escape or backdrop click
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle global Cmd+K key down
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // Wait, let's let App.tsx control the main open state. We'll add this check.
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Build searchable items
  interface CommandItem {
    id: string;
    title: string;
    subtitle?: string;
    category: 'Vistas' | 'Ações' | 'Tarefas' | 'Empreendimentos';
    icon: React.ReactNode;
    action: () => void;
  }

  const items: CommandItem[] = [
    {
      id: 'v-board',
      title: 'Ir para Quadro Kanban',
      subtitle: 'Minhas tarefas no modo Quadro',
      category: 'Vistas',
      icon: <Columns3 size={15} />,
      action: () => {
        onSelectView('tasks_board');
        onSelectTaskViewType('board');
        onClose();
      }
    },
    {
      id: 'v-list',
      title: 'Ir para Lista Compacta',
      subtitle: 'Visualização densa em lista',
      category: 'Vistas',
      icon: <List size={15} />,
      action: () => {
        onSelectView('tasks_board');
        onSelectTaskViewType('list');
        onClose();
      }
    },
    {
      id: 'v-calendar',
      title: 'Ir para Cronograma',
      subtitle: 'Tarefas por semana ou mês',
      category: 'Vistas',
      icon: <Calendar size={15} />,
      action: () => {
        onSelectView('calendar');
        onClose();
      }
    },
    {
      id: 'v-projects',
      title: 'Ir para Empreendimentos Ativos',
      subtitle: 'Visão geral do pipeline de trabalho',
      category: 'Vistas',
      icon: <Folder size={15} />,
      action: () => {
        onSelectView('projects');
        onClose();
      }
    },
    {
      id: 'v-settings',
      title: 'Ir para Ajustes',
      subtitle: 'Personalizar temas e atalhos',
      category: 'Vistas',
      icon: <SettingsIcon size={15} />,
      action: () => {
        onSelectView('settings');
        onClose();
      }
    },
    {
      id: 'a-new',
      title: 'Criar Nova Tarefa',
      subtitle: 'Adicionar item à lista',
      category: 'Ações',
      icon: <Plus size={15} className="text-emerald-400" />,
      action: () => {
        onNewTask();
        onClose();
      }
    },
    {
      id: 'a-theme',
      title: isDarkMode ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro',
      subtitle: 'Alternar tema do workspace',
      category: 'Ações',
      icon: isDarkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-blue-400" />,
      action: () => {
        onToggleDarkMode();
        onClose();
      }
    },
  ];

  // Add projects to command items
  projects.forEach(p => {
    items.push({
      id: `p-${p.id}`,
      title: `Filtrar por: ${p.name}`,
      subtitle: p.description,
      category: 'Empreendimentos',
      icon: <Folder size={15} className="text-[#9ca3af]" />,
      action: () => {
        onSelectView('tasks_board');
        // Let parents handle direct project filtering
        onClose();
      }
    });
  });

  // Add tasks to command items
  tasks.forEach(t => {
    const cleanSubtitle = t.description 
      ? t.description.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').substring(0, 120) + (t.description.length > 120 ? '...' : '') 
      : '';

    items.push({
      id: `t-${t.id}`,
      title: t.title,
      subtitle: cleanSubtitle,
      category: 'Tarefas',
      icon: <FileCheck2 size={15} className="text-blue-400" />,
      action: () => {
        onSelectTask(t);
        onClose();
      }
    });
  });

  // Filter items matching the query
  const filteredItems = items.filter(item => {
    const q = search.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  });

  // Handle keys inside input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Group items by category to render
  const categories = Array.from(new Set(filteredItems.map(item => item.category)));

  // Flattened mapping to find the selected index on hover/clicks
  let globalCount = 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] short:pt-[8vh] z-50 animate-fade-in px-4">
      <div 
        ref={dropdownRef}
        className="w-full max-w-[640px] bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input bar */}
        <div className="h-12 border-b border-[#30363d] flex items-center px-4 gap-3 bg-[#0d1117]">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Digite para buscar tarefas, ex. 'Cmd+K' ou 'Tema'..."
            className="w-full h-full bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none outline-none text-body text-gray-200 placeholder-gray-500"
          />
          <button 
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 rounded hover:bg-[#30363d]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Categories and elements lists */}
        <div className="max-h-[380px] short:max-h-[calc(100dvh-16rem)] overflow-y-auto p-2 space-y-4 scrollbar-thin">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-gray-500 flex flex-col items-center justify-center gap-1">
              <Search size={22} className="text-gray-600 mb-2" />
              <p className="text-body font-medium">Nenhum resultado encontrado</p>
              <p className="text-caption text-gray-600">Com base na busca '{search}' no workspace</p>
            </div>
          ) : (
            categories.map(category => {
              const categoryItems = filteredItems.filter(i => i.category === category);
              
              return (
                <div key={category} className="space-y-1">
                  <div className="text-caption font-semibold text-gray-500 pl-3 py-1 tabular-nums">
                    {category}
                  </div>
                  <div className="space-y-0.5">
                    {categoryItems.map(item => {
                      const itemIdx = filteredItems.findIndex(fi => fi.id === item.id);
                      const isSelected = itemIdx === selectedIndex;
                      
                      return (
                        <button
                          key={item.id}
                          onClick={item.action}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                            isSelected 
                              ? 'bg-blue-600 text-white' 
                              : 'text-gray-300 hover:bg-[#1f2937]/40'
                          }`}
                        >
                          <div className={`shrink-0 p-1 rounded-md ${isSelected ? 'text-white' : 'text-gray-500 bg-[#30363d]/40'}`}>
                            {item.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-caption font-medium truncate ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                              {item.title}
                            </div>
                            {item.subtitle && (
                              <div className={`text-caption truncate ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
                                {item.subtitle}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <span className="text-caption bg-blue-500 text-blue-100 tabular-nums px-2 py-0.5 rounded leading-none shrink-0 select-none">
                              Ir para
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bars */}
        <div className="h-9 border-t border-[#30363d] px-4 flex items-center justify-between text-caption text-gray-500 bg-[#0d1117] shrink-0 tabular-nums select-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="bg-[#1f2937] px-1 rounded border border-[#30363d] text-caption">↑  ↓  </span> Navegar
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-[#1f2937] px-1.5 rounded border border-[#30363d] text-caption">Enter</span> Executar
            </span>
          </div>
          <div>
            <span>Atalho Global: <kbd className="bg-[#1f2937] px-1 py-0.5 rounded border border-[#30363d] text-caption">⌘ + K</kbd></span>
          </div>
        </div>
      </div>
    </div>
  );
}
