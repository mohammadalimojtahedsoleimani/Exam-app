import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRightOutlined, CheckCircleOutlined, ClockCircleOutlined, CloudSyncOutlined,
  DatabaseOutlined, DownloadOutlined, FileSearchOutlined, FilterOutlined,
  ReloadOutlined, SafetyCertificateOutlined, SearchOutlined, WarningOutlined,
} from '@ant-design/icons';
import {
  getRequestLogs, getLogStorageStatus, syncRequestLogs, subscribeRequestLogs,
  requestPersistentLogStorage,
} from '../utils/requestLogStore.js';
import './RequestLogs.css';

const PAGE_SIZE = 20;
const CATEGORY_LABELS = {
  success: 'موفق', 'client-error': 'خطای درخواست', 'server-error': 'خطای سرور',
  'network-error': 'خطای شبکه', canceled: 'لغوشده', other: 'سایر پاسخ‌ها',
};
const INITIAL_STORAGE = {
  browserAvailable: true, diskAvailable: false, pendingCount: 0, error: null, persistent: false,
};
const EMPTY_FILTERS = {
  profileId: '', groupNumber: '', sessionId: '', category: '', method: '', search: '', from: '', to: '',
};
const digits = value => String(value ?? '')
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));
const normalized = value => digits(value).trim().toLocaleLowerCase();
const number = value => Number(value ?? 0).toLocaleString('fa-IR');
const displayValue = value => value === null || value === undefined || value === '' ? 'ثبت نشده' : String(value);
const localTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'زمان نامشخص' : date.toLocaleString('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};
const safeJSON = value => JSON.stringify(value ?? null, null, 2);

function Payload({ title, value }) {
  return (
    <section className="request-logs-payload">
      <h4>{title}</h4>
      <pre tabIndex={0} aria-label={title} dir="ltr">{safeJSON(value)}</pre>
    </section>
  );
}

function LogEntry({ record }) {
  const category = CATEGORY_LABELS[record.category] ?? CATEGORY_LABELS.other;
  const completed = record.completedAt ?? record.startedAt;
  return (
    <details className={`request-log-entry request-log-entry--${record.category}`}>
      <summary>
        <span className="request-log-entry__request">
          <span className="request-log-method" dir="ltr">{record.method}</span>
          <span className="request-log-entry__url" dir="ltr" title={record.url}>{record.url}</span>
        </span>
        <span className="request-log-entry__identity">
          <span className="request-log-entry__profile" dir="auto">{record.profileId ?? 'بدون شناسه'}</span>
          <span>گروه {record.groupNumber === null || record.groupNumber === undefined ? '—' : number(record.groupNumber)}</span>
        </span>
        <span className="request-log-status">
          {record.category === 'success' ? <CheckCircleOutlined aria-hidden="true" /> : <WarningOutlined aria-hidden="true" />}
          <b dir="ltr">{record.status ?? '—'}</b>
          <span>{category}</span>
        </span>
        <span className="request-log-entry__time">
          <time dateTime={completed}>{localTime(completed)}</time>
          <span>{number(record.durationMs)} میلی‌ثانیه</span>
        </span>
        <span className="request-log-entry__expand" aria-hidden="true">⌄</span>
      </summary>
      <div className="request-log-entry__details">
        <div className="request-log-entry__detail-heading">
          <h3>جزئیات درخواست و پاسخ</h3>
          <span className={`request-log-archive ${record.archived ? 'request-log-archive--saved' : ''}`}>
            {record.archived ? <DatabaseOutlined aria-hidden="true" /> : <CloudSyncOutlined aria-hidden="true" />}
            {record.archived ? 'ذخیره‌شده در آرشیو دیسک' : 'در انتظار آرشیو دیسک'}
          </span>
        </div>
        <dl className="request-log-metadata">
          <div><dt>شناسه شرکت‌کننده</dt><dd dir="auto">{displayValue(record.profileId)}</dd></div>
          <div><dt>شماره گروه</dt><dd>{displayValue(record.groupNumber)}</dd></div>
          <div><dt>جلسه آزمون</dt><dd dir="ltr">{displayValue(record.sessionId)}</dd></div>
          <div><dt>جلسه مرورگر</dt><dd dir="ltr">{displayValue(record.browserSessionId)}</dd></div>
          <div><dt>مرحله آزمون</dt><dd>{displayValue(record.phaseName ?? record.phase)}</dd></div>
          <div><dt>شناسه مرحله</dt><dd dir="ltr">{displayValue(record.phaseId)}</dd></div>
          <div><dt>شروع درخواست (UTC)</dt><dd dir="ltr">{displayValue(record.startedAt)}</dd></div>
          <div><dt>دریافت پاسخ (UTC)</dt><dd dir="ltr">{displayValue(record.completedAt)}</dd></div>
          <div><dt>منطقه زمانی ثبت</dt><dd dir="ltr">{displayValue(record.timeZone)}</dd></div>
          <div><dt>وضعیت شبکه هنگام ارسال</dt><dd>{record.online === false ? 'آفلاین' : 'آنلاین'}</dd></div>
          <div><dt>شناسه رویداد</dt><dd dir="ltr">{record.id}</dd></div>
          <div><dt>وضعیت HTTP</dt><dd dir="ltr">{record.status ?? 'No response'} {record.statusText}</dd></div>
          <div className="request-log-metadata__wide"><dt>نشانی درخواست</dt><dd dir="ltr">{record.url}</dd></div>
          <div className="request-log-metadata__wide"><dt>صفحه هنگام ارسال</dt><dd dir="ltr">{displayValue(record.pageUrl)}</dd></div>
          <div className="request-log-metadata__wide"><dt>مرورگر</dt><dd dir="ltr">{displayValue(record.userAgent)}</dd></div>
        </dl>
        {record.error && (
          <section className="request-log-error" aria-label="جزئیات خطا">
            <h4><WarningOutlined aria-hidden="true" /> جزئیات خطا</h4>
            <p dir="auto">{record.error.message}</p>
            <Payload title="نوع، کد و مسیر خطا" value={record.error} />
          </section>
        )}
        <div className="request-log-payload-grid">
          <Payload title="هدرهای درخواست" value={record.request?.headers} />
          <Payload title="هدرهای پاسخ" value={record.response?.headers} />
          <Payload title="پارامترهای درخواست" value={record.request?.params} />
          <Payload title="بدنه درخواست" value={record.request?.body} />
          <div className="request-log-payload-grid__wide"><Payload title="بدنه کامل پاسخ" value={record.response?.body} /></div>
        </div>
      </div>
    </details>
  );
}

export default function RequestLogs() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    profileId: searchParams.get('profileId') ?? '',
    groupNumber: searchParams.get('groupNumber') ?? '',
    sessionId: searchParams.get('sessionId') ?? '',
  }));
  const deferredFilters = useDeferredValue(filters);
  const [records, setRecords] = useState([]);
  const [storage, setStorage] = useState(INITIAL_STORAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [storageRequest, setStorageRequest] = useState(false);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const load = useCallback(async (sync = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (sync) setRefreshing(true);
    try {
      if (sync) await syncRequestLogs();
      const nextRecords = await getRequestLogs();
      const nextStorage = await getLogStorageStatus();
      if (!mountedRef.current) return;
      setRecords(nextRecords);
      setStorage(nextStorage);
      setError('');
      setUpdatedAt(new Date().toISOString());
    } catch {
      if (mountedRef.current) setError('خواندن سوابق کامل نشد. دوباره بارگذاری کنید؛ سوابق نمایش‌داده‌شده حفظ شده‌اند.');
    } finally {
      loadingRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [load]);

  useEffect(() => {
    if (!live) return undefined;
    let timeout;
    const unsubscribe = subscribeRequestLogs(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => { void load(); }, 400);
    });
    const interval = setInterval(() => { void load(); }, 15000);
    return () => {
      unsubscribe();
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [live, load]);

  const filtered = useMemo(() => records.filter(record => {
    const { profileId, groupNumber, sessionId, category, method, search, from, to } = deferredFilters;
    if (profileId && !normalized(record.profileId).includes(normalized(profileId))) return false;
    if (groupNumber && normalized(record.groupNumber) !== normalized(groupNumber)) return false;
    if (sessionId && ![record.sessionId, record.browserSessionId].some(value => normalized(value).includes(normalized(sessionId)))) return false;
    if (category && record.category !== category) return false;
    if (method && record.method !== method) return false;
    const completedTime = new Date(record.completedAt ?? record.startedAt).getTime();
    if (from && completedTime < new Date(`${from}T00:00:00`).getTime()) return false;
    if (to && completedTime > new Date(`${to}T23:59:59.999`).getTime()) return false;
    if (search && !normalized([
      record.url, record.status, record.error?.message, record.error?.code,
      record.profileId, record.groupNumber, record.sessionId,
      safeJSON(record.response?.body),
    ].join(' ')).includes(normalized(search))) return false;
    return true;
  }), [records, deferredFilters]);

  const stats = useMemo(() => ({
    total: filtered.length,
    success: filtered.filter(record => record.category === 'success').length,
    errors: filtered.filter(record => record.category === 'client-error').length,
    sessions: new Set(filtered.map(record => record.sessionId ?? record.browserSessionId).filter(Boolean)).size,
  }), [filtered]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const visibleRecords = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const hasFilters = Object.values(filters).some(Boolean);
  const methods = useMemo(() => [...new Set(records.map(record => record.method))].sort(), [records]);

  const changeFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(1);
  };
  const clearFilters = () => { setFilters({ ...EMPTY_FILTERS }); setPage(1); };
  const exportRecords = () => {
    try {
      const exportTime = new Date().toISOString();
      const data = { version: 1, exportedAt: exportTime, filters: deferredFilters, count: filtered.length, records: filtered };
      const url = URL.createObjectURL(new Blob([safeJSON(data)], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `request-logs-${exportTime.replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`فایل شامل ${number(filtered.length)} رویداد برای دریافت آماده شد.`);
    } catch {
      setNotice('آماده‌سازی فایل انجام نشد. دوباره دریافت کنید.');
    }
  };
  const persistStorage = async () => {
    setStorageRequest(true);
    try {
      const granted = await requestPersistentLogStorage();
      setNotice(granted ? 'درخواست نگهداری پایدار مرورگر پذیرفته شد.' : 'مرورگر نگهداری پایدار را نپذیرفت. برای نسخه مستقل، فایل JSON را دریافت کنید.');
      await load();
    } catch {
      setNotice('درخواست نگهداری پایدار انجام نشد. برای نسخه مستقل، فایل JSON را دریافت کنید.');
    } finally {
      setStorageRequest(false);
    }
  };

  return (
    <div className="request-logs-page" dir="rtl">
      <a className="request-logs-skip" href="#request-logs-main">رفتن به سوابق درخواست‌ها</a>
      <div className="request-logs-shell">
        <header className="request-logs-topbar">
          <Link className="request-logs-brand" to="/" aria-label="سامانه پژوهش؛ صفحه ثبت‌نام">
            <span className="request-logs-brand__icon"><FileSearchOutlined aria-hidden="true" /></span>
            <span><strong>سامانه پژوهش رحمتـی</strong><small>مرکز پایش درخواست‌ها</small></span>
          </Link>
          <nav aria-label="صفحه‌های سامانه">
            <Link to="/results">نتایج شرکت‌کنندگان</Link>
            <Link className="request-logs-button" to="/"><ArrowRightOutlined aria-hidden="true" /> بازگشت به ثبت‌نام</Link>
          </nav>
        </header>

        <main id="request-logs-main" tabIndex={-1}>
          <section className="request-logs-hero" aria-labelledby="request-logs-title">
            <div>
              <span className="request-logs-eyebrow"><span aria-hidden="true" /> سوابق ارتباط با سرور</span>
              <h1 id="request-logs-title">هر درخواست، یک سابقه روشن</h1>
              <p>درخواست‌های موفق و خطاها را با شناسه شرکت‌کننده، گروه و جلسه بررسی کنید؛ از لحظه ارسال تا جزئیات پاسخ.</p>
            </div>
            <div className="request-logs-hero__actions">
              <button className="request-logs-button request-logs-button--primary" type="button" onClick={exportRecords} disabled={!filtered.length || loading}>
                <DownloadOutlined aria-hidden="true" /> دریافت سوابق JSON
              </button>
              <span>همه نتایج فیلترشده، همراه با جزئیات کامل</span>
            </div>
          </section>

          <section className="request-logs-stats" aria-label="آمار سوابق فیلترشده">
            <div className="request-logs-stat"><span className="request-logs-stat__icon"><FileSearchOutlined aria-hidden="true" /></span><div><span>کل رویدادها</span><strong>{number(stats.total)}</strong></div><small>در محدوده انتخاب‌شده</small></div>
            <div className="request-logs-stat request-logs-stat--success"><span className="request-logs-stat__icon"><CheckCircleOutlined aria-hidden="true" /></span><div><span>پاسخ‌های موفق</span><strong>{number(stats.success)}</strong></div><small dir="ltr">HTTP 2xx</small></div>
            <div className="request-logs-stat request-logs-stat--error"><span className="request-logs-stat__icon"><WarningOutlined aria-hidden="true" /></span><div><span>خطاهای درخواست</span><strong>{number(stats.errors)}</strong></div><small dir="ltr">HTTP 4xx</small></div>
            <div className="request-logs-stat request-logs-stat--sessions"><span className="request-logs-stat__icon"><ClockCircleOutlined aria-hidden="true" /></span><div><span>جلسه‌های ثبت‌شده</span><strong>{number(stats.sessions)}</strong></div><small>جلسه آزمون یا مرورگر</small></div>
          </section>

          <section className={`request-logs-storage ${storage.diskAvailable ? 'request-logs-storage--saved' : ''}`} aria-labelledby="request-logs-storage-title">
            <span className="request-logs-storage__icon"><SafetyCertificateOutlined aria-hidden="true" /></span>
            <div>
              <h2 id="request-logs-storage-title">{storage.diskAvailable ? 'آرشیو دیسک در دسترس است' : 'وضعیت نگهداری سوابق'}</h2>
              <p>{storage.diskAvailable
                ? `سوابق آرشیوشده با توقف و راه‌اندازی دوباره برنامه باقی می‌مانند. ${number(storage.pendingCount)} رویداد در انتظار همگام‌سازی است.`
                : `آرشیو دیسک در دسترس نیست. ${number(storage.pendingCount)} رویداد در انتظار همگام‌سازی است؛ پس از اتصال دوباره ارسال می‌شود.`}</p>
              <p className="request-logs-storage__note">سوابق انقضای خودکار ندارند. پاک‌کردن داده‌های مرورگر می‌تواند نسخه محلی را حذف کند؛ برای پشتیبان مستقل، خروجی JSON بگیرید.</p>
              {storage.error && <p className="request-logs-storage__error" dir="auto">{storage.error}</p>}
              {!storage.browserAvailable && <p className="request-logs-storage__error">ذخیره‌سازی مرورگر در دسترس نیست. اتصال آرشیو دیسک را بررسی و از سوابق موجود خروجی بگیرید.</p>}
            </div>
            {storage.persistent ? <span className="request-logs-storage__badge"><CheckCircleOutlined aria-hidden="true" /> نگهداری پایدار مرورگر</span> : (
              <button className="request-logs-button" type="button" onClick={persistStorage} disabled={storageRequest || !storage.browserAvailable}>
                {storageRequest ? 'در حال درخواست…' : 'درخواست نگهداری پایدار'}
              </button>
            )}
          </section>

          <section className="request-logs-panel" aria-labelledby="request-logs-filter-title">
            <div className="request-logs-panel__heading">
              <h2 id="request-logs-filter-title"><FilterOutlined aria-hidden="true" /> پیدا کردن رویداد</h2>
              {hasFilters && <button className="request-logs-text-button" type="button" onClick={clearFilters}>پاک‌کردن فیلترها</button>}
            </div>
            <div className="request-logs-filters">
              <label>شناسه شرکت‌کننده<input name="log-profile" value={filters.profileId} onChange={event => changeFilter('profileId', event.target.value)} placeholder="شناسه پروفایل" dir="auto" autoComplete="off" /></label>
              <label>شماره گروه<input name="log-group" value={filters.groupNumber} onChange={event => changeFilter('groupNumber', event.target.value)} placeholder="مثلاً ۲" inputMode="numeric" autoComplete="off" /></label>
              <label className="request-logs-filters__session">شناسه جلسه<input name="log-session" value={filters.sessionId} onChange={event => changeFilter('sessionId', event.target.value)} placeholder="جلسه آزمون یا مرورگر" dir="auto" autoComplete="off" /></label>
              <label>نوع پاسخ<select name="log-category" value={filters.category} onChange={event => changeFilter('category', event.target.value)}><option value="">همه پاسخ‌ها</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>متد HTTP<select name="log-method" value={filters.method} onChange={event => changeFilter('method', event.target.value)} dir="ltr"><option value="">همه متدها</option>{methods.map(method => <option key={method} value={method}>{method}</option>)}</select></label>
              <label>از تاریخ<input name="log-from" type="date" value={filters.from} onChange={event => changeFilter('from', event.target.value)} dir="ltr" max={filters.to || undefined} /></label>
              <label>تا تاریخ<input name="log-to" type="date" value={filters.to} onChange={event => changeFilter('to', event.target.value)} dir="ltr" min={filters.from || undefined} /></label>
              <label className="request-logs-filters__search">جست‌وجو در نشانی، کد پاسخ یا خطا<span><SearchOutlined aria-hidden="true" /><input name="log-search" type="search" value={filters.search} onChange={event => changeFilter('search', event.target.value)} placeholder="نشانی درخواست، ۴۰۰ یا پیام خطا…" autoComplete="off" /></span></label>
            </div>
          </section>

          <section className="request-logs-panel request-logs-history" aria-labelledby="request-logs-history-title" aria-busy={loading}>
            <div className="request-logs-panel__heading">
              <div><h2 id="request-logs-history-title">تاریخچه درخواست‌ها <span className="request-logs-count">{number(filtered.length)}</span></h2><p>جدیدترین رویداد ابتدا نمایش داده می‌شود. برای دیدن جزئیات، هر ردیف را باز کنید.</p></div>
              <div className="request-logs-history__actions">
                <label className="request-logs-live"><input type="checkbox" checked={live} onChange={event => setLive(event.target.checked)} /><span className={live ? 'is-live' : ''} aria-hidden="true" /> به‌روزرسانی زنده</label>
                <button className="request-logs-button" type="button" disabled={refreshing} onClick={() => { void load(true); }}><ReloadOutlined spin={refreshing} aria-hidden="true" />{refreshing ? 'در حال بارگذاری…' : 'بارگذاری دوباره'}</button>
              </div>
            </div>
            <div className="request-logs-announcement" role="status">{notice}</div>
            {error && <p className="request-logs-error" role="alert"><WarningOutlined aria-hidden="true" />{error}</p>}
            {loading ? <div className="request-logs-empty" role="status"><CloudSyncOutlined aria-hidden="true" /><h3>در حال خواندن سوابق…</h3><p>نسخه مرورگر و آرشیو دیسک بررسی می‌شوند.</p></div> : !filtered.length ? (
              <div className="request-logs-empty"><FileSearchOutlined aria-hidden="true" /><h3>{hasFilters ? 'رویدادی با این فیلترها پیدا نشد' : 'هنوز درخواستی ثبت نشده است'}</h3><p>{hasFilters ? 'شناسه، گروه یا بازه تاریخ را تغییر دهید تا سوابق بیشتری ببینید.' : 'پس از ارسال درخواست‌های سامانه، پاسخ‌های موفق و خطاها اینجا ثبت می‌شوند.'}</p>{hasFilters ? <button className="request-logs-button" type="button" onClick={clearFilters}>پاک‌کردن فیلترها</button> : <Link className="request-logs-button" to="/">رفتن به ثبت‌نام</Link>}</div>
            ) : <div className="request-log-list">{visibleRecords.map(record => <LogEntry key={record.id} record={record} />)}</div>}
            <footer className="request-logs-pagination">
              <div><span>{filtered.length ? `${number((activePage - 1) * PAGE_SIZE + 1)} تا ${number(Math.min(activePage * PAGE_SIZE, filtered.length))} از ${number(filtered.length)} رویداد` : '۰ رویداد'}</span>{updatedAt && <small>آخرین بررسی: {localTime(updatedAt)}</small>}</div>
              {pageCount > 1 && <nav aria-label="صفحه‌های تاریخچه"><button type="button" className="request-logs-button" disabled={activePage <= 1} onClick={() => setPage(activePage - 1)}>صفحه قبل</button><span>صفحه {number(activePage)} از {number(pageCount)}</span><button type="button" className="request-logs-button" disabled={activePage >= pageCount} onClick={() => setPage(activePage + 1)}>صفحه بعد</button></nav>}
            </footer>
          </section>
          <p className="request-logs-footnote"><DatabaseOutlined aria-hidden="true" /> پاسخ‌های 2xx و 4xx، خطاهای سرور و قطع ارتباط، با زمان وقوع و جزئیات ثبت می‌شوند. اطلاعات محرمانه ورود از سوابق حذف می‌شوند.</p>
        </main>
      </div>
    </div>
  );
}
