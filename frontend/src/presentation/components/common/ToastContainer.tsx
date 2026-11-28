import React from 'react';
import { useApp } from '../../../application/store/AppContext';
import { IconAlert, IconCheck, IconRefresh } from './Icons';

export const ToastContainer: React.FC = () => {
  const { toasts } = useApp();

  return (
    <div id="toasts" className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.type === 'error' ? <IconAlert /> : t.type === 'success' ? <IconCheck /> : <IconRefresh />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
};
