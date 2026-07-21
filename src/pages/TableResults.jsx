import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Button,
  ConfigProvider,
  Input,
  Pagination,
  Table,
  Tooltip,
  theme,
} from 'antd';
import faIR from 'antd/locale/fa_IR';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BarChartOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CloseCircleOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  EllipsisOutlined,
  FileExcelOutlined,
  FilterOutlined,
  InfoCircleFilled,
  LoadingOutlined,
  ManOutlined,
  ReloadOutlined,
  SafetyCertificateFilled,
  SearchOutlined,
  SwapOutlined,
  TeamOutlined,
  UserOutlined,
  WarningFilled,
  WomanOutlined,
} from '@ant-design/icons';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { cssTransition, Slide, toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import mainlogo from '../assets/mainlogo.png';
import infs from '../assets/infs.png';
import { API_SERVER } from '../utils/API_SERVER.js';
import { APP_ROUTE } from '../utils/phaseFlow.js';
import './TableResults.css';

const GLOBAL_TOAST_CONTAINER_ID = 'app-global';
const RESULTS_FETCH_TOAST_ID = 'results-fetch-feedback';
const RESULTS_CSV_TOAST_ID = 'results-csv-feedback';
const MOBILE_PAGE_SIZE = 6;

const ReducedMotionToastTransition = cssTransition({
  enter: 'results-toast-reduced-motion-enter',
  exit: 'results-toast-reduced-motion-exit',
  collapse: false,
});

const PHASE_COLORS = {
  تمرین: { bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)', text: '#fbbf24' },
  'بیس لاین': { bg: 'rgba(45, 212, 191, 0.12)', border: 'rgba(45, 212, 191, 0.3)', text: '#5eead4' },
  'خلق مثبت': { bg: 'rgba(134, 239, 172, 0.12)', border: 'rgba(134, 239, 172, 0.3)', text: '#86efac' },
  'خلق منفی': { bg: 'rgba(252, 165, 165, 0.12)', border: 'rgba(252, 165, 165, 0.3)', text: '#fca5a5' },
};

const DEFAULT_PHASE_COLOR = {
  bg: 'rgba(148, 163, 184, 0.12)',
  border: 'rgba(148, 163, 184, 0.3)',
  text: '#cbd5e1',
};

const DOWNLOAD_BUTTON_CONFIG = {
  idle: {
    Icon: FileExcelOutlined,
    label: 'دریافت گزارش‌ها',
    tooltip: 'دریافت همه گزارش‌های موجود این شرکت‌کننده',
  },
  downloading: {
    Icon: LoadingOutlined,
    label: 'در حال دریافت گزارش‌ها…',
    tooltip: 'گزارش‌ها در حال آماده‌سازی هستند',
  },
  done: {
    Icon: CheckCircleFilled,
    label: 'درخواست دریافت انجام شد',
    tooltip: 'برای دریافت دوباره کلیک کنید',
  },
  partial: {
    Icon: WarningFilled,
    label: 'دریافت ناقص؛ تلاش دوباره',
    tooltip: 'برخی گزارش‌ها دریافت نشدند؛ برای تلاش دوباره کلیک کنید',
  },
  error: {
    Icon: CloseCircleFilled,
    label: 'دریافت ناموفق؛ تلاش دوباره',
    tooltip: 'برای تلاش دوباره کلیک کنید',
  },
  empty: {
    Icon: InfoCircleFilled,
    label: 'گزارشی موجود نیست',
    tooltip: 'در حال حاضر گزارشی برای این شرکت‌کننده موجود نیست',
  },
};

const normalizeDigits = (value) => String(value ?? '')
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));

const normalizeSearchValue = (value) => normalizeDigits(value)
  .trim()
  .toLocaleLowerCase('fa-IR');

const escapeCsvCell = (value) => {
  const text = String(value ?? '');
  const formulaSafeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafeText.replace(/"/g, '""')}"`;
};

const formatNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toLocaleString('fa-IR') : String(value);
};

const getGenderMeta = (gender) => {
  if (gender === 'FEMALE') {
    return { label: 'زن', Icon: WomanOutlined, tone: 'female' };
  }

  if (gender === 'MALE') {
    return { label: 'مرد', Icon: ManOutlined, tone: 'male' };
  }

  return { label: 'نامشخص', Icon: UserOutlined, tone: 'unknown' };
};

const getReportToastId = (subjectId) => (
  `results-report-${encodeURIComponent(String(subjectId ?? 'unknown')).slice(0, 96)}`
);

const ResultsToastContent = ({ type, title, message }) => {
  const icons = {
    success: CheckCircleFilled,
    error: CloseCircleFilled,
    warning: WarningFilled,
    info: InfoCircleFilled,
  };
  const Icon = icons[type] ?? InfoCircleFilled;

  return (
    <div className={`results-toast-content results-toast-content--${type}`} dir="rtl">
      <span className="results-toast-content__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="results-toast-content__copy">
        <strong>{title}</strong>
        <span>{message}</span>
      </span>
    </div>
  );
};

const showResultsToast = ({ toastId, type, title, message, reduceMotion }) => {
  const content = <ResultsToastContent type={type} title={title} message={message} />;
  const options = {
    containerId: GLOBAL_TOAST_CONTAINER_ID,
    toastId,
    type,
    transition: reduceMotion ? ReducedMotionToastTransition : Slide,
    theme: 'dark',
    icon: false,
    hideProgressBar: true,
    autoClose: type === 'error' || type === 'warning' ? 5200 : 3800,
    closeButton: true,
    closeOnClick: true,
    draggable: 'touch',
    className: `app-toast app-toast--${type} results-toast`,
    role: type === 'error' || type === 'warning' ? 'alert' : 'status',
    ariaLabel: `${title}؛ ${message}`,
  };

  if (toast.isActive(toastId, GLOBAL_TOAST_CONTAINER_ID)) {
    toast.update(toastId, {
      ...options,
      render: content,
      isLoading: false,
    });
    return;
  }

  toast(content, options);
};

const getDownloadFilename = (contentDisposition, fallbackName) => {
  if (!contentDisposition) return fallbackName;

  const encodedMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const plainMatch = contentDisposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  const rawFilename = encodedMatch?.[1] ?? plainMatch?.[1] ?? plainMatch?.[2];

  if (!rawFilename) return fallbackName;

  let filename = rawFilename.trim();
  try {
    filename = decodeURIComponent(filename);
  } catch {
    // Keep the server-provided filename when it is not URI encoded.
  }

  return filename.replace(/[\\/]/g, '_') || fallbackName;
};

const downloadFile = async (url, fallbackName) => {
  const response = await axios.get(url, { responseType: 'blob' });
  const filename = getDownloadFilename(response.headers['content-disposition'], fallbackName);
  const contentType = response.headers['content-type'] || 'application/octet-stream';
  const blobUrl = URL.createObjectURL(new Blob([response.data], { type: contentType }));
  const anchor = document.createElement('a');

  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
};

const renderSortIcon = ({ sortOrder }) => (
  <SwapOutlined
    aria-hidden="true"
    className={sortOrder ? 'results-sort-icon results-sort-icon--active' : 'results-sort-icon'}
  />
);

const renderPaginationItem = (_, type, originalElement) => {
  const controls = {
    prev: { label: 'صفحه پیشین', Icon: ArrowRightOutlined },
    next: { label: 'صفحه بعد', Icon: ArrowLeftOutlined },
    'jump-prev': { label: 'چند صفحه به عقب', Icon: EllipsisOutlined },
    'jump-next': { label: 'چند صفحه به جلو', Icon: EllipsisOutlined },
  };
  const control = controls[type];

  if (!control || !React.isValidElement(originalElement)) return originalElement;

  const { Icon } = control;
  return React.cloneElement(
    originalElement,
    { 'aria-label': control.label },
    <Icon aria-hidden="true" />,
  );
};

const StatCard = ({ icon, label, value, tone, loading }) => (
  <div className={`results-stat results-stat--${tone}`} role="listitem">
    <span className="results-stat__icon" aria-hidden="true">{icon}</span>
    <span className="results-stat__copy">
      <span className="results-stat__label">{label}</span>
      <strong className="results-stat__value" aria-busy={loading}>
        {loading ? (
          <span className="results-stat__skeleton" aria-label="در حال بارگذاری" />
        ) : value}
      </strong>
    </span>
  </div>
);

const DownloadPill = ({ phase, reduceMotion }) => {
  const color = PHASE_COLORS[phase.label] || DEFAULT_PHASE_COLOR;
  const isDone = phase.status === 'done';
  const isFailed = phase.status === 'error';
  const Icon = isFailed ? CloseCircleFilled : isDone ? CheckCircleFilled : LoadingOutlined;
  const state = isFailed ? 'error' : isDone ? 'done' : 'pending';

  return (
    <span
      className={`results-phase-pill results-phase-pill--${state}`}
      style={{
        '--phase-color': color.text,
        '--phase-bg': color.bg,
        '--phase-border': color.border,
      }}
    >
      <Icon spin={!isDone && !isFailed && !reduceMotion} aria-hidden="true" />
      <span>{phase.label}</span>
      <span className="sr-only">
        {isFailed ? 'ناموفق' : isDone ? 'درخواست دریافت شد' : 'در حال دریافت'}
      </span>
    </span>
  );
};

const DownloadAction = ({ participant, state, onDownload, reduceMotion }) => {
  const status = state?.status ?? 'idle';
  const config = DOWNLOAD_BUTTON_CONFIG[status] ?? DOWNLOAD_BUTTON_CONFIG.idle;
  const phases = Object.values(state?.phases ?? {});
  const isDownloading = status === 'downloading';
  const { Icon } = config;

  return (
    <div className="results-download" aria-busy={isDownloading}>
      {phases.length > 0 && (
        <div className="results-download__phases" aria-label="وضعیت گزارش‌های مراحل">
          {phases.map((phase, index) => (
            <DownloadPill
              key={`${phase.label}-${index}`}
              phase={phase}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      )}

      <Tooltip title={config.tooltip} placement="top">
        <span className="results-download__button-wrap">
          <Button
            className={`results-download__button results-download__button--${status}`}
            icon={<Icon spin={isDownloading && !reduceMotion} aria-hidden="true" />}
            disabled={isDownloading}
            onClick={() => onDownload(participant.subject_id)}
            aria-label={`${config.label} برای شناسه ${participant.subject_id}`}
            block
          >
            {config.label}
          </Button>
        </span>
      </Tooltip>
    </div>
  );
};

const EmptyResults = ({ search, onClear }) => {
  const hasSearch = Boolean(search.trim());
  const Icon = hasSearch ? SearchOutlined : DatabaseOutlined;

  return (
    <div className="results-empty">
      <span className="results-empty__icon" aria-hidden="true"><Icon /></span>
      <h3>{hasSearch ? 'نتیجه‌ای پیدا نشد' : 'هنوز داده‌ای ثبت نشده است'}</h3>
      <p>
        {hasSearch
          ? <>عبارت <bdi>«{search.trim()}»</bdi> با شناسه، جنسیت یا گروهی مطابقت ندارد.</>
          : 'پس از ثبت نخستین شرکت‌کننده، اطلاعات او در این بخش نمایش داده می‌شود.'}
      </p>
      {hasSearch && (
        <Button icon={<CloseCircleOutlined aria-hidden="true" />} onClick={onClear}>
          پاک کردن جست‌وجو
        </Button>
      )}
    </div>
  );
};

const MobileParticipantCard = ({ participant, state, onDownload, reduceMotion }) => {
  const gender = getGenderMeta(participant.gender);
  const { Icon: GenderIcon } = gender;

  return (
    <article className="results-mobile-card">
      <header className="results-mobile-card__header">
        <span className="results-participant-avatar" aria-hidden="true">
          {participant.subject_id === 'admin'
            ? <SafetyCertificateFilled />
            : String(participant.subject_id ?? '—').slice(-2)}
        </span>
        <span className="results-mobile-card__identity">
          <small>شناسه شرکت‌کننده</small>
          <strong dir="auto">{participant.subject_id ?? '—'}</strong>
        </span>
        <span className={`results-gender results-gender--${gender.tone}`}>
          <GenderIcon aria-hidden="true" />
          {gender.label}
        </span>
      </header>

      <dl className="results-mobile-card__meta">
        <div>
          <dt>سن</dt>
          <dd>{participant.age != null ? formatNumber(participant.age) : '—'}</dd>
        </div>
        <div>
          <dt>گروه</dt>
          <dd>{participant.group != null ? formatNumber(participant.group) : '—'}</dd>
        </div>
      </dl>

      <DownloadAction
        participant={participant}
        state={state}
        onDownload={onDownload}
        reduceMotion={reduceMotion}
      />
    </article>
  );
};

const MobileLoadingCards = () => (
  <div className="results-mobile-skeletons" aria-label="در حال بارگذاری شرکت‌کنندگان">
    {Array.from({ length: 3 }, (_, index) => (
      <div className="results-mobile-skeleton" key={index} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    ))}
  </div>
);

export default function ParticipantsTable() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);
  const [downloadState, setDownloadState] = useState({});
  const timersRef = useRef(new Set());
  const reduceMotionRef = useRef(reduceMotion);

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  const scheduleTimer = useCallback((callback, delay) => {
    const timerId = window.setTimeout(() => {
      timersRef.current.delete(timerId);
      callback();
    }, delay);
    timersRef.current.add(timerId);
    return timerId;
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach(timerId => window.clearTimeout(timerId));
    timersRef.current.clear();
  }, []);

  const loadParticipants = useCallback(async ({ signal, announce = false } = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_SERVER()}user/participants/`, { signal });
      if (!Array.isArray(response.data)) {
        throw new Error('The participants API returned an invalid response.');
      }

      const nextParticipants = response.data.map((participant, index) => {
        if (!participant || typeof participant !== 'object') {
          throw new Error('The participants API included an invalid record.');
        }

        return {
          ...participant,
          __rowKey: `${String(participant.subject_id ?? 'participant')}-${index}`,
        };
      });

      setParticipants(nextParticipants);
      setError(null);

      if (announce) {
        showResultsToast({
          toastId: RESULTS_FETCH_TOAST_ID,
          type: 'success',
          title: 'فهرست به‌روزرسانی شد',
          message: `${nextParticipants.length.toLocaleString('fa-IR')} شرکت‌کننده دریافت شد.`,
          reduceMotion: reduceMotionRef.current,
        });
      }
    } catch (requestError) {
      if (axios.isCancel(requestError) || requestError.code === 'ERR_CANCELED') return;

      console.error('Failed to load participants', requestError);
      const message = 'دریافت فهرست شرکت‌کنندگان انجام نشد. اتصال سرور را بررسی و دوباره تلاش کنید.';
      setError(message);

      if (announce) {
        showResultsToast({
          toastId: RESULTS_FETCH_TOAST_ID,
          type: 'error',
          title: 'به‌روزرسانی فهرست ناموفق بود',
          message,
          reduceMotion: reduceMotionRef.current,
        });
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadParticipants({ signal: controller.signal });
    return () => controller.abort();
  }, [loadParticipants]);

  const resetDownloadStateLater = useCallback((subjectId, expectedStatus, delay = 4500) => {
    scheduleTimer(() => setDownloadState(previous => {
      if (previous[subjectId]?.status !== expectedStatus) return previous;

      const next = { ...previous };
      delete next[subjectId];
      return next;
    }), delay);
  }, [scheduleTimer]);

  const downloadAllPhases = useCallback(async (subjectId) => {
    const stateKey = String(subjectId);
    const toastId = getReportToastId(subjectId);
    setDownloadState(previous => ({
      ...previous,
      [stateKey]: { status: 'downloading', phases: {} },
    }));

    let resultData;
    try {
      const encodedSubjectId = encodeURIComponent(stateKey);
      const response = await axios.get(`${API_SERVER()}user/participants/${encodedSubjectId}/`);
      resultData = response.data?.result_data;
    } catch (requestError) {
      console.error(`Failed to fetch data for ${stateKey}`, requestError);
      setDownloadState(previous => ({
        ...previous,
        [stateKey]: { status: 'error', phases: {} },
      }));
      showResultsToast({
        toastId,
        type: 'error',
        title: 'اطلاعات گزارش دریافت نشد',
        message: `دریافت اطلاعات شناسه ${stateKey} انجام نشد؛ دوباره تلاش کنید.`,
        reduceMotion,
      });
      resetDownloadStateLater(stateKey, 'error');
      return;
    }

    if (!Array.isArray(resultData)) {
      setDownloadState(previous => ({
        ...previous,
        [stateKey]: { status: 'error', phases: {} },
      }));
      showResultsToast({
        toastId,
        type: 'error',
        title: 'پاسخ گزارش معتبر نیست',
        message: 'ساختار پاسخ گزارش‌های این شرکت‌کننده قابل پردازش نبود.',
        reduceMotion,
      });
      resetDownloadStateLater(stateKey, 'error');
      return;
    }

    if (resultData.length === 0) {
      setDownloadState(previous => ({
        ...previous,
        [stateKey]: { status: 'empty', phases: {} },
      }));
      showResultsToast({
        toastId,
        type: 'info',
        title: 'گزارشی موجود نیست',
        message: `هنوز گزارشی برای شناسه ${stateKey} آماده نشده است.`,
        reduceMotion,
      });
      resetDownloadStateLater(stateKey, 'empty');
      return;
    }

    const phaseEntries = resultData.map((entry, index) => ({
      key: `phase-${index}-${String(entry?.phase_name ?? '')}`,
      label: String(entry?.phase_name || `مرحله ${index + 1}`),
      reportFile: entry?.report_file,
    }));
    const initialPhases = Object.fromEntries(phaseEntries.map(phase => [
      phase.key,
      { label: phase.label, status: 'pending' },
    ]));

    setDownloadState(previous => ({
      ...previous,
      [stateKey]: { status: 'downloading', phases: initialPhases },
    }));

    const phaseResults = await Promise.all(phaseEntries.map(async (phase) => {
      const fallbackName = `${stateKey}_${phase.label}.xlsx`;

      try {
        if (!phase.reportFile) throw new Error('The report file URL is missing.');
        const fullUrl = new URL(phase.reportFile, API_SERVER()).href;
        await downloadFile(fullUrl, fallbackName);
        setDownloadState(previous => ({
          ...previous,
          [stateKey]: {
            ...previous[stateKey],
            phases: {
              ...previous[stateKey]?.phases,
              [phase.key]: { label: phase.label, status: 'done' },
            },
          },
        }));
        return { ...phase, status: 'done' };
      } catch (downloadError) {
        console.error(`Failed to download ${phase.label} for ${stateKey}`, downloadError);
        setDownloadState(previous => ({
          ...previous,
          [stateKey]: {
            ...previous[stateKey],
            phases: {
              ...previous[stateKey]?.phases,
              [phase.key]: { label: phase.label, status: 'error' },
            },
          },
        }));
        return { ...phase, status: 'error' };
      }
    }));

    const finalPhases = Object.fromEntries(phaseResults.map(phase => [
      phase.key,
      { label: phase.label, status: phase.status },
    ]));
    const failedCount = phaseResults.filter(phase => phase.status === 'error').length;
    const succeededCount = phaseResults.length - failedCount;
    const finalStatus = failedCount === 0
      ? 'done'
      : failedCount === phaseResults.length
        ? 'error'
        : 'partial';

    setDownloadState(previous => ({
      ...previous,
      [stateKey]: { status: finalStatus, phases: finalPhases },
    }));

    if (finalStatus === 'done') {
      showResultsToast({
        toastId,
        type: 'success',
        title: 'درخواست گزارش‌ها انجام شد',
        message: `درخواست دریافت ${phaseResults.length.toLocaleString('fa-IR')} فایل برای شناسه ${stateKey} به مرورگر ارسال شد.`,
        reduceMotion,
      });
    } else if (finalStatus === 'partial') {
      showResultsToast({
        toastId,
        type: 'warning',
        title: 'دریافت برخی گزارش‌ها ناموفق بود',
        message: `${succeededCount.toLocaleString('fa-IR')} از ${phaseResults.length.toLocaleString('fa-IR')} فایل آماده شد؛ دوباره تلاش کنید.`,
        reduceMotion,
      });
    } else {
      showResultsToast({
        toastId,
        type: 'error',
        title: 'گزارش‌ها دریافت نشدند',
        message: 'هیچ‌یک از فایل‌ها دریافت نشد؛ اتصال شبکه را بررسی و دوباره تلاش کنید.',
        reduceMotion,
      });
    }

    resetDownloadStateLater(stateKey, finalStatus);
  }, [reduceMotion, resetDownloadStateLater]);

  const normalizedSearch = useMemo(() => normalizeSearchValue(search), [search]);
  const filteredParticipants = useMemo(() => participants.filter((participant) => {
    const genderLabel = participant.gender === 'MALE'
      ? 'مرد'
      : participant.gender === 'FEMALE'
        ? 'زن'
        : '';

    return normalizeSearchValue(participant.subject_id).includes(normalizedSearch)
      || normalizeSearchValue(participant.group).includes(normalizedSearch)
      || normalizeSearchValue(genderLabel).includes(normalizedSearch);
  }), [normalizedSearch, participants]);

  const stats = useMemo(() => {
    const females = participants.filter(participant => participant.gender === 'FEMALE').length;
    const males = participants.filter(participant => participant.gender === 'MALE').length;
    const ages = participants
      .filter(participant => participant.age != null)
      .map(participant => Number(participant.age))
      .filter(Number.isFinite);
    const averageAge = ages.length
      ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length)
      : '—';

    return {
      total: participants.length,
      females,
      males,
      averageAge,
    };
  }, [participants]);

  const scheduleCsvLoadingEnd = useCallback(() => {
    scheduleTimer(() => setDownloadingCSV(false), reduceMotion ? 0 : 500);
  }, [reduceMotion, scheduleTimer]);

  const downloadCSV = useCallback(() => {
    setDownloadingCSV(true);

    try {
      const headers = ['شناسه شرکت‌کننده', 'سن', 'جنسیت', 'گروه'];
      const rows = filteredParticipants.map(participant => [
        participant.subject_id,
        participant.age ?? '',
        participant.gender === 'MALE' ? 'مرد' : participant.gender === 'FEMALE' ? 'زن' : '',
        participant.group ?? '',
      ]);
      const csv = `\uFEFF${[headers, ...rows]
        .map(row => row.map(escapeCsvCell).join(','))
        .join('\n')}`;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = 'شرکت‌کنندگان.csv';
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      showResultsToast({
        toastId: RESULTS_CSV_TOAST_ID,
        type: 'success',
        title: 'خروجی فهرست آماده شد',
        message: `فایل CSV شامل ${filteredParticipants.length.toLocaleString('fa-IR')} ردیف ایجاد شد.`,
        reduceMotion,
      });
    } catch (csvError) {
      console.error('Failed to export participants CSV', csvError);
      showResultsToast({
        toastId: RESULTS_CSV_TOAST_ID,
        type: 'error',
        title: 'ساخت فایل CSV ناموفق بود',
        message: 'مرورگر نتوانست فایل خروجی را ایجاد کند؛ دوباره تلاش کنید.',
        reduceMotion,
      });
    } finally {
      scheduleCsvLoadingEnd();
    }
  }, [filteredParticipants, reduceMotion, scheduleCsvLoadingEnd]);

  const handleSearchChange = (event) => {
    setSearch(event.target.value);
    setMobilePage(1);
  };

  const clearSearch = () => {
    setSearch('');
    setMobilePage(1);
  };

  const mobilePageCount = Math.max(1, Math.ceil(filteredParticipants.length / MOBILE_PAGE_SIZE));
  const safeMobilePage = Math.min(mobilePage, mobilePageCount);
  const mobileParticipants = filteredParticipants.slice(
    (safeMobilePage - 1) * MOBILE_PAGE_SIZE,
    safeMobilePage * MOBILE_PAGE_SIZE,
  );

  const columns = useMemo(() => [
    {
      title: 'شناسه شرکت‌کننده',
      dataIndex: 'subject_id',
      key: 'subject_id',
      sorter: (first, second) => String(first.subject_id).localeCompare(String(second.subject_id), 'fa'),
      sortIcon: renderSortIcon,
      render: (subjectId) => (
        <span className="results-participant-cell">
          <span className="results-participant-avatar" aria-hidden="true">
            {subjectId === 'admin'
              ? <SafetyCertificateFilled />
              : String(subjectId ?? '—').slice(-2)}
          </span>
          <span className="results-participant-id" dir="auto">{subjectId ?? '—'}</span>
          {subjectId === 'admin' && <span className="results-admin-badge">مدیر</span>}
        </span>
      ),
    },
    {
      title: 'سن',
      dataIndex: 'age',
      key: 'age',
      sorter: (first, second) => (first.age ?? -1) - (second.age ?? -1),
      sortIcon: renderSortIcon,
      render: (age) => age != null
        ? <span className="results-data-chip results-data-chip--age">{formatNumber(age)}</span>
        : <span className="results-data-empty">—</span>,
    },
    {
      title: 'جنسیت',
      dataIndex: 'gender',
      key: 'gender',
      filters: [
        { text: 'زن', value: 'FEMALE' },
        { text: 'مرد', value: 'MALE' },
      ],
      filterIcon: isFiltered => (
        <FilterOutlined
          aria-hidden="true"
          className={isFiltered ? 'results-filter-icon results-filter-icon--active' : 'results-filter-icon'}
        />
      ),
      onFilter: (value, record) => record.gender === value,
      render: (genderValue) => {
        const gender = getGenderMeta(genderValue);
        const { Icon } = gender;
        return (
          <span className={`results-gender results-gender--${gender.tone}`}>
            <Icon aria-hidden="true" />
            {gender.label}
          </span>
        );
      },
    },
    {
      title: 'گروه',
      dataIndex: 'group',
      key: 'group',
      sorter: (first, second) => String(first.group ?? '').localeCompare(String(second.group ?? ''), 'fa'),
      sortIcon: renderSortIcon,
      render: (group) => group != null
        ? <span className="results-data-chip results-data-chip--group">گروه {formatNumber(group)}</span>
        : <span className="results-data-empty">—</span>,
    },
    {
      title: 'گزارش‌های آزمون',
      key: 'download',
      width: 300,
      render: (_, record) => (
        <DownloadAction
          participant={record}
          state={downloadState[String(record.subject_id)]}
          onDownload={downloadAllPhases}
          reduceMotion={reduceMotion}
        />
      ),
    },
  ], [downloadAllPhases, downloadState, reduceMotion]);

  const enterTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.38, ease: [0.22, 1, 0.36, 1] };
  const exportDisabled = loading || downloadingCSV || filteredParticipants.length === 0;
  const exportTooltip = filteredParticipants.length === 0
    ? 'برای ساخت خروجی، دست‌کم یک نتیجه لازم است'
    : 'ساخت فایل CSV از نتیجه جست‌وجوی متنی';

  return (
    <ConfigProvider
      direction="rtl"
      locale={faIR}
      componentSize="large"
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#2dd4bf',
          colorInfo: '#38bdf8',
          colorSuccess: '#2dd4bf',
          colorWarning: '#fbbf24',
          colorError: '#fb7185',
          colorBgBase: '#020617',
          colorBgContainer: '#0b1324',
          colorBgElevated: '#0f1c2e',
          colorBorder: '#475569',
          colorText: '#e8eef7',
          colorTextSecondary: '#a8b5c8',
          borderRadius: 14,
          controlHeightLG: 48,
          fontFamily: "'Vazirmatn', Tahoma, sans-serif",
          motion: !reduceMotion,
        },
        components: {
          Table: {
            headerBg: 'rgba(45, 212, 191, 0.07)',
            headerColor: '#cbd5e1',
            rowHoverBg: 'rgba(45, 212, 191, 0.055)',
            borderColor: 'rgba(148, 163, 184, 0.13)',
            colorBgContainer: 'transparent',
            headerSplitColor: 'rgba(148, 163, 184, 0.13)',
          },
          Input: {
            colorBgContainer: 'rgba(2, 6, 23, 0.52)',
            colorBorder: '#64748b',
            colorText: '#f8fafc',
            colorTextPlaceholder: '#7f8da3',
            hoverBorderColor: '#5eead4',
            activeBorderColor: '#2dd4bf',
            activeShadow: '0 0 0 3px rgba(45, 212, 191, 0.13)',
          },
          Pagination: {
            colorPrimary: '#2dd4bf',
            colorBgContainer: 'rgba(15, 23, 42, 0.82)',
            itemActiveBg: 'rgba(13, 148, 136, 0.14)',
          },
          Tooltip: {
            colorBgSpotlight: '#122137',
            colorTextLightSolid: '#f8fafc',
          },
        },
      }}
    >
      <main className="results-page" dir="rtl">
        <a className="results-skip-link" href="#results-data">پرش به فهرست نتایج</a>

        <div className="results-backdrop" aria-hidden="true">
          <span className="results-backdrop__grid" />
          <span className="results-backdrop__glow results-backdrop__glow--teal" />
          <span className="results-backdrop__glow results-backdrop__glow--blue" />
          <span className="results-backdrop__beam" />
        </div>

        <div className="results-shell">
          <Motion.header
            className="results-topbar"
            initial={reduceMotion ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={enterTransition}
            aria-label="سربرگ سامانه نتایج"
          >
            <div className="results-brand">
              <span className="results-brand__mark"><img src={mainlogo} alt="" /></span>
              <span className="results-brand__copy">
                <strong>سامانه آزمون پژوهشی</strong>
                <span>دانشگاه خوارزمی</span>
              </span>
              <span className="results-brand__divider" aria-hidden="true" />
              <span className="results-brand__partner">
                <span className="results-brand__partner-mark"><img src={infs} alt="" /></span>
                <span><small>با حمایت</small>بنیاد ملی علم ایران</span>
              </span>
            </div>

            <Button
              className="results-back-button"
              icon={<ArrowRightOutlined aria-hidden="true" />}
              onClick={() => navigate(APP_ROUTE.SIGN_UP)}
            >
              <span className="results-back-button__full">بازگشت به ثبت‌نام</span>
              <span className="results-back-button__compact">ثبت‌نام</span>
            </Button>
          </Motion.header>

          <Motion.section
            className="results-hero"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.06 }}
            aria-labelledby="results-page-title"
          >
            <div className="results-hero__copy">
              <span className="results-hero__eyebrow">
                <BarChartOutlined aria-hidden="true" />
                داشبورد داده‌های پژوهش
              </span>
              <h1 id="results-page-title">
                گزارش <span>شرکت‌کنندگان</span>
              </h1>
              <p>مرور اطلاعات ثبت‌نام، جست‌وجوی سریع و دریافت گزارش مراحل آزمون در یک نمای یکپارچه.</p>
            </div>
            <div className="results-hero__visual" aria-hidden="true">
              <span className="results-hero__orbit" />
              <span className="results-hero__visual-icon"><DatabaseOutlined /></span>
              <span className="results-hero__visual-dot results-hero__visual-dot--one" />
              <span className="results-hero__visual-dot results-hero__visual-dot--two" />
            </div>
          </Motion.section>

          <Motion.div
            className="results-stats"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.1 }}
            role="list"
            aria-label="خلاصه آماری شرکت‌کنندگان"
          >
            <StatCard
              icon={<UserOutlined />}
              label="کل شرکت‌کنندگان"
              value={stats.total.toLocaleString('fa-IR')}
              tone="teal"
              loading={loading}
            />
            <StatCard
              icon={<WomanOutlined />}
              label="زنان"
              value={stats.females.toLocaleString('fa-IR')}
              tone="pink"
              loading={loading}
            />
            <StatCard
              icon={<ManOutlined />}
              label="مردان"
              value={stats.males.toLocaleString('fa-IR')}
              tone="blue"
              loading={loading}
            />
            <StatCard
              icon={<TeamOutlined />}
              label="میانگین سن"
              value={typeof stats.averageAge === 'number'
                ? stats.averageAge.toLocaleString('fa-IR')
                : stats.averageAge}
              tone="violet"
              loading={loading}
            />
          </Motion.div>

          {error && (
            <Alert
              className="results-error-alert"
              type="error"
              icon={<CloseCircleFilled aria-hidden="true" />}
              message="بارگذاری فهرست شرکت‌کنندگان انجام نشد"
              description={error}
              showIcon
              action={(
                <Button
                  icon={<ReloadOutlined aria-hidden="true" />}
                  onClick={() => loadParticipants({ announce: true })}
                >
                  تلاش دوباره
                </Button>
              )}
            />
          )}

          <Motion.section
            id="results-data"
            className="results-workspace"
            tabIndex={-1}
            aria-labelledby="results-list-title"
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.14 }}
          >
            <div className="results-workspace__sheen" aria-hidden="true" />
            <header className="results-workspace__header">
              <span className="results-workspace__title-icon" aria-hidden="true">
                <BarChartOutlined />
              </span>
              <span className="results-workspace__title-copy">
                <small>داده‌های ثبت‌شده</small>
                <h2 id="results-list-title">فهرست شرکت‌کنندگان</h2>
              </span>
              <span className="results-count" role="status" aria-live="polite" aria-atomic="true">
                {loading
                  ? 'در حال دریافت…'
                  : `${filteredParticipants.length.toLocaleString('fa-IR')} از ${stats.total.toLocaleString('fa-IR')} نفر`}
              </span>
            </header>

            <div className="results-toolbar" role="search" aria-label="جست‌وجو و خروجی فهرست">
              <label className="results-search">
                <span className="sr-only">جست‌وجو بر اساس شناسه، جنسیت یا گروه</span>
                <Input
                  className="results-search__input"
                  prefix={<SearchOutlined aria-hidden="true" />}
                  aria-label="جست‌وجو بر اساس شناسه، جنسیت یا گروه"
                  placeholder="جست‌وجو بر اساس شناسه، جنسیت یا گروه…"
                  value={search}
                  onChange={handleSearchChange}
                  allowClear={{ clearIcon: <CloseCircleOutlined aria-hidden="true" /> }}
                />
              </label>

              <Tooltip title={exportTooltip} placement="top">
                <span className="results-export-wrap">
                  <Button
                    className="results-export-button"
                    icon={downloadingCSV
                      ? <LoadingOutlined spin={!reduceMotion} aria-hidden="true" />
                      : <DownloadOutlined aria-hidden="true" />}
                    disabled={exportDisabled}
                    onClick={downloadCSV}
                  >
                    خروجی CSV
                  </Button>
                </span>
              </Tooltip>
            </div>

            <p className="results-workspace__hint">
              <InfoCircleFilled aria-hidden="true" />
              فایل CSV شامل تمام ردیف‌های نتیجه جست‌وجوی متنی است.
            </p>

            <div className="results-desktop-table">
              <Table
                columns={columns}
                dataSource={filteredParticipants}
                rowKey="__rowKey"
                loading={{
                  spinning: loading,
                  indicator: (
                    <LoadingOutlined
                      className="results-table-loader"
                      spin={!reduceMotion}
                      aria-label="در حال بارگذاری فهرست"
                    />
                  ),
                }}
                pagination={{
                  pageSize: 10,
                  responsive: true,
                  itemRender: renderPaginationItem,
                  showSizeChanger: true,
                  showTotal: total => `${total.toLocaleString('fa-IR')} شرکت‌کننده`,
                  position: ['bottomEnd'],
                }}
                scroll={{ x: 1040 }}
                locale={{
                  emptyText: <EmptyResults search={search} onClear={clearSearch} />,
                  filterConfirm: 'اعمال',
                  filterReset: 'پاک کردن',
                }}
                showSorterTooltip={{ title: 'مرتب‌سازی ستون' }}
                rowClassName="results-table-row"
                size="middle"
              />
            </div>

            <div className="results-mobile-list">
              {loading ? (
                <MobileLoadingCards />
              ) : filteredParticipants.length === 0 ? (
                <EmptyResults search={search} onClear={clearSearch} />
              ) : (
                <div className="results-mobile-list__cards">
                  {mobileParticipants.map(participant => (
                    <MobileParticipantCard
                      key={participant.__rowKey}
                      participant={participant}
                      state={downloadState[String(participant.subject_id)]}
                      onDownload={downloadAllPhases}
                      reduceMotion={reduceMotion}
                    />
                  ))}
                </div>
              )}

              {!loading && filteredParticipants.length > MOBILE_PAGE_SIZE && (
                <Pagination
                  className="results-mobile-pagination"
                  current={safeMobilePage}
                  total={filteredParticipants.length}
                  pageSize={MOBILE_PAGE_SIZE}
                  onChange={setMobilePage}
                  itemRender={renderPaginationItem}
                  showSizeChanger={false}
                  simple
                />
              )}
            </div>
          </Motion.section>

          <footer className="results-footer">
            <span>پروتکل پژوهشی دانشگاه خوارزمی</span>
            <span className="results-footer__separator" aria-hidden="true" />
            <span>با حمایت بنیاد ملی علم ایران</span>
          </footer>
        </div>
      </main>
    </ConfigProvider>
  );
}
