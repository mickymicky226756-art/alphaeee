import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface ToastItem { id: number; msg: string; kind: ToastKind; }

interface ToastApi {
  show: (msg: string, kind?: ToastKind, duration?: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function AdminToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((msg: string, kind: ToastKind = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { id, msg, kind }]);
    setTimeout(() => {
      setItems((cur) => cur.map((t) => (t.id === id ? { ...t, removing: true as never } : t)));
      setTimeout(() => {
        setItems((cur) => cur.filter((t) => t.id !== id));
      }, 300);
    }, duration);
  }, []);

  useEffect(() => {
    (window as unknown as { adminToast: ToastApi }).adminToast = { show };
    return () => {
      delete (window as unknown as { adminToast?: ToastApi }).adminToast;
    };
  }, [show]);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="admin-toast-container">
        {items.map((t) => (
          <div key={t.id} className={`admin-toast ${t.kind}`}>
            <i
              className={`fa-solid ${
                t.kind === 'success'
                  ? 'fa-circle-check'
                  : t.kind === 'error'
                  ? 'fa-circle-exclamation'
                  : t.kind === 'warning'
                  ? 'fa-triangle-exclamation'
                  : 'fa-circle-info'
              }`}
            />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useAdminToast(): ToastApi['show'] {
  const ctx = useContext(Ctx);
  if (!ctx) return () => {};
  return ctx.show;
}
