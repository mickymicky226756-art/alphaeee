import { useEffect, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import type { AdminPlan } from '../../types/admin';
import { useConfirm } from '../components/ConfirmModal';
import { useAdminToast } from '../components/Toast';

const fmt = (n: number | string | undefined, d = 2) => {
  const v = parseFloat(String(n ?? 0));
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};

interface EditingPlan {
  id?: string;
  title: string;
  description: string;
  price: number;
  dailyIncome: number;
  duration: number;
  totalReturn: number;
  buyLimit: number;
  tag: 'hot' | 'new' | 'vip' | '';
  image: string;
  enabled: boolean;
  order: number;
}

const emptyPlan = (): EditingPlan => ({
  id: undefined,
  title: '',
  description: '',
  price: 500,
  dailyIncome: 25,
  duration: 30,
  totalReturn: 0,
  buyLimit: 1,
  tag: '',
  image: '',
  enabled: true,
  order: 0,
});

export function PlansSection({ active }: { active: boolean }) {
  const store = getDataStore();
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditingPlan>(emptyPlan());
  const toast = useAdminToast();
  const { showConfirm, confirmNode } = useConfirm();

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const list = await store.listPlans();
      if (!alive) return;
      setPlans(list);
      setLoading(false);
    };
    load();
    const off = store.onPlansChange((rows) => {
      if (!alive) return;
      setPlans(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
      off();
    };
  }, [active, store]);

  const startEdit = (p: AdminPlan) => {
    setForm({
      id: p.id,
      title: p.title,
      description: p.description,
      price: p.price,
      dailyIncome: p.dailyIncome,
      duration: p.duration,
      totalReturn: p.totalReturn,
      buyLimit: p.buyLimit,
      tag: (p.tag as EditingPlan['tag']) || '',
      image: p.image || '',
      enabled: p.enabled !== false,
      order: p.order ?? 0,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => setForm(emptyPlan());

  const save = async () => {
    if (saving) return;
    const f = form;
    if (!f.title.trim()) return toast('Please enter a plan title', 'error');
    if (!(f.price > 0)) return toast('Please enter a valid sample price', 'error');
    if (!(f.dailyIncome > 0)) return toast('Please enter a valid daily income amount', 'error');
    if (!(f.duration > 0)) return toast('Please enter a valid duration', 'error');
    if (!(f.buyLimit > 0)) return toast('Please enter a valid buy limit (per user)', 'error');

    const next: AdminPlan = {
      id: f.id || `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: f.title.trim(),
      description: f.description.trim(),
      price: Number(f.price) || 0,
      dailyIncome: Number(f.dailyIncome) || 0,
      duration: Number(f.duration) || 30,
      totalReturn: Number(f.totalReturn) || Number(f.dailyIncome) * Number(f.duration) || 0,
      buyLimit: Math.floor(Number(f.buyLimit)) || 1,
      tag: (f.tag || undefined) as AdminPlan['tag'],
      image: f.image.trim() || undefined,
      enabled: f.enabled,
      order: Number(f.order) || 0,
    };

    setSaving(true);
    try {
      await store.upsertPlan(next);
      toast(f.id ? 'Plan updated!' : 'Plan published!', 'success');
      cancelEdit();
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: AdminPlan) => {
    const ok = await showConfirm({
      title: 'Delete Plan',
      heading: 'Delete this plan?',
      message:
        'This plan will be removed. Users currently subscribed will keep their existing investments.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await store.deletePlan(p.id);
      toast('Plan deleted', 'success');
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-boxes-stacked" /> Investment Plans
        </h1>
        <p>Create, edit, and manage investment plans shown to users.</p>
      </div>
      <div className="admin-page-content">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className={form.id ? 'fa-solid fa-pen' : 'fa-solid fa-plus'} />{' '}
              {form.id ? 'Edit Investment Plan' : 'Add Investment Plan'}
            </h3>
          </div>
          <div className="admin-card-body">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">
                  Plan Title <span className="ad-req">*</span>
                </label>
                <input
                  className="admin-form-input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Starter Plan"
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Image URL</label>
                <input
                  className="admin-form-input"
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Description</label>
                <input
                  className="admin-form-input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Short pitch shown under the title"
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Tag</label>
                <select
                  className="admin-form-select"
                  value={form.tag}
                  onChange={(e) => setForm({ ...form, tag: e.target.value as EditingPlan['tag'] })}
                >
                  <option value="">None</option>
                  <option value="new">New</option>
                  <option value="hot">Hot</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">
                  Sample Price (BDT) <span className="ad-req">*</span>
                </label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={form.price}
                  min={0}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">
                  Daily Income (BDT) <span className="ad-req">*</span>
                </label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={form.dailyIncome}
                  min={0}
                  step="0.01"
                  onChange={(e) => setForm({ ...form, dailyIncome: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">
                  Duration (days) <span className="ad-req">*</span>
                </label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={form.duration}
                  min={1}
                  onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">
                  Buy Limit (per user) <span className="ad-req">*</span>
                </label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={form.buyLimit}
                  min={1}
                  onChange={(e) => setForm({ ...form, buyLimit: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Total Income (BDT)</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={form.totalReturn}
                  min={0}
                  step="0.01"
                  onChange={(e) => setForm({ ...form, totalReturn: parseFloat(e.target.value) || 0 })}
                  placeholder="auto = dailyIncome × duration"
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Order</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Status</label>
                <select
                  className="admin-form-select"
                  value={form.enabled ? 'enabled' : 'disabled'}
                  onChange={(e) => setForm({ ...form, enabled: e.target.value === 'enabled' })}
                >
                  <option value="enabled">Enabled (visible to users)</option>
                  <option value="disabled">Disabled (visible, not purchasable)</option>
                </select>
              </div>
              <div className="admin-form-group" />
            </div>

            <div className="admin-flex admin-gap-2">
              <button
                className="admin-btn btn-success admin-flex-1"
                onClick={save}
                disabled={saving}
                style={saving ? { opacity: 0.7, cursor: 'wait' } : undefined}
              >
                {saving ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" />
                    {form.id ? 'Saving…' : 'Publishing…'}
                  </>
                ) : (
                  <>
                    <i className={form.id ? 'fa-solid fa-floppy-disk' : 'fa-solid fa-paper-plane'} />
                    {form.id ? 'Update Plan' : 'Publish Plan'}
                  </>
                )}
              </button>
              {form.id && (
                <button className="admin-btn btn-secondary" onClick={cancelEdit}>
                  <i className="fa-solid fa-xmark" /> Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-list" /> Existing Plans ({plans.length})
            </h3>
          </div>
          <div className="admin-card-body">
            {loading ? (
              <div className="admin-loading">
                <i className="fa-solid fa-spinner fa-spin" />
                <p>Loading plans...</p>
              </div>
            ) : plans.length === 0 ? (
              <div className="admin-empty">
                <i className="fa-solid fa-box-open" />
                <h4>No plans yet</h4>
                <p>Create your first investment plan above.</p>
              </div>
            ) : (
              plans.map((p) => (
                <div className="admin-plan-card" key={p.id}>
                  <div className="admin-plan-icon">
                    <i className="fa-solid fa-leaf" />
                  </div>
                  <div className="admin-plan-info">
                    <div className="admin-plan-name">
                      {p.title}
                      {p.tag && (
                        <span
                          className={`admin-badge ${
                            p.tag === 'vip' ? 'gold' : p.tag === 'hot' ? 'danger' : 'info'
                          }`}
                        >
                          {p.tag.toUpperCase()}
                        </span>
                      )}
                      {!p.enabled && <span className="admin-badge muted">Disabled</span>}
                    </div>
                    <div className="admin-plan-meta">
                      BDT {fmt(p.dailyIncome)} / day · {p.duration} days · Total BDT {fmt(p.totalReturn)}
                    </div>
                    <div className="admin-plan-meta">
                      Buy limit: {p.buyLimit} per user
                    </div>
                  </div>
                  <div className="admin-plan-price">
                    {fmt(p.price)}
                    <small style={{ fontSize: '0.7rem', color: '#64748b' }}> BDT price</small>
                  </div>
                  <div className="admin-plan-actions">
                    <button className="admin-btn-icon" title="Edit" onClick={() => startEdit(p)}>
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button className="admin-btn-icon danger" title="Delete" onClick={() => remove(p)}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {confirmNode}
    </>
  );
}
