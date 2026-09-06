import { useEffect, useState } from 'react';

interface PromptModalProps {
  open: boolean;
  title?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  type?: 'text' | 'number';
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptModal({
  open,
  title = 'Input',
  label = 'Value',
  placeholder = '',
  defaultValue = '',
  type = 'text',
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

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
            <i className="fa-solid fa-pen-to-square" />
            {title}
          </h2>
          <button className="admin-modal-close" onClick={onCancel} aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="admin-modal-body">
          <label className="admin-form-group" style={{ display: 'block' }}>
            <span className="ad-label">{label}</span>
            <input
              autoFocus
              className="admin-form-input"
              type={type}
              step={type === 'number' ? 'any' : undefined}
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm(value);
              }}
            />
          </label>
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="admin-btn btn-success" onClick={() => onConfirm(value)}>
            <i className="fa-solid fa-check" /> OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function usePrompt() {
  const [state, setState] = useState<
    (Omit<PromptModalProps, 'open' | 'onConfirm' | 'onCancel'> & {
      resolve: (v: string | null) => void;
    } | null)
  >(null);

  const showPrompt = (opts: Omit<PromptModalProps, 'open' | 'onConfirm' | 'onCancel'>) => {
    return new Promise<string | null>((resolve) => {
      setState({ ...opts, resolve });
    });
  };

  const close = (v: string | null) => {
    setState((cur) => {
      cur?.resolve(v);
      return null;
    });
  };

  const node = state ? (
    <PromptModal
      open
      {...state}
      onConfirm={(v) => close(v)}
      onCancel={() => close(null)}
    />
  ) : null;

  return { showPrompt, promptNode: node };
}
