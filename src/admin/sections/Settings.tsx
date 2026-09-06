import { useEffect, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import { useAdminToast } from '../components/Toast';
import { ENV, isFirebaseConfigured } from '../../config/env';
import { DEFAULT_TELEGRAM_LINKS } from '../../types/admin';

const isUrl = (s: string) => /^https?:\/\/.+/i.test(s.trim());

export function SettingsSection({ active }: { active: boolean }) {
  const store = getDataStore();
  const toast = useAdminToast();

  const [minDeposit, setMinDeposit] = useState('');
  const [minWithdraw, setMinWithdraw] = useState('');
  const [withdrawFee, setWithdrawFee] = useState('');
  const [regBonus, setRegBonus] = useState('');
  const [maxDailyWithdraw, setMaxDailyWithdraw] = useState('');
  const [processingHoursMin, setProcessingHoursMin] = useState('');
  const [processingHoursMax, setProcessingHoursMax] = useState('');
  const [referralLevel1, setReferralLevel1] = useState('');
  const [referralLevel2, setReferralLevel2] = useState('');
  const [referralLevel3, setReferralLevel3] = useState('');

  const [tgChannel, setTgChannel] = useState(DEFAULT_TELEGRAM_LINKS.channel);
  const [tgGroup, setTgGroup] = useState(DEFAULT_TELEGRAM_LINKS.group);
  const [tgService, setTgService] = useState(DEFAULT_TELEGRAM_LINKS.service);

  const [savingCfg, setSavingCfg] = useState(false);
  const [savingTg, setSavingTg] = useState(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const [cfg, tg] = await Promise.all([store.getConfig(), store.getTelegramLinks()]);
      if (!alive) return;
      setMinDeposit(String(cfg.minDeposit));
      setMinWithdraw(String(cfg.minWithdraw));
      setWithdrawFee(String(cfg.withdrawalFee));
      setRegBonus(String(cfg.registrationBonus));
      setMaxDailyWithdraw(String(cfg.maxDailyWithdraw));
      setProcessingHoursMin(String(cfg.processingHoursMin));
      setProcessingHoursMax(String(cfg.processingHoursMax));
      setReferralLevel1(String(cfg.referralLevel1));
      setReferralLevel2(String(cfg.referralLevel2));
      setReferralLevel3(String(cfg.referralLevel3));
      setTgChannel(tg.channel);
      setTgGroup(tg.group);
      setTgService(tg.service);
    };
    load();
    return () => {
      alive = false;
    };
  }, [active, store]);

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      await store.saveConfig({
        minDeposit: parseFloat(minDeposit) || 0,
        minWithdraw: parseFloat(minWithdraw) || 0,
        withdrawalFee: parseFloat(withdrawFee) || 0,
        registrationBonus: parseFloat(regBonus) || 0,
        maxDailyWithdraw: parseFloat(maxDailyWithdraw) || 0,
        processingHoursMin: parseInt(processingHoursMin, 10) || 0,
        processingHoursMax: parseInt(processingHoursMax, 10) || 0,
        referralLevel1: parseFloat(referralLevel1) || 0,
        referralLevel2: parseFloat(referralLevel2) || 0,
        referralLevel3: parseFloat(referralLevel3) || 0,
      });
      toast('Configuration saved', 'success');
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    } finally {
      setSavingCfg(false);
    }
  };

  const saveTg = async () => {
    if (tgChannel && !isUrl(tgChannel)) return toast('Channel link must start with http:// or https://', 'error');
    if (tgGroup && !isUrl(tgGroup)) return toast('Group link must start with http:// or https://', 'error');
    if (tgService && !isUrl(tgService)) return toast('Service link must start with http:// or https://', 'error');
    setSavingTg(true);
    try {
      await store.saveTelegramLinks({
        channel: tgChannel.trim() || DEFAULT_TELEGRAM_LINKS.channel,
        group: tgGroup.trim() || DEFAULT_TELEGRAM_LINKS.group,
        service: tgService.trim() || DEFAULT_TELEGRAM_LINKS.service,
      });
      toast('Telegram links saved', 'success');
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    } finally {
      setSavingTg(false);
    }
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-gear" /> Settings
        </h1>
        <p>Platform-wide configuration. Changes are live for all users.</p>
      </div>
      <div className="admin-page-content">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-sliders" /> Business Rules
            </h3>
          </div>
          <div className="admin-card-body">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Min Deposit (BDT)</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={minDeposit}
                  onChange={(e) => setMinDeposit(e.target.value)}
                  min={0}
                />
                <p className="admin-form-help">
                  <i className="fa-solid fa-circle-info" /> Recharge requests below this amount are blocked on the user side.
                </p>
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Min Withdraw (BDT)</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={minWithdraw}
                  onChange={(e) => setMinWithdraw(e.target.value)}
                  min={0}
                />
              </div>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Withdraw Fee (%)</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={withdrawFee}
                  onChange={(e) => setWithdrawFee(e.target.value)}
                  min={0}
                  max={100}
                  step="0.1"
                />
                <p className="admin-form-help">
                  <i className="fa-solid fa-circle-info" /> Applied to the gross withdraw amount; net = amount − fee.
                </p>
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Registration Bonus (BDT)</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={regBonus}
                  onChange={(e) => setRegBonus(e.target.value)}
                  min={0}
                />
                <p className="admin-form-help">
                  <i className="fa-solid fa-circle-info" /> Credited to new users on signup. Shown on the login page.
                </p>
              </div>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Max Daily Withdrawal (BDT)</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={maxDailyWithdraw}
                  onChange={(e) => setMaxDailyWithdraw(e.target.value)}
                  min={0}
                />
                <p className="admin-form-help">
                  <i className="fa-solid fa-circle-info" /> Shown as a rule on the withdrawal page.
                </p>
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Processing Time (hours, min &ndash; max)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    className="admin-form-input"
                    value={processingHoursMin}
                    onChange={(e) => setProcessingHoursMin(e.target.value)}
                    min={0}
                    placeholder="min"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    className="admin-form-input"
                    value={processingHoursMax}
                    onChange={(e) => setProcessingHoursMax(e.target.value)}
                    min={0}
                    placeholder="max"
                    style={{ flex: 1 }}
                  />
                </div>
                <p className="admin-form-help">
                  <i className="fa-solid fa-circle-info" /> Displayed as &ldquo;1 to 48 hours&rdquo; on the withdrawal rules.
                </p>
              </div>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">
                  <i className="fa-solid fa-people-arrows" /> Referral Commission (%)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    className="admin-form-input"
                    value={referralLevel1}
                    onChange={(e) => setReferralLevel1(e.target.value)}
                    min={0}
                    step="0.1"
                    placeholder="L1 %"
                    style={{ flex: 1 }}
                    title="Direct referrer (level 1)"
                  />
                  <input
                    type="number"
                    className="admin-form-input"
                    value={referralLevel2}
                    onChange={(e) => setReferralLevel2(e.target.value)}
                    min={0}
                    step="0.1"
                    placeholder="L2 %"
                    style={{ flex: 1 }}
                    title="Referrer's referrer (level 2)"
                  />
                  <input
                    type="number"
                    className="admin-form-input"
                    value={referralLevel3}
                    onChange={(e) => setReferralLevel3(e.target.value)}
                    min={0}
                    step="0.1"
                    placeholder="L3 %"
                    style={{ flex: 1 }}
                    title="Level 3 upline"
                  />
                </div>
                <p className="admin-form-help">
                  <i className="fa-solid fa-circle-info" /> Percent of each approved deposit paid to L1 / L2 / L3 referrers. Set any level to 0 to skip payouts for that level. Live across the app immediately on save.
                </p>
              </div>
            </div>
            <button className="admin-btn btn-success" onClick={saveConfig} disabled={savingCfg}>
              <i className="fa-solid fa-floppy-disk" /> Save Configuration
            </button>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-brands fa-telegram" /> Telegram Links
            </h3>
          </div>
          <div className="admin-card-body">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Channel</label>
                <input
                  className="admin-form-input"
                  value={tgChannel}
                  onChange={(e) => setTgChannel(e.target.value)}
                  placeholder="https://t.me/your_channel"
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Group</label>
                <input
                  className="admin-form-input"
                  value={tgGroup}
                  onChange={(e) => setTgGroup(e.target.value)}
                  placeholder="https://t.me/your_group"
                />
              </div>
            </div>
            <div className="admin-form-row admin-form-row full">
              <div className="admin-form-group">
                <label className="ad-label">Customer Service</label>
                <input
                  className="admin-form-input"
                  value={tgService}
                  onChange={(e) => setTgService(e.target.value)}
                  placeholder="https://t.me/your_support"
                />
              </div>
            </div>
            <button className="admin-btn btn-success" onClick={saveTg} disabled={savingTg}>
              <i className="fa-solid fa-floppy-disk" /> Save Links
            </button>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-circle-info" /> Backend
            </h3>
          </div>
          <div className="admin-card-body">
            <div className="admin-info-grid">
              <div className="admin-info-row">
                <span className="ad-k">Storage Mode</span>
                <span className="ad-v">
                  {isFirebaseConfigured
                    ? 'Firebase Realtime DB'
                    : 'Demo (localStorage)'}
                </span>
              </div>
              <div className="admin-info-row">
                <span className="ad-k">Admin IDs</span>
                <span className="ad-v">
                  Super: {ENV.admin.super.id} · Withdrawals: {ENV.admin.withdrawals.id}
                </span>
              </div>
              <div className="admin-info-row">
                <span className="ad-k">Brand</span>
                <span className="ad-v">{ENV.brandName}</span>
              </div>
              <div className="admin-info-row">
                <span className="ad-k">Project ID</span>
                <span className="ad-v">{ENV.firebase.projectId || '— not configured —'}</span>
              </div>
            </div>
            <p className="admin-form-help" style={{ marginTop: 12 }}>
              <i className="fa-solid fa-triangle-exclamation" />{' '}
              To switch from Demo to Firebase, set the <code>VITE_FIREBASE_*</code>{' '}
              env vars in <code>.env</code> and restart the dev server.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
