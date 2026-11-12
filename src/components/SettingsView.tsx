import React, { useState } from 'react';
import {
  Settings,
  Moon,
  Sun,
  Palette,
  Keyboard,
  User,
  Users,
  MessageCircle,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import ProfileSettings from './settings/ProfileSettings';
import UsersSettings from './settings/UsersSettings';
import WhatsAppSettings from './settings/WhatsAppSettings';
import PerfisAcessoSettings from './settings/PerfisAcessoSettings';
import { usePermissoes } from '../lib/permissoes';

interface SettingsViewProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

type SettingsTab = 'profile' | 'appearance' | 'users' | 'perfis' | 'whatsapp';

const TABS: { id: SettingsTab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: 'profile',    label: 'Perfil',            icon: User },
  { id: 'appearance', label: 'Aparência',         icon: Palette },
  { id: 'users',      label: 'Usuários',          icon: Users,         adminOnly: true },
  { id: 'perfis',     label: 'Perfis e acessos',  icon: ShieldCheck,   adminOnly: true },
  { id: 'whatsapp',   label: 'WhatsApp',          icon: MessageCircle, adminOnly: true },
];

export default function SettingsView({ isDarkMode, onToggleDarkMode }: SettingsViewProps) {
  const { isAdmin } = usePermissoes();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="flex-1 flex flex-col view-pad overflow-y-auto select-none space-y-5 short:space-y-3 max-w-5xl w-full text-zinc-200 bg-[#08080a]">
      <div className="flex items-center gap-2.5 bg-zinc-950/50 p-4 rounded-lg border border-zinc-900">
        <Settings size={15} className="text-zinc-400" />
        <div>
          <h2 className="text-xs font-semibold text-zinc-350 uppercase tracking-widest font-mono">Configurações Gerais</h2>
          <p className="text-[10px] text-zinc-550 font-sans">
            Perfil, aparência, gestão de usuários e integrações do workspace.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 xl:gap-6 items-start">
        {/* Navegação lateral */}
        <nav className="w-44 shrink-0 space-y-0.5">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left ${
                  isActive
                    ? 'bg-zinc-900 text-zinc-100 font-medium'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
                }`}
              >
                <Icon size={13} className={isActive ? 'text-blue-400' : ''} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <div className="bg-zinc-950/30 border border-zinc-900 rounded-lg">
              <ProfileSettings />
            </div>
          )}

          {activeTab === 'appearance' && (
            <AppearanceTab isDarkMode={isDarkMode} onToggleDarkMode={onToggleDarkMode} />
          )}

          {activeTab === 'users' && isAdmin && <UsersSettings />}
          {activeTab === 'perfis' && isAdmin && <PerfisAcessoSettings />}
          {activeTab === 'whatsapp' && isAdmin && <WhatsAppSettings />}
        </div>
      </div>
    </div>
  );
}

function AppearanceTab({ isDarkMode, onToggleDarkMode }: { isDarkMode: boolean; onToggleDarkMode: () => void }) {
  // Parte do tema realmente ativo: abrir os Ajustes no claro e ver "Linear Dark"
  // marcado passaria uma informação errada.
  const [selectedThemePreset, setSelectedThemePreset] = useState<'linear' | 'notion' | 'oled'>(
    isDarkMode ? 'linear' : 'notion'
  );
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);

  const saveThemePreset = (preset: 'linear' | 'notion' | 'oled') => {
    setSelectedThemePreset(preset);
    if (preset === 'notion' && isDarkMode) {
      onToggleDarkMode();
    } else if ((preset === 'linear' || preset === 'oled') && !isDarkMode) {
      onToggleDarkMode();
    }
  };

  const presetButton = (id: 'linear' | 'notion' | 'oled', title: string, subtitle: string) => (
    <button
      onClick={() => saveThemePreset(id)}
      className={`p-2.5 rounded border text-left flex flex-col justify-between transition-all ${
        selectedThemePreset === id
          ? 'bg-zinc-900 border-zinc-700 text-zinc-100 shadow-sm'
          : 'bg-zinc-950 border-zinc-900 text-zinc-550 hover:bg-zinc-900/40'
      }`}
    >
      <span className="font-semibold text-zinc-200">{title}</span>
      <span className="text-[9px] text-zinc-555">{subtitle}</span>
    </button>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 view-gap-sm">
      <div className="bg-zinc-950/30 border border-zinc-900 rounded-lg p-5 space-y-4">
        <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-zinc-900">
          <Palette size={12} className="text-zinc-450" />
          <span>Aparência & Tema</span>
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-medium block text-zinc-300">Modo Escuro</span>
            <span className="text-[10px] text-zinc-650">
              {isDarkMode ? 'Superfícies escuras, texto claro' : 'Superfícies claras, texto escuro'}
            </span>
          </div>
          <button
            onClick={onToggleDarkMode}
            role="switch"
            aria-checked={isDarkMode}
            aria-label={isDarkMode ? 'Desativar modo escuro' : 'Ativar modo escuro'}
            className="w-10 h-6 bg-zinc-900 border border-zinc-805 rounded-full relative flex items-center p-0.5 transition-all outline-none cursor-pointer hover:border-zinc-700"
          >
            <div className={`w-4 h-4 rounded-full bg-zinc-400 shadow-md transform transition-transform duration-200 flex items-center justify-center ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}>
              {isDarkMode ? <Moon size={9} className="text-zinc-900" /> : <Sun size={9} className="text-zinc-900" />}
            </div>
          </button>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium block text-zinc-350">Tema do Workspace</span>
          <div className="grid grid-cols-3 gap-2 text-xs font-sans font-medium">
            {presetButton('linear', 'Linear Dark', 'Grafite Subtil')}
            {presetButton('notion', 'Notion Light', 'Cinza & quase-branco')}
            {presetButton('oled', 'OLED Pure', 'Preto Absoluto')}
          </div>
        </div>
      </div>

      <div className="bg-zinc-950/30 border border-zinc-900 rounded-lg p-5 space-y-4">
        <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-zinc-900">
          <Keyboard size={12} className="text-zinc-450" />
          <span>Produtividade (Hotkeys)</span>
        </h3>

        <div className="space-y-3 font-mono text-[10px] text-zinc-500 select-none">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <span>Paleta de Comandos</span>
            <kbd className="bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900 text-zinc-400">Ctrl + K</kbd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <span>Criar Nova Tarefa</span>
            <kbd className="bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900 text-zinc-400">Clique rápido (C)</kbd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <span>Fechar Modais / Gaveta</span>
            <kbd className="bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900 text-zinc-400">ESC</kbd>
          </div>
          <div className="flex items-center justify-between pb-1">
            <span>Alternar Sidebar</span>
            <kbd className="bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900 text-zinc-400">Trigger Lateral</kbd>
          </div>

          <button
            onClick={() => setShortcutModalOpen(true)}
            className="w-full mt-2 h-7 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[10px] rounded text-zinc-300 flex items-center justify-center gap-1.5 font-semibold transition-colors"
          >
            <span>Testar Evento Ctrl+K</span>
          </button>
        </div>
      </div>

      <div className="bg-zinc-950/30 border border-zinc-900 rounded-lg p-5 md:col-span-2">
        <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-zinc-900 mb-3">
          <Sparkles size={12} className="text-zinc-450" />
          <span>Identidade Visual</span>
        </h3>
        <p className="text-[11px] text-zinc-500 font-sans leading-relaxed">
          Inspirado pela simplicidade e velocidade do Linear App. Focado em tipografia balanceada,
          cantos arredondados discretos e interação simplificada para maximizar o foco.
        </p>
      </div>

      <ConfirmModal
        isOpen={shortcutModalOpen}
        title="Atalho testado!"
        message="Para abrir a Paleta de Comandos de verdade, basta pressionar Cmd + K (ou Ctrl + K) a qualquer momento."
        cancelText={null}
        confirmText="OK"
        onConfirm={() => setShortcutModalOpen(false)}
        onCancel={() => setShortcutModalOpen(false)}
      />
    </div>
  );
}
