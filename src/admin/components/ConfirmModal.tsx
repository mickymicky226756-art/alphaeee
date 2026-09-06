import { useEffect, useState, type ReactNode } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  heading?: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title = 'Confirm',
  heading = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="admin-modal-backdrop show"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="admin-modal" style={{ maxWidth: 440 }}>
        <div className="admin-modal-header">
          <h2>
            <i className={`fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}`} />
            {title}
          </h2>
          <button className="admin-modal-close" onClick={onCancel} aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="admin-modal-body">
          <div className={`admin-confirm-body ${danger ? 'danger' : ''}`}>
            <div className="ad-icon">
              <i
                className={`fa-solid ${
                  danger ? 'fa-triangle-exclamation' : 'fa-question'
                }`}
              />
            </div>
            <h3>{heading}</h3>
            <p>{message}</p>
          </div>
        </div>
        <div className="admin-modal-footer admin-confirm-actions">
          <button className="admin-btn btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`admin-btn ${danger ? 'btn-danger' : 'btn-success'}`}
            onClick={onConfirm}
          >
            <i className="fa-solid fa-check" /> {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<
    (Omit<ConfirmModalProps, 'open' | 'onConfirm' | 'onCancel'> & {
      resolve: (v: boolean) => void;
    } | null)
  >(null);

  const showConfirm = (opts: Omit<ConfirmModalProps, 'open' | 'onConfirm' | 'onCancel'>) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  };

  const close = (v: boolean) => {
    setState((cur) => {
      cur?.resolve(v);
      return null;
    });
  };

  const node = state ? (
    <ConfirmModal
      open
      {...state}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { showConfirm, confirmNode: node };
}
