import React from 'react';
import { useApp } from '../../../application/store/AppContext';
import { IconAlert } from './Icons';

export const ConfirmModal: React.FC = () => {
  const { confirmRequest, resolveConfirm } = useApp();
  if (!confirmRequest) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) resolveConfirm(false);
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div className="modal-card__icon modal-card__icon--danger">
          <IconAlert />
        </div>
        <h3 id="confirmTitle" className="modal-card__title">
          {confirmRequest.title}
        </h3>
        <p className="modal-card__desc">{confirmRequest.message}</p>
        <div className="modal-card__actions">
          <button className="btn" type="button" onClick={() => resolveConfirm(false)}>
            Cancelar
          </button>
          <button
            className="btn btn--danger-solid"
            type="button"
            autoFocus
            onClick={() => resolveConfirm(true)}
          >
            {confirmRequest.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
