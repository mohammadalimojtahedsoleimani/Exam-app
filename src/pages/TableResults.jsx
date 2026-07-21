import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, Button, Input, Tag, ConfigProvider, theme, Space, Typography, Spin, Alert, Tooltip, Grid, message } from 'antd';
import faIR from 'antd/locale/fa_IR';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  ManOutlined,
  SearchOutlined,
  SwapOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
  WomanOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { API_SERVER } from "../utils/API_SERVER.js";
import { APP_ROUTE } from '../utils/phaseFlow.js';
const { Title, Text } = Typography;

// ── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, color }) => (
  <div style={{
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(20px)',
    border: `1px solid ${color}44`,
    borderRadius: '16px',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxShadow: `0 4px 24px ${color}11`,
    flex: 1,
    minWidth: '150px',
  }}>
    <div style={{
      width: '44px', height: '44px', borderRadius: '12px',
      background: `${color}22`, border: `1px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '22px', flexShrink: 0, color,
    }}>{icon}</div>
    <div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 700, marginBottom: '3px' }}>{label}</div>
      <div style={{ color: '#fff', fontSize: '26px', fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
    </div>
  </div>
);

// ── Phase badge colors ────────────────────────────────────────────────────────
const PHASE_COLORS = {
  'تمرین':    { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',  text: '#fbbf24' },
  'بیس لاین': { bg: 'rgba(45,212,191,0.12)',  border: 'rgba(45,212,191,0.3)',  text: '#2dd4bf' },
  'خلق مثبت': { bg: 'rgba(134,239,172,0.12)', border: 'rgba(134,239,172,0.3)', text: '#86efac' },
  'خلق منفی': { bg: 'rgba(252,165,165,0.12)', border: 'rgba(252,165,165,0.3)', text: '#fca5a5' },
};
const DEFAULT_PHASE_COLOR = { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)', text: '#94a3b8' };

const normalizeDigits = (value) => String(value ?? '')
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));

const normalizeSearchValue = (value) => normalizeDigits(value)
  .trim()
  .toLocaleLowerCase('fa-IR');

const escapeCsvCell = (value) => {
  const text = String(value ?? '');
  const formulaSafeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafeText.replace(/"/g, '""')}"`;
};

const renderSortIcon = ({ sortOrder }) => (
  <SwapOutlined
    aria-hidden="true"
    style={{ color: sortOrder ? '#2dd4bf' : 'rgba(255,255,255,0.35)' }}
  />
);

const renderPaginationItem = (_, type, originalElement) => {
  const controls = {
    prev: { label: 'صفحه پیشین', symbol: '→' },
    next: { label: 'صفحه بعد', symbol: '←' },
    'jump-prev': { label: 'چند صفحه به عقب', symbol: '…' },
    'jump-next': { label: 'چند صفحه به جلو', symbol: '…' },
  };
  const control = controls[type];

  if (!control || !React.isValidElement(originalElement)) return originalElement;

  return React.cloneElement(
    originalElement,
    { 'aria-label': control.label },
    <span aria-hidden="true">{control.symbol}</span>,
  );
};

// ── Download progress pill ────────────────────────────────────────────────────
const DownloadPill = ({ phase, done, failed }) => {
  const c = PHASE_COLORS[phase] || DEFAULT_PHASE_COLOR;
  return (
    <div className="download-progress-pill" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 999,
      background: failed ? 'rgba(239,68,68,0.12)' : done ? 'rgba(134,239,172,0.12)' : c.bg,
      border: `1px solid ${failed ? 'rgba(239,68,68,0.3)' : done ? 'rgba(134,239,172,0.3)' : c.border}`,
      fontSize: 11, fontWeight: 600,
      color: failed ? '#fca5a5' : done ? '#86efac' : c.text,
      transition: 'all 0.3s ease',
    }}>
      <span aria-hidden="true">
        {failed ? '✗' : done ? '✓' : <LoadingOutlined style={{ fontSize: 9 }} aria-hidden="true" />}
      </span>
      {phase}
      <span className="sr-only">{failed ? 'ناموفق' : done ? 'دریافت شد' : 'در حال دریافت'}</span>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function ParticipantsTable() {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [participants, setParticipants]     = useState([]);
  const [search, setSearch]                 = useState('');
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [downloadingCSV, setDownloadingCSV] = useState(false);

  // downloadState: { [subject_id]: { status: 'downloading'|'done'|'partial'|'error'|'empty', phases: { [phase_name]: 'pending'|'done'|'error' } } }
  const [downloadState, setDownloadState] = useState({});

  // ── Fetch list ─────────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API_SERVER()}user/participants/`)
      .then(res => {
        if (!Array.isArray(res.data)) {
          throw new Error('The participants API returned an invalid response.');
        }

        setParticipants(res.data);
        setError(null);
      })
      .catch(err => {
        console.error('Failed to load participants', err);
        setError('دریافت فهرست شرکت‌کنندگان انجام نشد. لطفاً دوباره تلاش کنید.');
      })
      .finally(() => setLoading(false));
  }, []);

  const resetDownloadStateLater = (subjectId, expectedStatus, delay = 4000) => {
    setTimeout(() => setDownloadState(prev => {
      if (prev[subjectId]?.status !== expectedStatus) return prev;

      const next = { ...prev };
      delete next[subjectId];
      return next;
    }), delay);
  };

  // ── Single-file download helper ────────────────────────────────────────────
  const downloadFile = async (url, fallbackName) => {
    const res = await axios.get(url, { responseType: 'blob' });
    const cd = res.headers['content-disposition'];
    let filename = fallbackName;
    if (cd) {
      const m = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (m) filename = decodeURIComponent(m[1].replace(/['"]/g, ''));
    }
    const blobUrl = URL.createObjectURL(new Blob([res.data]));
    Object.assign(document.createElement('a'), { href: blobUrl, download: filename }).click();
    URL.revokeObjectURL(blobUrl);
  };

  // ── Download all phases for a participant in parallel ──────────────────────
  const downloadAllPhases = async (subject_id) => {
    // 1. Fetch participant detail JSON
    setDownloadState(prev => ({ ...prev, [subject_id]: { status: 'downloading', phases: {} } }));

    let result_data;
    try {
      const encodedSubjectId = encodeURIComponent(String(subject_id));
      const res = await axios.get(`${API_SERVER()}user/participants/${encodedSubjectId}/`);
      result_data = res.data.result_data;
    } catch (err) {
      console.error(`Failed to fetch data for ${subject_id}`, err);
      setDownloadState(prev => ({ ...prev, [subject_id]: { status: 'error', phases: {} } }));
      messageApi.error(`دریافت اطلاعات شرکت‌کننده با شناسه ${subject_id} انجام نشد.`);
      resetDownloadStateLater(subject_id, 'error');
      return;
    }

    if (!Array.isArray(result_data)) {
      setDownloadState(prev => ({ ...prev, [subject_id]: { status: 'error', phases: {} } }));
      messageApi.error('پاسخ گزارش‌های این شرکت‌کننده معتبر نیست.');
      resetDownloadStateLater(subject_id, 'error');
      return;
    }

    if (result_data.length === 0) {
      setDownloadState(prev => ({ ...prev, [subject_id]: { status: 'empty', phases: {} } }));
      messageApi.info('گزارشی برای این شرکت‌کننده موجود نیست.');
      resetDownloadStateLater(subject_id, 'empty');
      return;
    }

    // Initialise per-phase state as 'pending'
    const initialPhases = Object.fromEntries(result_data.map(p => [p.phase_name, 'pending']));
    setDownloadState(prev => ({ ...prev, [subject_id]: { status: 'downloading', phases: initialPhases } }));

    // 2. Fire all downloads in parallel
    const phaseResults = await Promise.all(
      result_data.map(async ({ phase_name, report_file }) => {
        const fallback = `${subject_id}_${phase_name}.xlsx`;
        try {
          const fullUrl = new URL(report_file, API_SERVER()).href;
          await downloadFile(fullUrl, fallback);
          setDownloadState(prev => ({
            ...prev,
            [subject_id]: {
              ...prev[subject_id],
              phases: { ...prev[subject_id]?.phases, [phase_name]: 'done' },
            },
          }));
          return [phase_name, 'done'];
        } catch {
          setDownloadState(prev => ({
            ...prev,
            [subject_id]: {
              ...prev[subject_id],
              phases: { ...prev[subject_id]?.phases, [phase_name]: 'error' },
            },
          }));
          return [phase_name, 'error'];
        }
      })
    );

    const finalPhases = Object.fromEntries(phaseResults);
    const failedCount = phaseResults.filter(([, status]) => status === 'error').length;
    const finalStatus = failedCount === 0
      ? 'done'
      : failedCount === phaseResults.length
        ? 'error'
        : 'partial';

    setDownloadState(prev => ({
      ...prev,
      [subject_id]: { ...prev[subject_id], status: finalStatus, phases: finalPhases },
    }));

    if (finalStatus === 'error') {
      messageApi.error('دریافت گزارش‌های این شرکت‌کننده ناموفق بود.');
    } else if (finalStatus === 'partial') {
      messageApi.warning('برخی گزارش‌ها دریافت نشدند. می‌توانید دوباره تلاش کنید.');
    }

    resetDownloadStateLater(subject_id, finalStatus);
  };

  // ── Bulk CSV export ────────────────────────────────────────────────────────
  const downloadCSV = () => {
    setDownloadingCSV(true);
    const headers = ['شناسه شرکت‌کننده', 'سن', 'جنسیت', 'گروه'];
    const rows = filtered.map(p => [
      p.subject_id,
      p.age ?? '',
      p.gender === 'MALE' ? 'مرد' : p.gender === 'FEMALE' ? 'زن' : '',
      p.group ?? '',
    ]);
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'شرکت‌کنندگان.csv' }).click();
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloadingCSV(false), 800);
  };

  // ── Filtered data ──────────────────────────────────────────────────────────
  const normalizedSearch = normalizeSearchValue(search);
  const filtered = participants.filter((participant) => {
    const genderLabel = participant.gender === 'MALE'
      ? 'مرد'
      : participant.gender === 'FEMALE'
        ? 'زن'
        : '';

    return normalizeSearchValue(participant.subject_id).includes(normalizedSearch) ||
      normalizeSearchValue(participant.group).includes(normalizedSearch) ||
      normalizeSearchValue(genderLabel).includes(normalizedSearch);
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total   = participants.length;
  const females = participants.filter(p => p.gender === 'FEMALE').length;
  const males   = participants.filter(p => p.gender === 'MALE').length;
  const ages    = participants.filter(p => p.age != null).map(p => Number(p.age)).filter(Number.isFinite);
  const avgAge  = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : '—';
  const compactPagination = !screens.sm;

  // ── Ant Design columns ─────────────────────────────────────────────────────
  const columns = [
    {
      title: 'شناسه شرکت‌کننده',
      dataIndex: 'subject_id',
      key: 'subject_id',
      sorter: (a, b) => String(a.subject_id).localeCompare(String(b.subject_id), 'fa'),
      sortIcon: renderSortIcon,
      render: (id) => (
        <Space size={8}>
          <div aria-hidden="true" style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg,#2dd4bf22,#3b82f622)',
            border: '1px solid rgba(45,212,191,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: '#2dd4bf', fontWeight: 700, flexShrink: 0,
          }}>
            {id === 'admin' ? '★' : String(id).slice(-2)}
          </div>
          <span dir="auto" style={{ color: id === 'admin' ? '#fbbf24' : '#e2e8f0', fontWeight: 600, fontFamily: 'monospace', fontSize: 14, unicodeBidi: 'isolate' }}>
            {id}
          </span>
          {id === 'admin' && (
            <Tag color="gold" style={{ fontSize: 10, padding: '0 6px', borderRadius: 999, lineHeight: '18px' }}>مدیر</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'سن',
      dataIndex: 'age',
      key: 'age',
      sorter: (a, b) => (a.age ?? -1) - (b.age ?? -1),
      sortIcon: renderSortIcon,
      render: (age) => age != null
        ? <Tag style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd', borderRadius: 999, fontWeight: 600, fontSize: 13 }}>{Number(age).toLocaleString('fa-IR')}</Tag>
        : <Text style={{ color: 'rgba(255,255,255,0.2)' }}>—</Text>,
    },
    {
      title: 'جنسیت',
      dataIndex: 'gender',
      key: 'gender',
      filters: [
        { text: 'زن', value: 'FEMALE' },
        { text: 'مرد', value: 'MALE' },
      ],
      filterIcon: filtered => (
        <FilterOutlined
          aria-hidden="true"
          style={{ color: filtered ? '#2dd4bf' : 'rgba(255,255,255,0.35)' }}
        />
      ),
      onFilter: (value, record) => record.gender === value,
      render: (gender) => {
        if (gender === 'FEMALE') return (
          <Space size={6}>
            <WomanOutlined aria-hidden="true" style={{ color: '#f472b6', fontSize: 15 }} />
            <span style={{ color: '#f472b6', fontWeight: 600, fontSize: 13 }}>زن</span>
          </Space>
        );
        if (gender === 'MALE') return (
          <Space size={6}>
            <ManOutlined aria-hidden="true" style={{ color: '#38bdf8', fontSize: 15 }} />
            <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: 13 }}>مرد</span>
          </Space>
        );
        return <Text style={{ color: 'rgba(255,255,255,0.2)' }}>—</Text>;
      },
    },
    {
      title: 'گروه',
      dataIndex: 'group',
      key: 'group',
      sorter: (a, b) => String(a.group ?? '').localeCompare(String(b.group ?? ''), 'fa'),
      sortIcon: renderSortIcon,
      render: (group) => group != null
        ? <Tag style={{ background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.25)', color: '#5eead4', borderRadius: 8, fontWeight: 600, fontSize: 13 }}>
            گروه {Number.isFinite(Number(group)) ? Number(group).toLocaleString('fa-IR') : String(group)}
          </Tag>
        : <Text style={{ color: 'rgba(255,255,255,0.2)' }}>—</Text>,
    },
    {
      title: 'دریافت گزارش‌ها',
      key: 'download',
      width: 260,
      render: (_, record) => {
        const ds = downloadState[record.subject_id];
        const isDownloading = ds?.status === 'downloading';
        const isDone        = ds?.status === 'done';
        const isPartial     = ds?.status === 'partial';
        const isError       = ds?.status === 'error';
        const isEmpty       = ds?.status === 'empty';
        const phases        = ds?.phases ?? {};
        const phaseNames    = Object.keys(phases);
        const buttonState = isDownloading
          ? {
              background: 'rgba(251,191,36,0.1)',
              borderColor: 'rgba(251,191,36,0.35)',
              color: '#fbbf24',
              icon: <LoadingOutlined aria-hidden="true" />,
              label: 'در حال دریافت…',
            }
          : isDone
            ? {
                background: 'rgba(134,239,172,0.12)',
                borderColor: 'rgba(134,239,172,0.35)',
                color: '#86efac',
                icon: <CheckCircleOutlined aria-hidden="true" />,
                label: 'همه گزارش‌ها دریافت شدند',
              }
            : isPartial
              ? {
                  background: 'rgba(251,191,36,0.1)',
                  borderColor: 'rgba(251,191,36,0.35)',
                  color: '#fbbf24',
                  icon: <WarningOutlined aria-hidden="true" />,
                  label: 'دریافت ناقص بود؛ تلاش دوباره',
                }
              : isError
                ? {
                    background: 'rgba(251,113,133,0.1)',
                    borderColor: 'rgba(251,113,133,0.35)',
                    color: '#fda4af',
                    icon: <CloseCircleOutlined aria-hidden="true" />,
                    label: 'دریافت ناموفق بود؛ تلاش دوباره',
                  }
                : isEmpty
                  ? {
                      background: 'rgba(148,163,184,0.1)',
                      borderColor: 'rgba(148,163,184,0.3)',
                      color: '#cbd5e1',
                      icon: <InfoCircleOutlined aria-hidden="true" />,
                      label: 'گزارشی برای دریافت موجود نیست',
                    }
                  : {
                      background: 'rgba(45,212,191,0.1)',
                      borderColor: 'rgba(45,212,191,0.3)',
                      color: '#2dd4bf',
                      icon: <FileExcelOutlined aria-hidden="true" />,
                      label: 'دریافت همه گزارش‌ها (۴ فایل)',
                    };
        const tooltipTitle = isEmpty
          ? 'گزارشی برای این شرکت‌کننده موجود نیست'
          : isPartial || isError
            ? 'برای تلاش دوباره کلیک کنید'
            : 'دریافت هم‌زمان گزارش اکسل هر چهار مرحله';

        return (
          <div
            aria-busy={isDownloading}
            aria-live="polite"
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {/* ── Progress pills shown while / after downloading ── */}
            {phaseNames.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                {phaseNames.map(phase => (
                  <DownloadPill
                    key={phase}
                    phase={phase}
                    done={phases[phase] === 'done'}
                    failed={phases[phase] === 'error'}
                  />
                ))}
              </div>
            )}

            {/* ── Button ── */}
            <Tooltip title={tooltipTitle} placement="left">
              <Button
                size="small"
                icon={buttonState.icon}
                disabled={isDownloading}
                onClick={() => downloadAllPhases(record.subject_id)}
                style={{
                  background: buttonState.background,
                  borderColor: buttonState.borderColor,
                  color: buttonState.color,
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 12,
                  transition: 'all 0.3s ease',
                  width: '100%',
                }}
              >
                {buttonState.label}
              </Button>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ConfigProvider
      direction="rtl"
      locale={faIR}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary:       '#2dd4bf',
          colorBgBase:        '#0f172a',
          colorBgContainer:   'rgba(255,255,255,0.03)',
          colorBgElevated:    '#0f1f2e',
          colorBorder:        'rgba(45,212,191,0.15)',
          colorText:          '#e2e8f0',
          colorTextSecondary: 'rgba(255,255,255,0.45)',
          borderRadius:       12,
          fontFamily:         "'Vazirmatn', sans-serif",
        },
        components: {
          Table: {
            headerBg:         'rgba(45,212,191,0.06)',
            headerColor:      'rgba(255,255,255,0.6)',
            rowHoverBg:       'rgba(45,212,191,0.04)',
            borderColor:      'rgba(255,255,255,0.05)',
            colorBgContainer: 'transparent',
          },
          Input: {
            colorBgContainer:     'rgba(255,255,255,0.05)',
            colorBorder:          'rgba(45,212,191,0.2)',
            colorText:            '#fff',
            colorTextPlaceholder: '#94a3b8',
            hoverBorderColor:     'rgba(45,212,191,0.4)',
            activeBorderColor:    '#2dd4bf',
          },
          Button: {
            colorBgContainer:  'transparent',
            defaultBorderColor:'rgba(45,212,191,0.3)',
            defaultColor:      '#2dd4bf',
          },
          Pagination: {
            colorPrimary:      '#2dd4bf',
            colorBgContainer:  'rgba(255,255,255,0.04)',
          },
        },
      }}
    >
      {messageContextHolder}
      <main className="results-page" style={{
        minHeight: '100dvh', width: '100%',
        background: 'radial-gradient(circle at 10% 20%, #134e4a 0%, #0f172a 60%, #020617 100%)',
        position: 'relative', overflowX: 'hidden',
      }} dir="rtl">
        {/* Dot grid */}
        <div style={{ position: 'fixed', inset: 0, opacity: 0.07, pointerEvents: 'none', backgroundImage: 'radial-gradient(#2dd4bf 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* Glows */}
        <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: '#14b8a6', opacity: 0.08, filter: 'blur(150px)', pointerEvents: 'none' }} />
        <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '40vw', height: '40vw', borderRadius: '50%', background: '#3b82f6', opacity: 0.05, filter: 'blur(120px)', pointerEvents: 'none' }} />

        <div style={{
          position: 'relative', zIndex: 10,
          maxWidth: '1200px', margin: '0 auto',
          padding: '48px 24px',
        }}>

          {/* ── Header ── */}
          <header style={{ marginBottom: 36 }}>
            <Button
              type="text"
              size="large"
              icon={<ArrowRightOutlined aria-hidden="true" />}
              onClick={() => navigate(APP_ROUTE.SIGN_UP)}
              style={{
                minHeight: 44,
                marginBottom: 22,
                paddingInline: 0,
                color: '#99f6e4',
                fontWeight: 700,
              }}
            >
              بازگشت به ثبت‌نام
            </Button>
            <Space align="center" style={{ marginBottom: 8 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(135deg,#2dd4bf33,#3b82f622)',
                border: '1px solid #2dd4bf44',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }} aria-hidden="true"><UserOutlined aria-hidden="true" /></div>
              <Text style={{ color: '#2dd4bf', fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                سامانه آزمون هوشمند
              </Text>
            </Space>
            <Title level={1} style={{ color: '#fff', fontWeight: 900, margin: 0, lineHeight: 1.35, fontSize: 'clamp(28px,5vw,42px)' }}>
              گزارش{' '}
              <span style={{ background: 'linear-gradient(90deg,#2dd4bf,#3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                شرکت‌کنندگان
              </span>
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, display: 'block', marginTop: 8 }}>
              اطلاعات ثبت‌نام و دریافت گزارش مراحل آزمون
            </Text>
          </header>

          {/* ── Error ── */}
          {error && (
            <Alert
              type="error"
              icon={<CloseCircleOutlined aria-hidden="true" />}
              message="بارگذاری فهرست شرکت‌کنندگان انجام نشد"
              description={error}
              showIcon
              style={{ marginBottom: 24, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12 }}
            />
          )}

          {/* ── Stat Cards ── */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
            <StatCard icon={<UserOutlined aria-hidden="true" />}  label="کل شرکت‌کنندگان" value={loading ? '…' : total.toLocaleString('fa-IR')} color="#2dd4bf" />
            <StatCard icon={<WomanOutlined aria-hidden="true" />} label="زنان" value={loading ? '…' : females.toLocaleString('fa-IR')} color="#f472b6" />
            <StatCard icon={<ManOutlined aria-hidden="true" />}   label="مردان" value={loading ? '…' : males.toLocaleString('fa-IR')} color="#38bdf8" />
            <StatCard icon={<TeamOutlined aria-hidden="true" />}  label="میانگین سن" value={loading ? '…' : typeof avgAge === 'number' ? avgAge.toLocaleString('fa-IR') : avgAge} color="#a78bfa" />
          </div>

          {/* ── Toolbar ── */}
          <div
            role="search"
            aria-label="جست‌وجو و دریافت اطلاعات شرکت‌کنندگان"
            style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Input
              className="results-search-input"
              prefix={<SearchOutlined aria-hidden="true" style={{ color: '#5eead4' }} />}
              aria-label="جست‌وجو بر اساس شناسه، جنسیت یا گروه"
              placeholder="جست‌وجو بر اساس شناسه، جنسیت یا گروه…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear={{ clearIcon: <CloseCircleOutlined aria-hidden="true" /> }}
              style={{ width: '100%', maxWidth: 360, borderRadius: 12 }}
            />
            <Button
              className="results-export-button"
              icon={downloadingCSV
                ? <LoadingOutlined aria-hidden="true" />
                : <DownloadOutlined aria-hidden="true" />}
              disabled={downloadingCSV}
              onClick={downloadCSV}
              style={{
                background: 'linear-gradient(135deg,rgba(45,212,191,0.18),rgba(59,130,246,0.18))',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(45,212,191,0.35)',
                color: '#fff', fontWeight: 700, fontSize: 14,
                borderRadius: 12, height: 40, paddingInline: 20,
                boxShadow: '0 4px 20px rgba(45,212,191,0.15)',
              }}
            >
              دریافت فایل سی‌اس‌وی
            </Button>
          </div>

          {/* ── Ant Design Table ── */}
          <div className="mb-2 text-xs text-slate-500 md:hidden">
            برای مشاهده ستون‌های بیشتر، جدول را به طرفین بکشید.
          </div>
          <section aria-label="فهرست شرکت‌کنندگان" style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(30px)',
            border: '1px solid rgba(45,212,191,0.12)',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <Table
              columns={columns}
              dataSource={filtered}
              rowKey="subject_id"
              loading={{
                spinning: loading,
                indicator: <Spin indicator={<LoadingOutlined aria-hidden="true" style={{ fontSize: 32, color: '#2dd4bf' }} spin />} />,
              }}
              pagination={{
                pageSize: 10,
                responsive: true,
                simple: compactPagination,
                itemRender: renderPaginationItem,
                showSizeChanger: !compactPagination,
                showTotal: compactPagination
                  ? undefined
                  : (t) => (
                      <Text style={{ color: '#94a3b8', fontSize: 13 }}>{t.toLocaleString('fa-IR')} شرکت‌کننده</Text>
                    ),
                style: {
                  justifyContent: compactPagination ? 'center' : 'flex-end',
                  padding: compactPagination ? '12px 8px' : '12px 20px',
                  margin: 0,
                },
              }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'شرکت‌کننده‌ای یافت نشد.' }}
              style={{ borderRadius: 0 }}
            />
          </section>

        </div>

        <style>{`
          .ant-table-thead > tr > th {
            font-size: 12px !important;
            font-weight: 700 !important;
          }
          .ant-table-column-sorter-up.active svg,
          .ant-table-column-sorter-down.active svg { color: #2dd4bf !important; }
          .ant-pagination-item-active { border-color: #2dd4bf !important; }
          .ant-pagination-item-active a { color: #2dd4bf !important; }
          .ant-select-selector { background: rgba(255,255,255,0.05) !important; border-color: rgba(45,212,191,0.2) !important; }
          @media (max-width: 640px) {
            .results-search-input,
            .results-export-button { max-width: none !important; width: 100% !important; }
          }
          @media (prefers-reduced-motion: reduce) {
            .results-page *,
            .results-page *::before,
            .results-page *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              scroll-behavior: auto !important;
              transition-duration: 0.01ms !important;
            }
            .ant-message,
            .ant-message-notice,
            .ant-message-notice-content,
            .ant-tooltip {
              animation: none !important;
              transition: none !important;
            }
          }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(45,212,191,0.3); border-radius: 99px; }
        `}</style>
      </main>
    </ConfigProvider>
  );
}
