import React from 'react';
import { useApp } from '../../../application/store/AppContext';
import { IconClose } from './Icons';

export const ShortcutsModal: React.FC = () => {
  const { shortcutsOpen, setShortcutsOpen } = useApp();
  if (!shortcutsOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShortcutsOpen(false);
      }}
    >
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" aria-labelledby="shortcutsTitle">
        <div className="modal-card__top">
          <h3 id="shortcutsTitle" className="modal-card__title">
            Atalhos de Teclado &amp; Dicas
          </h3>
          <button
            className="icon-btn"
            type="button"
            aria-label="Fechar"
            onClick={() => setShortcutsOpen(false)}
          >
            <IconClose />
          </button>
        </div>
        <div className="shortcuts-grid">
          <div className="shortcut-row"><kbd>Ctrl</kbd> + <kbd>K</kbd><span>Abrir Paleta de Comandos</span></div>
          <div className="shortcut-row"><kbd>/</kbd><span>Focar busca de containers</span></div>
          <div className="shortcut-row"><kbd>Ctrl</kbd> + <kbd>B</kbd><span>Mostrar / ocultar barra lateral</span></div>
          <div className="shortcut-row"><kbd>Alt</kbd> + <kbd>W</kbd><span>Fechar aba ativa no painel focado</span></div>
          <div className="shortcut-row"><kbd>?</kbd><span>Mostrar atalhos de teclado</span></div>
          <div className="shortcut-row"><kbd>Esc</kbd><span>Fechar modal ou limpar foco</span></div>
        </div>
        <div className="modal-card__tip">
          <strong>Dica de produtividade:</strong> Arraste qualquer aba para as bordas (esquerda, direita, topo ou base) de um painel ou use os botões de divisão na barra da aba para visualizar múltiplos containers lado a lado.
        </div>
      </div>
    </div>
  );
};
